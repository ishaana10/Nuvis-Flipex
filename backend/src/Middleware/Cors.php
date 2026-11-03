<?php
declare(strict_types=1);

namespace App\Middleware;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response as SlimResponse;

final class Cors implements MiddlewareInterface
{
    public function process(Request $req, Handler $next): Response
    {
        $res = $req->getMethod() === 'OPTIONS' ? new SlimResponse(204) : $next->handle($req);
        return $res
            ->withHeader('Access-Control-Allow-Origin', $_ENV['CORS_ORIGIN'])
            ->withHeader('Access-Control-Allow-Credentials', 'true')
            ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
            ->withHeader('Vary', 'Origin');
    }
}
