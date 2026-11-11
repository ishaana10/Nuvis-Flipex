<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$sql = str_replace("\r\n", "\n", (string) file_get_contents(__DIR__ . '/../database/schema.sql'));
$pdo = Db::pdo();
foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $stmt) {
    if ($stmt !== '') {
        $pdo->exec($stmt);
    }
}

// Run incremental migrations (v2, v3, v4, v5, v6) safely
foreach (['migrate_v2.php', 'migrate_v3.php', 'migrate_v4.php', 'migrate_v5.php', 'migrate_v6.php'] as $mig) {
    $migFile = __DIR__ . '/' . $mig;
    if (file_exists($migFile)) {
        require_once $migFile;
    }
}

echo "Full schema and all v1–v6 migrations applied successfully.\n";
