<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Db;
use App\Support\Http;
use App\Support\Jwt;
use App\Support\Mailer;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class AuthController
{
    private const REFRESH_DAYS = 30;
    private const COOKIE = 'refresh_token';

    public function register(Request $req, Response $res): Response
    {
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
            'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)',
            [$email, password_hash($pass, PASSWORD_ARGON2ID), $name]
        );
        $id = (int) Db::pdo()->lastInsertId();
        $this->sendVerification($id, $email, $name);

        return Http::json($res, ['message' => 'Account created. Check your email to verify.'], 201);
    }

    public function login(Request $req, Response $res): Response
    {
        $b = (array) $req->getParsedBody();
        $email = strtolower(trim((string) ($b['email'] ?? '')));
        $user = Db::one('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [$email]);

        if (!$user || !password_verify((string) ($b['password'] ?? ''), $user['password_hash'])) {
            return Http::error($res, 'Invalid email or password', 401);
        }
        if ($user['status'] !== 'active') return Http::error($res, 'Account suspended', 403);

        if (password_needs_rehash($user['password_hash'], PASSWORD_ARGON2ID)) {
            Db::run('UPDATE users SET password_hash = ? WHERE id = ?',
                [password_hash((string) $b['password'], PASSWORD_ARGON2ID), $user['id']]);
        }
        Db::run('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);

        $res = $this->startSession($req, $res, $user);
        return Http::json($res, $this->sessionPayload($user));
    }

    public function refresh(Request $req, Response $res): Response
    {
        if ($req->getHeaderLine('X-Requested-With') !== 'XMLHttpRequest') {
            return Http::error($res, 'Bad request', 400);
        }
        $raw = $req->getCookieParams()[self::COOKIE] ?? '';
        $row = $raw ? Db::one(
            'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()',
            [hash('sha256', $raw)]
        ) : null;
        if (!$row) return $this->clearCookie(Http::error($res, 'Session expired', 401));

        $user = Db::one('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL AND status = "active"', [$row['user_id']]);
        if (!$user) return $this->clearCookie(Http::error($res, 'Session expired', 401));

        Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [$row['id']]); // rotate
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
            $link = $_ENV['APP_URL'] . '/reset-password?token=' . $token;
            Mailer::send($email, 'Reset your password',
                "<p>Hi " . htmlspecialchars($user['name']) . ",</p><p><a href=\"$link\">Reset your password</a> (valid 1 hour).</p>");
        }
        // Same response either way to avoid account enumeration.
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
        return Http::json($res, ['ok' => true]);
    }

    // ---- helpers ----

    private function sessionPayload(array $user): array
    {
        return [
            'accessToken' => Jwt::issue((int) $user['id'], $user['role']),
            'user' => [
                'id' => (int) $user['id'], 'email' => $user['email'], 'name' => $user['name'],
                'role' => $user['role'], 'emailVerified' => $user['email_verified_at'] !== null,
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
        $link = $_ENV['APP_URL'] . '/verify-email?token=' . $this->createToken($id, 'verify', 48);
        try {
            Mailer::send($email, 'Verify your email',
                '<p>Hi ' . htmlspecialchars($name) . ',</p><p><a href="' . $link . '">Verify your email</a> (valid 48 hours).</p>');
        } catch (\Throwable $e) {
            error_log('Mail failed: ' . $e->getMessage());
        }
    }
}
