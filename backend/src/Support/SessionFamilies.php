<?php
declare(strict_types=1);

namespace App\Support;

use Throwable;

/**
 * Explicit session-family identifiers.
 *
 * Every interactive login creates ONE session family. Refresh-token rotation keeps the family id, so a replayed
 * (already rotated) token revokes exactly that device/session chain instead of terminating every session the user has.
 */
final class SessionFamilies
{
    private static bool $ensured = false;
    private static bool $hasFamilyCol = false;

    public static function ensureSchema(): void
    {
        if (self::$ensured) {
            return;
        }
        self::$ensured = true;
        try {
            $pdo = Db::pdo();
            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS session_families (
                    id CHAR(32) NOT NULL PRIMARY KEY,
                    tenant_id BIGINT UNSIGNED NULL,
                    user_id BIGINT UNSIGNED NOT NULL,
                    user_agent VARCHAR(255) NULL,
                    ip VARCHAR(45) NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    last_rotated_at DATETIME NULL,
                    rotation_count INT UNSIGNED NOT NULL DEFAULT 0,
                    revoked_at DATETIME NULL,
                    revoked_reason VARCHAR(80) NULL,
                    INDEX idx_session_family_user (user_id, revoked_at),
                    INDEX idx_session_family_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
        } catch (Throwable) {
        }

        try {
            $col = Db::one(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'family_id' LIMIT 1"
            );
            if (!$col) {
                Db::pdo()->exec('ALTER TABLE refresh_tokens ADD COLUMN family_id CHAR(32) NULL, ADD INDEX idx_refresh_family (family_id)');
            }
            self::$hasFamilyCol = true;
        } catch (Throwable) {
            // Check once more if column already exists even if ALTER TABLE was restricted
            try {
                $col = Db::one(
                    "SELECT COLUMN_NAME FROM information_schema.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens' AND COLUMN_NAME = 'family_id' LIMIT 1"
                );
                self::$hasFamilyCol = $col !== null;
            } catch (Throwable) {
                self::$hasFamilyCol = false;
            }
        }
    }

    public static function hasFamilyColumn(): bool
    {
        self::ensureSchema();
        return self::$hasFamilyCol;
    }

    public static function create(array $user, ?string $userAgent, ?string $ip): string
    {
        self::ensureSchema();
        $id = bin2hex(random_bytes(16));
        try {
            Db::run(
                'INSERT INTO session_families (id, tenant_id, user_id, user_agent, ip) VALUES (?, ?, ?, ?, ?)',
                [$id, !empty($user['tenant_id']) ? (int) $user['tenant_id'] : null, (int) $user['id'], $userAgent, $ip]
            );
        } catch (Throwable) {
        }
        return $id;
    }

    /** Ensure a family exists for a legacy refresh-token row and return its id. */
    public static function adopt(array $tokenRow, array $user, ?string $userAgent, ?string $ip): string
    {
        self::ensureSchema();
        if (!empty($tokenRow['family_id'])) {
            return (string) $tokenRow['family_id'];
        }
        $id = self::create($user, $userAgent, $ip);
        if (self::$hasFamilyCol) {
            try {
                Db::run('UPDATE refresh_tokens SET family_id = ? WHERE id = ?', [$id, $tokenRow['id']]);
            } catch (Throwable) {
            }
        }
        return $id;
    }

    public static function markRotated(string $familyId): void
    {
        try {
            Db::run('UPDATE session_families SET last_rotated_at = NOW(), rotation_count = rotation_count + 1 WHERE id = ?', [$familyId]);
        } catch (Throwable) {
        }
    }

    /** Revoke a single session family (all its refresh tokens). Returns number of tokens revoked. */
    public static function revoke(string $familyId, string $reason): int
    {
        self::ensureSchema();
        try {
            Db::run('UPDATE session_families SET revoked_at = COALESCE(revoked_at, NOW()), revoked_reason = ? WHERE id = ?', [$reason, $familyId]);
            if (self::$hasFamilyCol) {
                return Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL', [$familyId]);
            }
            return 0;
        } catch (Throwable) {
            return 0;
        }
    }
}
