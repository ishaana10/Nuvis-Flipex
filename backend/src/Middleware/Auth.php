<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Support\Db;
use App\Support\Http;
use App\Support\Jwt;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response as SlimResponse;

final class Auth implements MiddlewareInterface
{
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
            $keyHash = hash('sha256', $token);
            $keyRow = Db::one(
                'SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())',
                [$keyHash]
            );
            if (!$keyRow) {
                return Http::error(new SlimResponse(), 'Invalid or expired API key', 401);
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
            if ($this->requiredRole && $user['role'] !== $this->requiredRole) {
                return Http::error(new SlimResponse(), 'Forbidden', 403);
            }

            $ip = $req->getServerParams()['REMOTE_ADDR'] ?? null;
            Db::run('UPDATE api_keys SET last_used_at = NOW(), last_used_ip = ? WHERE id = ?', [$ip, $keyRow['id']]);

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
}
