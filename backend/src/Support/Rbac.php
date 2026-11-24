<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Granular Role-Based Access Control (RBAC) & API Key Scope Enforcement.
 * Supports:
 *   1. System-wide Platform Administrator / Developer (user.role = 'admin') with unrestricted access.
 *   2. Dynamic Database-backed Tenant Roles (tenant_roles table) with customizable permissions per role.
 *   3. Granular User-level Custom Permissions Overrides (users.custom_permissions JSON array).
 *   4. Standard Role Defaults (owner, admin, editor, viewer, finance).
 *   5. Explicit API Key Scopes (flipbooks:read, flipbooks:write, erp:publish, analytics:read, webhooks:manage, billing:manage).
 */
final class Rbac
{
    public const SUPPORTED_API_SCOPES = [
        'flipbooks:read',
        'flipbooks:write',
        'erp:publish',
        'analytics:read',
        'webhooks:manage',
        'billing:manage',
    ];

    /**
     * Dictionary of all defined permissions with human-readable metadata, modules, and action types.
     */
    public const ALL_PERMISSIONS = [
        // Publications & Hotspots
        'flipbook.view'          => ['module' => 'publications', 'action' => 'read',   'label' => 'View Publications',         'desc' => 'Read and preview flipbooks and catalogs'],
        'flipbook.create'        => ['module' => 'publications', 'action' => 'write',  'label' => 'Upload Publications',       'desc' => 'Upload and create new flipbooks from PDF'],
        'flipbook.edit'          => ['module' => 'publications', 'action' => 'write',  'label' => 'Edit Publications',         'desc' => 'Edit flipbook settings, style, branding, and pages'],
        'flipbook.publish'       => ['module' => 'publications', 'action' => 'write',  'label' => 'Publish & Schedule',        'desc' => 'Publish, unpublish, and schedule publications'],
        'flipbook.delete'        => ['module' => 'publications', 'action' => 'delete', 'label' => 'Delete Publications',       'desc' => 'Permanently delete publications from workspace'],
        'hotspot.manage'         => ['module' => 'publications', 'action' => 'write',  'label' => 'Manage Hotspots',           'desc' => 'Add, reposition, and edit interactive links, videos, and products'],
        'erp.publish'            => ['module' => 'publications', 'action' => 'write',  'label' => 'ERP & API Sync',            'desc' => 'Sync publication updates via automated ERP pipeline'],

        // Analytics & Reporting
        'analytics.view'         => ['module' => 'analytics',    'action' => 'read',   'label' => 'View Analytics',            'desc' => 'View publication views, heatmaps, and export engagement reports'],

        // Team & Users
        'users.view'             => ['module' => 'team',         'action' => 'read',   'label' => 'View Team Members',         'desc' => 'View users and staff within the tenant workspace'],
        'users.invite'           => ['module' => 'team',         'action' => 'write',  'label' => 'Invite Team Members',       'desc' => 'Invite new users to the tenant workspace'],
        'users.manage'           => ['module' => 'team',         'action' => 'write',  'label' => 'Manage Users & Roles',      'desc' => 'Edit member roles, status, and custom permissions'],
        'roles.manage'           => ['module' => 'team',         'action' => 'admin',  'label' => 'Configure Role Manager',   'desc' => 'Customize role permissions and create custom roles'],

        // Workspace Settings & Integrations
        'settings.view'          => ['module' => 'settings',     'action' => 'read',   'label' => 'View Workspace Settings',   'desc' => 'View brand kits, tenant info, and general configuration'],
        'settings.manage'        => ['module' => 'settings',     'action' => 'write',  'label' => 'Manage Workspace Settings', 'desc' => 'Configure custom domain, brand kit, and connectors'],
        'api_keys.manage'        => ['module' => 'integrations', 'action' => 'write',  'label' => 'Manage API Keys',           'desc' => 'Generate, inspect, and revoke REST API keys'],
        'webhooks.manage'        => ['module' => 'integrations', 'action' => 'write',  'label' => 'Manage Webhooks',           'desc' => 'Configure webhook endpoints and test deliveries'],

        // Commercial Billing & Finance
        'billing.view'           => ['module' => 'billing',      'action' => 'read',   'label' => 'View Billing & Invoices',   'desc' => 'View subscription plans, payment receipts, and invoices'],
        'billing.manage'         => ['module' => 'billing',      'action' => 'write',  'label' => 'Manage Subscription',       'desc' => 'Upgrade, downgrade, cancel, or pay invoices'],
        'billing.reconcile'      => ['module' => 'billing',      'action' => 'admin',  'label' => 'Bank Reconciliation',       'desc' => 'Confirm Fiji bank transfers, manual reconciliation, and reversals'],

        // DevOps & Infrastructure
        'devops.overview'        => ['module' => 'devops',       'action' => 'read',   'label' => 'DevOps Overview',           'desc' => 'View tenant worker queues, processing metrics, and DLQ'],
        'devops.jobs'            => ['module' => 'devops',       'action' => 'write',  'label' => 'Retry Processing Jobs',     'desc' => 'Re-queue failed document conversion jobs'],
        'devops.backup_request'  => ['module' => 'devops',       'action' => 'write',  'label' => 'Request Workspace Backup',  'desc' => 'Generate complete workspace data and media backups'],
        'devops.backup_recovery' => ['module' => 'devops',       'action' => 'write',  'label' => 'Restore from Backup',       'desc' => 'Restore workspace data from backup snapshot'],
        'devops.platform_admin'  => ['module' => 'devops',       'action' => 'admin',  'label' => 'Platform Administration',   'desc' => 'Global infrastructure, migrations, and system telemetry'],

        // Danger Zone
        'tenant.delete'          => ['module' => 'settings',     'action' => 'delete', 'label' => 'Delete Tenant Workspace',   'desc' => 'Permanently delete tenant workspace and all contents'],
    ];

