<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Support\Db;
use App\Support\Http;
use App\Support\SecurityMonitor;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response as SlimResponse;
use Slim\Routing\RouteContext;

/**
 * Enforces centralized tenant isolation, initializes TenantContext,
 * and guards against cross-tenant Insecure Direct Object References (IDOR).
 */
final class TenantScope implements MiddlewareInterface
{
    public static function id(Request $req): ?int
    {
        $attr = $req->getAttribute('tenant_id');
        if ($attr !== null) {
            return (int) $attr;
        }
        return TenantContext::id();
    }

    public function process(Request $req, Handler $next): Response
    {
        $user = $req->getAttribute('user');
        if (!$user) {
            return $next->handle($req);
        }

        $tenant = null;
        if (!empty($user['tenant_id'])) {
            $tenant = Db::one('SELECT * FROM tenants WHERE id = ?', [(int) $user['tenant_id']]);
            if ($tenant && !$tenant['is_active'] && ($user['role'] ?? '') !== 'admin') {
                return Http::error(new SlimResponse(), 'Tenant workspace is suspended', 403);
            }
        }

        // Initialize tenant context (including active API key for RBAC scope enforcement)
        TenantContext::set($user, $tenant, $req->getAttribute('api_key'));

        // IDOR Protection: Check route parameters for entity targets
        $routeContext = RouteContext::fromRequest($req);
        $route = $routeContext->getRoute();
        if ($route) {
            $args = $route->getArguments();
            // If route targets a flipbook by {id}
            if (str_contains($route->getPattern(), '/flipbooks') && !empty($args['id']) && ctype_digit((string) $args['id'])) {
                $flipbookId = (int) $args['id'];
                $f = Db::one('SELECT id, user_id, tenant_id FROM flipbooks WHERE id = ?', [$flipbookId]);
                if ($f && !TenantContext::canAccessFlipbook($f)) {
                    SecurityMonitor::logEvent('idor_attempt', 'warning', [
                        'target_flipbook_id' => $flipbookId,
                        'user_tenant_id' => $user['tenant_id'] ?? null,
                        'flipbook_tenant_id' => $f['tenant_id'] ?? null,
                        'route' => $route->getPattern(),
                    ]);
                    // Return 404 to avoid cross-tenant resource enumeration
                    return Http::error(new SlimResponse(), 'Not found', 404);
                }
            }
        }

        try {
            $response = $next->handle(
                $req->withAttribute('tenant', $tenant)
                    ->withAttribute('tenant_id', $tenant ? (int) $tenant['id'] : null)
            );
        } finally {
            TenantContext::reset();
        }

        return $response;
    }
}
