<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\JobRunner;
use App\Support\PdfRenderer;
use App\Support\Rbac;
use App\Support\Storage;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Stream;
use Throwable;

final class FlipbookController
{
    public function index(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.view');

        // Auto-tick scheduled publications and expirations
        $this->tickScheduledLifecycle();

        $params = $req->getQueryParams();
        $q = trim((string) ($params['q'] ?? ''));
        $workflow = trim((string) ($params['workflow'] ?? ''));
        $categoryId = isset($params['categoryId']) && $params['categoryId'] !== '' ? (int) $params['categoryId'] : null;
        $collectionId = isset($params['collectionId']) && $params['collectionId'] !== '' ? (int) $params['collectionId'] : null;

        $tenantId = TenantContext::id();

        $where = [];
        $binds = [];

        if ($tenantId !== null) {
            $where[] = '(f.tenant_id = ? OR (f.tenant_id IS NULL AND f.user_id = ?))';
            $binds[] = $tenantId;
            $binds[] = $u['id'];
        } else {
            $where[] = 'f.user_id = ?';
            $binds[] = $u['id'];
        }

        if ($q !== '') {
            $where[] = '(f.title LIKE ? OR f.description LIKE ? OR f.slug LIKE ?)';
            $binds[] = '%' . $q . '%';
            $binds[] = '%' . $q . '%';
            $binds[] = '%' . $q . '%';
        }

        if ($workflow !== '' && $workflow !== 'all') {
            $where[] = 'f.workflow_status = ?';
            $binds[] = $workflow;
        }

        if ($categoryId !== null) {
            $where[] = 'f.category_id = ?';
            $binds[] = $categoryId;
        }

        if ($collectionId !== null) {
            $where[] = 'f.collection_id = ?';
            $binds[] = $collectionId;
        }

        $whereSql = implode(' AND ', $where);
        $rows = Db::all(
            "SELECT f.*,
                    (SELECT thumb_path FROM pages p WHERE p.flipbook_id = f.id AND p.page_number = 1) AS cover_rel,
                    c.name AS category_name, c.color AS category_color,
                    col.name AS collection_name
             FROM flipbooks f
             LEFT JOIN categories c ON c.id = f.category_id
             LEFT JOIN collections col ON col.id = f.collection_id
             WHERE {$whereSql}
             ORDER BY f.created_at DESC",
            $binds
        );

        return Http::json($res, array_map([$this, 'present'], $rows));
    }

    public function create(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.create');

        $tenantId = TenantContext::id();
        $tenant = TenantContext::tenant();
        $plan = Db::one('SELECT * FROM plans WHERE id = ?', [$tenant['plan_id'] ?? $u['plan_id']]);

        $maxAllowed = $tenant ? (int) $tenant['max_flipbooks'] : (int) $plan['max_flipbooks'];
        $countSql = $tenantId !== null ? 'SELECT COUNT(*) c FROM flipbooks WHERE tenant_id = ?' : 'SELECT COUNT(*) c FROM flipbooks WHERE user_id = ?';
        $count = (int) Db::one($countSql, [$tenantId ?? $u['id']])['c'];

        if ($count >= $maxAllowed) {
            return Http::error($res, "Your workspace plan allows a maximum of {$maxAllowed} publications.", 403);
        }

        $file = $req->getUploadedFiles()['file'] ?? null;
        if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
            return Http::error($res, 'Upload failed', 422, ['file' => 'Please choose a PDF']);
        }

        $maxUploadBytes = ((int) $plan['max_upload_mb']) * 1048576;
        $maxPages = (int) $plan['max_pages'];

        if ($file->getSize() > $maxUploadBytes) {
            return Http::error($res, 'Validation failed', 422, ['file' => "Max file size is {$plan['max_upload_mb']} MB"]);
        }

        $tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . bin2hex(random_bytes(8)) . '.pdf';
        $file->moveTo($tmp);

        // Strict PDF validation & metadata extraction before queuing
        try {
            $pdfMeta = PdfRenderer::validatePdf($tmp, $maxUploadBytes, $maxPages);
        } catch (Throwable $e) {
            @unlink($tmp);
            return Http::error($res, $e->getMessage(), 422, ['file' => $e->getMessage()]);
        }

        $body = (array) $req->getParsedBody();
        $rawTitle = trim((string) ($body['title'] ?? ''));
        if ($rawTitle === '' && !empty($pdfMeta['title'])) {
            $rawTitle = (string) $pdfMeta['title'];
        }
        $title = $rawTitle ?: pathinfo($file->getClientFilename() ?? 'Untitled', PATHINFO_FILENAME);
        $description = trim((string) ($body['description'] ?? ($pdfMeta['subject'] ?? ''))) ?: null;
        $categoryId = !empty($body['categoryId']) ? (int) $body['categoryId'] : null;
        $collectionId = !empty($body['collectionId']) ? (int) $body['collectionId'] : null;
        $slug = $this->uniqueSlug(!empty($body['slug']) ? (string) $body['slug'] : $title);

