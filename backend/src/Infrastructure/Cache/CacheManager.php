<?php
declare(strict_types=1);

namespace App\Infrastructure\Cache;

use App\Support\Storage;

/**
 * Infrastructure Cache & Distributed Lock Service.
 * Provides genuine Redis caching and atomic distributed locks (via ext-redis)
 * with robust, atomic file-cache & flock fallback for local/shared environments.
 */
final class CacheManager
{
    private static ?\Redis $redisClient = null;
    private static bool $redisAttempted = false;
    private static array $heldLocks = [];

    private static function cacheDir(): string
    {
        $dir = Storage::root() . '/cache';
        Storage::ensureDir($dir);
        return $dir;
    }

    /**
     * Lazy-load and persist Redis connection instance.
     */
    public static function redis(): ?\Redis
    {
        if (self::$redisAttempted) {
            return self::$redisClient;
        }

        self::$redisAttempted = true;

        if (!extension_loaded('redis') || !class_exists('\Redis')) {
            return null;
        }

        $redisHost = $_ENV['REDIS_HOST'] ?? '127.0.0.1';
        $redisPort = (int) ($_ENV['REDIS_PORT'] ?? 6379);
        $redisPassword = $_ENV['REDIS_PASSWORD'] ?? null;

        try {
            $r = new \Redis();
            $connected = @$r->connect($redisHost, $redisPort, 0.5);
            if ($connected) {
                if (!empty($redisPassword)) {
                    $r->auth($redisPassword);
                }
                $r->setOption(\Redis::OPT_SERIALIZER, \Redis::SERIALIZER_NONE);
                self::$redisClient = $r;
                return self::$redisClient;
            }
        } catch (\Throwable) {
            self::$redisClient = null;
        }

        return null;
    }

    public static function driverInfo(): array
    {
        $redisHost = $_ENV['REDIS_HOST'] ?? '127.0.0.1';
        $redisPort = (int) ($_ENV['REDIS_PORT'] ?? 6379);
        $r = self::redis();
        $connected = ($r !== null);

        return [
            'activeDriver' => $connected ? 'redis' : 'atomic_file_fallback',
            'redisConfiguredHost' => "{$redisHost}:{$redisPort}",
            'redisConnected' => $connected,
            'distributedLocksSupported' => $connected,
            'cacheDirectory' => self::cacheDir(),
        ];
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $r = self::redis();
        if ($r !== null) {
            try {
                $raw = $r->get('cache:' . $key);
                if ($raw !== false && $raw !== null) {
                    $decoded = json_decode((string) $raw, true);
                    return $decoded !== null ? $decoded : $raw;
                }
            } catch (\Throwable) {
                // Fail gracefully to file cache
            }
        }

        $file = self::cacheDir() . '/' . hash('sha256', $key) . '.cache.json';
        if (!is_file($file)) {
            return $default;
        }
        $raw = @file_get_contents($file);
        if (!$raw) {
            return $default;
        }
        $data = json_decode($raw, true);
        if (!is_array($data) || (isset($data['expires_at']) && $data['expires_at'] < time())) {
            @unlink($file);
            return $default;
        }
        return $data['value'] ?? $default;
    }

    public static function set(string $key, mixed $value, int $ttlSeconds = 300): void
    {
        $payload = json_encode($value);

        $r = self::redis();
        if ($r !== null) {
            try {
                $r->setEx('cache:' . $key, max(1, $ttlSeconds), (string) $payload);
            } catch (\Throwable) {
                // Continue to file cache
            }
        }

        $file = self::cacheDir() . '/' . hash('sha256', $key) . '.cache.json';
        $fileData = json_encode([
            'key' => $key,
            'expires_at' => time() + $ttlSeconds,
            'value' => $value,
        ]);
        @file_put_contents($file, $fileData, LOCK_EX);
    }

    public static function remember(string $key, int $ttlSeconds, callable $resolver): mixed
    {
        $hit = self::get($key, '__CACHE_MISS__');
        if ($hit !== '__CACHE_MISS__') {
            return $hit;
        }
        $val = $resolver();
        self::set($key, $val, $ttlSeconds);
        return $val;
    }

    /**
     * Acquire a distributed / atomic lock for worker or billing concurrency protection.
     * Uses atomic Redis SET key token NX EX ttl when Redis is available, or flock on file.
     */
    public static function acquireLock(string $lockName, int $ttlSeconds = 60, ?string &$acquiredToken = null): bool
    {
        $token = bin2hex(random_bytes(16));
        $r = self::redis();
        if ($r !== null) {
            try {
                // Redis atomic lock pattern (SET resource token NX EX seconds)
                $acquired = (bool) $r->set('lock:' . $lockName, $token, ['nx', 'ex' => max(1, $ttlSeconds)]);
                if ($acquired) {
                    self::$heldLocks[$lockName] = $token;
                    $acquiredToken = $token;
                    return true;
                }
                return false;
            } catch (\Throwable) {
                // Fall back to filesystem atomic lock
            }
        }

        $lockFile = self::cacheDir() . '/lock_' . preg_replace('/[^a-zA-Z0-9_\-]/', '_', $lockName) . '.lock';
        if (is_file($lockFile)) {
            $raw = @file_get_contents($lockFile);
            $meta = $raw ? json_decode($raw, true) : null;
            if (is_array($meta) && ($meta['expires_at'] ?? 0) <= time()) {
                @unlink($lockFile);
            } elseif (is_array($meta) && ($meta['expires_at'] ?? 0) > time()) {
                return false;
            }
        }

        // Exclusive creation flag 'x' guarantees atomic create; fails if file exists
        $fp = @fopen($lockFile, 'x');
        if ($fp !== false) {
            fwrite($fp, (string) json_encode([
                'lock' => $lockName,
                'token' => $token,
                'pid' => getmypid(),
                'acquired_at' => time(),
                'expires_at' => time() + $ttlSeconds,
            ]));
            fclose($fp);
            self::$heldLocks[$lockName] = $token;
            $acquiredToken = $token;
            return true;
        }

        return false;
    }

    public static function releaseLock(string $lockName, ?string $token = null): void
    {
        $ownerToken = $token ?? (self::$heldLocks[$lockName] ?? null);
        unset(self::$heldLocks[$lockName]);

        $r = self::redis();
        if ($r !== null) {
            try {
                if ($ownerToken !== null) {
                    // Atomic compare-and-delete Lua script
                    $lua = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
                    $r->eval($lua, ['lock:' . $lockName, $ownerToken], 1);
                } else {
                    $r->del('lock:' . $lockName);
                }
            } catch (\Throwable) {
                // continue to file lock release
            }
        }

        $lockFile = self::cacheDir() . '/lock_' . preg_replace('/[^a-zA-Z0-9_\-]/', '_', $lockName) . '.lock';
        if (is_file($lockFile)) {
            if ($ownerToken !== null) {
                $raw = @file_get_contents($lockFile);
                $meta = $raw ? json_decode($raw, true) : null;
                if (is_array($meta) && isset($meta['token']) && $meta['token'] === $ownerToken) {
                    @unlink($lockFile);
                }
            } else {
                @unlink($lockFile);
            }
        }
    }
}
