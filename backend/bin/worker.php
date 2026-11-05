<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;
use App\Support\PdfRenderer;
use App\Support\Storage;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

@ini_set('memory_limit', '512M');

$once = in_array('--once', $argv, true);
$activeDriver = PdfRenderer::resolveDriver();
echo "===============================================================\n";
echo "   Nuvis Flipex — Enterprise Document Processing Service       \n";
echo "   Active PDF Render Engine: {$activeDriver}\n";
echo "===============================================================\n";

do {
    // Run scheduled publishing & expiry lifecycle ticks
    processScheduledLifecycle();

    $job = claim();
    if (!$job) {
        if ($once) break;
        sleep(2);
        continue;
    }

    $jobId = (int) $job['id'];
    $payload = json_decode((string) $job['payload'], true) ?: [];
    $flipbookId = (int) ($job['flipbook_id'] ?? $payload['flipbook_id'] ?? 0);
    $timeoutSeconds = max(60, (int) ($job['timeout_seconds'] ?? 300));

    try {
        match ($job['type']) {
            'convert_pdf' => convertPdf($flipbookId, $jobId, $timeoutSeconds),
            default => throw new RuntimeException('Unknown job type ' . $job['type']),
        };

        Db::run(
            "UPDATE jobs SET status = 'completed', progress = 100, current_step = 'Completed', done_at = NOW(), error = NULL WHERE id = ?",
            [$jobId]
        );
    } catch (Throwable $e) {
        $errMsg = $e->getMessage();
        fwrite(STDERR, "[Job #{$jobId}] Error: {$errMsg}\n");

        $attempts = (int) $job['attempts'];
        $maxAttempts = max(1, (int) ($job['max_attempts'] ?? 3));
        $retry = $attempts < $maxAttempts;
        // Exponential backoff: 1 min, 2 min, 4 min
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
    }
} while (true);

function claim(): ?array
{
    $pdo = Db::pdo();
    $pdo->beginTransaction();
    $job = Db::one(
        "SELECT * FROM jobs
         WHERE done_at IS NULL
           AND status IN ('queued', 'running')
           AND run_at <= NOW()
           AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
         ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED"
    );
    if ($job) {
        Db::run(
            "UPDATE jobs SET status = 'running', started_at = COALESCE(started_at, NOW()), locked_at = NOW(), attempts = attempts + 1 WHERE id = ?",
            [$job['id']]
        );
    }
    $pdo->commit();
    return $job;
}

function processScheduledLifecycle(): void
{
    try {
        // 1. Auto-publish scheduled publications whose scheduled_at has arrived
        Db::run(
            "UPDATE flipbooks
             SET workflow_status = 'published', published_at = COALESCE(published_at, NOW())
             WHERE workflow_status = 'scheduled'
               AND status = 'ready'
               AND scheduled_at IS NOT NULL
               AND scheduled_at <= NOW()"
        );

        // 2. Auto-archive expired publications whose expires_at has passed
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

function convertPdf(int $flipbookId, int $jobId, int $timeoutSeconds = 300): void
{
    $f = Db::one(
        'SELECT f.*, p.max_pages, p.max_upload_mb
         FROM flipbooks f
         JOIN users u ON u.id = f.user_id
         JOIN plans p ON p.id = u.plan_id
         WHERE f.id = ?',
        [$flipbookId]
    );
    if (!$f) return;

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

    echo "Converting publication #{$flipbookId} ('{$f['title']}') via " . PdfRenderer::resolveDriver() . "...\n";
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

    Db::run('DELETE FROM pages WHERE flipbook_id = ?', [$flipbookId]);
    foreach ($renderedPages as $pg) {
        $pageNum = (int) $pg['page_number'];
        $stdName = basename($pg['standard']);
        $highName = $pg['high_res'] ? basename($pg['high_res']) : null;
        $webpName = $pg['webp'] ? basename($pg['webp']) : null;
        $avifName = $pg['avif'] ? basename($pg['avif']) : null;
        $thumbName = basename($pg['thumb']);

        Db::run(
            'INSERT INTO pages (flipbook_id, page_number, image_path, high_res_path, webp_path, avif_path, thumb_path, width, height)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
            ]
        );
    }

    // Transition workflow_status: if 'draft' or 'processing', transition to 'editing' so publisher can add hotspots/review;
    // if already 'published' (e.g., PDF replacement on live flipbook), keep 'published'.
    $nextWorkflow = in_array($f['workflow_status'] ?? 'draft', ['published', 'scheduled', 'in_review'], true)
        ? $f['workflow_status']
        : 'editing';

    // Auto-fill description from PDF subject if flipbook description is empty
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
             conversion_progress = 100,
             conversion_step = 'Completed',
             conversion_error = NULL
         WHERE id = ?",
        [
            $nextWorkflow,
            count($renderedPages),
            $desc,
            json_encode($metadata),
            $flipbookId,
        ]
    );

    echo "Successfully converted flipbook #{$flipbookId}: " . count($renderedPages) . " pages (Multi-Res + WebP).\n";

    // Customer Notification
    try {
        $setting = Db::one("SELECT setting_value FROM system_settings WHERE setting_key = 'notify_customer_on_publish'");
        if (!$setting || $setting['setting_value'] !== '0') {
            $owner = Db::one('SELECT u.email, u.name, f.title, f.slug FROM flipbooks f JOIN users u ON u.id = f.user_id WHERE f.id = ?', [$flipbookId]);
            if ($owner) {
                $readerUrl = ($_ENV['APP_URL'] ?? 'http://localhost:5173') . '/v/' . $owner['slug'];
                \App\Support\Mailer::publicationConverted($owner['email'], $owner['name'], $owner['title'], $readerUrl);
            }
        }
    } catch (Throwable $e) {
        echo "Notification warning: " . $e->getMessage() . "\n";
    }
}
