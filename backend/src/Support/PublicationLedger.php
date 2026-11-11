<?php
declare(strict_types=1);

namespace App\Support;

use Throwable;

/**
 * Tenant-scoped, append-only publication ledger (publication_events), approval trail (publication_approvals)
 * and issued access-token registry (publication_access_tokens).
 * Writes are best-effort so the ledger can never break the user-facing operation; the tables are created by migration v7.
 */
final class PublicationLedger
{
    public static function event(int $tenantId, int $flipbookId, string $type, ?int $actorUserId = null, ?string $from = null, ?string $to = null, array $meta = []): void
    {
        if ($tenantId <= 0) {
            return;
        }
        try {
            Db::run(
                'INSERT INTO publication_events (tenant_id, flipbook_id, event_type, actor_user_id, from_status, to_status, meta)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$tenantId, $flipbookId, $type, $actorUserId, $from, $to, $meta ? json_encode($meta) : null]
            );
        } catch (Throwable $e) {
            error_log('PublicationLedger event failed: ' . $e->getMessage());
        }
    }

    /** Record review-stage transitions as approval decisions (in_review → requested, published/editing/scheduled after review → approved/rejected). */
    public static function approval(int $tenantId, int $flipbookId, int $version, string $decision, ?int $actorUserId, ?string $notes = null): void
    {
        if ($tenantId <= 0) {
            return;
        }
        try {
            if ($decision === 'requested') {
                Db::run(
                    "INSERT INTO publication_approvals (tenant_id, flipbook_id, version, requested_by, decision, notes) VALUES (?, ?, ?, ?, 'requested', ?)",
                    [$tenantId, $flipbookId, $version, $actorUserId, $notes]
                );
                return;
            }
            Db::run(
                "INSERT INTO publication_approvals (tenant_id, flipbook_id, version, requested_by, decided_by, decision, notes, decided_at)
                 VALUES (?, ?, ?, NULL, ?, ?, ?, NOW())",
                [$tenantId, $flipbookId, $version, $actorUserId, $decision, $notes]
            );
        } catch (Throwable $e) {
            error_log('PublicationLedger approval failed: ' . $e->getMessage());
        }
    }

    public static function tokenIssued(int $tenantId, int $flipbookId, string $jti, int $expiresAtTs, string $kind = 'unlock', ?string $ip = null, ?string $ua = null): void
    {
        if ($tenantId <= 0) {
            return;
        }
        try {
            Db::run(
                'INSERT IGNORE INTO publication_access_tokens (tenant_id, flipbook_id, jti, kind, ip, user_agent, expires_at)
                 VALUES (?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))',
                [$tenantId, $flipbookId, $jti, $kind, $ip, $ua !== null ? substr($ua, 0, 255) : null, $expiresAtTs]
            );
        } catch (Throwable) {
        }
    }

    public static function tokenRevoked(string $jti, string $reason): void
    {
        try {
            Db::run(
                'UPDATE publication_access_tokens SET revoked_at = COALESCE(revoked_at, NOW()), revoked_reason = ? WHERE jti = ?',
                [$reason, $jti]
            );
        } catch (Throwable) {
        }
    }

    public static function allTokensRevoked(int $tenantId, int $flipbookId, string $reason): void
    {
        try {
            Db::run(
                'UPDATE publication_access_tokens SET revoked_at = COALESCE(revoked_at, NOW()), revoked_reason = ?
                 WHERE tenant_id = ? AND flipbook_id = ? AND revoked_at IS NULL',
                [$reason, $tenantId, $flipbookId]
            );
        } catch (Throwable) {
        }
    }
}
