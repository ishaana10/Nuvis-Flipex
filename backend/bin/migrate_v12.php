<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

echo "Running Migration v12: Pacific Regional Directory, Advertising Marketplace & Multi-Currency Ecosystem...\n";

$sql = "
CREATE TABLE IF NOT EXISTS `regional_directory_entries` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `flipbook_id` BIGINT UNSIGNED NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `country_code` VARCHAR(10) NOT NULL DEFAULT 'FJ',
  `region_name` VARCHAR(100) NULL,
  `category` ENUM('commercial','education','tourism','government','lifestyle','general') NOT NULL DEFAULT 'general',
  `tags` VARCHAR(255) NULL,
  `cover_image_url` VARCHAR(500) NULL,
  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
  `view_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_dir_flipbook` (`flipbook_id`),
  INDEX `idx_dir_country` (`country_code`),
  INDEX `idx_dir_category` (`category`),
  INDEX `idx_dir_tenant` (`tenant_id`),
  INDEX `idx_dir_featured` (`is_featured`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sponsored_placements` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `campaign_name` VARCHAR(200) NOT NULL,
  `advertiser_name` VARCHAR(200) NOT NULL,
  `advertiser_email` VARCHAR(190) NULL,
  `placement_type` ENUM('header_banner','interstitial_page','sidebar_spotlight','directory_featured') NOT NULL DEFAULT 'header_banner',
  `target_url` VARCHAR(500) NOT NULL,
  `banner_image_url` VARCHAR(500) NOT NULL,
  `headline` VARCHAR(255) NULL,
  `subtext` VARCHAR(255) NULL,
  `cta_text` VARCHAR(60) NOT NULL DEFAULT 'Learn More',
  `target_country` VARCHAR(20) NOT NULL DEFAULT 'ALL',
  `budget_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'FJD',
  `cost_per_click` DECIMAL(10,2) NOT NULL DEFAULT 0.25,
  `spent_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `impressions` INT NOT NULL DEFAULT 0,
  `clicks` INT NOT NULL DEFAULT 0,
  `status` ENUM('active','paused','completed','pending_review') NOT NULL DEFAULT 'active',
  `start_date` DATETIME NULL,
  `end_date` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_ad_tenant` (`tenant_id`),
  INDEX `idx_ad_status` (`status`, `placement_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ad_events` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `placement_id` BIGINT UNSIGNED NOT NULL,
  `event_type` ENUM('impression','click') NOT NULL,
  `flipbook_id` BIGINT UNSIGNED NULL,
  `country_code` VARCHAR(10) NULL,
  `ip_hash` VARCHAR(64) NULL,
  `user_agent` VARCHAR(255) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ad_events_placement` (`placement_id`, `event_type`),
  INDEX `idx_ad_events_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
";

try {
    $statements = array_filter(array_map('trim', explode(';', $sql)));
    foreach ($statements as $stmt) {
        if ($stmt !== '') {
            Db::pdo()->exec($stmt);
        }
    }
    echo "Migration v12 completed successfully.\n";
} catch (\Throwable $e) {
    echo "Migration v12 error: " . $e->getMessage() . "\n";
    exit(1);
}
