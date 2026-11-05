<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Db;
use App\Support\Http;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Stream;

/** Unauthenticated reader endpoints. */
final class PublicController
{
    public function show(Request $req, Response $res, array $args): Response
    {
        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? AND published_at IS NOT NULL AND status = "ready"', [$args['slug']]);
        if (!$f) return Http::error($res, 'Not found', 404);

        $settings = $f['settings'] ? json_decode($f['settings'], true) : [];
        $meta = [
            'id' => (int) $f['id'],
            'title' => $f['title'],
            'description' => $f['description'],
            'slug' => $f['slug'],
            'settings' => $settings,
            'allowDownload' => !empty($settings['allowDownload']),
        ];

        if ($f['visibility'] === 'password' && !$this->unlocked($req, $f)) {
            return Http::json($res, $meta + ['locked' => true]);
        }

        $pages = Db::all(
            'SELECT page_number, image_path, thumb_path, width, height
             FROM pages WHERE flipbook_id = ? ORDER BY page_number',
            [$f['id']]
        );

        $hotspots = Db::all(
            'SELECT id, page_number, type, x, y, w, h, payload
             FROM hotspots WHERE flipbook_id = ? ORDER BY page_number, id',
            [$f['id']]
        );

        $hotspotsByPage = [];
        foreach ($hotspots as $h) {
            $pNum = (int) $h['page_number'];
            $hotspotsByPage[$pNum][] = [
                'id' => (int) $h['id'],
                'type' => $h['type'],
                'x' => (float) $h['x'],
                'y' => (float) $h['y'],
                'w' => (float) $h['w'],
                'h' => (float) $h['h'],
                'payload' => json_decode($h['payload'] ?: '{}', true),
            ];
        }

        return Http::json($res, $meta + [
            'locked' => false,
            'pages' => array_map(fn($p) => [
                'n' => (int) $p['page_number'],
                'image' => "/api/v1/public/{$f['slug']}/pages/{$p['page_number']}",
                'thumb' => "/api/v1/public/{$f['slug']}/thumbs/{$p['page_number']}",
                'w' => (int) $p['width'],
                'h' => (int) $p['height'],
            ], $pages),
            'hotspots' => (object) $hotspotsByPage,
        ]);
    }

    public function page(Request $req, Response $res, array $args): Response
    {
        return $this->serveAsset($req, $res, (string) $args['slug'], (int) $args['page'], false);
    }

    public function thumb(Request $req, Response $res, array $args): Response
    {
        return $this->serveAsset($req, $res, (string) $args['slug'], (int) $args['page'], true);
    }

    private function serveAsset(Request $req, Response $res, string $slug, int $pageNumber, bool $isThumb): Response
    {
        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? AND status = "ready"', [$slug]);
        if (!$f) return Http::error($res, 'Not found', 404);

        if ($f['visibility'] === 'password' && !$this->unlocked($req, $f)) {
            return Http::error($res, 'Password required', 403);
        }

        $p = Db::one('SELECT * FROM pages WHERE flipbook_id = ? AND page_number = ?', [$f['id'], $pageNumber]);
        if (!$p) return Http::error($res, 'Page not found', 404);

        $rel = $isThumb ? $p['thumb_path'] : $p['image_path'];
        $path = \App\Support\Storage::root() . '/' . $rel;
        if (!file_exists($path)) {
            $tenantId = !empty($f['tenant_id']) ? (int) $f['tenant_id'] : 1;
            $altRel = $isThumb
                ? "tenants/{$tenantId}/publications/{$f['id']}/thumbs/" . basename($rel)
                : "tenants/{$tenantId}/publications/{$f['id']}/" . basename($rel);
            $altPath = \App\Support\Storage::root() . '/' . $altRel;
            if (file_exists($altPath)) {
                $path = $altPath;
            } else {
                $altPublic = $isThumb
                    ? "public/flipbooks/{$f['id']}/thumbs/" . basename($rel)
                    : "public/flipbooks/{$f['id']}/" . basename($rel);
                $altPublicPath = \App\Support\Storage::root() . '/' . $altPublic;
                if (file_exists($altPublicPath)) {
                    $path = $altPublicPath;
                } else {
                    return Http::error($res, 'Asset file not found', 404);
                }
            }
        }

        $fh = fopen($path, 'rb');
        $stream = new Stream($fh);

        return $res
            ->withHeader('Content-Type', 'image/jpeg')
            ->withHeader('Cache-Control', 'private, max-age=86400')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Length', (string) filesize($path))
            ->withBody($stream);
    }

