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

        $b = (array) $req->getParsedBody();
        $page = (int) ($b['pageNumber'] ?? 1);
        $type = (string) ($b['type'] ?? 'link');
        $x = (float) ($b['x'] ?? 10);
        $y = (float) ($b['y'] ?? 10);
        $w = (float) ($b['w'] ?? 20);
        $h = (float) ($b['h'] ?? 10);
        $payload = is_array($b['payload'] ?? null) ? $b['payload'] : ['url' => (string)($b['payload'] ?? '')];

        if (!in_array($type, ['link', 'video', 'audio', 'image'], true)) {
            return Http::error($res, 'Invalid hotspot type', 422);
        }

        Db::run(
            'INSERT INTO hotspots (flipbook_id, page_number, type, x, y, w, h, payload)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$f['id'], $page, $type, $x, $y, $w, $h, json_encode($payload)]
        );
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

        $hid = (int) $args['hid'];
        $row = Db::one('SELECT * FROM hotspots WHERE id = ? AND flipbook_id = ?', [$hid, $f['id']]);
        if (!$row) return Http::error($res, 'Hotspot not found', 404);

        $b = (array) $req->getParsedBody();
        $type = array_key_exists('type', $b) ? (string) $b['type'] : $row['type'];
        $x = array_key_exists('x', $b) ? (float) $b['x'] : (float) $row['x'];
        $y = array_key_exists('y', $b) ? (float) $b['y'] : (float) $row['y'];
        $w = array_key_exists('w', $b) ? (float) $b['w'] : (float) $row['w'];
        $h = array_key_exists('h', $b) ? (float) $b['h'] : (float) $row['h'];
        $payload = array_key_exists('payload', $b) ? json_encode($b['payload']) : $row['payload'];

        Db::run(
            'UPDATE hotspots SET type = ?, x = ?, y = ?, w = ?, h = ?, payload = ? WHERE id = ?',
            [$type, $x, $y, $w, $h, $payload, $hid]
        );
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
        return [
            'id' => (int) $h['id'],
            'flipbookId' => (int) $h['flipbook_id'],
            'pageNumber' => (int) $h['page_number'],
            'type' => $h['type'],
            'x' => (float) $h['x'],
            'y' => (float) $h['y'],
            'w' => (float) $h['w'],
            'h' => (float) $h['h'],
            'payload' => json_decode($h['payload'] ?: '{}', true),
        ];
    }
}
