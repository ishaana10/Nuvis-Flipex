<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Support\Db;
use App\Support\Http;
use App\Support\Jwt;
use App\Support\Rbac;
use App\Support\SecurityMonitor;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response as SlimResponse;

final class Auth implements MiddlewareInterface
{
    private static bool $schemaChecked = false;

    public function __construct(private ?string $requiredRole = null) {}

    public function process(Request $req, Handler $next): Response
    {
        $token = null;
        $header = $req->getHeaderLine('Authorization');
        if ($header === '') {
            $serverParams = $req->getServerParams();
            $header = (string) ($serverParams['HTTP_AUTHORIZATION'] ?? $serverParams['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        }
        $apiKeyHeader = trim($req->getHeaderLine('X-API-Key'));

        if ($apiKeyHeader !== '') {
            $token = $apiKeyHeader;
        } elseif (str_starts_with($header, 'Bearer ')) {
            $token = trim(substr($header, 7));
        }

        // 1. Check if token is a Tenant-Scoped REST API Key (nvf_live_... / nvf_...)
        if ($token && str_starts_with($token, 'nvf_')) {
            self::ensureApiKeyColumns();

            $keyHash = hash('sha256', $token);
            $keyRow = Db::one(
                'SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())',
                [$keyHash]
            );
            if (!$keyRow) {
                return Http::error(new SlimResponse(), 'Invalid, revoked, or expired API key', 401);
            }

            $user = Db::one(
                'SELECT id, email, name, avatar_path, role, tenant_role, plan_id, tenant_id, status, two_factor_enabled, two_factor_method, email_verified_at, created_at
                 FROM users WHERE id = ? AND deleted_at IS NULL',
                [$keyRow['user_id']]
            );
            if (!$user || $user['status'] !== 'active') {
                return Http::error(new SlimResponse(), 'Unauthorized API key owner', 401);
            }
            if (!empty($keyRow['tenant_id'])) {
                $user['tenant_id'] = (int) $keyRow['tenant_id'];
            }

            // API keys are never allowed on platform super-admin routes
            if ($this->requiredRole === 'admin') {
                SecurityMonitor::logEvent('api_key_admin_route_blocked', 'warning', [
                    'api_key_id' => $keyRow['id'],
                    'path' => $req->getUri()->getPath(),
                ], (int) $user['id'], isset($user['tenant_id']) ? (int) $user['tenant_id'] : null);
                return Http::error(new SlimResponse(), 'Forbidden: API keys cannot access platform administration endpoints', 403);
            }
            if ($this->requiredRole && $user['role'] !== $this->requiredRole) {
                return Http::error(new SlimResponse(), 'Forbidden', 403);
            }

            // 1a. Enforce IP Allowlist / CIDR Restriction (if configured on the API key)
            $ip = $this->resolveClientIp($req);
            $allowedIpsRaw = trim((string) ($keyRow['allowed_ips'] ?? ''));
            if ($allowedIpsRaw !== '' && !self::isIpAllowed($ip, $allowedIpsRaw)) {
                SecurityMonitor::logEvent('api_key_ip_blocked', 'warning', [
                    'api_key_id' => $keyRow['id'],
                    'client_ip' => $ip,
                    'allowed_ips' => $allowedIpsRaw,
                ], (int) $user['id'], isset($user['tenant_id']) ? (int) $user['tenant_id'] : null);
                return Http::error(new SlimResponse(), "Forbidden: API key is not permitted from IP address {$ip}", 403);
            }

            // 1b. Enforce Route-Level Explicit API Key Scope
            $scopeCheck = self::verifyRouteApiKeyScope($req, $keyRow);
            if ($scopeCheck !== null) {
                SecurityMonitor::logEvent('api_key_scope_violation', 'warning', [
                    'api_key_id' => $keyRow['id'],
                    'key_prefix' => $keyRow['key_prefix'] ?? null,
                    'method' => $req->getMethod(),
                    'path' => $req->getUri()->getPath(),
                    'reason' => $scopeCheck,
                    'granted_scopes' => Rbac::extractScopes($keyRow),
                ], (int) $user['id'], isset($user['tenant_id']) ? (int) $user['tenant_id'] : null);
                return Http::error(new SlimResponse(), $scopeCheck, 403);
            }

            // 1c. Enforce Daily Usage Quota (if configured on the API key)
            $today = date('Y-m-d');
            $dailyQuota = isset($keyRow['daily_quota']) && $keyRow['daily_quota'] !== null ? (int) $keyRow['daily_quota'] : null;
            $usageToday = (($keyRow['quota_date'] ?? '') === $today) ? (int) ($keyRow['usage_count'] ?? 0) : 0;

            if ($dailyQuota !== null && $dailyQuota > 0 && $usageToday >= $dailyQuota) {
                SecurityMonitor::logEvent('api_key_quota_exceeded', 'warning', [
                    'api_key_id' => $keyRow['id'],
                    'daily_quota' => $dailyQuota,
                    'usage_today' => $usageToday,
                ], (int) $user['id'], isset($user['tenant_id']) ? (int) $user['tenant_id'] : null);
                return Http::error(
                    new SlimResponse(),
                    "Too Many Requests: API key daily usage quota exceeded ({$dailyQuota} requests/day)",
                    429
                );
            }

            $newUsage = $usageToday + 1;
            Db::run(
                'UPDATE api_keys SET last_used_at = NOW(), last_used_ip = ?, usage_count = ?, quota_date = ? WHERE id = ?',
                [$ip, $newUsage, $today, $keyRow['id']]
            );
            $keyRow['usage_count'] = $newUsage;
            $keyRow['quota_date'] = $today;

            return $next->handle(
                $req->withAttribute('user', $user)->withAttribute('api_key', $keyRow)
            );
        }

        // 2. Standard JWT Bearer Authentication
        $claims = $token ? Jwt::verify($token) : null;
        if (!$claims) {
            return Http::error(new SlimResponse(), 'Unauthorized', 401);
        }
        $user = Db::one(
            'SELECT id, email, name, avatar_path, role, tenant_role, plan_id, tenant_id, status, two_factor_enabled, two_factor_method, email_verified_at, created_at
             FROM users WHERE id = ? AND deleted_at IS NULL',
            [$claims->sub]
        );
        if (!$user || $user['status'] !== 'active') {
            return Http::error(new SlimResponse(), 'Unauthorized', 401);
        }
        if ($this->requiredRole && $user['role'] !== $this->requiredRole) {
            return Http::error(new SlimResponse(), 'Forbidden', 403);
        }
        return $next->handle($req->withAttribute('user', $user));
    }

    /**
     * Map the incoming HTTP method + route path to required API key scope(s)
     * and verify that the API key explicitly possesses that scope.
     * Returns null when permitted, or a 403 error message when denied.
     */
    private static function verifyRouteApiKeyScope(Request $req, array $keyRow): ?string
    {
        $method = strtoupper($req->getMethod());
        $path = $req->getUri()->getPath();

        // Normalize /api/v1 prefix
        $rel = preg_replace('#^/api/v1#', '', $path) ?: $path;

        // 1. Endpoints strictly forbidden to API keys (interactive session only)
        if (
            str_starts_with($rel, '/me') ||
            str_starts_with($rel, '/admin') ||
            str_starts_with($rel, '/devops') ||
            str_starts_with($rel, '/integrations/api-keys') ||
            str_starts_with($rel, '/integrations/connectors') ||
            preg_match('#^/billing/invoices/\d+/(reconcile|reverse)$#', $rel)
        ) {
            return 'Forbidden: This endpoint requires an interactive user session and cannot be accessed with an API key';
        }

        // 2. ERP Catalogue Auto-Publishing -> requires erp:publish (or flipbooks:write)
        if (str_starts_with($rel, '/integrations/erp/publish-catalogue')) {
            if (!Rbac::apiKeyHasScope($keyRow, ['erp:publish'])) {
                return "Forbidden: API key requires 'erp:publish' scope for ERP catalogue publishing";
            }
            return null;
        }

        // 3. Webhooks Management -> requires webhooks:manage
        if (str_starts_with($rel, '/integrations/webhooks')) {
            if (!Rbac::apiKeyHasScope($keyRow, ['webhooks:manage'])) {
                return "Forbidden: API key requires 'webhooks:manage' scope";
            }
            return null;
        }

        // 4. Analytics Endpoints -> requires analytics:read
        if (str_starts_with($rel, '/analytics')) {
            if (!Rbac::apiKeyHasScope($keyRow, ['analytics:read'])) {
                return "Forbidden: API key requires 'analytics:read' scope";
            }
            return null;
        }

        // 5. Billing Endpoints -> requires billing:manage
        if (str_starts_with($rel, '/billing')) {
            if (!Rbac::apiKeyHasScope($keyRow, ['billing:manage'])) {
                return "Forbidden: API key requires 'billing:manage' scope";
            }
            return null;
        }

        // 6. Publications, Pages, Hotspots, Folders, Categories, Collections
        if (
            str_starts_with($rel, '/flipbooks') ||
            str_starts_with($rel, '/folders') ||
            str_starts_with($rel, '/categories') ||
            str_starts_with($rel, '/collections')
        ) {
            if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
                if (!Rbac::apiKeyHasScope($keyRow, ['flipbooks:read', 'flipbooks:write'])) {
                    return "Forbidden: API key requires 'flipbooks:read' or 'flipbooks:write' scope to view publications";
                }
                return null;
            }

            if (!Rbac::apiKeyHasScope($keyRow, ['flipbooks:write'])) {
                return "Forbidden: API key requires 'flipbooks:write' scope to create or modify publications";
            }
            return null;
        }

        return 'Forbidden: API key scope does not permit access to this endpoint';
    }

    private function resolveClientIp(Request $req): string
    {
        $server = $req->getServerParams();
        $remoteAddr = (string) ($server['REMOTE_ADDR'] ?? '127.0.0.1');

        // Allow local loopback test runner to simulate client IP via X-Client-IP
        if (in_array($remoteAddr, ['127.0.0.1', '::1'], true)) {
            $simulatedIp = trim($req->getHeaderLine('X-Client-IP'));
            if ($simulatedIp !== '' && filter_var($simulatedIp, FILTER_VALIDATE_IP)) {
                return $simulatedIp;
            }
        }

        return $remoteAddr;
    }

    /**
     * Check whether $clientIp matches any comma-separated IP or CIDR range in $allowedIpsList.
     */
    public static function isIpAllowed(string $clientIp, string $allowedIpsList): bool
    {
        $entries = array_filter(array_map('trim', explode(',', $allowedIpsList)));
        if (empty($entries)) {
            return true;
        }

        foreach ($entries as $entry) {
            if ($entry === '*' || $entry === $clientIp) {
                return true;
            }
            if (str_contains($entry, '/')) {
                [$subnet, $bits] = explode('/', $entry, 2);
                $bits = (int) $bits;
                $ipLong = ip2long($clientIp);
                $subnetLong = ip2long(trim($subnet));
                if ($ipLong !== false && $subnetLong !== false && $bits >= 0 && $bits <= 32) {
                    $mask = $bits === 0 ? 0 : (~0 << (32 - $bits));
                    if (($ipLong & $mask) === ($subnetLong & $mask)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private static function ensureApiKeyColumns(): void
    {
        if (self::$schemaChecked) {
            return;
        }
        self::$schemaChecked = true;
        try {
            $pdo = Db::pdo();
            $cols = [
                'allowed_ips'     => 'VARCHAR(500) NULL',
                'daily_quota'     => 'INT UNSIGNED NULL DEFAULT NULL',
                'usage_count'     => 'INT UNSIGNED NOT NULL DEFAULT 0',
                'quota_date'      => 'DATE NULL',
                'rotated_from_id' => 'BIGINT UNSIGNED NULL',
            ];
            foreach ($cols as $col => $def) {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_keys' AND COLUMN_NAME = ?");
                $stmt->execute([$col]);
                if ((int) $stmt->fetchColumn() === 0) {
                    $pdo->exec("ALTER TABLE `api_keys` ADD COLUMN `{$col}` {$def}");
                }
            }
        } catch (\Throwable) {
            // Non-fatal fallback
        }
    }
}
