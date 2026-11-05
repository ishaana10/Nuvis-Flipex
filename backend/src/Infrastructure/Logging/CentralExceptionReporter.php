<?php
declare(strict_types=1);

namespace App\Infrastructure\Logging;

use App\Support\Db;
use App\Support\TenantContext;

/**
 * Centralised Exception Reporting & Error Monitoring Service (Sentry / Datadog compatible).
 * Captures unhandled exceptions, deduplicates recurring errors, and stores telemetry in `error_reports`.
 */
final class CentralExceptionReporter
{
    public static function report(\Throwable $e, string $severity = 'error', array $extraContext = []): int
    {
        $traceId = JsonLogger::traceId();
        $tenantId = TenantContext::id();
        $user = TenantContext::user();
        $userId = !empty($user['id']) ? (int) $user['id'] : null;

        $class = get_class($e);
        $message = $e->getMessage();
        $file = basename($e->getFile()) . ':' . $e->getLine();
        $line = (int) $e->getLine();
        $method = $_SERVER['REQUEST_METHOD'] ?? 'CLI';
        $uri = substr($_SERVER['REQUEST_URI'] ?? 'cli', 0, 250);

        JsonLogger::error($message, [
            'exception' => $class,
            'file' => $e->getFile(),
            'line' => $line,
            'severity' => $severity,
        ] + $extraContext);

        try {
            $existing = Db::one(
                'SELECT id, occurrences FROM error_reports WHERE exception_class = ? AND file = ? AND line = ? AND resolved = 0 LIMIT 1',
                [$class, $file, $line]
            );
            if ($existing) {
                Db::run(
                    'UPDATE error_reports SET occurrences = occurrences + 1, last_seen_at = NOW(), trace_id = ? WHERE id = ?',
                    [$traceId, (int) $existing['id']]
                );
                return (int) $existing['id'];
            }

            return Db::insert(
                'INSERT INTO error_reports (tenant_id, user_id, trace_id, severity, exception_class, message, file, line, request_method, request_uri, context_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $tenantId,
                    $userId,
                    $traceId,
                    in_array($severity, ['warning', 'error', 'critical'], true) ? $severity : 'error',
                    $class,
                    $message,
                    $file,
                    $line,
                    $method,
                    $uri,
                    json_encode([
                        'stack_top' => array_slice(explode("\n", $e->getTraceAsString()), 0, 5),
                    ] + $extraContext),
                ]
            );
        } catch (\Throwable) {
            return 0;
        }
    }

    public static function recent(?int $tenantId = null, int $limit = 25): array
    {
        try {
            $sql = 'SELECT * FROM error_reports '
                . ($tenantId !== null ? 'WHERE tenant_id = ? OR tenant_id IS NULL ' : '')
                . 'ORDER BY resolved ASC, last_seen_at DESC LIMIT ' . max(1, min(100, $limit));
            $rows = Db::all($sql, $tenantId !== null ? [$tenantId] : []);
            return array_map(fn($r) => [
                'id' => (int) $r['id'],
                'traceId' => $r['trace_id'],
                'severity' => $r['severity'],
                'exceptionClass' => $r['exception_class'],
                'message' => $r['message'],
                'file' => $r['file'],
                'line' => (int) $r['line'],
                'requestMethod' => $r['request_method'],
                'requestUri' => $r['request_uri'],
                'resolved' => (bool) $r['resolved'],
                'occurrences' => (int) $r['occurrences'],
                'lastSeenAt' => $r['last_seen_at'],
                'createdAt' => $r['created_at'],
            ], $rows);
        } catch (\Throwable) {
            return [];
        }
    }

    public static function resolve(int $id): void
    {
        Db::run('UPDATE error_reports SET resolved = 1 WHERE id = ?', [$id]);
    }
}
