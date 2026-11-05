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

// Ensure cryptographically secure random JWT_SECRET
$envContent = file_get_contents($envFile);
if (
    !preg_match('/^JWT_SECRET=(.+)$/m', $envContent, $matches) ||
    trim($matches[1]) === '' ||
    str_contains($matches[1], 'replace_with') ||
    str_contains($matches[1], 'generate_using')
) {
    $randomSecret = bin2hex(random_bytes(32));
    if (preg_match('/^JWT_SECRET=.*$/m', $envContent)) {
        $envContent = preg_replace('/^JWT_SECRET=.*$/m', 'JWT_SECRET=' . $randomSecret, $envContent);
    } else {
        $envContent .= "\nJWT_SECRET=" . $randomSecret . "\n";
    }
    file_put_contents($envFile, $envContent);
    echo "Generated cryptographically secure 256-bit random JWT_SECRET.\n";
}

Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

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
    $sql = file_get_contents($schemaFile);
    foreach (array_filter(array_map('trim', explode(";\n", $sql))) as $stmt) {
        if ($stmt !== '') {
            $pdo->exec($stmt);
        }
    }
    echo "Database schema & subscription tiers applied.\n";
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
$passwordHash = password_hash($adminPassword, PASSWORD_ARGON2ID);

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
