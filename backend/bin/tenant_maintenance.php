<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;
use App\Support\Outbox;
use App\Support\StorageRegistry;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

/**
 * Daily tenant maintenance (run from cron, e.g. 00:10):
 *   - tenant_usage_daily snapshot per tenant (publications, storage, views, conversions, api calls)
 *   - storage-object integrity verification (SHA-256) per tenant
 *   - retention purge of delivered outbox events older than 30 days and expired publication tokens
 *
 *   php bin/tenant_maintenance.php [--verify-storage]
 */
$verify = in_array('--verify-storage', $argv, true);
Outbox::ensureSchema();

$tenants = Db::all('SELECT id FROM tenants');
foreach ($tenants as $t) {
    $tid = (int) $t['id'];

    $pubs = (int) (Db::one('SELECT COUNT(*) c FROM flipbooks WHERE tenant_id = ?', [$tid])['c'] ?? 0);
    $storageBytes = (int) (Db::one('SELECT COALESCE(SUM(size_bytes),0) s FROM tenant_storage_objects WHERE tenant_id = ? AND deleted_at IS NULL', [$tid])['s'] ?? 0);
    $views = (int) (Db::one("SELECT COUNT(*) c FROM analytics_events WHERE tenant_id = ? AND event_type = 'page_view' AND created_at >= CURDATE()", [$tid])['c'] ?? 0);
    $conv = (int) (Db::one("SELECT COUNT(*) c FROM jobs WHERE tenant_id = ? AND status = 'completed' AND done_at >= CURDATE()", [$tid])['c'] ?? 0);
    $api = (int) (Db::one('SELECT COALESCE(SUM(request_count),0) c FROM api_key_usage WHERE tenant_id = ? AND usage_date = CURDATE()', [$tid])['c'] ?? 0);

    Db::run(
        'INSERT INTO tenant_usage_daily (tenant_id, usage_date, storage_mb, publications, page_views, conversions, api_calls)
         VALUES (?, CURDATE(), ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE storage_mb = VALUES(storage_mb), publications = VALUES(publications),
            page_views = VALUES(page_views), conversions = VALUES(conversions), api_calls = VALUES(api_calls)',
        [$tid, round($storageBytes / 1048576, 2), $pubs, $views, $conv, $api]
    );

    if ($verify) {
        $r = StorageRegistry::verifyTenant($tid);
        echo "tenant #{$tid}: storage checked={$r['checked']} missing={$r['missing']} corrupt={$r['corrupt']}\n";
    }
}

$purged = Db::run("DELETE FROM outbox_events WHERE status = 'delivered' AND delivered_at < DATE_SUB(NOW(), INTERVAL 30 DAY)");
$expired = Db::run('DELETE FROM publication_access_tokens WHERE expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)');
echo count($tenants) . " tenants snapshotted; purged {$purged} delivered outbox events and {$expired} expired access tokens.\n";
