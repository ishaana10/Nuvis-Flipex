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

do {
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
