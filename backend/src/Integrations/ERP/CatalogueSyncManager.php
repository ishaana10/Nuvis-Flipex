<?php
declare(strict_types=1);

namespace App\Integrations\ERP;

use App\Integrations\Webhooks\WebhookDispatcher;
use App\Support\Audit;
use App\Support\Db;
use App\Support\Outbox;
use App\Support\Slug;
use Throwable;

final class CatalogueSyncManager
{
    private static bool $schemaEnsured = false;

    public static function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        self::$schemaEnsured = true;
        try {
            Db::pdo()->exec("CREATE TABLE IF NOT EXISTS erp_sync_logs (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NOT NULL,
                flipbook_id BIGINT UNSIGNED NOT NULL,
                erp_source VARCHAR(60) NOT NULL DEFAULT 'REST',
                erp_catalogue_id VARCHAR(120) NULL,
                action ENUM('created','updated') NOT NULL,
                products_count INT UNSIGNED NOT NULL DEFAULT 0,
                hotspots_created INT UNSIGNED NOT NULL DEFAULT 0,
                hotspots_updated INT UNSIGNED NOT NULL DEFAULT 0,
                price_changes_json JSON NULL,
                status ENUM('success','failed') NOT NULL DEFAULT 'success',
                error_message TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_erp_sync_tenant (tenant_id),
                INDEX idx_erp_sync_flipbook (flipbook_id),
                INDEX idx_erp_sync_cat (erp_catalogue_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        } catch (Throwable $e) {
            error_log('ERP sync logs schema ensure failed: ' . $e->getMessage());
        }
    }

    /**
     * Synchronize product catalogue from an ERP system (SAP, Odoo, NetSuite, etc.).
     * Performs idempotency check: updates existing publication & hotspot pricing rather than duplicate creation.
     */
    public static function sync(int $tenantId, int $userId, array $payload): array
    {
        self::ensureSchema();

        $erpSource = trim((string) ($payload['erpSource'] ?? ($payload['erpSystem'] ?? 'REST')));
        $erpCatalogueId = trim((string) ($payload['erpCatalogueId'] ?? ($payload['catalogueId'] ?? '')));
        $title = trim((string) ($payload['title'] ?? 'ERP Automated Product Catalogue'));
        $description = trim((string) ($payload['description'] ?? 'Synced via Nuvis Flipex ERP REST API'));
        $autoPublish = !isset($payload['autoPublish']) || !empty($payload['autoPublish']);
        $products = isset($payload['products']) && is_array($payload['products']) ? $payload['products'] : [];

        $sourceBookId = (int) ($payload['sourceBookId'] ?? ($payload['sourceFlipbookId'] ?? 0));
        $targetBookId = (int) ($payload['targetFlipbookId'] ?? ($payload['flipbookId'] ?? 0));

        // 1. Locate existing catalogue by ID, erp_catalogue_id in settings, or title match in tenant
        $existing = null;
        if ($targetBookId > 0) {
            $existing = Db::one('SELECT * FROM flipbooks WHERE id = ? AND tenant_id = ?', [$targetBookId, $tenantId]);
        }
        if (!$existing && $erpCatalogueId !== '') {
            $existing = Db::one(
                "SELECT * FROM flipbooks
                 WHERE tenant_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(settings, '$.erp_catalogue_id')) = ?
                 ORDER BY id DESC LIMIT 1",
                [$tenantId, $erpCatalogueId]
            );
        }
        if (!$existing && $title !== '') {
            $existing = Db::one(
                'SELECT * FROM flipbooks WHERE tenant_id = ? AND title = ? ORDER BY id DESC LIMIT 1',
                [$tenantId, $title]
            );
        }

        $isUpdate = $existing !== null;
        $flipbookId = 0;
        $slug = '';
        $pageCount = 1;

        if ($isUpdate) {
            $flipbookId = (int) $existing['id'];
            $slug = (string) $existing['slug'];
            $pageCount = max(1, (int) $existing['page_count']);

            // Update title, description, and sync settings
            $curSettings = json_decode((string) ($existing['settings'] ?? '{}'), true) ?: [];
            $curSettings['erp_catalogue_id'] = $erpCatalogueId ?: ($curSettings['erp_catalogue_id'] ?? 'erp-' . $flipbookId);
            $curSettings['erp_source'] = $erpSource;
            $curSettings['last_erp_sync_at'] = date('Y-m-d H:i:s');

            Db::run(
                'UPDATE flipbooks SET title = ?, description = ?, settings = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?',
                [$title, $description, json_encode($curSettings), $flipbookId, $tenantId]
            );
        } else {
            // Create new publication based on source book template if available
            $sourceBook = $sourceBookId > 0
                ? Db::one('SELECT * FROM flipbooks WHERE id = ? AND tenant_id = ?', [$sourceBookId, $tenantId])
                : Db::one("SELECT * FROM flipbooks WHERE tenant_id = ? AND status = 'ready' ORDER BY id DESC LIMIT 1", [$tenantId]);

            $baseSlug = strtolower(trim((string) preg_replace('/[^a-zA-Z0-9]+/', '-', $title), '-')) ?: 'erp-catalogue';
            $slug = $baseSlug . '-' . substr(bin2hex(random_bytes(3)), 0, 6);
            $pageCount = $sourceBook ? max(1, (int) $sourceBook['page_count']) : 4;
            $pdfPath = $sourceBook ? $sourceBook['source_pdf_path'] : null;
            $wfStatus = $autoPublish ? 'published' : 'editing';
            $publishedAt = $autoPublish ? date('Y-m-d H:i:s') : null;

            $initSettings = [
                'erp_catalogue_id' => $erpCatalogueId ?: 'erp-' . bin2hex(random_bytes(4)),
                'erp_source' => $erpSource,
                'last_erp_sync_at' => date('Y-m-d H:i:s'),
            ];

            $flipbookId = Db::insert(
                "INSERT INTO flipbooks (user_id, tenant_id, title, description, slug, status, workflow_status, version, visibility, page_count, published_at, source_pdf_path, settings, conversion_progress, conversion_step)
                 VALUES (?, ?, ?, ?, ?, 'ready', ?, 1, 'public', ?, ?, ?, ?, 100, 'Synced via ERP Catalogue API')",
                [$userId, $tenantId, $title, $description, $slug, $wfStatus, $pageCount, $publishedAt, $pdfPath, json_encode($initSettings)]
            );

            if ($sourceBook) {
                $pages = Db::all('SELECT * FROM pages WHERE flipbook_id = ? ORDER BY page_number ASC', [$sourceBook['id']]);
                foreach ($pages as $pg) {
                    Db::run(
                        'INSERT INTO pages (flipbook_id, page_number, image_path, thumb_path, high_res_path, webp_path, avif_path, width, height, text_content)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [
                            $flipbookId,
                            $pg['page_number'],
                            $pg['image_path'],
                            $pg['thumb_path'],
                            $pg['high_res_path'] ?? null,
                            $pg['webp_path'] ?? null,
                            $pg['avif_path'] ?? null,
                            $pg['width'],
                            $pg['height'],
                            $pg['text_content'] ?? null,
                        ]
                    );
                }
            }
        }

