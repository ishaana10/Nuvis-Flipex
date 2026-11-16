<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Nuvis\Flipex\Support\Db;

echo "Running Migration v9: Brand Kits & Reusable Visual Identity...\n";

try {
    $pdo = Db::pdo();
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `brand_kits` (
          `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          `tenant_id` BIGINT UNSIGNED NOT NULL,
          `name` VARCHAR(100) NOT NULL,
          `logo_url` VARCHAR(255) NULL,
          `primary_color` VARCHAR(30) NOT NULL DEFAULT '#f59e0b',
          `secondary_color` VARCHAR(30) NOT NULL DEFAULT '#0f172a',
          `accent_color` VARCHAR(30) NOT NULL DEFAULT '#f59e0b',
          `background_gradient` VARCHAR(255) NULL,
          `drawer_bg_color` VARCHAR(30) NULL,
          `drawer_text_color` VARCHAR(30) NULL,
          `font_family` VARCHAR(80) NOT NULL DEFAULT 'Inter, sans-serif',
          `is_default` TINYINT(1) NOT NULL DEFAULT 0,
          `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX `idx_brand_kits_tenant` (`tenant_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    echo "Migration v9 completed successfully.\n";
} catch (\Throwable $e) {
    echo "Migration v9 failed: " . $e->getMessage() . "\n";
    exit(1);
}
