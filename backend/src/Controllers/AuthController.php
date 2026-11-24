<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Jwt;
use App\Support\Mailer;
use App\Support\PublisherIdentity;
use App\Support\SecurityMonitor;
use App\Support\SessionFamilies;
use App\Support\SessionSecurity;
use App\Support\Totp;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AuthController
{
    private const REFRESH_DAYS = 30;
    private const COOKIE = 'refresh_token';
    private static bool $authSchemaEnsured = false;

    public static function ensureAuthSchema(): void
    {
        if (\App\Support\SchemaGuard::isCurrent('auth')) {
            return;
        }
        self::ensureAuthSchemaImpl();
        \App\Support\SchemaGuard::done('auth');
    }

    private static function ensureAuthSchemaImpl(): void
    {
        if (self::$authSchemaEnsured) {
            return;
        }
        self::$authSchemaEnsured = true;
        try {
            $pdo = Db::pdo();

            // 1. Ensure rate_limits table exists
            $pdo->exec("CREATE TABLE IF NOT EXISTS `rate_limits` (
              `k` VARCHAR(190) NOT NULL,
              `window_start` INT UNSIGNED NOT NULL,
              `hits` INT UNSIGNED NOT NULL DEFAULT 1,
              PRIMARY KEY (`k`, `window_start`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // 2. Ensure system_settings table exists
            $pdo->exec("CREATE TABLE IF NOT EXISTS `system_settings` (
              `setting_key` VARCHAR(80) NOT NULL PRIMARY KEY,
              `setting_value` TEXT NULL,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // 3. Ensure refresh_tokens table exists
            $pdo->exec("CREATE TABLE IF NOT EXISTS `refresh_tokens` (
              `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              `user_id` BIGINT UNSIGNED NOT NULL,
              `family_id` CHAR(32) NULL,
              `token_hash` VARCHAR(64) NOT NULL UNIQUE,
              `user_agent` VARCHAR(255) NULL,
              `ip` VARCHAR(45) NULL,
              `expires_at` DATETIME NOT NULL,
              `revoked_at` DATETIME NULL,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX (`user_id`),
              INDEX `idx_refresh_family` (`family_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // 4. Ensure security_events table exists
            $pdo->exec("CREATE TABLE IF NOT EXISTS `security_events` (
              `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              `tenant_id` BIGINT UNSIGNED NULL,
              `user_id` BIGINT UNSIGNED NULL,
              `event_type` VARCHAR(80) NOT NULL,
              `severity` ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
              `ip` VARCHAR(45) NOT NULL,
              `user_agent` VARCHAR(255) NULL,
              `details` JSON NULL,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // 5. Ensure email_tokens table exists for forgot-password and verification links
            $pdo->exec("CREATE TABLE IF NOT EXISTS `email_tokens` (
              `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              `user_id` BIGINT UNSIGNED NOT NULL,
              `type` VARCHAR(32) NOT NULL,
              `token_hash` VARCHAR(64) NOT NULL,
              `used_at` DATETIME NULL,
              `expires_at` DATETIME NOT NULL,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              INDEX (`user_id`),
              INDEX (`token_hash`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

            // 6. Ensure missing columns on users table
            $cols = $pdo->query("SHOW COLUMNS FROM `users`")->fetchAll(\PDO::FETCH_COLUMN);
            $colMap = array_flip($cols);

            if (!isset($colMap['username'])) {
                try {
                    $pdo->exec("ALTER TABLE `users` ADD COLUMN `username` VARCHAR(80) NULL UNIQUE AFTER `email`");
                    $pdo->exec("UPDATE `users` SET `username` = SUBSTRING_INDEX(`email`, '@', 1) WHERE `username` IS NULL");
                } catch (\Throwable) {}
            }
            if (!isset($colMap['failed_login_attempts'])) {
                try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `failed_login_attempts` INT NOT NULL DEFAULT 0"); } catch (\Throwable) {}
            }
            if (!isset($colMap['lockout_until'])) {
                try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `lockout_until` DATETIME NULL"); } catch (\Throwable) {}
            }
            if (!isset($colMap['deleted_at'])) {
                try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `deleted_at` DATETIME NULL"); } catch (\Throwable) {}
            }
            if (!isset($colMap['two_factor_enabled'])) {
                try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `two_factor_enabled` TINYINT(1) NOT NULL DEFAULT 0"); } catch (\Throwable) {}
            }
            if (!isset($colMap['two_factor_method'])) {
                try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `two_factor_method` ENUM('email','totp') NOT NULL DEFAULT 'email'"); } catch (\Throwable) {}
            }
            if (!isset($colMap['two_factor_code'])) {
                try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `two_factor_code` VARCHAR(10) NULL"); } catch (\Throwable) {}
            }
            if (!isset($colMap['two_factor_expires_at'])) {
                try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `two_factor_expires_at` DATETIME NULL"); } catch (\Throwable) {}
            }
            if (!isset($colMap['totp_secret'])) {
                try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `totp_secret` VARCHAR(64) NULL"); } catch (\Throwable) {}
            }
            if (!isset($colMap['last_login_at'])) {
                try { $pdo->exec("ALTER TABLE `users` ADD COLUMN `last_login_at` DATETIME NULL"); } catch (\Throwable) {}
            }

            // SECURITY: this method used to "self-heal" by unlocking every locked account and
            // activating every pending/unverified user on every login request. That silently
            // disabled brute-force lockout and email verification, so it has been removed.
            // Locks expire on their own (SecurityMonitor::LOCKOUT_MINUTES) and admins can
            // unlock or activate individual users from the admin panel.
        } catch (\Throwable $e) {
            error_log('ensureAuthSchema non-fatal: ' . $e->getMessage());
        }
    }

    public function registrationStatus(Request $req, Response $res): Response
    {
        self::ensureAuthSchema();
        $allowed = true;
        try {
            $setting = Db::one("SELECT setting_value FROM system_settings WHERE setting_key = 'allow_self_registration'");
            if ($setting && $setting['setting_value'] === '0') {
                $allowed = false;
            }
        } catch (\Throwable) {
            $allowed = true;
        }
        return Http::json($res, ['allowed' => $allowed]);
    }

    /**
     * Public endpoint to check if a custom company URL slug is available (Issuu-style publisher URL check).
     */
    public function checkCompanySlug(Request $req, Response $res): Response
    {
        $params = $req->getQueryParams();
        $rawSlug = trim((string) ($params['slug'] ?? ''));
        $excludeTenantId = !empty($params['excludeTenantId']) ? (int) $params['excludeTenantId'] : null;

        $result = PublisherIdentity::checkCompanySlugAvailability($rawSlug, $excludeTenantId);
        return Http::json($res, $result);
    }

    public function register(Request $req, Response $res): Response
    {
        self::ensureAuthSchema();
        PublisherIdentity::ensureSchema();

        try {
            $setting = Db::one("SELECT setting_value FROM system_settings WHERE setting_key = 'allow_self_registration'");
            if ($setting && $setting['setting_value'] === '0') {
                return Http::error($res, 'Public self-registration is currently disabled by administrator. Please contact your organization administrator for an invite.', 403);
            }
        } catch (\Throwable) {
        }

        $b = (array) $req->getParsedBody();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $name = trim((string) ($b['name'] ?? ''));
        $pass = (string) ($b['password'] ?? '');
        $companyName = trim((string) ($b['companyName'] ?? $name));
        $requestedSlug = trim((string) ($b['companySlug'] ?? ''));

        $errors = [];
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Invalid email address';
        if ($name === '' || mb_strlen($name) > 120) $errors['name'] = 'Name is required';
        if ($companyName === '' || mb_strlen($companyName) > 150) $errors['companyName'] = 'Company / Publisher name is required';
        if (strlen($pass) < 8) $errors['password'] = 'Password must be at least 8 characters';

        // Validate or auto-generate clean unique company URL slug
        $workspaceSlug = '';
        if ($requestedSlug !== '') {
            $check = PublisherIdentity::checkCompanySlugAvailability($requestedSlug);
            if (!$check['available']) {
                $errors['companySlug'] = $check['reason'] ?? 'This company URL slug is not available';
            } else {
                $workspaceSlug = $check['slug'];
            }
        } else {
            $baseSlug = PublisherIdentity::sanitizeSlug($companyName !== '' ? $companyName : $name, 50) ?: 'publisher';
            $check = PublisherIdentity::checkCompanySlugAvailability($baseSlug);
            if ($check['available']) {
                $workspaceSlug = $check['slug'];
            } else {
                $workspaceSlug = substr($baseSlug, 0, 42) . '-' . bin2hex(random_bytes(2));
            }
        }

        if ($errors) return Http::error($res, 'Validation failed', 422, $errors);

        $existingUser = null;
        try {
            $existingUser = Db::one('SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [$email]);
        } catch (\Throwable) {
        }
        if ($existingUser) {
            return Http::error($res, 'Validation failed', 422, ['email' => 'This email address is already registered. Please sign in or use forgot password.']);
        }

        // Provision an isolated tenant workspace & public publisher identity for the newly registered user
        $newTenantId = null;
        $tenantUuid = bin2hex(random_bytes(16));
        $slugAttempts = [$workspaceSlug, substr($workspaceSlug, 0, 42) . '-' . bin2hex(random_bytes(2))];
        foreach ($slugAttempts as $s) {
            try {
                Db::run(
                    'INSERT INTO tenants (uuid, name, display_name, slug, slug_updated_at, public_profile_enabled, plan_id, is_active, billing_name, billing_email)
                     VALUES (?, ?, ?, ?, NOW(), 1, 1, 1, ?, ?)',
                    [$tenantUuid, $companyName, $companyName, $s, $companyName, $email]
                );
                $newTenantId = (int) Db::pdo()->lastInsertId();
                if ($newTenantId > 0) {
                    $workspaceSlug = $s;
                    break;
                }
            } catch (\Throwable) {
                try {
                    Db::run(
                        'INSERT INTO tenants (uuid, name, slug, plan_id, is_active, billing_name, billing_email)
                         VALUES (?, ?, ?, 1, 1, ?, ?)',
                        [$tenantUuid, $companyName, $s, $companyName, $email]
                    );
                    $newTenantId = (int) Db::pdo()->lastInsertId();
                    if ($newTenantId > 0) {
                        $workspaceSlug = $s;
                        break;
                    }
                } catch (\Throwable) {
                    try {
                        Db::run(
                            'INSERT INTO tenants (uuid, name, slug, plan_id, is_active)
                             VALUES (?, ?, ?, 1, 1)',
                            [$tenantUuid, $companyName, $s]
                        );
                        $newTenantId = (int) Db::pdo()->lastInsertId();
                        if ($newTenantId > 0) {
                            $workspaceSlug = $s;
                            break;
                        }
                    } catch (\Throwable) {
                    }
                }
            }
        }

        if ($newTenantId) {
            try {
                Db::run(
                    'INSERT INTO tenant_storefronts (tenant_id, business_name, slug, email, currency)
                     VALUES (?, ?, ?, ?, ?)',
                    [$newTenantId, $companyName, $workspaceSlug, $email, 'FJD']
                );
            } catch (\Throwable) {
            }
        }

        $id = 0;
        $hashedPass = password_hash($pass, PASSWORD_ARGON2ID);
        $userUsername = strtolower(explode('@', $email)[0]);

        $insertQueries = [
            ['INSERT INTO users (tenant_id, email, username, password_hash, name, role, tenant_role, status, email_verified_at) VALUES (?, ?, ?, ?, ?, "user", "owner", "active", NOW())', [$newTenantId, $email, $userUsername, $hashedPass, $name]],
            ['INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role, status, email_verified_at) VALUES (?, ?, ?, ?, "user", "owner", "active", NOW())', [$newTenantId, $email, $hashedPass, $name]],
            ['INSERT INTO users (tenant_id, email, password_hash, name, role, tenant_role) VALUES (?, ?, ?, ?, "user", "owner")', [$newTenantId, $email, $hashedPass, $name]],
            ['INSERT INTO users (tenant_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, "user")', [$newTenantId, $email, $hashedPass, $name]],
            ['INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, "user")', [$email, $hashedPass, $name]],
        ];

        $insertError = null;
        foreach ($insertQueries as [$sql, $params]) {
            try {
                Db::run($sql, $params);
                $id = (int) Db::pdo()->lastInsertId();
                if ($id > 0) {
                    $insertError = null;
                    break;
                }
            } catch (\Throwable $e) {
                $insertError = $e->getMessage();
                if (str_contains($insertError, 'Duplicate entry') && str_contains($insertError, 'email')) {
                    return Http::error($res, 'Validation failed', 422, ['email' => 'This email address is already registered. Please sign in or use forgot password.']);
                }
            }
        }

        if ($id <= 0) {
            error_log('User registration could not insert user: ' . ($insertError ?? 'unknown error'));
            return Http::error($res, 'Account could not be created at this moment. Please try again or contact support.', 500);
        }

        try {
            $this->sendVerification($id, $email, $name);
        } catch (\Throwable) {
        }

        try {
            Audit::log('user.register', 'user', $id, [
                'email' => $email,
                'company_name' => $companyName,
                'company_slug' => $workspaceSlug,
            ]);
        } catch (\Throwable) {
        }

        try {
            Mailer::accountCreated($email, $name);
        } catch (\Throwable) {
        }

        return Http::json($res, [
            'message' => 'Account created. Check your email to verify.',
            'companySlug' => $workspaceSlug,
            'profileUrl' => '/' . $workspaceSlug,
        ], 201);
    }

    /**
     * Resolve the account for a login identifier deterministically.
     * Exact email/username wins. The looser fallbacks (display name, e-mail prefix, workspace
     * slug) only apply when they identify exactly one account, so a user can never be matched
     * to someone else's row by choosing a colliding name.
     */
    private static function findLoginUser(string $login): ?array
    {
        $notDeleted = '(u.deleted_at IS NULL OR u.deleted_at = "" OR u.deleted_at LIKE "0000%")';
        try {
            $exact = Db::one(
                "SELECT u.* FROM users u
                 WHERE (LOWER(TRIM(u.email)) = LOWER(?) OR (u.username IS NOT NULL AND LOWER(TRIM(u.username)) = LOWER(?)))
                 AND {$notDeleted} LIMIT 1",
                [$login, $login]
            );
            if ($exact) {
                return $exact;
            }
            $rows = Db::all(
                "SELECT u.* FROM users u
                 LEFT JOIN tenants t ON t.id = u.tenant_id
                 WHERE (
                     LOWER(TRIM(u.name)) = LOWER(?)
                     OR (t.slug IS NOT NULL AND LOWER(TRIM(t.slug)) = LOWER(?))
                     OR SUBSTRING_INDEX(LOWER(TRIM(u.email)), '@', 1) = LOWER(?)
                 )
                 AND {$notDeleted} LIMIT 2",
                [$login, $login, $login]
            );
            return count($rows) === 1 ? $rows[0] : null;
        } catch (\Throwable $e) {
            error_log('Login lookup failed: ' . $e->getMessage());
            try {
                $row = Db::one(
                    'SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND (deleted_at IS NULL OR deleted_at = "" OR deleted_at LIKE "0000%") LIMIT 1',
                    [$login]
                );
                return $row ?: null;
            } catch (\Throwable) {
                return null;
            }
        }
    }

    /** Constant-time check against legacy unsalted hashes (MD5/SHA1/SHA256, MySQL PASSWORD()). */
    private static function legacyHashMatches(string $stored, string $pass): bool
    {
        $stored = strtolower(trim($stored));
        if (str_starts_with($stored, '*') && strlen($stored) === 41) {
            return hash_equals($stored, strtolower('*' . strtoupper(sha1(sha1($pass, true)))));
        }
        return hash_equals($stored, md5($pass))
            || hash_equals($stored, sha1($pass))
            || hash_equals($stored, hash('sha256', $pass));
    }

    public function login(Request $req, Response $res): Response
    {
        self::ensureAuthSchema();
        $b = (array) $req->getParsedBody();
        $loginInput = trim((string) ($b['email'] ?? $b['username'] ?? ''));

        if ($loginInput === '') {
            return Http::error($res, 'Email or username is required', 422, ['email' => 'Email or username is required']);
        }

        $user = self::findLoginUser($loginInput);

        $passInput = (string) ($b['password'] ?? '');
        $storedHash = (string) ($user['password_hash'] ?? '');

        // Enforce account lockout BEFORE checking the password so a locked account can't be
        // brute-forced and the response doesn't reveal whether the password was right.
        if ($user && SecurityMonitor::isLockedOut($user)) {
            SecurityMonitor::logEvent('login_blocked_locked_account', 'warning', ['login' => $loginInput], (int) $user['id']);
            return Http::error($res, 'Too many failed attempts. Try again in ' . SecurityMonitor::LOCKOUT_MINUTES . ' minutes or reset your password.', 429);
        }

        // Password verification. Argon2id/bcrypt are the norm; legacy unsalted MD5/SHA1/SHA256
        // and MySQL PASSWORD() hashes from migrated accounts are still accepted, compared in
        // constant time and upgraded to Argon2id on the first successful login.
        // Plain-text stored passwords are NOT accepted: a database leak would otherwise be a
        // direct login credential.
        $passwordValid = false;
        $needsUpgrade = false;
        if ($user && $passInput !== '' && $storedHash !== '') {
            if (password_verify($passInput, $storedHash)) {
                $passwordValid = true;
            } elseif (self::legacyHashMatches($storedHash, $passInput)) {
                $passwordValid = true;
                $needsUpgrade = true;
            }
        } else {
            // Equalise timing for unknown users so accounts can't be enumerated by response time.
            password_hash($passInput === '' ? 'x' : $passInput, PASSWORD_ARGON2ID);
        }

        if (!$passwordValid) {
            try {
                SecurityMonitor::recordFailedLogin($loginInput, $user ? (int) $user['id'] : null);
            } catch (\Throwable) {
            }
            return Http::error($res, 'Invalid email or password', 401);
        }

        if ($needsUpgrade) {
            try {
                Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($passInput, PASSWORD_ARGON2ID), $user['id']]);
            } catch (\Throwable) {
            }
        }

        $email = (string) ($user['email'] ?? $loginInput);

        // Account status gate. Suspended/disabled users must never be re-activated by logging in.
        $status = (string) ($user['status'] ?? 'active');
        if ($status !== 'active') {
            if (in_array($status, ['pending', 'unverified'], true) && empty($user['email_verified_at'])) {
                return Http::error($res, 'Please verify your email address before signing in.', 403);
            }
            if (in_array($status, ['pending', 'unverified'], true)) {
                // Email was verified but the status was never flipped; safe to activate.
                try {
                    Db::run('UPDATE users SET status = "active" WHERE id = ?', [$user['id']]);
                    $user['status'] = 'active';
                } catch (\Throwable) {
                }
            } else {
                SecurityMonitor::logEvent('login_blocked_inactive_account', 'warning', ['status' => $status], (int) $user['id']);
                return Http::error($res, 'This account is not active. Contact your administrator.', 403);
            }
        }

        // Password verified - clear failed attempts
        try {
            SecurityMonitor::resetFailedLogin((int) $user['id']);
        } catch (\Throwable) {
        }

        try {
            if (password_needs_rehash($user['password_hash'], PASSWORD_ARGON2ID)) {
                Db::run('UPDATE users SET password_hash = ? WHERE id = ?',
                    [password_hash($passInput, PASSWORD_ARGON2ID), $user['id']]);
            }
        } catch (\Throwable) {
        }

        // 3. Two-Factor Authentication Check (supports TOTP and Email OTP)
        if (!empty($user['two_factor_enabled'])) {
            $method = $user['two_factor_method'] ?? 'email';
            $token = Jwt::issue2fa((int) $user['id']);

            if ($method === 'email') {
                $code = str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
                try {
                    Db::run(
                        'UPDATE users SET two_factor_code = ?, two_factor_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?',
                        [$code, $user['id']]
                    );
                    Mailer::send2faCode($user['email'], $user['name'], $code);
                } catch (\Throwable $e) {
                    error_log('2FA mailer error non-fatal: ' . $e->getMessage());
                }
            }

            return Http::json($res, [
                'twoFactorRequired' => true,
                'twoFactorToken' => $token,
                'method' => $method,
                'email' => $email,
            ]);
        }

        try {
            Db::run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);
        } catch (\Throwable) {
        }
        try {
            $user = $this->ensureUserTenantAssigned($user);
        } catch (\Throwable) {
        }
        try {
            Audit::log('auth.login', 'user', (int) $user['id'], ['email' => $email]);
        } catch (\Throwable) {
        }

        $res = $this->startSession($req, $res, $user);
        return Http::json($res, $this->sessionPayload($user));
    }

    public function verify2fa(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();
        $token = (string) ($b['twoFactorToken'] ?? '');
        $code = trim((string) ($b['code'] ?? ''));

        $claims = Jwt::verify($token);
        if (!$claims || ($claims->type ?? null) !== '2fa') {
            return Http::error($res, '2FA session expired. Please sign in again.', 401);
        }

        $user = Db::one(
            'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND status = "active"',
            [$claims->sub]
        );
        if (!$user) {
            return Http::error($res, 'User not found', 404);
        }

        $method = $user['two_factor_method'] ?? 'email';
        if ($method === 'totp') {
            if (empty($user['totp_secret']) || !Totp::verify($code, $user['totp_secret'])) {
                SecurityMonitor::logEvent('totp_verification_failed', 'warning', ['user_id' => $user['id']], (int) $user['id']);
                return Http::error($res, 'Invalid 6-digit authenticator code', 422, ['code' => 'Invalid authenticator code. Check your device time.']);
            }
        } else {
            if (empty($user['two_factor_code']) || !hash_equals((string) $user['two_factor_code'], $code) || strtotime((string) $user['two_factor_expires_at']) < time()) {
                SecurityMonitor::logEvent('email_otp_verification_failed', 'warning', ['user_id' => $user['id']], (int) $user['id']);
                return Http::error($res, 'Invalid or expired 2FA code', 422, ['code' => 'Invalid or expired verification code']);
            }
            Db::run('UPDATE users SET two_factor_code = NULL, two_factor_expires_at = NULL WHERE id = ?', [$user['id']]);
        }

        Db::run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);
        Audit::log('auth.2fa_verify', 'user', (int) $user['id'], ['method' => $method]);

        $res = $this->startSession($req, $res, $user);
        return Http::json($res, $this->sessionPayload($user));
    }

    public function resend2fa(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();
        $token = (string) ($b['twoFactorToken'] ?? '');
        $claims = Jwt::verify($token);
        if (!$claims || ($claims->type ?? null) !== '2fa') {
            return Http::error($res, '2FA session expired. Please sign in again.', 401);
        }

        $user = Db::one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [$claims->sub]);
        if ($user && ($user['two_factor_method'] ?? 'email') === 'email') {
            $code = str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
            Db::run(
                'UPDATE users SET two_factor_code = ?, two_factor_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?',
                [$code, $user['id']]
            );
            Mailer::send2faCode($user['email'], $user['name'], $code);
        }
        return Http::json($res, ['ok' => true]);
    }

    public function refresh(Request $req, Response $res): Response
    {
        if ($req->getHeaderLine('X-Requested-With') !== 'XMLHttpRequest') {
            return Http::error($res, 'Bad request', 400);
        }
        $raw = $req->getCookieParams()[self::COOKIE] ?? '';
        if (!$raw) {
            return $this->clearCookie(Http::error($res, 'Session expired', 401), $req);
        }

        $tokenHash = hash('sha256', $raw);
        SessionFamilies::ensureSchema();
        $row = Db::one('SELECT * FROM refresh_tokens WHERE token_hash = ?', [$tokenHash]);

        $cfg = SessionSecurity::getConfig();
        $grace = $cfg['tokenReplayGraceSeconds'];
        $currentIp = $this->resolveClientIp($req);
        $currentUa = substr($req->getHeaderLine('User-Agent'), 0, 255);

        // Security: Token Replay Detection with in-flight concurrency grace period & same-device tab recovery
        if ($row && $row['revoked_at'] !== null) {
            $revokedTime = strtotime((string) $row['revoked_at']);
            $sameDevice = (!empty($row['ip']) && $row['ip'] === $currentIp) ||
                          (!empty($row['user_agent']) && $row['user_agent'] === $currentUa);

            // In-flight race condition (concurrent API polling) or same-device background tab wake-up:
            // Issue a fresh rotated session and set the updated cookie so the browser heals seamlessly.
            if ((time() - $revokedTime <= $grace) || $sameDevice) {
                $user = Db::one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND status = "active"', [$row['user_id']]);
                if ($user) {
                    $user = $this->ensureUserTenantAssigned($user);
                    $familyId = !empty($row['family_id']) ? (string) $row['family_id'] : null;
                    if ($familyId !== null) {
                        SessionFamilies::markRotated($familyId);
                    }
                    $res = $this->startSession($req, $res, $user, $familyId);
                    return Http::json($res, $this->sessionPayload($user));
                }
            }

            SecurityMonitor::logEvent('token_replay_detected', 'critical', [
                'user_id' => $row['user_id'],
                'token_id' => $row['id'],
                'family_id' => $row['family_id'] ?? null,
                'revoked_at' => $row['revoked_at'],
                'client_ip' => $currentIp,
                'user_agent' => $currentUa,
            ], (int) $row['user_id']);

            if (!empty($row['family_id'])) {
                // Terminate only the compromised session family (other devices stay signed in)
                SessionFamilies::revoke((string) $row['family_id'], 'token_replay');
            } else {
                // Legacy token without family: fall back to revoking every session for the user
                Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$row['user_id']]);
            }
            return $this->clearCookie(Http::error($res, 'Security alert: Token reuse detected. This session was terminated.', 401), $req);
        }

        if (!$row || strtotime((string) $row['expires_at']) < time()) {
            return $this->clearCookie(Http::error($res, 'Session expired', 401), $req);
        }

        $user = Db::one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND status = "active"', [$row['user_id']]);
        if (!$user) return $this->clearCookie(Http::error($res, 'Session expired', 401), $req);
        $user = $this->ensureUserTenantAssigned($user);

        // Token rotation: revoke old token and issue fresh token within the same session family
        $familyId = SessionFamilies::adopt(
            $row,
            $user,
            substr($req->getHeaderLine('User-Agent'), 0, 255),
            $req->getServerParams()['REMOTE_ADDR'] ?? null
        );
        Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [$row['id']]);
        SessionFamilies::markRotated($familyId);
        $res = $this->startSession($req, $res, $user, $familyId);
        return Http::json($res, $this->sessionPayload($user));
    }

    public function logout(Request $req, Response $res): Response
    {
        $raw = $req->getCookieParams()[self::COOKIE] ?? '';
        if ($raw) {
            Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?', [hash('sha256', $raw)]);
        }
        return $this->clearCookie(Http::json($res, ['ok' => true]), $req);
    }

    public function verifyEmail(Request $req, Response $res): Response
    {
        $token = (string) (((array) $req->getParsedBody())['token'] ?? '');
        $row = $this->consumeToken($token, 'verify');
        if (!$row) return Http::error($res, 'Invalid or expired link', 400);
        Db::run('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [$row['user_id']]);
        Audit::log('user.verify_email', 'user', (int) $row['user_id']);
        return Http::json($res, ['ok' => true]);
    }

    public function resendVerification(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        if (!$u['email_verified_at']) $this->sendVerification((int) $u['id'], $u['email'], $u['name']);
        return Http::json($res, ['ok' => true]);
    }

    public function forgotPassword(Request $req, Response $res): Response
    {
        self::ensureAuthSchema();
        $b = (array) $req->getParsedBody();
        $loginInput = strtolower(trim((string) ($b['email'] ?? $b['username'] ?? '')));

        if ($loginInput === '') {
            return Http::json($res, ['message' => 'If that account exists, a reset link has been sent.']);
        }

        try {
            $user = null;
            try {
                $user = Db::one(
                    'SELECT u.id, u.name, u.email FROM users u
                     LEFT JOIN tenants t ON t.id = u.tenant_id
                     WHERE (
                         LOWER(TRIM(u.email)) = LOWER(?)
                         OR (u.username IS NOT NULL AND LOWER(TRIM(u.username)) = LOWER(?))
                         OR LOWER(TRIM(u.name)) = LOWER(?)
                         OR (t.slug IS NOT NULL AND LOWER(TRIM(t.slug)) = LOWER(?))
                         OR SUBSTRING_INDEX(LOWER(TRIM(u.email)), \'@\', 1) = LOWER(?)
                         OR LOWER(u.name) LIKE CONCAT(LOWER(?), \' %\')
                         OR LOWER(u.name) LIKE CONCAT(\'% \', LOWER(?))
                     )
                     AND (u.deleted_at IS NULL OR u.deleted_at = "" OR u.deleted_at LIKE "0000%")
                     LIMIT 1',
                    [$loginInput, $loginInput, $loginInput, $loginInput, $loginInput, $loginInput, $loginInput]
                );
            } catch (\Throwable) {
                $user = Db::one(
                    'SELECT id, name, email FROM users
                     WHERE (
                         LOWER(email) = LOWER(?)
                         OR LOWER(name) = LOWER(?)
                         OR SUBSTRING_INDEX(LOWER(email), \'@\', 1) = LOWER(?)
                     )
                     AND (deleted_at IS NULL OR deleted_at = "" OR deleted_at LIKE "0000%")
                     LIMIT 1',
                    [$loginInput, $loginInput, $loginInput]
                );
            }

            if ($user) {
                $token = $this->createToken((int) $user['id'], 'reset', 1);
                $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
                    (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ? 'https' : 'http';
                $host = !empty($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : 'flipex.ict-fj.com';
                $appUrl = rtrim($_ENV['APP_URL'] ?? "{$scheme}://{$host}", '/');
                $link = "{$appUrl}/reset-password?token={$token}";

                try {
                    Mailer::passwordReset($user['email'], $user['name'], $link);
                } catch (\Throwable $e) {
                    error_log('Mailer::passwordReset non-fatal: ' . $e->getMessage());
                }

                try {
                    Audit::log('auth.forgot_password_request', 'user', (int) $user['id'], ['email' => $user['email']]);
                } catch (\Throwable) {
                }
            }
        } catch (\Throwable $e) {
            error_log('forgotPassword non-fatal error: ' . $e->getMessage());
        }

        // Always return success message to avoid account enumeration
        return Http::json($res, ['message' => 'If that account exists, a reset link has been sent.']);
    }

    public function resetPassword(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();
        $pass = (string) ($b['password'] ?? '');
        if (strlen($pass) < 8) {
            return Http::error($res, 'Validation failed', 422, ['password' => 'Password must be at least 8 characters']);
        }
        $row = $this->consumeToken((string) ($b['token'] ?? ''), 'reset');
        if (!$row) return Http::error($res, 'Invalid or expired link', 400);

        Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($pass, PASSWORD_ARGON2ID), $row['user_id']]);
        Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$row['user_id']]);

        Audit::log('auth.reset_password_completed', 'user', (int) $row['user_id']);

        return Http::json($res, ['ok' => true]);
    }

    // ---- helpers ----

    private function sessionPayload(array $user): array
    {
        $tenantName = null;
        if (!empty($user['tenant_id'])) {
            $t = Db::one('SELECT name FROM tenants WHERE id = ?', [$user['tenant_id']]);
            $tenantName = $t['name'] ?? null;
        }

        return [
            'accessToken' => Jwt::issue((int) $user['id'], $user['role']),
            'user' => [
                'id' => (int) $user['id'],
                'email' => $user['email'],
                'name' => $user['name'],
                'role' => $user['role'],
                'tenantRole' => $user['tenant_role'] ?? 'editor',
                'tenantId' => !empty($user['tenant_id']) ? (int) $user['tenant_id'] : null,
                'companyName' => $tenantName,
                'emailVerified' => $user['email_verified_at'] !== null,
                'twoFactorEnabled' => !empty($user['two_factor_enabled']),
                'twoFactorMethod' => $user['two_factor_method'] ?? 'email',
                'permissions' => \App\Support\Rbac::getPermissionsForUser($user),
            ],
        ];
    }

    /**
     * Ensure an interactive user logging in or refreshing has a valid tenant workspace assigned.
     */
    private function ensureUserTenantAssigned(array $user): array
    {
        if (!empty($user['tenant_id'])) {
            return $user;
        }
        try {
            if (($user['role'] ?? '') === 'admin') {
                $t = Db::one('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
                if ($t) {
                    $tid = (int) $t['id'];
                } else {
                    Db::run(
                        'INSERT INTO tenants (uuid, name, slug, plan_id, max_flipbooks, max_storage_mb, is_active, billing_name, billing_email, payment_status, currency)
                         VALUES (?, "Nuvis Flipex", "nuvis-flipex", 3, 50, 5000, 1, "Nuvis Flipex", ?, "paid", "FJD")',
                        [bin2hex(random_bytes(16)), $user['email'] ?? 'admin@localhost']
                    );
                    $tid = (int) Db::pdo()->lastInsertId();
                }
                Db::run('UPDATE users SET tenant_id = ? WHERE id = ?', [$tid, $user['id']]);
                $user['tenant_id'] = $tid;
            }
        } catch (\Throwable) {
        }
        return $user;
    }

    public function keepalive(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        if (!$u) {
            return Http::error($res, 'Unauthorized', 401);
        }
        $user = Db::one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND status = "active"', [$u['id']]);
        if (!$user) {
            return $this->clearCookie(Http::error($res, 'User inactive or removed', 401));
        }
        $user = $this->ensureUserTenantAssigned($user);
        return Http::json($res, [
            'ok' => true,
            'active' => true,
            'user' => $this->sessionPayload($user)['user'],
            'accessToken' => Jwt::issue((int) $user['id'], $user['role']),
        ]);
    }

    private function resolveClientIp(Request $req): string
    {
        $server = $req->getServerParams();
        $headers = [
            'CF-Connecting-IP',
            'X-Forwarded-For',
            'X-Real-IP',
        ];
        foreach ($headers as $h) {
            $val = trim($req->getHeaderLine($h));
            if ($val !== '') {
                $parts = explode(',', $val);
                $ip = trim($parts[0]);
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        return (string) ($server['REMOTE_ADDR'] ?? '127.0.0.1');
    }

    private function isHttps(Request $req): bool
    {
        $server = $req->getServerParams();
        return (($_ENV['APP_ENV'] ?? '') === 'production')
            || ($req->getUri()->getScheme() === 'https')
            || (isset($server['HTTPS']) && $server['HTTPS'] !== 'off')
            || (($_SERVER['HTTPS'] ?? '') !== 'off' && !empty($_SERVER['HTTPS']))
            || (strtolower($req->getHeaderLine('X-Forwarded-Proto')) === 'https')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    }

    private function startSession(Request $req, Response $res, array $user, ?string $familyId = null): Response
    {
        $raw = bin2hex(random_bytes(32));
        $userAgent = substr($req->getHeaderLine('User-Agent'), 0, 255);
        $ip = $this->resolveClientIp($req);
        $familyId ??= SessionFamilies::create($user, $userAgent, $ip);
        $tokenHash = hash('sha256', $raw);

        $cfg = SessionSecurity::getConfig();
        $refreshDays = $cfg['refreshDays'];
        $sameSite = $cfg['cookieSameSite'];

        $inserted = false;
        if (SessionFamilies::hasFamilyColumn()) {
            try {
                Db::run(
                    'INSERT INTO refresh_tokens (user_id, family_id, token_hash, user_agent, ip, expires_at)
                     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
                    [
                        $user['id'], $familyId, $tokenHash,
                        $userAgent,
                        $ip,
                        $refreshDays,
                    ]
                );
                $inserted = true;
            } catch (\Throwable) {
                $inserted = false;
            }
        }
        if (!$inserted) {
            try {
                Db::run(
                    'INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
                     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
                    [
                        $user['id'], $tokenHash,
                        $userAgent,
                        $ip,
                        $refreshDays,
                    ]
                );
            } catch (\Throwable) {
                try {
                    Db::run(
                        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
                         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
                        [$user['id'], $tokenHash, $refreshDays]
                    );
                } catch (\Throwable $e) {
                    error_log('refresh_token insert fatal: ' . $e->getMessage());
                }
            }
        }
        $secure = $this->isHttps($req) ? '; Secure' : '';
        return $res->withAddedHeader('Set-Cookie', sprintf(
            '%s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=%s%s',
            self::COOKIE, $raw, $refreshDays * 86400, $sameSite, $secure
        ));
    }

    private function clearCookie(Response $res, ?Request $req = null): Response
    {
        $cfg = SessionSecurity::getConfig();
        $sameSite = $cfg['cookieSameSite'];
        $isHttps = $req ? $this->isHttps($req) : (
            (($_ENV['APP_ENV'] ?? '') === 'production')
            || (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        );
        $secure = $isHttps ? '; Secure' : '';
        return $res->withAddedHeader('Set-Cookie', sprintf(
            '%s=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=%s%s',
            self::COOKIE, $sameSite, $secure
        ));
    }

    private function createToken(int $userId, string $type, int $hours): string
    {
        self::ensureAuthSchema();
        $raw = bin2hex(random_bytes(32));
        try {
            Db::run(
                'INSERT INTO email_tokens (user_id, type, token_hash, expires_at)
                 VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
                [$userId, $type, hash('sha256', $raw), $hours]
            );
        } catch (\Throwable $e) {
            error_log('createToken insert error: ' . $e->getMessage());
        }
        return $raw;
    }

    private function consumeToken(string $raw, string $type): ?array
    {
        if ($raw === '') return null;
        $row = Db::one(
            'SELECT * FROM email_tokens WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > NOW()',
            [hash('sha256', $raw), $type]
        );
        if ($row) Db::run('UPDATE email_tokens SET used_at = NOW() WHERE id = ?', [$row['id']]);
        return $row;
    }

    private function sendVerification(int $id, string $email, string $name): void
    {
        $link = ($_ENV['APP_URL'] ?? 'http://localhost:5173') . '/verify-email?token=' . $this->createToken($id, 'verify', 48);
        try {
            Mailer::send($email, 'Verify your email',
                '<p>Hi ' . htmlspecialchars($name) . ',</p><p><a href="' . $link . '">Verify your email</a> (valid 48 hours).</p>');
        } catch (\Throwable $e) {
            error_log('Mail failed: ' . $e->getMessage());
        }
    }
}
