<?php
declare(strict_types=1);

/**
 * Nuvis Flipex — Enterprise Secure Installation & Initial Provisioning Wizard
 *
 * This script initializes database schema, generates cryptographic secrets,
 * provisions the initial corporate tenant workspace, and creates the primary
 * administrator with a secure, non-predictable password.
 *
 * Usage:
 *   php bin/install.php
 *   php bin/install.php --admin-email="admin@company.com" --admin-password="StrongPassword123!" --admin-name="Administrator"
 *   php bin/install.php --admin-email="admin@company.com" --generate-password
 */

require __DIR__ . '/../vendor/autoload.php';

use App\Support\CryptoSecrets;
use App\Support\Db;
use App\Support\PdfRenderer;
use Dotenv\Dotenv;

echo "===============================================================\n";
echo "       Nuvis Flipex — Enterprise Secure Installation Wizard    \n";
echo "            Proprietary Software by Nuvis Technologies         \n";
echo "===============================================================\n\n";

// 1. Verify Prerequisites
$requiredExtensions = ['pdo_mysql', 'mbstring', 'fileinfo', 'openssl', 'curl', 'json'];
$missing = [];
foreach ($requiredExtensions as $ext) {
    if (!extension_loaded($ext)) {
        $missing[] = $ext;
    }
}
if (!empty($missing)) {
    fwrite(STDERR, "ERROR: Missing required PHP extension(s): " . implode(', ', $missing) . "\n");
    exit(1);
}

// 2. Load or Create .env configuration
$envFile = __DIR__ . '/../.env';
$envExample = __DIR__ . '/../.env.example';

if (!file_exists($envFile)) {
    if (file_exists($envExample)) {
        copy($envExample, $envFile);
        echo "Created .env from .env.example template.\n";
    } else {
        file_put_contents($envFile, "APP_ENV=production\nAPP_URL=http://localhost:5173\nDB_HOST=127.0.0.1\nDB_NAME=flipbook\nDB_USER=flipbook\nDB_PASS=secret\n");
    }
}

// Ensure cryptographically secure random secrets for JWT, Storage Signing, Preview Tokens, and Unlock Tokens
$cliRotateOpts = getopt('', ['rotate-secrets']);
$forceRotate = isset($cliRotateOpts['rotate-secrets']);
$envContent = (string) file_get_contents($envFile);
[$updatedEnvContent, $generatedSecretKeys] = CryptoSecrets::ensureEnvSecrets($envContent, $forceRotate);
if (!empty($generatedSecretKeys)) {
    file_put_contents($envFile, $updatedEnvContent);
    echo ($forceRotate ? "Rotated" : "Generated") . " cryptographically secure 256-bit random secrets for: " . implode(', ', $generatedSecretKeys) . "\n";
}

Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

// Strict Cryptographic Entropy & Production Security Validation
foreach (['JWT_SECRET', 'STORAGE_SIGNING_SECRET', 'PREVIEW_TOKEN_SECRET', 'UNLOCK_TOKEN_SECRET'] as $secKey) {
    $secVal = (string) ($_ENV[$secKey] ?? '');
    if (!CryptoSecrets::isStrongSecret($secVal)) {
        fwrite(STDERR, "ERROR: Insecure {$secKey} detected in .env (rejected placeholder or insufficient entropy).\n");
        exit(1);
    }
}

if (strtolower((string) ($_ENV['APP_ENV'] ?? 'local')) === 'production') {
    $dbPass = trim((string) ($_ENV['DB_PASS'] ?? ''));
    if ($dbPass === '' || in_array(strtolower($dbPass), ['secret', 'password', 'root', '123456', 'change-me'], true)) {
        fwrite(STDERR, "ERROR: Production installation aborted — DB_PASS in .env uses an insecure default.\n");
        exit(1);
    }
}

