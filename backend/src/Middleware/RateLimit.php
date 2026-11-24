<?php
declare(strict_types=1);

namespace App\Middleware;

use App\Infrastructure\Cache\CacheManager;
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
    private static bool $schemaEnsured = false;

    public function __construct(private string $key, private int $max, private int $windowSec) {}

    private static function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        self::$schemaEnsured = true;
        if (\App\Support\SchemaGuard::isCurrent('rate_limits')) {
            return;
        }
        try {
            Db::pdo()->exec('CREATE TABLE IF NOT EXISTS rate_limits (
                k VARCHAR(190) NOT NULL,
                window_start INT UNSIGNED NOT NULL,
                hits INT UNSIGNED NOT NULL DEFAULT 1,
                PRIMARY KEY (k, window_start)
            ) ENGINE=InnoDB');
            \App\Support\SchemaGuard::done('rate_limits');
        } catch (\Throwable) {
        }
    }

    public function process(Request $req, Handler $next): Response
    {
        $ip = $req->getServerParams()['REMOTE_ADDR'] ?? '0';
        $window = intdiv(time(), $this->windowSec) * $this->windowSec;
        $k = $this->key . ':' . $ip;

        // Fast path: one atomic Redis INCR (no database round trips).
        try {
            $hits = CacheManager::hit("rl:{$k}:{$window}", $this->windowSec + 5);
            if ($hits !== null) {
                return $hits > $this->max
                    ? Http::error(new SlimResponse(), 'Too many requests, try again later.', 429)
                    : $next->handle($req);
            }
        } catch (\Throwable $e) {
            error_log('RateLimit redis path non-fatal: ' . $e->getMessage());
        }

        // Fallback: fixed-window counter in MySQL.
        try {
            self::ensureSchema();
            Db::run(
                'INSERT INTO rate_limits (k, window_start, hits) VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE hits = hits + 1',
                [$k, $window]
            );
            $row = Db::one('SELECT hits FROM rate_limits WHERE k = ? AND window_start = ?', [$k, $window]);
            if ($row && (int) $row['hits'] > $this->max) {
                return Http::error(new SlimResponse(), 'Too many requests, try again later.', 429);
            }
        } catch (\Throwable $e) {
            error_log('RateLimit middleware non-fatal: ' . $e->getMessage());
        }
        return $next->handle($req);
    }
}
