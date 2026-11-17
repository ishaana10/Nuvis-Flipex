<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Nuvis\Flipex\Support\Db;

echo "Running Migration v10: Commercial Leads & Business Storefronts...\n";

try {
    $pdo = Db::pdo();
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `commercial_leads` (
          `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          `tenant_id` BIGINT UNSIGNED NOT NULL,
          `flipbook_id` BIGINT UNSIGNED NULL,
          `hotspot_id` BIGINT UNSIGNED NULL,
          `page_number` INT NULL,
          `product_title` VARCHAR(255) NULL,
          `product_sku` VARCHAR(100) NULL,
          `product_price` VARCHAR(50) NULL,
          `customer_name` VARCHAR(120) NOT NULL,
          `customer_email` VARCHAR(190) NOT NULL,
          `customer_phone` VARCHAR(50) NULL,
          `quantity` INT NOT NULL DEFAULT 1,
          `notes` TEXT NULL,
          `status` ENUM('new','contacted','quoted','converted','closed') NOT NULL DEFAULT 'new',
          `source` VARCHAR(50) NOT NULL DEFAULT 'catalogue_hotspot',
          `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX `idx_leads_tenant` (`tenant_id`, `status`),
          INDEX `idx_leads_flipbook` (`flipbook_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

        CREATE TABLE IF NOT EXISTS `tenant_storefronts` (
          `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          `tenant_id` BIGINT UNSIGNED NOT NULL UNIQUE,
          `business_name` VARCHAR(150) NOT NULL,
          `slug` VARCHAR(100) NOT NULL UNIQUE,
          `tagline` VARCHAR(255) NULL,
          `bio` TEXT NULL,
          `phone` VARCHAR(50) NULL,
          `whatsapp_phone` VARCHAR(50) NULL,
          `email` VARCHAR(190) NULL,
          `address` TEXT NULL,
          `website_url` VARCHAR(255) NULL,
          `banner_url` VARCHAR(255) NULL,
          `logo_url` VARCHAR(255) NULL,
          `is_verified` TINYINT(1) NOT NULL DEFAULT 1,
          `facebook_url` VARCHAR(255) NULL,
          `instagram_url` VARCHAR(255) NULL,
          `currency` VARCHAR(10) NOT NULL DEFAULT 'FJD',
          `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX `idx_storefront_slug` (`slug`),
          INDEX `idx_storefront_tenant` (`tenant_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    echo "Migration v10 completed successfully.\n";
} catch (\Throwable $e) {
    echo "Migration v10 failed: " . $e->getMessage() . "\n";
    exit(1);
}
