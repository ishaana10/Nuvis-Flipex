<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\CryptoSecrets;
use App\Support\Db;
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
     * Auto-ensure schema tables exist.
     */
    private function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        Db::pdo()->exec("
            CREATE TABLE IF NOT EXISTS studio_documents (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS studio_document_pages (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS studio_templates (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS studio_assets (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS studio_publications (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              document_id BIGINT UNSIGNED NOT NULL,
              flipbook_id BIGINT UNSIGNED NOT NULL,
              version INT NOT NULL DEFAULT 1,
              rendered_pdf_url VARCHAR(500) NULL,
              status ENUM('generating', 'completed', 'failed') NOT NULL DEFAULT 'completed',
              created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_pub_doc (document_id),
              INDEX idx_pub_flipbook (flipbook_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        $this->seedDefaultTemplates();
        self::$schemaEnsured = true;
    }

    /**
     * Seeds rich curated studio templates if the template library is empty.
     */
    private function seedDefaultTemplates(): void
    {
        $count = (int) (Db::one('SELECT COUNT(*) as c FROM studio_templates')['c'] ?? 0);
        if ($count > 0) {
            return;
        }

        $templates = [
            [
                'category' => 'retail_catalogue',
                'doc_type' => 'catalogue',
                'name' => 'Pacific Supermarket Weekly Specials',
                'description' => 'High-conversion FMCG promotional catalogue with price splashes, discount badges, product grids, and 1-tap WhatsApp ordering.',
                'thumbnail_url' => 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=80',
                'canvas_spec' => json_encode([
                    'pages' => [
                        [
                            'background' => ['type' => 'color', 'value' => '#0F172A'],
                            'elements' => [
                                ['id' => 'h1', 'type' => 'text', 'x' => 40, 'y' => 50, 'w' => 515, 'h' => 60, 'content' => 'ISLAND HARVEST SUPERMARKET', 'style' => ['fontSize' => 32, 'fontWeight' => 'bold', 'color' => '#FBBF24', 'textAlign' => 'center', 'letterSpacing' => '2px']],
                                ['id' => 'sub1', 'type' => 'text', 'x' => 40, 'y' => 110, 'w' => 515, 'h' => 30, 'content' => 'WEEKLY FRESH DEALS & SPECIALS • VALID THIS WEEK ONLY', 'style' => ['fontSize' => 14, 'fontWeight' => '600', 'color' => '#E2E8F0', 'textAlign' => 'center']],
                                ['id' => 'p1', 'type' => 'product', 'x' => 50, 'y' => 160, 'w' => 230, 'h' => 300, 'name' => 'Punjas Premium Rice 10kg', 'price' => '$22.50', 'originalPrice' => '$26.00', 'badge' => 'SAVE $3.50', 'image' => 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=500&q=80', 'whatsappNumber' => '+6799991234', 'sku' => 'PUN-RC-10'],
                                ['id' => 'p2', 'type' => 'product', 'x' => 315, 'y' => 160, 'w' => 230, 'h' => 300, 'name' => 'Fiji Fresh Island Bananas (Bunch)', 'price' => '$5.99', 'originalPrice' => '$8.50', 'badge' => 'SPECIAL', 'image' => 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=500&q=80', 'whatsappNumber' => '+6799991234', 'sku' => 'BAN-FRESH'],
                                ['id' => 'p3', 'type' => 'product', 'x' => 50, 'y' => 480, 'w' => 230, 'h' => 290, 'name' => 'Pacific Sun Cooking Oil 2L', 'price' => '$11.95', 'originalPrice' => '$14.20', 'badge' => 'HOT DEAL', 'image' => 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=500&q=80', 'whatsappNumber' => '+6799991234', 'sku' => 'OIL-SUN-2L'],
                                ['id' => 'p4', 'type' => 'product', 'x' => 315, 'y' => 480, 'w' => 230, 'h' => 290, 'name' => 'Rewa Fresh Dairy Milk 1L x 6', 'price' => '$16.80', 'originalPrice' => '$19.50', 'badge' => 'BULK VALUE', 'image' => 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=500&q=80', 'whatsappNumber' => '+6799991234', 'sku' => 'REW-MLK-6'],
                            ]
                        ]
                    ]
                ]),
            ],
            [
                'category' => 'electronics_tech',
                'doc_type' => 'catalogue',
                'name' => 'TechPro Pacific Gadget Showcase',
                'description' => 'Modern tech lookbook with specifications table, warranty callouts, inquiry forms, and crisp dark mode styling.',
                'thumbnail_url' => 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
                'canvas_spec' => json_encode([
                    'pages' => [
                        [
                            'background' => ['type' => 'color', 'value' => '#090D16'],
                            'elements' => [
                                ['id' => 'logo1', 'type' => 'text', 'x' => 40, 'y' => 40, 'w' => 200, 'h' => 30, 'content' => '⚡ TECHPRO PACIFIC', 'style' => ['fontSize' => 18, 'fontWeight' => 'bold', 'color' => '#38BDF8']],
                                ['id' => 't1', 'type' => 'text', 'x' => 40, 'y' => 80, 'w' => 515, 'h' => 50, 'content' => 'Next-Gen Audio & Mobile Devices', 'style' => ['fontSize' => 28, 'fontWeight' => '800', 'color' => '#F8FAFC']],
                                ['id' => 'prod1', 'type' => 'product', 'x' => 40, 'y' => 150, 'w' => 515, 'h' => 320, 'name' => 'Wireless Noise-Canceling ANC Headphones Pro', 'price' => '$299.00', 'originalPrice' => '$349.00', 'badge' => 'BEST SELLER', 'image' => 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80', 'sku' => 'ANC-9000-BLK', 'description' => '40hr battery life, spatial audio, dual-mic noise suppression, Fiji 12-month local warranty included.'],
                                ['id' => 'prod2', 'type' => 'product', 'x' => 40, 'y' => 490, 'w' => 245, 'h' => 280, 'name' => 'Smart Fitness Tracker GPS', 'price' => '$149.00', 'badge' => 'NEW ARRIVAL', 'image' => 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80', 'sku' => 'FIT-GPS-02'],
                                ['id' => 'prod3', 'type' => 'product', 'x' => 310, 'y' => 490, 'w' => 245, 'h' => 280, 'name' => 'Waterproof Bluetooth 5.3 Speaker', 'price' => '$89.00', 'badge' => 'BEACH READY', 'image' => 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=500&q=80', 'sku' => 'SPK-BT-WTR'],
                            ]
                        ]
                    ]
                ]),
            ],
            [
                'category' => 'school_yearbook',
                'doc_type' => 'magazine',
                'name' => 'Pacific Heritage School Yearbook',
                'description' => 'Comprehensive school and university yearbook with senior portraits, awards, quotes, and memories.',
                'thumbnail_url' => 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80',
                'canvas_spec' => json_encode([
                    'pages' => [
                        [
                            'background' => ['type' => 'color', 'value' => '#1E1B4B'],
                            'elements' => [
                                ['id' => 'yb1', 'type' => 'text', 'x' => 40, 'y' => 60, 'w' => 515, 'h' => 40, 'content' => 'CLASS OF 2026 GRADUATES', 'style' => ['fontSize' => 26, 'fontWeight' => 'bold', 'color' => '#E0E7FF', 'textAlign' => 'center']],
                                ['id' => 'yb2', 'type' => 'text', 'x' => 40, 'y' => 105, 'w' => 515, 'h' => 25, 'content' => '"Leading with Excellence, Rooted in Tradition"', 'style' => ['fontSize' => 14, 'fontStyle' => 'italic', 'color' => '#A5B4FC', 'textAlign' => 'center']],
                                ['id' => 'img1', 'type' => 'image', 'x' => 50, 'y' => 150, 'w' => 150, 'h' => 180, 'src' => 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80', 'caption' => 'Alisi Tavua - Dux of School'],
                                ['id' => 'img2', 'type' => 'image', 'x' => 220, 'y' => 150, 'w' => 150, 'h' => 180, 'src' => 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80', 'caption' => 'Jone Naivalu - Head Boy'],
                                ['id' => 'img3', 'type' => 'image', 'x' => 390, 'y' => 150, 'w' => 150, 'h' => 180, 'src' => 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80', 'caption' => 'Mereani Koroi - Head Girl'],
                                ['id' => 'yb3', 'type' => 'text', 'x' => 50, 'y' => 360, 'w' => 490, 'h' => 120, 'content' => 'Principal’s Message: To the graduating class of 2026, you have demonstrated resilience, leadership, and remarkable academic curiosity across your journey. As you venture forth into higher learning and your careers, remember the foundations forged on these shores.', 'style' => ['fontSize' => 13, 'color' => '#C7D2FE', 'lineHeight' => 1.6]],
                            ]
                        ]
                    ]
                ]),
            ],
            [
                'category' => 'community_magazine',
                'doc_type' => 'magazine',
                'name' => 'Island Horizon Lifestyle & Travel',
                'description' => 'Multi-column editorial magazine spread with drop caps, pull-quotes, full-bleed scenic backdrops, and author bylines.',
                'thumbnail_url' => 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
                'canvas_spec' => json_encode([
                    'pages' => [
                        [
                            'background' => ['type' => 'color', 'value' => '#FFFFFF'],
                            'elements' => [
                                ['id' => 'cat1', 'type' => 'text', 'x' => 40, 'y' => 40, 'w' => 200, 'h' => 20, 'content' => 'ECO-TOURISM & ADVENTURE', 'style' => ['fontSize' => 11, 'fontWeight' => 'bold', 'color' => '#0284C7', 'letterSpacing' => '1.5px']],
                                ['id' => 'hd1', 'type' => 'text', 'x' => 40, 'y' => 65, 'w' => 515, 'h' => 70, 'content' => 'Untouched Coral Sanctuaries: Exploring the Mamanuca Reefs', 'style' => ['fontSize' => 28, 'fontWeight' => '800', 'color' => '#0F172A', 'lineHeight' => 1.2]],
                                ['id' => 'imghero', 'type' => 'image', 'x' => 40, 'y' => 145, 'w' => 515, 'h' => 280, 'src' => 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=800&q=80'],
                                ['id' => 'cap', 'type' => 'text', 'x' => 40, 'y' => 430, 'w' => 515, 'h' => 20, 'content' => 'Photo: Marine conservation divers surveying barrier reefs off Castaway Island.', 'style' => ['fontSize' => 11, 'color' => '#64748B', 'fontStyle' => 'italic']],
                                ['id' => 'txt1', 'type' => 'text', 'x' => 40, 'y' => 460, 'w' => 245, 'h' => 260, 'content' => 'Rising before dawn, the boat guides smoothly cut through crystal clear lagoon waters towards the outer barrier wall. Here, sea turtles glide effortlessly amongst towering coral gardens preserved through community tabu conservation reserves.', 'style' => ['fontSize' => 13, 'color' => '#334155', 'lineHeight' => 1.6]],
                                ['id' => 'txt2', 'type' => 'text', 'x' => 310, 'y' => 460, 'w' => 245, 'h' => 260, 'content' => 'Visitors are welcomed with traditional sevusevu protocols, connecting cultural heritage directly with modern sustainable marine stewardship. Every visitor footprint helps fund community-managed nurseries and local youth guides.', 'style' => ['fontSize' => 13, 'color' => '#334155', 'lineHeight' => 1.6]],
                            ]
                        ]
                    ]
                ]),
            ],
            [
                'category' => 'wedding_album',
                'doc_type' => 'album',
                'name' => 'Island Sanctuary Wedding & Event Album',
                'description' => 'Luxury photo album layout with elegant typography, multi-photo frames, vows keepsakes, and guest remembrance.',
                'thumbnail_url' => 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80',
                'canvas_spec' => json_encode([
                    'pages' => [
                        [
                            'background' => ['type' => 'color', 'value' => '#FAFAF9'],
                            'elements' => [
                                ['id' => 'm1', 'type' => 'text', 'x' => 40, 'y' => 50, 'w' => 515, 'h' => 40, 'content' => 'DAVID & SERA', 'style' => ['fontSize' => 24, 'fontWeight' => '300', 'color' => '#44403C', 'textAlign' => 'center', 'letterSpacing' => '4px']],
                                ['id' => 'm2', 'type' => 'text', 'x' => 40, 'y' => 95, 'w' => 515, 'h' => 20, 'content' => 'OCTOBER 14, 2026 • DENARAU ISLAND, FIJI', 'style' => ['fontSize' => 11, 'fontWeight' => '600', 'color' => '#A8A29E', 'textAlign' => 'center', 'letterSpacing' => '2px']],
                                ['id' => 'imgw1', 'type' => 'image', 'x' => 40, 'y' => 130, 'w' => 250, 'h' => 340, 'src' => 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=500&q=80'],
                                ['id' => 'imgw2', 'type' => 'image', 'x' => 305, 'y' => 130, 'w' => 250, 'h' => 340, 'src' => 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=500&q=80'],
                                ['id' => 'wquote', 'type' => 'text', 'x' => 50, 'y' => 500, 'w' => 495, 'h' => 60, 'content' => '"From this day forward, our journeys are woven together like coconut sennit along the pacific tide."', 'style' => ['fontSize' => 14, 'fontStyle' => 'italic', 'color' => '#78716C', 'textAlign' => 'center']],
                            ]
                        ]
                    ]
                ]),
            ],
        ];

        foreach ($templates as $t) {
            Db::run(
                'INSERT INTO studio_templates (category, doc_type, name, description, thumbnail_url, canvas_spec, is_system)
                 VALUES (?, ?, ?, ?, ?, ?, 1)',
                [$t['category'], $t['doc_type'], $t['name'], $t['description'], $t['thumbnail_url'], $t['canvas_spec']]
            );
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

        $tenantId = (int) TenantContext::id();
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

        $tenantId = (int) TenantContext::id();
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
                 VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, "draft")',
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

        $tenantId = (int) TenantContext::id();
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

        $tenantId = (int) TenantContext::id();
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

        $tenantId = (int) TenantContext::id();
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

        $tenantId = (int) TenantContext::id();
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

        $tenantId = (int) TenantContext::id();
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

        $tenantId = (int) TenantContext::id();
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

        $tenantId = (int) TenantContext::id();
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
     * GET /studio/templates: List templates.
     */
    public function listTemplates(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $tenantId = (int) TenantContext::id();
        $params = $req->getQueryParams();
        $docType = trim((string) ($params['doc_type'] ?? ''));

        $sql = 'SELECT id, category, doc_type, name, description, thumbnail_url, is_system, created_at 
                FROM studio_templates 
                WHERE (is_system = 1 OR tenant_id = ?)';
        $binds = [$tenantId];

        if ($docType !== '') {
            $sql .= ' AND doc_type = ?';
            $binds[] = $docType;
        }

        $sql .= ' ORDER BY id ASC';
        $templates = Db::all($sql, $binds);

        return Http::json($res, ['templates' => $templates]);
    }

    /**
     * GET /studio/assets: List media assets for tenant.
     */
    public function listAssets(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $tenantId = (int) TenantContext::id();
        $params = $req->getQueryParams();
        $assetType = trim((string) ($params['type'] ?? ''));

        $sql = 'SELECT * FROM studio_assets WHERE tenant_id = ?';
        $binds = [$tenantId];

        if ($assetType !== '') {
            $sql .= ' AND asset_type = ?';
            $binds[] = $assetType;
        }

        $sql .= ' ORDER BY created_at DESC';
        $assets = Db::all($sql, $binds);

        return Http::json($res, ['assets' => $assets]);
    }

    /**
     * POST /studio/assets/upload: Upload image, logo or graphic asset.
     */
    public function uploadAsset(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = (int) TenantContext::id();
        $files = $req->getUploadedFiles();
        $file = $files['file'] ?? null;

        if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
            // Check if base64/URL data was sent
            $body = (array) $req->getParsedBody();
            $url = trim((string) ($body['file_url'] ?? ''));
            $name = trim((string) ($body['name'] ?? 'Asset ' . date('Y-m-d H:i')));
            $type = trim((string) ($body['asset_type'] ?? 'image'));

            if ($url === '') {
                return Http::error($res, 'Please provide an uploaded file or file_url', 422);
            }

            Db::run(
                'INSERT INTO studio_assets (tenant_id, uploaded_by, asset_name, asset_type, mime_type, file_url, file_size)
                 VALUES (?, ?, ?, ?, "image/jpeg", ?, 0)',
                [$tenantId, $u['id'], $name, $type, $url]
            );
            $assetId = (int) Db::pdo()->lastInsertId();

            return Http::json($res, ['ok' => true, 'asset_id' => $assetId, 'url' => $url], 201);
        }

        $clientName = $file->getClientFilename() ?? 'asset.png';
        $mime = $file->getClientMediaType() ?? 'image/png';
        $size = (int) $file->getSize();

        // Target directory: /storage/tenants/{id}/studio/
        $destDir = Storage::tenantDir($tenantId) . '/studio';
        Storage::ensureDir($destDir);

        $ext = pathinfo($clientName, PATHINFO_EXTENSION) ?: 'png';
        $filename = bin2hex(random_bytes(12)) . '.' . strtolower($ext);
        $fullPath = $destDir . '/' . $filename;

        $file->moveTo($fullPath);

        $relPath = "tenants/{$tenantId}/studio/{$filename}";
        $url = Storage::signedUrl($relPath, 86400 * 365); // 1-year signature or public CDN

        Db::run(
            'INSERT INTO studio_assets (tenant_id, uploaded_by, asset_name, asset_type, mime_type, file_url, file_size)
             VALUES (?, ?, ?, "image", ?, ?, ?)',
            [$tenantId, $u['id'], $clientName, $mime, $url, $size]
        );
        $assetId = (int) Db::pdo()->lastInsertId();

        return Http::json($res, [
            'ok' => true,
            'asset_id' => $assetId,
            'file_url' => $url,
            'name' => $clientName
        ], 201);
    }

    /**
     * POST /studio/documents/{id}/publish: Compile studio document to a live Flipbook.
     */
    public function publishDocument(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = (int) TenantContext::id();
        $docId = (int) ($args['id'] ?? 0);

        $doc = Db::one('SELECT * FROM studio_documents WHERE id = ? AND tenant_id = ?', [$docId, $tenantId]);
        if (!$doc) {
            return Http::error($res, 'Document not found', 404);
        }

        $pages = Db::all('SELECT * FROM studio_document_pages WHERE document_id = ? ORDER BY page_number ASC', [$docId]);
        if (empty($pages)) {
            return Http::error($res, 'Document must have at least one page to publish', 400);
        }

        Db::pdo()->beginTransaction();
        try {
            $flipbookId = $doc['flipbook_id'] ? (int) $doc['flipbook_id'] : null;
            $slug = 'doc-' . $docId . '-' . substr(bin2hex(random_bytes(4)), 0, 8);

            if ($flipbookId) {
                // Update existing flipbook
                Db::run(
                    'UPDATE flipbooks SET title = ?, page_count = ?, status = "ready", workflow_status = "approved", visibility = "public", updated_at = NOW()
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
                     VALUES (?, ?, ?, ?, ?, "ready", "approved", "public", 1, 100, "Completed", NOW())',
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

                $thumbUrl = $p['thumbnail_url'] ?? '';
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

                // If thumbnail is still empty, use a clean SVG data URI placeholder
                if ($thumbUrl === '') {
                    $thumbUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="840" fill="%23f8fafc"><rect width="100%" height="100%" fill="%23f8fafc"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="28" fill="%2394a3b8">Page ' . $pageNum . '</text></svg>';
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

                // Compile interactive product cards & links into hotspots
                foreach ($elements as $el) {
                    $type = $el['type'] ?? 'generic';
                    if ($type === 'product') {
                        $payload = json_encode([
                            'product_name' => $el['name'] ?? '',
                            'price' => $el['price'] ?? '',
                            'original_price' => $el['originalPrice'] ?? null,
                            'badge' => $el['badge'] ?? null,
                            'sku' => $el['sku'] ?? '',
                            'whatsapp_number' => $el['whatsappNumber'] ?? null,
                            'image' => $el['image'] ?? null,
                            'description' => $el['description'] ?? '',
                        ]);
                        Db::run(
                            'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                             VALUES (?, ?, "product", ?, ?, ?, ?, ?)',
                            [$flipbookId, $pageNum, (float) ($el['x'] ?? 0), (float) ($el['y'] ?? 0), (float) ($el['w'] ?? 100), (float) ($el['h'] ?? 100), $payload]
                        );
                    } elseif ($type === 'link' || !empty($el['linkUrl'])) {
                        $payload = json_encode(['url' => $el['linkUrl'] ?? '']);
                        Db::run(
                            'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                             VALUES (?, ?, "link", ?, ?, ?, ?, ?)',
                            [$flipbookId, $pageNum, (float) ($el['x'] ?? 0), (float) ($el['y'] ?? 0), (float) ($el['w'] ?? 100), (float) ($el['h'] ?? 100), $payload]
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

            return Http::json($res, [
                'ok' => true,
                'flipbook_id' => $flipbookId,
                'slug' => $fb['slug'] ?? $slug,
                'public_url' => '/v/' . ($fb['slug'] ?? $slug),
                'viewer_url' => '/view/' . ($fb['slug'] ?? $slug),
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

        $tenantId = (int) TenantContext::id();
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
                $fontSize = (int) ($el['style']['fontSize'] ?? 14);
                $content = trim((string) ($el['content'] ?? ''));

                if ($content !== '' && ($type === 'text' || $type === 'column_text')) {
                    if ($fontSize >= 20 && $foundHeading === null) {
                        $foundHeading = $content;
                    } elseif ($fontSize >= 15 && $foundSub === null && $foundHeading !== null) {
                        $foundSub = $content;
                    }
                } elseif ($type === 'product' && $foundHeading === null && !empty($el['name'])) {
                    $foundHeading = (string) $el['name'];
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

        $tenantId = (int) TenantContext::id();
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

            $html .= '<div class="page-container" style="background-color: ' . htmlspecialchars($bgColor) . ';">';

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
}
