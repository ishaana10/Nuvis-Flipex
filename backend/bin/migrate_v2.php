<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$pdo = Db::pdo();

echo "Running Nuvis Flipex v2 Document Processing & Publishing Lifecycle Migration...\n";

// 1. Create categories, collections, flipbook_versions tables
$pdo->exec("
CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  description TEXT NULL,
  color VARCHAR(30) NOT NULL DEFAULT '#F5C542',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");

$pdo->exec("
CREATE TABLE IF NOT EXISTS collections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");

$pdo->exec("
CREATE TABLE IF NOT EXISTS flipbook_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  flipbook_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  source_pdf_path VARCHAR(255) NOT NULL,
  page_count INT NOT NULL DEFAULT 0,
  file_size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  pdf_metadata JSON NULL,
  pages_snapshot JSON NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (flipbook_id, version_number),
  FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");

function addColumnIfNotExists(\PDO $pdo, string $table, string $column, string $definition): void {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
    $stmt->execute([$table, $column]);
    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
        echo "  + Added {$table}.{$column}\n";
    }
}

// 2. Upgrade flipbooks columns
addColumnIfNotExists($pdo, 'flipbooks', 'category_id', 'BIGINT UNSIGNED NULL AFTER folder_id');
addColumnIfNotExists($pdo, 'flipbooks', 'collection_id', 'BIGINT UNSIGNED NULL AFTER category_id');
addColumnIfNotExists($pdo, 'flipbooks', 'workflow_status', "ENUM('draft','processing','editing','in_review','scheduled','published','archived') NOT NULL DEFAULT 'draft' AFTER status");
addColumnIfNotExists($pdo, 'flipbooks', 'version', 'INT UNSIGNED NOT NULL DEFAULT 1 AFTER workflow_status');
addColumnIfNotExists($pdo, 'flipbooks', 'pdf_metadata', 'JSON NULL AFTER settings');
addColumnIfNotExists($pdo, 'flipbooks', 'seo_meta', 'JSON NULL AFTER pdf_metadata');
addColumnIfNotExists($pdo, 'flipbooks', 'conversion_progress', 'TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER seo_meta');
addColumnIfNotExists($pdo, 'flipbooks', 'conversion_step', 'VARCHAR(150) NULL AFTER conversion_progress');
addColumnIfNotExists($pdo, 'flipbooks', 'conversion_error', 'TEXT NULL AFTER conversion_step');
addColumnIfNotExists($pdo, 'flipbooks', 'review_notes', 'TEXT NULL AFTER conversion_error');
addColumnIfNotExists($pdo, 'flipbooks', 'reviewed_by', 'BIGINT UNSIGNED NULL AFTER review_notes');
addColumnIfNotExists($pdo, 'flipbooks', 'reviewed_at', 'DATETIME NULL AFTER reviewed_by');
addColumnIfNotExists($pdo, 'flipbooks', 'scheduled_at', 'DATETIME NULL AFTER reviewed_at');
addColumnIfNotExists($pdo, 'flipbooks', 'expires_at', 'DATETIME NULL AFTER scheduled_at');

// Backfill workflow_status and conversion_progress for existing ready/published flipbooks
$pdo->exec("UPDATE flipbooks SET conversion_progress = 100, conversion_step = 'Completed' WHERE status = 'ready' AND conversion_progress = 0");
$pdo->exec("UPDATE flipbooks SET workflow_status = 'published' WHERE published_at IS NOT NULL AND workflow_status = 'draft'");
$pdo->exec("UPDATE flipbooks SET workflow_status = 'editing' WHERE status = 'ready' AND published_at IS NULL AND workflow_status = 'draft'");
$pdo->exec("UPDATE flipbooks SET workflow_status = 'processing' WHERE status IN ('uploading', 'processing') AND workflow_status = 'draft'");

// 3. Upgrade pages columns
addColumnIfNotExists($pdo, 'pages', 'high_res_path', 'VARCHAR(255) NULL AFTER image_path');
addColumnIfNotExists($pdo, 'pages', 'webp_path', 'VARCHAR(255) NULL AFTER high_res_path');
addColumnIfNotExists($pdo, 'pages', 'avif_path', 'VARCHAR(255) NULL AFTER webp_path');

// 4. Upgrade jobs columns
addColumnIfNotExists($pdo, 'jobs', 'tenant_id', 'BIGINT UNSIGNED NULL AFTER id');
addColumnIfNotExists($pdo, 'jobs', 'flipbook_id', 'BIGINT UNSIGNED NULL AFTER tenant_id');
addColumnIfNotExists($pdo, 'jobs', 'status', "ENUM('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued' AFTER payload");
addColumnIfNotExists($pdo, 'jobs', 'progress', 'TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER status');
addColumnIfNotExists($pdo, 'jobs', 'current_step', 'VARCHAR(150) NULL AFTER progress');
addColumnIfNotExists($pdo, 'jobs', 'max_attempts', 'INT NOT NULL DEFAULT 3 AFTER attempts');
addColumnIfNotExists($pdo, 'jobs', 'timeout_seconds', 'INT NOT NULL DEFAULT 300 AFTER max_attempts');
addColumnIfNotExists($pdo, 'jobs', 'started_at', 'DATETIME NULL AFTER run_at');
addColumnIfNotExists($pdo, 'jobs', 'created_at', 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER error');

$pdo->exec("UPDATE jobs SET status = 'completed', progress = 100 WHERE done_at IS NOT NULL AND error IS NULL AND status = 'queued'");
$pdo->exec("UPDATE jobs SET status = 'failed' WHERE done_at IS NOT NULL AND error IS NOT NULL AND status = 'queued'");

// 5. Seed default categories & collections for tenant 1 if empty
$catCount = (int) Db::one('SELECT COUNT(*) c FROM categories WHERE tenant_id = 1')['c'];
if ($catCount === 0) {
    Db::run("INSERT INTO categories (tenant_id, name, slug, description, color) VALUES
        (1, 'Newsletters', 'newsletters', 'School & corporate newsletters', '#F5C542'),
        (1, 'Magazines', 'magazines', 'Editorial & lifestyle magazines', '#3B82F6'),
        (1, 'Annual Reports', 'annual-reports', 'Financial & corporate reports', '#10B981'),
        (1, 'Catalogs & Brochures', 'catalogs-brochures', 'Product catalogs and marketing collateral', '#8B5CF6')
    ");
    echo "  + Seeded default categories for Tenant 1\n";
}

$colCount = (int) Db::one('SELECT COUNT(*) c FROM collections WHERE tenant_id = 1')['c'];
if ($colCount === 0) {
    Db::run("INSERT INTO collections (tenant_id, name, slug, description, is_public) VALUES
        (1, '2026 Featured Publications', '2026-featured', 'Highlighted publications for 2026', 1),
        (1, 'Internal Archive', 'internal-archive', 'Internal company publications', 0)
    ");
    echo "  + Seeded default collections for Tenant 1\n";
}

// 6. Ensure local dev account nilesh@nuvistechnologies.com.fj has password123 restored
$hash = password_hash('password123', PASSWORD_ARGON2ID);
Db::run("UPDATE users SET password_hash = ?, failed_login_attempts = 0, lockout_until = NULL WHERE email = 'nilesh@nuvistechnologies.com.fj'", [$hash]);

echo "Migration complete!\n";
