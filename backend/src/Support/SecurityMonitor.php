<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Security Monitoring & Threat Detection Engine.
 * Monitors failed logins, rate limit breaches, token replay attacks, and IDOR probes.
 */
final class SecurityMonitor
{
    public const MAX_FAILED_ATTEMPTS = 5;
    public const LOCKOUT_MINUTES = 15;

    public static function logEvent(
        string $eventType,
        string $severity = 'info',
        array $details = [],
        ?int $userId = null,
        ?int $tenantId = null
    ): void {
        try {
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $ua = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
            $effectiveTenantId = $tenantId ?? TenantContext::id();
            $effectiveUserId = $userId ?? (!empty(TenantContext::user()['id']) ? (int) TenantContext::user()['id'] : null);

            Db::run(
                'INSERT INTO security_events (tenant_id, user_id, event_type, severity, ip, user_agent, details)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    $effectiveTenantId,
                    $effectiveUserId,
                    $eventType,
                    $severity,
                    $ip,
                    $ua,
                    !empty($details) ? json_encode($details) : null
                ]
            );
        } catch (\Throwable $e) {
            error_log('Security event logging failed: ' . $e->getMessage());
        }
    }

    /** Record a failed login attempt; lock out if threshold exceeded */
    public static function recordFailedLogin(string $email): void
    {
        $user = Db::one('SELECT id, failed_login_attempts FROM users WHERE email = ?', [$email]);
        if ($user) {
            $attempts = (int) $user['failed_login_attempts'] + 1;
            $lockout = null;
            if ($attempts >= self::MAX_FAILED_ATTEMPTS) {
                $lockout = date('Y-m-d H:i:s', time() + (self::LOCKOUT_MINUTES * 60));
                self::logEvent('account_lockout', 'warning', [
                    'email' => $email,
                    'attempts' => $attempts,
                    'lockoutUntil' => $lockout,
                ], (int) $user['id']);
            } else {
                self::logEvent('failed_login', 'info', [
                    'email' => $email,
                    'attempts' => $attempts,
                ], (int) $user['id']);
            }

            Db::run(
                'UPDATE users SET failed_login_attempts = ?, lockout_until = ? WHERE id = ?',
                [$attempts, $lockout, $user['id']]
            );
        } else {
            self::logEvent('failed_login_unknown_user', 'info', ['email' => $email]);
        }
    }

    /** Clear failed attempts after successful login */
    public static function resetFailedLogin(int $userId): void
    {
        Db::run('UPDATE users SET failed_login_attempts = 0, lockout_until = NULL WHERE id = ?', [$userId]);
    }

    /** Check if account is locked out */
    public static function isLockedOut(array $user): bool
    {
        if (empty($user['lockout_until'])) {
            return false;
        }
        return strtotime((string) $user['lockout_until']) > time();
    }
}
