<?php
declare(strict_types=1);

namespace App\Infrastructure\Cache;

use App\Support\Storage;

/**
 * Minimal Redis connection with NO external dependency.
 *
 * Uses the phpredis extension when it is loaded, and otherwise a small built-in RESP client over a
 * plain stream socket, so Redis works on A2 Hosting even if the cPanel "redis" PHP extension is not
 * ticked. Supports both transports A2 uses:
 *   - Turbo shared / reseller:  unix socket   /home/<user>/.redis/redis.sock   (auto-detected)
 *   - Managed VPS / Dedicated:  TCP           127.0.0.1:6379
 *
 * Failure handling: every call is wrapped so Redis trouble never breaks a request. After a failure
 * a short "circuit breaker" file makes later requests skip Redis for REDIS_RETRY_SECONDS instead
 * of paying the connect timeout each time.
 */
final class RedisConnection
{
    private static ?self $instance = null;
    private static bool $resolved = false;

    /** @var resource|null */
    private $sock = null;
    private ?\Redis $ext = null;
    private string $prefix;
    private string $transport;
    private string $clientName;

    private function __construct(private array $cfg)
    {
        $this->prefix = $cfg['prefix'];
    }

    // ---------------------------------------------------------------- configuration

    /** Resolve connection settings from .env (with A2 Turbo socket auto-detection). */
    public static function config(): array
    {
        $env = static fn(string $k, string $d = ''): string => trim((string) ($_ENV[$k] ?? getenv($k) ?: $d));

        $enabledRaw = strtolower($env('REDIS_ENABLED', 'auto'));
        $socket = $env('REDIS_SOCKET');
        $detected = false;

        if ($socket === '' && !in_array($enabledRaw, ['0', 'false', 'off', 'no'], true)) {
            // A2 Hosting Turbo shared/reseller accounts expose Redis at ~/.redis/redis.sock
            $home = $env('HOME') ?: (string) ($_SERVER['HOME'] ?? '');
            if ($home === '' && function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
                $home = (string) (posix_getpwuid(posix_geteuid())['dir'] ?? '');
            }
            if ($home !== '' && @file_exists($home . '/.redis/redis.sock')) {
                $socket = $home . '/.redis/redis.sock';
                $detected = true;
            }
        }

        $host = $env('REDIS_HOST', '127.0.0.1');
        $explicitTcp = isset($_ENV['REDIS_HOST']) || getenv('REDIS_HOST') !== false;
        $enabled = match (true) {
            in_array($enabledRaw, ['0', 'false', 'off', 'no'], true) => false,
            in_array($enabledRaw, ['1', 'true', 'on', 'yes'], true) => true,
            default => $socket !== '' || $explicitTcp, // auto: only when a target was configured/detected
        };

        $envName = preg_replace('/[^a-z0-9]/i', '', $env('APP_ENV', 'production')) ?: 'production';

        return [
            'enabled' => $enabled,
            'socket' => $socket,
            'socketAutoDetected' => $detected,
            'host' => $host,
            'port' => (int) $env('REDIS_PORT', '6379'),
            'username' => $env('REDIS_USERNAME'),
            'password' => $env('REDIS_PASSWORD'),
            'db' => max(0, (int) $env('REDIS_DB', '0')),
            'timeout' => max(0.05, (float) $env('REDIS_TIMEOUT', '0.25')),
            'retrySeconds' => max(1, (int) $env('REDIS_RETRY_SECONDS', '20')),
            'prefix' => $env('REDIS_PREFIX', "nvf:{$envName}:"),
            'forceBuiltin' => in_array(strtolower($env('REDIS_CLIENT', 'auto')), ['builtin', 'resp'], true),
        ];
    }

    /** Shared connection for this request, or null when Redis is disabled/unavailable. */
    public static function shared(): ?self
    {
        if (self::$resolved) {
            return self::$instance;
        }
        self::$resolved = true;

        $cfg = self::config();
        if (!$cfg['enabled'] || self::breakerOpen($cfg)) {
            return null;
        }

        $c = new self($cfg);
        if (!$c->connect()) {
            self::tripBreaker($cfg);
            return null;
        }
        return self::$instance = $c;
    }

    /** Forget the cached connection (used by CLI tools and tests). */
    public static function reset(): void
    {
        if (self::$instance !== null) {
            self::$instance->close();
        }
        self::$instance = null;
        self::$resolved = false;
    }

    // ---------------------------------------------------------------- circuit breaker

    private static function breakerFile(): string
    {
        return Storage::root() . '/cache/redis.down';
    }

    private static function breakerOpen(array $cfg): bool
    {
        $f = self::breakerFile();
        $m = @filemtime($f);
        return $m !== false && (time() - $m) < $cfg['retrySeconds'];
    }

