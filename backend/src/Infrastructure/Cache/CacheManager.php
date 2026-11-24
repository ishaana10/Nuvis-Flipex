<?php
declare(strict_types=1);

namespace App\Infrastructure\Cache;

use App\Support\Storage;

/**
 * Cache, counters and distributed locks.
 *
 * Redis is the primary store when available (see RedisConnection: unix socket on A2 Turbo shared,
 * TCP on Managed VPS/Dedicated, no composer dependency). When Redis is absent, disabled or down,
 * everything transparently falls back to an atomic file cache under storage/cache so the app
 * behaves the same on non-Turbo shared plans.
 *
 * Unlike the previous version, values are written to ONE store (Redis or file), not both, and the
 * file cache cleans up after itself.
 */
final class CacheManager
{
    private static array $heldLocks = [];
    private static array $nsVersions = [];

    private static function cacheDir(): string
    {
        $dir = Storage::root() . '/cache';
        Storage::ensureDir($dir);
        return $dir;
    }

    /** Live Redis connection, or null when running on the file fallback. */
    public static function redis(): ?RedisConnection
    {
        return RedisConnection::shared();
    }

    public static function redisAvailable(): bool
    {
        return self::redis() !== null;
    }

    public static function driverInfo(): array
    {
        $cfg = RedisConnection::config();
        $t0 = microtime(true);
        $r = self::redis();
        $ping = $r !== null && $r->ping();
        $latency = $ping ? round((microtime(true) - $t0) * 1000, 2) : null;

        $target = $cfg['socket'] !== '' ? $cfg['socket'] : "{$cfg['host']}:{$cfg['port']}";
        $info = [
            'activeDriver' => $ping ? 'redis' : 'atomic_file_fallback',
            'redisConfiguredHost' => $cfg['enabled'] ? $target : 'not configured',
            'redisConnected' => $ping,
            'distributedLocksSupported' => $ping,
            'cacheDirectory' => self::cacheDir(),
            'redisEnabled' => $cfg['enabled'],
            'socketAutoDetected' => $cfg['socketAutoDetected'],
            'latencyMs' => $latency,
        ];
        if ($ping) {
            $info += $r->describe();
        } else {
            $info['hint'] = $cfg['enabled']
                ? 'Redis is configured but not reachable; using the file cache. Check REDIS_SOCKET / REDIS_HOST and that Redis is running.'
                : 'Redis is not configured; using the file cache. On A2 Hosting Turbo/Managed plans set REDIS_SOCKET or REDIS_HOST in .env.';
        }
        return $info;
    }

    // ------------------------------------------------------------------ key/value

    public static function get(string $key, mixed $default = null): mixed
    {
        $r = self::redis();
        if ($r !== null) {
            $raw = $r->get('c:' . $key);
            if ($raw === null) {
                // Distinguish a miss from a Redis failure (get() returns null for both).
                if (self::redis() !== null) {
                    return $default;
                }
            } else {
                $env = json_decode($raw, true);
                return is_array($env) && array_key_exists('v', $env) ? $env['v'] : $default;
            }
        }
        return self::fileGet($key, $default);
    }

    public static function set(string $key, mixed $value, int $ttlSeconds = 300): void
    {
        $r = self::redis();
        if ($r !== null && $r->set('c:' . $key, (string) json_encode(['v' => $value]), $ttlSeconds)) {
            return;
        }
        self::fileSet($key, $value, $ttlSeconds);
    }

    public static function forget(string $key): void
    {
        $r = self::redis();
        if ($r !== null) {
            $r->del('c:' . $key);
        }
        $f = self::fileFor($key);
        if (is_file($f)) {
            @unlink($f);
        }
    }

    public static function remember(string $key, int $ttlSeconds, callable $resolver): mixed
    {
        $miss = '__CACHE_MISS__';
        $hit = self::get($key, $miss);
        if ($hit !== $miss) {
            return $hit;
        }
        $val = $resolver();
        self::set($key, $val, $ttlSeconds);
        return $val;
    }

    // ------------------------------------------------------------------ namespaces

    /** Build a key inside a namespace; bumping the namespace invalidates all of its keys at once. */
    public static function nsKey(string $ns, string $key): string
    {
        if (!isset(self::$nsVersions[$ns])) {
            $v = self::get("nsver:{$ns}", null);
            if ($v === null) {
                $v = 1;
                self::set("nsver:{$ns}", $v, 86400 * 30);
            }
            self::$nsVersions[$ns] = $v;
        }
        return "{$ns}:" . self::$nsVersions[$ns] . ":{$key}";
    }

    /** Invalidate every key previously built with nsKey($ns, ...). */
    public static function invalidateNs(string $ns): void
    {
        $v = (int) (microtime(true) * 1000);
        self::set("nsver:{$ns}", $v, 86400 * 30);
        self::$nsVersions[$ns] = $v;
    }

