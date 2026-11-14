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

final class HotspotController
{
    private const ALLOWED_TYPES = ['link', 'video', 'audio', 'image', 'product', 'page'];
    private static bool $schemaEnsured = false;

    private static function ensureSchema(): void
    {
        if (self::$schemaEnsured) {
            return;
        }
        self::$schemaEnsured = true;
        try {
            Db::pdo()->exec("ALTER TABLE hotspots MODIFY COLUMN type VARCHAR(32) NOT NULL DEFAULT 'link'");
        } catch (\Throwable) {
            // Safe fallback: subType is also persisted inside JSON payload
        }
    }

    public function index(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.view');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        $rows = Db::all(
            'SELECT * FROM hotspots WHERE flipbook_id = ? ORDER BY page_number, id ASC',
            [$f['id']]
        );
        return Http::json($res, array_map([$this, 'present'], $rows));
    }

    public function create(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'hotspot.manage');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        self::ensureSchema();

        $b = (array) $req->getParsedBody();
        $page = max(1, (int) ($b['pageNumber'] ?? 1));
        $type = (string) ($b['type'] ?? 'link');
        $x = max(0.0, min(98.0, (float) ($b['x'] ?? 10)));
        $y = max(0.0, min(98.0, (float) ($b['y'] ?? 10)));
        $w = max(2.0, min(100.0, (float) ($b['w'] ?? 20)));
        $h = max(2.0, min(100.0, (float) ($b['h'] ?? 10)));
        $payload = is_array($b['payload'] ?? null) ? $b['payload'] : ['url' => (string)($b['payload'] ?? '')];

        if (!in_array($type, self::ALLOWED_TYPES, true)) {
            return Http::error($res, 'Invalid hotspot type', 422);
        }

        $payload['subType'] = $type;
        $dbType = in_array($type, ['link', 'video', 'audio', 'image'], true) ? $type : 'link';

        try {
            Db::run(
                'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$f['id'], $page, $type, $x, $y, $w, $h, json_encode($payload)]
            );
        } catch (\Throwable) {
            Db::run(
                'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [$f['id'], $page, $dbType, $x, $y, $w, $h, json_encode($payload)]
            );
        }
        $hid = (int) Db::pdo()->lastInsertId();
        $row = Db::one('SELECT * FROM hotspots WHERE id = ?', [$hid]);

        Audit::log('hotspot.create', 'hotspot', $hid, ['flipbook_id' => $f['id'], 'type' => $type, 'page' => $page]);

        return Http::json($res, $this->present($row), 201);
    }

    public function update(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'hotspot.manage');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        self::ensureSchema();

        $hid = (int) $args['hid'];
        $row = Db::one('SELECT * FROM hotspots WHERE id = ? AND flipbook_id = ?', [$hid, $f['id']]);
        if (!$row) return Http::error($res, 'Hotspot not found', 404);

        $b = (array) $req->getParsedBody();
        $existingPayload = json_decode($row['payload'] ?: '{}', true) ?: [];
        $type = array_key_exists('type', $b) ? (string) $b['type'] : ($existingPayload['subType'] ?? $row['type']);
        if (!in_array($type, self::ALLOWED_TYPES, true)) {
            return Http::error($res, 'Invalid hotspot type', 422);
        }

        $x = array_key_exists('x', $b) ? max(0.0, min(98.0, (float) $b['x'])) : (float) $row['x'];
        $y = array_key_exists('y', $b) ? max(0.0, min(98.0, (float) $b['y'])) : (float) $row['y'];
        $w = array_key_exists('w', $b) ? max(2.0, min(100.0, (float) $b['w'])) : (float) $row['w'];
        $h = array_key_exists('h', $b) ? max(2.0, min(100.0, (float) $b['h'])) : (float) $row['h'];
        $page = array_key_exists('pageNumber', $b) ? max(1, (int) $b['pageNumber']) : (int) $row['page_number'];

        $payloadArr = array_key_exists('payload', $b) && is_array($b['payload']) ? $b['payload'] : $existingPayload;
        $payloadArr['subType'] = $type;
        $payloadJson = json_encode($payloadArr);
        $dbType = in_array($type, ['link', 'video', 'audio', 'image'], true) ? $type : 'link';

        try {
            Db::run(
                'UPDATE hotspots SET page_number = ?, type = ?, x = ?, y = ?, w = ?, h = ?, payload = ? WHERE id = ? AND flipbook_id = ?',
                [$page, $type, $x, $y, $w, $h, $payloadJson, $hid, $f['id']]
            );
        } catch (\Throwable) {
            Db::run(
                'UPDATE hotspots SET page_number = ?, type = ?, x = ?, y = ?, w = ?, h = ?, payload = ? WHERE id = ? AND flipbook_id = ?',
                [$page, $dbType, $x, $y, $w, $h, $payloadJson, $hid, $f['id']]
            );
        }
        $updated = Db::one('SELECT * FROM hotspots WHERE id = ?', [$hid]);

        Audit::log('hotspot.update', 'hotspot', $hid, ['flipbook_id' => $f['id'], 'type' => $type]);

        return Http::json($res, $this->present($updated));
    }

    public function delete(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'hotspot.manage');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        $hid = (int) $args['hid'];
        Db::run('DELETE FROM hotspots WHERE id = ? AND flipbook_id = ?', [$hid, $f['id']]);

        Audit::log('hotspot.delete', 'hotspot', $hid, ['flipbook_id' => $f['id']]);

        return Http::json($res, ['ok' => true]);
    }

    private function owned(Request $req, int $id): ?array
    {
        $f = Db::one('SELECT * FROM flipbooks WHERE id = ?', [$id]);
        if (!$f || !TenantContext::canAccessFlipbook($f)) {
            return null;
        }
        return $f;
    }

    private function present(array $h): array
    {
        $payload = json_decode($h['payload'] ?: '{}', true) ?: [];
        $effectiveType = !empty($payload['subType']) ? (string) $payload['subType'] : (string) $h['type'];
        return [
            'id' => (int) $h['id'],
            'flipbookId' => (int) $h['flipbook_id'],
            'pageNumber' => (int) $h['page_number'],
            'type' => $effectiveType,
            'x' => round((float) $h['x'], 2),
            'y' => round((float) $h['y'], 2),
            'w' => round((float) $h['w'], 2),
            'h' => round((float) $h['h'], 2),
            'payload' => $payload,
        ];
    }
}
