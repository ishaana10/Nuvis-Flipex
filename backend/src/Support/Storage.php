<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Multi-Tenant Secure File Storage & Protected Document Delivery.
 * Enforces customer isolation under /storage/tenants/{tenant_id}/.
 */
final class Storage
{
    public static function root(): string
    {
        return dirname(__DIR__, 2) . '/storage';
    }

    /** Path to isolated tenant directory */
    public static function tenantDir(int $tenantId): string
    {
        return self::root() . "/tenants/{$tenantId}";
    }

    /** Path to publication assets directory */
    public static function publicationDir(int $tenantId, int $flipbookId): string
    {
        return self::tenantDir($tenantId) . "/publications/{$flipbookId}";
    }

    /** Relative path for publication source PDF */
    public static function sourcePdfRel(int $tenantId, int $flipbookId): string
    {
        return "tenants/{$tenantId}/publications/{$flipbookId}/source.pdf";
    }

    /** Relative path for publication pages */
    public static function pagesRel(int $tenantId, int $flipbookId): string
    {
        return "tenants/{$tenantId}/publications/{$flipbookId}/pages";
    }

    /** Ensure directory exists with secure 0775 permissions */
    public static function ensureDir(string $path): void
    {
        if (!is_dir($path)) {
            @mkdir($path, 0775, true);
        }
    }

    /** Recursively delete directory */
    public static function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (scandir($dir) as $item) {
            if ($item === '.' || $item === '..') continue;
            $path = "$dir/$item";
            is_dir($path) ? self::rrmdir($path) : @unlink($path);
        }
        @rmdir($dir);
    }

    /** Generate cryptographic HMAC-SHA256 signed URL for protected temporary access */
    public static function temporarySignedUrl(string $relPath, int $ttlSeconds = 3600): string
    {
        $expires = time() + $ttlSeconds;
        $secret = $_ENV['JWT_SECRET'] ?? 'nuvis_fallback_secret_key';
        $sig = hash_hmac('sha256', "{$relPath}|{$expires}", $secret);

        return sprintf(
            '/api/v1/files/signed?path=%s&expires=%d&sig=%s',
            rawurlencode($relPath),
            $expires,
            $sig
        );
    }

    /** Verify cryptographic signature on a temporary signed URL */
    public static function verifySignature(string $relPath, int $expires, string $signature): bool
    {
        if (time() > $expires) {
            return false; // Expired
        }
        $secret = $_ENV['JWT_SECRET'] ?? 'nuvis_fallback_secret_key';
        $expected = hash_hmac('sha256', "{$relPath}|{$expires}", $secret);

        return hash_equals($expected, $signature);
    }
}
