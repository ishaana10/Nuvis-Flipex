<?php
declare(strict_types=1);

namespace App\Support;

use Throwable;

/**
 * Tracks every stored file per tenant (path, size, SHA-256, mime) in tenant_storage_objects.
 * Paths must live under tenants/{tenant_id}/ — anything else is refused, which makes cross-tenant path
 * registration impossible.
 */
final class StorageRegistry
{
    public static function record(int $tenantId, ?int $flipbookId, string $kind, string $relPath, ?string $mime = null): bool
    {
        $relPath = ltrim(str_replace('\\', '/', $relPath), '/');
        if ($tenantId <= 0 || !str_starts_with($relPath, "tenants/{$tenantId}/") || str_contains($relPath, '..')) {
            return false;
        }
        $full = Storage::root() . '/' . $relPath;
        if (!is_file($full)) {
            return false;
        }
        try {
            Db::run(
                'INSERT INTO tenant_storage_objects (tenant_id, flipbook_id, kind, rel_path, size_bytes, sha256, mime_type, verified_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE size_bytes = VALUES(size_bytes), sha256 = VALUES(sha256), mime_type = VALUES(mime_type),
                                         verified_at = NOW(), deleted_at = NULL, flipbook_id = VALUES(flipbook_id), kind = VALUES(kind)',
                [$tenantId, $flipbookId, $kind, $relPath, (int) filesize($full), hash_file('sha256', $full), $mime]
            );
            return true;
        } catch (Throwable $e) {
            error_log('StorageRegistry record failed: ' . $e->getMessage());
            return false;
        }
    }

    public static function markDeletedForFlipbook(int $tenantId, int $flipbookId): void
    {
        try {
            Db::run('UPDATE tenant_storage_objects SET deleted_at = NOW() WHERE tenant_id = ? AND flipbook_id = ? AND deleted_at IS NULL', [$tenantId, $flipbookId]);
        } catch (Throwable) {
        }
    }

    /** Re-hash a tenant's live objects and report integrity problems. @return array{checked:int, missing:int, corrupt:int} */
    public static function verifyTenant(int $tenantId, int $limit = 500): array
    {
        $out = ['checked' => 0, 'missing' => 0, 'corrupt' => 0];
        foreach (Db::all('SELECT id, rel_path, sha256 FROM tenant_storage_objects WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY verified_at ASC LIMIT ' . max(1, $limit), [$tenantId]) as $o) {
            $out['checked']++;
            $full = Storage::root() . '/' . $o['rel_path'];
            if (!is_file($full)) {
                $out['missing']++;
            } elseif (!hash_equals((string) $o['sha256'], hash_file('sha256', $full))) {
                $out['corrupt']++;
            } else {
                Db::run('UPDATE tenant_storage_objects SET verified_at = NOW() WHERE id = ? AND tenant_id = ?', [$o['id'], $tenantId]);
            }
        }
        return $out;
    }
}
