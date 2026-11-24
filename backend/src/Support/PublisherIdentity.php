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
        if (\App\Support\SchemaGuard::isCurrent('publisher_identity')) {
            return;
        }
        self::ensureSchemaImpl();
        \App\Support\SchemaGuard::done('publisher_identity');
    }

    private static function ensureSchemaImpl(): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        self::$schemaEnsured = true;

        try {
            $pdo = Db::pdo();

            // 1. Slug History & Redirects Table
            try {
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
            } catch (Throwable) {
            }

            // 2. Extend tenants table with Publisher Identity columns (each column isolated)
            $tenantCols = [];
            try {
                foreach (Db::all('SHOW COLUMNS FROM tenants') as $colRow) {
                    $colName = (string) ($colRow['Field'] ?? $colRow['field'] ?? '');
                    if ($colName !== '') {
                        $tenantCols[] = strtolower($colName);
                    }
                }
            } catch (Throwable) {
            }

            $tenantAlters = [
                'display_name' => "ALTER TABLE tenants ADD COLUMN `display_name` VARCHAR(150) NULL AFTER `name`",
                'slug_updated_at' => "ALTER TABLE tenants ADD COLUMN `slug_updated_at` DATETIME NULL AFTER `slug`",
                'public_profile_enabled' => "ALTER TABLE tenants ADD COLUMN `public_profile_enabled` TINYINT(1) NOT NULL DEFAULT 1",
                'custom_domain' => "ALTER TABLE tenants ADD COLUMN `custom_domain` VARCHAR(255) NULL",
                'custom_domain_verified' => "ALTER TABLE tenants ADD COLUMN `custom_domain_verified` TINYINT(1) NOT NULL DEFAULT 0",
                'custom_domain_txt' => "ALTER TABLE tenants ADD COLUMN `custom_domain_txt` VARCHAR(120) NULL",
            ];
            foreach ($tenantAlters as $col => $sql) {
                if (!in_array($col, $tenantCols, true)) {
                    try {
                        $pdo->exec($sql);
                    } catch (Throwable) {
                    }
                }
            }

            // 3. Extend flipbooks table with Publication URL columns (each column isolated)
            $fbCols = [];
            try {
                foreach (Db::all('SHOW COLUMNS FROM flipbooks') as $colRow) {
                    $colName = (string) ($colRow['Field'] ?? $colRow['field'] ?? '');
                    if ($colName !== '') {
                        $fbCols[] = strtolower($colName);
                    }
                }
            } catch (Throwable) {
            }

            if (!in_array('public_slug', $fbCols, true)) {
                try {
                    $pdo->exec("ALTER TABLE flipbooks ADD COLUMN `public_slug` VARCHAR(120) NULL AFTER `slug`");
                } catch (Throwable) {
                }
                try {
                    $pdo->exec("CREATE INDEX `idx_fb_tenant_pubslug` ON flipbooks (`tenant_id`, `public_slug`)");
                } catch (Throwable) {
                }
            }
            if (!in_array('canonical_url', $fbCols, true)) {
                try {
                    $pdo->exec("ALTER TABLE flipbooks ADD COLUMN `canonical_url` VARCHAR(255) NULL");
                } catch (Throwable) {
                }
            }
            if (!in_array('slug_updated_at', $fbCols, true)) {
                try {
                    $pdo->exec("ALTER TABLE flipbooks ADD COLUMN `slug_updated_at` DATETIME NULL");
                } catch (Throwable) {
                }
            }

            // 4. Backfill display_name on tenants and public_slug on flipbooks where missing
            try {
                $pdo->exec("UPDATE tenants SET display_name = TRIM(REPLACE(name, ' Workspace', '')) WHERE display_name IS NULL OR display_name = ''");
            } catch (Throwable) {
            }
            try {
                $pdo->exec("UPDATE flipbooks SET public_slug = slug WHERE public_slug IS NULL OR public_slug = ''");
            } catch (Throwable) {
            }
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
     * Validate a company slug and check if it is available (not reserved and not used by another tenant or historical redirect).
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

        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
            return [
                'valid' => false,
                'available' => false,
                'slug' => $slug,
                'reason' => 'Company URL name can only contain lowercase alphanumeric characters and single hyphens.',
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

        // 1. Check tenants table
        $existingTenant = null;
        try {
            $existingTenant = $excludeTenantId
                ? Db::one('SELECT id FROM tenants WHERE slug = ? AND id != ?', [$slug, $excludeTenantId])
                : Db::one('SELECT id FROM tenants WHERE slug = ?', [$slug]);
        } catch (Throwable) {
        }

        // 2. Check tenant_storefronts table
        $existingStorefront = null;
        try {
            $existingStorefront = $excludeTenantId
                ? Db::one('SELECT id FROM tenant_storefronts WHERE slug = ? AND tenant_id != ?', [$slug, $excludeTenantId])
                : Db::one('SELECT id FROM tenant_storefronts WHERE slug = ?', [$slug]);
        } catch (Throwable) {
        }

        // 3. Check slug_redirects table (anti-squatting / preserve redirects for other tenants)
        $existingRedirect = null;
        try {
            $existingRedirect = $excludeTenantId
                ? Db::one("SELECT id, entity_id FROM slug_redirects WHERE entity_type = 'tenant' AND old_slug = ? AND entity_id != ? LIMIT 1", [$slug, $excludeTenantId])
                : Db::one("SELECT id, entity_id FROM slug_redirects WHERE entity_type = 'tenant' AND old_slug = ? LIMIT 1", [$slug]);
        } catch (Throwable) {
        }

        if ($existingTenant || $existingStorefront || $existingRedirect) {
            $suggestion = $slug . '-fj';
            if (Db::one('SELECT id FROM tenants WHERE slug = ?', [$suggestion])) {
                $suggestion = $slug . '-' . random_int(10, 99);
            }
            $reason = $existingRedirect && !$existingTenant && !$existingStorefront
                ? 'This company URL name was previously used and is reserved for redirects.'
                : 'This company URL name is already taken.';
            return [
                'valid' => true,
                'available' => false,
                'slug' => $slug,
                'reason' => $reason,
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
     * Resolve a tenant by company slug (strictly checking active tenants, storefronts, and historical redirects).
     * Unknown or fuzzy slugs strictly return null / 404 without guessing.
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
        try {
            $tenant = Db::one('SELECT * FROM tenants WHERE slug = ? LIMIT 1', [$slug]);
            if ($tenant) {
                return ['tenant' => $tenant, 'redirectedFrom' => null];
            }
        } catch (Throwable) {
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

        // Strict 404 on all other inputs (no guessing, fuzzy matching, or single-tenant fallback)
        return ['tenant' => null, 'redirectedFrom' => null];
    }

    /**
     * Atomically change a company's URL slug, creating a historical redirect
     * and updating all dependent publication canonical URLs within a single transaction.
     *
     * @return array{success: bool, oldSlug: string, newSlug: string, reason?: string}
     */
    public static function changeCompanySlug(int $tenantId, string $rawNewSlug, ?int $userId = null): array
    {
        self::ensureSchema();
        $pdo = Db::pdo();

        $avail = self::checkCompanySlugAvailability($rawNewSlug, $tenantId);
        if (!$avail['available']) {
            return [
                'success' => false,
                'oldSlug' => '',
                'newSlug' => $avail['slug'],
                'reason' => $avail['reason'] ?? 'Slug is not available.',
            ];
        }

        $newSlug = $avail['slug'];

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT id, slug FROM tenants WHERE id = ? FOR UPDATE');
            $stmt->execute([$tenantId]);
            $tenant = $stmt->fetch();
            if (!$tenant) {
                $pdo->rollBack();
                return ['success' => false, 'oldSlug' => '', 'newSlug' => $newSlug, 'reason' => 'Tenant not found.'];
            }

            $oldSlug = strtolower(trim((string) ($tenant['slug'] ?? '')));
            if ($oldSlug === $newSlug) {
                $pdo->commit();
                return ['success' => true, 'oldSlug' => $oldSlug, 'newSlug' => $newSlug];
            }

            // 1. Record historical redirect if old slug was set
            if ($oldSlug !== '') {
                $ins = $pdo->prepare("
                    INSERT INTO slug_redirects (entity_type, entity_id, tenant_id, old_slug, new_slug, created_at)
                    VALUES ('tenant', ?, ?, ?, ?, NOW())
                ");
                $ins->execute([$tenantId, $tenantId, $oldSlug, $newSlug]);
            }

            // 2. Update tenants table
            $updT = $pdo->prepare('UPDATE tenants SET slug = ?, slug_updated_at = NOW() WHERE id = ?');
            $updT->execute([$newSlug, $tenantId]);

            // 3. Sync tenant_storefronts table
            try {
                $updS = $pdo->prepare('UPDATE tenant_storefronts SET slug = ? WHERE tenant_id = ?');
                $updS->execute([$newSlug, $tenantId]);
            } catch (Throwable) {
            }

            // 4. Update canonical URLs for all flipbooks belonging to this tenant
            $updFb = $pdo->prepare("
                UPDATE flipbooks
                SET canonical_url = CONCAT('/', ?, '/docs/', COALESCE(NULLIF(public_slug, ''), slug))
                WHERE tenant_id = ?
            ");
            $updFb->execute([$newSlug, $tenantId]);

            $pdo->commit();
            return ['success' => true, 'oldSlug' => $oldSlug, 'newSlug' => $newSlug];
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('PublisherIdentity::changeCompanySlug error: ' . $e->getMessage());
            return ['success' => false, 'oldSlug' => '', 'newSlug' => $newSlug, 'reason' => 'Database error: ' . $e->getMessage()];
        }
    }

    /**
     * Atomically change a publication's public slug within a tenant, creating a historical redirect.
     *
     * @return array{success: bool, oldSlug: string, newSlug: string, canonicalUrl: string, reason?: string}
     */
    public static function changePublicationSlug(int $tenantId, int $flipbookId, string $rawNewSlug): array
    {
        self::ensureSchema();
        $pdo = Db::pdo();
        $newSlug = self::sanitizeSlug($rawNewSlug, 80);

        if (strlen($newSlug) < 2) {
            return ['success' => false, 'oldSlug' => '', 'newSlug' => $newSlug, 'canonicalUrl' => '', 'reason' => 'Publication slug must be at least 2 characters.'];
        }

        if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $newSlug)) {
            return ['success' => false, 'oldSlug' => '', 'newSlug' => $newSlug, 'canonicalUrl' => '', 'reason' => 'Publication slug can only contain lowercase alphanumeric characters and hyphens.'];
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare('SELECT id, tenant_id, slug, public_slug FROM flipbooks WHERE id = ? AND tenant_id = ? FOR UPDATE');
            $stmt->execute([$flipbookId, $tenantId]);
            $fb = $stmt->fetch();
            if (!$fb) {
                $pdo->rollBack();
                return ['success' => false, 'oldSlug' => '', 'newSlug' => $newSlug, 'canonicalUrl' => '', 'reason' => 'Publication not found.'];
            }

            // Check if slug is taken by another publication of this tenant
            $chk = $pdo->prepare('SELECT id FROM flipbooks WHERE tenant_id = ? AND (public_slug = ? OR slug = ?) AND id != ?');
            $chk->execute([$tenantId, $newSlug, $newSlug, $flipbookId]);
            if ($chk->fetch()) {
                $pdo->rollBack();
                return ['success' => false, 'oldSlug' => '', 'newSlug' => $newSlug, 'canonicalUrl' => '', 'reason' => 'A publication with this URL name already exists in your account.'];
            }

            // Check slug_redirects within this tenant
            $chkRedir = $pdo->prepare("SELECT id, entity_id FROM slug_redirects WHERE entity_type = 'flipbook' AND tenant_id = ? AND old_slug = ? AND entity_id != ?");
            $chkRedir->execute([$tenantId, $newSlug, $flipbookId]);
            if ($chkRedir->fetch()) {
                $pdo->rollBack();
                return ['success' => false, 'oldSlug' => '', 'newSlug' => $newSlug, 'canonicalUrl' => '', 'reason' => 'This publication URL was previously used and is reserved for redirects.'];
            }

            $oldSlug = (string) (!empty($fb['public_slug']) ? $fb['public_slug'] : $fb['slug']);
            if ($oldSlug !== $newSlug && $oldSlug !== '') {
                $ins = $pdo->prepare("
                    INSERT INTO slug_redirects (entity_type, entity_id, tenant_id, old_slug, new_slug, created_at)
                    VALUES ('flipbook', ?, ?, ?, ?, NOW())
                ");
                $ins->execute([$flipbookId, $tenantId, $oldSlug, $newSlug]);
            }

            // Get tenant slug for canonical_url
            $tStmt = $pdo->prepare('SELECT slug FROM tenants WHERE id = ?');
            $tStmt->execute([$tenantId]);
            $tenant = $tStmt->fetch();
            $tenantSlug = $tenant ? (string) $tenant['slug'] : '';
            $canonicalUrl = self::buildCanonicalPath($tenantSlug, $newSlug);

            $upd = $pdo->prepare('UPDATE flipbooks SET public_slug = ?, canonical_url = ?, slug_updated_at = NOW() WHERE id = ? AND tenant_id = ?');
            $upd->execute([$newSlug, $canonicalUrl, $flipbookId, $tenantId]);

            $pdo->commit();
            return ['success' => true, 'oldSlug' => $oldSlug, 'newSlug' => $newSlug, 'canonicalUrl' => $canonicalUrl];
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('PublisherIdentity::changePublicationSlug error: ' . $e->getMessage());
            return ['success' => false, 'oldSlug' => '', 'newSlug' => $newSlug, 'canonicalUrl' => '', 'reason' => 'Database error: ' . $e->getMessage()];
        }
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
        $f = null;
        try {
            $f = Db::one(
                'SELECT * FROM flipbooks WHERE tenant_id = ? AND (public_slug = ? OR slug = ?) LIMIT 1',
                [$tenantId, $pubSlug, $pubSlug]
            );
        } catch (Throwable) {
        }
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
