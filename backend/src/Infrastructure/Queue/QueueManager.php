<?php
declare(strict_types=1);

namespace App\Infrastructure\Queue;

use App\Support\Db;

/**
 * Infrastructure Queue Service.
 * Manages persistent conversion & notification jobs with exponential backoff retry and Dead-Letter Queue (DLQ) handling.
 *
 * Security Invariant:
 * - `stats()` and `retryDeadLetter()` strictly enforce `tenant_id` ownership unless `$isPlatformAdmin === true`.
 */
final class QueueManager
{
    /**
     * Move a permanently failed job into the Dead-Letter Queue (DLQ) for inspection or manual replay.
     */
    public static function moveToDeadLetter(
        ?int $tenantId,
        ?int $originalJobId,
        string $queueName,
        string $jobType,
        array $payload,
        string $exceptionClass,
        string $errorMessage,
        int $attempts = 3
    ): int {
        return Db::insert(
            "INSERT INTO dead_letter_jobs (tenant_id, original_job_id, queue_name, job_type, payload, exception_class, error_message, attempts, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'dead')",
            [
                $tenantId,
                $originalJobId,
                $queueName,
                $jobType,
                json_encode($payload),
                $exceptionClass,
                $errorMessage,
                $attempts,
            ]
        );
    }

    /**
     * Synchronize any failed conversion_jobs that exhausted max_attempts into dead_letter_jobs.
     */
    public static function syncExhaustedConversionJobs(?int $tenantId = null): void
    {
        try {
            $sql = "SELECT j.*, f.title AS flipbook_title
                    FROM jobs j
                    LEFT JOIN flipbooks f ON f.id = j.flipbook_id
                    WHERE j.status = 'failed'
                      AND NOT EXISTS (SELECT 1 FROM dead_letter_jobs dl WHERE dl.original_job_id = j.id)";
            $params = [];
            if ($tenantId !== null) {
                $sql .= " AND j.tenant_id = ?";
                $params[] = $tenantId;
            }
            $exhausted = Db::all($sql, $params);
            foreach ($exhausted as $job) {
                self::moveToDeadLetter(
                    isset($job['tenant_id']) ? (int) $job['tenant_id'] : null,
                    (int) $job['id'],
                    'document-processing',
                    'pdf_conversion',
                    [
                        'flipbook_id' => $job['flipbook_id'],
                        'flipbook_title' => $job['flipbook_title'] ?? ('Flipbook #' . $job['flipbook_id']),
                        'step' => $job['current_step'] ?? 'render_pages',
                    ],
                    'RuntimeException',
                    (string) ($job['error_message'] ?: 'Conversion worker exceeded retry threshold'),
                    max(1, (int) ($job['attempts'] ?? 1))
                );
            }
        } catch (\Throwable) {
            // ignore if table not ready
        }
    }

    public static function stats(?int $tenantId = null, bool $isPlatformAdmin = false): array
    {
        self::syncExhaustedConversionJobs($tenantId);

        $where = $tenantId !== null ? 'WHERE tenant_id = ?' : '';
        $params = $tenantId !== null ? [$tenantId] : [];

        $counts = ['queued' => 0, 'running' => 0, 'completed' => 0, 'failed' => 0];
        try {
            $counts = Db::one(
                "SELECT
                    COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0) AS queued,
                    COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) AS running,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
                    COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
                 FROM jobs {$where}",
                $params
            ) ?: $counts;
        } catch (\Throwable) {
        }

        if ($isPlatformAdmin) {
            $dlqRows = Db::all(
                "SELECT * FROM dead_letter_jobs " . ($tenantId !== null ? 'WHERE tenant_id = ? OR tenant_id IS NULL' : '') . " ORDER BY failed_at DESC LIMIT 25",
                $params
            );
        } else {
            $dlqRows = $tenantId !== null
                ? Db::all("SELECT * FROM dead_letter_jobs WHERE tenant_id = ? ORDER BY failed_at DESC LIMIT 25", [$tenantId])
                : [];
        }

        return [
            'driver' => 'persistent_mysql_with_redis_locks',
            'retryPolicy' => 'Exponential Backoff (max 3 attempts: 15s, 60s, 300s) -> Dead-Letter Queue',
            'queued' => (int) ($counts['queued'] ?? 0),
            'running' => (int) ($counts['running'] ?? 0),
            'completed' => (int) ($counts['completed'] ?? 0),
            'failed' => (int) ($counts['failed'] ?? 0),
            'deadLetterCount' => count(array_filter($dlqRows, fn($r) => $r['status'] === 'dead')),
            'deadLetterJobs' => array_map(fn($r) => [
                'id' => (int) $r['id'],
                'tenantId' => $r['tenant_id'] !== null ? (int) $r['tenant_id'] : null,
                'originalJobId' => $r['original_job_id'] ? (int) $r['original_job_id'] : null,
                'queueName' => $r['queue_name'],
                'jobType' => $r['job_type'],
                'payload' => json_decode((string) ($r['payload'] ?? '{}'), true) ?: [],
                'exceptionClass' => $r['exception_class'],
                'errorMessage' => $r['error_message'],
                'attempts' => (int) $r['attempts'],
                'status' => $r['status'],
                'failedAt' => $r['failed_at'],
                'requeuedAt' => $r['requeued_at'],
            ], $dlqRows),
        ];
    }

    /**
     * Retry a dead-letter job. Independently enforces strict tenant ownership unless $isPlatformAdmin is true.
     */
    public static function retryDeadLetter(int $dlqId, ?int $tenantId = null, bool $isPlatformAdmin = false): bool
    {
        if (!$isPlatformAdmin && $tenantId === null) {
            return false;
        }

        $dlq = $isPlatformAdmin
            ? Db::one('SELECT * FROM dead_letter_jobs WHERE id = ?', [$dlqId])
            : Db::one('SELECT * FROM dead_letter_jobs WHERE id = ? AND tenant_id = ?', [$dlqId, $tenantId]);

        if (!$dlq) {
            return false;
        }

        if (!empty($dlq['original_job_id'])) {
            try {
                if ($isPlatformAdmin) {
                    Db::run(
                        "UPDATE jobs SET status = 'queued', progress = 0, current_step = 'Requeued from Dead-Letter Queue', error_message = NULL WHERE id = ?",
                        [(int) $dlq['original_job_id']]
                    );
                } else {
                    Db::run(
                        "UPDATE jobs SET status = 'queued', progress = 0, current_step = 'Requeued from Dead-Letter Queue', error_message = NULL WHERE id = ? AND tenant_id = ?",
                        [(int) $dlq['original_job_id'], $tenantId]
                    );
                }
            } catch (\Throwable) {
            }
        }

        if ($isPlatformAdmin) {
            Db::run(
                "UPDATE dead_letter_jobs SET status = 'requeued', requeued_at = NOW() WHERE id = ?",
                [$dlqId]
            );
        } else {
            Db::run(
                "UPDATE dead_letter_jobs SET status = 'requeued', requeued_at = NOW() WHERE id = ? AND tenant_id = ?",
                [$dlqId, $tenantId]
            );
        }
        return true;
    }
}
