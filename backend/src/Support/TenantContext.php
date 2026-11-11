<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Centralized Tenant Context & Isolation Layer.
 * Holds current tenant state, active API key context, enforces scoping, and guards against IDOR data leakage.
 */
final class TenantContext
{
    private static ?int $currentTenantId = null;
    private static ?array $currentTenant = null;
    private static ?array $currentUser = null;
    private static ?array $currentApiKey = null;

    public static function set(array $user, ?array $tenant = null, ?array $apiKey = null): void
    {
        self::$currentUser = $user;
        self::$currentTenant = $tenant;
        self::$currentApiKey = $apiKey;
        self::$currentTenantId = $tenant ? (int) $tenant['id'] : (!empty($user['tenant_id']) ? (int) $user['tenant_id'] : null);
    }

    public static function reset(): void
    {
        self::$currentTenantId = null;
        self::$currentTenant = null;
        self::$currentUser = null;
        self::$currentApiKey = null;
    }

    public static function id(): ?int
    {
        return self::$currentTenantId;
    }

    public static function tenant(): ?array
    {
        return self::$currentTenant;
    }

    public static function user(): ?array
    {
        return self::$currentUser;
    }

    public static function apiKey(): ?array
    {
        return self::$currentApiKey;
    }

    public static function isApiKeyAuth(): bool
    {
        return self::$currentApiKey !== null;
    }

    public static function isSuperAdmin(): bool
    {
        // Note: API keys never inherit superadmin bypass
        if (self::$currentApiKey !== null) {
            return false;
        }
        return (self::$currentUser['role'] ?? '') === 'admin';
    }

    public static function can(string $permission): bool
    {
        return Rbac::can(self::$currentUser, $permission, self::$currentApiKey);
    }

    /**
     * Enforce tenant boundary on a given flipbook record.
     * Prevents cross-tenant IDOR access.
     * If $flipbook belongs to another tenant and user is not superadmin, returns false.
     */
    public static function canAccessFlipbook(array $flipbook): bool
    {
        if (self::isSuperAdmin()) {
            return true;
        }

        $userTenantId = self::$currentTenantId;
        $flipbookTenantId = !empty($flipbook['tenant_id']) ? (int) $flipbook['tenant_id'] : null;

        // If both are tenant-bound, they must strictly match
        if ($userTenantId !== null && $flipbookTenantId !== null) {
            return $userTenantId === $flipbookTenantId;
        }

        // Fallback for personal publications before tenant assignment: check user_id
        if (!empty(self::$currentUser['id']) && (int) $flipbook['user_id'] === (int) self::$currentUser['id']) {
            return true;
        }

        return false;
    }
}
