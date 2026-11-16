<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Rbac;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class BrandKitController
{
    /**
     * List all brand kits for the current tenant.
     */
    public function index(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);

        $this->ensureSchema();

        $kits = Db::all(
            'SELECT * FROM brand_kits WHERE tenant_id = ? ORDER BY is_default DESC, id ASC',
            [$tenantId]
        );

        if (empty($kits)) {
            // Seed a default brand kit for this workspace
            Db::run(
                'INSERT INTO brand_kits (tenant_id, name, primary_color, secondary_color, accent_color, background_gradient, drawer_bg_color, drawer_text_color, font_family, is_default)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
                [
                    $tenantId,
                    'Default Brand Kit',
                    '#f59e0b',
                    '#0f172a',
                    '#f59e0b',
                    'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                    '#0d1117',
                    '#f1f5f9',
                    'Inter, sans-serif'
                ]
            );

            $kits = Db::all(
                'SELECT * FROM brand_kits WHERE tenant_id = ? ORDER BY is_default DESC, id ASC',
                [$tenantId]
            );
        }

        return Http::json($res, [
            'brandKits' => array_map([$this, 'formatKit'], $kits),
        ]);
    }

    /**
     * Create a new brand kit.
     */
    public function create(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'settings.manage');

        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $body = (array) $req->getParsedBody();

        $name = trim((string) ($body['name'] ?? ''));
        if ($name === '') {
            return Http::error($res, 'Brand Kit name is required', 422);
        }

        $logoUrl = !empty($body['logoUrl']) ? trim((string) $body['logoUrl']) : null;
        $primaryColor = !empty($body['primaryColor']) ? trim((string) $body['primaryColor']) : '#f59e0b';
        $secondaryColor = !empty($body['secondaryColor']) ? trim((string) $body['secondaryColor']) : '#0f172a';
        $accentColor = !empty($body['accentColor']) ? trim((string) $body['accentColor']) : $primaryColor;
        $backgroundGradient = !empty($body['backgroundGradient']) ? trim((string) $body['backgroundGradient']) : null;
        $drawerBgColor = !empty($body['drawerBgColor']) ? trim((string) $body['drawerBgColor']) : '#0d1117';
        $drawerTextColor = !empty($body['drawerTextColor']) ? trim((string) $body['drawerTextColor']) : '#f1f5f9';
        $fontFamily = !empty($body['fontFamily']) ? trim((string) $body['fontFamily']) : 'Inter, sans-serif';
        $isDefault = !empty($body['isDefault']) ? 1 : 0;

        if ($isDefault === 1) {
            Db::run('UPDATE brand_kits SET is_default = 0 WHERE tenant_id = ?', [$tenantId]);
        }

        Db::run(
            'INSERT INTO brand_kits (tenant_id, name, logo_url, primary_color, secondary_color, accent_color, background_gradient, drawer_bg_color, drawer_text_color, font_family, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $tenantId,
                $name,
                $logoUrl,
                $primaryColor,
                $secondaryColor,
                $accentColor,
                $backgroundGradient,
                $drawerBgColor,
                $drawerTextColor,
                $fontFamily,
                $isDefault
            ]
        );

        $newId = (int) Db::pdo()->lastInsertId();
        $kit = Db::one('SELECT * FROM brand_kits WHERE id = ?', [$newId]);

        Audit::log('brand_kit.create', "Created brand kit {$name} (ID: {$newId})", [
            'brand_kit_id' => $newId,
            'name' => $name,
            'tenant_id' => $tenantId,
        ]);

        return Http::json($res, [
            'brandKit' => $this->formatKit($kit),
            'message' => 'Brand kit created successfully',
        ], 201);
    }

    /**
     * Update an existing brand kit.
     */
    public function update(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'settings.manage');

        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $id = (int) ($args['id'] ?? 0);

        $kit = Db::one('SELECT * FROM brand_kits WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        if (!$kit) {
            return Http::error($res, 'Brand Kit not found', 404);
        }

        $body = (array) $req->getParsedBody();
        $name = isset($body['name']) ? trim((string) $body['name']) : $kit['name'];
        if ($name === '') {
            return Http::error($res, 'Brand Kit name cannot be blank', 422);
        }

        $logoUrl = array_key_exists('logoUrl', $body) ? trim((string) $body['logoUrl']) : $kit['logo_url'];
        $primaryColor = !empty($body['primaryColor']) ? trim((string) $body['primaryColor']) : $kit['primary_color'];
        $secondaryColor = !empty($body['secondaryColor']) ? trim((string) $body['secondaryColor']) : $kit['secondary_color'];
        $accentColor = !empty($body['accentColor']) ? trim((string) $body['accentColor']) : $kit['accent_color'];
        $backgroundGradient = array_key_exists('backgroundGradient', $body) ? trim((string) $body['backgroundGradient']) : $kit['background_gradient'];
        $drawerBgColor = array_key_exists('drawerBgColor', $body) ? trim((string) $body['drawerBgColor']) : $kit['drawer_bg_color'];
        $drawerTextColor = array_key_exists('drawerTextColor', $body) ? trim((string) $body['drawerTextColor']) : $kit['drawer_text_color'];
        $fontFamily = !empty($body['fontFamily']) ? trim((string) $body['fontFamily']) : $kit['font_family'];

        if (!empty($body['isDefault'])) {
            Db::run('UPDATE brand_kits SET is_default = 0 WHERE tenant_id = ?', [$tenantId]);
            $isDefault = 1;
        } else {
            $isDefault = isset($body['isDefault']) ? 0 : (int) $kit['is_default'];
        }

        Db::run(
            'UPDATE brand_kits SET
                name = ?,
                logo_url = ?,
                primary_color = ?,
                secondary_color = ?,
                accent_color = ?,
                background_gradient = ?,
                drawer_bg_color = ?,
                drawer_text_color = ?,
                font_family = ?,
                is_default = ?
             WHERE id = ? AND tenant_id = ?',
            [
                $name,
                $logoUrl ?: null,
                $primaryColor,
                $secondaryColor,
                $accentColor,
                $backgroundGradient ?: null,
                $drawerBgColor ?: null,
                $drawerTextColor ?: null,
                $fontFamily,
                $isDefault,
                $id,
                $tenantId
            ]
        );

        $updated = Db::one('SELECT * FROM brand_kits WHERE id = ?', [$id]);

        return Http::json($res, [
            'brandKit' => $this->formatKit($updated),
            'message' => 'Brand kit updated successfully',
        ]);
    }

    /**
     * Delete a brand kit.
     */
    public function delete(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'settings.manage');

        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $id = (int) ($args['id'] ?? 0);

        $kit = Db::one('SELECT * FROM brand_kits WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);
        if (!$kit) {
            return Http::error($res, 'Brand Kit not found', 404);
        }

        Db::run('DELETE FROM brand_kits WHERE id = ? AND tenant_id = ?', [$id, $tenantId]);

        Audit::log('brand_kit.delete', "Deleted brand kit {$kit['name']} (ID: {$id})", [
            'brand_kit_id' => $id,
            'name' => $kit['name'],
            'tenant_id' => $tenantId,
        ]);

        return Http::json($res, ['message' => 'Brand kit removed successfully']);
    }

    /**
     * Apply brand kit styles to a specific flipbook.
     */
    public function apply(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : 1);
        $kitId = (int) ($args['id'] ?? 0);
        $flipbookId = (int) ($args['flipbookId'] ?? 0);

        $kit = Db::one('SELECT * FROM brand_kits WHERE id = ? AND tenant_id = ?', [$kitId, $tenantId]);
        if (!$kit) {
            return Http::error($res, 'Brand Kit not found', 404);
        }

        $flipbook = Db::one('SELECT * FROM flipbooks WHERE id = ? AND tenant_id = ?', [$flipbookId, $tenantId]);
        if (!$flipbook) {
            return Http::error($res, 'Flipbook not found', 404);
        }

        $currentSettings = !empty($flipbook['settings']) ? json_decode((string) $flipbook['settings'], true) : [];
        if (!is_array($currentSettings)) {
            $currentSettings = [];
        }

        $currentSettings['brandAccentColor'] = $kit['accent_color'];
        $currentSettings['toolbarColor'] = $kit['secondary_color'];
        $currentSettings['toolbarButtonColor'] = $kit['accent_color'];
        $currentSettings['drawerBgColor'] = $kit['drawer_bg_color'] ?: '#0d1117';
        $currentSettings['drawerTextColor'] = $kit['drawer_text_color'] ?: '#f1f5f9';
        $currentSettings['drawerActiveColor'] = $kit['accent_color'];
        $currentSettings['fontFamily'] = $kit['font_family'];

        if (!empty($kit['background_gradient'])) {
            $currentSettings['background'] = $kit['background_gradient'];
            $currentSettings['backgroundGradient'] = $kit['background_gradient'];
            $currentSettings['backgroundType'] = 'style';
        }

        if (!empty($kit['logo_url'])) {
            $currentSettings['logoUrl'] = $kit['logo_url'];
        }

        Db::run(
            'UPDATE flipbooks SET settings = ? WHERE id = ?',
            [json_encode($currentSettings, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), $flipbookId]
        );

        return Http::json($res, [
            'settings' => $currentSettings,
            'message' => "Applied brand kit '{$kit['name']}' to flipbook",
        ]);
    }

    private function formatKit(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'logoUrl' => $row['logo_url'],
            'primaryColor' => (string) ($row['primary_color'] ?? '#f59e0b'),
            'secondaryColor' => (string) ($row['secondary_color'] ?? '#0f172a'),
            'accentColor' => (string) ($row['accent_color'] ?? '#f59e0b'),
            'backgroundGradient' => $row['background_gradient'],
            'drawerBgColor' => $row['drawer_bg_color'] ?: '#0d1117',
            'drawerTextColor' => $row['drawer_text_color'] ?: '#f1f5f9',
            'fontFamily' => (string) ($row['font_family'] ?? 'Inter, sans-serif'),
            'isDefault' => (bool) ($row['is_default'] ?? 0),
            'createdAt' => (string) $row['created_at'],
            'updatedAt' => (string) $row['updated_at'],
        ];
    }

    private function ensureSchema(): void
    {
        Db::run("
            CREATE TABLE IF NOT EXISTS `brand_kits` (
              `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              `tenant_id` BIGINT UNSIGNED NOT NULL,
              `name` VARCHAR(100) NOT NULL,
              `logo_url` VARCHAR(255) NULL,
              `primary_color` VARCHAR(30) NOT NULL DEFAULT '#f59e0b',
              `secondary_color` VARCHAR(30) NOT NULL DEFAULT '#0f172a',
              `accent_color` VARCHAR(30) NOT NULL DEFAULT '#f59e0b',
              `background_gradient` VARCHAR(255) NULL,
              `drawer_bg_color` VARCHAR(30) NULL,
              `drawer_text_color` VARCHAR(30) NULL,
              `font_family` VARCHAR(80) NOT NULL DEFAULT 'Inter, sans-serif',
              `is_default` TINYINT(1) NOT NULL DEFAULT 0,
              `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX `idx_brand_kits_tenant` (`tenant_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");
    }
}
