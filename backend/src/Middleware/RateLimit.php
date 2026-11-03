<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Support\Db;
use App\Support\Http;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as Handler;
use Slim\Psr7\Response as SlimResponse;

/** Fixed-window rate limit per IP + route key. */
final class RateLimit implements MiddlewareInterface
{
    public function __construct(private string $key, private int $max, private int $windowSec) {}

    public function process(Request $req, Handler $next): Response
    {
        $ip = $req->getServerParams()['REMOTE_ADDR'] ?? '0';
        $window = intdiv(time(), $this->windowSec) * $this->windowSec;
        $k = $this->key . ':' . $ip;
        Db::run(
            'INSERT INTO rate_limits (k, window_start, hits) VALUES (?, ?, 1)
             ON DUPLICATE KEY UPDATE hits = hits + 1',
            [$k, $window]
        );
        $row = Db::one('SELECT hits FROM rate_limits WHERE k = ? AND window_start = ?', [$k, $window]);
        if ($row && (int) $row['hits'] > $this->max) {
            return Http::error(new SlimResponse(), 'Too many requests, try again later.', 429);
        }
        return $next->handle($req);
    }
}
