<?php
declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response as SlimResponse;

/**
 * CORS with an explicit allow-list.
 *
 * CORS_ORIGIN may hold one origin or a comma-separated list. The request's Origin header is
 * echoed back only when it is on that list, and credentials are only ever allowed for a listed
 * origin. A wildcard (`*`) or an empty value means "no cross-origin access": the SPA is served
 * from the same origin as the API in production, so it doesn't need CORS at all.
 */
final class Cors implements MiddlewareInterface
{
    public function process(Request $req, Handler $next): Response
    {
        $res = $req->getMethod() === 'OPTIONS' ? new SlimResponse(204) : $next->handle($req);

        $origin = trim($req->getHeaderLine('Origin'));
        $allowed = array_values(array_filter(array_map(
            static fn(string $o): string => rtrim(trim($o), '/'),
            explode(',', (string) ($_ENV['CORS_ORIGIN'] ?? ''))
        ), static fn(string $o): bool => $o !== '' && $o !== '*'));

        $res = $res->withHeader('Vary', 'Origin');
        if ($origin !== '' && in_array(rtrim($origin, '/'), $allowed, true)) {
            $res = $res
                ->withHeader('Access-Control-Allow-Origin', $origin)
                ->withHeader('Access-Control-Allow-Credentials', 'true')
                ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-API-Key')
                ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
                ->withHeader('Access-Control-Max-Age', '600');
        }

        return $res
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
            ->withHeader('Cache-Control', $res->hasHeader('Cache-Control') ? $res->getHeaderLine('Cache-Control') : 'no-store');
    }
}
