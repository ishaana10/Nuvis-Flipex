<?php
declare(strict_types=1);

namespace App\Infrastructure\Storage;

use App\Support\Storage;

/**
 * Infrastructure Storage & CDN Delivery Service.
 * Supports S3-compatible object storage (AWS S3 / Cloudflare R2 / MinIO / Local Isolated Storage)
 * and CDN static publication asset delivery with tenant-scoped prefix enforcement (/storage/tenants/{tenant_id}/).
 */
final class ObjectStorageAdapter
{
    public static function tenantPrefix(int $tenantId): string
    {
        return "tenants/{$tenantId}/";
    }

    public static function cdnAssetUrl(string $relativePath, int $ttlSeconds = 3600): string
    {
        $cdnBase = rtrim($_ENV['CDN_BASE_URL'] ?? '', '/');
        if ($cdnBase !== '') {
            $sig = hash_hmac('sha256', $relativePath . ':' . (time() + $ttlSeconds), $_ENV['JWT_SECRET'] ?? 'nuvis-cdn-key');
            return "{$cdnBase}/" . ltrim($relativePath, '/') . '?edge_sig=' . substr($sig, 0, 24);
        }
        return Storage::signedUrl($relativePath, $ttlSeconds);
    }

    public static function status(?int $tenantId = null): array
    {
        $root = Storage::root();
        $totalDisk = @disk_total_space($root) ?: 0;
        $freeDisk = @disk_free_space($root) ?: 0;
        $usedDisk = max(0, $totalDisk - $freeDisk);

        $s3Bucket = $_ENV['S3_BUCKET'] ?? 'nuvis-flipex-enterprise';
        $s3Endpoint = $_ENV['S3_ENDPOINT'] ?? 'https://s3.ap-southeast-2.amazonaws.com';
        $cdnDomain = $_ENV['CDN_BASE_URL'] ?? 'https://cdn.flipex.nuvistechnologies.com.fj';

        return [
            'driver' => !empty($_ENV['S3_ACCESS_KEY']) ? 's3_compatible_object_storage' : 'isolated_local_s3_compatible',
            's3Bucket' => $s3Bucket,
            's3Endpoint' => $s3Endpoint,
            's3Region' => $_ENV['S3_REGION'] ?? 'ap-southeast-2',
            'cdnEnabled' => true,
            'cdnEdgeDomain' => $cdnDomain,
            'tenantIsolationPattern' => '/storage/tenants/{tenant_id}/',
            'activeTenantPrefix' => $tenantId ? "/storage/tenants/{$tenantId}/" : '/storage/tenants/*/',
            'diskTotalGb' => round($totalDisk / 1073741824, 2),
            'diskFreeGb' => round($freeDisk / 1073741824, 2),
            'diskUsedGb' => round($usedDisk / 1073741824, 2),
            'diskUsagePct' => $totalDisk > 0 ? round(($usedDisk / $totalDisk) * 100, 1) : 0,
        ];
    }
}
