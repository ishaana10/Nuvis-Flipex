<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Granular Role-Based Access Control (RBAC) & API Key Scope Enforcement.
 * Supports System Roles (superadmin, support), Tenant Roles (owner, admin, finance, editor, viewer),
 * and explicit API Key Scopes (flipbooks:read, flipbooks:write, erp:publish, analytics:read, webhooks:manage, billing:manage).
 *
 * Security invariant:
 * Every operation checks BOTH:
 *   1. The user's RBAC permission.
 *   2. The API key's explicit scope (when authenticated via API key).
 * API keys NEVER inherit unrestricted permissions from their creator.
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

    private const PERMISSIONS = [
        // Publication permissions
        'flipbook.view'     => ['owner', 'admin', 'finance', 'editor', 'viewer'],
        'flipbook.create'   => ['owner', 'admin', 'editor'],
        'flipbook.edit'     => ['owner', 'admin', 'editor'],
        'flipbook.publish'  => ['owner', 'admin', 'editor'],
        'flipbook.delete'   => ['owner', 'admin'],
        'hotspot.manage'    => ['owner', 'admin', 'editor'],
        'erp.publish'       => ['owner', 'admin', 'editor'],
        'analytics.view'    => ['owner', 'admin', 'finance', 'editor', 'viewer'],

        // Tenant & integration management permissions
        'users.view'        => ['owner', 'admin', 'finance', 'editor'],
        'users.invite'      => ['owner', 'admin'],
        'users.manage'      => ['owner', 'admin'],
        'settings.manage'   => ['owner', 'admin', 'editor'],
        'api_keys.manage'   => ['owner', 'admin', 'editor'],
        'webhooks.manage'   => ['owner', 'admin', 'editor'],

        // Commercial billing & finance permissions
        'billing.view'      => ['owner', 'admin', 'finance', 'editor'],
        'billing.manage'    => ['owner', 'admin', 'finance', 'editor'],
        // Strict Finance / Owner / Platform Admin permission for invoice reconciliation & reversals
        'billing.reconcile' => ['owner', 'finance'],

        // DevOps & Infrastructure Control Areas (Split into Tenant vs Platform Operations)
        'devops.overview'        => ['owner', 'admin'],           // Tenant usage overview -> Tenant admin/owner or Platform admin
        'devops.jobs'            => ['owner', 'admin', 'editor'], // Tenant publication job status & DLQ retry -> Tenant editor/admin/owner
        'devops.backup_request'  => ['owner'],                    // Tenant backup requests -> Tenant owner or Platform admin
        'devops.backup_recovery' => ['owner'],                    // Backup verification/recovery -> Operations/Platform admin or Tenant owner (own tenant only)
        'devops.platform_admin'  => [],                           // Global migrations, error management & infrastructure -> Platform administrator ONLY

        // Danger zone
        'tenant.delete'     => ['owner'],
    ];

    /**
     * Explicit mapping from internal RBAC permission to required API key scope(s).
     * Empty array means the operation is strictly prohibited via API key authentication.
     */
    private const PERMISSION_SCOPES = [
        'flipbook.view'     => ['flipbooks:read', 'flipbooks:write'],
        'flipbook.create'   => ['flipbooks:write'],
        'flipbook.edit'     => ['flipbooks:write'],
        'flipbook.publish'  => ['flipbooks:write', 'erp:publish'],
        'flipbook.delete'   => ['flipbooks:write'],
        'hotspot.manage'    => ['flipbooks:write', 'erp:publish'],
        'erp.publish'       => ['erp:publish'],
        'analytics.view'    => ['analytics:read'],
        'webhooks.manage'   => ['webhooks:manage'],
        'billing.view'      => ['billing:manage'],
        'billing.manage'    => ['billing:manage'],
        // Sensitive administrative / financial reconciliation actions are never allowed via API keys
        'billing.reconcile' => [],
        'api_keys.manage'   => [],
        'users.view'        => [],
        'users.invite'      => [],
        'users.manage'      => [],
        'settings.manage'   => [],
        'devops.overview'        => [],
        'devops.jobs'            => [],
        'devops.backup_request'  => [],
        'devops.backup_recovery' => [],
        'devops.platform_admin'  => [],
        'tenant.delete'     => [],
    ];

    /**
     * Check whether a given user array (and optional active API key) has a specific permission.
     */
    public static function can(?array $user, string $permission, ?array $apiKey = null): bool
    {
        if (!$user) {
            return false;
        }

        // 1. Check User RBAC Permission
        $isPlatformAdmin = ($user['role'] ?? '') === 'admin';
        if ($isPlatformAdmin) {
            $hasUserPermission = true;
        } else {
            $tenantRole = $user['tenant_role'] ?? 'editor';
            $allowedRoles = self::PERMISSIONS[$permission] ?? [];
            $hasUserPermission = in_array($tenantRole, $allowedRoles, true);
        }

        if (!$hasUserPermission) {
            return false;
        }

        // 2. Enforce Explicit API Key Scope when authenticated via API key
        // API keys never inherit unrestricted permissions from their creator (even if creator is owner/admin).
        $activeKey = $apiKey ?? TenantContext::apiKey();
        if ($activeKey !== null) {
            $requiredScopes = self::PERMISSION_SCOPES[$permission] ?? [];
            if (empty($requiredScopes) || !self::apiKeyHasScope($activeKey, $requiredScopes)) {
                SecurityMonitor::logEvent(
                    'api_key_scope_violation',
                    'warning',
                    [
                        'api_key_id' => $activeKey['id'] ?? null,
                        'key_prefix' => $activeKey['key_prefix'] ?? null,
                        'required_permission' => $permission,
                        'required_scopes' => $requiredScopes,
                        'granted_scopes' => self::extractScopes($activeKey),
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
     *
     * @param array $apiKey
     * @param string|string[] $requiredScopes
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
