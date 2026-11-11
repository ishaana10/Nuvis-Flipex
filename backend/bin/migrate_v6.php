<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$pdo = Db::pdo();

echo "Running Nuvis Flipex v6 Payment Security Architecture & API Key Scope Enforcement Migration...\n";

function addColumnIfNotExistsV6(\PDO $pdo, string $table, string $column, string $definition): void {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
    $stmt->execute([$table, $column]);
    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
        echo "  + Added {$table}.{$column}\n";
    }
}

// 1. Expand users.tenant_role ENUM to include 'finance'
try {
    $pdo->exec("ALTER TABLE `users` MODIFY COLUMN `tenant_role` ENUM('owner','admin','finance','editor','viewer') NOT NULL DEFAULT 'editor'");
    echo "  + Expanded users.tenant_role ENUM with 'finance'\n";
} catch (\Throwable $e) {
    echo "  ! Note on users.tenant_role: " . $e->getMessage() . "\n";
}

// 2. Expand invoices.status ENUM to include 'pending' and 'reversed'
try {
    $pdo->exec("ALTER TABLE `invoices` MODIFY COLUMN `status` ENUM('draft','issued','pending','reconciling','paid','overdue','reversed','void') NOT NULL DEFAULT 'issued'");
    echo "  + Expanded invoices.status ENUM with 'pending' and 'reversed'\n";
} catch (\Throwable $e) {
    echo "  ! Note on invoices.status: " . $e->getMessage() . "\n";
}

// 3. Expand subscription_history.action ENUM to include 'payment_submitted' and 'reversal'
try {
    $pdo->exec("ALTER TABLE `subscription_history` MODIFY COLUMN `action` ENUM('initial','upgrade','downgrade','renewal','grace_period','suspension','reactivation','reconciliation','payment_submitted','reversal') NOT NULL");
    echo "  + Expanded subscription_history.action ENUM with 'payment_submitted' and 'reversal'\n";
} catch (\Throwable $e) {
    echo "  ! Note on subscription_history.action: " . $e->getMessage() . "\n";
}

// 4. Create payment_transactions table (idempotency keys, signed webhook state, reversal support)
$pdo->exec("
CREATE TABLE IF NOT EXISTS payment_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  transaction_uid VARCHAR(64) NOT NULL UNIQUE,
  idempotency_key VARCHAR(120) NOT NULL,
  provider VARCHAR(50) NOT NULL DEFAULT 'bank_transfer_fiji',
  payment_reference VARCHAR(120) NULL,
  bank_name VARCHAR(80) NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
  status ENUM('pending','reconciling','succeeded','failed','reversed') NOT NULL DEFAULT 'pending',
  webhook_signature_verified TINYINT(1) NOT NULL DEFAULT 0,
  verified_by BIGINT UNSIGNED NULL,
  verified_at DATETIME NULL,
  reversal_reason VARCHAR(255) NULL,
  reversed_by BIGINT UNSIGNED NULL,
  reversed_at DATETIME NULL,
  raw_payload JSON NULL,
  immutable_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_idempotency (tenant_id, idempotency_key),
  INDEX (tenant_id, invoice_id),
  INDEX (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified payment_transactions table\n";

// 5. Create payment_audit_logs table (append-only SHA-256 hash-chained immutable payment audit records)
$pdo->exec("
CREATE TABLE IF NOT EXISTS payment_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  transaction_id BIGINT UNSIGNED NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(60) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
  status_from VARCHAR(30) NULL,
  status_to VARCHAR(30) NOT NULL,
  meta JSON NULL,
  ip VARCHAR(64) NULL,
  prev_hash CHAR(64) NOT NULL,
  entry_hash CHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id, invoice_id),
  INDEX (entry_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified payment_audit_logs table\n";

// 6. Add API Key security controls: IP restrictions, daily usage quotas, and key rotation lineage
addColumnIfNotExistsV6($pdo, 'api_keys', 'allowed_ips', 'VARCHAR(500) NULL AFTER scopes');
addColumnIfNotExistsV6($pdo, 'api_keys', 'daily_quota', 'INT UNSIGNED NULL DEFAULT NULL AFTER allowed_ips');
addColumnIfNotExistsV6($pdo, 'api_keys', 'usage_count', 'INT UNSIGNED NOT NULL DEFAULT 0 AFTER daily_quota');
addColumnIfNotExistsV6($pdo, 'api_keys', 'quota_date', 'DATE NULL AFTER usage_count');
addColumnIfNotExistsV6($pdo, 'api_keys', 'rotated_from_id', 'BIGINT UNSIGNED NULL AFTER revoked_at');
echo "  + Verified api_keys quota, IP allowlist, and key rotation columns\n";

// 7. Record migration in schema_migrations
try {
    $ver = '2026_11_11_000007_payment_security_and_api_key_controls';
    $desc = 'Three-stage payment verification, payment_transactions, immutable payment_audit_logs, finance RBAC role, and API key scope/quota/IP enforcement';
    Db::run(
        'INSERT IGNORE INTO schema_migrations (version, description, batch, checksum, is_reversible) VALUES (?, ?, 2, ?, 1)',
        [$ver, $desc, hash('sha256', $ver . ':' . $desc)]
    );
    echo "  + Registered migration {$ver}\n";
} catch (\Throwable $e) {
    // ignore if schema_migrations doesn't exist yet
}

echo "v6 Migration complete!\n";
