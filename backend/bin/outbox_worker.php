<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Outbox;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

/**
 * Transactional-outbox delivery worker.
 *   php bin/outbox_worker.php          run forever (poll every 2s)
 *   php bin/outbox_worker.php --once   drain one batch and exit (cron friendly)
 */
$once = in_array('--once', $argv, true);

echo "Nuvis Flipex outbox worker started" . ($once ? " (single batch)" : '') . "\n";
do {
    $stats = Outbox::dispatchBatch(50);
    if ($stats['claimed'] > 0) {
        echo sprintf(
            "[%s] claimed=%d delivered=%d retried=%d dead=%d\n",
            date('H:i:s'),
            $stats['claimed'],
            $stats['delivered'],
            $stats['retried'],
            $stats['dead']
        );
    }
    if ($once) {
        break;
    }
    if ($stats['claimed'] === 0) {
        sleep(2);
    }
} while (true);
