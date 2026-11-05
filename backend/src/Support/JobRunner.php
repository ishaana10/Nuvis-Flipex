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
                "UPDATE jobs SET status = 'completed', progress = 100, current_step = 'Completed', done_at = NOW(), error = NULL WHERE id = ?",
                [$jobId]
            );

            return [
                'processed' => true,
                'jobId' => $jobId,
                'flipbookId' => $flipbookId,
                'status' => 'completed',
            ];
        } catch (Throwable $e) {
            $errMsg = $e->getMessage();

            $attempts = (int) $job['attempts'];
            $maxAttempts = max(1, (int) ($job['max_attempts'] ?? 3));
            $retry = $attempts < $maxAttempts;
            $backoffMinutes = (int) pow(2, max(0, $attempts - 1));

            Db::run(
                "UPDATE jobs SET status = ?, current_step = ?, error = ?, locked_at = NULL, done_at = ?, run_at = DATE_ADD(NOW(), INTERVAL {$backoffMinutes} MINUTE) WHERE id = ?",
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

    /**
     * Claim the next available queued job atomically.
     * Supports MySQL 8 SKIP LOCKED with automatic fallback for older MariaDB/MySQL engines on shared hosting.
     */
    public static function claim(): ?array
    {
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            try {
                $job = Db::one(
                    "SELECT * FROM jobs
                     WHERE done_at IS NULL
                       AND status IN ('queued', 'running')
                       AND run_at <= NOW()
                       AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE))
                     ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED"
                );
            } catch (Throwable) {
                // Fallback for MariaDB / MySQL versions that do not support SKIP LOCKED
                $job = Db::one(
                    "SELECT * FROM jobs
                     WHERE done_at IS NULL
                       AND status IN ('queued', 'running')
                       AND run_at <= NOW()
                       AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE))
                     ORDER BY id LIMIT 1 FOR UPDATE"
                );
            }

            if ($job) {
                Db::run(
                    "UPDATE jobs SET status = 'running', started_at = COALESCE(started_at, NOW()), locked_at = NOW(), attempts = attempts + 1 WHERE id = ?",
                    [$job['id']]
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
        $f = Db::one(
            'SELECT f.*, p.max_pages, p.max_upload_mb
             FROM flipbooks f
             JOIN users u ON u.id = f.user_id
             JOIN plans p ON p.id = u.plan_id
             WHERE f.id = ?',
            [$flipbookId]
        );
        if (!$f) {
            return;
        }

        $root = Storage::root();
        $pdf = $root . '/' . $f['source_pdf_path'];
        $tenantId = !empty($f['tenant_id']) ? (int) $f['tenant_id'] : 1;
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
            }
        };

        $onProgress(5, 'Validating PDF & extracting metadata');

        $maxBytes = ((int) ($f['max_upload_mb'] ?? 200)) * 1048576;
        $maxPages = (int) ($f['max_pages'] ?? 500);

        try {
            $metadata = PdfRenderer::validatePdf($pdf, $maxBytes, $maxPages);
            $renderedPages = PdfRenderer::renderMultiResolution($pdf, $out, $maxPages, $onProgress, $timeoutSeconds);
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