    private static function tripBreaker(array $cfg): void
    {
        try {
            Storage::ensureDir(dirname(self::breakerFile()));
            @touch(self::breakerFile());
        } catch (\Throwable) {
        }
    }

    private static function clearBreaker(): void
    {
        @unlink(self::breakerFile());
    }

    /** Forget a recent failure so the next call retries Redis immediately (used by the CLI). */
    public static function resetBreaker(): void
    {
        self::clearBreaker();
        self::reset();
    }

    // ---------------------------------------------------------------- connect

    private function connect(): bool
    {
        $c = $this->cfg;
        try {
            if (!$c['forceBuiltin'] && extension_loaded('redis') && class_exists(\Redis::class)) {
                $r = new \Redis();
                $ok = $c['socket'] !== ''
                    ? @$r->connect($c['socket'], 0, $c['timeout'])
                    : @$r->connect($c['host'], $c['port'], $c['timeout']);
                if (!$ok) {
                    return false;
                }
                $r->setOption(\Redis::OPT_READ_TIMEOUT, max(0.5, $c['timeout'] * 4));
                $r->setOption(\Redis::OPT_SERIALIZER, \Redis::SERIALIZER_NONE);
                if ($c['password'] !== '') {
                    $c['username'] !== '' ? $r->auth([$c['username'], $c['password']]) : $r->auth($c['password']);
                }
                if ($c['db'] > 0) {
                    $r->select($c['db']);
                }
                $this->ext = $r;
                $this->clientName = 'phpredis ' . (phpversion('redis') ?: '');
            } else {
                $target = $c['socket'] !== '' ? 'unix://' . $c['socket'] : "tcp://{$c['host']}:{$c['port']}";
                $s = @stream_socket_client($target, $errno, $errstr, $c['timeout']);
                if (!is_resource($s)) {
                    return false;
                }
                stream_set_timeout($s, 0, (int) (max(0.5, $c['timeout'] * 4) * 1_000_000));
                $this->sock = $s;
                if ($c['password'] !== '') {
                    $c['username'] !== '' ? $this->cmd('AUTH', $c['username'], $c['password']) : $this->cmd('AUTH', $c['password']);
                }
                if ($c['db'] > 0) {
                    $this->cmd('SELECT', (string) $c['db']);
                }
                $this->clientName = 'built-in RESP client';
            }
            $this->transport = $c['socket'] !== '' ? 'unix socket' : "tcp {$c['host']}:{$c['port']}";
            self::clearBreaker();
            return true;
        } catch (\Throwable $e) {
            error_log('Redis connect failed: ' . $e->getMessage());
            $this->close();
            return false;
        }
    }

    public function close(): void
    {
        try {
            if ($this->ext) {
                @$this->ext->close();
            }
            if (is_resource($this->sock)) {
                @fclose($this->sock);
            }
        } catch (\Throwable) {
        }
        $this->ext = null;
        $this->sock = null;
    }

    // ---------------------------------------------------------------- RESP

    /** Run one command. Throws \RuntimeException on protocol/IO/server errors. */
    private function cmd(string ...$args): mixed
    {
        if ($this->ext) {
            return $this->ext->rawCommand(...$args);
        }
        if (!is_resource($this->sock)) {
            throw new \RuntimeException('Redis socket closed');
        }
        $payload = '*' . count($args) . "\r\n";
        foreach ($args as $a) {
            $payload .= '$' . strlen($a) . "\r\n" . $a . "\r\n";
        }
        $len = strlen($payload);
        $written = 0;
        while ($written < $len) {
            $n = @fwrite($this->sock, substr($payload, $written));
            if ($n === false || $n === 0) {
                throw new \RuntimeException('Redis write failed');
            }
            $written += $n;
        }
        return $this->readReply();
    }

    private function readLine(): string
    {
        $line = @fgets($this->sock);
        if ($line === false) {
            throw new \RuntimeException('Redis read failed or timed out');
        }
        return rtrim($line, "\r\n");
    }

    private function readReply(): mixed
    {
        $line = $this->readLine();
        $type = $line[0] ?? '';
        $rest = substr($line, 1);
        switch ($type) {
            case '+':
                return $rest;
            case '-':
                throw new \RuntimeException('Redis error: ' . $rest);
            case ':':
                return (int) $rest;
            case '$':
                $n = (int) $rest;
                if ($n < 0) {
                    return null;
                }
                $data = '';
                while (strlen($data) < $n + 2) {
                    $chunk = @fread($this->sock, $n + 2 - strlen($data));
                    if ($chunk === false || $chunk === '') {
                        throw new \RuntimeException('Redis bulk read failed');
                    }
                    $data .= $chunk;
                }
                return substr($data, 0, $n);
            case '*':
                $n = (int) $rest;
                if ($n < 0) {
                    return null;
                }
                $out = [];
                for ($i = 0; $i < $n; $i++) {
                    $out[] = $this->readReply();
                }
                return $out;
            default:
                throw new \RuntimeException('Redis protocol error');
        }
    }

