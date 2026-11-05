<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$pdo = Db::pdo();

echo "Running Nuvis Flipex v4 Enterprise Integrations & Commercial Billing Migration...\n";

function addColumnIfNotExistsV4(\PDO $pdo, string $table, string $column, string $definition): void {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
    $stmt->execute([$table, $column]);
    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
        echo "  + Added {$table}.{$column}\n";
    }
}

// 1. API Keys table (SHA-256 hashed, tenant-scoped)
$pdo->exec("
CREATE TABLE IF NOT EXISTS api_keys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  scopes JSON NULL,
  last_used_at DATETIME NULL,
  last_used_ip VARCHAR(64) NULL,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (key_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
addColumnIfNotExistsV4($pdo, 'api_keys', 'tenant_id', 'BIGINT UNSIGNED NULL');
addColumnIfNotExistsV4($pdo, 'api_keys', 'key_prefix', "VARCHAR(24) NOT NULL DEFAULT 'nvf_live_'");
addColumnIfNotExistsV4($pdo, 'api_keys', 'scopes', 'JSON NULL');
addColumnIfNotExistsV4($pdo, 'api_keys', 'last_used_at', 'DATETIME NULL');
addColumnIfNotExistsV4($pdo, 'api_keys', 'last_used_ip', 'VARCHAR(64) NULL');
addColumnIfNotExistsV4($pdo, 'api_keys', 'expires_at', 'DATETIME NULL');
addColumnIfNotExistsV4($pdo, 'api_keys', 'revoked_at', 'DATETIME NULL');
echo "  + Verified api_keys table\n";

// 2. Webhooks & Webhook Deliveries tables (tenant-scoped)
$pdo->exec("
CREATE TABLE IF NOT EXISTS webhooks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  target_url VARCHAR(500) NOT NULL,
  secret_token VARCHAR(120) NOT NULL,
  events JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_triggered_at DATETIME NULL,
  last_status_code INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");

$pdo->exec("
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  webhook_id BIGINT UNSIGNED NOT NULL,
  event_name VARCHAR(80) NOT NULL,
  payload JSON NULL,
  response_code INT NOT NULL DEFAULT 200,
  response_body TEXT NULL,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (webhook_id, created_at),
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified webhooks & webhook_deliveries tables\n";

// 3. Tenant Enterprise Integrations table (SSO, LDAP/AD, WordPress, ERP, CRM, Cloud Storage, SMTP)
$pdo->exec("
CREATE TABLE IF NOT EXISTS tenant_integrations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  connector_type ENUM('sso','ldap','wordpress','erp','crm','cloud_storage','smtp') NOT NULL,
  provider_name VARCHAR(120) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  config_json JSON NULL,
  last_sync_at DATETIME NULL,
  sync_status VARCHAR(80) NOT NULL DEFAULT 'configured',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_connector (tenant_id, connector_type),
  INDEX (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified tenant_integrations table\n";

// 4. Extend tenants table for Commercial Billing, Renewals, Grace Periods, Tax & Metering
addColumnIfNotExistsV4($pdo, 'tenants', 'auto_renew', 'TINYINT(1) NOT NULL DEFAULT 1');
addColumnIfNotExistsV4($pdo, 'tenants', 'grace_period_days', 'INT UNSIGNED NOT NULL DEFAULT 7');
addColumnIfNotExistsV4($pdo, 'tenants', 'tax_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 15.00');
addColumnIfNotExistsV4($pdo, 'tenants', 'payment_gateway', "VARCHAR(50) NOT NULL DEFAULT 'bank_transfer_fiji'");
addColumnIfNotExistsV4($pdo, 'tenants', 'gateway_customer_id', 'VARCHAR(120) NULL');
addColumnIfNotExistsV4($pdo, 'tenants', 'storage_used_mb', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
addColumnIfNotExistsV4($pdo, 'tenants', 'bandwidth_used_mb', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
addColumnIfNotExistsV4($pdo, 'tenants', 'suspended_at', 'DATETIME NULL');
addColumnIfNotExistsV4($pdo, 'tenants', 'suspension_reason', 'VARCHAR(255) NULL');

// 5. Invoices table (Tax calculations, usage overages, gateway & Fiji bank transfer reconciliation)
$pdo->exec("
CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  plan_id BIGINT UNSIGNED NULL,
  billing_cycle VARCHAR(30) NOT NULL DEFAULT 'monthly',
  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  usage_overage_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('draft','issued','reconciling','paid','overdue','void') NOT NULL DEFAULT 'issued',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer_fiji',
  payment_reference VARCHAR(120) NULL,
  bank_name VARCHAR(80) NULL,
  line_items JSON NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_at DATETIME NULL,
  reconciled_by BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id, status),
  INDEX (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified invoices table\n";

// 6. Subscription History table (Upgrades, downgrades, renewals, grace periods, suspensions, reconciliations)
$pdo->exec("
CREATE TABLE IF NOT EXISTS subscription_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  from_plan_id BIGINT UNSIGNED NULL,
  to_plan_id BIGINT UNSIGNED NULL,
  action ENUM('initial','upgrade','downgrade','renewal','grace_period','suspension','reactivation','reconciliation') NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
  payment_method VARCHAR(50) NULL,
  reference VARCHAR(120) NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
");
echo "  + Verified subscription_history table\n";

// 7. Ensure primary user has a tenant assigned so multi-tenant billing & integrations work out of the box
$tenants = Db::all('SELECT * FROM tenants');
if (empty($tenants)) {
    $proPlan = Db::one("SELECT id, price FROM plans WHERE name = 'Pro' OR id = 2 LIMIT 1") ?: ['id' => 1, 'price' => 49.00];
    $tid = Db::insert(
        "INSERT INTO tenants (name, slug, plan_id, max_flipbooks, max_storage_mb, is_active, billing_name, billing_email, billing_address, tax_id, payment_method, payment_status, billing_cycle, amount, currency, last_payment_date, next_billing_date, payment_reference, auto_renew, grace_period_days, tax_rate)
         VALUES ('Nuvis Technologies Pte Ltd', 'nuvis-tech', ?, 100, 5120, 1, 'Nuvis Technologies Pte Ltd', 'billing@nuvistechnologies.com.fj', 'Suva, Fiji', 'TIN-50-12345-0-0', 'bank_transfer_fiji', 'paid', 'monthly', ?, 'FJD', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY), 'BSP-TXN-202611', 1, 7, 15.00)",
        [$proPlan['id'], $proPlan['price']]
    );
    Db::run('UPDATE users SET tenant_id = ?, tenant_role = "owner" WHERE tenant_id IS NULL', [$tid]);
    Db::run('UPDATE flipbooks SET tenant_id = ? WHERE tenant_id IS NULL', [$tid]);
    echo "  + Provisioned default tenant 'Nuvis Technologies Pte Ltd' (ID #{$tid})\n";
} else {
    $firstTid = (int) $tenants[0]['id'];
    Db::run('UPDATE users SET tenant_id = ? WHERE tenant_id IS NULL', [$firstTid]);
}

// 8. Seed initial sample invoice & subscription history if empty
$invCount = (int) Db::one('SELECT COUNT(*) c FROM invoices')['c'];
if ($invCount === 0) {
    $allTenants = Db::all('SELECT t.*, p.name AS plan_name, p.price AS plan_price FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id');
    foreach ($allTenants as $idx => $t) {
        $tid = (int) $t['id'];
        $sub = (float) ($t['amount'] > 0 ? $t['amount'] : ($t['plan_price'] ?? 49.00));
        $taxRate = (float) ($t['tax_rate'] ?? 15.00);
        $taxAmt = round($sub * ($taxRate / 100), 2);
        $total = round($sub + $taxAmt, 2);
        $curr = $t['currency'] ?: 'FJD';
        $invNo = sprintf('INV-2026-%04d', 1001 + $idx);
        $items = [
            [
                'description' => ($t['plan_name'] ?: 'Enterprise') . ' Plan Subscription (' . ucfirst($t['billing_cycle'] ?: 'monthly') . ')',
                'quantity' => 1,
                'unit_price' => $sub,
                'amount' => $sub,
            ],
            [
                'description' => 'Included Storage & Bandwidth Metering Tier (Up to ' . ($t['max_storage_mb'] ?: 1024) . ' MB)',
                'quantity' => 1,
                'unit_price' => 0.00,
                'amount' => 0.00,
            ],
        ];
        Db::run(
            "INSERT INTO invoices (tenant_id, invoice_number, plan_id, billing_cycle, currency, subtotal, usage_overage_amount, tax_rate, tax_amount, total_amount, status, payment_method, payment_reference, bank_name, line_items, period_start, period_end, due_date, paid_at, notes)
             VALUES (?, ?, ?, ?, ?, ?, 0.00, ?, ?, ?, 'paid', 'bank_transfer_fiji', ?, 'Bank of South Pacific (BSP) Fiji', ?, DATE_SUB(CURDATE(), INTERVAL 15 DAY), DATE_ADD(CURDATE(), INTERVAL 15 DAY), DATE_SUB(CURDATE(), INTERVAL 8 DAY), NOW(), 'Reconciled via Fiji Bank Transfer')",
            [$tid, $invNo, $t['plan_id'], $t['billing_cycle'] ?: 'monthly', $curr, $sub, $taxRate, $taxAmt, $total, $t['payment_reference'] ?: 'BSP-FJ-994821', json_encode($items)]
        );

        Db::run(
            "INSERT INTO subscription_history (tenant_id, to_plan_id, action, amount, currency, payment_method, reference, notes)
             VALUES (?, ?, 'initial', ?, ?, 'bank_transfer_fiji', ?, 'Initial workspace subscription provisioned and reconciled.')",
            [$tid, $t['plan_id'], $total, $curr, $t['payment_reference'] ?: 'BSP-FJ-994821']
        );
    }
    echo "  + Seeded initial tax invoices and subscription history records\n";
}

echo "v4 Migration complete!\n";
