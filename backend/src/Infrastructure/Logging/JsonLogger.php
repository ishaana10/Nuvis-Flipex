<?php
declare(strict_types=1);

namespace App\Infrastructure\Logging;

use App\Support\Storage;
use App\Support\TenantContext;

/**
 * Structured JSON Logger (RFC 5424 / ELK / Datadog / CloudWatch compatible).
 * Writes structured JSON Lines (.jsonl) to storage/logs/app-YYYY-MM-DD.jsonl with tenant_id and trace_id.
 */
final class JsonLogger
{
    private static ?string $traceId = null;

    public static function traceId(): string
    {
        return self::$traceId ??= 'tr_' . bin2hex(random_bytes(8));
    }

    public static function logDir(): string
    {
        $dir = Storage::root() . '/logs';
        Storage::ensureDir($dir);
        return $dir;
    }

    public static function write(string $level, string $message, array $context = []): void
    {
        $user = TenantContext::user();
        $entry = [
            'timestamp' => gmdate('Y-m-d\TH:i:s.v\Z'),
            'level' => strtoupper($level),
            'service' => 'nuvis-flipex-api',
            'environment' => $_ENV['APP_ENV'] ?? 'production',
            'trace_id' => self::traceId(),
            'tenant_id' => TenantContext::id(),
            'user_id' => !empty($user['id']) ? (int) $user['id'] : null,
            'method' => $_SERVER['REQUEST_METHOD'] ?? 'CLI',
            'uri' => $_SERVER['REQUEST_URI'] ?? 'cli',
            'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
            'message' => $message,
            'context' => $context,
        ];

        $file = self::logDir() . '/app-' . gmdate('Y-m-d') . '.jsonl';
        @file_put_contents($file, json_encode($entry, JSON_UNESCAPED_SLASHES) . PHP_EOL, FILE_APPEND | LOCK_EX);
    }

    public static function info(string $message, array $context = []): void
    {
        self::write('INFO', $message, $context);
    }

    public static function warning(string $message, array $context = []): void
    {
        self::write('WARNING', $message, $context);
    }

    public static function error(string $message, array $context = []): void
    {
        self::write('ERROR', $message, $context);
    }

    public static function recentEntries(int $limit = 40, ?int $tenantId = null): array
    {
        $file = self::logDir() . '/app-' . gmdate('Y-m-d') . '.jsonl';
        if (!is_file($file)) {
            self::info('Structured JSON logger initialized and ready', ['module' => 'Infrastructure\\Logging']);
        }
        $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $parsed = [];
        for ($i = count($lines) - 1; $i >= 0 && count($parsed) < $limit; $i--) {
            $item = json_decode($lines[$i], true);
            if (!is_array($item)) {
                continue;
            }
            if ($tenantId !== null && !empty($item['tenant_id']) && (int) $item['tenant_id'] !== $tenantId) {
                continue;
            }
            $parsed[] = $item;
        }
        return $parsed;
    }
}
