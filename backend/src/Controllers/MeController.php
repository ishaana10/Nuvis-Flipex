<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Db;
use App\Support\Http;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class MeController
{
    public function show(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $fullUser = Db::one('SELECT * FROM users WHERE id = ?', [$u['id']]);
        $plan = Db::one('SELECT * FROM plans WHERE id = ?', [$u['plan_id']]);
        $tenant = $u['tenant_id'] ? Db::one('SELECT id, name, slug FROM tenants WHERE id = ?', [$u['tenant_id']]) : null;
        return Http::json($res, [
            'id' => (int) $u['id'], 'email' => $u['email'], 'name' => $u['name'], 'role' => $u['role'],
            'avatarPath' => $u['avatar_path'], 'emailVerified' => $u['email_verified_at'] !== null,
            'twoFactorEnabled' => !empty($fullUser['two_factor_enabled']),
            'createdAt' => $u['created_at'], 'plan' => $plan,
            'tenantId' => $tenant ? (int) $tenant['id'] : null,
            'companyName' => $tenant ? $tenant['name'] : null,
        ]);
    }

    public function toggleTwoFactor(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $b = (array) $req->getParsedBody();
        $enabled = !empty($b['enabled']) ? 1 : 0;

        Db::run('UPDATE users SET two_factor_enabled = ? WHERE id = ?', [$enabled, $u['id']]);
        return Http::json($res, ['twoFactorEnabled' => (bool) $enabled]);
    }

    public function tenantBilling(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        if (empty($u['tenant_id'])) {
            return Http::json($res, ['hasTenant' => false]);
        }

        $t = Db::one(
            'SELECT t.*, p.name AS plan_name, p.price AS plan_price
             FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id WHERE t.id = ?',
            [$u['tenant_id']]
        );
        if (!$t) {
            return Http::json($res, ['hasTenant' => false]);
        }

        return Http::json($res, [
            'hasTenant' => true,
            'tenantId' => (int) $t['id'],
            'companyName' => $t['name'],
            'slug' => $t['slug'],
            'planName' => $t['plan_name'] ?? 'Free',
            'planPrice' => (float) ($t['plan_price'] ?? 0),
            'billingName' => $t['billing_name'] ?? $t['name'],
            'billingEmail' => $t['billing_email'] ?? $u['email'],
            'billingAddress' => $t['billing_address'] ?? '',
            'taxId' => $t['tax_id'] ?? '',
            'paymentMethod' => $t['payment_method'] ?? 'bank_transfer',
            'paymentStatus' => $t['payment_status'] ?? 'paid',
            'billingCycle' => $t['billing_cycle'] ?? 'monthly',
            'amount' => (float) ($t['amount'] ?? 0),
            'currency' => $t['currency'] ?? 'FJD',
            'lastPaymentDate' => $t['last_payment_date'],
            'nextBillingDate' => $t['next_billing_date'],
            'paymentReference' => $t['payment_reference'],
            'billingNotes' => $t['billing_notes'],
        ]);
    }

    public function update(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $name = trim((string) (((array) $req->getParsedBody())['name'] ?? ''));
        if ($name === '' || mb_strlen($name) > 120) {
            return Http::error($res, 'Validation failed', 422, ['name' => 'Name is required']);
        }
        Db::run('UPDATE users SET name = ? WHERE id = ?', [$name, $u['id']]);
        return Http::json($res, ['name' => $name]);
    }

    public function changePassword(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $b = (array) $req->getParsedBody();
        $row = Db::one('SELECT password_hash FROM users WHERE id = ?', [$u['id']]);
        if (!password_verify((string) ($b['currentPassword'] ?? ''), $row['password_hash'])) {
            return Http::error($res, 'Validation failed', 422, ['currentPassword' => 'Current password is incorrect']);
        }
        $new = (string) ($b['newPassword'] ?? '');
        if (strlen($new) < 8) {
            return Http::error($res, 'Validation failed', 422, ['newPassword' => 'Password must be at least 8 characters']);
        }
        Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_ARGON2ID), $u['id']]);
        // Sign out all other devices.
        $current = hash('sha256', $req->getCookieParams()['refresh_token'] ?? '');
        Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND token_hash <> ? AND revoked_at IS NULL',
            [$u['id'], $current]);
        return Http::json($res, ['ok' => true]);
    }

    public function sessions(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $current = hash('sha256', $req->getCookieParams()['refresh_token'] ?? '');
        $rows = Db::all(
            'SELECT id, user_agent, ip, created_at, token_hash FROM refresh_tokens
             WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC',
            [$u['id']]
        );
        return Http::json($res, array_map(fn($r) => [
            'id' => (int) $r['id'], 'userAgent' => $r['user_agent'], 'ip' => $r['ip'],
            'createdAt' => $r['created_at'], 'current' => hash_equals($r['token_hash'], $current),
        ], $rows));
    }

    public function revokeSession(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ? AND user_id = ?', [(int) $args['id'], $u['id']]);
        return Http::json($res, ['ok' => true]);
    }

    public function delete(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $row = Db::one('SELECT password_hash FROM users WHERE id = ?', [$u['id']]);
        if (!password_verify((string) (((array) $req->getParsedBody())['password'] ?? ''), $row['password_hash'])) {
            return Http::error($res, 'Validation failed', 422, ['password' => 'Password is incorrect']);
        }
        // Soft delete; free the email so it can be reused, and sign out everywhere.
        Db::run('UPDATE users SET deleted_at = NOW(), email = CONCAT(id, "+deleted+", email) WHERE id = ?', [$u['id']]);
        Db::run('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ?', [$u['id']]);
        return Http::json($res, ['ok' => true]);
    }
}
