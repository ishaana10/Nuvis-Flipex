<?php
declare(strict_types=1);

namespace App\Support;

final class SessionSecurity
{
    public const DEFAULT_JWT_TTL = 3600; // 1 hour (was 15 mins)
    public const DEFAULT_REFRESH_DAYS = 30; // 30 days
    public const DEFAULT_SAMESITE = 'Lax';
    public const DEFAULT_IDLE_TIMEOUT_MINUTES = 0; // 0 = disabled
    public const DEFAULT_GRACE_SECONDS = 30; // 30 seconds token rotation grace period

    /**
     * Load active session security configuration from system_settings.
     */
    public static function getConfig(): array
    {
        $map = [];
        try {
            $rows = Db::all("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'session_%'");
            foreach ($rows as $r) {
                $map[$r['setting_key']] = $r['setting_value'];
            }
        } catch (\Throwable) {}

        $jwtTtl = isset($map['session_jwt_ttl_seconds']) ? max(300, min(2592000, (int) $map['session_jwt_ttl_seconds'])) : self::DEFAULT_JWT_TTL;
        $refreshDays = isset($map['session_refresh_days']) ? max(1, min(365, (int) $map['session_refresh_days'])) : self::DEFAULT_REFRESH_DAYS;
        $sameSite = in_array($map['session_cookie_samesite'] ?? '', ['Lax', 'Strict', 'None'], true) ? $map['session_cookie_samesite'] : self::DEFAULT_SAMESITE;
        $idleTimeout = isset($map['session_idle_timeout_minutes']) ? max(0, min(1440, (int) $map['session_idle_timeout_minutes'])) : self::DEFAULT_IDLE_TIMEOUT_MINUTES;
        $graceSeconds = isset($map['session_token_replay_grace_seconds']) ? max(5, min(120, (int) $map['session_token_replay_grace_seconds'])) : self::DEFAULT_GRACE_SECONDS;
        $keepalive = ($map['session_keepalive_enabled'] ?? '1') !== '0';

        return [
            'jwtTtlSeconds' => $jwtTtl,
            'refreshDays' => $refreshDays,
            'cookieSameSite' => $sameSite,
            'idleTimeoutMinutes' => $idleTimeout,
            'tokenReplayGraceSeconds' => $graceSeconds,
            'keepaliveEnabled' => $keepalive,
        ];
    }

    /**
     * Persist session security configuration into system_settings.
     */
    public static function saveConfig(array $data): array
    {
        $current = self::getConfig();
        $jwtTtl = isset($data['jwtTtlSeconds']) ? max(300, min(2592000, (int) $data['jwtTtlSeconds'])) : $current['jwtTtlSeconds'];
        $refreshDays = isset($data['refreshDays']) ? max(1, min(365, (int) $data['refreshDays'])) : $current['refreshDays'];
        $sameSite = isset($data['cookieSameSite']) && in_array($data['cookieSameSite'], ['Lax', 'Strict', 'None'], true) ? $data['cookieSameSite'] : $current['cookieSameSite'];
        $idleTimeout = isset($data['idleTimeoutMinutes']) ? max(0, min(1440, (int) $data['idleTimeoutMinutes'])) : $current['idleTimeoutMinutes'];
        $graceSeconds = isset($data['tokenReplayGraceSeconds']) ? max(5, min(120, (int) $data['tokenReplayGraceSeconds'])) : $current['tokenReplayGraceSeconds'];
        $keepalive = isset($data['keepaliveEnabled']) ? ($data['keepaliveEnabled'] ? '1' : '0') : ($current['keepaliveEnabled'] ? '1' : '0');

        $updates = [
            'session_jwt_ttl_seconds' => (string) $jwtTtl,
            'session_refresh_days' => (string) $refreshDays,
            'session_cookie_samesite' => $sameSite,
            'session_idle_timeout_minutes' => (string) $idleTimeout,
            'session_token_replay_grace_seconds' => (string) $graceSeconds,
            'session_keepalive_enabled' => $keepalive,
        ];

        foreach ($updates as $k => $v) {
            Db::run(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
                [$k, $v]
            );
        }

        return self::getConfig();
    }
}