    // ------------------------------------------------------------------ counters

    /**
     * Atomically count a hit inside a window; returns the new count, or null when Redis isn't
     * available (callers then use their own fallback, e.g. the database).
     */
    public static function hit(string $key, int $windowSeconds): ?int
    {
        $r = self::redis();
        return $r === null ? null : $r->incrWithTtl('h:' . $key, $windowSeconds);
    }

    // ------------------------------------------------------------------ locks

    public static function acquireLock(string $lockName, int $ttlSeconds = 60, ?string &$acquiredToken = null): bool
    {
        $token = bin2hex(random_bytes(16));
        $r = self::redis();
        if ($r !== null) {
            if ($r->setNx('l:' . $lockName, $token, $ttlSeconds)) {
                self::$heldLocks[$lockName] = $token;
                $acquiredToken = $token;
                return true;
            }
            if (self::redis() !== null) {
                return false; // Redis is healthy and the lock is held elsewhere
            }
        }

        $lockFile = self::cacheDir() . '/lock_' . preg_replace('/[^a-zA-Z0-9_\-]/', '_', $lockName) . '.lock';
        if (is_file($lockFile)) {
            $meta = json_decode((string) @file_get_contents($lockFile), true);
            if (is_array($meta) && ($meta['expires_at'] ?? 0) > time()) {
                return false;
            }
            @unlink($lockFile);
        }
        $fp = @fopen($lockFile, 'x'); // exclusive create is atomic
        if ($fp === false) {
            return false;
        }
        fwrite($fp, (string) json_encode(['token' => $token, 'pid' => getmypid(), 'expires_at' => time() + $ttlSeconds]));
        fclose($fp);
        self::$heldLocks[$lockName] = $token;
        $acquiredToken = $token;
        return true;
    }

    public static function releaseLock(string $lockName, ?string $token = null): void
    {
        $owner = $token ?? (self::$heldLocks[$lockName] ?? null);
        unset(self::$heldLocks[$lockName]);

        $r = self::redis();
        if ($r !== null && $owner !== null) {
            $r->delIfEquals('l:' . $lockName, $owner);
        }

        $lockFile = self::cacheDir() . '/lock_' . preg_replace('/[^a-zA-Z0-9_\-]/', '_', $lockName) . '.lock';
        if (is_file($lockFile)) {
            $meta = json_decode((string) @file_get_contents($lockFile), true);
            if ($owner === null || (is_array($meta) && ($meta['token'] ?? null) === $owner)) {
                @unlink($lockFile);
            }
        }
    }

    // ------------------------------------------------------------------ file fallback

    private static function fileFor(string $key): string
    {
        return self::cacheDir() . '/' . hash('sha256', $key) . '.cache.json';
    }

    private static function fileGet(string $key, mixed $default): mixed
    {
        $file = self::fileFor($key);
        $raw = @file_get_contents($file);
        if ($raw === false || $raw === '') {
            return $default;
        }
        $data = json_decode($raw, true);
        if (!is_array($data) || ($data['expires_at'] ?? 0) < time()) {
            @unlink($file);
            return $default;
        }
        return array_key_exists('value', $data) ? $data['value'] : $default;
    }

    private static function fileSet(string $key, mixed $value, int $ttl): void
    {
        $file = self::fileFor($key);
        $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
        $json = json_encode(['key' => $key, 'expires_at' => time() + $ttl, 'value' => $value]);
        if (@file_put_contents($tmp, $json, LOCK_EX) !== false) {
            @rename($tmp, $file); // atomic replace: readers never see a half-written file
        }
        if (random_int(1, 100) === 1) {
            self::gcFiles();
        }
    }

    /** Remove expired cache files and stale temp files (runs on ~1% of writes). */
    public static function gcFiles(): int
    {
        $n = 0;
        foreach (glob(self::cacheDir() . '/*.cache.json') ?: [] as $f) {
            $d = json_decode((string) @file_get_contents($f), true);
            if (!is_array($d) || ($d['expires_at'] ?? 0) < time()) {
                $n += @unlink($f) ? 1 : 0;
            }
        }
        foreach (glob(self::cacheDir() . '/*.tmp') ?: [] as $f) {
            if (@filemtime($f) < time() - 300) {
                @unlink($f);
            }
        }
        return $n;
    }

    /** Clear everything this app cached (file cache, plus Redis keys under our prefix via namespace bump). */
    public static function flushAll(): void
    {
        foreach (glob(self::cacheDir() . '/*.cache.json') ?: [] as $f) {
            @unlink($f);
        }
        self::$nsVersions = [];
    }
}