// 2b. Validate PDF Rasterization Engines (Ghostscript / Imagick / Poppler)
echo "Detecting PDF rendering engines:\n";
$pdfDiag = PdfRenderer::diagnostics();
echo "  - Ghostscript (GS_BIN / /usr/bin/gs): " . ($pdfDiag['ghostscript']['available'] ? "READY ({$pdfDiag['ghostscript']['path']})" : "Not found") . "\n";
echo "  - PHP Imagick Extension:              " . ($pdfDiag['imagick']['available'] ? "READY" : "Not installed") . "\n";
echo "  - Poppler (PDFTOPPM_BIN / pdftoppm):  " . ($pdfDiag['pdftoppm']['available'] ? "READY ({$pdfDiag['pdftoppm']['path']})" : "Not found") . "\n";
if ($pdfDiag['has_any_engine']) {
    echo "  -> Active Engine Selected:            {$pdfDiag['active_driver']}\n\n";
} else {
    echo "  -> WARNING: No PDF rendering engine detected. On A2 Hosting, ensure Ghostscript (/usr/bin/gs) or PHP imagick is enabled.\n\n";
}

// 3. Test Database Connectivity & Apply Schema
try {
    $pdo = Db::pdo();
    echo "Connected to MySQL database successfully.\n";
} catch (\Throwable $e) {
    fwrite(STDERR, "ERROR: Database connection failed: " . $e->getMessage() . "\n");
    fwrite(STDERR, "Please check DB_HOST, DB_NAME, DB_USER, and DB_PASS in backend/.env\n");
    exit(1);
}

$schemaFile = __DIR__ . '/../database/schema.sql';
if (file_exists($schemaFile)) {
    $sql = str_replace("\r\n", "\n", (string) file_get_contents($schemaFile));
    foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $stmt) {
        if ($stmt !== '') {
            try {
                $pdo->exec($stmt);
            } catch (\Throwable $e) {
                fwrite(STDERR, "  ! SQL notice: " . $e->getMessage() . "\n");
            }
        }
    }
}

// 3b. Auto-upgrade existing tables if an older schema was previously imported on this database
function ensureColumnExists(\PDO $pdo, string $table, string $column, string $definition): void {
    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
        $stmt->execute([$table, $column]);
        if ((int) $stmt->fetchColumn() === 0) {
            $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
            echo "  + Added missing column {$table}.{$column}\n";
        }
    } catch (\Throwable) {
        // Ignore if table not created yet
    }
}

