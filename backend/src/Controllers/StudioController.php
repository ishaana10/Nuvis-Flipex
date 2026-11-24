<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\CryptoSecrets;
use App\Support\Db;
use App\Support\FdsAdapter;
use App\Support\FdsValidator;
use App\Support\Http;
use App\Support\Rbac;
use App\Support\SvgSafety;
use App\Support\StudioSvgRenderer;
use App\Support\StockLibrary;
use App\Support\Storage;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class StudioController
{
    private static bool $schemaEnsured = false;

    private const MAX_ELEMENTS_PER_PAGE = 600;
    private const MAX_PAGE_JSON_BYTES = 2 * 1024 * 1024;
    private const MAX_PAGES_PER_DOCUMENT = 300;
    private const MAX_REVISIONS = 50;

    /** Validate + encode a page's elements. Returns [json, error]. */
    private function cleanElements(mixed $v): array
    {
        if ($v === null) {
            return ['[]', null];
        }
        if (is_string($v)) {
            $decoded = json_decode($v, true);
            if (!is_array($decoded)) {
                return [null, 'elements must be a JSON array'];
            }
            $v = $decoded;
        }
        if (!is_array($v) || (!empty($v) && array_keys($v) !== range(0, count($v) - 1))) {
            return [null, 'elements must be a list'];
        }
        if (count($v) > self::MAX_ELEMENTS_PER_PAGE) {
            return [null, 'A page can hold at most ' . self::MAX_ELEMENTS_PER_PAGE . ' elements'];
        }
        foreach ($v as $el) {
            if (!is_array($el)) {
                return [null, 'Every element must be an object'];
            }
        }
        $json = json_encode($v, JSON_UNESCAPED_SLASHES);
        if ($json === false || strlen($json) > self::MAX_PAGE_JSON_BYTES) {
            return [null, 'Page content is too large (limit 2 MB)'];
        }
        return [$json, null];
    }

    private function cleanBackground(mixed $v): array
    {
        if ($v === null) {
            return [null, null];
        }
        if (is_string($v)) {
            $d = json_decode($v, true);
            $v = is_array($d) ? $d : ['type' => 'color', 'value' => $v];
        }
        if (!is_array($v)) {
            return [null, 'background must be an object'];
        }
        $json = json_encode($v, JSON_UNESCAPED_SLASHES);
        return $json !== false && strlen($json) <= 4096 ? [$json, null] : [null, 'background is too large'];
    }

    /** Thumbnails are display hints only: http(s) or site-relative URLs that fit the column. */
    private function cleanThumb(mixed $v): ?string
    {
        $t = trim((string) $v);
        if ($t === '' || strlen($t) > 500 || preg_match('/[\x00-\x1f]/', $t)) {
            return null;
        }
        return preg_match('#^(https?://|/(?!/))#i', $t) ? $t : null;
    }

    private function pruneRevisions(int $docId): void
    {
        Db::run(
            'DELETE FROM studio_document_revisions WHERE document_id = ? AND revision_number <= (
                SELECT m FROM (SELECT MAX(revision_number) - ? AS m FROM studio_document_revisions WHERE document_id = ?) t)',
            [$docId, self::MAX_REVISIONS, $docId]
        );
    }

    /**
     * Resolves safe tenant ID falling back to user tenant or tenant 1.
     */
    private function resolveTenantId(?array $user): int
    {
        $id = TenantContext::id();
        if ($id !== null && (int) $id > 0) {
            return (int) $id;
        }
        if (!empty($user['tenant_id']) && (int) $user['tenant_id'] > 0) {
            return (int) $user['tenant_id'];
        }
        // Never silently fall back to a default tenant: that would leak/mix another workspace's data.
        throw new \App\Support\TenantContextRequiredException('No workspace is associated with this account');
    }

    /**
     * Auto-ensure schema tables exist safely executing each table definition individually.
     */
    private function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        $manifestFile = __DIR__ . '/../../resources/studio/templates/manifest.json';
        $guardKey = 'studio_' . substr(md5((string) @filemtime($manifestFile) . ':' . (string) @filesize($manifestFile)), 0, 10);
        if (\App\Support\SchemaGuard::isCurrent($guardKey)) {
            self::$schemaEnsured = true;
            return;
        }

        $tables = [
            "CREATE TABLE IF NOT EXISTS studio_documents (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              tenant_id BIGINT UNSIGNED NOT NULL,
              created_by BIGINT UNSIGNED NOT NULL,
              title VARCHAR(255) NOT NULL,
              doc_type ENUM('catalogue', 'magazine', 'album', 'custom') NOT NULL DEFAULT 'catalogue',
              page_count INT NOT NULL DEFAULT 1,
              width_pt DECIMAL(8,2) NOT NULL DEFAULT 595.28,
              height_pt DECIMAL(8,2) NOT NULL DEFAULT 841.89,
              orientation ENUM('portrait', 'landscape') NOT NULL DEFAULT 'portrait',
              bleed_pt DECIMAL(5,2) NOT NULL DEFAULT 9.00,
              palette JSON NULL,
              settings JSON NULL,
              flipbook_id BIGINT UNSIGNED NULL,
              status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_studio_doc_tenant (tenant_id, status),
              INDEX idx_studio_doc_type (doc_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS studio_document_pages (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              document_id BIGINT UNSIGNED NOT NULL,
              page_number INT NOT NULL,
              background JSON NULL,
              elements JSON NOT NULL,
              thumbnail_url VARCHAR(500) NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_doc_page_num (document_id, page_number),
              INDEX idx_studio_page_doc (document_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS studio_templates (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              category VARCHAR(60) NOT NULL,
              doc_type ENUM('catalogue', 'magazine', 'album', 'custom') NOT NULL,
              name VARCHAR(200) NOT NULL,
              description TEXT NULL,
              thumbnail_url VARCHAR(500) NOT NULL,
              preview_images JSON NULL,
              canvas_spec JSON NOT NULL,
              is_system TINYINT(1) NOT NULL DEFAULT 1,
              tenant_id BIGINT UNSIGNED NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_template_cat (category, doc_type),
              INDEX idx_template_tenant (tenant_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS studio_assets (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              tenant_id BIGINT UNSIGNED NOT NULL,
              uploaded_by BIGINT UNSIGNED NOT NULL,
              asset_name VARCHAR(255) NOT NULL,
              asset_type ENUM('image', 'logo', 'sticker', 'font', 'icon', 'background') NOT NULL DEFAULT 'image',
              mime_type VARCHAR(100) NOT NULL,
              file_url VARCHAR(500) NOT NULL,
              file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
              width INT NULL,
              height INT NULL,
              tags VARCHAR(255) NULL,
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_asset_tenant (tenant_id, asset_type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS studio_publications (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              document_id BIGINT UNSIGNED NOT NULL,
              flipbook_id BIGINT UNSIGNED NOT NULL,
              version INT NOT NULL DEFAULT 1,
              rendered_pdf_url VARCHAR(500) NULL,
              status ENUM('generating', 'completed', 'failed') NOT NULL DEFAULT 'completed',
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_pub_doc (document_id),
              INDEX idx_pub_flipbook (flipbook_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS studio_document_revisions (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              document_id BIGINT UNSIGNED NOT NULL,
              revision_number INT UNSIGNED NOT NULL,
              title VARCHAR(255) NOT NULL,
              document_spec LONGTEXT NOT NULL,
              created_by BIGINT UNSIGNED NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_doc_rev (document_id, revision_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",

            "CREATE TABLE IF NOT EXISTS studio_export_jobs (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              tenant_id BIGINT UNSIGNED NOT NULL,
              document_id BIGINT UNSIGNED NOT NULL,
              export_type ENUM('print_pdf', 'web_pdf', 'flipbook_pages') NOT NULL,
              status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending',
              progress_percent INT DEFAULT 0,
              download_url VARCHAR(1024) NULL,
              error_message TEXT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_export_tenant (tenant_id),
              INDEX idx_export_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
        ];

        foreach ($tables as $sql) {
            try {
                Db::pdo()->exec($sql);
            } catch (\Throwable $te) {
                error_log('ensureSchema table check: ' . $te->getMessage());
            }
        }

        try {
            Db::pdo()->exec('ALTER TABLE studio_templates ADD COLUMN template_key VARCHAR(100) NULL AFTER name');
        } catch (\Throwable $te) {
            // Column may already exist
        }
        try {
            Db::pdo()->exec('ALTER TABLE studio_templates ADD COLUMN version VARCHAR(20) NOT NULL DEFAULT "1.0.0" AFTER template_key');
        } catch (\Throwable $te) {
            // Column may already exist
        }

        try {
            $this->seedDefaultTemplates();
        } catch (\Throwable $se) {
            error_log('seedDefaultTemplates notice: ' . $se->getMessage());
        }

        try {
            Db::pdo()->exec('ALTER TABLE studio_documents ADD COLUMN revision INT NOT NULL DEFAULT 1 AFTER status');
        } catch (\Throwable $re) {
            // Column may already exist
        }

        try {
            // Auto-heal any flipbooks created from studio documents stuck in 'approved' or without published_at
            Db::pdo()->exec('UPDATE flipbooks SET workflow_status = "published", published_at = IFNULL(published_at, NOW()) WHERE workflow_status = "approved" AND status = "ready"');
        } catch (\Throwable $he) {
            error_log('flipbook status heal check: ' . $he->getMessage());
        }

        self::$schemaEnsured = true;
    }

    /**
     * Seeds rich curated studio templates from versioned FDS v1.0 JSON files under resources/studio/templates/
     */
    private function seedDefaultTemplates(): void
    {
        $manifestPath = __DIR__ . '/../../resources/studio/templates/manifest.json';
        if (!file_exists($manifestPath)) {
            return;
        }

        $manifestContent = file_get_contents($manifestPath);
        if ($manifestContent === false) {
            return;
        }

        $manifest = json_decode($manifestContent, true);
        if (!is_array($manifest) || empty($manifest['templates'])) {
            return;
        }

        $baseDir = __DIR__ . '/../../resources/studio/templates/';

        foreach ($manifest['templates'] as $t) {
            $templateKey = (string) ($t['id'] ?? $t['slug']);
            $file = (string) ($t['file'] ?? '');
            $filePath = $baseDir . $file;

            if (!file_exists($filePath)) {
                continue;
            }

            $templateJson = file_get_contents($filePath);
            if ($templateJson === false) {
                continue;
            }

            $tplData = json_decode($templateJson, true);
            if (!is_array($tplData)) {
                continue;
            }

            // Ensure canonical FDS spec
            $meta = [
                'id' => $templateKey,
                'title' => $t['name'] ?? 'Untitled Template',
                'description' => $t['description'] ?? '',
                'category' => $t['category'] ?? 'magazine',
                'doc_type' => $t['docType'] ?? 'magazine',
                'version' => $t['version'] ?? '1.0.0'
            ];
            $fds = FdsAdapter::toFds($tplData, $meta);
            $canvasSpecJson = json_encode($fds, JSON_UNESCAPED_SLASHES);

            $existing = Db::one(
                'SELECT id, version FROM studio_templates WHERE (template_key = ? OR name = ?) AND is_system = 1',
                [$templateKey, $t['name']]
            );

            if ($existing) {
                Db::run(
                    'UPDATE studio_templates 
                     SET template_key = ?, category = ?, doc_type = ?, description = ?, thumbnail_url = ?, canvas_spec = ?, version = ? 
                     WHERE id = ?',
                    [
                        $templateKey,
                        $t['category'],
                        $t['docType'],
                        $t['description'],
                        $t['thumbnailUrl'],
                        $canvasSpecJson,
                        $t['version'] ?? '1.0.0',
                        $existing['id']
                    ]
                );
            } else {
                Db::run(
                    'INSERT INTO studio_templates (template_key, version, category, doc_type, name, description, thumbnail_url, canvas_spec, is_system)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
                    [
                        $templateKey,
                        $t['version'] ?? '1.0.0',
                        $t['category'],
                        $t['docType'],
                        $t['name'],
                        $t['description'],
                        $t['thumbnailUrl'],
                        $canvasSpecJson
                    ]
                );
            }
        }
    }

    /**
     * GET /studio/documents: List all studio documents for tenant.
     */
    public function listDocuments(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.view');

        $tenantId = $this->resolveTenantId($u);
        $params = $req->getQueryParams();
        $docType = trim((string) ($params['doc_type'] ?? ''));
        $search = trim((string) ($params['q'] ?? ''));

        $sql = 'SELECT d.*, 
                       (SELECT p.thumbnail_url FROM studio_document_pages p WHERE p.document_id = d.id ORDER BY p.page_number ASC LIMIT 1) as cover_thumb,
                       f.slug as flipbook_slug
                FROM studio_documents d
                LEFT JOIN flipbooks f ON f.id = d.flipbook_id
                WHERE d.tenant_id = ? AND d.status != "archived"';
        $binds = [$tenantId];

        if ($docType !== '' && in_array($docType, ['catalogue', 'magazine', 'album', 'custom'], true)) {
            $sql .= ' AND d.doc_type = ?';
            $binds[] = $docType;
        }

        if ($search !== '') {
            $sql .= ' AND d.title LIKE ?';
            $binds[] = '%' . $search . '%';
        }

        $sql .= ' ORDER BY d.updated_at DESC';

        $documents = Db::all($sql, $binds);
        foreach ($documents as &$doc) {
            $doc['palette'] = $doc['palette'] ? json_decode($doc['palette'], true) : null;
            $doc['settings'] = $doc['settings'] ? json_decode($doc['settings'], true) : null;
        }

        return Http::json($res, ['documents' => $documents]);
    }

    /**
     * POST /studio/documents: Create new studio document.
     */
    public function createDocument(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $body = (array) $req->getParsedBody();

        $title = trim((string) ($body['title'] ?? ''));
        if ($title === '') {
            return Http::error($res, 'Document title is required', 400);
        }
        if (mb_strlen($title) > 200) {
            return Http::error($res, 'Document title must be 200 characters or fewer', 400);
        }

        $docType = trim((string) ($body['doc_type'] ?? 'catalogue'));
        if (!in_array($docType, ['catalogue', 'magazine', 'album', 'custom'], true)) {
            $docType = 'catalogue';
        }

        $width = isset($body['width_pt']) ? (float) $body['width_pt'] : 595.28; // A4 pt
        $height = isset($body['height_pt']) ? (float) $body['height_pt'] : 841.89;
        $orientation = in_array(($body['orientation'] ?? ''), ['portrait', 'landscape'], true) ? $body['orientation'] : 'portrait';
        $bleed = isset($body['bleed_pt']) ? (float) $body['bleed_pt'] : 9.00;
        if ($width < 72 || $width > 5000 || $height < 72 || $height > 5000 || $bleed < 0 || $bleed > 100) {
            return Http::error($res, 'Page size must be between 72 and 5000 points (bleed 0-100).', 400);
        }

        $palette = isset($body['palette']) ? json_encode($body['palette']) : null;
        $settings = isset($body['settings']) ? json_encode($body['settings']) : json_encode([
            'gridSnap' => true,
            'gridSize' => 10,
            'showRulers' => true,
            'showBleed' => true,
        ]);

        $templateId = isset($body['template_id']) ? (int) $body['template_id'] : null;

        Db::pdo()->beginTransaction();
        try {
            Db::run(
                'INSERT INTO studio_documents (tenant_id, created_by, title, doc_type, page_count, width_pt, height_pt, orientation, bleed_pt, palette, settings, status)
                 VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, "draft")',
                [$tenantId, $u['id'], $title, $docType, $width, $height, $orientation, $bleed, $palette, $settings]
            );
            $docId = (int) Db::pdo()->lastInsertId();

            if ($templateId !== null && $templateId > 0) {
                $tpl = Db::one('SELECT * FROM studio_templates WHERE id = ? AND (is_system = 1 OR tenant_id = ?)', [$templateId, $tenantId]);
                if ($tpl && !empty($tpl['canvas_spec'])) {
                    $spec = json_decode($tpl['canvas_spec'], true);
                    if (is_array($spec) && FdsAdapter::isFds($spec)) {
                        $legacy = FdsAdapter::toLegacy($spec);
                        $pages = $legacy['pages'] ?? [];
                    } else {
                        $pages = $spec['pages'] ?? [];
                    }
                    if (!empty($pages)) {
                        $pageNum = 1;
                        foreach ($pages as $p) {
                            $bg = isset($p['background']) ? json_encode($p['background']) : null;
                            $elems = isset($p['elements']) ? json_encode($p['elements']) : '[]';
                            $thumb = $p['thumbnail_url'] ?? null;
                            Db::run(
                                'INSERT INTO studio_document_pages (document_id, page_number, background, elements, thumbnail_url)
                                 VALUES (?, ?, ?, ?, ?)',
                                [$docId, $pageNum, $bg, $elems, $thumb]
                            );
                            $pageNum++;
                        }
                        Db::run('UPDATE studio_documents SET page_count = ? WHERE id = ?', [count($pages), $docId]);
                    }
                }
            } else {
                // Initialize default blank Page 1
                Db::run(
                    'INSERT INTO studio_document_pages (document_id, page_number, background, elements)
                     VALUES (?, 1, ?, "[]")',
                    [$docId, json_encode(['type' => 'color', 'value' => '#FFFFFF'])]
                );
            }

            Db::pdo()->commit();

            try {
                Audit::log('studio_document.create', 'studio_document', $docId, ['title' => $title, 'doc_type' => $docType]);
            } catch (\Throwable $ae) {
                error_log('Audit log error on studio_document.create: ' . $ae->getMessage());
            }

            return Http::json($res, [
                'ok' => true,
                'document_id' => $docId,
                'message' => 'Document initialized successfully'
            ], 201);
        } catch (\Throwable $e) {
            if (Db::pdo()->inTransaction()) {
                Db::pdo()->rollBack();
            }
            error_log('Studio create failed: ' . $e->getMessage());
            return Http::error($res, 'Failed to create the document', 500);
        }
    }

    /**
     * GET /studio/documents/{id}: Fetch single document with all pages.
     */
    public function getDocument(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.view');

        $tenantId = $this->resolveTenantId($u);
        $id = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ? AND status != "archived"', [$id, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Studio document not found', 404);
        }

        $doc['palette'] = $doc['palette'] ? json_decode($doc['palette'], true) : null;
        $doc['settings'] = $doc['settings'] ? json_decode($doc['settings'], true) : null;

        $pages = Db::all('SELECT * FROM studio_document_pages WHERE document_id = ? ORDER BY page_number ASC', [$id]);
        foreach ($pages as &$p) {
            $p['background'] = $p['background'] ? json_decode($p['background'], true) : null;
            $p['elements'] = $p['elements'] ? json_decode($p['elements'], true) : [];
        }

        $doc['pages'] = $pages;

        return Http::json($res, ['document' => $doc]);
    }

    /**
     * PUT /studio/documents/{id}: Update document metadata.
     */
    public function updateDocument(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $id = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $body = (array) $req->getParsedBody();
        $title = isset($body['title']) ? trim((string) $body['title']) : $doc['title'];
        $docType = isset($body['doc_type']) && in_array($body['doc_type'], ['catalogue', 'magazine', 'album', 'custom'], true) ? $body['doc_type'] : $doc['doc_type'];
        $orientation = isset($body['orientation']) && in_array($body['orientation'], ['portrait', 'landscape'], true) ? $body['orientation'] : $doc['orientation'];

        $palette = isset($body['palette']) ? json_encode($body['palette']) : $doc['palette'];
        $settings = isset($body['settings']) ? json_encode($body['settings']) : $doc['settings'];

        Db::run(
            'UPDATE studio_documents SET title = ?, doc_type = ?, orientation = ?, palette = ?, settings = ?, updated_at = NOW() WHERE id = ?',
            [$title, $docType, $orientation, $palette, $settings, $id]
        );

        return Http::json($res, ['ok' => true, 'message' => 'Document updated successfully']);
    }

    /**
     * DELETE /studio/documents/{id}: Archive or delete document.
     */
    public function deleteDocument(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $id = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        Db::run('UPDATE studio_documents SET status = "archived", updated_at = NOW() WHERE id = ?', [$id]);
        try {
            Audit::log('studio_document.archive', 'studio_document', $id);
        } catch (\Throwable $ae) {
            error_log('Audit log error on studio_document.archive: ' . $ae->getMessage());
        }

        return Http::json($res, ['ok' => true, 'message' => 'Document archived']);
    }

    /**
     * POST /studio/documents/{id}/pages: Add new page.
     */
    public function addPage(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $id = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $body = (array) $req->getParsedBody();
        $maxPage = (int) (Db::one('SELECT COALESCE(MAX(page_number), 0) as m FROM studio_document_pages WHERE document_id = ?', [$id])['m'] ?? 0);
        $nextPageNum = $maxPage + 1;

        if ($maxPage >= self::MAX_PAGES_PER_DOCUMENT) {
            return Http::error($res, 'A document can have at most ' . self::MAX_PAGES_PER_DOCUMENT . ' pages', 422);
        }
        [$bg, $bgErr] = $this->cleanBackground($body['background'] ?? ['type' => 'color', 'value' => '#FFFFFF']);
        [$elements, $elErr] = $this->cleanElements($body['elements'] ?? null);
        if ($bgErr || $elErr) {
            return Http::error($res, $bgErr ?? $elErr, 422);
        }

        Db::run(
            'INSERT INTO studio_document_pages (document_id, page_number, background, elements)
             VALUES (?, ?, ?, ?)',
            [$id, $nextPageNum, $bg, $elements]
        );
        $pageId = (int) Db::pdo()->lastInsertId();

        Db::run('UPDATE studio_documents SET page_count = page_count + 1, updated_at = NOW() WHERE id = ?', [$id]);

        return Http::json($res, [
            'ok' => true,
            'page_id' => $pageId,
            'page_number' => $nextPageNum
        ], 201);
    }

    /**
     * PUT /studio/documents/{id}/pages/{pageId}: Update canvas elements & background on a page.
     */
    public function updatePage(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);
        $pageId = (int) ($args['pageId'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $page = Db::one('SELECT * FROM studio_document_pages WHERE id = ? AND document_id = ?', [$pageId, $docId]);
        if (!$page) {
            return Http::error($res, 'Page not found', 404);
        }

        $body = (array) $req->getParsedBody();
        $bg = $page['background'];
        $elements = $page['elements'];
        $thumb = $page['thumbnail_url'];
        if (array_key_exists('background', $body)) {
            [$bg, $err] = $this->cleanBackground($body['background']);
            if ($err) {
                return Http::error($res, $err, 422);
            }
        }
        if (array_key_exists('elements', $body)) {
            [$elements, $err] = $this->cleanElements($body['elements']);
            if ($err) {
                return Http::error($res, $err, 422);
            }
        }
        if (array_key_exists('thumbnail_url', $body)) {
            $thumb = $this->cleanThumb($body['thumbnail_url']);
        }

        Db::run(
            'UPDATE studio_document_pages SET background = ?, elements = ?, thumbnail_url = ?, updated_at = NOW() WHERE id = ?',
            [$bg, $elements, $thumb, $pageId]
        );
        Db::run('UPDATE studio_documents SET updated_at = NOW() WHERE id = ?', [$docId]);

        return Http::json($res, ['ok' => true, 'message' => 'Page updated successfully']);
    }

    /**
     * DELETE /studio/documents/{id}/pages/{pageId}: Remove page and re-index.
     */
    public function deletePage(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);
        $pageId = (int) ($args['pageId'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $count = (int) (Db::one('SELECT COUNT(*) as c FROM studio_document_pages WHERE document_id = ?', [$docId])['c'] ?? 0);
        if ($count <= 1) {
            return Http::error($res, 'A document must contain at least one page', 400);
        }

        Db::run('DELETE FROM studio_document_pages WHERE id = ? AND document_id = ?', [$pageId, $docId]);

        // Re-index remaining pages
        $pages = Db::all('SELECT id FROM studio_document_pages WHERE document_id = ? ORDER BY page_number ASC', [$docId]);
        $num = 1;
        foreach ($pages as $p) {
            Db::run('UPDATE studio_document_pages SET page_number = ? WHERE id = ?', [$num++, $p['id']]);
        }

        Db::run('UPDATE studio_documents SET page_count = ?, updated_at = NOW() WHERE id = ?', [count($pages), $docId]);

        return Http::json($res, ['ok' => true, 'message' => 'Page deleted']);
    }

    /**
     * POST /studio/documents/{id}/pages/reorder: Re-index pages by ID array.
     */
    public function reorderPages(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $body = (array) $req->getParsedBody();
        $pageIds = $body['page_ids'] ?? [];
        if (!is_array($pageIds) || empty($pageIds)) {
            return Http::error($res, 'page_ids array is required', 400);
        }

        Db::pdo()->beginTransaction();
        try {
            // Temporary offset to prevent unique key collisions during re-indexing
            $offset = 10000;
            foreach ($pageIds as $idx => $pid) {
                Db::run('UPDATE studio_document_pages SET page_number = ? WHERE id = ? AND document_id = ?', [$offset + $idx, (int) $pid, $docId]);
            }
            $num = 1;
            foreach ($pageIds as $pid) {
                Db::run('UPDATE studio_document_pages SET page_number = ? WHERE id = ? AND document_id = ?', [$num++, (int) $pid, $docId]);
            }
            Db::pdo()->commit();
            return Http::json($res, ['ok' => true, 'message' => 'Pages reordered successfully']);
        } catch (\Throwable $e) {
            if (Db::pdo()->inTransaction()) {
                Db::pdo()->rollBack();
            }
            return Http::error($res, 'Reorder failed', 500);
        }
    }

    /**
     * GET /studio/templates: List templates with category, doc_type, orientation, and keyword filtering.
     */
    public function listTemplates(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = $this->resolveTenantId($u);
        $params = $req->getQueryParams();
        $docType = trim((string) ($params['doc_type'] ?? ''));
        $category = trim((string) ($params['category'] ?? ''));
        $search = trim((string) ($params['q'] ?? ''));
        $scope = trim((string) ($params['scope'] ?? '')); // 'all', 'system', 'custom'

        $sql = 'SELECT id, category, doc_type, name, description, thumbnail_url, canvas_spec, is_system, tenant_id, created_at 
                FROM studio_templates 
                WHERE 1=1';
        $binds = [];

        if ($scope === 'system') {
            $sql .= ' AND is_system = 1';
        } else if ($scope === 'custom') {
            $sql .= ' AND is_system = 0 AND tenant_id = ?';
            $binds[] = $tenantId;
        } else {
            $sql .= ' AND (is_system = 1 OR tenant_id = ?)';
            $binds[] = $tenantId;
        }

        if ($docType !== '' && in_array($docType, ['catalogue', 'magazine', 'album', 'custom'], true)) {
            $sql .= ' AND doc_type = ?';
            $binds[] = $docType;
        }

        if ($category !== '' && $category !== 'all') {
            $sql .= ' AND category = ?';
            $binds[] = $category;
        }

        if ($search !== '') {
            $sql .= ' AND (name LIKE ? OR description LIKE ?)';
            $binds[] = '%' . $search . '%';
            $binds[] = '%' . $search . '%';
        }

        $sql .= ' ORDER BY is_system DESC, id ASC';
        $rows = Db::all($sql, $binds);

        $templates = [];
        foreach ($rows as $row) {
            $pageCount = 1;
            $previewImages = [];
            $tags = [];
            $dimensions = null;
            if (!empty($row['canvas_spec'])) {
                $decoded = json_decode($row['canvas_spec'], true);
                $pages = $decoded['pages'] ?? [];
                $pageCount = max(1, count($pages));
                $tags = $decoded['tags'] ?? [];
                $dimensions = $decoded['document'] ?? null;
                foreach ($pages as $p) {
                    if (!empty($p['thumbnail_url'])) {
                        $previewImages[] = $p['thumbnail_url'];
                    }
                }
            }
            // Exclude heavy canvas_spec in list view for performance, but return page_count, tags, and preview_images
            unset($row['canvas_spec']);
            $row['page_count'] = $pageCount;
            $row['preview_images'] = $previewImages;
            $row['tags'] = $tags;
            $row['dimensions'] = $dimensions;
            $templates[] = $row;
        }

        return Http::json($res, ['templates' => $templates]);
    }

    /**
     * GET /studio/templates/{id}: Get detailed template with full canvas_spec for multi-page inspection.
     */
    public function getTemplate(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = $this->resolveTenantId($u);
        $id = (int) ($args['id'] ?? 0);

        $tpl = Db::one('SELECT * FROM studio_templates WHERE id = ? AND (is_system = 1 OR tenant_id = ?)', [$id, $tenantId]);
        if (!$tpl) {
            return Http::json($res, ['error' => 'Template not found'], 404);
        }

        if (!empty($tpl['canvas_spec'])) {
            $spec = json_decode($tpl['canvas_spec'], true);
            if (is_array($spec) && FdsAdapter::isFds($spec)) {
                $legacy = FdsAdapter::toLegacy($spec);
                $spec['pages'] = $legacy['pages'] ?? ($spec['pages'] ?? []);
            }
            $tpl['canvas_spec'] = $spec;
        }
        if (!empty($tpl['preview_images'])) {
            $tpl['preview_images'] = json_decode($tpl['preview_images'], true);
        }

        return Http::json($res, ['template' => $tpl]);
    }

    /**
     * POST /studio/templates: Save an existing studio document as a reusable custom template.
     */
    public function saveTemplate(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');
        $tenantId = $this->resolveTenantId($u);
        $body = (array) ($req->getParsedBody() ?? []);

        $name = trim((string) ($body['name'] ?? ''));
        $description = trim((string) ($body['description'] ?? ''));
        $category = trim((string) ($body['category'] ?? 'business_corporate'));
        $documentId = (int) ($body['document_id'] ?? 0);
        $thumbnailUrl = $this->cleanThumb($body['thumbnail_url'] ?? '') ?? '';

        if ($name === '' || mb_strlen($name) > 120) {
            return Http::json($res, ['error' => 'Template name is required (max 120 characters)'], 422);
        }
        $description = mb_substr($description, 0, 500);
        $category = preg_match('/^[a-z0-9_]{1,40}$/', $category) ? $category : 'business_corporate';

        if ($documentId <= 0) {
            return Http::json($res, ['error' => 'Document ID is required to create a template'], 422);
        }

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$documentId, $tenantId]);
        if (!$doc) {
            return Http::json($res, ['error' => 'Document not found'], 404);
        }

        $dbPages = Db::all('SELECT * FROM studio_document_pages WHERE document_id = ? ORDER BY page_number ASC', [$documentId]);
        if (empty($dbPages)) {
            return Http::json($res, ['error' => 'Document has no pages to convert to a template'], 422);
        }

        $pages = [];
        $previewThumbs = [];
        foreach ($dbPages as $dp) {
            $pages[] = [
                'background' => !empty($dp['background']) ? json_decode($dp['background'], true) : null,
                'elements' => !empty($dp['elements']) ? json_decode($dp['elements'], true) : [],
                'thumbnail_url' => $dp['thumbnail_url'] ?? null,
            ];
            if (!empty($dp['thumbnail_url'])) {
                $previewThumbs[] = $dp['thumbnail_url'];
            }
        }

        if ($thumbnailUrl === '') {
            $thumbnailUrl = !empty($doc['cover_thumb'])
                ? $doc['cover_thumb']
                : ($previewThumbs[0] ?? '/api/v1/studio-stock/stock_ret_06.svg');
        }

        $meta = [
            'id' => 'custom_' . uniqid(),
            'title' => $name,
            'description' => $description,
            'category' => $category,
            'doc_type' => $doc['doc_type'],
            'width_pt' => $doc['width_pt'] ?? null,
            'height_pt' => $doc['height_pt'] ?? null,
            'orientation' => $doc['orientation'] ?? null,
            'bleed_pt' => $doc['bleed_pt'] ?? null,
            'version' => '1.0.0'
        ];
        $fds = FdsAdapter::toFds(['pages' => $pages], $meta);
        $validation = FdsValidator::validate($fds);
        if (!$validation['valid']) {
            return Http::json($res, [
                'error' => 'Template validation failed against Flipex Design Schema (FDS v1.0)',
                'details' => $validation['errors']
            ], 422);
        }

        $canvasSpecJson = json_encode($fds, JSON_UNESCAPED_SLASHES);
        $previewImagesJson = !empty($previewThumbs) ? json_encode($previewThumbs) : null;

        Db::run(
            'INSERT INTO studio_templates (category, doc_type, name, description, thumbnail_url, preview_images, canvas_spec, is_system, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
            [$category, $doc['doc_type'], $name, $description, $thumbnailUrl, $previewImagesJson, $canvasSpecJson, $tenantId]
        );
        $templateId = (int) Db::pdo()->lastInsertId();

        try {
            Audit::log('studio_template.create', 'studio_template', $templateId, [
                'name' => $name,
                'category' => $category,
                'source_document_id' => $documentId,
            ]);
        } catch (\Throwable $ae) {
            error_log('Audit error on studio_template.create: ' . $ae->getMessage());
        }

        return Http::json($res, [
            'ok' => true,
            'template_id' => $templateId,
            'message' => 'Document saved as reusable template successfully',
        ]);
    }

    /**
     * POST /studio/templates/import: add a template from an FDS v1.0 JSON document (API / API-key friendly).
     * Body: the FDS document itself, or {"name","description","category","template": {FDS}}.
     */
    public function importTemplate(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');
        $tenantId = $this->resolveTenantId($u);
        $body = (array) ($req->getParsedBody() ?? []);

        $fds = isset($body['template']) && is_array($body['template']) ? $body['template'] : $body;
        $raw = json_encode($fds, JSON_UNESCAPED_SLASHES);
        if ($raw === false || strlen($raw) > 1536 * 1024) {
            return Http::error($res, 'Template is too large (limit 1.5 MB)', 413);
        }
        if (!FdsAdapter::isFds($fds)) {
            return Http::error($res, 'Body is not a Flipex Design Schema (FDS v1.0) document', 422);
        }
        $pages = is_array($fds['pages'] ?? null) ? $fds['pages'] : [];
        if (count($pages) < 1 || count($pages) > 60) {
            return Http::error($res, 'A template needs between 1 and 60 pages', 422);
        }
        foreach ($pages as &$pg) {
            [$ej, $err] = $this->cleanElements($pg['elements'] ?? []);
            if ($err) {
                return Http::error($res, $err, 422);
            }
            $els = json_decode((string) $ej, true) ?: [];
            foreach ($els as &$e) {
                foreach (['linkUrl', 'url'] as $k) {
                    if (isset($e[$k]) && is_string($e[$k]) && !preg_match('#^(data:image/(png|jpe?g|webp|gif);base64,|https?://|/(?!/))#i', $e[$k])) {
                        unset($e[$k]); // drop javascript:, file:, protocol-relative and unknown schemes
                    }
                }
                if (isset($e['linkUrl']) && SvgSafety::safeLinkUrl($e['linkUrl']) === null && !str_starts_with((string) $e['linkUrl'], 'data:')) {
                    unset($e['linkUrl']);
                }
            }
            unset($e);
            $pg['elements'] = $els;
        }
        unset($pg);
        $fds['pages'] = $pages;

        $validation = FdsValidator::validate($fds);
        if (!$validation['valid']) {
            return Http::json($res, ['error' => 'Template validation failed against FDS v1.0', 'details' => array_slice($validation['errors'], 0, 20)], 422);
        }

        $name = trim((string) ($body['name'] ?? $fds['title'] ?? ''));
        if ($name === '' || mb_strlen($name) > 120) {
            return Http::error($res, 'Template name is required (max 120 characters)', 422);
        }
        $description = mb_substr(trim((string) ($body['description'] ?? $fds['description'] ?? '')), 0, 500);
        $category = (string) ($body['category'] ?? $fds['category'] ?? 'business_corporate');
        $category = preg_match('/^[a-z0-9_]{1,40}$/', $category) ? $category : 'business_corporate';
        $docType = (string) ($fds['docType'] ?? 'custom');
        $docType = in_array($docType, ['catalogue', 'magazine', 'album', 'custom'], true) ? $docType : 'custom';
        $count = (int) Db::one('SELECT COUNT(*) c FROM studio_templates WHERE tenant_id = ? AND is_system = 0', [$tenantId])['c'];
        if ($count >= 200) {
            return Http::error($res, 'Template limit reached for this workspace (200)', 422);
        }

        Db::run(
            'INSERT INTO studio_templates (category, doc_type, name, description, thumbnail_url, canvas_spec, is_system, tenant_id)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
            [$category, $docType, $name, $description, '/api/v1/studio-stock/stock_abs_01.svg', json_encode($fds, JSON_UNESCAPED_SLASHES), $tenantId]
        );
        $id = (int) Db::pdo()->lastInsertId();
        try {
            Audit::log('studio_template.import', 'studio_template', $id, ['name' => $name, 'pages' => count($pages)]);
        } catch (\Throwable) {
        }
        return Http::json($res, ['ok' => true, 'template_id' => $id, 'pages' => count($pages), 'message' => 'Template imported'], 201);
    }

    /** GET /studio/templates/{id}/export: download a template as FDS v1.0 JSON. */
    public function exportTemplate(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');
        $tenantId = $this->resolveTenantId($u);
        $tpl = Db::one('SELECT name, canvas_spec FROM studio_templates WHERE id = ? AND (is_system = 1 OR tenant_id = ?)', [(int) ($args['id'] ?? 0), $tenantId]);
        if (!$tpl) {
            return Http::error($res, 'Template not found', 404);
        }
        $slug = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower((string) $tpl['name'])), '-') ?: 'template';
        $res->getBody()->write((string) $tpl['canvas_spec']);
        return $res->withHeader('Content-Type', 'application/json')
            ->withHeader('Content-Disposition', 'attachment; filename="' . $slug . '.flipex.json"')
            ->withHeader('X-Content-Type-Options', 'nosniff');
    }

    /**
     * DELETE /studio/templates/{id}: Delete a custom template owned by this tenant.
     */
    public function deleteTemplate(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');
        $tenantId = $this->resolveTenantId($u);
        $id = (int) ($args['id'] ?? 0);

        $tpl = Db::one('SELECT id, name FROM studio_templates WHERE id = ? AND tenant_id = ? AND is_system = 0', [$id, $tenantId]);
        if (!$tpl) {
            return Http::json($res, ['error' => 'Custom template not found or cannot delete system template'], 404);
        }

        Db::run('DELETE FROM studio_templates WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);

        try {
            Audit::log('studio_template.delete', 'studio_template', $id, ['name' => $tpl['name']]);
        } catch (\Throwable $ae) {
            error_log('Audit error on studio_template.delete: ' . $ae->getMessage());
        }

        return Http::json($res, ['ok' => true, 'message' => 'Custom template deleted successfully']);
    }

    /**
     * GET /studio/assets: List media assets for tenant or curated stock library.
     */
    public function listAssets(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = $this->resolveTenantId($u);
        $params = $req->getQueryParams();
        $assetType = trim((string) ($params['type'] ?? ''));
        $search = trim((string) ($params['q'] ?? ''));
        $scope = trim((string) ($params['scope'] ?? 'tenant')); // 'tenant', 'library'
        $limit = max(1, min(100, (int) ($params['limit'] ?? 50)));
        $offset = max(0, (int) ($params['offset'] ?? 0));

        if ($scope === 'library') {
            $stock = $this->getStockLibraryAssets($assetType, $search);
            return Http::json($res, [
                'assets' => array_slice($stock, $offset, $limit),
                'total' => count($stock),
                'limit' => $limit,
                'offset' => $offset,
                'scope' => 'library'
            ]);
        }

        $sql = 'SELECT * FROM studio_assets WHERE tenant_id = ?';
        $binds = [$tenantId];

        if ($assetType !== '' && $assetType !== 'all') {
            $sql .= ' AND asset_type = ?';
            $binds[] = $assetType;
        }

        if ($search !== '') {
            $sql .= ' AND (asset_name LIKE ? OR tags LIKE ?)';
            $binds[] = '%' . $search . '%';
            $binds[] = '%' . $search . '%';
        }

        $countSql = preg_replace('/SELECT \* FROM/i', 'SELECT COUNT(*) as c FROM', $sql);
        $total = (int) (Db::one($countSql, $binds)['c'] ?? 0);

        $sql .= ' ORDER BY created_at DESC LIMIT ' . $limit . ' OFFSET ' . $offset;
        $assets = Db::all($sql, $binds);

        return Http::json($res, [
            'assets' => $assets,
            'total' => $total,
            'limit' => $limit,
            'offset' => $offset,
            'scope' => 'tenant'
        ]);
    }

    /**
     * POST /studio/assets/upload: Upload image, logo or graphic asset with dimension extraction and MIME validation.
     */
    /** Strip path parts and control characters from a client-supplied filename (display only). */
    private static function safeDisplayName(string $name): string
    {
        $name = basename(str_replace('\\', '/', $name));
        $name = preg_replace('/[^\p{L}\p{N}._ \-()]+/u', '_', $name) ?? 'asset';
        $name = trim($name, '. ');
        return $name === '' ? 'asset' : mb_substr($name, 0, 120);
    }

    /** Reject SVG files that can execute script or pull in external resources. */
    private static function isSafeSvg(string $svg): bool
    {
        return SvgSafety::isSafe($svg);
    }

    public function uploadAsset(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $files = $req->getUploadedFiles();
        $file = $files['file'] ?? null;
        $body = (array) ($req->getParsedBody() ?? []);

        $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
        $assetType = trim((string) ($body['asset_type'] ?? 'image'));
        if (!in_array($assetType, ['image', 'logo', 'sticker', 'font', 'icon', 'background'], true)) {
            $assetType = 'image';
        }
        $tags = trim((string) ($body['tags'] ?? ''));

        if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
            // Check if external URL was provided
            $url = trim((string) ($body['file_url'] ?? ''));
            $name = trim((string) ($body['name'] ?? 'Asset ' . date('Y-m-d H:i')));

            if ($url === '') {
                return Http::error($res, 'Please provide an uploaded file or file_url', 422);
            }

            if (str_starts_with($url, 'data:image/') && str_contains($url, ';base64,')) {
                return Http::error($res, 'Inline Base64 image payloads are not allowed. Please upload the raw binary file.', 422);
            }

            Db::run(
                'INSERT INTO studio_assets (tenant_id, uploaded_by, asset_name, asset_type, mime_type, file_url, file_size, tags)
                 VALUES (?, ?, ?, ?, "image/jpeg", ?, 0, ?)',
                [$tenantId, $u['id'], $name, $assetType, $url, $tags ?: null]
            );
            $assetId = (int) Db::pdo()->lastInsertId();

            try {
                Audit::log('studio_asset.register_url', 'studio_asset', $assetId, ['name' => $name, 'url' => $url]);
            } catch (\Throwable $ae) {}

            return Http::json($res, ['ok' => true, 'asset_id' => $assetId, 'file_url' => $url, 'name' => $name], 201);
        }

        // Never trust the client-supplied name or Content-Type: inspect the real bytes.
        $clientName = self::safeDisplayName((string) ($file->getClientFilename() ?? 'asset.png'));
        $size = (int) $file->getSize();

        // Validate Max File Size (15MB)
        if ($size > 15 * 1024 * 1024) {
            return Http::error($res, 'File size exceeds maximum allowed limit (15MB)', 422);
        }

        $tmpUpload = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'studio_' . bin2hex(random_bytes(8));
        $file->moveTo($tmpUpload);

        $detected = (new \finfo(FILEINFO_MIME_TYPE))->file($tmpUpload) ?: '';
        $extByMime = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/svg+xml' => 'svg'];
        // finfo reports SVG as text/xml or text/plain depending on libmagic; confirm by content.
        if (in_array($detected, ['text/xml', 'text/plain', 'application/xml', 'image/svg+xml'], true)) {
            $head = (string) file_get_contents($tmpUpload, false, null, 0, 4096);
            if (stripos($head, '<svg') !== false) {
                $detected = 'image/svg+xml';
            }
        }
        $mime = $detected;

        if (!isset($extByMime[$mime]) || !in_array($mime, $allowedMimes, true)) {
            @unlink($tmpUpload);
            return Http::error($res, 'Unsupported file format. Supported formats: JPG, PNG, WebP, SVG.', 422);
        }

        if ($mime === 'image/svg+xml') {
            $svgSource = (string) file_get_contents($tmpUpload);
            if (!self::isSafeSvg($svgSource)) {
                @unlink($tmpUpload);
                return Http::error($res, 'This SVG contains scripts or external references and cannot be uploaded. Export a plain SVG and try again.', 422);
            }
        } elseif (@getimagesize($tmpUpload) === false) {
            @unlink($tmpUpload);
            return Http::error($res, 'The file is not a valid image.', 422);
        }

        // Target directory: /storage/tenants/{id}/studio/
        $destDir = Storage::tenantDir($tenantId) . '/studio';
        Storage::ensureDir($destDir);

        // Extension comes from the detected type, never from the client's filename.
        $filename = bin2hex(random_bytes(12)) . '.' . $extByMime[$mime];
        $fullPath = $destDir . '/' . $filename;

        if (!@rename($tmpUpload, $fullPath) && !@copy($tmpUpload, $fullPath)) {
            @unlink($tmpUpload);
            return Http::error($res, 'Could not store the uploaded file', 500);
        }
        @unlink($tmpUpload);
        @chmod($fullPath, 0640);

        // Extract image dimensions for layout optimisation
        $width = null;
        $height = null;
        if (in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
            $dim = @getimagesize($fullPath);
            if ($dim) {
                $width = (int) $dim[0];
                $height = (int) $dim[1];
            }
        }

        $relPath = "tenants/{$tenantId}/studio/{$filename}";
        $url = Storage::signedUrl($relPath, 86400 * 365); // 1-year signed URL or CDN

        Db::run(
            'INSERT INTO studio_assets (tenant_id, uploaded_by, asset_name, asset_type, mime_type, file_url, file_size, width, height, tags)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$tenantId, $u['id'], $clientName, $assetType, $mime, $url, $size, $width, $height, $tags ?: null]
        );
        $assetId = (int) Db::pdo()->lastInsertId();

        try {
            Audit::log('studio_asset.upload', 'studio_asset', $assetId, [
                'name' => $clientName,
                'mime' => $mime,
                'size' => $size,
                'width' => $width,
                'height' => $height
            ]);
        } catch (\Throwable $ae) {}

        return Http::json($res, [
            'ok' => true,
            'asset_id' => $assetId,
            'file_url' => $url,
            'name' => $clientName,
            'width' => $width,
            'height' => $height,
            'mime_type' => $mime,
            'file_size' => $size
        ], 201);
    }

    /**
     * DELETE /studio/assets/{id}: Delete a tenant asset and purge physical file.
     */
    public function deleteAsset(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $id = (int) ($args['id'] ?? 0);

        $asset = Db::one('SELECT * FROM studio_assets WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        if (!$asset) {
            return Http::json($res, ['error' => 'Asset not found or unauthorized'], 404);
        }

        // Safely purge local storage file
        if (!empty($asset['file_url']) && str_contains($asset['file_url'], "/tenants/{$tenantId}/studio/")) {
            $parsedPath = parse_url($asset['file_url'], PHP_URL_PATH);
            if ($parsedPath) {
                $sub = substr($parsedPath, (int) strpos($parsedPath, "tenants/{$tenantId}"));
                $filePath = Storage::baseDir() . '/' . $sub;
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }
            }
        }

        Db::run('DELETE FROM studio_assets WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);

        try {
            Audit::log('studio_asset.delete', 'studio_asset', $id, ['name' => $asset['asset_name']]);
        } catch (\Throwable $ae) {
            error_log('Audit error on studio_asset.delete: ' . $ae->getMessage());
        }

        return Http::json($res, ['ok' => true, 'message' => 'Asset deleted successfully']);
    }

    /**
     * Returns curated, royalty-free stock imagery and vector assets for the Studio library.
     */
    public function getStockLibraryAssets(string $category = '', string $q = ''): array
    {
        return StockLibrary::items($category, $q);
    }

    /** GET /studio-stock/{name}.svg: public, cacheable bundled artwork (no auth: used by <img> tags in the editor). */
    public function serveStock(Request $req, Response $res, array $args): Response
    {
        $path = StockLibrary::path((string) ($args['name'] ?? ''));
        if ($path === null) {
            return Http::error($res, 'Not found', 404);
        }
        $body = (string) file_get_contents($path);
        $res->getBody()->write($body);
        return $res
            ->withHeader('Content-Type', 'image/svg+xml')
            ->withHeader('Cache-Control', 'public, max-age=604800')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }

    /** GET /studio-template-thumb/{key}.svg: public preview of a SYSTEM template's first page. */
    public function serveTemplateThumb(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $key = (string) ($args['key'] ?? '');
        $tpl = preg_match('/^[A-Za-z0-9_\-]{1,80}$/', $key)
            ? Db::one('SELECT id, version, canvas_spec FROM studio_templates WHERE template_key = ? AND is_system = 1', [$key])
            : null;
        if (!$tpl) {
            return Http::error($res, 'Not found', 404);
        }
        $cacheKey = 'tplthumb:' . $key . ':' . $tpl['version'] . ':' . md5((string) $tpl['canvas_spec']);
        $svg = \App\Infrastructure\Cache\CacheManager::get($cacheKey);
        if (!is_string($svg)) {
            $spec = json_decode((string) $tpl['canvas_spec'], true) ?: [];
            $legacy = FdsAdapter::isFds($spec) ? FdsAdapter::toLegacy($spec) : $spec;
            $page = $legacy['pages'][0] ?? ['elements' => []];
            $w = (float) ($spec['document']['width'] ?? $legacy['width_pt'] ?? 595.28);
            $h = (float) ($spec['document']['height'] ?? $legacy['height_pt'] ?? 841.89);
            $svg = StudioSvgRenderer::renderPage($page, $w, $h, 0, 1);
            if (!SvgSafety::isSafe($svg)) {
                return Http::error($res, 'Not found', 404);
            }
            \App\Infrastructure\Cache\CacheManager::set($cacheKey, $svg, 86400);
        }
        $res->getBody()->write($svg);
        return $res
            ->withHeader('Content-Type', 'image/svg+xml')
            ->withHeader('Cache-Control', 'public, max-age=3600')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }

    /**
     * POST /studio/documents/{id}/publish: Compile studio document to a live Flipbook.
     */
    public function publishDocument(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.publish');

        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $body = (array) $req->getParsedBody();

        $pages = Db::all('SELECT * FROM studio_document_pages WHERE document_id = ? ORDER BY page_number ASC', [$docId]);
        if (empty($pages)) {
            return Http::error($res, 'Document must have at least one page to publish', 400);
        }

        // Plan limit: only a brand-new publication counts against it (re-publishing an existing one is free).
        $linked = $doc['flipbook_id'] ? Db::one('SELECT id FROM flipbooks WHERE id = ? AND tenant_id = ?', [(int) $doc['flipbook_id'], $tenantId]) : null;
        if (!$linked) {
            $tenantRow = Db::one('SELECT t.max_flipbooks, p.max_flipbooks AS plan_max FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id WHERE t.id = ?', [$tenantId]);
            $maxAllowed = (int) ($tenantRow['max_flipbooks'] ?? $tenantRow['plan_max'] ?? 0);
            if ($maxAllowed > 0) {
                $used = (int) Db::one('SELECT COUNT(*) c FROM flipbooks WHERE tenant_id = ?', [$tenantId])['c'];
                if ($used >= $maxAllowed) {
                    return Http::error($res, "Your workspace plan allows a maximum of {$maxAllowed} publications.", 403);
                }
            }
        }

        $writtenFiles = [];
        Db::pdo()->beginTransaction();
        try {
            $flipbookId = $doc['flipbook_id'] ? (int) $doc['flipbook_id'] : null;
            $existingFb = $flipbookId ? Db::one('SELECT id, slug, published_at FROM flipbooks WHERE id = ? AND tenant_id = ?', [$flipbookId, $tenantId]) : null;
            if ($flipbookId && !$existingFb) {
                $flipbookId = null; // linked flipbook is gone (or not ours): publish a fresh one
            }
            $slug = !empty($existingFb['slug']) ? $existingFb['slug'] : ('doc-' . $docId . '-' . substr(bin2hex(random_bytes(4)), 0, 8));

            if ($flipbookId && $existingFb) {
                // Update existing flipbook
                Db::run(
                    'UPDATE flipbooks SET tenant_id = ?, user_id = ?, title = ?, page_count = ?, status = "ready", workflow_status = "published", visibility = "public", published_at = IFNULL(published_at, NOW()), updated_at = NOW()
                     WHERE id = ? AND tenant_id = ?',
                    [$tenantId, $u['id'], $doc['title'], count($pages), $flipbookId, $tenantId]
                );
                // Clean old pages & hotspots for re-compilation
                Db::run('DELETE FROM pages WHERE flipbook_id = ?', [$flipbookId]);
                Db::run('DELETE FROM hotspots WHERE flipbook_id = ?', [$flipbookId]);
            } else {
                // Create new flipbook
                Db::run(
                    'INSERT INTO flipbooks (tenant_id, user_id, title, slug, page_count, status, workflow_status, visibility, version, conversion_progress, conversion_step, published_at)
                     VALUES (?, ?, ?, ?, ?, "ready", "published", "public", 1, 100, "Completed", NOW())',
                    [$tenantId, $u['id'], $doc['title'], $slug, count($pages)]
                );
                $flipbookId = (int) Db::pdo()->lastInsertId();
                Db::run('UPDATE studio_documents SET flipbook_id = ? WHERE id = ?', [$flipbookId, $docId]);
            }

            // Compile canvas elements into reader pages and interactive hotspots
            foreach ($pages as $p) {
                $pageNum = (int) $p['page_number'];
                $elements = $p['elements'] ? json_decode($p['elements'], true) : [];
                $bg = $p['background'] ? json_decode($p['background'], true) : null;

                // Render the page server-side into a self-contained SVG file under the tenant's publication folder.
                // (Storing data: URIs in pages.image_path overflowed the VARCHAR(255) column and broke publishing.)
                $svg = StudioSvgRenderer::renderPage(
                    ['background' => $bg, 'elements' => $elements],
                    (float) $doc['width_pt'],
                    (float) $doc['height_pt'],
                    $tenantId,
                    $pageNum
                );
                if (!SvgSafety::isSafe($svg)) {
                    throw new \RuntimeException('Page ' . $pageNum . ' could not be rendered safely');
                }
                $relDir = "tenants/{$tenantId}/publications/{$flipbookId}/studio";
                Storage::ensureDir(Storage::root() . '/' . $relDir);
                $relFile = sprintf('%s/page-%03d-%s.svg', $relDir, $pageNum, substr(hash('sha256', $svg), 0, 10));
                if (@file_put_contents(Storage::root() . '/' . $relFile, $svg, LOCK_EX) === false) {
                    throw new \RuntimeException('Could not store rendered page ' . $pageNum);
                }
                @chmod(Storage::root() . '/' . $relFile, 0640);
                $writtenFiles[] = $relFile;
                $thumbUrl = $relFile;

                // Extract text content for full-text search
                $texts = [];
                foreach ($elements as $el) {
                    if (!empty($el['content'])) {
                        $texts[] = (string) $el['content'];
                    }
                    if (!empty($el['name'])) {
                        $texts[] = (string) $el['name'];
                    }
                    if (!empty($el['description'])) {
                        $texts[] = (string) $el['description'];
                    }
                }
                $textContent = implode(' ', $texts);

                Db::run(
                    'INSERT INTO pages (flipbook_id, page_number, image_path, high_res_path, webp_path, thumb_path, width, height, text_content)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [$flipbookId, $pageNum, $thumbUrl, $thumbUrl, $thumbUrl, $thumbUrl, (int) $doc['width_pt'], (int) $doc['height_pt'], $textContent]
                );

                // Compile interactive product cards, WhatsApp buttons & links into normalized reader hotspots (0-100%)
                $docW = max(1.0, (float) ($doc['width_pt'] ?? 595.28));
                $docH = max(1.0, (float) ($doc['height_pt'] ?? 841.89));

                foreach ($elements as $el) {
                    $type = $el['type'] ?? 'generic';
                    $rawX = (float) ($el['x'] ?? 0);
                    $rawY = (float) ($el['y'] ?? 0);
                    $rawW = max(10.0, (float) ($el['w'] ?? 100));
                    $rawH = max(10.0, (float) ($el['h'] ?? 100));

                    $normX = max(0.0, min(100.0, round(($rawX / $docW) * 100, 2)));
                    $normY = max(0.0, min(100.0, round(($rawY / $docH) * 100, 2)));
                    $normW = max(1.0, min(100.0, round(($rawW / $docW) * 100, 2)));
                    $normH = max(1.0, min(100.0, round(($rawH / $docH) * 100, 2)));

                    if ($type === 'product' || $type === 'productCard') {
                        $waNum = !empty($el['whatsappNumber']) ? preg_replace('/[^0-9]/', '', (string) $el['whatsappNumber']) : null;
                        $waUrl = $waNum ? 'https://wa.me/' . $waNum . '?text=' . urlencode('Bula! I would like to order: ' . ($el['name'] ?? 'Product') . ' (' . ($el['price'] ?? '') . ') SKU: ' . ($el['sku'] ?? 'N/A')) : null;
                        $prodImg = $el['image'] ?? ($el['url'] ?? ($el['src'] ?? ($el['assetRef']['url'] ?? null)));

                        $payload = json_encode([
                            'title' => $el['name'] ?? 'Product',
                            'product_name' => $el['name'] ?? 'Product',
                            'price' => $el['price'] ?? '',
                            'original_price' => $el['originalPrice'] ?? null,
                            'badge' => $el['badge'] ?? null,
                            'sku' => $el['sku'] ?? '',
                            'whatsapp_number' => $el['whatsappNumber'] ?? null,
                            'whatsappPhone' => $el['whatsappNumber'] ?? null,
                            'whatsapp_url' => $waUrl,
                            'url' => $waUrl ?? SvgSafety::safeLinkUrl($el['linkUrl'] ?? ''),
                            'imageUrl' => $prodImg,
                            'image' => $prodImg,
                            'description' => $el['description'] ?? '',
                            'rating' => $el['rating'] ?? 5,
                            'stock_status' => $el['stockStatus'] ?? 'in_stock',
                        ]);
                        Db::run(
                            'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                             VALUES (?, ?, "product", ?, ?, ?, ?, ?)',
                            [$flipbookId, $pageNum, $normX, $normY, $normW, $normH, $payload]
                        );
                    } elseif ($type === 'studentCard') {
                        $studentImg = $el['image'] ?? ($el['src'] ?? ($el['photoUrl'] ?? ($el['url'] ?? ($el['assetRef']['url'] ?? null))));
                        $payload = json_encode([
                            'title' => $el['name'] ?? 'Student Profile',
                            'name' => $el['name'] ?? 'Student',
                            'award' => $el['award'] ?? '',
                            'class_year' => $el['classYear'] ?? '',
                            'quote' => $el['quote'] ?? ($el['description'] ?? ''),
                            'imageUrl' => $studentImg,
                            'image' => $studentImg,
                            'url' => SvgSafety::safeLinkUrl($el['linkUrl'] ?? ''),
                        ]);
                        Db::run(
                            'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                             VALUES (?, ?, "link", ?, ?, ?, ?, ?)',
                            [$flipbookId, $pageNum, $normX, $normY, $normW, $normH, $payload]
                        );
                    } elseif ($type === 'whatsapp') {
                        $waNum = !empty($el['whatsappNumber']) ? preg_replace('/[^0-9]/', '', (string) $el['whatsappNumber']) : '6799991234';
                        $waUrl = 'https://wa.me/' . $waNum . '?text=' . urlencode('Bula! Inquiring from ' . ($doc['title'] ?? 'Catalogue') . ' (Page ' . $pageNum . ')');
                        $payload = json_encode([
                            'title' => $el['content'] ?? 'Chat & Order on WhatsApp',
                            'whatsapp_number' => $waNum,
                            'url' => $waUrl,
                        ]);
                        Db::run(
                            'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                             VALUES (?, ?, "link", ?, ?, ?, ?, ?)',
                            [$flipbookId, $pageNum, $normX, $normY, $normW, $normH, $payload]
                        );
                    } elseif ($type === 'toc') {
                        $tocItems = $el['tocItems'] ?? [];
                        if (is_array($tocItems) && !empty($tocItems)) {
                            $itemCount = count($tocItems);
                            $rowHeight = $itemCount > 0 ? ($normH / max(1, $itemCount)) : 0;
                            foreach ($tocItems as $idx => $tItem) {
                                $targetPage = (int) ($tItem['page_number'] ?? 1);
                                $tItemY = $normY + ($idx * $rowHeight);
                                $payload = json_encode([
                                    'title' => $tItem['title'] ?? ('Page ' . $targetPage),
                                    'targetPage' => $targetPage,
                                ]);
                                Db::run(
                                    'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                                     VALUES (?, ?, "page", ?, ?, ?, ?, ?)',
                                    [$flipbookId, $pageNum, $normX, $tItemY, $normW, $rowHeight, $payload]
                                );
                            }
                        }
                    } elseif (($type === 'link' || !empty($el['linkUrl'])) && SvgSafety::safeLinkUrl($el['linkUrl'] ?? '') !== null) {
                        $payload = json_encode(['url' => SvgSafety::safeLinkUrl($el['linkUrl'])]);
                        Db::run(
                            'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                             VALUES (?, ?, "link", ?, ?, ?, ?, ?)',
                            [$flipbookId, $pageNum, $normX, $normY, $normW, $normH, $payload]
                        );
                    }
                }
            }

            // Update document status
            Db::run('UPDATE studio_documents SET status = "published", updated_at = NOW() WHERE id = ?', [$docId]);

            // Record publication history
            Db::run(
                'INSERT INTO studio_publications (document_id, flipbook_id, version, status)
                 VALUES (?, ?, 1, "completed")',
                [$docId, $flipbookId]
            );

            Db::pdo()->commit();

            // Drop page files from earlier publishes that are no longer referenced.
            foreach (glob(Storage::root() . "/tenants/{$tenantId}/publications/{$flipbookId}/studio/page-*.svg") ?: [] as $old) {
                if (!in_array(substr($old, strlen(Storage::root()) + 1), $writtenFiles, true)) {
                    @unlink($old);
                }
            }

            try {
                Audit::log('studio_document.publish', 'flipbook', $flipbookId, ['document_id' => $docId]);
            } catch (\Throwable $ae) {
                error_log('Audit log error on studio_document.publish: ' . $ae->getMessage());
            }

            $fb = Db::one('SELECT slug FROM flipbooks WHERE id = ? AND tenant_id = ?', [$flipbookId, $tenantId]);
            $effectiveSlug = $fb['slug'] ?? $slug;

            return Http::json($res, [
                'ok' => true,
                'flipbook_id' => $flipbookId,
                'slug' => $effectiveSlug,
                'public_url' => '/v/' . $effectiveSlug,
                'viewer_url' => '/v/' . $effectiveSlug,
                'preview_url' => '/dashboard/preview/' . $flipbookId,
                'message' => 'Published successfully as an interactive flipbook!'
            ]);
        } catch (\Throwable $e) {
            if (Db::pdo()->inTransaction()) {
                Db::pdo()->rollBack();
            }
            foreach ($writtenFiles as $wf) {
                @unlink(Storage::root() . '/' . $wf);
            }
            error_log('Studio publish failed: ' . $e->getMessage());
            return Http::error($res, 'Publishing failed. Please try again or contact support.', 500);
        }
    }

    /**
     * GET /studio/documents/{id}/toc: Scan pages and auto-generate Table of Contents structure.
     */
    public function generateToc(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.view');

        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $pages = Db::all('SELECT page_number, elements FROM studio_document_pages WHERE document_id = ? ORDER BY page_number ASC', [$docId]);
        $toc = [];

        foreach ($pages as $p) {
            $pageNum = (int) $p['page_number'];
            $elements = $p['elements'] ? json_decode($p['elements'], true) : [];

            $foundHeading = null;
            $foundSub = null;

            foreach ($elements as $el) {
                $type = $el['type'] ?? '';
                if ($type === 'toc') {
                    continue; // Do not index the Table of Contents element itself
                }

                $fontSize = (int) ($el['style']['fontSize'] ?? 14);
                $content = trim((string) ($el['headline'] ?? ($el['content'] ?? '')));

                if ($content !== '' && ($type === 'text' || $type === 'column_text' || $type === 'article' || $type === 'richText')) {
                    $firstLine = trim(explode("\n", $content)[0]);
                    if ($fontSize >= 18 && $foundHeading === null) {
                        $foundHeading = !empty($el['kicker']) ? ($el['kicker'] . ': ' . $firstLine) : $firstLine;
                        if (!empty($el['subtitle'])) {
                            $foundSub = (string) $el['subtitle'];
                        }
                    } elseif ($fontSize >= 14 && $foundSub === null && $foundHeading !== null) {
                        $foundSub = $firstLine;
                    } elseif ($foundHeading === null) {
                        $foundHeading = $firstLine;
                    }
                } elseif (($type === 'product' || $type === 'productCard') && $foundHeading === null && !empty($el['name'])) {
                    $foundHeading = (string) $el['name'];
                    $foundSub = !empty($el['price']) ? (string) $el['price'] : null;
                } elseif ($type === 'studentCard' && $foundHeading === null && !empty($el['name'])) {
                    $foundHeading = 'Profile: ' . (string) $el['name'];
                    $foundSub = !empty($el['award']) ? (string) $el['award'] : (!empty($el['classYear']) ? (string) $el['classYear'] : null);
                }
            }

            if ($foundHeading !== null) {
                $toc[] = [
                    'page_number' => $pageNum,
                    'title' => $foundHeading,
                    'subtitle' => $foundSub,
                ];
            }
        }

        return Http::json($res, [
            'ok' => true,
            'document_title' => $doc['title'],
            'toc' => $toc
        ]);
    }

    /**
     * GET /studio/documents/{id}/export-pdf: Standalone printable HTML vector shell with print media CSS.
     */
    public function exportPdf(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.view');

        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $pages = Db::all('SELECT * FROM studio_document_pages WHERE document_id = ? ORDER BY page_number ASC', [$docId]);
        $widthPt = (float) $doc['width_pt'];
        $heightPt = (float) $doc['height_pt'];
        $bleedPt = (float) ($doc['bleed_pt'] ?? 9.0);

        $params = $req->getQueryParams();
        $autoPrint = isset($params['print']) && $params['print'] === '1';

        $html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
        $html .= '<title>' . htmlspecialchars($doc['title']) . ' - Print Ready Document</title>';
        $html .= '<style>
            @page {
                size: ' . $widthPt . 'pt ' . $heightPt . 'pt;
                margin: 0;
            }
            * { box-sizing: border-box; }
            body {
                margin: 0;
                padding: 0;
                background-color: #525659;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .page-container {
                position: relative;
                width: ' . $widthPt . 'pt;
                height: ' . $heightPt . 'pt;
                margin: 20px auto;
                background-color: #ffffff;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                page-break-after: always;
                page-break-inside: avoid;
                overflow: hidden;
            }
            @media print {
                body { background: transparent; }
                .page-container { margin: 0; box-shadow: none; }
                .no-print { display: none !important; }
            }
            .bleed-guide {
                position: absolute;
                top: ' . $bleedPt . 'pt;
                left: ' . $bleedPt . 'pt;
                right: ' . $bleedPt . 'pt;
                bottom: ' . $bleedPt . 'pt;
                border: 0.5pt dashed rgba(236, 72, 153, 0.5);
                pointer-events: none;
            }
            .print-controls {
                position: fixed;
                top: 15px;
                right: 20px;
                z-index: 9999;
                background: rgba(15, 23, 42, 0.9);
                backdrop-filter: blur(8px);
                padding: 10px 18px;
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.1);
                color: #fff;
                display: flex;
                align-items: center;
                gap: 12px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            }
            .print-btn {
                background: #6366f1;
                color: #fff;
                border: none;
                padding: 8px 16px;
                border-radius: 8px;
                font-weight: bold;
                font-size: 13px;
                cursor: pointer;
            }
            .print-btn:hover { background: #4f46e5; }
        </style>';
        $html .= '</head><body>';

        $html .= '<div class="print-controls no-print">
            <span style="font-size: 13px; font-weight: 600;">' . htmlspecialchars($doc['title']) . ' (' . count($pages) . ' Pages)</span>
            <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
        </div>';

        foreach ($pages as $p) {
            $pageNum = (int) $p['page_number'];
            $bg = $p['background'] ? json_decode($p['background'], true) : null;
            $elements = $p['elements'] ? json_decode($p['elements'], true) : [];
            $bgColor = $bg['value'] ?? '#ffffff';

            $html .= '<div class="page-container" style="background: ' . htmlspecialchars($bgColor) . ';">';

            foreach ($elements as $el) {
                $type = $el['type'] ?? 'generic';
                $x = (float) ($el['x'] ?? 0);
                $y = (float) ($el['y'] ?? 0);
                $w = (float) ($el['w'] ?? 100);
                $h = (float) ($el['h'] ?? 50);

                $style = $el['style'] ?? [];
                $css = 'position: absolute; left: ' . $x . 'px; top: ' . $y . 'px; width: ' . $w . 'px; height: ' . $h . 'px; overflow: hidden;';

                if (!empty($style['fontSize'])) $css .= 'font-size: ' . (int)$style['fontSize'] . 'px;';
                if (!empty($style['fontWeight'])) $css .= 'font-weight: ' . htmlspecialchars((string)$style['fontWeight']) . ';';
                if (!empty($style['fontStyle'])) $css .= 'font-style: ' . htmlspecialchars((string)$style['fontStyle']) . ';';
                if (!empty($style['color'])) $css .= 'color: ' . htmlspecialchars((string)$style['color']) . ';';
                if (!empty($style['backgroundColor'])) $css .= 'background-color: ' . htmlspecialchars((string)$style['backgroundColor']) . ';';
                if (!empty($style['textAlign'])) $css .= 'text-align: ' . htmlspecialchars((string)$style['textAlign']) . ';';
                if (!empty($style['borderRadius'])) $css .= 'border-radius: ' . (int)$style['borderRadius'] . 'px;';
                if (!empty($style['letterSpacing'])) $css .= 'letter-spacing: ' . htmlspecialchars((string)$style['letterSpacing']) . ';';
                if (!empty($style['lineHeight'])) $css .= 'line-height: ' . (float)$style['lineHeight'] . ';';

                if ($type === 'text') {
                    $html .= '<div style="' . $css . '">' . nl2br(htmlspecialchars((string)($el['content'] ?? ''))) . '</div>';
                } elseif ($type === 'image') {
                    $src = htmlspecialchars((string)($el['src'] ?? ''));
                    $html .= '<div style="' . $css . '"><img src="' . $src . '" style="width:100%;height:100%;object-fit:cover;" /></div>';
                } elseif ($type === 'product') {
                    $html .= '<div style="' . $css . ' background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:10px; display:flex; flex-direction:column; justify-content:space-between;">';
                    if (!empty($el['image'])) {
                        $html .= '<img src="' . htmlspecialchars((string)$el['image']) . '" style="height:60%;width:100%;object-fit:cover;border-radius:8px;" />';
                    }
                    $html .= '<div><strong style="font-size:12px;color:#1e293b;">' . htmlspecialchars((string)($el['name'] ?? '')) . '</strong>';
                    $html .= '<div style="font-size:14px;color:#dc2626;font-weight:bold;margin-top:4px;">' . htmlspecialchars((string)($el['price'] ?? '')) . '</div></div>';
                    $html .= '<div style="background:#16a34a;color:#fff;text-align:center;font-size:10px;font-weight:bold;padding:4px;border-radius:6px;">WhatsApp Order</div>';
                    $html .= '</div>';
                } elseif ($type === 'badge' || $type === 'whatsapp') {
                    $html .= '<div style="' . $css . ' display:flex; align-items:center; justify-content:center;">' . htmlspecialchars((string)($el['content'] ?? '')) . '</div>';
                } else {
                    $html .= '<div style="' . $css . '">' . htmlspecialchars((string)($el['content'] ?? '')) . '</div>';
                }
            }

            $html .= '</div>';
        }

        if ($autoPrint) {
            $html .= '<script>window.onload = function() { window.print(); };</script>';
        }

        $html .= '</body></html>';

        $res->getBody()->write($html);
        return $res->withHeader('Content-Type', 'text/html; charset=utf-8');
    }

    /**
     * POST /studio/documents/{id}/autosave: Atomic document-wide save with revision increment.
     */
    public function autosaveDocument(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $body = (array) $req->getParsedBody();
        $title = isset($body['title']) ? trim((string) $body['title']) : $doc['title'];
        if ($title === '' || mb_strlen($title) > 200) {
            return Http::error($res, 'Title must be 1-200 characters', 422);
        }
        $settings = isset($body['settings']) ? (is_string($body['settings']) ? $body['settings'] : json_encode($body['settings'])) : $doc['settings'];
        $palette = isset($body['palette']) ? (is_string($body['palette']) ? $body['palette'] : json_encode($body['palette'])) : $doc['palette'];
        $pages = isset($body['pages']) && is_array($body['pages']) ? $body['pages'] : null;
        if ($pages !== null && count($pages) > self::MAX_PAGES_PER_DOCUMENT) {
            return Http::error($res, 'A document can have at most ' . self::MAX_PAGES_PER_DOCUMENT . ' pages', 422);
        }
        $cleanPages = [];
        foreach ($pages ?? [] as $p) {
            if (!is_array($p)) {
                return Http::error($res, 'Each page must be an object', 422);
            }
            [$pBg, $e1] = $this->cleanBackground($p['background'] ?? null);
            [$pEl, $e2] = $this->cleanElements($p['elements'] ?? null);
            if ($e1 || $e2) {
                return Http::error($res, $e1 ?? $e2, 422);
            }
            $cleanPages[] = ['page_number' => max(1, (int) ($p['page_number'] ?? 1)), 'bg' => $pBg, 'el' => $pEl, 'thumb' => $this->cleanThumb($p['thumbnail_url'] ?? '')];
        }

        $newRevision = ((int) ($doc['revision'] ?? 1)) + 1;

        Db::pdo()->beginTransaction();
        try {
            Db::run(
                'UPDATE studio_documents SET title = ?, settings = ?, palette = ?, revision = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
                [$title, $settings, $palette, $newRevision, $docId, $tenantId]
            );

            if ($pages !== null) {
                foreach ($cleanPages as $p) {
                    $pNum = $p['page_number'];
                    $pBg = $p['bg'];
                    $pEl = $p['el'];
                    $pThumb = $p['thumb'];

                    $existingPage = Db::one('SELECT id FROM studio_document_pages WHERE document_id = ? AND page_number = ?', [$docId, $pNum]);
                    if ($existingPage) {
                        Db::run(
                            'UPDATE studio_document_pages SET background = ?, elements = ?, thumbnail_url = IFNULL(?, thumbnail_url), updated_at = NOW() WHERE id = ?',
                            [$pBg, $pEl, $pThumb, $existingPage['id']]
                        );
                    } else {
                        Db::run(
                            'INSERT INTO studio_document_pages (document_id, page_number, background, elements, thumbnail_url) VALUES (?, ?, ?, ?, ?)',
                            [$docId, $pNum, $pBg, $pEl, $pThumb]
                        );
                    }
                }
                Db::run('UPDATE studio_documents SET page_count = (SELECT COUNT(*) FROM studio_document_pages WHERE document_id = ?) WHERE id = ?', [$docId, $docId]);
            }

            // Snapshot revision
            $docSpec = json_encode([
                'title' => $title,
                'revision' => $newRevision,
                'pages' => $pages,
                'settings' => $body['settings'] ?? null,
                'palette' => $body['palette'] ?? null,
            ]);
            Db::run(
                'INSERT INTO studio_document_revisions (document_id, revision_number, title, document_spec, created_by) VALUES (?, ?, ?, ?, ?)',
                [$docId, $newRevision, $title, $docSpec, $u['id'] ?? null]
            );

            Db::pdo()->commit();
            $this->pruneRevisions($docId);

            return Http::json($res, [
                'ok' => true,
                'revision' => $newRevision,
                'updated_at' => date('Y-m-d H:i:s'),
                'message' => 'Autosave successful'
            ]);
        } catch (\Throwable $e) {
            if (Db::pdo()->inTransaction()) {
                Db::pdo()->rollBack();
            }
            error_log('Studio autosave failed: ' . $e->getMessage());
            return Http::error($res, 'Autosave failed. Your changes are still in this browser; try again.', 500);
        }
    }

    /**
     * GET /studio/documents/{id}/revisions: List document version history.
     */
    public function getRevisions(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT id FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $revisions = Db::all(
            'SELECT id, revision_number, title, created_at FROM studio_document_revisions WHERE document_id = ? ORDER BY revision_number DESC LIMIT 30',
            [$docId]
        );

        return Http::json($res, ['ok' => true, 'revisions' => $revisions]);
    }

    /**
     * POST /studio/export/queue: Queue an asynchronous background PDF/print rendering job.
     */
    public function queueExportJob(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = $this->resolveTenantId($u);
        $body = (array) $req->getParsedBody();
        $docId = (int) ($body['document_id'] ?? 0);
        $exportType = trim((string) ($body['export_type'] ?? 'print_pdf'));

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        Db::run(
            'INSERT INTO studio_export_jobs (tenant_id, document_id, export_type, status, progress_percent, download_url)
             VALUES (?, ?, ?, "completed", 100, ?)',
            [$tenantId, $docId, $exportType, '/api/studio/documents/' . $docId . '/export-pdf?print=1']
        );
        $jobId = (int) Db::pdo()->lastInsertId();

        return Http::json($res, [
            'ok' => true,
            'job_id' => $jobId,
            'status' => 'completed',
            'progress_percent' => 100,
            'download_url' => '/api/studio/documents/' . $docId . '/export-pdf?print=1',
            'message' => 'Export job ready for download'
        ], 201);
    }

    /**
     * GET /studio/export/status/{jobId}: Poll status of asynchronous background export job.
     */
    public function getExportStatus(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = $this->resolveTenantId($u);
        $jobId = (int) ($args['jobId'] ?? 0);

        $job = Db::one('SELECT * FROM studio_export_jobs WHERE id = ? AND tenant_id = ?', [$jobId, $tenantId]);
        if (!$job) {
            return Http::error($res, 'Export job not found', 404);
        }

        return Http::json($res, ['ok' => true, 'job' => $job]);
    }

    /**
     * POST /studio/documents/{id}/data-sync: Bulk sync product prices, badges, and inventory from CSV or external data feed.
     */
    public function syncDataFeed(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $items = (array) ($b['items'] ?? []);
        $matchBy = strtolower((string) ($b['matchBy'] ?? 'sku')); // 'sku', 'name', 'id'
        $scope = strtolower((string) ($b['scope'] ?? 'all')); // 'all', 'page'
        $targetPageNum = isset($b['pageNumber']) ? (int) $b['pageNumber'] : null;

        if (empty($items)) {
            return Http::error($res, 'No data items provided for synchronization', 400);
        }

        // Build lookup map by key
        $lookup = [];
        foreach ($items as $item) {
            $key = '';
            if ($matchBy === 'sku' && !empty($item['sku'])) {
                $key = strtolower(trim((string) $item['sku']));
            } elseif ($matchBy === 'name' && !empty($item['name'])) {
                $key = strtolower(trim((string) $item['name']));
            } elseif ($matchBy === 'id' && !empty($item['id'])) {
                $key = (string) $item['id'];
            }
            if ($key !== '') {
                $lookup[$key] = $item;
            }
        }

        $pageQuery = 'SELECT * FROM studio_document_pages WHERE document_id = ?';
        $params = [$docId];
        if ($scope === 'page' && $targetPageNum !== null) {
            $pageQuery .= ' AND page_number = ?';
            $params[] = $targetPageNum;
        }
        $pageQuery .= ' ORDER BY page_number ASC';
        $pages = Db::all($pageQuery, $params);

        $matchedCount = 0;
        $updatedPages = [];
        $updatedSkus = [];

        Db::pdo()->beginTransaction();
        try {
            foreach ($pages as $p) {
                $elements = $p['elements'] ? json_decode($p['elements'], true) : [];
                $dirty = false;

                foreach ($elements as &$el) {
                    $key = '';
                    if ($matchBy === 'sku' && !empty($el['sku'])) {
                        $key = strtolower(trim((string) $el['sku']));
                    } elseif ($matchBy === 'name' && !empty($el['name'])) {
                        $key = strtolower(trim((string) $el['name']));
                    } elseif ($matchBy === 'id' && !empty($el['id'])) {
                        $key = (string) $el['id'];
                    }

                    if ($key !== '' && isset($lookup[$key])) {
                        $item = $lookup[$key];
                        $matchedCount++;
                        $dirty = true;
                        if (!empty($el['sku'])) {
                            $updatedSkus[] = (string) $el['sku'];
                        }

                        if (isset($item['price'])) {
                            $el['price'] = (string) $item['price'];
                        }
                        if (isset($item['originalPrice'])) {
                            $el['originalPrice'] = (string) $item['originalPrice'];
                        }
                        if (isset($item['badge'])) {
                            $el['badge'] = (string) $item['badge'];
                        }
                        if (isset($item['stockStatus'])) {
                            $el['stockStatus'] = (string) $item['stockStatus'];
                        }
                        if (isset($item['image']) && !empty($item['image'])) {
                            // Ensure no inline base64
                            if (!str_starts_with($item['image'], 'data:image')) {
                                $el['image'] = (string) $item['image'];
                                $el['src'] = (string) $item['image'];
                            }
                        }
                        if (isset($item['description'])) {
                            $el['description'] = (string) $item['description'];
                        }

                        // Re-generate WhatsApp order link if phone present
                        if (!empty($el['whatsappNumber'])) {
                            $pName = $el['name'] ?? 'Product';
                            $pPrice = $el['price'] ?? '';
                            $pSku = $el['sku'] ?? '';
                            $orderMsg = rawurlencode("Hi! I would like to order: {$pName}" . ($pPrice ? " ({$pPrice})" : "") . ($pSku ? " SKU: {$pSku}" : ""));
                            $cleanPhone = preg_replace('/[^0-9]/', '', (string) $el['whatsappNumber']);
                            $el['whatsappLink'] = "https://wa.me/{$cleanPhone}?text={$orderMsg}";
                        }
                    }
                }
                unset($el);

                if ($dirty) {
                    Db::run('UPDATE studio_document_pages SET elements = ?, updated_at = NOW() WHERE id = ?', [
                        json_encode($elements, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                        $p['id']
                    ]);
                    $updatedPages[] = (int) $p['page_number'];
                }
            }

            Db::run('UPDATE studio_documents SET updated_at = NOW() WHERE id = ?', [$docId]);
            Db::pdo()->commit();

            try {
                Audit::log('studio_document.data_sync', 'studio_document', $docId, [
                    'matched_count' => $matchedCount,
                    'pages_count' => count($updatedPages),
                    'match_by' => $matchBy
                ]);
            } catch (\Throwable) {}

            return Http::json($res, [
                'ok' => true,
                'matched_count' => $matchedCount,
                'pages_updated' => count($updatedPages),
                'updated_pages' => array_values(array_unique($updatedPages)),
                'updated_skus' => array_values(array_unique($updatedSkus)),
                'message' => "Successfully synchronized {$matchedCount} item(s) across " . count($updatedPages) . " page(s)."
            ]);
        } catch (\Throwable $e) {
            if (Db::pdo()->inTransaction()) {
                Db::pdo()->rollBack();
            }
            return Http::error($res, 'Data sync failed', 500);
        }
    }

    /**
     * POST /studio/documents/{id}/currency-convert: Batch convert product prices to Pacific regional currencies.
     */
    public function convertCurrency(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = $this->resolveTenantId($u);
        $docId = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $targetCurrency = strtoupper(trim((string) ($b['targetCurrency'] ?? 'FJD')));
        $rate = isset($b['exchangeRate']) ? (float) $b['exchangeRate'] : 1.0;
        $round = (string) ($b['roundTo'] ?? 'none'); // 'none', '99c', 'dollar'

        // Pacific currency definitions
        $currencies = [
            'FJD' => ['prefix' => '$', 'suffix' => ' FJD', 'decimals' => 2],
            'AUD' => ['prefix' => '$', 'suffix' => ' AUD', 'decimals' => 2],
            'NZD' => ['prefix' => '$', 'suffix' => ' NZD', 'decimals' => 2],
            'USD' => ['prefix' => '$', 'suffix' => ' USD', 'decimals' => 2],
            'PGK' => ['prefix' => 'K', 'suffix' => '', 'decimals' => 2],
            'SBD' => ['prefix' => 'SI$', 'suffix' => '', 'decimals' => 2],
            'TOP' => ['prefix' => 'T$', 'suffix' => '', 'decimals' => 2],
            'WST' => ['prefix' => 'WS$', 'suffix' => '', 'decimals' => 2],
            'VUV' => ['prefix' => '', 'suffix' => ' VT', 'decimals' => 0], // Vatu has no subdivisions
        ];

        if (!isset($currencies[$targetCurrency])) {
            return Http::error($res, 'Unsupported Pacific currency: ' . $targetCurrency, 422);
        }

        $cConfig = $currencies[$targetCurrency];
        $pages = Db::all('SELECT * FROM studio_document_pages WHERE document_id = ? ORDER BY page_number ASC', [$docId]);

        $updatedCount = 0;
        $updatedPages = [];

        Db::pdo()->beginTransaction();
        try {
            foreach ($pages as $p) {
                $elements = $p['elements'] ? json_decode($p['elements'], true) : [];
                $dirty = false;

                foreach ($elements as &$el) {
                    if (in_array($el['type'] ?? '', ['product', 'productCard'], true)) {
                        $rawPrice = $el['price'] ?? '';
                        // Extract numeric value
                        if (preg_match('/([0-9]+(?:\.[0-9]+)?)/', str_replace(',', '', (string) $rawPrice), $m)) {
                            $val = (float) $m[1];
                            $converted = $val * $rate;
                            if ($cConfig['decimals'] === 0) {
                                $converted = (float) round($converted);
                                $formatted = number_format($converted, 0) . $cConfig['suffix'];
                            } else {
                                if ($round === '99c') {
                                    $converted = floor($converted) + 0.99;
                                } elseif ($round === 'dollar') {
                                    $converted = (float) round($converted);
                                }
                                $formatted = $cConfig['prefix'] . number_format($converted, $cConfig['decimals']) . $cConfig['suffix'];
                            }
                            $el['price'] = $formatted;
                            $el['currency'] = $targetCurrency;
                            $dirty = true;
                            $updatedCount++;

                            // Also convert original price if present
                            if (!empty($el['originalPrice']) && preg_match('/([0-9]+(?:\.[0-9]+)?)/', str_replace(',', '', (string) $el['originalPrice']), $om)) {
                                $oVal = (float) $om[1] * $rate;
                                if ($cConfig['decimals'] === 0) {
                                    $el['originalPrice'] = number_format(round($oVal), 0) . $cConfig['suffix'];
                                } else {
                                    if ($round === '99c') {
                                        $oVal = floor($oVal) + 0.99;
                                    } elseif ($round === 'dollar') {
                                        $oVal = (float) round($oVal);
                                    }
                                    $el['originalPrice'] = $cConfig['prefix'] . number_format($oVal, $cConfig['decimals']) . $cConfig['suffix'];
                                }
                            }

                            // Re-calculate WhatsApp order link
                            if (!empty($el['whatsappNumber'])) {
                                $pName = $el['name'] ?? 'Product';
                                $pPrice = $el['price'] ?? '';
                                $pSku = $el['sku'] ?? '';
                                $orderMsg = rawurlencode("Hi! I would like to order: {$pName}" . ($pPrice ? " ({$pPrice})" : "") . ($pSku ? " SKU: {$pSku}" : ""));
                                $cleanPhone = preg_replace('/[^0-9]/', '', (string) $el['whatsappNumber']);
                                $el['whatsappLink'] = "https://wa.me/{$cleanPhone}?text={$orderMsg}";
                            }
                        }
                    }
                }
                unset($el);

                if ($dirty) {
                    Db::run('UPDATE studio_document_pages SET elements = ?, updated_at = NOW() WHERE id = ?', [
                        json_encode($elements, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                        $p['id']
                    ]);
                    $updatedPages[] = (int) $p['page_number'];
                }
            }

            Db::run('UPDATE studio_documents SET updated_at = NOW() WHERE id = ?', [$docId]);
            Db::pdo()->commit();

            return Http::json($res, [
                'ok' => true,
                'currency' => $targetCurrency,
                'updated_count' => $updatedCount,
                'pages_updated' => count($updatedPages),
                'message' => "Successfully converted {$updatedCount} product(s) to {$targetCurrency} across " . count($updatedPages) . " page(s)."
            ]);
        } catch (\Throwable $e) {
            if (Db::pdo()->inTransaction()) {
                Db::pdo()->rollBack();
            }
            return Http::error($res, 'Currency conversion failed', 500);
        }
    }
}
