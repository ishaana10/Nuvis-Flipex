<?php
declare(strict_types=1);

namespace App\Infrastructure\Database;

use App\Support\Db;
use PDO;

/**
 * Infrastructure Database Service (MySQL 8).
 * Provides connection health telemetry, transactional boundaries, and tenant-scoped query execution.
 */
final class DatabaseManager
{
    public static function connection(): PDO
    {
        return Db::pdo();
    }

    public static function transaction(callable $callback): mixed
    {
        $pdo = Db::pdo();
        $pdo->beginTransaction();
        try {
            $result = $callback($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    public static function health(): array
    {
        $start = microtime(true);
        try {
            $ver = Db::one('SELECT VERSION() AS v, DATABASE() AS db');
            $tables = Db::all(
                'SELECT TABLE_NAME AS name, TABLE_ROWS AS rows_est, ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024, 2) AS size_kb
                 FROM information_schema.TABLES
                 WHERE TABLE_SCHEMA = DATABASE()
                 ORDER BY TABLE_NAME ASC'
            );
            $latencyMs = round((microtime(true) - $start) * 1000, 2);
            return [
                'status' => 'healthy',
                'engine' => 'MySQL ' . ($ver['v'] ?? '8.4'),
                'database' => $ver['db'] ?? ($_ENV['DB_NAME'] ?? 'flipbook'),
                'latencyMs' => $latencyMs,
                'tableCount' => count($tables),
                'tables' => $tables,
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'degraded',
                'error' => $e->getMessage(),
                'latencyMs' => round((microtime(true) - $start) * 1000, 2),
            ];
        }
    }
}
