<?php
declare(strict_types=1);

namespace App\Support;

use RuntimeException;
use Throwable;

/**
 * Nuvis Flipex — Unified Job Queue Runner (CLI Daemon, Cron --once, and Web Auto-Drain)
 *
 * Ensures PDF conversions run seamlessly both on dedicated servers (via `php bin/worker.php`)
 * and on shared/cPanel hosting (like A2 Hosting) where background daemons are not persistent.
 */
final class JobRunner
{
    /**
     * Attempt to spawn a non-blocking background CLI worker (`php bin/worker.php --once`)
     * right after a job is queued. Safe no-op if `exec` is disabled on the host.
     */
    public static function triggerAsyncCliWorker(): void
    {
        if (!function_exists('exec')) {
            return;
        }
        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        if (in_array('exec', $disabled, true)) {
            return;
        }

        $workerScript = realpath(__DIR__ . '/../../bin/worker.php');
        if (!$workerScript || !file_exists($workerScript)) {
            return;
        }

        if (PHP_OS_FAMILY === 'Windows') {
            return; // On Windows local dev, daemon or web auto-drain handles queue
        }

        $phpBin = PHP_BINARY && is_executable(PHP_BINARY) && !str_contains(PHP_BINARY, 'fpm') && !str_contains(PHP_BINARY, 'lsphp')
            ? PHP_BINARY
            : 'php';

        $cmd = escapeshellcmd($phpBin) . ' ' . escapeshellarg($workerScript) . ' --once > /dev/null 2>&1 &';
        @exec($cmd);
    }

    /**
     * Claim and process the next available queued job.
     *
     * @return array{processed: bool, jobId?: int, flipbookId?: int, status?: string, error?: string}
     */
    public static function processNextJob(): array
    {
        @ini_set('memory_limit', '512M');
        if (function_exists('set_time_limit')) {
            @set_time_limit(300);
        }
        if (function_exists('ignore_user_abort')) {
            @ignore_user_abort(true);
        }

        self::processScheduledLifecycle();

        $job = self::claim();
        if (!$job) {
            return ['processed' => false];
        }

        $jobId = (int) $job['id'];
        $payload = json_decode((string) $job['payload'], true) ?: [];
        $flipbookId = (int) ($job['flipbook_id'] ?? $payload['flipbook_id'] ?? 0);
        $timeoutSeconds = max(60, (int) ($job['timeout_seconds'] ?? 300));

        try {
            match ($job['type']) {
                'convert_pdf' => self::convertPdf($flipbookId, $jobId, $timeoutSeconds),
                default => throw new RuntimeException('Unknown job type ' . $job['type']),
            };

            Db::run(
                "UPDATE jobs SET status = 'completed', progress = 100, current_step = 'Completed', done_at = NOW(), error = NULL, locked_at = NULL, worker_id = NULL, lease_expires_at = NULL WHERE id = ? AND (worker_id IS NULL OR worker_id = ?)",
                [$jobId, self::workerId()]
            );

            return [
                'processed' => true,
                'jobId' => $jobId,
                'flipbookId' => $flipbookId,
                'status' => 'completed',
            ];
        } catch (Throwable $e) {
            $errMsg = $e->getMessage();

            // Lease lost / cancelled: another worker (or the user) owns the job now — never touch its state.
            if (str_starts_with($errMsg, 'Job lease lost')) {
                return ['processed' => true, 'jobId' => $jobId, 'flipbookId' => $flipbookId, 'status' => 'aborted', 'error' => $errMsg];
            }

            $attempts = (int) $job['attempts'] + 1;
            $maxAttempts = max(1, (int) ($job['max_attempts'] ?? 3));
            $retry = $attempts < $maxAttempts;
            $backoffMinutes = (int) pow(2, max(0, $attempts - 1));

            Db::run(
                "UPDATE jobs SET status = ?, current_step = ?, error = ?, locked_at = NULL, worker_id = NULL, lease_expires_at = NULL, done_at = ?, run_at = DATE_ADD(NOW(), INTERVAL {$backoffMinutes} MINUTE) WHERE id = ?",
                [
                    $retry ? 'queued' : 'failed',
                    $retry ? "Retry scheduled ({$attempts}/{$maxAttempts})" : 'Failed',
                    $errMsg,
                    $retry ? null : date('Y-m-d H:i:s'),
                    $jobId,
                ]
            );

            if ($flipbookId > 0) {
                if (!$retry) {
                    Db::run(
                        "UPDATE flipbooks SET status = 'failed', conversion_step = 'Failed', conversion_error = ? WHERE id = ?",
                        [$errMsg, $flipbookId]
                    );
                } else {
                    Db::run(
                        "UPDATE flipbooks SET conversion_step = ?, conversion_error = ? WHERE id = ?",
                        ["Retrying ({$attempts}/{$maxAttempts})...", $errMsg, $flipbookId]
                    );
                }
            }

            return [
                'processed' => true,
                'jobId' => $jobId,
                'flipbookId' => $flipbookId,
                'status' => $retry ? 'retrying' : 'failed',
                'error' => $errMsg,
            ];
        }
    }