        Db::run(
            "INSERT INTO flipbooks
             (user_id, tenant_id, category_id, collection_id, title, description, slug, status, workflow_status, version, pdf_metadata, conversion_progress, conversion_step)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'uploading', 'processing', 1, ?, 2, 'Queued for conversion')",
            [
                $u['id'],
                $tenantId,
                $categoryId,
                $collectionId,
                mb_substr($title, 0, 200),
                $description,
                $slug,
                json_encode($pdfMeta),
            ]
        );
        $id = (int) Db::pdo()->lastInsertId();

        // Save into tenant-isolated storage path
        $effectiveTenantId = $tenantId ?? 1;
        $rel = Storage::sourcePdfRel($effectiveTenantId, $id);
        $dest = Storage::root() . '/' . $rel;
        Storage::ensureDir(dirname($dest));
        rename($tmp, $dest);

        Db::run("UPDATE flipbooks SET source_pdf_path = ?, status = 'processing' WHERE id = ?", [$rel, $id]);

        // Record Version 1 in flipbook_versions
        Db::run(
            'INSERT INTO flipbook_versions (tenant_id, flipbook_id, version_number, source_pdf_path, page_count, file_size_bytes, pdf_metadata, notes, created_by)
             VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)',
            [
                $tenantId,
                $id,
                $rel,
                (int) ($pdfMeta['page_count'] ?? 0),
                (int) ($pdfMeta['file_size_bytes'] ?? filesize($dest)),
                json_encode($pdfMeta),
                'Initial PDF upload (v1)',
                $u['id'],
            ]
        );

        // Enqueue conversion job with tenant & flipbook tracking
        Db::run(
            "INSERT INTO jobs (tenant_id, flipbook_id, type, payload, status, progress, current_step)
             VALUES (?, ?, 'convert_pdf', ?, 'queued', 2, 'Queued for conversion')",
            [$tenantId, $id, json_encode(['flipbook_id' => $id])]
        );

        JobRunner::triggerAsyncCliWorker();

        Audit::log('flipbook.create', 'flipbook', $id, [
            'title' => $title,
            'slug' => $slug,
            'version' => 1,
            'pdf_pages' => $pdfMeta['page_count'] ?? 0,
        ]);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$id])), 201);
    }

    public function show(Request $req, Response $res, array $args): Response
    {
        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        $out = $this->present($f);
        $pages = Db::all('SELECT * FROM pages WHERE flipbook_id = ? ORDER BY page_number', [$f['id']]);

        $out['pages'] = array_map(function (array $p) use ($f): array {
            $stdRel = $this->resolveExistingRelPath($f, (string) $p['image_path'], false);
            $highRel = !empty($p['high_res_path'])
                ? $this->resolveExistingRelPath($f, (string) $p['high_res_path'], false)
                : $stdRel;
            $highWebpRel = preg_replace('/\.jpe?g$/i', '.webp', $highRel);
            if (file_exists(Storage::root() . '/' . $highWebpRel)) {
                $highRel = $highWebpRel;
            }

            $webpRel = !empty($p['webp_path'])
                ? $this->resolveExistingRelPath($f, (string) $p['webp_path'], false)
                : null;
            $avifRel = !empty($p['avif_path'])
                ? $this->resolveExistingRelPath($f, (string) $p['avif_path'], false)
                : null;

            $thumbRel = $this->resolveExistingRelPath($f, (string) $p['thumb_path'], true);
            $thumbWebpRel = preg_replace('/\.jpe?g$/i', '.webp', $thumbRel);
            if (file_exists(Storage::root() . '/' . $thumbWebpRel)) {
                $thumbRel = $thumbWebpRel;
            }

            return [
                'n' => (int) $p['page_number'],
                'image' => Storage::temporarySignedUrl($webpRel ?: $stdRel, 14400),
                'imageJpg' => Storage::temporarySignedUrl($stdRel, 14400),
                'imageHigh' => Storage::temporarySignedUrl($highRel, 14400),
                'webp' => $webpRel ? Storage::temporarySignedUrl($webpRel, 14400) : null,
                'avif' => $avifRel ? Storage::temporarySignedUrl($avifRel, 14400) : null,
                'thumb' => Storage::temporarySignedUrl($thumbRel, 14400),
                'w' => (int) $p['width'],
                'h' => (int) $p['height'],
                'text' => $p['text_content'] ?? '',
            ];
        }, $pages);

        $out['versions'] = $this->getVersionsList((int) $f['id']);

        return Http::json($res, $out);
    }

    public function update(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);
        $b = (array) $req->getParsedBody();

        $title = array_key_exists('title', $b) ? trim((string) $b['title']) : $f['title'];
        if ($title === '' || mb_strlen($title) > 200) {
            return Http::error($res, 'Validation failed', 422, ['title' => 'Title is required']);
        }

        // Custom publication URL (slug) validation
        $slug = $f['slug'];
        if (array_key_exists('slug', $b) && trim((string) $b['slug']) !== '' && trim((string) $b['slug']) !== $f['slug']) {
            $cleanSlug = trim(preg_replace('/[^a-z0-9-]+/', '-', strtolower(trim((string) $b['slug']))) ?? '', '-');
            if (strlen($cleanSlug) < 3 || strlen($cleanSlug) > 80) {
                return Http::error($res, 'Custom URL slug must be between 3 and 80 characters', 422, ['slug' => 'Invalid slug length']);
            }
            $existing = Db::one('SELECT id FROM flipbooks WHERE slug = ? AND id != ?', [$cleanSlug, $f['id']]);
            if ($existing) {
                return Http::error($res, 'This custom URL slug is already in use by another publication', 422, ['slug' => 'Slug already taken']);
            }
            $slug = $cleanSlug;
        }

        $vis = $b['visibility'] ?? $f['visibility'];
        if (!in_array($vis, ['public', 'unlisted', 'password'], true)) {
            return Http::error($res, 'Validation failed', 422, ['visibility' => 'Invalid visibility']);
        }
        $hash = $f['password_hash'];
        if ($vis === 'password') {
            if (!empty($b['password'])) $hash = password_hash((string) $b['password'], PASSWORD_ARGON2ID);
            elseif (!$hash) return Http::error($res, 'Validation failed', 422, ['password' => 'Password required']);
        } else {
            $hash = null;
        }

        $desc = array_key_exists('description', $b) ? (string) $b['description'] : $f['description'];
        $categoryId = array_key_exists('categoryId', $b) ? ($b['categoryId'] ? (int) $b['categoryId'] : null) : $f['category_id'];
        $collectionId = array_key_exists('collectionId', $b) ? ($b['collectionId'] ? (int) $b['collectionId'] : null) : $f['collection_id'];
        $folderId = array_key_exists('folderId', $b) ? ($b['folderId'] ? (int) $b['folderId'] : null) : $f['folder_id'];

        $scheduledAt = array_key_exists('scheduledAt', $b)
            ? (!empty($b['scheduledAt']) ? date('Y-m-d H:i:s', strtotime((string) $b['scheduledAt'])) : null)
            : $f['scheduled_at'];
        $expiresAt = array_key_exists('expiresAt', $b)
            ? (!empty($b['expiresAt']) ? date('Y-m-d H:i:s', strtotime((string) $b['expiresAt'])) : null)
            : $f['expires_at'];

        $workflowStatus = $f['workflow_status'] ?? 'editing';
        $publishedAt = $f['published_at'];

        if (array_key_exists('workflowStatus', $b)) {
            $requestedWf = (string) $b['workflowStatus'];
            $validWf = ['draft', 'processing', 'editing', 'in_review', 'scheduled', 'published', 'archived'];
            if (in_array($requestedWf, $validWf, true)) {
                if ($requestedWf === 'published') {
                    Rbac::authorize($u, 'flipbook.publish');
                    if ($f['status'] !== 'ready') {
                        return Http::error($res, 'Flipbook is not ready to publish yet', 409);
                    }
                    $publishedAt = $publishedAt ?: date('Y-m-d H:i:s');
                } elseif ($requestedWf === 'scheduled') {
                    Rbac::authorize($u, 'flipbook.publish');
                    if (!$scheduledAt) {
                        return Http::error($res, 'Scheduled date/time is required for scheduled publishing', 422);
                    }
                } elseif (in_array($requestedWf, ['draft', 'editing', 'in_review', 'archived'], true)) {
                    if ($requestedWf !== 'published') {
                        $publishedAt = null;
                    }
                }
                $workflowStatus = $requestedWf;
            }
        } elseif (array_key_exists('published', $b)) {
            if ($b['published']) {
                Rbac::authorize($u, 'flipbook.publish');
                if ($f['status'] !== 'ready') {
                    return Http::error($res, 'Flipbook is not ready to publish yet', 409);
                }
                $publishedAt = $publishedAt ?: date('Y-m-d H:i:s');
                $workflowStatus = 'published';
            } else {
                $publishedAt = null;
                if ($workflowStatus === 'published') {
                    $workflowStatus = 'editing';
                }
            }
        }

        $settings = array_key_exists('settings', $b) ? json_encode($b['settings']) : $f['settings'];
        $seoMeta = array_key_exists('seoMeta', $b) ? json_encode($b['seoMeta']) : $f['seo_meta'];
        $toc = array_key_exists('toc', $b) ? json_encode($b['toc']) : ($f['toc'] ?? null);

        Db::run(
            'UPDATE flipbooks
             SET title = ?, description = ?, slug = ?, category_id = ?, collection_id = ?, folder_id = ?,
                 visibility = ?, password_hash = ?, workflow_status = ?, published_at = ?,
                 scheduled_at = ?, expires_at = ?, settings = ?, seo_meta = ?, toc = ?
             WHERE id = ?',
            [
                $title,
                $desc,
                $slug,
                $categoryId,
                $collectionId,
                $folderId,
                $vis,
                $hash,
                $workflowStatus,
                $publishedAt,
                $scheduledAt,
                $expiresAt,
                $settings,
                $seoMeta,
                $toc,
                $f['id'],
            ]
        );

        Audit::log('flipbook.update', 'flipbook', (int) $f['id'], [
            'title' => $title,
            'slug' => $slug,
            'visibility' => $vis,
            'workflow_status' => $workflowStatus,
            'published' => $publishedAt !== null,
        ]);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$f['id']])));
    }

    /**
     * Dedicated 7-Stage Publishing Workflow Transition & Approval Endpoint.
     * Stages: draft -> processing -> editing -> in_review -> scheduled -> published -> archived
     */
    public function transitionWorkflow(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        $b = (array) $req->getParsedBody();
        $targetStage = trim((string) ($b['stage'] ?? $b['workflowStatus'] ?? ''));
        $notes = isset($b['notes']) ? trim((string) $b['notes']) : null;
        $scheduledAt = !empty($b['scheduledAt']) ? date('Y-m-d H:i:s', strtotime((string) $b['scheduledAt'])) : $f['scheduled_at'];
        $expiresAt = array_key_exists('expiresAt', $b)
            ? (!empty($b['expiresAt']) ? date('Y-m-d H:i:s', strtotime((string) $b['expiresAt'])) : null)
            : $f['expires_at'];

        $allowedStages = ['draft', 'processing', 'editing', 'in_review', 'scheduled', 'published', 'archived'];
        if (!in_array($targetStage, $allowedStages, true)) {
            return Http::error($res, 'Invalid workflow stage', 422);
        }

        if (in_array($targetStage, ['published', 'scheduled'], true)) {
            Rbac::authorize($u, 'flipbook.publish');
            if ($f['status'] !== 'ready') {
                return Http::error($res, 'Publication must finish processing before it can be scheduled or published', 409);
            }
        }

        if ($targetStage === 'scheduled' && !$scheduledAt) {
            return Http::error($res, 'Please provide a scheduled publication date and time', 422);
        }

        $publishedAt = $f['published_at'];
        if ($targetStage === 'published') {
            $publishedAt = $publishedAt ?: date('Y-m-d H:i:s');
        } elseif (in_array($targetStage, ['draft', 'editing', 'in_review', 'archived'], true)) {
            $publishedAt = null;
        }

        $reviewedBy = $f['reviewed_by'];
        $reviewedAt = $f['reviewed_at'];
        $reviewNotes = $notes ?? $f['review_notes'];

        if (in_array($targetStage, ['published', 'editing', 'scheduled'], true) && ($f['workflow_status'] === 'in_review' || $notes !== null)) {
            $reviewedBy = (int) $u['id'];
            $reviewedAt = date('Y-m-d H:i:s');
        }

        Db::run(
            'UPDATE flipbooks
             SET workflow_status = ?, published_at = ?, scheduled_at = ?, expires_at = ?,
                 review_notes = ?, reviewed_by = ?, reviewed_at = ?
             WHERE id = ?',
            [
                $targetStage,
                $publishedAt,
                $scheduledAt,
                $expiresAt,
                $reviewNotes,
                $reviewedBy,
                $reviewedAt,
                $f['id'],
            ]
        );

        Audit::log('flipbook.workflow_transition', 'flipbook', (int) $f['id'], [
            'from' => $f['workflow_status'],
            'to' => $targetStage,
            'notes' => $reviewNotes,
            'scheduled_at' => $scheduledAt,
            'expires_at' => $expiresAt,
        ]);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$f['id']])));
    }

    /**
     * Duplicate an existing publication (clones metadata, settings, pages, files, and hotspots).
     */
    public function duplicate(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.create');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        $tenantId = TenantContext::id() ?? ($f['tenant_id'] ? (int) $f['tenant_id'] : null);
        $b = (array) $req->getParsedBody();
        $newTitle = trim((string) ($b['title'] ?? ($f['title'] . ' (Copy)')));
        $newSlug = $this->uniqueSlug($newTitle);

        Db::run(
            "INSERT INTO flipbooks
             (tenant_id, user_id, folder_id, category_id, collection_id, title, description, slug,
              page_count, status, workflow_status, version, visibility, settings, pdf_metadata, seo_meta,
              conversion_progress, conversion_step)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'editing', 1, ?, ?, ?, ?, 100, 'Completed')",
            [
                $tenantId,
                $u['id'],
                $f['folder_id'],
                $f['category_id'],
                $f['collection_id'],
                mb_substr($newTitle, 0, 200),
                $f['description'],
                $newSlug,
                (int) $f['page_count'],
                $f['status'],
                $f['visibility'] === 'password' ? 'unlisted' : $f['visibility'],
                $f['settings'],
                $f['pdf_metadata'],
                $f['seo_meta'],
            ]
        );
        $newId = (int) Db::pdo()->lastInsertId();
        $effTenant = $tenantId ?? 1;

        // Copy storage directory files
        $srcDir = Storage::publicationDir($effTenant, (int) $f['id']);
        $dstDir = Storage::publicationDir($effTenant, $newId);
        if (is_dir($srcDir)) {
            $this->copyDirectory($srcDir, $dstDir);
        }

        $newSourcePdfRel = null;
        if (!empty($f['source_pdf_path'])) {
            $oldPdfFull = Storage::root() . '/' . $f['source_pdf_path'];
            $newSourcePdfRel = Storage::sourcePdfRel($effTenant, $newId);
            $newPdfFull = Storage::root() . '/' . $newSourcePdfRel;
            Storage::ensureDir(dirname($newPdfFull));
            if (file_exists($oldPdfFull) && !file_exists($newPdfFull)) {
                @copy($oldPdfFull, $newPdfFull);
            }
            Db::run('UPDATE flipbooks SET source_pdf_path = ? WHERE id = ?', [$newSourcePdfRel, $newId]);
        }

        // Clone pages
        $oldPubPrefix = "tenants/{$effTenant}/publications/{$f['id']}/";
        $newPubPrefix = "tenants/{$effTenant}/publications/{$newId}/";
        $pages = Db::all('SELECT * FROM pages WHERE flipbook_id = ? ORDER BY page_number', [$f['id']]);
        foreach ($pages as $p) {
            $imgPath = str_replace($oldPubPrefix, $newPubPrefix, (string) $p['image_path']);
            $highPath = $p['high_res_path'] ? str_replace($oldPubPrefix, $newPubPrefix, (string) $p['high_res_path']) : null;
            $webpPath = $p['webp_path'] ? str_replace($oldPubPrefix, $newPubPrefix, (string) $p['webp_path']) : null;
            $avifPath = $p['avif_path'] ? str_replace($oldPubPrefix, $newPubPrefix, (string) $p['avif_path']) : null;
            $thumbPath = str_replace($oldPubPrefix, $newPubPrefix, (string) $p['thumb_path']);

            Db::run(
                'INSERT INTO pages (flipbook_id, page_number, image_path, high_res_path, webp_path, avif_path, thumb_path, width, height, text_content)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$newId, $p['page_number'], $imgPath, $highPath, $webpPath, $avifPath, $thumbPath, $p['width'], $p['height'], $p['text_content']]
            );
        }

        // Clone hotspots
        $hotspots = Db::all('SELECT * FROM hotspots WHERE flipbook_id = ?', [$f['id']]);
        foreach ($hotspots as $h) {
            Db::run(
                'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$newId, $h['page_number'], $h['type'], $h['x'], $h['y'], $h['w'], $h['h'], $h['payload']]
            );
        }

        // Record v1 in flipbook_versions
        if ($newSourcePdfRel) {
            Db::run(
                'INSERT INTO flipbook_versions (tenant_id, flipbook_id, version_number, source_pdf_path, page_count, file_size_bytes, pdf_metadata, notes, created_by)
                 VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)',
                [
                    $tenantId,
                    $newId,
                    $newSourcePdfRel,
                    (int) $f['page_count'],
                    0,
                    $f['pdf_metadata'],
                    "Duplicated from publication #{$f['id']} ({$f['title']})",
                    $u['id'],
                ]
            );
        }

        Audit::log('flipbook.duplicate', 'flipbook', $newId, ['source_flipbook_id' => $f['id'], 'title' => $newTitle]);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$newId])), 201);
    }

    /**
     * Replace PDF while retaining previous versions, slug, analytics, and hotspots.
     */
    public function replacePdf(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        $file = $req->getUploadedFiles()['file'] ?? null;
        if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
            return Http::error($res, 'Upload failed', 422, ['file' => 'Please choose a replacement PDF']);
        }

        $tenant = TenantContext::tenant();
        $plan = Db::one('SELECT * FROM plans WHERE id = ?', [$tenant['plan_id'] ?? $u['plan_id']]);
        $maxUploadBytes = ((int) $plan['max_upload_mb']) * 1048576;
        $maxPages = (int) $plan['max_pages'];

        $tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . bin2hex(random_bytes(8)) . '.pdf';
        $file->moveTo($tmp);

        try {
            $pdfMeta = PdfRenderer::validatePdf($tmp, $maxUploadBytes, $maxPages);
        } catch (Throwable $e) {
            @unlink($tmp);
            return Http::error($res, $e->getMessage(), 422, ['file' => $e->getMessage()]);
        }

        $tenantId = !empty($f['tenant_id']) ? (int) $f['tenant_id'] : 1;
        $currentVersion = max(1, (int) ($f['version'] ?? 1));

        // Ensure current version is archived in flipbook_versions before incrementing
        $hasCurrentVer = Db::one(
            'SELECT id FROM flipbook_versions WHERE flipbook_id = ? AND version_number = ?',
            [$f['id'], $currentVersion]
        );
        if (!$hasCurrentVer && !empty($f['source_pdf_path'])) {
            $existingPages = Db::all('SELECT * FROM pages WHERE flipbook_id = ? ORDER BY page_number', [$f['id']]);
            $oldFull = Storage::root() . '/' . $f['source_pdf_path'];
            Db::run(
                'INSERT INTO flipbook_versions (tenant_id, flipbook_id, version_number, source_pdf_path, page_count, file_size_bytes, pdf_metadata, pages_snapshot, notes, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $f['tenant_id'],
                    $f['id'],
                    $currentVersion,
                    $f['source_pdf_path'],
                    (int) $f['page_count'],
                    file_exists($oldFull) ? (int) filesize($oldFull) : 0,
                    $f['pdf_metadata'],
                    json_encode($existingPages),
                    "Archived v{$currentVersion} before PDF replacement",
                    $u['id'],
                ]
            );
        }

        $newVersion = $currentVersion + 1;
        $body = (array) $req->getParsedBody();
        $notes = trim((string) ($body['notes'] ?? "Uploaded version {$newVersion}")) ?: "Uploaded version {$newVersion}";

        // Store versioned source PDF so previous versions remain intact on disk
        $verRel = "tenants/{$tenantId}/publications/{$f['id']}/versions/source-v{$newVersion}.pdf";
        $verDest = Storage::root() . '/' . $verRel;
        Storage::ensureDir(dirname($verDest));
        rename($tmp, $verDest);

        // Record new version in flipbook_versions
        Db::run(
            'INSERT INTO flipbook_versions (tenant_id, flipbook_id, version_number, source_pdf_path, page_count, file_size_bytes, pdf_metadata, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $f['tenant_id'],
                $f['id'],
                $newVersion,
                $verRel,
                (int) ($pdfMeta['page_count'] ?? 0),
                (int) ($pdfMeta['file_size_bytes'] ?? filesize($verDest)),
                json_encode($pdfMeta),
                $notes,
                $u['id'],
            ]
        );

        Db::run(
            "UPDATE flipbooks
             SET source_pdf_path = ?, version = ?, status = 'processing',
                 pdf_metadata = ?, conversion_progress = 2, conversion_step = 'Queued for v{$newVersion} conversion', conversion_error = NULL
             WHERE id = ?",
            [$verRel, $newVersion, json_encode($pdfMeta), $f['id']]
        );

        Db::run(
            "INSERT INTO jobs (tenant_id, flipbook_id, type, payload, status, progress, current_step)
             VALUES (?, ?, 'convert_pdf', ?, 'queued', 2, 'Queued for v{$newVersion} conversion')",
            [$f['tenant_id'], $f['id'], json_encode(['flipbook_id' => (int) $f['id'], 'version' => $newVersion])]
        );

        Audit::log('flipbook.replace_pdf', 'flipbook', (int) $f['id'], [
            'previous_version' => $currentVersion,
            'new_version' => $newVersion,
            'notes' => $notes,
        ]);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$f['id']])));
    }

    /**
     * List version history for a publication.
     */
    public function versions(Request $req, Response $res, array $args): Response
    {
        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        return Http::json($res, $this->getVersionsList((int) $f['id']));
    }

    /**
     * Restore a previous PDF version.
     */
    public function restoreVersion(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        $verId = (int) $args['versionId'];
        $ver = Db::one('SELECT * FROM flipbook_versions WHERE id = ? AND flipbook_id = ?', [$verId, $f['id']]);
        if (!$ver) return Http::error($res, 'Version not found', 404);

        $pdfFull = Storage::root() . '/' . $ver['source_pdf_path'];
        if (!file_exists($pdfFull)) {
            return Http::error($res, 'Source PDF for this historical version is no longer on disk', 404);
        }

        $targetVerNum = (int) $ver['version_number'];
        Db::run(
            "UPDATE flipbooks
             SET source_pdf_path = ?, version = ?, status = 'processing',
                 pdf_metadata = ?, conversion_progress = 5, conversion_step = 'Restoring version v{$targetVerNum}', conversion_error = NULL
             WHERE id = ?",
            [$ver['source_pdf_path'], $targetVerNum, $ver['pdf_metadata'], $f['id']]
        );

        Db::run(
            "INSERT INTO jobs (tenant_id, flipbook_id, type, payload, status, progress, current_step)
             VALUES (?, ?, 'convert_pdf', ?, 'queued', 5, 'Restoring version v{$targetVerNum}')",
            [$f['tenant_id'], $f['id'], json_encode(['flipbook_id' => (int) $f['id'], 'version' => $targetVerNum])]
        );

        Audit::log('flipbook.restore_version', 'flipbook', (int) $f['id'], ['restored_version' => $targetVerNum]);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$f['id']])));
    }

    /**
     * Retry a failed or stuck flipbook conversion.
     */
    public function retryConversion(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        Db::run(
            "UPDATE flipbooks SET status = 'processing', conversion_progress = 2, conversion_step = 'Re-queued for conversion', conversion_error = NULL WHERE id = ?",
            [$f['id']]
        );

        Db::run(
            "INSERT INTO jobs (tenant_id, flipbook_id, type, payload, status, progress, current_step)
             VALUES (?, ?, 'convert_pdf', ?, 'queued', 2, 'Re-queued for conversion')",
            [$f['tenant_id'], $f['id'], json_encode(['flipbook_id' => (int) $f['id']])]
        );

        JobRunner::triggerAsyncCliWorker();

        Audit::log('flipbook.retry_conversion', 'flipbook', (int) $f['id']);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$f['id']])));
    }

    /**
     * List background conversion jobs for the tenant (Failed-Job & Queue Management).
     */
    public function listJobs(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.view');

        $tenantId = TenantContext::id();
        $jobs = Db::all(
            'SELECT j.*, f.title AS flipbook_title, f.slug AS flipbook_slug
             FROM jobs j
             LEFT JOIN flipbooks f ON f.id = j.flipbook_id
             WHERE j.tenant_id = ? OR f.tenant_id = ?
             ORDER BY j.id DESC LIMIT 50',
            [$tenantId, $tenantId]
        );

        return Http::json($res, array_map(static fn(array $j) => [
            'id' => (int) $j['id'],
            'flipbookId' => $j['flipbook_id'] ? (int) $j['flipbook_id'] : null,
            'flipbookTitle' => $j['flipbook_title'] ?? 'Publication #' . ($j['flipbook_id'] ?? '?'),
            'type' => $j['type'],
            'status' => $j['status'],
            'progress' => (int) ($j['progress'] ?? 0),
            'currentStep' => $j['current_step'] ?? '',
            'attempts' => (int) $j['attempts'],
            'maxAttempts' => (int) ($j['max_attempts'] ?? 3),
            'error' => $j['error'],
            'createdAt' => $j['created_at'],
            'startedAt' => $j['started_at'],
            'doneAt' => $j['done_at'],
        ], $jobs));
    }

    public function retryJob(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $jobId = (int) $args['id'];
        $tenantId = TenantContext::id();
        $job = Db::one('SELECT * FROM jobs WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)', [$jobId, $tenantId]);
        if (!$job) return Http::error($res, 'Job not found', 404);

        Db::run(
            "UPDATE jobs SET status = 'queued', attempts = 0, progress = 2, current_step = 'Manual retry queued', error = NULL, locked_at = NULL, done_at = NULL, run_at = NOW() WHERE id = ?",
            [$jobId]
        );

        if (!empty($job['flipbook_id'])) {
            Db::run(
                "UPDATE flipbooks SET status = 'processing', conversion_progress = 2, conversion_step = 'Manual retry queued', conversion_error = NULL WHERE id = ?",
                [$job['flipbook_id']]
            );
        }

        JobRunner::triggerAsyncCliWorker();

        return Http::json($res, ['ok' => true]);
    }

    /**
     * Web-triggered queue worker endpoint (`/api/v1/jobs/process-next`).
     * Automatically drains queued PDF conversions on shared/cPanel hosting (like A2 Hosting)
     * without requiring a persistent CLI daemon or SSH cron setup.
     */
    public function processNextJob(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.view');

        $result = JobRunner::processNextJob();
        return Http::json($res, $result);
    }

    public function cancelJob(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $jobId = (int) $args['id'];
        $tenantId = TenantContext::id();
        $job = Db::one('SELECT * FROM jobs WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)', [$jobId, $tenantId]);
        if (!$job) return Http::error($res, 'Job not found', 404);

        Db::run(
            "UPDATE jobs SET status = 'cancelled', current_step = 'Cancelled by user', done_at = NOW() WHERE id = ?",
            [$jobId]
        );

        return Http::json($res, ['ok' => true]);
    }

    /**
     * Categories & Collections Management (Tenant-Scoped).
     */
    public function listCategories(Request $req, Response $res): Response
    {
        $tenantId = TenantContext::id() ?? 1;
        $rows = Db::all(
            'SELECT c.*, (SELECT COUNT(*) FROM flipbooks f WHERE f.category_id = c.id) AS count
             FROM categories c WHERE c.tenant_id = ? ORDER BY c.name ASC',
            [$tenantId]
        );
        return Http::json($res, $rows);
    }

    public function createCategory(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');
        $tenantId = TenantContext::id() ?? 1;
        $b = (array) $req->getParsedBody();
        $name = trim((string) ($b['name'] ?? ''));
        if ($name === '') return Http::error($res, 'Category name is required', 422);
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)) ?? '', '-') ?: 'category';
        $color = trim((string) ($b['color'] ?? '#F5C542'));
        $desc = trim((string) ($b['description'] ?? '')) ?: null;

        Db::run(
            'INSERT INTO categories (tenant_id, name, slug, description, color) VALUES (?, ?, ?, ?, ?)',
            [$tenantId, $name, $slug, $desc, $color]
        );
        $id = (int) Db::pdo()->lastInsertId();
        return Http::json($res, Db::one('SELECT * FROM categories WHERE id = ?', [$id]), 201);
    }

    public function deleteCategory(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');
        $tenantId = TenantContext::id() ?? 1;
        $id = (int) $args['id'];
        Db::run('UPDATE flipbooks SET category_id = NULL WHERE category_id = ? AND tenant_id = ?', [$id, $tenantId]);
        Db::run('DELETE FROM categories WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        return Http::json($res, ['ok' => true]);
    }

    public function listCollections(Request $req, Response $res): Response
    {
        $tenantId = TenantContext::id() ?? 1;
        $rows = Db::all(
            'SELECT c.*, (SELECT COUNT(*) FROM flipbooks f WHERE f.collection_id = c.id) AS count
             FROM collections c WHERE c.tenant_id = ? ORDER BY c.name ASC',
            [$tenantId]
        );
        return Http::json($res, $rows);
    }

    public function createCollection(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');
        $tenantId = TenantContext::id() ?? 1;
        $b = (array) $req->getParsedBody();
        $name = trim((string) ($b['name'] ?? ''));
        if ($name === '') return Http::error($res, 'Collection name is required', 422);
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower($name)) ?? '', '-') ?: 'collection';
        $desc = trim((string) ($b['description'] ?? '')) ?: null;

        Db::run(
            'INSERT INTO collections (tenant_id, name, slug, description) VALUES (?, ?, ?, ?)',
            [$tenantId, $name, $slug, $desc]
        );
        $id = (int) Db::pdo()->lastInsertId();
        return Http::json($res, Db::one('SELECT * FROM collections WHERE id = ?', [$id]), 201);
    }

    public function deleteCollection(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');
        $tenantId = TenantContext::id() ?? 1;
        $id = (int) $args['id'];
        Db::run('UPDATE flipbooks SET collection_id = NULL WHERE collection_id = ? AND tenant_id = ?', [$id, $tenantId]);
        Db::run('DELETE FROM collections WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        return Http::json($res, ['ok' => true]);
    }

    public function delete(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.delete');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        Db::run('DELETE FROM flipbooks WHERE id = ?', [$f['id']]);

        $tenantId = !empty($f['tenant_id']) ? (int) $f['tenant_id'] : 1;
        Storage::rrmdir(Storage::publicationDir($tenantId, (int) $f['id']));
        Storage::rrmdir(Storage::root() . '/public/flipbooks/' . $f['id']);
        if ($f['source_pdf_path']) {
            @unlink(Storage::root() . '/' . $f['source_pdf_path']);
        }

        Audit::log('flipbook.delete', 'flipbook', (int) $f['id'], ['title' => $f['title']]);

        return Http::json($res, ['ok' => true]);
    }

    public function status(Request $req, Response $res, array $args): Response
    {
        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);
        return Http::json($res, [
            'status' => $f['status'],
            'workflowStatus' => $f['workflow_status'] ?? 'draft',
            'pageCount' => (int) $f['page_count'],
            'conversionProgress' => (int) ($f['conversion_progress'] ?? 0),
            'conversionStep' => $f['conversion_step'] ?? '',
            'conversionError' => $f['conversion_error'] ?? null,
        ]);
    }

    /** Authorized page stream for authenticated dashboard editor */
    public function servePage(Request $req, Response $res, array $args): Response
    {
        return $this->streamPageAsset($req, $res, (int) $args['id'], (int) $args['page'], false);
    }

    /** Authorized thumbnail stream for authenticated dashboard editor */
    public function serveThumb(Request $req, Response $res, array $args): Response
    {
        return $this->streamPageAsset($req, $res, (int) $args['id'], (int) $args['page'], true);
    }

    /** Secure serving of temporary signed URLs (supports JPEG, WebP, AVIF, PNG, PDF) */
    public function serveSigned(Request $req, Response $res): Response
    {
        $params = $req->getQueryParams();
        $path = (string) ($params['path'] ?? '');
        $expires = (int) ($params['expires'] ?? 0);
        $sig = (string) ($params['sig'] ?? '');

        if ($path === '' || str_contains($path, '..') || !Storage::verifySignature($path, $expires, $sig)) {
            return Http::error($res, 'Forbidden: Invalid or expired signature', 403);
        }

        $fullPath = Storage::root() . '/' . ltrim($path, '/\\');
        if (!file_exists($fullPath)) {
            return Http::error($res, 'File not found', 404);
        }

        $fh = fopen($fullPath, 'rb');
        $stream = new Stream($fh);

        $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'pdf' => 'application/pdf',
            'webp' => 'image/webp',
            'avif' => 'image/avif',
            'png' => 'image/png',
            default => 'image/jpeg',
        };

        return $res
            ->withHeader('Content-Type', $mime)
            ->withHeader('Cache-Control', 'private, max-age=3600')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Length', (string) filesize($fullPath))
            ->withBody($stream);
    }

    private function streamPageAsset(Request $req, Response $res, int $flipbookId, int $pageNumber, bool $isThumb): Response
    {
        $f = $this->owned($req, $flipbookId);
        if (!$f) return Http::error($res, 'Not found', 404);

        $p = Db::one('SELECT * FROM pages WHERE flipbook_id = ? AND page_number = ?', [$flipbookId, $pageNumber]);
        if (!$p) return Http::error($res, 'Page not found', 404);

        $rel = $this->resolveExistingRelPath($f, (string) ($isThumb ? $p['thumb_path'] : $p['image_path']), $isThumb);
        $path = Storage::root() . '/' . $rel;
        if (!file_exists($path)) {
            return Http::error($res, 'File not found', 404);
        }

        $fh = fopen($path, 'rb');
        $stream = new Stream($fh);

        return $res
            ->withHeader('Content-Type', 'image/jpeg')
            ->withHeader('Cache-Control', 'private, max-age=3600')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Length', (string) filesize($path))
            ->withBody($stream);
    }

    // ---- helpers ----

    public static function storageRoot(): string
    {
        return Storage::root();
    }

    private function owned(Request $req, int $id): ?array
    {
        $f = Db::one('SELECT * FROM flipbooks WHERE id = ?', [$id]);
        if (!$f || !TenantContext::canAccessFlipbook($f)) {
            return null;
        }
        return $f;
    }

    private function resolveExistingRelPath(array $f, string $rel, bool $isThumb): string
    {
        $root = Storage::root();
        if ($rel !== '' && file_exists($root . '/' . $rel)) {
            return $rel;
        }
        $tenantId = !empty($f['tenant_id']) ? (int) $f['tenant_id'] : 1;
        $base = basename($rel ?: 'page-001.jpg');
        $candidates = [
            $isThumb
                ? "tenants/{$tenantId}/publications/{$f['id']}/thumbs/{$base}"
                : "tenants/{$tenantId}/publications/{$f['id']}/{$base}",
            $isThumb
                ? "public/flipbooks/{$f['id']}/thumbs/{$base}"
                : "public/flipbooks/{$f['id']}/{$base}",
        ];
        foreach ($candidates as $cand) {
            if (file_exists($root . '/' . $cand)) {
                return $cand;
            }
        }
        return $rel;
    }

    private function getVersionsList(int $flipbookId): array
    {
        $rows = Db::all(
            'SELECT v.*, u.name AS author_name, u.email AS author_email
             FROM flipbook_versions v
             LEFT JOIN users u ON u.id = v.created_by
             WHERE v.flipbook_id = ?
             ORDER BY v.version_number DESC, v.id DESC',
            [$flipbookId]
        );

        return array_map(static fn(array $v) => [
            'id' => (int) $v['id'],
            'versionNumber' => (int) $v['version_number'],
            'pageCount' => (int) $v['page_count'],
            'fileSizeBytes' => (int) $v['file_size_bytes'],
            'notes' => $v['notes'],
            'authorName' => $v['author_name'] ?? 'Publisher',
            'createdAt' => $v['created_at'],
            'downloadUrl' => Storage::temporarySignedUrl((string) $v['source_pdf_path'], 3600),
        ], $rows);
    }

    private function copyDirectory(string $src, string $dst): void
    {
        Storage::ensureDir($dst);
        foreach (scandir($src) ?: [] as $item) {
            if ($item === '.' || $item === '..') continue;
            $s = "{$src}/{$item}";
            $d = "{$dst}/{$item}";
            if (is_dir($s)) {
                $this->copyDirectory($s, $d);
            } else {
                @copy($s, $d);
            }
        }
    }

    private function tickScheduledLifecycle(): void
    {
        try {
            Db::run(
                "UPDATE flipbooks
                 SET workflow_status = 'published', published_at = COALESCE(published_at, NOW())
                 WHERE workflow_status = 'scheduled' AND status = 'ready' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()"
            );
            Db::run(
                "UPDATE flipbooks
                 SET workflow_status = 'archived', published_at = NULL
                 WHERE workflow_status IN ('published', 'scheduled') AND expires_at IS NOT NULL AND expires_at <= NOW()"
            );
        } catch (Throwable) {
        }
    }

    private function present(array $f): array
    {
        $coverRel = $f['cover_rel'] ?? null;
        if (!$coverRel && (int) $f['page_count'] > 0) {
            $p1 = Db::one('SELECT thumb_path FROM pages WHERE flipbook_id = ? AND page_number = 1', [$f['id']]);
            $coverRel = $p1['thumb_path'] ?? null;
        }
        $resolvedCover = $coverRel ? $this->resolveExistingRelPath($f, (string) $coverRel, true) : null;
        $signedCover = ($resolvedCover && file_exists(Storage::root() . '/' . $resolvedCover))
            ? Storage::temporarySignedUrl($resolvedCover, 14400)
            : null;

        $workflowStatus = $f['workflow_status'] ?? ($f['published_at'] !== null ? 'published' : ($f['status'] === 'ready' ? 'editing' : 'processing'));
        $previewToken = Storage::generatePreviewToken((string) $f['slug'], 14400);
        $tenantRow = !empty($f['tenant_id']) ? Db::one('SELECT name, slug FROM tenants WHERE id = ?', [$f['tenant_id']]) : null;

        return [
            'id' => (int) $f['id'],
            'title' => $f['title'],
            'description' => $f['description'],
            'slug' => $f['slug'],
            'tenantName' => $tenantRow['name'] ?? null,
            'status' => $f['status'],
            'workflowStatus' => $workflowStatus,
            'version' => (int) ($f['version'] ?? 1),
            'visibility' => $f['visibility'],
            'pageCount' => (int) $f['page_count'],
            'published' => $f['published_at'] !== null && $workflowStatus === 'published',
            'publishedAt' => $f['published_at'],
            'scheduledAt' => $f['scheduled_at'] ?? null,
            'expiresAt' => $f['expires_at'] ?? null,
            'categoryId' => isset($f['category_id']) && $f['category_id'] !== null ? (int) $f['category_id'] : null,
            'categoryName' => $f['category_name'] ?? null,
            'categoryColor' => $f['category_color'] ?? null,
            'collectionId' => isset($f['collection_id']) && $f['collection_id'] !== null ? (int) $f['collection_id'] : null,
            'collectionName' => $f['collection_name'] ?? null,
            'folderId' => isset($f['folder_id']) && $f['folder_id'] !== null ? (int) $f['folder_id'] : null,
            'conversionProgress' => (int) ($f['conversion_progress'] ?? ($f['status'] === 'ready' ? 100 : 0)),
            'conversionStep' => $f['conversion_step'] ?? ($f['status'] === 'ready' ? 'Completed' : 'Processing...'),
            'conversionError' => $f['conversion_error'] ?? null,
            'reviewNotes' => $f['review_notes'] ?? null,
            'reviewedBy' => isset($f['reviewed_by']) && $f['reviewed_by'] !== null ? (int) $f['reviewed_by'] : null,
            'reviewedAt' => $f['reviewed_at'] ?? null,
            'pdfMetadata' => !empty($f['pdf_metadata']) ? json_decode((string) $f['pdf_metadata'], true) : null,
            'seoMeta' => !empty($f['seo_meta']) ? json_decode((string) $f['seo_meta'], true) : new \stdClass(),
            'toc' => !empty($f['toc']) ? json_decode((string) $f['toc'], true) : [],
            'previewToken' => $previewToken,
            'previewUrl' => "/v/{$f['slug']}?preview={$previewToken}",
            'createdAt' => $f['created_at'],
            'updatedAt' => $f['updated_at'] ?? $f['created_at'],
            'cover' => $signedCover,
            'settings' => $f['settings'] ? json_decode((string) $f['settings'], true) : new \stdClass(),
        ];
    }

    private function uniqueSlug(string $title): string
    {
        $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $title) ?: $title)), '-');
        $base = substr($base ?: 'flipbook', 0, 50);
        do {
            $slug = $base . '-' . bin2hex(random_bytes(3));
        } while (Db::one('SELECT id FROM flipbooks WHERE slug = ?', [$slug]));
        return $slug;
    }
}
