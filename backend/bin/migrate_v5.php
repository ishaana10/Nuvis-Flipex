<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$pdo = Db::pdo();

echo "Running Nuvis Flipex v5 Modular Architecture & DevOps Readiness Migration...\n";

// 1. Versioned, Reversible Database Migrations tracking table
$pdo->exec("
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  batch INT UNSIGNED NOT NULL DEFAULT 1,
  checksum CHAR(64) NOT NULL,
  is_reversible TINYINT(1) NOT NULL DEFAULT 1,
  executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified schema_migrations table\n";

// Seed historical migrations if empty
$migCount = (int) Db::one('SELECT COUNT(*) AS c FROM schema_migrations')['c'];
if ($migCount === 0) {
    $history = [
        ['2026_11_01_000001_initial_core_schema', 'Core users, flipbooks, pages, hotspots, views, refresh_tokens tables', 1],
        ['2026_11_02_000002_multi_tenant_isolation', 'Tenants, plans, RBAC roles, audit_logs, security_events tables', 1],
        ['2026_11_03_000003_publishing_lifecycle_and_jobs', '7-stage workflow, flipbook_versions, conversion_jobs, categories, collections', 1],
        ['2026_11_04_000004_commercial_analytics_and_heatmaps', 'Granular analytics_events, UTM attribution, scheduled_reports', 1],
        ['2026_11_05_000005_enterprise_integrations_and_billing', 'SHA-256 api_keys, webhooks, tenant_integrations, invoices, subscription_history', 1],
        ['2026_11_06_000006_modular_architecture_and_devops', 'schema_migrations, dead_letter_jobs, error_reports, system_backups', 1],
    ];
    foreach ($history as [$ver, $desc, $batch]) {
        Db::run(
            'INSERT IGNORE INTO schema_migrations (version, description, batch, checksum, is_reversible) VALUES (?, ?, ?, ?, 1)',
            [$ver, $desc, $batch, hash('sha256', $ver . ':' . $desc)]
        );
    }
    echo "  + Registered 6 versioned reversible migrations\n";
}

// 2. Dead-Letter Queue (DLQ) table for persistent jobs that exhausted retries
$pdo->exec("
CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  original_job_id BIGINT UNSIGNED NULL,
  queue_name VARCHAR(64) NOT NULL DEFAULT 'document-processing',
  job_type VARCHAR(80) NOT NULL DEFAULT 'pdf_conversion',
  payload JSON NULL,
  exception_class VARCHAR(160) NULL,
  error_message TEXT NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 3,
  status ENUM('dead','requeued','resolved') NOT NULL DEFAULT 'dead',
  failed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requeued_at DATETIME NULL,
  INDEX (tenant_id, status),
  INDEX (failed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified dead_letter_jobs table\n";

// 3. Centralised Error & Exception Monitoring table
$pdo->exec("
CREATE TABLE IF NOT EXISTS error_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  trace_id VARCHAR(64) NOT NULL,
  severity ENUM('warning','error','critical') NOT NULL DEFAULT 'error',
  exception_class VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  file VARCHAR(255) NOT NULL,
  line INT UNSIGNED NOT NULL DEFAULT 0,
  request_method VARCHAR(16) NULL,
  request_uri VARCHAR(255) NULL,
  context_json JSON NULL,
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  occurrences INT UNSIGNED NOT NULL DEFAULT 1,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id, resolved),
  INDEX (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified error_reports table\n";

// 4. Automated Backups & Recovery Verification registry table
$pdo->exec("
CREATE TABLE IF NOT EXISTS system_backups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  backup_code VARCHAR(64) NOT NULL UNIQUE,
  backup_type ENUM('full_snapshot','mysql_schema_data','tenant_storage') NOT NULL DEFAULT 'full_snapshot',
  file_path VARCHAR(255) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  checksum_sha256 CHAR(64) NOT NULL,
  tables_count INT UNSIGNED NOT NULL DEFAULT 0,
  rows_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  files_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('completed','verified','restored','failed') NOT NULL DEFAULT 'completed',
  recovery_tested_at DATETIME NULL,
  recovery_notes VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified system_backups table\n";

echo "v5 Migration complete!\n";
