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
        $header = $req->getHeaderLine('Authorization');
        $claims = str_starts_with($header, 'Bearer ') ? Jwt::verify(substr($header, 7)) : null;
        if (!$claims) {
            return Http::error(new SlimResponse(), 'Unauthorized', 401);
        }
        $user = Db::one(
            'SELECT id, email, name, avatar_path, role, plan_id, status, email_verified_at, created_at
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