    /**
     * Secure fallback permissions matrix for standard roles.
     */
    public const DEFAULT_ROLE_PERMISSIONS = [
        'owner' => [
            'flipbook.view', 'flipbook.create', 'flipbook.edit', 'flipbook.publish', 'flipbook.delete', 'hotspot.manage', 'erp.publish',
            'analytics.view',
            'users.view', 'users.invite', 'users.manage', 'roles.manage',
            'settings.view', 'settings.manage',
            'api_keys.manage', 'webhooks.manage',
            'billing.view', 'billing.manage', 'billing.reconcile',
            'tenant.delete',
        ],
        'admin' => [
            'flipbook.view', 'flipbook.create', 'flipbook.edit', 'flipbook.publish', 'flipbook.delete', 'hotspot.manage', 'erp.publish',
            'analytics.view',
            'users.view', 'users.invite', 'users.manage', 'roles.manage',
            'settings.view', 'settings.manage',
            'api_keys.manage', 'webhooks.manage',
            'billing.view',
        ],
        'editor' => [
            'flipbook.view', 'flipbook.create', 'flipbook.edit', 'flipbook.publish', 'hotspot.manage',
            'analytics.view',
        ],
        'viewer' => [
            'flipbook.view',
            'analytics.view',
        ],
        'finance' => [
            'billing.view', 'billing.manage', 'billing.reconcile',
            'flipbook.view',
            'analytics.view',
        ],
    ];

    /**
     * Explicit mapping from internal RBAC permission to required API key scope(s).
     */
    private const PERMISSION_SCOPES = [
        'flipbook.view'          => ['flipbooks:read', 'flipbooks:write'],
        'flipbook.create'        => ['flipbooks:write'],
        'flipbook.edit'          => ['flipbooks:write'],
        'flipbook.publish'       => ['flipbooks:write', 'erp:publish'],
        'flipbook.delete'        => ['flipbooks:write'],
        'hotspot.manage'         => ['flipbooks:write', 'erp:publish'],
        'erp.publish'            => ['erp:publish'],
        'analytics.view'         => ['analytics:read'],
        'webhooks.manage'        => ['webhooks:manage'],
        'billing.view'           => ['billing:manage'],
        'billing.manage'         => ['billing:manage'],
        'billing.reconcile'      => [],
        'api_keys.manage'        => [],
        'users.view'             => [],
        'users.invite'           => [],
        'users.manage'           => [],
        'roles.manage'           => [],
        'settings.view'          => [],
        'settings.manage'        => [],
        'devops.overview'        => [],
        'devops.jobs'            => [],
        'devops.backup_request'  => [],
        'devops.backup_recovery' => [],
        'devops.platform_admin'  => [],
        'tenant.delete'          => [],
    ];

