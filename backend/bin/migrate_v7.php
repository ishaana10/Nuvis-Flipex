<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Database\TenantArchitectureMigration;
use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

/**
 * v7 — Multi-tenant database architecture (reversible).
 *
 *   php bin/migrate_v7.php            apply (idempotent)
 *   php bin/migrate_v7.php --status   show what is applied
 *   php bin/migrate_v7.php --down     roll back (drops v7 tables; refuses in production without --force)
 */

$down = in_array('--down', $argv, true);
$status = in_array('--status', $argv, true);
$force = in_array('--force', $argv, true);

$migration = new TenantArchitectureMigration(Db::pdo());

if ($status) {
    echo "Nuvis Flipex v7 status:\n";
    foreach ($migration->status() as $group => $items) {
        echo "  [{$group}]\n";
        foreach ($items as $name => $ok) {
            echo '    ' . ($ok ? '✔' : '✘') . " {$name}\n";
        }
    }
    exit(0);
}

if ($down) {
    if (($_ENV['APP_ENV'] ?? 'local') === 'production' && !$force) {
        fwrite(STDERR, "Refusing to roll back v7 in production without --force (this DROPS outbox, usage, storage-metadata and event tables).\n");
        exit(1);
    }
    echo "Rolling back Nuvis Flipex v7 multi-tenant database architecture...\n";
    $migration->down();
} else {
    echo "Running Nuvis Flipex v7 multi-tenant database architecture migration...\n";
    $migration->up();
}

foreach ($migration->report() as $line) {
    echo $line . "\n";
}
echo ($down ? 'v7 rollback' : 'v7 migration') . " complete!\n";
