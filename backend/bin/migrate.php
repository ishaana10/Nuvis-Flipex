<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;
use App\Infrastructure\Database\MigrationRunner;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

// Handle CLI flags
$action = $argv[1] ?? 'up';

if ($action === '--status' || $action === 'status') {
    $status = MigrationRunner::status();
    echo "\nNuvis Flipex Migration Status:\n";
    echo str_repeat('-', 90) . "\n";
    printf("%-45s | %-8s | %-6s | %s\n", "Version", "Applied", "Batch", "Description");
    echo str_repeat('-', 90) . "\n";
    foreach ($status as $s) {
        printf(
            "%-45s | %-8s | %-6s | %s\n",
            substr($s['version'], 0, 45),
            $s['applied'] ? "YES" : "NO",
            $s['batch'] ?? "-",
            substr($s['description'], 0, 30)
        );
    }
    echo str_repeat('-', 90) . "\n\n";
    exit(0);
}

if ($action === '--rollback' || $action === 'rollback') {
    echo "Rolling back last migration batch...\n";
    $result = MigrationRunner::migrateDown();
    if (!empty($result['rolledBack'])) {
        foreach ($result['rolledBack'] as $v) {
            echo "  - Rolled back: {$v}\n";
        }
    } else {
        echo "  (No migrations to roll back)\n";
    }
    echo "Rollback completed.\n";
    exit(0);
}

// 1. Run base schema DDL
$sql = str_replace("\r\n", "\n", (string) file_get_contents(__DIR__ . '/../database/schema.sql'));
$pdo = Db::pdo();
foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $stmt) {
    if ($stmt !== '') {
        $pdo->exec($stmt);
    }
}

// 2. Run incremental migration scripts (v2 - v14) safely
foreach (['migrate_v2.php', 'migrate_v3.php', 'migrate_v4.php', 'migrate_v5.php', 'migrate_v6.php', 'migrate_v7.php', 'migrate_v8.php', 'migrate_v9.php', 'migrate_v10.php', 'migrate_v11.php', 'migrate_v12.php', 'migrate_v13.php', 'migrate_v14.php'] as $mig) {
    $migFile = __DIR__ . '/' . $mig;
    if (file_exists($migFile)) {
        require_once $migFile;
    }
}

// 3. Register and verify in authoritative MigrationRunner
$result = MigrationRunner::migrateUp();
if (!empty($result['executed'])) {
    foreach ($result['executed'] as $v) {
        echo "  + Authoritative migration recorded: {$v}\n";
    }
}

echo "Full schema and all v1-v8 migrations applied and tracked successfully.\n";