    /** In-memory role permission cache per request lifecycle */
    private static array $roleCache = [];
    private static bool $ensured = false;

    /**
     * Ensure the tenant_roles table and users.custom_permissions column exist on demand.
     * Idempotent and safe to run on boot or before any RBAC resolution.
     */
    public static function ensureSchema(): void
    {
        if (\App\Support\SchemaGuard::isCurrent('rbac')) {
            return;
        }
        self::ensureSchemaImpl();
        \App\Support\SchemaGuard::done('rbac');
    }

    private static function ensureSchemaImpl(): void
    {
        if (self::$ensured) {
            return;
        }
        self::$ensured = true;

        try {
            $pdo = Db::pdo();

            // 1. Ensure tenant_roles table exists
            $pdo->exec("CREATE TABLE IF NOT EXISTS tenant_roles (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tenant_id INT NULL,
                name VARCHAR(120) NOT NULL,
                slug VARCHAR(60) NOT NULL,
                description TEXT NULL,
                is_system TINYINT(1) NOT NULL DEFAULT 0,
                permissions JSON NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_tenant_slug (tenant_id, slug),
                INDEX idx_roles_tenant (tenant_id),
                INDEX idx_roles_slug (slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

            // 2. Ensure custom_permissions column exists on users
            $colCheck = $pdo->query("SHOW COLUMNS FROM users LIKE 'custom_permissions'")->fetch();
            if (!$colCheck) {
                $pdo->exec("ALTER TABLE users ADD COLUMN custom_permissions JSON NULL AFTER tenant_role");
            }

            // 3. Ensure tenant_role column is VARCHAR(60) instead of strict enum
            try {
                $pdo->exec("ALTER TABLE users MODIFY COLUMN tenant_role VARCHAR(60) NOT NULL DEFAULT 'editor'");
            } catch (\Throwable) {
                // Ignore if already modified or restricted
            }

            // 4. Seed system default roles into tenant_roles if empty
            $roleCount = (int) ($pdo->query("SELECT COUNT(*) FROM tenant_roles WHERE tenant_id IS NULL")->fetchColumn() ?: 0);
            if ($roleCount === 0) {
                $st = $pdo->prepare("INSERT INTO tenant_roles (tenant_id, name, slug, description, is_system, permissions) VALUES (NULL, ?, ?, ?, 1, ?)");
                foreach (self::DEFAULT_ROLE_PERMISSIONS as $slug => $perms) {
                    $name = match ($slug) {
                        'owner'   => 'Tenant Owner',
                        'admin'   => 'Tenant Administrator',
                        'editor'  => 'Content Editor',
                        'viewer'  => 'Viewer / Reader',
                        'finance' => 'Billing & Finance Manager',
                        default   => ucfirst($slug),
                    };
                    $desc = match ($slug) {
                        'owner'   => 'Full administrative, financial, and operational authority over the tenant workspace, publications, and team.',
                        'admin'   => 'Workspace administrator managing publications, hotspots, team members, integrations, and workspace settings.',
                        'editor'  => 'Creates, customizes, and publishes flipbooks and hotspots. Restricted from deleting publications, billing, devops, and tenant settings.',
                        'viewer'  => 'Read-only access to view publications, search content, and view basic engagement analytics.',
                        'finance' => 'Manages company billing, subscription invoices, payment submissions, and Fiji bank transfer reconciliations.',
                        default   => 'Workspace role template.',
                    };
                    $st->execute([$name, $slug, $desc, json_encode($perms)]);
                }
            } else {
                // Ensure system roles in tenant_roles do not contain devops permissions for tenants
                foreach (['owner', 'admin'] as $slug) {
                    if (isset(self::DEFAULT_ROLE_PERMISSIONS[$slug])) {
                        $st = $pdo->prepare("UPDATE tenant_roles SET permissions = ? WHERE slug = ? AND is_system = 1");
                        $st->execute([json_encode(self::DEFAULT_ROLE_PERMISSIONS[$slug]), $slug]);
                    }
                }
            }

            // 5. Ensure plans table has features and description columns for customizable plan capabilities
            $planCols = $pdo->query("SHOW COLUMNS FROM plans LIKE 'features'")->fetch();
            if (!$planCols) {
                try {
                    $pdo->exec("ALTER TABLE plans ADD COLUMN features JSON NULL, ADD COLUMN description VARCHAR(255) NULL");
                } catch (\Throwable) {}
            }

            // Seed default features on core plans 1, 2, 3 if empty
            try {
                $pdo->exec("UPDATE plans SET description = 'Essential features for personal magazines and hobbyists', features = '[\"Up to 3 Active Publications\", \"Standard Page Turn Animation\", \"Basic Viewer Analytics\", \"Community Support\"]' WHERE id = 1 AND (features IS NULL OR features = '' OR features = '[]')");
                $pdo->exec("UPDATE plans SET description = 'Professional tools for businesses and independent publishers', features = '[\"Up to 15 Active Publications\", \"Interactive Hotspots & Web Links\", \"Custom Branding & Styling\", \"Export CSV Engagement Reports\", \"Priority Email Support\"]' WHERE id = 2 AND (features IS NULL OR features = '' OR features = '[]')");
                $pdo->exec("UPDATE plans SET description = 'Full commercial power with white-label and unlimited scale', features = '[\"100+ Publications & Bulk Upload\", \"White-Label / Remove Branding\", \"Interactive Video & Product Links\", \"REST API & Webhooks Automation\", \"Custom CNAME Domain\", \"Dedicated Account SLA\"]' WHERE id = 3 AND (features IS NULL OR features = '' OR features = '[]')");
            } catch (\Throwable) {}
        } catch (\Throwable $e) {
            // Non-fatal error fallback
            error_log('Rbac::ensureSchema non-fatal: ' . $e->getMessage());
        }
    }

    /**
     * Get the full list of permission keys granted to a given user.
     */
    public static function getPermissionsForUser(?array $user): array
    {
        if (!$user) {
            return [];
        }

        self::ensureSchema();

        // Platform Superadmin / Developer has full unrestricted access
        if (($user['role'] ?? '') === 'admin') {
            return array_keys(self::ALL_PERMISSIONS);
        }

        // Check if user has explicit custom permissions overrides in their user record
        if (!empty($user['custom_permissions'])) {
            $custom = is_array($user['custom_permissions'])
                ? $user['custom_permissions']
                : json_decode((string) $user['custom_permissions'], true);

            if (is_array($custom) && !empty($custom)) {
                return array_values(array_unique(array_filter(array_map('strval', $custom))));
            }
        }

        $tenantRole = (string) ($user['tenant_role'] ?? 'editor');
        $tenantId = !empty($user['tenant_id']) ? (int) $user['tenant_id'] : null;

        return self::getPermissionsForRole($tenantRole, $tenantId);
    }

    /**
     * Get permission keys for a specific role slug and optional tenant.
     */
    public static function getPermissionsForRole(string $roleSlug, ?int $tenantId = null): array
    {
        $cacheKey = "{$roleSlug}:" . ($tenantId ?? 'global');
        if (isset(self::$roleCache[$cacheKey])) {
            return self::$roleCache[$cacheKey];
        }

        try {
            // First check database for tenant-specific or global role definition
            if ($tenantId !== null) {
                $row = Db::one(
                    'SELECT permissions FROM tenant_roles WHERE slug = ? AND (tenant_id = ? OR tenant_id IS NULL) ORDER BY tenant_id DESC LIMIT 1',
                    [$roleSlug, $tenantId]
                );
            } else {
                $row = Db::one(
                    'SELECT permissions FROM tenant_roles WHERE slug = ? AND tenant_id IS NULL LIMIT 1',
                    [$roleSlug]
                );
            }

            if ($row && !empty($row['permissions'])) {
                $decoded = is_array($row['permissions']) ? $row['permissions'] : json_decode((string) $row['permissions'], true);
                if (is_array($decoded)) {
                    $perms = array_values(array_unique(array_filter(array_map('strval', $decoded))));
                    self::$roleCache[$cacheKey] = $perms;
                    return $perms;
                }
            }
        } catch (\Throwable) {
            // database table might not be migrated yet; fallback to static matrix
        }

        // Fallback to static defaults
        $fallback = self::DEFAULT_ROLE_PERMISSIONS[$roleSlug] ?? self::DEFAULT_ROLE_PERMISSIONS['viewer'];
        self::$roleCache[$cacheKey] = $fallback;
        return $fallback;
    }

    public static function clearRoleCache(): void
    {
        self::$roleCache = [];
    }

    /**
     * Check whether a given user array (and optional active API key) has a specific permission.
     */
    public static function can(?array $user, string $permission, ?array $apiKey = null): bool
    {
        if (!$user) {
            return false;
        }

        // 1. Platform Superadmin / Developer bypasses tenant restrictions
        if (($user['role'] ?? '') === 'admin') {
            $hasUserPermission = true;
        } else {
            $perms = self::getPermissionsForUser($user);
            $hasUserPermission = in_array($permission, $perms, true);
        }

        if (!$hasUserPermission) {
            return false;
        }

        // 2. Enforce Explicit API Key Scope when authenticated via API key
        $activeKey = $apiKey ?? TenantContext::apiKey();
        if ($activeKey !== null) {
            $requiredScopes = self::PERMISSION_SCOPES[$permission] ?? [];
            if (empty($requiredScopes) || !self::apiKeyHasScope($activeKey, $requiredScopes)) {
                SecurityMonitor::logEvent(
                    'api_key_scope_violation',
                    'warning',
                    [
                        'api_key_id'          => $activeKey['id'] ?? null,
                        'key_prefix'          => $activeKey['key_prefix'] ?? null,
                        'required_permission' => $permission,
                        'required_scopes'     => $requiredScopes,
                        'granted_scopes'      => self::extractScopes($activeKey),
                    ],
                    (int) ($user['id'] ?? 0),
                    isset($user['tenant_id']) ? (int) $user['tenant_id'] : null
                );
                return false;
            }
        }

        return true;
    }

    /**
     * Extract normalized scope list from an api_keys row.
     */
    public static function extractScopes(array $apiKey): array
    {
        $raw = $apiKey['scopes'] ?? '[]';
        if (is_array($raw)) {
            $scopes = $raw;
        } elseif (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            $scopes = is_array($decoded) ? $decoded : [];
        } else {
            $scopes = [];
        }
        return array_values(array_unique(array_filter(array_map('strval', $scopes))));
    }

    /**
     * Check if an API key has at least one of the required scopes.
     */
    public static function apiKeyHasScope(array $apiKey, string|array $requiredScopes): bool
    {
        $requiredList = is_array($requiredScopes) ? $requiredScopes : [$requiredScopes];
        if (empty($requiredList)) {
            return false;
        }

        $granted = self::extractScopes($apiKey);
        foreach ($requiredList as $reqScope) {
            if (in_array($reqScope, $granted, true)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Ensure user (and active API key, if present) has permission or throw 403.
     */
    public static function authorize(?array $user, string $permission, ?array $apiKey = null): void
    {
        if (!self::can($user, $permission, $apiKey)) {
            $activeKey = $apiKey ?? TenantContext::apiKey();
            if ($activeKey !== null) {
                $needed = implode(' or ', self::PERMISSION_SCOPES[$permission] ?? ['session_auth_only']);
                throw new \RuntimeException("Forbidden: API key lacks required scope ({$needed}) for '{$permission}'", 403);
            }
            throw new \RuntimeException("Forbidden: requires permission '{$permission}'", 403);
        }
    }
}
