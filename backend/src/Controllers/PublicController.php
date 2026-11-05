<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Db;
use App\Support\Http;
use App\Support\Storage;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Stream;
use Throwable;

/** Unauthenticated reader & signed draft-preview endpoints. */
final class PublicController
{
    public function show(Request $req, Response $res, array $args): Response
    {
        $this->tickScheduledLifecycle();

        $slug = (string) $args['slug'];
        $previewToken = $this->extractPreviewToken($req);
        $isPreview = Storage::verifyPreviewToken($slug, $previewToken);

        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? AND status = "ready"', [$slug]);
        if (!$f) {
            return Http::error($res, 'Not found', 404);
        }

        if (!$isPreview) {
            $wf = $f['workflow_status'] ?? ($f['published_at'] !== null ? 'published' : 'draft');
            if ($wf === 'scheduled' && !empty($f['scheduled_at']) && strtotime((string) $f['scheduled_at']) > time()) {
                return Http::error($res, 'This publication is scheduled for future release.', 403, [
                    'lifecycleState' => 'scheduled',
                    'scheduledAt' => $f['scheduled_at'],
                    'title' => $f['title'],
                ]);
            }
            if ($wf === 'archived' || (!empty($f['expires_at']) && strtotime((string) $f['expires_at']) <= time())) {
                return Http::error($res, 'This publication has expired or been archived.', 410, [
                    'lifecycleState' => 'expired',
                    'expiresAt' => $f['expires_at'],
                    'title' => $f['title'],
                ]);
            }
            if ($f['published_at'] === null || $wf !== 'published') {
                return Http::error($res, 'Not found', 404);
            }
        }

        $settings = $f['settings'] ? json_decode((string) $f['settings'], true) : [];
        $seoMeta = !empty($f['seo_meta']) ? json_decode((string) $f['seo_meta'], true) : [];
        $pdfMetadata = !empty($f['pdf_metadata']) ? json_decode((string) $f['pdf_metadata'], true) : [];

        $meta = [
            'id' => (int) $f['id'],
            'title' => $f['title'],
            'description' => $f['description'],
            'slug' => $f['slug'],
            'version' => (int) ($f['version'] ?? 1),
            'workflowStatus' => $f['workflow_status'] ?? 'published',
            'isPreview' => $isPreview,
            'settings' => $settings,
            'seoMeta' => $seoMeta,
            'pdfMetadata' => $pdfMetadata,
            'allowDownload' => !empty($settings['allowDownload']),
        ];

        if (!$isPreview && $f['visibility'] === 'password' && !$this->unlocked($req, $f)) {
            return Http::json($res, $meta + ['locked' => true]);
        }

        $pages = Db::all(
            'SELECT page_number, image_path, high_res_path, webp_path, avif_path, thumb_path, width, height
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

        $previewQuery = $isPreview ? '?preview=' . rawurlencode((string) $previewToken) : '';
        $previewAmp = $isPreview ? '&preview=' . rawurlencode((string) $previewToken) : '';

        return Http::json($res, $meta + [
            'locked' => false,
            'pages' => array_map(fn($p) => [
                'n' => (int) $p['page_number'],
                'image' => "/api/v1/public/{$f['slug']}/pages/{$p['page_number']}" . ($p['webp_path'] ? "?format=webp{$previewAmp}" : $previewQuery),
                'imageJpg' => "/api/v1/public/{$f['slug']}/pages/{$p['page_number']}{$previewQuery}",
                'imageHigh' => "/api/v1/public/{$f['slug']}/pages/{$p['page_number']}?res=high{$previewAmp}",
                'webp' => $p['webp_path'] ? "/api/v1/public/{$f['slug']}/pages/{$p['page_number']}?format=webp{$previewAmp}" : null,
                'thumb' => "/api/v1/public/{$f['slug']}/thumbs/{$p['page_number']}{$previewQuery}",
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
        $previewToken = $this->extractPreviewToken($req);
        $isPreview = Storage::verifyPreviewToken($slug, $previewToken);

        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? AND status = "ready"', [$slug]);
        if (!$f) return Http::error($res, 'Not found', 404);

        if (!$isPreview) {
            $wf = $f['workflow_status'] ?? ($f['published_at'] !== null ? 'published' : 'draft');
            if ($f['published_at'] === null || $wf !== 'published') {
                return Http::error($res, 'Not found', 404);
            }
            if (!empty($f['expires_at']) && strtotime((string) $f['expires_at']) <= time()) {
                return Http::error($res, 'Publication expired', 410);
            }
            if ($f['visibility'] === 'password' && !$this->unlocked($req, $f)) {
                return Http::error($res, 'Password required', 403);
            }
        }

        $p = Db::one('SELECT * FROM pages WHERE flipbook_id = ? AND page_number = ?', [$f['id'], $pageNumber]);
        if (!$p) return Http::error($res, 'Page not found', 404);

        $params = $req->getQueryParams();
        $resMode = strtolower((string) ($params['res'] ?? 'standard'));
        $format = strtolower((string) ($params['format'] ?? ''));

        if ($isThumb) {
            $rel = (string) $p['thumb_path'];
        } elseif ($resMode === 'high' && !empty($p['high_res_path'])) {
            $rel = (string) $p['high_res_path'];
        } elseif ($format === 'webp' && !empty($p['webp_path'])) {
            $rel = (string) $p['webp_path'];
        } elseif ($format === 'avif' && !empty($p['avif_path'])) {
            $rel = (string) $p['avif_path'];
        } else {
            $rel = (string) $p['image_path'];
        }

        $path = Storage::root() . '/' . $rel;
        if (!file_exists($path)) {
            $tenantId = !empty($f['tenant_id']) ? (int) $f['tenant_id'] : 1;
            $altRel = $isThumb
                ? "tenants/{$tenantId}/publications/{$f['id']}/thumbs/" . basename($rel)
                : "tenants/{$tenantId}/publications/{$f['id']}/" . basename($rel);
            $altPath = Storage::root() . '/' . $altRel;
            if (file_exists($altPath)) {
                $path = $altPath;
            } else {
                // Fallback to standard image_path if high_res or webp is missing
                $fallbackRel = $isThumb ? (string) $p['thumb_path'] : (string) $p['image_path'];
                $fallbackPath = Storage::root() . '/' . $fallbackRel;
                if (file_exists($fallbackPath)) {
                    $path = $fallbackPath;
                } else {
                    $altPublic = $isThumb
                        ? "public/flipbooks/{$f['id']}/thumbs/" . basename($fallbackRel)
                        : "public/flipbooks/{$f['id']}/" . basename($fallbackRel);
                    $altPublicPath = Storage::root() . '/' . $altPublic;
                    if (file_exists($altPublicPath)) {
                        $path = $altPublicPath;
                    } else {
                        return Http::error($res, 'Asset file not found', 404);
                    }
                }
            }
        }

        $fh = fopen($path, 'rb');
        $stream = new Stream($fh);

        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'webp' => 'image/webp',
            'avif' => 'image/avif',
            'png' => 'image/png',
            default => 'image/jpeg',
        };

        return $res
            ->withHeader('Content-Type', $mime)
            ->withHeader('Cache-Control', $isPreview ? 'private, no-cache' : 'private, max-age=86400')
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
        $slug = (string) $args['slug'];
        $previewToken = $this->extractPreviewToken($req);
        $isPreview = Storage::verifyPreviewToken($slug, $previewToken);

        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? AND status = "ready"', [$slug]);
        if (!$f) return Http::error($res, 'Not found', 404);
        if (!$isPreview && ($f['published_at'] === null || ($f['workflow_status'] ?? 'published') !== 'published')) {
            return Http::error($res, 'Not found', 404);
        }

        $settings = $f['settings'] ? json_decode((string) $f['settings'], true) : [];
        if (empty($settings['allowDownload']) && !$isPreview) {
            return Http::error($res, 'Downloads disabled by owner', 403);
        }

        if (!$isPreview && $f['visibility'] === 'password' && !$this->unlocked($req, $f)) {
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

    private function extractPreviewToken(Request $req): ?string
    {
        $header = $req->getHeaderLine('X-Preview-Token');
        if ($header !== '') return $header;
        $q = $req->getQueryParams()['preview'] ?? null;
        return $q ? (string) $q : null;
    }

    private function tickScheduledLifecycle(): void
    {
        try {
            Db::run(
                "UPDATE flipbooks
                 SET workflow_status = 'published', published_at = COALESCE(published_at, NOW())
                 WHERE workflow_status = 'scheduled' AND status = 'ready' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW()"
            );
            Db::run(
                "UPDATE flipbooks
                 SET workflow_status = 'archived', published_at = NULL
                 WHERE workflow_status IN ('published', 'scheduled') AND expires_at IS NOT NULL AND expires_at <= NOW()"
            );
        } catch (Throwable) {
        }
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
