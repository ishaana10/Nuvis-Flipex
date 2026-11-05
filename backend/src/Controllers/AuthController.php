<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Jwt;
use App\Support\Mailer;
use App\Support\SecurityMonitor;
use App\Support\Totp;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AuthController
{
    private const REFRESH_DAYS = 30;
    private const COOKIE = 'refresh_token';

    public function registrationStatus(Request $req, Response $res): Response
    {
        $setting = Db::one("SELECT setting_value FROM system_settings WHERE setting_key = 'allow_self_registration'");
        $allowed = !$setting || $setting['setting_value'] !== '0';
        return Http::json($res, ['allowed' => $allowed]);
    }

    public function register(Request $req, Response $res): Response
    {
        $setting = Db::one("SELECT setting_value FROM system_settings WHERE setting_key = 'allow_self_registration'");
        if ($setting && $setting['setting_value'] === '0') {
            return Http::error($res, 'Public self-registration is currently disabled by administrator. Please contact your organization administrator for an invite.', 403);
        }

        $b = (array) $req->getParsedBody();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $name = trim((string) ($b['name'] ?? ''));
        $pass = (string) ($b['password'] ?? '');

        $errors = [];
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors['email'] = 'Invalid email address';
        if ($name === '' || mb_strlen($name) > 120) $errors['name'] = 'Name is required';
        if (strlen($pass) < 8) $errors['password'] = 'Password must be at least 8 characters';
        if ($errors) return Http::error($res, 'Validation failed', 422, $errors);

        if (Db::one('SELECT id FROM users WHERE email = ?', [$email])) {
            return Http::error($res, 'Validation failed', 422, ['email' => 'Email already registered']);
        }

        Db::run(
            'INSERT INTO users (email, password_hash, name, role, tenant_role) VALUES (?, ?, ?, "user", "editor")',
            [$email, password_hash($pass, PASSWORD_ARGON2ID), $name]
        );
        $id = (int) Db::pdo()->lastInsertId();
        $this->sendVerification($id, $email, $name);

        Audit::log('user.register', 'user', $id, ['email' => $email]);
        Mailer::accountCreated($email, $name);

        return Http::json($res, ['message' => 'Account created. Check your email to verify.'], 201);
    }

    public function login(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $user = Db::one('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [$email]);

        // 1. Account lockout check (Brute force protection)
        if ($user && SecurityMonitor::isLockedOut($user)) {
            return Http::error(
                $res,
                'Account temporarily locked due to multiple failed login attempts. Please wait 15 minutes before retrying.',
                429
            );
        }

        // 2. Password verification
        if (!$user || !password_verify((string) ($b['password'] ?? ''), $user['password_hash'])) {
            SecurityMonitor::recordFailedLogin($email);
            return Http::error($res, 'Invalid email or password', 401);
        }

        // Password verified - clear failed attempts counter
        SecurityMonitor::resetFailedLogin((int) $user['id']);

        if ($user['status'] !== 'active') {
            return Http::error($res, 'Account suspended. Please contact your organization administrator.', 403);
        }

        if (password_needs_rehash($user['password_hash'], PASSWORD_ARGON2ID)) {
            Db::run('UPDATE users SET password_hash = ? WHERE id = ?',
                [password_hash((string) $b['password'], PASSWORD_ARGON2ID), $user['id']]);
        }

        // 3. Two-Factor Authentication Check (supports TOTP and Email OTP)
        if (!empty($user['two_factor_enabled'])) {
            $method = $user['two_factor_method'] ?? 'email';
            $token = Jwt::issue2fa((int) $user['id']);

            if ($method === 'email') {
                $code = str_pad((string) random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
                Db::run(
                    'UPDATE users SET two_factor_code = ?, two_factor_expires_at = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?',
                    [$code, $user['id']]
                );
                Mailer::send2faCode($user['email'], $user['name'], $code);
            }

            return Http::json($res, [
                'twoFactorRequired' => true,
                'twoFactorToken' => $token,
                'method' => $method,
                'email' => $email,
            ]);
        }

        Db::run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);
        Audit::log('auth.login', 'user', (int) $user['id'], ['email' => $email]);

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
            if (empty($user['two_factor_code']) || $user['two_factor_code'] !== $code || strtotime((string) $user['two_factor_expires_at']) < time()) {
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
            return $this->clearCookie(Http::error($res, 'Session expired', 401));
        }

        $tokenHash = hash('sha256', $raw);
        $row = Db::one('SELECT * FROM refresh_tokens WHERE token_hash = ?', [$tokenHash]);

        // Security: Token Replay Detection
        if ($row && $row['revoked_at'] !== null) {
            SecurityMonitor::logEvent('token_replay_detected', 'critical', [
                'user_id' => $row['user_id'],
                'token_id' => $row['id'],
                'revoked_at' => $row['revoked_at'],
            ], (int) $row['user_id']);

            // Invalidate all refresh tokens for this user family immediately
            Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$row['user_id']]);
            return $this->clearCookie(Http::error($res, 'Security alert: Token reuse detected. All sessions terminated.', 401));
        }

        if (!$row || strtotime((string) $row['expires_at']) < time()) {
            return $this->clearCookie(Http::error($res, 'Session expired', 401));
        }

        $user = Db::one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND status = "active"', [$row['user_id']]);
        if (!$user) return $this->clearCookie(Http::error($res, 'Session expired', 401));

        // Token rotation: revoke old token and issue fresh token
        Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [$row['id']]);
        $res = $this->startSession($req, $res, $user);
        return Http::json($res, $this->sessionPayload($user));
    }

    public function logout(Request $req, Response $res): Response
    {
        $raw = $req->getCookieParams()[self::COOKIE] ?? '';
        if ($raw) {
            Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?', [hash('sha256', $raw)]);
        }
        return $this->clearCookie(Http::json($res, ['ok' => true]));
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
        $email = strtolower(trim((string) (((array) $req->getParsedBody())['email'] ?? '')));
        $user = Db::one('SELECT id, name FROM users WHERE email = ? AND deleted_at IS NULL', [$email]);
        if ($user) {
            $token = $this->createToken((int) $user['id'], 'reset', 1);
            $link = ($_ENV['APP_URL'] ?? 'http://localhost:5173') . '/reset-password?token=' . $token;
            Mailer::passwordReset($email, $user['name'], $link);
            Audit::log('auth.forgot_password_request', 'user', (int) $user['id'], ['email' => $email]);
        }
        // Same response either way to avoid account enumeration
        return Http::json($res, ['message' => 'If that email exists, a reset link has been sent.']);
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
        return [
            'accessToken' => Jwt::issue((int) $user['id'], $user['role']),
            'user' => [
                'id' => (int) $user['id'],
                'email' => $user['email'],
                'name' => $user['name'],
                'role' => $user['role'],
                'tenantRole' => $user['tenant_role'] ?? 'editor',
                'tenantId' => !empty($user['tenant_id']) ? (int) $user['tenant_id'] : null,
                'emailVerified' => $user['email_verified_at'] !== null,
                'twoFactorEnabled' => !empty($user['two_factor_enabled']),
                'twoFactorMethod' => $user['two_factor_method'] ?? 'email',
            ],
        ];
    }

    private function startSession(Request $req, Response $res, array $user): Response
    {
        $raw = bin2hex(random_bytes(32));
        Db::run(
            'INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip, expires_at)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
            [
                $user['id'], hash('sha256', $raw),
                substr($req->getHeaderLine('User-Agent'), 0, 255),
                $req->getServerParams()['REMOTE_ADDR'] ?? null,
                self::REFRESH_DAYS,
            ]
        );
        $secure = ($_ENV['APP_ENV'] ?? 'local') === 'production' ? '; Secure' : '';
        return $res->withAddedHeader('Set-Cookie', sprintf(
            '%s=%s; Path=/api/v1/auth; Max-Age=%d; HttpOnly; SameSite=Strict%s',
            self::COOKIE, $raw, self::REFRESH_DAYS * 86400, $secure
        ));
    }

    private function clearCookie(Response $res): Response
    {
        return $res->withAddedHeader('Set-Cookie',
            self::COOKIE . '=; Path=/api/v1/auth; Max-Age=0; HttpOnly; SameSite=Strict');
    }

    private function createToken(int $userId, string $type, int $hours): string
    {
        $raw = bin2hex(random_bytes(32));
        Db::run(
            'INSERT INTO email_tokens (user_id, type, token_hash, expires_at)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
            [$userId, $type, hash('sha256', $raw), $hours]
        );
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
