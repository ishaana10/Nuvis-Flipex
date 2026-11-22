<?php
declare(strict_types=1);

namespace App\Support;

use Throwable;

/**
 * Flipex Publisher Identity & Branded URLs Engine.
 *
 * Manages:
 *  - Unique company URL slugs (/{companySlug})
 *  - Publication slugs (/{companySlug}/docs/{publicationSlug})
 *  - Reserved route protection
 *  - Slug history & automatic 301/lookup redirects when company or publication slugs change
 *  - Custom domain verification records (Phase 2 preview/ready)
 */
final class PublisherIdentity
{
    private static bool $schemaEnsured = false;

    /** System routes that cannot be claimed as a company URL slug. */
    public const RESERVED_SLUGS = [
        'api', 'v', 'biz', 'edu', 'docs', 'doc', 'login', 'logout', 'register', 'signup', 'signin',
        'verify-email', 'forgot-password', 'reset-password', 'explore', 'directory', 'dashboard',
        'flipbooks', 'studio', 'leads', 'integrations', 'billing', 'devops', 'admin', 'settings',
        'storage', 'assets', 'public', 'static', 'media', 'modules', 'displays', 'storefront',
        'profile', 'account', 'help', 'support', 'pricing', 'terms', 'privacy', 'oembed', 'health',
        'embed', 'qr', 'share', 'download', 'search', 'index', 'home', 'app', 'system', 'root',
    ];

    public static function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        self::$schemaEnsured = true;

        try {
            $pdo = Db::pdo();

            // 1. Slug History & Redirects Table
            $pdo->exec("
                CREATE TABLE IF NOT EXISTS `slug_redirects` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `entity_type` ENUM('tenant','flipbook') NOT NULL,
                  `entity_id` BIGINT UNSIGNED NOT NULL,
                  `tenant_id` BIGINT UNSIGNED NULL,
                  `old_slug` VARCHAR(120) NOT NULL,
                  `new_slug` VARCHAR(120) NOT NULL,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX `idx_redirect_lookup` (`entity_type`, `old_slug`),
                  INDEX `idx_redirect_entity` (`entity_type`, `entity_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ");

            // 2. Extend tenants table with Publisher Identity columns
            $tenantCols = array_column(Db::all('SHOW COLUMNS FROM tenants'), 'Field');
            if (!in_array('display_name', $tenantCols, true)) {
                $pdo->exec("ALTER TABLE tenants ADD COLUMN `display_name` VARCHAR(150) NULL AFTER `name`");
            }
            if (!in_array('slug_updated_at', $tenantCols, true)) {
                $pdo->exec("ALTER TABLE tenants ADD COLUMN `slug_updated_at` DATETIME NULL AFTER `slug`");
            }
            if (!in_array('public_profile_enabled', $tenantCols, true)) {
                $pdo->exec("ALTER TABLE tenants ADD COLUMN `public_profile_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `slug_updated_at`");
            }
            if (!in_array('custom_domain', $tenantCols, true)) {
                $pdo->exec("ALTER TABLE tenants ADD COLUMN `custom_domain` VARCHAR(255) NULL AFTER `public_profile_enabled`");
            }
            if (!in_array('custom_domain_verified', $tenantCols, true)) {
                $pdo->exec("ALTER TABLE tenants ADD COLUMN `custom_domain_verified` TINYINT(1) NOT NULL DEFAULT 0 AFTER `custom_domain`");
            }
            if (!in_array('custom_domain_txt', $tenantCols, true)) {
                $pdo->exec("ALTER TABLE tenants ADD COLUMN `custom_domain_txt` VARCHAR(120) NULL AFTER `custom_domain_verified`");
            }

            // 3. Extend flipbooks table with Publication URL columns
            $fbCols = array_column(Db::all('SHOW COLUMNS FROM flipbooks'), 'Field');
            if (!in_array('public_slug', $fbCols, true)) {
                $pdo->exec("ALTER TABLE flipbooks ADD COLUMN `public_slug` VARCHAR(120) NULL AFTER `slug`");
                $pdo->exec("CREATE INDEX `idx_fb_tenant_pubslug` ON flipbooks (`tenant_id`, `public_slug`)");
            }
            if (!in_array('canonical_url', $fbCols, true)) {
                $pdo->exec("ALTER TABLE flipbooks ADD COLUMN `canonical_url` VARCHAR(255) NULL AFTER `public_slug`");
            }
            if (!in_array('slug_updated_at', $fbCols, true)) {
                $pdo->exec("ALTER TABLE flipbooks ADD COLUMN `slug_updated_at` DATETIME NULL AFTER `canonical_url`");
            }

            // 4. Backfill display_name on tenants and public_slug on flipbooks where missing
            $pdo->exec("UPDATE tenants SET display_name = TRIM(REPLACE(name, ' Workspace', '')) WHERE display_name IS NULL OR display_name = ''");
            $pdo->exec("UPDATE flipbooks SET public_slug = slug WHERE public_slug IS NULL OR public_slug = ''");
        } catch (Throwable $e) {
            error_log('PublisherIdentity::ensureSchema notice: ' . $e->getMessage());
        }
    }

