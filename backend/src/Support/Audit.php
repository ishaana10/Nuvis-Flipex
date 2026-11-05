<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Centralized Audit Trail Logger.
 * Records all sensitive administrative, user, tenant, and billing actions.
 */
final class Audit
{
    public static function log(
        string $action,
        ?string $targetType = null,
        ?int $targetId = null,
        array $meta = [],
        ?int $userId = null,
        ?int $tenantId = null
    ): void {
        try {
            $user = TenantContext::user();
            $effectiveUserId = $userId ?? (!empty($user['id']) ? (int) $user['id'] : null);
            $effectiveTenantId = $tenantId ?? TenantContext::id();

            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);

            Db::run(
                'INSERT INTO audit_logs (tenant_id, user_id, action, target_type, target_id, meta, ip, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $effectiveTenantId,
                    $effectiveUserId,
                    $action,
                    $targetType,
                    $targetId,
                    !empty($meta) ? json_encode($meta) : null,
                    $ip,
                    $ua
                ]
            );
        } catch (\Throwable $e) {
            // Audit logging should never break core execution, but output to error log
            error_log('Audit logging failed: ' . $e->getMessage());
        }
    }
}