    public function unlock(Request $req, Response $res, array $args): Response
    {
        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? AND published_at IS NOT NULL AND visibility = "password"', [$args['slug']]);
        $pw = (string) (((array) $req->getParsedBody())['password'] ?? '');
        if (!$f || !password_verify($pw, $f['password_hash'])) return Http::error($res, 'Incorrect password', 403);
        return Http::json($res, ['unlockToken' => $this->token($f)]);
    }

    public function trackView(Request $req, Response $res, array $args): Response
    {
        $f = Db::one('SELECT id FROM flipbooks WHERE slug = ? AND published_at IS NOT NULL', [$args['slug']]);
        if (!$f) return Http::error($res, 'Not found', 404);

        $server = $req->getServerParams();
        $ip = $server['REMOTE_ADDR'] ?? '127.0.0.1';
        $ua = $req->getHeaderLine('User-Agent');
        $visitorHash = hash('sha256', $ip . '|' . $ua . '|' . date('Y-m-d'));

        $device = 'desktop';
        if (preg_match('/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i', $ua)) {
            $device = 'tablet';
        } elseif (preg_match('/(mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop)/i', $ua)) {
            $device = 'mobile';
        }

        $referrer = substr(trim($req->getHeaderLine('Referer')), 0, 255);
        if (str_contains($referrer, 'localhost') || str_contains($referrer, '127.0.0.1')) {
            $referrer = 'Direct';
        }

        // Avoid logging rapid reloads from the same visitor within the same hour
        $recent = Db::one(
            'SELECT id FROM views WHERE flipbook_id = ? AND visitor_hash = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)',
            [$f['id'], $visitorHash]
        );

        if (!$recent) {
            Db::run(
                'INSERT INTO views (flipbook_id, visitor_hash, country, device, referrer) VALUES (?, ?, ?, ?, ?)',
                [$f['id'], $visitorHash, null, $device, $referrer]
            );
        }

        return Http::json($res, ['recorded' => true]);
    }

    public function download(Request $req, Response $res, array $args): Response
    {
        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? AND published_at IS NOT NULL AND status = "ready"', [$args['slug']]);
        if (!$f) return Http::error($res, 'Not found', 404);

        $settings = $f['settings'] ? json_decode($f['settings'], true) : [];
        if (empty($settings['allowDownload'])) {
            return Http::error($res, 'Downloads disabled by owner', 403);
        }

        if ($f['visibility'] === 'password' && !$this->unlocked($req, $f)) {
            return Http::error($res, 'Password required', 403);
        }

        $pdfPath = FlipbookController::storageRoot() . '/' . $f['source_pdf_path'];
        if (!file_exists($pdfPath)) return Http::error($res, 'PDF file not available', 404);

        $fh = fopen($pdfPath, 'rb');
        $stream = new Stream($fh);
        $cleanTitle = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $f['title']) ?: 'flipbook';

        return $res
            ->withHeader('Content-Type', 'application/pdf')
            ->withHeader('Content-Disposition', 'attachment; filename="' . $cleanTitle . '.pdf"')
            ->withHeader('Content-Length', (string) filesize($pdfPath))
            ->withBody($stream);
    }

    private function token(array $f): string
    {
        return hash_hmac('sha256', $f['id'] . '|' . $f['password_hash'], $_ENV['JWT_SECRET']);
    }

    private function unlocked(Request $req, array $f): bool
    {
        $header = $req->getHeaderLine('X-Unlock-Token');
        $query = (string) ($req->getQueryParams()['token'] ?? '');
        $token = $header ?: $query;
        return $token !== '' && hash_equals($this->token($f), $token);
    }
}
