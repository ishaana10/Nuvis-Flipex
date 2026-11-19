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
use App\Support\Storage;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class StudioController
{
    private static bool $schemaEnsured = false;

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
        return 1;
    }

    /**
     * Auto-ensure schema tables exist safely executing each table definition individually.
     */
    private function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
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

        $docType = trim((string) ($body['doc_type'] ?? 'catalogue'));
        if (!in_array($docType, ['catalogue', 'magazine', 'album', 'custom'], true)) {
            $docType = 'catalogue';
        }

        $width = isset($body['width_pt']) ? (float) $body['width_pt'] : 595.28; // A4 pt
        $height = isset($body['height_pt']) ? (float) $body['height_pt'] : 841.89;
        $orientation = in_array(($body['orientation'] ?? ''), ['portrait', 'landscape'], true) ? $body['orientation'] : 'portrait';
        $bleed = isset($body['bleed_pt']) ? (float) $body['bleed_pt'] : 9.00;

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
                 VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, "draft")',
                [$tenantId, $u['id'], $title, $docType, $width, $height, $orientation, $bleed, $palette, $settings]
            );
            $docId = (int) Db::pdo()->lastInsertId();

            if ($templateId !== null && $templateId > 0) {
                $tpl = Db::one('SELECT * FROM studio_templates WHERE id = ? AND (is_system = 1 OR tenant_id = ?)', [$templateId, $tenantId]);
                if ($tpl && !empty($tpl['canvas_spec'])) {
                    $spec = json_decode($tpl['canvas_spec'], true);
                    $pages = $spec['pages'] ?? [];
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
            return Http::error($res, 'Failed to create studio document: ' . $e->getMessage(), 500);
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

        $bg = isset($body['background']) ? json_encode($body['background']) : json_encode(['type' => 'color', 'value' => '#FFFFFF']);
        $elements = isset($body['elements']) ? json_encode($body['elements']) : '[]';

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
        $bg = isset($body['background']) ? json_encode($body['background']) : $page['background'];
        $elements = isset($body['elements']) ? json_encode($body['elements']) : $page['elements'];
        $thumb = isset($body['thumbnail_url']) ? trim((string) $body['thumbnail_url']) : $page['thumbnail_url'];

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
            return Http::error($res, 'Reorder failed: ' . $e->getMessage(), 500);
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
            $tpl['canvas_spec'] = json_decode($tpl['canvas_spec'], true);
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
        $tenantId = $this->resolveTenantId($u);
        $body = (array) ($req->getParsedBody() ?? []);

        $name = trim((string) ($body['name'] ?? ''));
        $description = trim((string) ($body['description'] ?? ''));
        $category = trim((string) ($body['category'] ?? 'business_corporate'));
        $documentId = (int) ($body['document_id'] ?? 0);
        $thumbnailUrl = trim((string) ($body['thumbnail_url'] ?? ''));

        if ($name === '') {
            return Http::json($res, ['error' => 'Template name is required'], 422);
        }

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
                : ($previewThumbs[0] ?? 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80');
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
     * DELETE /studio/templates/{id}: Delete a custom template owned by this tenant.
     */
    public function deleteTemplate(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
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

        $clientName = $file->getClientFilename() ?? 'asset.png';
        $mime = strtolower((string) ($file->getClientMediaType() ?? 'image/png'));
        $size = (int) $file->getSize();

        // Validate MIME type
        if (!in_array($mime, $allowedMimes, true)) {
            return Http::error($res, "Unsupported file format '{$mime}'. Supported formats: JPG, PNG, WebP, SVG.", 422);
        }

        // Validate Max File Size (15MB)
        if ($size > 15 * 1024 * 1024) {
            return Http::error($res, 'File size exceeds maximum allowed limit (15MB)', 422);
        }

        // Target directory: /storage/tenants/{id}/studio/
        $destDir = Storage::tenantDir($tenantId) . '/studio';
        Storage::ensureDir($destDir);

        $ext = pathinfo($clientName, PATHINFO_EXTENSION) ?: 'png';
        $filename = bin2hex(random_bytes(12)) . '.' . strtolower($ext);
        $fullPath = $destDir . '/' . $filename;

        $file->moveTo($fullPath);

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
        $library = [
            // Retail & Groceries
            ['id' => 'stock_ret_01', 'name' => 'Premium Island Rice 10kg', 'category' => 'retail', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 800, 'tags' => 'retail,groceries,rice,food,staple'],
            ['id' => 'stock_ret_02', 'name' => 'Fresh Yellow Island Bananas', 'category' => 'retail', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 800, 'tags' => 'retail,bananas,fruit,market,fresh'],
            ['id' => 'stock_ret_03', 'name' => 'Cold-Pressed Coconut & Island Oil', 'category' => 'retail', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 800, 'tags' => 'retail,oil,cooking,fmcg'],
            ['id' => 'stock_ret_04', 'name' => 'Organic Sweet Pineapples', 'category' => 'retail', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1550258987-190a2d41a8ba?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 800, 'tags' => 'retail,fruit,pineapple,market'],
            ['id' => 'stock_ret_05', 'name' => 'Vine-Ripened Field Tomatoes', 'category' => 'retail', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1546470427-e26264be0b11?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 800, 'tags' => 'retail,vegetables,tomatoes,fresh'],

            // Dining & Hospitality
            ['id' => 'stock_din_01', 'name' => 'Island Kokoda Ceviche Bowl', 'category' => 'dining', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 600, 'tags' => 'dining,seafood,kokoda,fiji,restaurant'],
            ['id' => 'stock_din_02', 'name' => 'Grilled Coral Rock Lobster Platter', 'category' => 'dining', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1533777857889-4be7c70b33f7?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 600, 'tags' => 'dining,lobster,seafood,fine dining'],
            ['id' => 'stock_din_03', 'name' => 'Pacific Sunset Tropical Rum Cocktail', 'category' => 'dining', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 800, 'tags' => 'dining,cocktail,drinks,bar,resort'],
            ['id' => 'stock_din_04', 'name' => 'Handcrafted Botanical Gin & Tonic', 'category' => 'dining', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 800, 'tags' => 'dining,cocktail,beverage,tonic'],

            // Technology & Gadgets
            ['id' => 'stock_tch_01', 'name' => 'ANC Wireless Headphones Pro', 'category' => 'tech', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 600, 'tags' => 'tech,audio,headphones,gadgets'],
            ['id' => 'stock_tch_02', 'name' => 'GPS Multisport Smartwatch', 'category' => 'tech', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 600, 'tags' => 'tech,smartwatch,wearables,fitness'],
            ['id' => 'stock_tch_03', 'name' => 'ProBook Laptop Ultra-Slim', 'category' => 'tech', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 600, 'tags' => 'tech,laptop,computer,workstation'],

            // Real Estate & Architecture
            ['id' => 'stock_re_01', 'name' => 'Denarau Island Luxury Waterfront Villa', 'category' => 'realestate', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 600, 'tags' => 'realestate,villa,luxury,denarau,waterfront'],
            ['id' => 'stock_re_02', 'name' => 'Tropical Pavilion Architecture Pool', 'category' => 'realestate', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 600, 'tags' => 'realestate,pool,architecture,residence'],

            // Scenery & Nature
            ['id' => 'stock_nat_01', 'name' => 'Pristine Barrier Reef Coral Lagoon', 'category' => 'nature', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 600, 'tags' => 'nature,ocean,coral,reef,diving,marine'],
            ['id' => 'stock_nat_02', 'name' => 'Turquoise Ocean Wave & White Sand Cay', 'category' => 'nature', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80', 'width' => 800, 'height' => 600, 'tags' => 'nature,beach,pacific,tropical,sand'],

            // Portraits & Yearbooks
            ['id' => 'stock_prt_01', 'name' => 'Female Student Academic Portrait', 'category' => 'people', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80', 'width' => 600, 'height' => 800, 'tags' => 'people,student,portrait,yearbook'],
            ['id' => 'stock_prt_02', 'name' => 'Male Student Graduate Portrait', 'category' => 'people', 'asset_type' => 'image', 'url' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80', 'width' => 600, 'height' => 800, 'tags' => 'people,graduate,portrait,student'],

            // Badges & Commercial Assets
            ['id' => 'stock_bdg_01', 'name' => 'Fiji Grown & Crafted Badge', 'category' => 'badges', 'asset_type' => 'badge', 'url' => 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80', 'width' => 400, 'height' => 400, 'tags' => 'badge,fiji made,seal,local,organic']
        ];

        return array_values(array_filter($library, function ($item) use ($category, $q) {
            if ($category !== '' && $category !== 'all' && ($item['category'] ?? '') !== $category) {
                return false;
            }
            if ($q !== '') {
                $needle = strtolower($q);
                $haystack = strtolower(($item['name'] ?? '') . ' ' . ($item['tags'] ?? ''));
                if (!str_contains($haystack, $needle)) {
                    return false;
                }
            }
            return true;
        }));
    }

    /**
     * POST /studio/documents/{id}/publish: Compile studio document to a live Flipbook.
     */
    public function publishDocument(Request $req, Response $res, array $args): Response
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
        $pageRenders = $body['page_renders'] ?? ($body['pageRenders'] ?? []);

        $pages = Db::all('SELECT * FROM studio_document_pages WHERE document_id = ? ORDER BY page_number ASC', [$docId]);
        if (empty($pages)) {
            return Http::error($res, 'Document must have at least one page to publish', 400);
        }

        Db::pdo()->beginTransaction();
        try {
            $flipbookId = $doc['flipbook_id'] ? (int) $doc['flipbook_id'] : null;
            $existingFb = $flipbookId ? Db::one('SELECT id, slug, published_at FROM flipbooks WHERE id = ?', [$flipbookId]) : null;
            $slug = !empty($existingFb['slug']) ? $existingFb['slug'] : ('doc-' . $docId . '-' . substr(bin2hex(random_bytes(4)), 0, 8));

            if ($flipbookId && $existingFb) {
                // Update existing flipbook
                Db::run(
                    'UPDATE flipbooks SET title = ?, page_count = ?, status = "ready", workflow_status = "published", visibility = "public", published_at = IFNULL(published_at, NOW()), updated_at = NOW()
                     WHERE id = ? AND tenant_id = ?',
                    [$doc['title'], count($pages), $flipbookId, $tenantId]
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

                $thumbUrl = '';
                if (!empty($pageRenders[$pageNum])) {
                    $thumbUrl = (string) $pageRenders[$pageNum];
                } elseif (!empty($pageRenders[(string) $pageNum])) {
                    $thumbUrl = (string) $pageRenders[(string) $pageNum];
                } elseif (!empty($p['thumbnail_url'])) {
                    $thumbUrl = (string) $p['thumbnail_url'];
                }

                if ($thumbUrl === '') {
                    // Extract first product or image element as preview image if present
                    foreach ($elements as $el) {
                        if (!empty($el['image'])) {
                            $thumbUrl = $el['image'];
                            break;
                        }
                        if (!empty($el['src'])) {
                            $thumbUrl = $el['src'];
                            break;
                        }
                    }
                }

                // If thumbnail is still empty, synthesize high-fidelity vector SVG composite
                if ($thumbUrl === '') {
                    $bgFill = '#ffffff';
                    if (!empty($bg['value'])) {
                        $bgFill = $bg['value'];
                    } elseif (!empty($bg['color'])) {
                        $bgFill = $bg['color'];
                    }
                    $isGrad = str_contains($bgFill, 'gradient');
                    $svgW = (int) ($doc['width_pt'] ?? 595);
                    $svgH = (int) ($doc['height_pt'] ?? 841);

                    $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' . $svgW . '" height="' . $svgH . '" viewBox="0 0 ' . $svgW . ' ' . $svgH . '">';
                    if ($isGrad) {
                        $svg .= '<defs><linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0f172a"/><stop offset="50%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#312e81"/></linearGradient></defs>';
                        $svg .= '<rect width="100%" height="100%" fill="url(#bgGrad)"/>';
                    } else {
                        $svg .= '<rect width="100%" height="100%" fill="' . htmlspecialchars($bgFill) . '"/>';
                    }
                    $svg .= '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" font-weight="bold" fill="#6366f1">Page ' . $pageNum . '</text>';
                    $svg .= '</svg>';
                    $thumbUrl = 'data:image/svg+xml;utf8,' . rawurlencode($svg);
                }

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
                            'url' => $waUrl ?? ($el['linkUrl'] ?? null),
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
                            'url' => $el['linkUrl'] ?? null,
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
                    } elseif ($type === 'link' || !empty($el['linkUrl'])) {
                        $payload = json_encode(['url' => $el['linkUrl'] ?? '']);
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

            try {
                Audit::log('studio_document.publish', 'flipbook', $flipbookId, ['document_id' => $docId]);
            } catch (\Throwable $ae) {
                error_log('Audit log error on studio_document.publish: ' . $ae->getMessage());
            }

            $fb = Db::one('SELECT slug FROM flipbooks WHERE id = ?', [$flipbookId]);
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
            return Http::error($res, 'Publishing failed: ' . $e->getMessage(), 500);
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
        $settings = isset($body['settings']) ? (is_string($body['settings']) ? $body['settings'] : json_encode($body['settings'])) : $doc['settings'];
        $palette = isset($body['palette']) ? (is_string($body['palette']) ? $body['palette'] : json_encode($body['palette'])) : $doc['palette'];
        $pages = isset($body['pages']) && is_array($body['pages']) ? $body['pages'] : null;

        $newRevision = ((int) ($doc['revision'] ?? 1)) + 1;

        Db::pdo()->beginTransaction();
        try {
            Db::run(
                'UPDATE studio_documents SET title = ?, settings = ?, palette = ?, revision = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
                [$title, $settings, $palette, $newRevision, $docId, $tenantId]
            );

            if ($pages !== null) {
                foreach ($pages as $p) {
                    $pNum = (int) ($p['page_number'] ?? 1);
                    $pBg = isset($p['background']) ? (is_string($p['background']) ? $p['background'] : json_encode($p['background'])) : null;
                    $pEl = isset($p['elements']) ? (is_string($p['elements']) ? $p['elements'] : json_encode($p['elements'])) : '[]';
                    $pThumb = !empty($p['thumbnail_url']) ? (string) $p['thumbnail_url'] : null;

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
                // Update page_count
                Db::run('UPDATE studio_documents SET page_count = ? WHERE id = ?', [count($pages), $docId]);
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
            return Http::error($res, 'Autosave failed: ' . $e->getMessage(), 500);
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
}
