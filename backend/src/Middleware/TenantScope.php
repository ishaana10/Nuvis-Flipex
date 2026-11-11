<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Repository\TenantRepository;
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

    /**
     * Strict tenant id for business operations: never falls back to a default or first tenant.
     */
    public static function requireId(Request $req): int
    {
        $id = self::id($req);
        if (!$id) {
            $u = $req->getAttribute('user');
            if (!empty($u['tenant_id'])) {
                return (int) $u['tenant_id'];
            }
            return TenantContext::requireId();
        }
        return $id;
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

        // Universal object-level IDOR protection: every tenant-owned resource addressed by a route argument
        // (flipbooks, categories, collections, jobs, API keys, webhooks, scheduled reports, invoices,
        // backups, error reports, DLQ entries, hotspots) must belong to the caller's tenant.
        $routeContext = RouteContext::fromRequest($req);
        $route = $routeContext->getRoute();
        if ($route) {
            $args = $route->getArguments();
            $pattern = $route->getPattern();
            $currentTenantId = TenantContext::id();

            foreach (TenantRepository::ROUTE_RESOURCES as $needle => [$table, $argName]) {
                if (!str_contains($pattern, $needle) || !isset($args[$argName]) || !ctype_digit((string) $args[$argName])) {
                    continue;
                }
                $resourceId = (int) $args[$argName];
                $denied = false;
                $ownerTenant = null;

                if ($table === 'flipbooks') {
                    $f = Db::one('SELECT id, user_id, tenant_id FROM flipbooks WHERE id = ?', [$resourceId]);
                    $denied = $f && !TenantContext::canAccessFlipbook($f);
                    $ownerTenant = $f['tenant_id'] ?? null;
                } elseif (!TenantContext::isSuperAdmin()) {
                    $state = $table === 'hotspots'
                        ? TenantRepository::classifyHotspot($resourceId, $currentTenantId)
                        : TenantRepository::for($table)->classify($resourceId, $currentTenantId);
                    $denied = $state === 'foreign'
                        || ($state === 'global' && !in_array($table, TenantRepository::GLOBAL_ROWS_ALLOWED, true));
                }

                if ($denied) {
                    SecurityMonitor::logEvent('idor_attempt', 'warning', [
                        'resource' => $table,
                        'target_id' => $resourceId,
                        'target_flipbook_id' => $table === 'flipbooks' ? $resourceId : null,
                        'user_tenant_id' => $user['tenant_id'] ?? null,
                        'resource_tenant_id' => $ownerTenant,
                        'route' => $pattern,
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
