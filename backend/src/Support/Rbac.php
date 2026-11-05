<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Granular Role-Based Access Control (RBAC)
 * Supports System Roles (superadmin, support) and Tenant Roles (owner, admin, editor, viewer).
 */
final class Rbac
{
    private const PERMISSIONS = [
        // Publication permissions
        'flipbook.view'     => ['owner', 'admin', 'editor', 'viewer'],
        'flipbook.create'   => ['owner', 'admin', 'editor'],
        'flipbook.edit'     => ['owner', 'admin', 'editor'],
        'flipbook.publish'  => ['owner', 'admin', 'editor'],
        'flipbook.delete'   => ['owner', 'admin'],
        'hotspot.manage'    => ['owner', 'admin', 'editor'],
        'analytics.view'    => ['owner', 'admin', 'editor', 'viewer'],

        // Tenant management permissions
        'users.view'        => ['owner', 'admin', 'editor'],
        'users.invite'      => ['owner', 'admin'],
        'users.manage'      => ['owner', 'admin'],
        'settings.manage'   => ['owner', 'admin'],
        'billing.view'      => ['owner', 'admin', 'editor'],
        'api_keys.manage'   => ['owner', 'admin'],
        'webhooks.manage'   => ['owner', 'admin'],

        // Danger zone
        'tenant.delete'     => ['owner'],
    ];

    /** Check whether a given user array has a specific permission */
    public static function can(?array $user, string $permission): bool
    {
        if (!$user) {
            return false;
        }

        // Platform Super Administrator has full universal permission
        if (($user['role'] ?? '') === 'admin') {
            return true;
        }

        $tenantRole = $user['tenant_role'] ?? 'editor';
        $allowedRoles = self::PERMISSIONS[$permission] ?? [];

        return in_array($tenantRole, $allowedRoles, true);
    }

    /** Ensure user has permission or throw 403 */
    public static function authorize(?array $user, string $permission): void
    {
        if (!self::can($user, $permission)) {
            throw new \RuntimeException("Forbidden: requires permission '$permission'", 403);
        }
    }
}
