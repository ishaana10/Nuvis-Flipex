<?php
declare(strict_types=1);
// Usage: php bin/cache.php status|ping|flush|gc
require __DIR__ . '/../vendor/autoload.php';
if (is_file(__DIR__ . '/../.env')) {
    foreach (file(__DIR__ . '/../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) {
        if ($l[0] !== '#' && str_contains($l, '=')) {
            [$k, $v] = explode('=', $l, 2);
            $_ENV[trim($k)] ??= trim($v, " \t\"'");
        }
    }
}
use App\Infrastructure\Cache\CacheManager;
use App\Infrastructure\Cache\RedisConnection;
$cmd = $argv[1] ?? 'status';
RedisConnection::resetBreaker();
switch ($cmd) {
    case 'ping':
        $r = RedisConnection::shared();
        echo $r && $r->ping() ? "PONG\n" : "Redis unavailable (file cache in use)\n";
        exit($r ? 0 : 1);
    case 'flush':
        CacheManager::flushAll();
        if ($r = RedisConnection::shared()) { $r->flushPrefix(); }
        echo "Cache flushed (schema checks will re-run on next request)\n";
        break;
    case 'gc':
        echo 'Removed ' . CacheManager::gcFiles() . " expired file(s)\n";
        break;
    default:
        echo json_encode(CacheManager::driverInfo(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
}
