<?php
declare(strict_types=1);

namespace App\Support;

use App\Infrastructure\Cache\CacheManager;

/**
 * Skips idempotent "ensure schema" work (CREATE TABLE IF NOT EXISTS, SHOW COLUMNS, ALTER ...) once it
 * has completed successfully for this release + database. Without it these DDL statements ran on
 * every request, which is slow on shared hosting and can take metadata locks on hot tables.
 *
 * The marker lives in Redis (or the file cache) and is keyed by release version and DB name, so a
 * new release or a different database re-runs the checks. `php bin/cache.php flush` forces a re-run.
 */
final class SchemaGuard
{
    private const TTL = 6 * 3600;

    /** @var array<string,bool> per-request memo so each check costs at most one cache read */
    private static array $memo = [];

    private static function key(string $name): string
    {
        return 'schema:' . AppVersion::version() . ':' . ($_ENV['DB_NAME'] ?? 'db') . ':' . $name;
    }

    /** True when this schema check already succeeded recently and can be skipped. */
    public static function isCurrent(string $name): bool
    {
        if (isset(self::$memo[$name])) {
            return true;
        }
        try {
            if (CacheManager::get(self::key($name), false) === true) {
                return self::$memo[$name] = true;
            }
        } catch (\Throwable) {
        }
        return false;
    }

    /** Call only after the whole check succeeded. */
    public static function done(string $name): void
    {
        if (isset(self::$memo[$name])) {
            return;
        }
        self::$memo[$name] = true;
        try {
            CacheManager::set(self::key($name), true, self::TTL);
        } catch (\Throwable) {
        }
    }
}