    /**
     * Normalize any input into a clean lowercase URL slug (a-z, 0-9, single hyphens).
     */
    public static function sanitizeSlug(string $input, int $maxLength = 60): string
    {
        $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $input);
        $raw = strtolower(trim($ascii !== false ? $ascii : $input));
        $slug = trim(preg_replace('/[^a-z0-9]+/', '-', $raw) ?? '', '-');
        return substr($slug, 0, $maxLength);
    }

    /**
     * Validate a company slug and check if it is available (not reserved and not used by another tenant).
     *
     * @return array{valid: bool, available: bool, slug: string, reason?: string, suggestion?: string}
     */
    public static function checkCompanySlugAvailability(string $rawSlug, ?int $excludeTenantId = null): array
    {
        self::ensureSchema();
        $slug = self::sanitizeSlug($rawSlug, 60);

        if (strlen($slug) < 3) {
            return [
                'valid' => false,
                'available' => false,
                'slug' => $slug,
                'reason' => 'Company URL name must be at least 3 characters.',
            ];
        }

        if (in_array($slug, self::RESERVED_SLUGS, true)) {
            $suggestion = $slug . '-official';
            return [
                'valid' => false,
                'available' => false,
                'slug' => $slug,
                'reason' => 'This URL name is reserved by the platform.',
                'suggestion' => $suggestion,
            ];
        }

        // Check tenants table
        $existingTenant = $excludeTenantId
            ? Db::one('SELECT id FROM tenants WHERE slug = ? AND id != ?', [$slug, $excludeTenantId])
            : Db::one('SELECT id FROM tenants WHERE slug = ?', [$slug]);

        // Also check tenant_storefronts table
        $existingStorefront = null;
        try {
            $existingStorefront = $excludeTenantId
                ? Db::one('SELECT id FROM tenant_storefronts WHERE slug = ? AND tenant_id != ?', [$slug, $excludeTenantId])
                : Db::one('SELECT id FROM tenant_storefronts WHERE slug = ?', [$slug]);
        } catch (Throwable) {
        }

        if ($existingTenant || $existingStorefront) {
            $suggestion = $slug . '-fj';
            if (Db::one('SELECT id FROM tenants WHERE slug = ?', [$suggestion])) {
                $suggestion = $slug . '-' . random_int(10, 99);
            }
            return [
                'valid' => true,
                'available' => false,
                'slug' => $slug,
                'reason' => 'This company URL name is already taken.',
                'suggestion' => $suggestion,
            ];
        }

        return [
            'valid' => true,
            'available' => true,
            'slug' => $slug,
        ];
    }

    /**
     * Resolve a tenant by company slug (checking active tenants, storefronts, and historical redirects).
     *
     * @return array{tenant: ?array, redirectedFrom: ?string}
     */
    public static function resolveTenantBySlug(string $rawSlug): array
    {
        self::ensureSchema();
        $slug = strtolower(trim($rawSlug));
        if ($slug === '') {
            return ['tenant' => null, 'redirectedFrom' => null];
        }

        // 1. Direct match on tenants.slug
        $tenant = Db::one('SELECT * FROM tenants WHERE slug = ? LIMIT 1', [$slug]);
        if ($tenant) {
            return ['tenant' => $tenant, 'redirectedFrom' => null];
        }

        // 2. Match on tenant_storefronts.slug
        try {
            $sf = Db::one('SELECT tenant_id FROM tenant_storefronts WHERE slug = ? LIMIT 1', [$slug]);
            if ($sf && !empty($sf['tenant_id'])) {
                $tenant = Db::one('SELECT * FROM tenants WHERE id = ? LIMIT 1', [$sf['tenant_id']]);
                if ($tenant) {
                    return ['tenant' => $tenant, 'redirectedFrom' => null];
                }
            }
        } catch (Throwable) {
        }

        // 3. Historical slug redirect lookup
        try {
            $redir = Db::one(
                "SELECT entity_id, new_slug FROM slug_redirects WHERE entity_type = 'tenant' AND old_slug = ? ORDER BY id DESC LIMIT 1",
                [$slug]
            );
            if ($redir && !empty($redir['entity_id'])) {
                $tenant = Db::one('SELECT * FROM tenants WHERE id = ? LIMIT 1', [$redir['entity_id']]);
                if ($tenant) {
                    return ['tenant' => $tenant, 'redirectedFrom' => $slug];
                }
            }
        } catch (Throwable) {
        }

        return ['tenant' => null, 'redirectedFrom' => null];
    }

    /**
     * Resolve a publication belonging to a specific tenant by publication slug (or historical redirect).
     *
     * @return array{flipbook: ?array, redirectedFrom: ?string}
     */
    public static function resolvePublicationForTenant(int $tenantId, string $rawPubSlug): array
    {
        self::ensureSchema();
        $pubSlug = strtolower(trim($rawPubSlug));
        if ($pubSlug === '') {
            return ['flipbook' => null, 'redirectedFrom' => null];
        }

        // 1. Direct match on public_slug or slug within this tenant
        $f = Db::one(
            'SELECT * FROM flipbooks WHERE tenant_id = ? AND (public_slug = ? OR slug = ?) LIMIT 1',
            [$tenantId, $pubSlug, $pubSlug]
        );
        if ($f) {
            return ['flipbook' => $f, 'redirectedFrom' => null];
        }

        // 2. Historical publication slug redirect within this tenant
        try {
            $redir = Db::one(
                "SELECT entity_id FROM slug_redirects
                 WHERE entity_type = 'flipbook' AND old_slug = ? AND (tenant_id = ? OR tenant_id IS NULL)
                 ORDER BY id DESC LIMIT 1",
                [$pubSlug, $tenantId]
            );
            if ($redir && !empty($redir['entity_id'])) {
                $f = Db::one(
                    'SELECT * FROM flipbooks WHERE id = ? AND tenant_id = ? LIMIT 1',
                    [$redir['entity_id'], $tenantId]
                );
                if ($f) {
                    return ['flipbook' => $f, 'redirectedFrom' => $pubSlug];
                }
            }
        } catch (Throwable) {
        }

        return ['flipbook' => null, 'redirectedFrom' => null];
    }

    /**
     * Record a slug change in slug_redirects so previous URLs remain permanently resolvable.
     */
    public static function recordSlugChange(string $entityType, int $entityId, string $oldSlug, string $newSlug, ?int $tenantId = null): void
    {
        self::ensureSchema();
        $old = strtolower(trim($oldSlug));
        $new = strtolower(trim($newSlug));
        if ($old === '' || $new === '' || $old === $new) {
            return;
        }

        try {
            Db::run(
                'INSERT INTO slug_redirects (entity_type, entity_id, tenant_id, old_slug, new_slug)
                 VALUES (?, ?, ?, ?, ?)',
                [$entityType, $entityId, $tenantId, $old, $new]
            );
        } catch (Throwable) {
        }
    }

    /**
     * Build the canonical relative URL path for a publication: /{companySlug}/docs/{publicationSlug}
     */
    public static function buildCanonicalPath(?string $companySlug, string $publicationSlug): string
    {
        $cSlug = trim((string) $companySlug);
        $pSlug = trim($publicationSlug);
        if ($cSlug === '') {
            return "/v/{$pSlug}";
        }
        return "/{$cSlug}/docs/{$pSlug}";
    }
}
