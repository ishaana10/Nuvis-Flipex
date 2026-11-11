<?php
declare(strict_types=1);

namespace App\Support;

use App\Database\TenantArchitectureMigration;
use Throwable;

/**
 * Transactional outbox.
 *
 * Business code calls Outbox::transaction(fn() => { ...state changes...; Outbox::enqueue(...); }) so that the
 * event is committed atomically with the database change. Delivery to webhooks / integrations happens later,
 * from `php bin/outbox_worker.php`, with retries, exponential back-off and a dead state after max attempts.
 */
final class Outbox
{
    private static bool $ensured = false;

    /** Create the event tables on demand — must run OUTSIDE any transaction (DDL causes an implicit commit). */
    public static function ensureSchema(): void
    {
        if (self::$ensured) {
            return;
        }
        self::$ensured = true;
        try {
            Db::pdo()->exec("CREATE TABLE IF NOT EXISTS outbox_events (
                id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
                tenant_id BIGINT UNSIGNED NOT NULL,
                event_uid CHAR(32) NOT NULL,
                aggregate_type VARCHAR(48) NOT NULL,
                aggregate_id BIGINT UNSIGNED NOT NULL,
                event_type VARCHAR(80) NOT NULL,
                payload JSON NOT NULL,
                status ENUM('pending','processing','delivered','failed','dead') NOT NULL DEFAULT 'pending',
                attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
                max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 6,
                next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                locked_at DATETIME NULL,
                delivered_at DATETIME NULL,
                last_error VARCHAR(500) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_outbox_uid (event_uid),
                INDEX idx_outbox_due (status, next_attempt_at),
                INDEX idx_outbox_tenant_agg (tenant_id, aggregate_type, aggregate_id)
            ) ENGINE=InnoDB");
        } catch (Throwable $e) {
            error_log('Outbox schema ensure failed: ' . $e->getMessage());
        }
    }

    /**
     * Run $work and everything it enqueues in ONE database transaction (re-entrant: joins an open transaction).
     * @template T
     * @param callable():T $work
     * @return T
     */
    public static function transaction(callable $work): mixed
    {
        $pdo = Db::pdo();
        if ($pdo->inTransaction()) {
            return $work();
        }
        self::ensureSchema();
        $pdo->beginTransaction();
        try {
            $result = $work();
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** Enqueue an event for a tenant. Call inside Outbox::transaction() so it is atomic with the state change. */
    public static function enqueue(int $tenantId, string $aggregateType, int $aggregateId, string $eventType, array $payload = []): string
    {
        if ($tenantId <= 0) {
            throw new TenantContextRequiredException('Outbox events require a tenant', 403);
        }
        $uid = bin2hex(random_bytes(16));
        if (!Db::pdo()->inTransaction()) {
            self::ensureSchema();
        }
        try {
            Db::run(
                'INSERT INTO outbox_events (tenant_id, event_uid, aggregate_type, aggregate_id, event_type, payload)
                 VALUES (?, ?, ?, ?, ?, ?)',
                [$tenantId, $uid, $aggregateType, $aggregateId, $eventType, json_encode($payload, JSON_UNESCAPED_SLASHES)]
            );
        } catch (Throwable $e) {
            error_log('Outbox enqueue warning: ' . $e->getMessage());
        }
        return $uid;
    }

    /**
     * Deliver due events to the owning tenant's active webhooks.
     * @return array{claimed:int, delivered:int, retried:int, dead:int}
     */
    public static function dispatchBatch(int $limit = 25): array
    {
        self::ensureSchema();
        $stats = ['claimed' => 0, 'delivered' => 0, 'retried' => 0, 'dead' => 0];
        $pdo = Db::pdo();

        // Claim a batch (SKIP LOCKED lets several workers run safely; older MySQL falls back to plain FOR UPDATE).
        $pdo->beginTransaction();
        try {
            $sql = "SELECT * FROM outbox_events
                    WHERE (status IN ('pending','failed') AND next_attempt_at <= NOW())
                       OR (status = 'processing' AND locked_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE))
                    ORDER BY id ASC LIMIT " . max(1, min(200, $limit));
            try {
                $rows = Db::all($sql . ' FOR UPDATE SKIP LOCKED');
            } catch (Throwable) {
                $rows = Db::all($sql . ' FOR UPDATE');
            }
            foreach ($rows as $r) {
                Db::run("UPDATE outbox_events SET status = 'processing', locked_at = NOW(), attempts = attempts + 1 WHERE id = ?", [$r['id']]);
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }

        foreach ($rows as $event) {
            $stats['claimed']++;
            $attempt = (int) $event['attempts'] + 1;
            try {
                $failure = self::deliver($event);
            } catch (Throwable $e) {
                $failure = $e->getMessage();
            }

            if ($failure === null) {
                Db::run("UPDATE outbox_events SET status = 'delivered', delivered_at = NOW(), locked_at = NULL, last_error = NULL WHERE id = ?", [$event['id']]);
                $stats['delivered']++;
            } elseif ($attempt >= (int) $event['max_attempts']) {
                Db::run("UPDATE outbox_events SET status = 'dead', locked_at = NULL, last_error = ? WHERE id = ?", [mb_substr($failure, 0, 500), $event['id']]);
                $stats['dead']++;
            } else {
                $backoff = min(3600, 15 * (2 ** ($attempt - 1)));
                Db::run(
                    "UPDATE outbox_events SET status = 'failed', locked_at = NULL, last_error = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL {$backoff} SECOND) WHERE id = ?",
                    [mb_substr($failure, 0, 500), $event['id']]
                );
                $stats['retried']++;
            }
        }

        return $stats;
    }

    /** @return string|null null on success, otherwise the failure reason */
    private static function deliver(array $event): ?string
    {
        $tenantId = (int) $event['tenant_id'];
        $data = json_decode((string) $event['payload'], true) ?: [];
        $data += ['event_uid' => $event['event_uid'], 'aggregate' => $event['aggregate_type'], 'aggregate_id' => (int) $event['aggregate_id']];

        // Tenant isolation: only the owning tenant's webhooks are ever considered.
        $hooks = Db::all('SELECT * FROM webhooks WHERE tenant_id = ? AND is_active = 1', [$tenantId]);
        $errors = [];
        foreach ($hooks as $hook) {
            $events = json_decode((string) ($hook['events'] ?? '[]'), true) ?: [];
            if (!in_array('*', $events, true) && !in_array($event['event_type'], $events, true)) {
                continue;
            }
            $result = WebhookDispatcher::deliver($hook, (string) $event['event_type'], $data);
            if ((int) $result['statusCode'] >= 400) {
                $errors[] = "webhook #{$hook['id']} responded {$result['statusCode']}";
            }
        }
        return $errors === [] ? null : implode('; ', $errors);
    }
}