        // 2. Synchronize hotspots with SKU uniqueness & Price History tracking
        $existingHotspots = Db::all('SELECT * FROM hotspots WHERE flipbook_id = ?', [$flipbookId]);
        $hotspotBySku = [];
        foreach ($existingHotspots as $h) {
            $p = json_decode((string) $h['payload'], true) ?: [];
            if (!empty($p['sku'])) {
                $hotspotBySku[(string) $p['sku']] = [
                    'id' => (int) $h['id'],
                    'page' => (int) $h['page_number'],
                    'payload' => $p,
                ];
            }
        }

        $hotspotsCreated = 0;
        $hotspotsUpdated = 0;
        $priceChanges = [];

        foreach ($products as $idx => $prod) {
            if (!is_array($prod)) continue;

            $sku = trim((string) ($prod['sku'] ?? 'SKU-' . ($idx + 1)));
            $prodName = trim((string) ($prod['name'] ?? 'Catalogue Item'));
            $price = trim((string) ($prod['price'] ?? ''));
            $page = max(1, min($pageCount, (int) ($prod['page'] ?? 1)));
            $x = (float) ($prod['x'] ?? (12 + (($idx % 3) * 28)));
            $y = (float) ($prod['y'] ?? (20 + (floor($idx / 3) * 24)));
            $w = (float) ($prod['w'] ?? 24);
            $h = (float) ($prod['h'] ?? 12);
            $url = trim((string) ($prod['url'] ?? "https://shop.example.com/products/{$sku}"));
            $imageUrl = trim((string) ($prod['imageUrl'] ?? ($prod['image_url'] ?? '')));
            $label = $price !== '' ? "{$prodName} ({$sku}) — {$price}" : "{$prodName} ({$sku})";

            if (isset($hotspotBySku[$sku])) {
                // Existing SKU: Check for price changes and update in place!
                $curr = $hotspotBySku[$sku];
                $oldPrice = (string) ($curr['payload']['price'] ?? '');
                if ($oldPrice !== '' && $price !== '' && $oldPrice !== $price) {
                    $priceChanges[] = [
                        'sku' => $sku,
                        'name' => $prodName,
                        'oldPrice' => $oldPrice,
                        'newPrice' => $price,
                        'page' => $curr['page'],
                    ];
                }

                $updatedPayload = array_merge($curr['payload'], [
                    'title' => $label,
                    'price' => $price,
                    'sku' => $sku,
                    'url' => $url,
                    'name' => $prodName,
                ]);
                if ($imageUrl !== '') {
                    $updatedPayload['imageUrl'] = $imageUrl;
                }

                Db::run(
                    'UPDATE hotspots SET payload = ? WHERE id = ?',
                    [json_encode($updatedPayload), $curr['id']]
                );
                $hotspotsUpdated++;
            } else {
                // New SKU: Insert hotspot
                $newPayload = [
                    'url' => $url,
                    'title' => $label,
                    'sku' => $sku,
                    'price' => $price,
                    'name' => $prodName,
                ];
                if ($imageUrl !== '') {
                    $newPayload['imageUrl'] = $imageUrl;
                }

                Db::run(
                    "INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                     VALUES (?, ?, 'link', ?, ?, ?, ?, ?)",
                    [$flipbookId, $page, $x, $y, $w, $h, json_encode($newPayload)]
                );
                $hotspotsCreated++;
                $hotspotBySku[$sku] = ['id' => (int) Db::pdo()->lastInsertId(), 'page' => $page, 'payload' => $newPayload];
            }
        }

