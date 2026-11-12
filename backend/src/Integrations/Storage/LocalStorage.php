<?php
declare(strict_types=1);

namespace App\Integrations\Storage;

use App\Integrations\Contracts\StorageConnectorInterface;
use App\Support\Storage;
use Throwable;

final class LocalStorage implements StorageConnectorInterface
{
    public function getType(): string
    {
        return 'local';
    }

    public function getName(): string
    {
        return 'Local Isolated Filesystem (Multi-Tenant)';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        try {
            $root = Storage::root();
            $tenantDir = $root . "/tenants/{$tenantId}";
            Storage::ensureDir($tenantDir);

            if (!is_dir($tenantDir) || !is_writable($tenantDir)) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "Tenant storage directory ({$tenantDir}) is not writable by web server user.",
                    'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                    'details' => ['path' => $tenantDir, 'writable' => false],
                ];
            }

            // Real write / read / delete canary test
            $canaryFile = $tenantDir . '/.canary_' . bin2hex(random_bytes(4)) . '.tmp';
            $testData = 'nuvis_flipex_canary_' . time();
            $written = @file_put_contents($canaryFile, $testData);
            if ($written === false) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => 'Failed to write canary file into isolated tenant storage.',
                    'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                    'details' => ['path' => $tenantDir],
                ];
            }

            $read = @file_get_contents($canaryFile);
            @unlink($canaryFile);

            $latency = (int) round((microtime(true) - $start) * 1000);
            if ($read !== $testData) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => 'Canary readback mismatch in tenant storage.',
                    'latencyMs' => $latency,
                    'details' => ['path' => $tenantDir],
                ];
            }

            $freeBytes = @disk_free_space($root);
            return [
                'success' => true,
                'status' => 'operational',
                'message' => "Isolated tenant storage operational (/storage/tenants/{$tenantId}/). R/W verified ({$latency}ms).",
                'latencyMs' => $latency,
                'details' => [
                    'tenantPath' => "tenants/{$tenantId}/",
                    'freeSpaceMb' => $freeBytes !== false ? round($freeBytes / (1024 * 1024), 1) : null,
                ],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'Storage test error: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'details' => [],
            ];
        }
    }

    public function hasObject(array $config, string $path, int $tenantId): bool
    {
        $clean = ltrim(str_replace('\\', '/', $path), '/');
        return is_file(Storage::root() . '/' . $clean);
    }

    public function putObject(array $config, string $path, string $content, string $mimeType, int $tenantId): bool
    {
        $full = Storage::root() . '/' . ltrim(str_replace('\\', '/', $path), '/');
        Storage::ensureDir(dirname($full));
        return @file_put_contents($full, $content) !== false;
    }

    public function getObject(array $config, string $path, int $tenantId): ?string
    {
        $full = Storage::root() . '/' . ltrim(str_replace('\\', '/', $path), '/');
        return is_file($full) ? @file_get_contents($full) ?: null : null;
    }
}
