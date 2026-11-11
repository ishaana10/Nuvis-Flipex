<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Multi-Tenant Secure File Storage & Protected Document Delivery.
 * Enforces customer isolation under /storage/tenants/{tenant_id}/.
 * Uses domain-separated cryptographic secrets (STORAGE_SIGNING_SECRET and PREVIEW_TOKEN_SECRET)
 * with zero hardcoded fallback secrets.
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
        $secret = CryptoSecrets::storageSigningSecret();
        $sig = hash_hmac('sha256', "{$relPath}|{$expires}", $secret);

        return sprintf(
            '/api/v1/files/signed?path=%s&expires=%d&sig=%s',
            rawurlencode($relPath),
            $expires,
            $sig
        );
    }

    /** Verify cryptographic signature on a temporary signed URL (supports secret rotation) */
    public static function verifySignature(string $relPath, int $expires, string $signature): bool
    {
        if (time() > $expires) {
            return false; // Expired
        }
        $secret = CryptoSecrets::storageSigningSecret();
        $expected = hash_hmac('sha256', "{$relPath}|{$expires}", $secret);
        if (hash_equals($expected, $signature)) {
            return true;
        }

        $prevSecret = CryptoSecrets::previousStorageSigningSecret();
        if ($prevSecret !== null) {
            $expectedPrev = hash_hmac('sha256', "{$relPath}|{$expires}", $prevSecret);
            return hash_equals($expectedPrev, $signature);
        }

        return false;
    }

    /** Generate a short-lived HMAC-SHA256 draft preview token for a publication slug */
    public static function generatePreviewToken(string $slug, int $ttlSeconds = 14400): string
    {
        $expires = time() + $ttlSeconds;
        $secret = CryptoSecrets::previewTokenSecret();
        $sig = hash_hmac('sha256', "preview|{$slug}|{$expires}", $secret);
        return "{$expires}.{$sig}";
    }

    /** Verify a draft preview token for a publication slug (supports secret rotation) */
    public static function verifyPreviewToken(string $slug, ?string $token): bool
    {
        if (!$token || !str_contains($token, '.')) {
            return false;
        }
        [$expStr, $sig] = explode('.', $token, 2);
        $expires = (int) $expStr;
        if ($expires < time()) {
            return false;
        }
        $secret = CryptoSecrets::previewTokenSecret();
        $expected = hash_hmac('sha256', "preview|{$slug}|{$expires}", $secret);
        if (hash_equals($expected, $sig)) {
            return true;
        }

        $prevSecret = CryptoSecrets::previousPreviewTokenSecret();
        if ($prevSecret !== null) {
            $expectedPrev = hash_hmac('sha256', "preview|{$slug}|{$expires}", $prevSecret);
            return hash_equals($expectedPrev, $sig);
        }

        return false;
    }
}
