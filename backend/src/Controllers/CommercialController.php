<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Rbac;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class CommercialController
{
    /**
     * Public Business Profile & Catalogues Storefront.
     */
    public function publicBizProfile(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        if ($slug === '') {
            return Http::error($res, 'Storefront slug is required', 400);
        }

        // Find by storefront slug or tenant slug
        $storefront = Db::one(
            'SELECT s.*, t.name as tenant_name, t.slug as tenant_slug
             FROM tenant_storefronts s
             JOIN tenants t ON t.id = s.tenant_id
             WHERE s.slug = ? OR t.slug = ?',
            [$slug, $slug]
        );

        if (!$storefront) {
            // Check if a tenant exists with this slug and auto-provision storefront
            $tenant = Db::one('SELECT * FROM tenants WHERE slug = ?', [$slug]);
            if (!$tenant) {
                return Http::error($res, 'Business storefront not found', 404);
            }

            Db::run(
                'INSERT INTO tenant_storefronts (tenant_id, business_name, slug, email, currency)
                 VALUES (?, ?, ?, ?, ?)',
                [$tenant['id'], $tenant['name'], $tenant['slug'], $tenant['billing_email'], $tenant['currency'] ?? 'FJD']
            );

            $storefront = Db::one(
                'SELECT s.*, t.name as tenant_name, t.slug as tenant_slug
                 FROM tenant_storefronts s
                 JOIN tenants t ON t.id = s.tenant_id
                 WHERE s.tenant_id = ?',
                [$tenant['id']]
            );
        }

        $tenantId = (int) $storefront['tenant_id'];

        // Fetch public published publications for this business (strictly ready, published, and public)
        $flipbooks = Db::all(
            "SELECT id, title, slug, description, page_count, status, workflow_status, settings, created_at
             FROM flipbooks
             WHERE tenant_id = ?
               AND status = 'ready'
               AND visibility = 'public'
               AND published_at IS NOT NULL
               AND (workflow_status IS NULL OR workflow_status = 'approved')
             ORDER BY created_at DESC",
            [$tenantId]
        );

        $catalogues = array_map(function ($f) {
            $settings = !empty($f['settings']) ? json_decode((string) $f['settings'], true) : [];
            return [
                'id' => (int) $f['id'],
                'title' => (string) $f['title'],
                'slug' => (string) $f['slug'],
                'description' => $f['description'] ?? '',
                'pageCount' => (int) $f['page_count'],
                'coverUrl' => "/api/public/{$f['slug']}/cover",
                'readerUrl' => "/v/{$f['slug']}",
                'brandAccentColor' => $settings['brandAccentColor'] ?? '#f59e0b',
                'createdAt' => (string) $f['created_at'],
            ];
        }, $flipbooks);

        return Http::json($res, [
            'storefront' => [
                'id' => (int) $storefront['id'],
                'tenantId' => $tenantId,
                'businessName' => (string) $storefront['business_name'],
                'slug' => (string) $storefront['slug'],
                'tagline' => $storefront['tagline'] ?? '',
                'bio' => $storefront['bio'] ?? '',
                'phone' => $storefront['phone'] ?? '',
                'whatsappPhone' => $storefront['whatsapp_phone'] ?? '',
                'email' => $storefront['email'] ?? '',
                'address' => $storefront['address'] ?? '',
                'websiteUrl' => $storefront['website_url'] ?? '',
                'bannerUrl' => $storefront['banner_url'] ?? '',
                'logoUrl' => $storefront['logo_url'] ?? '',
                'isVerified' => (bool) $storefront['is_verified'],
                'currency' => $storefront['currency'] ?? 'FJD',
                'cataloguesCount' => count($catalogues),
            ],
            'catalogues' => $catalogues,
        ]);
    }

    /**
     * Capture customer product inquiry directly from catalogue reader hotspot.
     */
    public function publicInquire(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        $flipbook = Db::one(
            "SELECT id, tenant_id, title, status, visibility, published_at, workflow_status
             FROM flipbooks
             WHERE slug = ?",
            [$slug]
        );
        if (!$flipbook || $flipbook['status'] !== 'ready' || $flipbook['visibility'] !== 'public' || empty($flipbook['published_at'])) {
            return Http::error($res, 'Publication not found or not eligible for public inquiries', 404);
        }

        $b = (array) $req->getParsedBody();
        $name = trim((string) ($b['name'] ?? $b['customerName'] ?? ''));
        $email = trim((string) ($b['email'] ?? $b['customerEmail'] ?? ''));
        $productTitle = trim((string) ($b['productTitle'] ?? $b['title'] ?? ''));

        if ($name === '' || $email === '') {
            return Http::error($res, 'Name and email are required to send an inquiry', 422);
        }

        $tenantId = (int) $flipbook['tenant_id'];
        $pageNumber = !empty($b['pageNumber']) ? (int) $b['pageNumber'] : null;
        $productSku = !empty($b['sku']) ? trim((string) $b['sku']) : null;
        $productPrice = !empty($b['price']) ? trim((string) $b['price']) : null;
        $phone = !empty($b['phone']) ? trim((string) $b['phone']) : null;
        $quantity = !empty($b['quantity']) ? max(1, (int) $b['quantity']) : 1;
        $notes = !empty($b['notes']) ? trim((string) $b['notes']) : null;

        Db::run(
            'INSERT INTO commercial_leads (
                tenant_id, flipbook_id, page_number, product_title, product_sku,
                product_price, customer_name, customer_email, customer_phone,
                quantity, notes, status, source
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $tenantId,
                $flipbook['id'],
                $pageNumber,
                $productTitle,
                $productSku,
                $productPrice,
                $name,
                $email,
                $phone,
                $quantity,
                $notes,
                'new',
                'catalogue_hotspot'
            ]
        );

        $leadId = (int) Db::pdo()->lastInsertId();

        Audit::log('commercial.lead_received', "Customer inquiry from {$name} for {$productTitle} on {$flipbook['title']}", [
            'lead_id' => $leadId,
            'tenant_id' => $tenantId,
            'flipbook_id' => $flipbook['id'],
        ]);

        return Http::json($res, [
            'success' => true,
            'leadId' => $leadId,
            'message' => 'Thank you! Your inquiry has been sent directly to the sales team.',
        ], 201);
    }

    /**
     * General contact request from public storefront.
     */
    public function publicBizContact(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        $storefront = Db::one(
            'SELECT s.tenant_id, s.business_name FROM tenant_storefronts s
             JOIN tenants t ON t.id = s.tenant_id
             WHERE s.slug = ? OR t.slug = ?',
            [$slug, $slug]
        );
        if (!$storefront) {
            return Http::error($res, 'Storefront not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $name = trim((string) ($b['name'] ?? ''));
        $email = trim((string) ($b['email'] ?? ''));
        $message = trim((string) ($b['message'] ?? ''));

        if ($name === '' || $email === '') {
            return Http::error($res, 'Name and email are required', 422);
        }

        $tenantId = (int) $storefront['tenant_id'];
        $phone = !empty($b['phone']) ? trim((string) $b['phone']) : null;

        Db::run(
            'INSERT INTO commercial_leads (
                tenant_id, customer_name, customer_email, customer_phone,
                notes, status, source
             ) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                $tenantId,
                $name,
                $email,
                $phone,
                $message,
                'new',
                'storefront_contact'
            ]
        );

        return Http::json($res, [
            'success' => true,
            'message' => 'Your message has been delivered to the business team.',
        ], 201);
    }

    /**
     * List commercial leads for the current tenant.
     */
    public function listLeads(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);

        $params = $req->getQueryParams();
        $status = !empty($params['status']) ? trim((string) $params['status']) : null;

        $sql = 'SELECT l.*, f.title as flipbook_title, f.slug as flipbook_slug
                FROM commercial_leads l
                LEFT JOIN flipbooks f ON f.id = l.flipbook_id
                WHERE l.tenant_id = ?';
        $args = [$tenantId];

        if ($status) {
            $sql .= ' AND l.status = ?';
            $args[] = $status;
        }

        $sql .= ' ORDER BY l.created_at DESC';

        $leads = Db::all($sql, $args);

        // Stats summary
        $total = count($leads);
        $newCount = (int) (Db::one('SELECT COUNT(*) as c FROM commercial_leads WHERE tenant_id = ? AND status = "new"', [$tenantId])['c'] ?? 0);
        $convertedCount = (int) (Db::one('SELECT COUNT(*) as c FROM commercial_leads WHERE tenant_id = ? AND status = "converted"', [$tenantId])['c'] ?? 0);

        return Http::json($res, [
            'leads' => array_map(function ($l) {
                return [
                    'id' => (int) $l['id'],
                    'flipbookId' => $l['flipbook_id'] ? (int) $l['flipbook_id'] : null,
                    'flipbookTitle' => $l['flipbook_title'] ?? '',
                    'flipbookSlug' => $l['flipbook_slug'] ?? '',
                    'pageNumber' => $l['page_number'] ? (int) $l['page_number'] : null,
                    'productTitle' => $l['product_title'] ?? '',
                    'productSku' => $l['product_sku'] ?? '',
                    'productPrice' => $l['product_price'] ?? '',
                    'customerName' => (string) $l['customer_name'],
                    'customerEmail' => (string) $l['customer_email'],
                    'customerPhone' => $l['customer_phone'] ?? '',
                    'quantity' => (int) ($l['quantity'] ?? 1),
                    'notes' => $l['notes'] ?? '',
                    'status' => (string) $l['status'],
                    'source' => (string) $l['source'],
                    'createdAt' => (string) $l['created_at'],
                ];
            }, $leads),
            'stats' => [
                'total' => $total,
                'new' => $newCount,
                'converted' => $convertedCount,
            ],
        ]);
    }

    /**
     * Update status or notes for a lead.
     */
    public function updateLead(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $id = (int) ($args['id'] ?? 0);

        $lead = Db::one('SELECT * FROM commercial_leads WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        if (!$lead) {
            return Http::error($res, 'Lead not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $status = !empty($b['status']) ? trim((string) $b['status']) : $lead['status'];
        $notes = array_key_exists('notes', $b) ? trim((string) $b['notes']) : $lead['notes'];

        Db::run(
            'UPDATE commercial_leads SET status = ?, notes = ? WHERE id = ? AND tenant_id = ?',
            [$status, $notes, $id, $tenantId]
        );

        return Http::json($res, ['message' => 'Lead updated successfully']);
    }

    /**
     * Delete a commercial lead.
     */
    public function deleteLead(Request $req, Response $res, array $args): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $id = (int) ($args['id'] ?? 0);

        Db::run('DELETE FROM commercial_leads WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);

        return Http::json($res, ['message' => 'Lead removed']);
    }

    /**
     * Get tenant storefront settings.
     */
    public function getStorefrontSettings(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);

        $storefront = Db::one('SELECT * FROM tenant_storefronts WHERE tenant_id = ?', [$tenantId]);
        if (!$storefront) {
            $tenant = Db::one('SELECT * FROM tenants WHERE id = ?', [$tenantId]);
            $businessName = $tenant['name'] ?? 'My Business';
            $slug = $tenant['slug'] ?? "biz-{$tenantId}";

            Db::run(
                'INSERT INTO tenant_storefronts (tenant_id, business_name, slug, email, currency)
                 VALUES (?, ?, ?, ?, ?)',
                [$tenantId, $businessName, $slug, $tenant['billing_email'] ?? '', 'FJD']
            );
            $storefront = Db::one('SELECT * FROM tenant_storefronts WHERE tenant_id = ?', [$tenantId]);
        }

        return Http::json($res, [
            'storefront' => [
                'id' => (int) $storefront['id'],
                'businessName' => (string) $storefront['business_name'],
                'slug' => (string) $storefront['slug'],
                'tagline' => $storefront['tagline'] ?? '',
                'bio' => $storefront['bio'] ?? '',
                'phone' => $storefront['phone'] ?? '',
                'whatsappPhone' => $storefront['whatsapp_phone'] ?? '',
                'email' => $storefront['email'] ?? '',
                'address' => $storefront['address'] ?? '',
                'websiteUrl' => $storefront['website_url'] ?? '',
                'bannerUrl' => $storefront['banner_url'] ?? '',
                'logoUrl' => $storefront['logo_url'] ?? '',
                'isVerified' => (bool) $storefront['is_verified'],
                'currency' => $storefront['currency'] ?? 'FJD',
                'publicUrl' => "/biz/{$storefront['slug']}",
            ],
        ]);
    }

    /**
     * Update tenant storefront settings.
     */
    public function updateStorefrontSettings(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'settings.manage');

        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $b = (array) $req->getParsedBody();

        $businessName = trim((string) ($b['businessName'] ?? ''));
        if ($businessName === '') {
            return Http::error($res, 'Business name is required', 422);
        }

        $tagline = !empty($b['tagline']) ? trim((string) $b['tagline']) : null;
        $bio = !empty($b['bio']) ? trim((string) $b['bio']) : null;
        $phone = !empty($b['phone']) ? trim((string) $b['phone']) : null;
        $whatsappPhone = !empty($b['whatsappPhone']) ? trim((string) $b['whatsappPhone']) : null;
        $email = !empty($b['email']) ? trim((string) $b['email']) : null;
        $address = !empty($b['address']) ? trim((string) $b['address']) : null;
        $websiteUrl = !empty($b['websiteUrl']) ? trim((string) $b['websiteUrl']) : null;
        $bannerUrl = !empty($b['bannerUrl']) ? trim((string) $b['bannerUrl']) : null;
        $logoUrl = !empty($b['logoUrl']) ? trim((string) $b['logoUrl']) : null;
        $currency = !empty($b['currency']) ? trim((string) $b['currency']) : 'FJD';

        Db::run(
            'UPDATE tenant_storefronts SET
                business_name = ?,
                tagline = ?,
                bio = ?,
                phone = ?,
                whatsapp_phone = ?,
                email = ?,
                address = ?,
                website_url = ?,
                banner_url = ?,
                logo_url = ?,
                currency = ?
             WHERE tenant_id = ?',
            [
                $businessName, $tagline, $bio, $phone, $whatsappPhone,
                $email, $address, $websiteUrl, $bannerUrl, $logoUrl,
                $currency, $tenantId
            ]
        );

        Audit::log('commercial.storefront_updated', "Updated storefront settings for {$businessName}", [
            'tenant_id' => $tenantId,
        ]);

        return Http::json($res, ['message' => 'Storefront profile updated successfully']);
    }

    private static bool $schemaEnsured = false;

    private function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        self::$schemaEnsured = true;

        try {
            $pdo = Db::pdo();
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `commercial_leads` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL,
                  `flipbook_id` BIGINT UNSIGNED NULL,
                  `hotspot_id` BIGINT UNSIGNED NULL,
                  `page_number` INT NULL,
                  `product_title` VARCHAR(255) NULL,
                  `product_sku` VARCHAR(100) NULL,
                  `product_price` VARCHAR(50) NULL,
                  `customer_name` VARCHAR(120) NOT NULL,
                  `customer_email` VARCHAR(190) NOT NULL,
                  `customer_phone` VARCHAR(50) NULL,
                  `quantity` INT NOT NULL DEFAULT 1,
                  `notes` TEXT NULL,
                  `status` ENUM('new','contacted','quoted','converted','closed') NOT NULL DEFAULT 'new',
                  `source` VARCHAR(50) NOT NULL DEFAULT 'catalogue_hotspot',
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_leads_tenant` (`tenant_id`, `status`),
                  INDEX `idx_leads_flipbook` (`flipbook_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");

            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `tenant_storefronts` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL UNIQUE,
                  `business_name` VARCHAR(150) NOT NULL,
                  `slug` VARCHAR(100) NOT NULL UNIQUE,
                  `tagline` VARCHAR(255) NULL,
                  `bio` TEXT NULL,
                  `phone` VARCHAR(50) NULL,
                  `whatsapp_phone` VARCHAR(50) NULL,
                  `email` VARCHAR(190) NULL,
                  `address` TEXT NULL,
                  `website_url` VARCHAR(255) NULL,
                  `banner_url` VARCHAR(255) NULL,
                  `logo_url` VARCHAR(255) NULL,
                  `is_verified` TINYINT(1) NOT NULL DEFAULT 1,
                  `facebook_url` VARCHAR(255) NULL,
                  `instagram_url` VARCHAR(255) NULL,
                  `currency` VARCHAR(10) NOT NULL DEFAULT 'FJD',
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_storefront_slug` (`slug`),
                  INDEX `idx_storefront_tenant` (`tenant_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");
        } catch (\Throwable $e) {
            error_log('CommercialController ensureSchema non-fatal notice: ' . $e->getMessage());
        }
    }
}
