<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Mailer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AdminController
{
    /** System Stats & Platform Overview */
    public function stats(Request $req, Response $res): Response
    {
        $totalUsers = (int) (Db::one('SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL')['c'] ?? 0);
        $activeUsers = (int) (Db::one("SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL AND status = 'active'")['c'] ?? 0);
        $totalCompanies = (int) (Db::one('SELECT COUNT(*) c FROM tenants')['c'] ?? 0);
        $activeCompanies = (int) (Db::one('SELECT COUNT(*) c FROM tenants WHERE is_active = 1')['c'] ?? 0);
        $totalFlipbooks = (int) (Db::one('SELECT COUNT(*) c FROM flipbooks')['c'] ?? 0);
        $readyFlipbooks = (int) (Db::one("SELECT COUNT(*) c FROM flipbooks WHERE status = 'ready'")['c'] ?? 0);
        $totalPages = (int) (Db::one('SELECT COUNT(*) c FROM pages')['c'] ?? 0);
        $totalViews = (int) (Db::one('SELECT COUNT(*) c FROM views')['c'] ?? 0);

        return Http::json($res, [
            'totalUsers' => $totalUsers,
            'activeUsers' => $activeUsers,
            'totalCompanies' => $totalCompanies,
            'activeCompanies' => $activeCompanies,
            'totalFlipbooks' => $totalFlipbooks,
            'readyFlipbooks' => $readyFlipbooks,
            'totalPages' => $totalPages,
            'totalViews' => $totalViews,
            'pdfEngine' => \App\Support\PdfRenderer::diagnostics(),
        ]);
    }

    /** List all users with tenant, plan, and publication count */
    public function users(Request $req, Response $res): Response
    {
        $q = trim((string) ($req->getQueryParams()['q'] ?? ''));
        $params = [];
        $sql = "SELECT u.id, u.email, u.name, u.role, u.tenant_role, u.status, u.plan_id, u.tenant_id,
                       u.email_verified_at, u.created_at, u.last_login_at,
                       t.name AS company_name, p.name AS plan_name,
                       (SELECT COUNT(*) FROM flipbooks f WHERE f.user_id = u.id) AS flipbooks_count
                FROM users u
                LEFT JOIN tenants t ON t.id = u.tenant_id
                LEFT JOIN plans p ON p.id = u.plan_id
                WHERE u.deleted_at IS NULL";

        if ($q !== '') {
            $sql .= " AND (u.name LIKE ? OR u.email LIKE ? OR t.name LIKE ?)";
            $params = ["%$q%", "%$q%", "%$q%"];
        }

        $sql .= " ORDER BY u.created_at DESC";
        $rows = Db::all($sql, $params);

        return Http::json($res, array_map(fn($r) => [
            'id' => (int) $r['id'],
            'email' => $r['email'],
            'name' => $r['name'],
            'role' => $r['role'],
            'tenantRole' => $r['tenant_role'] ?? 'editor',
            'status' => $r['status'],
            'planId' => (int) $r['plan_id'],
            'planName' => $r['plan_name'] ?? 'Free',
            'tenantId' => $r['tenant_id'] ? (int) $r['tenant_id'] : null,
            'companyName' => $r['company_name'] ?? 'None',
            'emailVerified' => $r['email_verified_at'] !== null,
            'flipbooksCount' => (int) $r['flipbooks_count'],
            'lastLoginAt' => $r['last_login_at'],
            'createdAt' => $r['created_at'],
        ], $rows));
    }

    /** Create a new user */
    public function createUser(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();
        $email = trim(strtolower((string) ($b['email'] ?? '')));
        $name = trim((string) ($b['name'] ?? ''));
        $password = (string) ($b['password'] ?? '');
        $role = ($b['role'] ?? 'user') === 'admin' ? 'admin' : 'user';
        $tenantRole = in_array($b['tenantRole'] ?? '', ['owner', 'admin', 'editor', 'viewer'], true) ? $b['tenantRole'] : 'editor';
        $status = ($b['status'] ?? 'active') === 'suspended' ? 'suspended' : 'active';
        $tenantId = !empty($b['tenantId']) ? (int) $b['tenantId'] : null;
        $planId = !empty($b['planId']) ? (int) $b['planId'] : 1;

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return Http::error($res, 'Validation failed', 422, ['email' => 'Valid email is required']);
        }
        if ($name === '' || mb_strlen($name) > 120) {
            return Http::error($res, 'Validation failed', 422, ['name' => 'Name is required']);
        }
        if (strlen($password) < 8) {
            return Http::error($res, 'Validation failed', 422, ['password' => 'Password must be at least 8 characters']);
        }
        if (Db::one('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [$email])) {
            return Http::error($res, 'Validation failed', 422, ['email' => 'Email is already registered']);
        }

        $hash = password_hash($password, PASSWORD_ARGON2ID);
        Db::run(
            'INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, plan_id, email_verified_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [$tenantId, $email, $hash, $name, $role, $tenantRole, $status, $planId]
        );

        $id = (int) Db::pdo()->lastInsertId();
        Audit::log('admin.create_user', 'user', $id, ['email' => $email, 'role' => $role, 'tenantRole' => $tenantRole]);

        return Http::json($res, ['id' => $id, 'email' => $email, 'name' => $name, 'role' => $role, 'tenantRole' => $tenantRole], 201);
    }

    /** Update an existing user */
    public function updateUser(Request $req, Response $res, array $args): Response
    {
        $id = (int) $args['id'];
        $u = Db::one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [$id]);
        if (!$u) {
            return Http::error($res, 'User not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $name = isset($b['name']) ? trim((string) $b['name']) : $u['name'];
        $role = isset($b['role']) && $b['role'] === 'admin' ? 'admin' : ($b['role'] ?? $u['role']);
        $tenantRole = isset($b['tenantRole']) && in_array($b['tenantRole'], ['owner', 'admin', 'editor', 'viewer'], true) ? $b['tenantRole'] : ($u['tenant_role'] ?? 'editor');
        $status = isset($b['status']) && $b['status'] === 'suspended' ? 'suspended' : ($b['status'] ?? $u['status']);
        $tenantId = array_key_exists('tenantId', $b) ? ($b['tenantId'] ? (int) $b['tenantId'] : null) : $u['tenant_id'];
        $planId = isset($b['planId']) ? (int) $b['planId'] : (int) $u['plan_id'];

        if ($name === '') {
            return Http::error($res, 'Validation failed', 422, ['name' => 'Name cannot be empty']);
        }

        Db::run(
            'UPDATE users SET name = ?, role = ?, tenant_role = ?, status = ?, tenant_id = ?, plan_id = ? WHERE id = ?',
            [$name, $role, $tenantRole, $status, $tenantId, $planId, $id]
        );

        // If user was suspended, revoke all active sessions immediately
        if ($status === 'suspended') {
            Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$id]);
        }

        Audit::log('admin.update_user', 'user', $id, ['name' => $name, 'role' => $role, 'tenantRole' => $tenantRole, 'status' => $status]);

        return Http::json($res, ['ok' => true]);
    }

    /** Directly reset / change password for a user */
    public function resetUserPassword(Request $req, Response $res, array $args): Response
    {
        $id = (int) $args['id'];
        $u = Db::one('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [$id]);
        if (!$u) {
            return Http::error($res, 'User not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $new = (string) ($b['password'] ?? '');
        if (strlen($new) < 8) {
            return Http::error($res, 'Validation failed', 422, ['password' => 'Password must be at least 8 characters']);
        }

        $hash = password_hash($new, PASSWORD_ARGON2ID);
        Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [$hash, $id]);
        // Invalidate sessions
        Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$id]);

        Audit::log('admin.reset_password', 'user', $id);

        return Http::json($res, ['ok' => true, 'message' => 'Password updated successfully']);
    }

    /** Delete user */
    public function deleteUser(Request $req, Response $res, array $args): Response
    {
        $id = (int) $args['id'];
        $currentAdmin = $req->getAttribute('user');
        if ((int) $currentAdmin['id'] === $id) {
            return Http::error($res, 'You cannot delete your own admin account', 400);
        }

        Db::run('UPDATE users SET deleted_at = NOW(), email = CONCAT(id, "+deleted+", email) WHERE id = ?', [$id]);
        Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [$id]);

        Audit::log('admin.delete_user', 'user', $id);

        return Http::json($res, ['ok' => true]);
    }

    /** Company (Tenant) Management: List companies */
    public function companies(Request $req, Response $res): Response
    {
        $q = trim((string) ($req->getQueryParams()['q'] ?? ''));
        $sql = "SELECT t.*, p.name AS plan_name, p.price AS plan_price,
                       (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.deleted_at IS NULL) AS users_count,
                       (SELECT COUNT(*) FROM flipbooks f WHERE f.tenant_id = t.id) AS flipbooks_count
                FROM tenants t
                LEFT JOIN plans p ON p.id = t.plan_id";
        $params = [];
        if ($q !== '') {
            $sql .= " WHERE t.name LIKE ? OR t.slug LIKE ?";
            $params = ["%$q%", "%$q%"];
        }
        $sql .= " ORDER BY t.created_at DESC";

        $rows = Db::all($sql, $params);
        return Http::json($res, array_map(fn($r) => [
            'id' => (int) $r['id'],
            'uuid' => $r['uuid'],
            'name' => $r['name'],
            'slug' => $r['slug'],
            'planId' => (int) $r['plan_id'],
            'planName' => $r['plan_name'] ?? 'Free',
            'planPrice' => (float) ($r['plan_price'] ?? 0),
            'maxFlipbooks' => (int) $r['max_flipbooks'],
            'maxStorageMb' => (int) $r['max_storage_mb'],
            'isActive' => (bool) $r['is_active'],
            'usersCount' => (int) $r['users_count'],
            'flipbooksCount' => (int) $r['flipbooks_count'],
            'createdAt' => $r['created_at'],
            'billingName' => $r['billing_name'] ?? $r['name'],
            'billingEmail' => $r['billing_email'] ?? '',
            'billingAddress' => $r['billing_address'] ?? '',
            'taxId' => $r['tax_id'] ?? '',
            'paymentMethod' => $r['payment_method'] ?? 'bank_transfer',
            'paymentStatus' => $r['payment_status'] ?? 'paid',
            'billingCycle' => $r['billing_cycle'] ?? 'monthly',
            'amount' => (float) ($r['amount'] ?? 0),
            'currency' => $r['currency'] ?? 'FJD',
            'lastPaymentDate' => $r['last_payment_date'],
            'nextBillingDate' => $r['next_billing_date'],
            'paymentReference' => $r['payment_reference'],
            'billingNotes' => $r['billing_notes'],
        ], $rows));
    }

    /** Create a new Company (Tenant) */
    public function createCompany(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();
        $name = trim((string) ($b['name'] ?? ''));
        $slug = trim(strtolower((string) ($b['slug'] ?? '')));
        $planId = !empty($b['planId']) ? (int) $b['planId'] : 1;
        $maxFlipbooks = !empty($b['maxFlipbooks']) ? (int) $b['maxFlipbooks'] : 10;
        $maxStorageMb = !empty($b['maxStorageMb']) ? (int) $b['maxStorageMb'] : 500;

        if ($name === '') {
            return Http::error($res, 'Validation failed', 422, ['name' => 'Company name is required']);
        }
        if ($slug === '' || !preg_match('/^[a-z0-9-]+$/', $slug)) {
            return Http::error($res, 'Validation failed', 422, ['slug' => 'Slug must contain only lowercase letters, numbers, and dashes']);
        }
        if (Db::one('SELECT id FROM tenants WHERE slug = ?', [$slug])) {
            return Http::error($res, 'Validation failed', 422, ['slug' => 'Company slug already taken']);
        }

        $uuid = bin2hex(random_bytes(16));
        $uuidFormatted = substr($uuid, 0, 8) . '-' . substr($uuid, 8, 4) . '-' . substr($uuid, 12, 4) . '-' . substr($uuid, 16, 4) . '-' . substr($uuid, 20);

        Db::run(
            'INSERT INTO tenants (uuid, name, slug, plan_id, max_flipbooks, max_storage_mb, is_active)
             VALUES (?, ?, ?, ?, ?, ?, 1)',
            [$uuidFormatted, $name, $slug, $planId, $maxFlipbooks, $maxStorageMb]
        );

        $id = (int) Db::lastInsertId();
        return Http::json($res, ['id' => $id, 'name' => $name, 'slug' => $slug], 201);
    }

    /** Update an existing Company (Tenant) */
    public function updateCompany(Request $req, Response $res, array $args): Response
    {
        $id = (int) $args['id'];
        $t = Db::one('SELECT * FROM tenants WHERE id = ?', [$id]);
        if (!$t) {
            return Http::error($res, 'Company not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $name = isset($b['name']) ? trim((string) $b['name']) : $t['name'];
        $slug = isset($b['slug']) ? trim(strtolower((string) $b['slug'])) : $t['slug'];
        $planId = isset($b['planId']) ? (int) $b['planId'] : (int) $t['plan_id'];
        $maxFlipbooks = isset($b['maxFlipbooks']) ? (int) $b['maxFlipbooks'] : (int) $t['max_flipbooks'];
        $maxStorageMb = isset($b['maxStorageMb']) ? (int) $b['maxStorageMb'] : (int) $t['max_storage_mb'];
        $isActive = isset($b['isActive']) ? ($b['isActive'] ? 1 : 0) : (int) $t['is_active'];

        if ($name === '') {
            return Http::error($res, 'Validation failed', 422, ['name' => 'Name cannot be empty']);
        }

        if ($slug !== $t['slug'] && Db::one('SELECT id FROM tenants WHERE slug = ? AND id <> ?', [$slug, $id])) {
            return Http::error($res, 'Validation failed', 422, ['slug' => 'Slug already in use']);
        }

        Db::run(
            'UPDATE tenants SET name = ?, slug = ?, plan_id = ?, max_flipbooks = ?, max_storage_mb = ?, is_active = ? WHERE id = ?',
            [$name, $slug, $planId, $maxFlipbooks, $maxStorageMb, $isActive, $id]
        );

        return Http::json($res, ['ok' => true]);
    }

    /** Update Company Payment & Billing Details (Admin) */
    public function updateCompanyBilling(Request $req, Response $res, array $args): Response
    {
        $id = (int) $args['id'];
        $t = Db::one('SELECT id FROM tenants WHERE id = ?', [$id]);
        if (!$t) {
            return Http::error($res, 'Company not found', 404);
        }

        $b = (array) $req->getParsedBody();
        $billingName = trim((string) ($b['billingName'] ?? ''));
        $billingEmail = trim((string) ($b['billingEmail'] ?? ''));
        $billingAddress = trim((string) ($b['billingAddress'] ?? ''));
        $taxId = trim((string) ($b['taxId'] ?? ''));
        $paymentMethod = in_array($b['paymentMethod'] ?? '', ['credit_card', 'bank_transfer', 'cheque', 'direct_debit', 'cash'], true) ? $b['paymentMethod'] : 'bank_transfer';
        $paymentStatus = in_array($b['paymentStatus'] ?? '', ['paid', 'pending', 'overdue', 'trial', 'exempt'], true) ? $b['paymentStatus'] : 'paid';
        $billingCycle = in_array($b['billingCycle'] ?? '', ['monthly', 'quarterly', 'annually'], true) ? $b['billingCycle'] : 'monthly';
        $amount = (float) ($b['amount'] ?? 0);
        $currency = strtoupper(trim((string) ($b['currency'] ?? 'FJD')));
        $lastPaymentDate = !empty($b['lastPaymentDate']) ? $b['lastPaymentDate'] : null;
        $nextBillingDate = !empty($b['nextBillingDate']) ? $b['nextBillingDate'] : null;
        $paymentReference = trim((string) ($b['paymentReference'] ?? ''));
        $billingNotes = trim((string) ($b['billingNotes'] ?? ''));

        Db::run(
            'UPDATE tenants SET billing_name = ?, billing_email = ?, billing_address = ?, tax_id = ?,
                              payment_method = ?, payment_status = ?, billing_cycle = ?, amount = ?,
                              currency = ?, last_payment_date = ?, next_billing_date = ?,
                              payment_reference = ?, billing_notes = ? WHERE id = ?',
            [
                $billingName, $billingEmail, $billingAddress, $taxId,
                $paymentMethod, $paymentStatus, $billingCycle, $amount,
                $currency, $lastPaymentDate, $nextBillingDate,
                $paymentReference, $billingNotes, $id
            ]
        );

        return Http::json($res, ['ok' => true]);
    }

    /** Delete Company */
    public function deleteCompany(Request $req, Response $res, array $args): Response
    {
        $id = (int) $args['id'];
        Db::run('UPDATE users SET tenant_id = NULL WHERE tenant_id = ?', [$id]);
        Db::run('UPDATE flipbooks SET tenant_id = NULL WHERE tenant_id = ?', [$id]);
        Db::run('DELETE FROM tenants WHERE id = ?', [$id]);
        return Http::json($res, ['ok' => true]);
    }

    /** List all Subscription Plans */
    public function plans(Request $req, Response $res): Response
    {
        $rows = Db::all(
            'SELECT p.*,
                    (SELECT COUNT(*) FROM tenants t WHERE t.plan_id = p.id) AS companies_count,
                    (SELECT COUNT(*) FROM users u WHERE u.plan_id = p.id AND u.deleted_at IS NULL) AS users_count
             FROM plans p ORDER BY p.price ASC'
        );

        return Http::json($res, array_map(fn($r) => [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'price' => (float) $r['price'],
            'maxFlipbooks' => (int) $r['max_flipbooks'],
            'maxPages' => (int) $r['max_pages'],
            'maxUploadMb' => (int) $r['max_upload_mb'],
            'monthlyViews' => (int) $r['monthly_views'],
            'removeBranding' => (bool) $r['remove_branding'],
            'companiesCount' => (int) $r['companies_count'],
            'usersCount' => (int) $r['users_count'],
        ], $rows));
    }

    /** Update a Subscription Plan */
    public function updatePlan(Request $req, Response $res, array $args): Response
    {
        $id = (int) $args['id'];
        $b = (array) $req->getParsedBody();

        $name = trim((string) ($b['name'] ?? ''));
        $price = (float) ($b['price'] ?? 0);
        $maxFlipbooks = (int) ($b['maxFlipbooks'] ?? 3);
        $maxPages = (int) ($b['maxPages'] ?? 50);
        $maxUploadMb = (int) ($b['maxUploadMb'] ?? 20);
        $monthlyViews = (int) ($b['monthlyViews'] ?? 1000);
        $removeBranding = !empty($b['removeBranding']) ? 1 : 0;

        if ($name === '') {
            return Http::error($res, 'Validation failed', 422, ['name' => 'Plan name is required']);
        }

        Db::run(
            'UPDATE plans SET name = ?, price = ?, max_flipbooks = ?, max_pages = ?, max_upload_mb = ?,
                              monthly_views = ?, remove_branding = ? WHERE id = ?',
            [$name, $price, $maxFlipbooks, $maxPages, $maxUploadMb, $monthlyViews, $removeBranding, $id]
        );

        return Http::json($res, ['ok' => true]);
    }

    /** Get Platform System & Email Settings */
    public function settings(Request $req, Response $res): Response
    {
        $rows = Db::all('SELECT setting_key, setting_value FROM system_settings');
        $map = [];
        foreach ($rows as $r) {
            $map[$r['setting_key']] = $r['setting_value'];
        }

        return Http::json($res, [
            'allowSelfRegistration' => ($map['allow_self_registration'] ?? '1') === '1',
            'smtpHost' => $map['smtp_host'] ?? '127.0.0.1',
            'smtpPort' => (int) ($map['smtp_port'] ?? 1025),
            'smtpUser' => $map['smtp_user'] ?? '',
            'smtpPass' => $map['smtp_pass'] ?? '',
            'smtpEncryption' => $map['smtp_encryption'] ?? 'none',
            'smtpFromEmail' => $map['smtp_from_email'] ?? 'noreply@nuvisflipex.com',
            'smtpFromName' => $map['smtp_from_name'] ?? 'Nuvis Flipex',
            'notifyWelcomeEmail' => ($map['notify_welcome_email'] ?? '1') === '1',
            'notifyCustomerOnPublish' => ($map['notify_customer_on_publish'] ?? '1') === '1',
        ]);
    }

    /** Update Platform & Email Settings */
    public function updateSettings(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();

        $keys = [
            'allow_self_registration' => isset($b['allowSelfRegistration']) ? ($b['allowSelfRegistration'] ? '1' : '0') : null,
            'smtp_host' => isset($b['smtpHost']) ? trim((string) $b['smtpHost']) : null,
            'smtp_port' => isset($b['smtpPort']) ? (string) (int) $b['smtpPort'] : null,
            'smtp_user' => isset($b['smtpUser']) ? trim((string) $b['smtpUser']) : null,
            'smtp_pass' => isset($b['smtpPass']) ? (string) $b['smtpPass'] : null,
            'smtp_encryption' => isset($b['smtpEncryption']) ? trim((string) $b['smtpEncryption']) : null,
            'smtp_from_email' => isset($b['smtpFromEmail']) ? trim((string) $b['smtpFromEmail']) : null,
            'smtp_from_name' => isset($b['smtpFromName']) ? trim((string) $b['smtpFromName']) : null,
            'notify_welcome_email' => isset($b['notifyWelcomeEmail']) ? ($b['notifyWelcomeEmail'] ? '1' : '0') : null,
            'notify_customer_on_publish' => isset($b['notifyCustomerOnPublish']) ? ($b['notifyCustomerOnPublish'] ? '1' : '0') : null,
        ];

        foreach ($keys as $k => $v) {
            if ($v !== null) {
                Db::run(
                    'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
                     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
                    [$k, $v]
                );
            }
        }

        return Http::json($res, ['ok' => true]);
    }

    /** Send SMTP Test Email */
    public function testEmail(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();
        $target = trim((string) ($b['email'] ?? ''));
        if (!filter_var($target, FILTER_VALIDATE_EMAIL)) {
            return Http::error($res, 'Validation failed', 422, ['email' => 'Valid email address is required']);
        }

        $sent = Mailer::customNotification(
            $target,
            'Nuvis Flipex — SMTP Configuration Test',
            'SMTP Configuration Verified!',
            "Congratulations! Your Nuvis Flipex email dispatch system is properly configured and communicating with your mail server.\n\nAll transactional alerts, 2FA security tokens, and customer notifications are active.",
            'Open Console',
            $_ENV['APP_URL'] ?? 'http://localhost:5173'
        );

        return Http::json($res, [
            'ok' => true,
            'sent' => $sent,
            'message' => $sent ? 'Test email dispatched via SMTP successfully!' : 'Test email dispatched in simulated mode (saved to storage logs). Check email logs table below.',
        ]);
    }

    /** Get Email Audit Logs */
    public function emailLogs(Request $req, Response $res): Response
    {
        $rows = Db::all('SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 50');
        return Http::json($res, array_map(fn($r) => [
            'id' => (int) $r['id'],
            'recipient' => $r['recipient'],
            'subject' => $r['subject'],
            'template' => $r['template'],
            'status' => $r['status'],
            'errorMessage' => $r['error_message'],
            'preview' => $r['body_preview'],
            'sentAt' => $r['sent_at'],
        ], $rows));
    }

    /** Broadcast Notification to Customers */
    public function sendBroadcast(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();
        $subject = trim((string) ($b['subject'] ?? ''));
        $title = trim((string) ($b['title'] ?? ''));
        $message = trim((string) ($b['message'] ?? ''));
        $target = trim((string) ($b['target'] ?? 'all')); // 'all' or specific email

        if ($subject === '' || $title === '' || $message === '') {
            return Http::error($res, 'Subject, Title, and Message are required', 422);
        }

        $recipients = [];
        if ($target === 'all') {
            $users = Db::all("SELECT email, name FROM users WHERE deleted_at IS NULL AND status = 'active'");
            foreach ($users as $u) {
                $recipients[] = $u['email'];
            }
        } elseif (filter_var($target, FILTER_VALIDATE_EMAIL)) {
            $recipients[] = $target;
        }

        $count = 0;
        foreach ($recipients as $email) {
            Mailer::customNotification($email, $subject, $title, $message);
            $count++;
        }

        return Http::json($res, ['ok' => true, 'sentCount' => $count]);
    }

    /** List Security Monitoring Events */
    public function securityEvents(Request $req, Response $res): Response
    {
        $severity = trim((string) ($req->getQueryParams()['severity'] ?? ''));
        $sql = 'SELECT se.*, u.email AS user_email, t.name AS tenant_name
                FROM security_events se
                LEFT JOIN users u ON u.id = se.user_id
                LEFT JOIN tenants t ON t.id = se.tenant_id';
        $params = [];
        if ($severity !== '') {
            $sql .= ' WHERE se.severity = ?';
            $params[] = $severity;
        }
        $sql .= ' ORDER BY se.created_at DESC LIMIT 100';

        $rows = Db::all($sql, $params);
        return Http::json($res, array_map(fn($r) => [
            'id' => (int) $r['id'],
            'eventType' => $r['event_type'],
            'severity' => $r['severity'],
            'ip' => $r['ip'],
            'userAgent' => $r['user_agent'],
            'details' => $r['details'] ? json_decode($r['details'], true) : null,
            'userEmail' => $r['user_email'],
            'tenantName' => $r['tenant_name'],
            'createdAt' => $r['created_at'],
        ], $rows));
    }

    /** List Sensitive Administrative Audit Trail */
    public function auditLogs(Request $req, Response $res): Response
    {
        $rows = Db::all(
            'SELECT al.*, u.email AS user_email, u.name AS user_name, t.name AS tenant_name
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             LEFT JOIN tenants t ON t.id = al.tenant_id
             ORDER BY al.created_at DESC LIMIT 100'
        );
        return Http::json($res, array_map(fn($r) => [
            'id' => (int) $r['id'],
            'action' => $r['action'],
            'targetType' => $r['target_type'],
            'targetId' => !empty($r['target_id']) ? (int) $r['target_id'] : null,
            'meta' => $r['meta'] ? json_decode($r['meta'], true) : null,
            'ip' => $r['ip'],
            'userAgent' => $r['user_agent'],
            'userEmail' => $r['user_email'],
            'userName' => $r['user_name'],
            'tenantName' => $r['tenant_name'],
            'createdAt' => $r['created_at'],
        ], $rows));
    }
}