    private static ?string $workerId = null;
    private static bool $schemaEnsured = false;
    private static bool $shutdown = false;

    /** Lease length for a running job; renewed by heartbeat() on every progress update. */
    private const LEASE_SECONDS = 300;

    public static function workerId(): string
    {
        return self::$workerId ??= (gethostname() ?: 'host') . ':' . getmypid() . ':' . bin2hex(random_bytes(3));
    }

    /** Ask the worker loop to stop after the current job finishes (SIGTERM/SIGINT). */
    public static function requestShutdown(): void
    {
        self::$shutdown = true;
    }

    public static function shouldShutdown(): bool
    {
        return self::$shutdown;
    }

    /** Add lease/ownership/priority columns on demand (no manual migration; DDL runs outside transactions). */
    public static function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        self::$schemaEnsured = true;
        try {
            $have = array_column(Db::all(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'"
            ), 'COLUMN_NAME');
            $pdo = Db::pdo();
            if (!in_array('worker_id', $have, true)) {
                $pdo->exec('ALTER TABLE jobs ADD COLUMN worker_id VARCHAR(80) NULL');
            }
            if (!in_array('lease_expires_at', $have, true)) {
                $pdo->exec('ALTER TABLE jobs ADD COLUMN lease_expires_at DATETIME NULL');
            }
            if (!in_array('priority', $have, true)) {
                $pdo->exec('ALTER TABLE jobs ADD COLUMN priority TINYINT NOT NULL DEFAULT 0');
            }
        } catch (Throwable $e) {
            error_log('JobRunner schema ensure failed: ' . $e->getMessage());
        }
    }

    /** Renew this worker's lease. Throws if another worker now owns the job so duplicate conversion is aborted. */
    public static function heartbeat(int $jobId): void
    {
        try {
            Db::run(
                'UPDATE jobs SET locked_at = NOW(), lease_expires_at = DATE_ADD(NOW(), INTERVAL ' . self::LEASE_SECONDS . ' SECOND)
                 WHERE id = ? AND worker_id = ?',
                [$jobId, self::workerId()]
            );
            $row = Db::one('SELECT worker_id, status FROM jobs WHERE id = ?', [$jobId]);
        } catch (Throwable) {
            return; // transient DB problem: do not kill a healthy conversion
        }
        if ($row && ($row['status'] === 'cancelled' || ($row['worker_id'] !== null && $row['worker_id'] !== self::workerId()))) {
            throw new RuntimeException('Job lease lost or job cancelled; aborting this worker.');
        }
    }

    /**
     * Claim the next available queued job atomically.
     * Supports MySQL 8 SKIP LOCKED with automatic fallback for older MariaDB/MySQL engines on shared hosting.
     * Ordering: priority first, then tenant fairness (tenants with fewer running jobs first), then FIFO.
     * A tenant already running JOB_MAX_PER_TENANT jobs (default 2) is skipped so it cannot monopolise workers.
     */
    public static function claim(): ?array
    {
        self::ensureSchema();
        $perTenant = max(1, (int) ($_ENV['JOB_MAX_PER_TENANT'] ?? 2));
        $running = "(SELECT COUNT(*) FROM jobs r WHERE r.tenant_id = jobs.tenant_id AND r.status = 'running' AND r.id <> jobs.id
                      AND r.locked_at IS NOT NULL AND COALESCE(r.lease_expires_at, DATE_ADD(r.locked_at, INTERVAL 5 MINUTE)) >= NOW())";
        $sql = "SELECT * FROM jobs
                WHERE done_at IS NULL
                  AND status IN ('queued', 'running')
                  AND run_at <= NOW()
                  AND (locked_at IS NULL OR COALESCE(lease_expires_at, DATE_ADD(locked_at, INTERVAL 5 MINUTE)) < NOW())
                  AND (tenant_id IS NULL OR {$running} < {$perTenant})
                ORDER BY priority DESC, (CASE WHEN tenant_id IS NULL THEN 0 ELSE {$running} END) ASC, id ASC
                LIMIT 1";
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            try {
                $job = Db::one($sql . ' FOR UPDATE SKIP LOCKED');
            } catch (Throwable) {
                // Fallback for MariaDB / MySQL versions that do not support SKIP LOCKED
                $job = Db::one($sql . ' FOR UPDATE');
            }

            if ($job) {
                Db::run(
                    "UPDATE jobs SET status = 'running', started_at = COALESCE(started_at, NOW()), locked_at = NOW(),
                            worker_id = ?, lease_expires_at = DATE_ADD(NOW(), INTERVAL " . self::LEASE_SECONDS . " SECOND),
                            attempts = attempts + 1 WHERE id = ?",
                    [self::workerId(), $job['id']]
                );
            }
            $pdo->commit();
            return $job;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            return null;
        }
    }

    /**
     * Auto-publish scheduled publications & auto-archive expired ones.
     */
    public static function processScheduledLifecycle(): void
    {
        try {
            Db::run(
                "UPDATE flipbooks
                 SET workflow_status = 'published', published_at = COALESCE(published_at, NOW())
                 WHERE workflow_status = 'scheduled'
                   AND status = 'ready'
                   AND scheduled_at IS NOT NULL
                   AND scheduled_at <= NOW()"
            );

            Db::run(
                "UPDATE flipbooks
                 SET workflow_status = 'archived'
                 WHERE workflow_status IN ('published', 'scheduled')
                   AND expires_at IS NOT NULL
                   AND expires_at <= NOW()"
            );
        } catch (Throwable) {
            // Ignore transient DB errors during background tick
        }
    }

    /**
     * Execute full multi-resolution PDF conversion for a flipbook.
     */
    public static function convertPdf(int $flipbookId, int $jobId, int $timeoutSeconds = 300): void
    {
        // Effective plan = the TENANT's subscription (same source as the upload controller); the owning user's
        // plan is only the explicit fallback for personal accounts that have no tenant plan.
        $f = Db::one(
            'SELECT f.*, p.max_pages, p.max_upload_mb
             FROM flipbooks f
             JOIN users u ON u.id = f.user_id
             LEFT JOIN tenants t ON t.id = f.tenant_id
             JOIN plans p ON p.id = COALESCE(t.plan_id, u.plan_id)
             WHERE f.id = ?',
            [$flipbookId]
        );
        if (!$f) {
            return;
        }
        if (empty($f['tenant_id'])) {
            throw new RuntimeException('Tenant context required for PDF conversion');
        }

        $root = Storage::root();
        $pdf = $root . '/' . $f['source_pdf_path'];
        $tenantId = (int) $f['tenant_id'];
        $outRel = "tenants/{$tenantId}/publications/{$flipbookId}";
        $out = "{$root}/{$outRel}";

        $onProgress = static function (int $pct, string $step) use ($flipbookId, $jobId): void {
            Db::run(
                'UPDATE flipbooks SET conversion_progress = ?, conversion_step = ?, conversion_error = NULL WHERE id = ?',
                [$pct, $step, $flipbookId]
            );
            if ($jobId > 0) {
                Db::run(
                    'UPDATE jobs SET progress = ?, current_step = ? WHERE id = ?',
                    [$pct, $step, $jobId]
                );
                // Heartbeat: renew the lease; aborts this worker if another worker has taken ownership.
                self::heartbeat($jobId);
            }
        };

        $onProgress(5, 'Validating PDF & extracting metadata');

        $maxBytes = ((int) ($f['max_upload_mb'] ?? 200)) * 1048576;
        $maxPages = (int) ($f['max_pages'] ?? 500);

        try {
            $metadata = PdfRenderer::validatePdf($pdf, $maxBytes, $maxPages);
            // Render one page beyond the limit so an unreadable page-count can never silently truncate/bypass it.
            $renderedPages = PdfRenderer::renderMultiResolution($pdf, $out, $maxPages > 0 ? $maxPages + 1 : $maxPages, $onProgress, $timeoutSeconds);
            if ($maxPages > 0 && $renderedPages && count($renderedPages) > $maxPages) {
                throw new RuntimeException('PDF validation failed: Document has more than ' . $maxPages . ' pages, exceeding your plan limit.');
            }
        } catch (Throwable $e) {
            PdfRenderer::cleanupPartialFiles($out);
            throw $e;
        }

        if (!$renderedPages) {
            PdfRenderer::cleanupPartialFiles($out);
            throw new RuntimeException('No pages produced by PDF renderer');
        }

        $metadata['page_count'] = count($renderedPages);
        $onProgress(92, 'Extracting searchable page text & Table of Contents');
        $textAndToc = PdfRenderer::extractPageTextAndToc($pdf, count($renderedPages));
        $pagesText = $textAndToc['pages_text'] ?? [];
        $autoToc = $textAndToc['toc'] ?? [];

        Db::run('DELETE FROM pages WHERE flipbook_id = ?', [$flipbookId]);
        foreach ($renderedPages as $pg) {
            $pageNum = (int) $pg['page_number'];
            $stdName = basename($pg['standard']);
            $highName = $pg['high_res'] ? basename($pg['high_res']) : null;
            $webpName = $pg['webp'] ? basename($pg['webp']) : null;
            $avifName = $pg['avif'] ? basename($pg['avif']) : null;
            $thumbName = basename($pg['thumb']);

            Db::run(
                'INSERT INTO pages (flipbook_id, page_number, image_path, high_res_path, webp_path, avif_path, thumb_path, width, height, text_content)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $flipbookId,
                    $pageNum,
                    "{$outRel}/{$stdName}",
                    $highName ? "{$outRel}/high/{$highName}" : "{$outRel}/{$stdName}",
                    $webpName ? "{$outRel}/{$webpName}" : null,
                    $avifName ? "{$outRel}/{$avifName}" : null,
                    "{$outRel}/thumbs/{$thumbName}",
                    (int) $pg['width'],
                    (int) $pg['height'],
                    $pagesText[$pageNum] ?? null,
                ]
            );
        }

        $nextWorkflow = in_array($f['workflow_status'] ?? 'draft', ['published', 'scheduled', 'in_review'], true)
            ? $f['workflow_status']
            : 'editing';

        $desc = $f['description'];
        if (empty($desc) && !empty($metadata['subject'])) {
            $desc = $metadata['subject'];
        }

        Db::run(
            "UPDATE flipbooks
             SET status = 'ready',
                 workflow_status = ?,
                 page_count = ?,
                 description = ?,
                 pdf_metadata = ?,
                 toc = COALESCE(toc, ?),
                 conversion_progress = 100,
                 conversion_step = 'Completed',
                 conversion_error = NULL
             WHERE id = ?",
            [
                $nextWorkflow,
                count($renderedPages),
                $desc,
                json_encode($metadata),
                json_encode($autoToc),
                $flipbookId,
            ]
        );

        try {
            $setting = Db::one("SELECT setting_value FROM system_settings WHERE setting_key = 'notify_customer_on_publish'");
            if (!$setting || $setting['setting_value'] !== '0') {
                $owner = Db::one('SELECT u.email, u.name, f.title, f.slug FROM flipbooks f JOIN users u ON u.id = f.user_id WHERE f.id = ?', [$flipbookId]);
                if ($owner) {
                    $readerUrl = ($_ENV['APP_URL'] ?? 'http://localhost:5173') . '/v/' . $owner['slug'];
                    Mailer::publicationConverted($owner['email'], $owner['name'], $owner['title'], $readerUrl);
                }
            }
        } catch (Throwable) {
        }
    }
}