// Ensure all multi-tenant and enterprise columns exist across existing tables
ensureColumnExists($pdo, 'users', 'tenant_id', 'BIGINT UNSIGNED NULL AFTER id');
ensureColumnExists($pdo, 'users', 'avatar_path', 'VARCHAR(255) NULL AFTER name');
ensureColumnExists($pdo, 'users', 'tenant_role', "ENUM('owner','admin','editor','viewer') NOT NULL DEFAULT 'editor' AFTER role");
ensureColumnExists($pdo, 'users', 'status', "ENUM('active','suspended') NOT NULL DEFAULT 'active' AFTER plan_id");
ensureColumnExists($pdo, 'users', 'two_factor_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
ensureColumnExists($pdo, 'users', 'two_factor_method', "ENUM('email','totp') NOT NULL DEFAULT 'email'");
ensureColumnExists($pdo, 'users', 'totp_secret', 'VARCHAR(64) NULL');
ensureColumnExists($pdo, 'users', 'two_factor_code', 'VARCHAR(10) NULL');
ensureColumnExists($pdo, 'users', 'two_factor_expires_at', 'DATETIME NULL');
ensureColumnExists($pdo, 'users', 'failed_login_attempts', 'INT NOT NULL DEFAULT 0');
ensureColumnExists($pdo, 'users', 'lockout_until', 'DATETIME NULL');
ensureColumnExists($pdo, 'users', 'last_login_at', 'DATETIME NULL');
ensureColumnExists($pdo, 'users', 'deleted_at', 'DATETIME NULL');

ensureColumnExists($pdo, 'tenants', 'auto_renew', 'TINYINT(1) NOT NULL DEFAULT 1');
ensureColumnExists($pdo, 'tenants', 'grace_period_days', 'INT UNSIGNED NOT NULL DEFAULT 7');
ensureColumnExists($pdo, 'tenants', 'tax_rate', 'DECIMAL(5,2) NOT NULL DEFAULT 15.00');
ensureColumnExists($pdo, 'tenants', 'payment_gateway', "VARCHAR(50) NOT NULL DEFAULT 'bank_transfer_fiji'");
ensureColumnExists($pdo, 'tenants', 'gateway_customer_id', 'VARCHAR(120) NULL');
ensureColumnExists($pdo, 'tenants', 'storage_used_mb', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
ensureColumnExists($pdo, 'tenants', 'bandwidth_used_mb', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
ensureColumnExists($pdo, 'tenants', 'suspended_at', 'DATETIME NULL');
ensureColumnExists($pdo, 'tenants', 'suspension_reason', 'VARCHAR(255) NULL');

ensureColumnExists($pdo, 'folders', 'tenant_id', 'BIGINT UNSIGNED NULL AFTER id');
ensureColumnExists($pdo, 'flipbooks', 'tenant_id', 'BIGINT UNSIGNED NULL AFTER id');
ensureColumnExists($pdo, 'flipbooks', 'category_id', 'BIGINT UNSIGNED NULL');
ensureColumnExists($pdo, 'flipbooks', 'collection_id', 'BIGINT UNSIGNED NULL');
ensureColumnExists($pdo, 'flipbooks', 'workflow_status', "ENUM('draft','processing','editing','in_review','scheduled','published','archived') NOT NULL DEFAULT 'draft'");
ensureColumnExists($pdo, 'flipbooks', 'version', 'INT UNSIGNED NOT NULL DEFAULT 1');
ensureColumnExists($pdo, 'flipbooks', 'pdf_metadata', 'JSON NULL');
ensureColumnExists($pdo, 'flipbooks', 'seo_meta', 'JSON NULL');
ensureColumnExists($pdo, 'flipbooks', 'toc', 'JSON NULL');
ensureColumnExists($pdo, 'flipbooks', 'conversion_progress', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
ensureColumnExists($pdo, 'flipbooks', 'conversion_step', 'VARCHAR(150) NULL');
ensureColumnExists($pdo, 'flipbooks', 'conversion_error', 'TEXT NULL');
ensureColumnExists($pdo, 'flipbooks', 'review_notes', 'TEXT NULL');
ensureColumnExists($pdo, 'flipbooks', 'reviewed_by', 'BIGINT UNSIGNED NULL');
ensureColumnExists($pdo, 'flipbooks', 'reviewed_at', 'DATETIME NULL');
ensureColumnExists($pdo, 'flipbooks', 'scheduled_at', 'DATETIME NULL');
ensureColumnExists($pdo, 'flipbooks', 'expires_at', 'DATETIME NULL');

ensureColumnExists($pdo, 'pages', 'high_res_path', 'VARCHAR(255) NULL AFTER image_path');
ensureColumnExists($pdo, 'pages', 'webp_path', 'VARCHAR(255) NULL AFTER high_res_path');
ensureColumnExists($pdo, 'pages', 'avif_path', 'VARCHAR(255) NULL AFTER webp_path');

ensureColumnExists($pdo, 'views', 'session_id', 'VARCHAR(64) NULL AFTER visitor_hash');
ensureColumnExists($pdo, 'views', 'duration_seconds', 'INT UNSIGNED NOT NULL DEFAULT 0');
ensureColumnExists($pdo, 'views', 'pages_viewed', 'INT UNSIGNED NOT NULL DEFAULT 1');
ensureColumnExists($pdo, 'views', 'max_page_reached', 'INT UNSIGNED NOT NULL DEFAULT 1');
ensureColumnExists($pdo, 'views', 'completed', 'TINYINT(1) NOT NULL DEFAULT 0');
ensureColumnExists($pdo, 'views', 'utm_source', 'VARCHAR(100) NULL');
ensureColumnExists($pdo, 'views', 'utm_medium', 'VARCHAR(100) NULL');
ensureColumnExists($pdo, 'views', 'utm_campaign', 'VARCHAR(100) NULL');
ensureColumnExists($pdo, 'views', 'utm_term', 'VARCHAR(100) NULL');
ensureColumnExists($pdo, 'views', 'utm_content', 'VARCHAR(100) NULL');

ensureColumnExists($pdo, 'api_keys', 'tenant_id', 'BIGINT UNSIGNED NULL AFTER id');
ensureColumnExists($pdo, 'api_keys', 'key_prefix', "VARCHAR(24) NOT NULL DEFAULT 'nvf_live_'");
ensureColumnExists($pdo, 'api_keys', 'scopes', 'JSON NULL');
ensureColumnExists($pdo, 'api_keys', 'last_used_at', 'DATETIME NULL');
ensureColumnExists($pdo, 'api_keys', 'last_used_ip', 'VARCHAR(64) NULL');
ensureColumnExists($pdo, 'api_keys', 'expires_at', 'DATETIME NULL');
ensureColumnExists($pdo, 'api_keys', 'revoked_at', 'DATETIME NULL');

ensureColumnExists($pdo, 'jobs', 'tenant_id', 'BIGINT UNSIGNED NULL AFTER id');
ensureColumnExists($pdo, 'jobs', 'flipbook_id', 'BIGINT UNSIGNED NULL AFTER tenant_id');
ensureColumnExists($pdo, 'jobs', 'status', "ENUM('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued'");
ensureColumnExists($pdo, 'jobs', 'progress', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
ensureColumnExists($pdo, 'jobs', 'current_step', 'VARCHAR(150) NULL');
ensureColumnExists($pdo, 'jobs', 'max_attempts', 'INT NOT NULL DEFAULT 3');
ensureColumnExists($pdo, 'jobs', 'timeout_seconds', 'INT NOT NULL DEFAULT 300');
ensureColumnExists($pdo, 'jobs', 'started_at', 'DATETIME NULL');

ensureColumnExists($pdo, 'audit_logs', 'tenant_id', 'BIGINT UNSIGNED NULL AFTER id');
ensureColumnExists($pdo, 'audit_logs', 'ip', 'VARCHAR(45) NULL');
ensureColumnExists($pdo, 'audit_logs', 'user_agent', 'VARCHAR(255) NULL');

ensureColumnExists($pdo, 'webhooks', 'tenant_id', 'BIGINT UNSIGNED NULL AFTER id');
ensureColumnExists($pdo, 'webhooks', 'user_id', 'BIGINT UNSIGNED NULL');
ensureColumnExists($pdo, 'webhooks', 'name', "VARCHAR(120) NOT NULL DEFAULT 'Webhook Endpoint'");
ensureColumnExists($pdo, 'webhooks', 'target_url', 'VARCHAR(500) NULL');
ensureColumnExists($pdo, 'webhooks', 'secret_token', 'VARCHAR(120) NULL');
ensureColumnExists($pdo, 'webhooks', 'events', 'JSON NULL');
ensureColumnExists($pdo, 'webhooks', 'last_triggered_at', 'DATETIME NULL');
ensureColumnExists($pdo, 'webhooks', 'last_status_code', 'INT NULL');

echo "Database schema & subscription tiers applied.\n";

// 3c. Multi-tenant database architecture (composite tenant FKs, outbox/event tables, immutable audit triggers)
try {
    $tenantArch = new \App\Database\TenantArchitectureMigration($pdo);
    $tenantArch->up();
    foreach ($tenantArch->report() as $line) {
        echo $line . "\n";
    }
} catch (\Throwable $e) {
    fwrite(STDERR, '  ! Multi-tenant architecture migration notice: ' . $e->getMessage() . "\n");
}

// 4. Ensure Private Storage Setup
$storageDir = __DIR__ . '/../storage';
if (!is_dir($storageDir)) {
    @mkdir($storageDir, 0775, true);
}
file_put_contents(
    $storageDir . '/.htaccess',
    "# Nuvis Flipex - Private Storage Directory\nRequire all denied\nDeny from all\n"
);
@mkdir($storageDir . '/tenants/1/publications', 0775, true);
@mkdir($storageDir . '/mail_logs', 0775, true);

// 5. Parse Command Line Arguments
$options = getopt('', ['admin-email:', 'admin-password:', 'admin-name:', 'generate-password', 'company-name:']);

$adminEmail = $options['admin-email'] ?? null;
$adminPassword = $options['admin-password'] ?? null;
$adminName = $options['admin-name'] ?? 'System Administrator';
$companyName = $options['company-name'] ?? 'Nuvis Flipex Corp';

if (!$adminEmail) {
    // If running in terminal, prompt interactively
    if (posix_isatty(STDIN) ?? false) {
        echo "\nEnter Initial Administrator Email: ";
        $adminEmail = trim((string) fgets(STDIN));
    } else {
        $adminEmail = 'nilesh@nuvistechnologies.com.fj';
    }
}

if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "ERROR: Invalid email address provided.\n");
    exit(1);
}

$generatedPassword = false;
if (isset($options['generate-password']) || empty($adminPassword)) {
    if (empty($adminPassword)) {
        // Generate a 24-character high-entropy password
        $bytes = random_bytes(18);
        $adminPassword = substr(base64_encode($bytes), 0, 24);
        $generatedPassword = true;
    }
}

if (strlen($adminPassword) < 8) {
    fwrite(STDERR, "ERROR: Administrator password must be at least 8 characters long.\n");
    exit(1);
}

// 6. Provision Corporate Tenant Workspace
$tenant = Db::one('SELECT id FROM tenants WHERE id = 1 OR slug = "nuvis-flipex"');
if (!$tenant) {
    $tenantUuid = bin2hex(random_bytes(16));
    Db::run(
        'INSERT INTO tenants (uuid, name, slug, plan_id, max_flipbooks, max_storage_mb, is_active, billing_name, billing_email, payment_status, currency)
         VALUES (?, ?, "nuvis-flipex", 3, 50, 5000, 1, ?, ?, "paid", "FJD")',
        [$tenantUuid, $companyName, $companyName, $adminEmail]
    );
    $tenantId = (int) Db::pdo()->lastInsertId();
    echo "Created primary corporate tenant workspace (ID: {$tenantId}, slug: /nuvis-flipex).\n";
} else {
    $tenantId = (int) $tenant['id'];
}

// 7. Provision Super Administrator Account
$existingUser = Db::one('SELECT id FROM users WHERE email = ?', [$adminEmail]);
$algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
$passwordHash = password_hash($adminPassword, $algo);

if ($existingUser) {
    Db::run(
        'UPDATE users SET password_hash = ?, role = "admin", tenant_role = "owner", tenant_id = ?, status = "active", email_verified_at = NOW() WHERE id = ?',
        [$passwordHash, $tenantId, $existingUser['id']]
    );
    $userId = (int) $existingUser['id'];
    echo "Updated existing account to Super Administrator (ID: {$userId}).\n";
} else {
    Db::run(
        'INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, plan_id, email_verified_at)
         VALUES (?, ?, ?, ?, "admin", "owner", "active", 3, NOW())',
        [$tenantId, $adminEmail, $passwordHash, $adminName]
    );
    $userId = (int) Db::pdo()->lastInsertId();
    echo "Created Super Administrator account (ID: {$userId}).\n";
}

// 8. Record in Audit Log
\App\Support\Audit::log('system.install', 'system', $userId, [
    'admin_email' => $adminEmail,
    'tenant_id' => $tenantId,
]);

echo "\n===============================================================\n";
echo "            Installation Completed Successfully!               \n";
echo "===============================================================\n";
echo "Administrator Email:  {$adminEmail}\n";
echo "Administrator Name:   {$adminName}\n";
if ($generatedPassword) {
    echo "Generated Password:   {$adminPassword}\n";
    echo "\n⚠️  IMPORTANT: Please store this password securely. It will not be shown again.\n";
} else {
    echo "Administrator Password: [Provided during setup]\n";
}
echo "Corporate Workspace:  /{$companyName} (ID: {$tenantId})\n";
echo "Tenant Isolation:     ACTIVE (Strict scoped storage and queries)\n";
echo "Document Security:    ACTIVE (Direct storage access disabled)\n";
echo "===============================================================\n\n";
