<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$sql = file_get_contents(__DIR__ . '/../database/schema.sql');
$pdo = Db::pdo();
foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $stmt) {
    $pdo->exec($stmt);
}
echo "Schema applied.\n";
