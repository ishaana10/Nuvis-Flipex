<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\PublisherIdentity;
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
        PublisherIdentity::ensureSchema();
        $slug = trim((string) ($args['slug'] ?? ''));
        if ($slug === '') {
            return Http::error($res, 'Storefront slug is required', 400);
        }

        // Resolve tenant by active slug, storefront slug, or historical slug redirect
        $resolved = PublisherIdentity::resolveTenantBySlug($slug);
        $tenant = $resolved['tenant'];
        $redirectedFrom = $resolved['redirectedFrom'];

        if (!$tenant) {
            return Http::error($res, 'Business publisher profile not found', 404);
        }

        if (isset($tenant['public_profile_enabled']) && (int) $tenant['public_profile_enabled'] === 0) {
            return Http::error($res, 'This company profile is currently private', 404);
        }

        $tenantId = (int) $tenant['id'];
        $storefront = Db::one(
            'SELECT s.*, t.name as tenant_name, t.display_name as tenant_display_name, t.slug as tenant_slug
             FROM tenant_storefronts s
             JOIN tenants t ON t.id = s.tenant_id
             WHERE s.tenant_id = ?',
            [$tenantId]
        );

        if (!$storefront) {
            $displayName = !empty($tenant['display_name']) ? $tenant['display_name'] : $tenant['name'];
            Db::run(
                'INSERT INTO tenant_storefronts (tenant_id, business_name, slug, email, currency)
                 VALUES (?, ?, ?, ?, ?)',
                [$tenantId, $displayName, $tenant['slug'], $tenant['billing_email'] ?? '', $tenant['currency'] ?? 'FJD']
            );

            $storefront = Db::one(
                'SELECT s.*, t.name as tenant_name, t.display_name as tenant_display_name, t.slug as tenant_slug
                 FROM tenant_storefronts s
                 JOIN tenants t ON t.id = s.tenant_id
                 WHERE s.tenant_id = ?',
                [$tenantId]
            );
        }

        $companySlug = (string) ($tenant['slug'] ?: $storefront['slug']);

        // Fetch public published publications for this business (strictly ready, published, and public)
        $flipbooks = Db::all(
            "SELECT id, title, slug, public_slug, description, page_count, status, workflow_status, settings, published_at, created_at
             FROM flipbooks
             WHERE tenant_id = ?
               AND status = 'ready'
               AND visibility = 'public'
               AND published_at IS NOT NULL
               AND (workflow_status IS NULL OR workflow_status IN ('published', 'approved'))
             ORDER BY published_at DESC, created_at DESC",
            [$tenantId]
        );

        $catalogues = array_map(function ($f) use ($companySlug) {
            $settings = !empty($f['settings']) ? json_decode((string) $f['settings'], true) : [];
            $pubSlug = !empty($f['public_slug']) ? (string) $f['public_slug'] : (string) $f['slug'];
            return [
                'id' => (int) $f['id'],
                'title' => (string) $f['title'],
                'slug' => (string) $f['slug'],
                'publicSlug' => $pubSlug,
                'description' => $f['description'] ?? '',
                'pageCount' => (int) $f['page_count'],
                'coverUrl' => "/api/v1/public/{$f['slug']}/cover",
                'readerUrl' => "/{$companySlug}/docs/{$pubSlug}",
                'legacyReaderUrl' => "/v/{$f['slug']}",
                'brandAccentColor' => $settings['brandAccentColor'] ?? '#f59e0b',
                'publishedAt' => (string) ($f['published_at'] ?? $f['created_at']),
                'createdAt' => (string) $f['created_at'],
            ];
        }, $flipbooks);

        return Http::json($res, [
            'storefront' => [
                'id' => (int) $storefront['id'],
                'tenantId' => $tenantId,
                'businessName' => (string) ($storefront['business_name'] ?: ($tenant['display_name'] ?? $tenant['name'])),
                'slug' => $companySlug,
                'canonicalUrl' => "/{$companySlug}",
                'redirectedFrom' => $redirectedFrom,
                'tagline' => $storefront['tagline'] ?? '',
                'bio' => $storefront['bio'] ?? '',
                'phone' => $storefront['phone'] ?? '',
                'whatsappPhone' => $storefront['whatsapp_phone'] ?? '',
                'email' => $storefront['email'] ?? '',
                'address' => $storefront['address'] ?? '',
                'websiteUrl' => $storefront['website_url'] ?? '',
                'facebookUrl' => $storefront['facebook_url'] ?? '',
                'instagramUrl' => $storefront['instagram_url'] ?? '',
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
     * Get tenant storefront & publisher identity settings.
     */
    public function getStorefrontSettings(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        PublisherIdentity::ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);

        $tenant = Db::one('SELECT * FROM tenants WHERE id = ?', [$tenantId]);
        $storefront = Db::one('SELECT * FROM tenant_storefronts WHERE tenant_id = ?', [$tenantId]);
        if (!$storefront) {
            $businessName = $tenant['display_name'] ?? $tenant['name'] ?? 'My Business';
            $slug = $tenant['slug'] ?? "biz-{$tenantId}";

            Db::run(
                'INSERT INTO tenant_storefronts (tenant_id, business_name, slug, email, currency)
                 VALUES (?, ?, ?, ?, ?)',
                [$tenantId, $businessName, $slug, $tenant['billing_email'] ?? '', 'FJD']
            );
            $storefront = Db::one('SELECT * FROM tenant_storefronts WHERE tenant_id = ?', [$tenantId]);
        }

        $companySlug = (string) ($tenant['slug'] ?? $storefront['slug']);
        $slugHistory = Db::all(
            "SELECT old_slug, new_slug, created_at FROM slug_redirects WHERE entity_type = 'tenant' AND entity_id = ? ORDER BY id DESC LIMIT 10",
            [$tenantId]
        );

        $txtToken = !empty($tenant['custom_domain_txt'])
            ? (string) $tenant['custom_domain_txt']
            : ('flipex-verify=' . substr(hash('sha256', 'tenant-domain-' . $tenantId), 0, 24));

        return Http::json($res, [
            'storefront' => [
                'id' => (int) $storefront['id'],
                'tenantId' => $tenantId,
                'businessName' => (string) ($tenant['display_name'] ?: $storefront['business_name']),
                'slug' => $companySlug,
                'slugUpdatedAt' => $tenant['slug_updated_at'] ?? null,
                'publicProfileEnabled' => isset($tenant['public_profile_enabled']) ? (bool) $tenant['public_profile_enabled'] : true,
                'customDomain' => $tenant['custom_domain'] ?? '',
                'customDomainVerified' => !empty($tenant['custom_domain_verified']),
                'customDomainTxt' => $txtToken,
                'tagline' => $storefront['tagline'] ?? '',
                'bio' => $storefront['bio'] ?? '',
                'phone' => $storefront['phone'] ?? '',
                'whatsappPhone' => $storefront['whatsapp_phone'] ?? '',
                'email' => $storefront['email'] ?? '',
                'address' => $storefront['address'] ?? '',
                'websiteUrl' => $storefront['website_url'] ?? '',
                'facebookUrl' => $storefront['facebook_url'] ?? '',
                'instagramUrl' => $storefront['instagram_url'] ?? '',
                'bannerUrl' => $storefront['banner_url'] ?? '',
                'logoUrl' => $storefront['logo_url'] ?? '',
                'isVerified' => (bool) $storefront['is_verified'],
                'currency' => $storefront['currency'] ?? 'FJD',
                'publicUrl' => "/{$companySlug}",
                'legacyBizUrl' => "/biz/{$companySlug}",
                'slugHistory' => $slugHistory,
            ],
        ]);
    }

    /**
     * Update tenant storefront & company publisher URL identity settings.
     */
    public function updateStorefrontSettings(Request $req, Response $res): Response
    {
        $this->ensureSchema();
        PublisherIdentity::ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'settings.manage');

        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $b = (array) $req->getParsedBody();

        $tenant = Db::one('SELECT * FROM tenants WHERE id = ?', [$tenantId]);
        $storefront = Db::one('SELECT * FROM tenant_storefronts WHERE tenant_id = ?', [$tenantId]);

        $businessName = trim((string) ($b['businessName'] ?? ($tenant['display_name'] ?? $tenant['name'] ?? '')));
        if ($businessName === '') {
            return Http::error($res, 'Business / Publisher display name is required', 422);
        }

        $currentSlug = (string) ($tenant['slug'] ?? $storefront['slug'] ?? "biz-{$tenantId}");
        $newSlug = $currentSlug;

        if (array_key_exists('slug', $b) && trim((string) $b['slug']) !== '') {
            $requestedSlug = trim((string) $b['slug']);
            $sanitized = PublisherIdentity::sanitizeSlug($requestedSlug, 60);
            if ($sanitized !== $currentSlug) {
                $check = PublisherIdentity::checkCompanySlugAvailability($sanitized, $tenantId);
                if (!$check['available']) {
                    return Http::error($res, $check['reason'] ?? 'Company URL name is not available', 422, [
                        'slug' => $check['reason'] ?? 'Unavailable',
                        'suggestion' => $check['suggestion'] ?? null,
                    ]);
                }
                $newSlug = $check['slug'];
            }
        }

        $publicProfileEnabled = array_key_exists('publicProfileEnabled', $b)
            ? (!empty($b['publicProfileEnabled']) ? 1 : 0)
            : (isset($tenant['public_profile_enabled']) ? (int) $tenant['public_profile_enabled'] : 1);

        $customDomain = array_key_exists('customDomain', $b)
            ? strtolower(trim(preg_replace('#^https?://#i', '', trim((string) $b['customDomain'])) ?? '', '/'))
            : ($tenant['custom_domain'] ?? null);
        if ($customDomain === '') {
            $customDomain = null;
        }
        $txtToken = !empty($tenant['custom_domain_txt'])
            ? (string) $tenant['custom_domain_txt']
            : ('flipex-verify=' . substr(hash('sha256', 'tenant-domain-' . $tenantId), 0, 24));

        // Update tenants table (display_name, name, slug, public_profile_enabled, custom_domain)
        $slugChanged = $newSlug !== $currentSlug;
        try {
            Db::run(
                'UPDATE tenants SET
                    name = ?,
                    display_name = ?,
                    slug = ?,
                    slug_updated_at = IF(? = 1, NOW(), slug_updated_at),
                    public_profile_enabled = ?,
                    custom_domain = ?,
                    custom_domain_txt = ?
                 WHERE id = ?',
                [
                    $businessName,
                    $businessName,
                    $newSlug,
                    $slugChanged ? 1 : 0,
                    $publicProfileEnabled,
                    $customDomain,
                    $txtToken,
                    $tenantId,
                ]
            );
        } catch (\Throwable) {
            Db::run('UPDATE tenants SET name = ?, slug = ? WHERE id = ?', [$businessName, $newSlug, $tenantId]);
        }

        if ($slugChanged) {
            PublisherIdentity::recordSlugChange('tenant', $tenantId, $currentSlug, $newSlug, $tenantId);
            // Update canonical_url on all publications belonging to this tenant
            try {
                Db::run(
                    "UPDATE flipbooks SET canonical_url = CONCAT('/', ?, '/docs/', COALESCE(NULLIF(public_slug, ''), slug)) WHERE tenant_id = ?",
                    [$newSlug, $tenantId]
                );
            } catch (\Throwable) {
            }
        }

        $tagline = array_key_exists('tagline', $b) ? (trim((string) $b['tagline']) ?: null) : ($storefront['tagline'] ?? null);
        $bio = array_key_exists('bio', $b) ? (trim((string) $b['bio']) ?: null) : ($storefront['bio'] ?? null);
        $phone = array_key_exists('phone', $b) ? (trim((string) $b['phone']) ?: null) : ($storefront['phone'] ?? null);
        $whatsappPhone = array_key_exists('whatsappPhone', $b) ? (trim((string) $b['whatsappPhone']) ?: null) : ($storefront['whatsapp_phone'] ?? null);
        $email = array_key_exists('email', $b) ? (trim((string) $b['email']) ?: null) : ($storefront['email'] ?? null);
        $address = array_key_exists('address', $b) ? (trim((string) $b['address']) ?: null) : ($storefront['address'] ?? null);
        $websiteUrl = array_key_exists('websiteUrl', $b) ? (trim((string) $b['websiteUrl']) ?: null) : ($storefront['website_url'] ?? null);
        $facebookUrl = array_key_exists('facebookUrl', $b) ? (trim((string) $b['facebookUrl']) ?: null) : ($storefront['facebook_url'] ?? null);
        $instagramUrl = array_key_exists('instagramUrl', $b) ? (trim((string) $b['instagramUrl']) ?: null) : ($storefront['instagram_url'] ?? null);
        $bannerUrl = array_key_exists('bannerUrl', $b) ? (trim((string) $b['bannerUrl']) ?: null) : ($storefront['banner_url'] ?? null);
        $logoUrl = array_key_exists('logoUrl', $b) ? (trim((string) $b['logoUrl']) ?: null) : ($storefront['logo_url'] ?? null);
        $currency = !empty($b['currency']) ? trim((string) $b['currency']) : ($storefront['currency'] ?? 'FJD');

        if (!$storefront) {
            try {
                Db::run(
                    'INSERT INTO tenant_storefronts (
                        tenant_id, business_name, slug, tagline, bio, phone, whatsapp_phone,
                        email, address, website_url, facebook_url, instagram_url, banner_url, logo_url, currency
                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        $tenantId, $businessName, $newSlug, $tagline, $bio, $phone, $whatsappPhone,
                        $email, $address, $websiteUrl, $facebookUrl, $instagramUrl,
                        $bannerUrl, $logoUrl, $currency
                    ]
                );
            } catch (\Throwable) {
                Db::run(
                    'INSERT INTO tenant_storefronts (tenant_id, business_name, slug, email, currency)
                     VALUES (?, ?, ?, ?, ?)',
                    [$tenantId, $businessName, $newSlug, $email ?? '', $currency]
                );
            }
        } else {
            try {
                Db::run(
                    'UPDATE tenant_storefronts SET
                        business_name = ?,
                        slug = ?,
                        tagline = ?,
                        bio = ?,
                        phone = ?,
                        whatsapp_phone = ?,
                        email = ?,
                        address = ?,
                        website_url = ?,
                        facebook_url = ?,
                        instagram_url = ?,
                        banner_url = ?,
                        logo_url = ?,
                        currency = ?
                     WHERE tenant_id = ?',
                    [
                        $businessName, $newSlug, $tagline, $bio, $phone, $whatsappPhone,
                        $email, $address, $websiteUrl, $facebookUrl, $instagramUrl,
                        $bannerUrl, $logoUrl, $currency, $tenantId
                    ]
                );
            } catch (\Throwable) {
                Db::run(
                    'UPDATE tenant_storefronts SET
                        business_name = ?,
                        slug = ?,
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
                        $businessName, $newSlug, $tagline, $bio, $phone, $whatsappPhone,
                        $email, $address, $websiteUrl, $bannerUrl, $logoUrl, $currency, $tenantId
                    ]
                );
            }
        }

        Audit::log('commercial.storefront_updated', 'tenant', $tenantId, [
            'business_name' => $businessName,
            'slug' => $newSlug,
            'slug_changed' => $slugChanged,
        ]);

        return Http::json($res, [
            'message' => 'Company publishing identity & storefront updated successfully',
            'slug' => $newSlug,
            'publicUrl' => "/{$newSlug}",
        ]);
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
