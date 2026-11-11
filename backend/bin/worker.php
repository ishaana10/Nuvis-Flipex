<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\JobRunner;
use App\Support\PdfRenderer;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

@ini_set('memory_limit', '512M');

$once = in_array('--once', $argv, true);
$activeDriver = PdfRenderer::resolveDriver();
echo "===============================================================\n";
echo "   Nuvis Flipex — Enterprise Document Processing Service       \n";
echo "   Active PDF Render Engine: {$activeDriver}\n";
echo "===============================================================\n";

// Graceful shutdown: finish the current job, then exit (SIGTERM / SIGINT, where pcntl is available).
if (function_exists('pcntl_async_signals') && function_exists('pcntl_signal')) {
    pcntl_async_signals(true);
    pcntl_signal(SIGTERM, static fn() => JobRunner::requestShutdown());
    pcntl_signal(SIGINT, static fn() => JobRunner::requestShutdown());
}
echo "Worker ID: " . JobRunner::workerId() . "\n";

do {
    if (JobRunner::shouldShutdown()) {
        echo "Shutdown requested; worker exiting cleanly.\n";
        break;
    }
    $result = JobRunner::processNextJob();
    if (!$result['processed']) {
        if ($once) {
            break;
        }
        sleep(2);
        continue;
    }

    $jobId = $result['jobId'] ?? 0;
    $fbId = $result['flipbookId'] ?? 0;
    if (($result['status'] ?? '') === 'completed') {
        echo "[Job #{$jobId}] Successfully converted flipbook #{$fbId}.\n";
    } else {
        $err = $result['error'] ?? 'Unknown error';
        fwrite(STDERR, "[Job #{$jobId}] Flipbook #{$fbId} {$result['status']}: {$err}\n");
    }
} while (true);