        // 3. Record Audit and Sync Log
        $action = $isUpdate ? 'updated' : 'created';
        $syncLogId = Db::insert(
            'INSERT INTO erp_sync_logs (tenant_id, flipbook_id, erp_source, erp_catalogue_id, action, products_count, hotspots_created, hotspots_updated, price_changes_json, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "success")',
            [
                $tenantId,
                $flipbookId,
                $erpSource,
                $erpCatalogueId ?: null,
                $action,
                count($products),
                $hotspotsCreated,
                $hotspotsUpdated,
                !empty($priceChanges) ? json_encode($priceChanges) : null,
            ]
        );

        $appUrl = rtrim($_ENV['APP_URL'] ?? 'http://localhost:5173', '/');
        $publicUrl = "{$appUrl}/v/{$slug}";

        // 4. Webhook Notification
        $eventName = $isUpdate ? 'erp.catalogue_updated' : 'erp.catalogue_published';
        WebhookDispatcher::dispatch($tenantId, $eventName, [
            'flipbookId' => $flipbookId,
            'title' => $title,
            'slug' => $slug,
            'publicUrl' => $publicUrl,
            'isUpdate' => $isUpdate,
            'erpSource' => $erpSource,
            'erpCatalogueId' => $erpCatalogueId,
            'hotspotsCreated' => $hotspotsCreated,
            'hotspotsUpdated' => $hotspotsUpdated,
            'priceChangesCount' => count($priceChanges),
        ]);

        Audit::log('erp.catalogue_sync', 'flipbook', $flipbookId, [
            'action' => $action,
            'erp_source' => $erpSource,
            'erp_catalogue_id' => $erpCatalogueId,
            'hotspots_created' => $hotspotsCreated,
            'hotspots_updated' => $hotspotsUpdated,
            'price_changes' => count($priceChanges),
        ]);

        return [
            'ok' => true,
            'action' => $action,
            'isUpdate' => $isUpdate,
            'flipbookId' => $flipbookId,
            'title' => $title,
            'slug' => $slug,
            'publicUrl' => $publicUrl,
            'pageCount' => $pageCount,
            'productsReceived' => count($products),
            'hotspotsCreated' => $hotspotsCreated,
            'hotspotsUpdated' => $hotspotsUpdated,
            'priceChanges' => $priceChanges,
            'syncLogId' => $syncLogId,
            'wordpressShortcode' => sprintf('[nuvis_flipex slug="%s" width="100%%" height="680px"]', $slug),
        ];
    }
}