    /** Execute with failure isolation: on any error trip the breaker and return $fallback. */
    private function safe(callable $fn, mixed $fallback = null): mixed
    {
        try {
            return $fn();
        } catch (\Throwable $e) {
            error_log('Redis command failed: ' . $e->getMessage());
            self::tripBreaker($this->cfg);
            $this->close();
            self::$instance = null; // rest of this request uses the non-Redis fallback
            return $fallback;
        }
    }

    // ---------------------------------------------------------------- operations

    public function get(string $key): ?string
    {
        return $this->safe(function () use ($key) {
            $v = $this->cmd('GET', $this->prefix . $key);
            return ($v === null || $v === false) ? null : (string) $v;
        });
    }

    public function set(string $key, string $value, int $ttl): bool
    {
        return (bool) $this->safe(fn() => $this->isOk($this->cmd('SET', $this->prefix . $key, $value, 'EX', (string) max(1, $ttl))), false);
    }

    /** SET key value NX EX ttl: true only when the key did not already exist. */
    public function setNx(string $key, string $value, int $ttl): bool
    {
        return (bool) $this->safe(fn() => $this->isOk($this->cmd('SET', $this->prefix . $key, $value, 'EX', (string) max(1, $ttl), 'NX')), false);
    }

    private function isOk(mixed $reply): bool
    {
        return $reply === 'OK' || $reply === true;
    }

    public function del(string ...$keys): int
    {
        if (!$keys) {
            return 0;
        }
        return (int) $this->safe(fn() => $this->cmd('DEL', ...array_map(fn($k) => $this->prefix . $k, $keys)), 0);
    }

    /** Atomic INCR that sets the expiry on first hit (one round trip). Returns null if Redis failed. */
    public function incrWithTtl(string $key, int $ttl): ?int
    {
        $lua = "local c=redis.call('INCR',KEYS[1]) if c==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end return c";
        $r = $this->safe(fn() => $this->cmd('EVAL', $lua, '1', $this->prefix . $key, (string) max(1, $ttl)));
        return $r === null ? null : (int) $r;
    }

    /** Compare-and-delete (safe lock release). */
    public function delIfEquals(string $key, string $token): bool
    {
        $lua = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
        return (int) $this->safe(fn() => $this->cmd('EVAL', $lua, '1', $this->prefix . $key, $token), 0) > 0;
    }

    /** Delete every key under this app's prefix (SCAN, never KEYS). Returns number removed. */
    public function flushPrefix(): int
    {
        return (int) $this->safe(function () {
            $cursor = '0';
            $n = 0;
            do {
                $r = $this->cmd('SCAN', $cursor, 'MATCH', $this->prefix . '*', 'COUNT', '200');
                $cursor = (string) $r[0];
                if (!empty($r[1])) {
                    $n += (int) $this->cmd('DEL', ...$r[1]);
                }
            } while ($cursor !== '0');
            return $n;
        }, 0);
    }

    public function ping(): bool
    {
        return (bool) $this->safe(function () {
            $r = $this->cmd('PING');
            return $r === 'PONG' || $r === true;
        }, false);
    }

    /** Server details for the DevOps console. */
    public function describe(): array
    {
        $info = [];
        $raw = $this->safe(fn() => $this->cmd('INFO'));
        if (is_string($raw)) {
            foreach (explode("\n", $raw) as $line) {
                if (str_contains($line, ':') && $line[0] !== '#') {
                    [$k, $v] = explode(':', trim($line), 2);
                    $info[$k] = $v;
                }
            }
        }
        return [
            'client' => $this->clientName,
            'transport' => $this->transport,
            'redisVersion' => $info['redis_version'] ?? null,
            'usedMemory' => $info['used_memory_human'] ?? null,
            'maxMemory' => $info['maxmemory_human'] ?? null,
            'evictionPolicy' => $info['maxmemory_policy'] ?? null,
            'connectedClients' => isset($info['connected_clients']) ? (int) $info['connected_clients'] : null,
            'uptimeSeconds' => isset($info['uptime_in_seconds']) ? (int) $info['uptime_in_seconds'] : null,
            'hits' => isset($info['keyspace_hits']) ? (int) $info['keyspace_hits'] : null,
            'misses' => isset($info['keyspace_misses']) ? (int) $info['keyspace_misses'] : null,
            'prefix' => $this->prefix,
        ];
    }
}
