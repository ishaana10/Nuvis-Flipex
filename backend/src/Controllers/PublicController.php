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
        $toc = !empty($f['toc']) ? json_decode((string) $f['toc'], true) : [];
        $tenantRow = !empty($f['tenant_id']) ? Db::one('SELECT name, slug FROM tenants WHERE id = ?', [$f['tenant_id']]) : null;

        $meta = [
            'id' => (int) $f['id'],
            'title' => $f['title'],
            'description' => $f['description'],
            'slug' => $f['slug'],
            'tenantName' => $tenantRow['name'] ?? null,
            'version' => (int) ($f['version'] ?? 1),
            'workflowStatus' => $f['workflow_status'] ?? 'published',
            'isPreview' => $isPreview,
            'settings' => $settings,
            'seoMeta' => $seoMeta,
            'pdfMetadata' => $pdfMetadata,
            'toc' => $toc,
            'allowDownload' => !empty($settings['allowDownload']),
        ];

        if (!$isPreview && $f['visibility'] === 'password' && !$this->unlocked($req, $f)) {
            return Http::json($res, $meta + ['locked' => true]);
        }

        $pages = Db::all(
            'SELECT page_number, image_path, high_res_path, webp_path, avif_path, thumb_path, width, height, text_content
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
                'text' => $p['text_content'] ?? '',
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
        $f = Db::one('SELECT id, tenant_id, page_count FROM flipbooks WHERE slug = ? AND published_at IS NOT NULL', [$args['slug']]);
        if (!$f) return Http::error($res, 'Not found', 404);

        $body = (array) ($req->getParsedBody() ?: []);
        $server = $req->getServerParams();
        $ip = $server['REMOTE_ADDR'] ?? '127.0.0.1';
        $ua = $req->getHeaderLine('User-Agent');
        $visitorHash = hash('sha256', $ip . '|' . $ua . '|' . date('Y-m-d'));
        $sessionId = substr(trim((string) ($body['sessionId'] ?? $visitorHash)), 0, 64);

        $country = $this->resolveCountry($req, $body);
        $device = $this->resolveDevice($ua);

        $referrer = substr(trim((string) ($body['referrer'] ?? $req->getHeaderLine('Referer'))), 0, 255);
        if ($referrer === '' || str_contains($referrer, 'localhost') || str_contains($referrer, '127.0.0.1')) {
            $referrer = 'Direct';
        }

        $utmSource = !empty($body['utmSource']) ? substr(trim((string) $body['utmSource']), 0, 100) : null;
        $utmMedium = !empty($body['utmMedium']) ? substr(trim((string) $body['utmMedium']), 0, 100) : null;
        $utmCampaign = !empty($body['utmCampaign']) ? substr(trim((string) $body['utmCampaign']), 0, 100) : null;
        $utmTerm = !empty($body['utmTerm']) ? substr(trim((string) $body['utmTerm']), 0, 100) : null;
        $utmContent = !empty($body['utmContent']) ? substr(trim((string) $body['utmContent']), 0, 100) : null;

        $recent = Db::one(
            'SELECT id FROM views WHERE flipbook_id = ? AND visitor_hash = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)',
            [$f['id'], $visitorHash]
        );

        if (!$recent) {
            Db::run(
                'INSERT INTO views (flipbook_id, visitor_hash, session_id, country, device, referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$f['id'], $visitorHash, $sessionId, $country, $device, $referrer, $utmSource, $utmMedium, $utmCampaign, $utmTerm, $utmContent]
            );
        }

        // Also record page 1 initial view event
        Db::run(
            "INSERT INTO analytics_events (tenant_id, flipbook_id, visitor_hash, session_id, event_type, page_number, duration_ms, country, device, utm_source, utm_medium, utm_campaign)
             VALUES (?, ?, ?, ?, 'page_view', 1, 2500, ?, ?, ?, ?, ?)",
            [$f['tenant_id'], $f['id'], $visitorHash, $sessionId, $country, $device, $utmSource, $utmMedium, $utmCampaign]
        );

        return Http::json($res, ['recorded' => true, 'sessionId' => $sessionId]);
    }

    /**
     * Granular reader engagement telemetry: page dwell time, link clicks, video plays, shares, searches.
     */
    public function trackTelemetry(Request $req, Response $res, array $args): Response
    {
        $f = Db::one('SELECT id, tenant_id, page_count FROM flipbooks WHERE slug = ?', [$args['slug']]);
        if (!$f) return Http::error($res, 'Not found', 404);

        $b = (array) ($req->getParsedBody() ?: []);
        $server = $req->getServerParams();
        $ip = $server['REMOTE_ADDR'] ?? '127.0.0.1';
        $ua = $req->getHeaderLine('User-Agent');
        $visitorHash = hash('sha256', $ip . '|' . $ua . '|' . date('Y-m-d'));
        $sessionId = substr(trim((string) ($b['sessionId'] ?? $visitorHash)), 0, 64);

        $eventType = (string) ($b['eventType'] ?? 'page_view');
        $allowedTypes = ['page_view', 'link_click', 'video_play', 'download', 'share', 'search'];
        if (!in_array($eventType, $allowedTypes, true)) {
            $eventType = 'page_view';
        }

        $pageNumber = isset($b['pageNumber']) ? max(1, (int) $b['pageNumber']) : null;
        $durationMs = isset($b['durationMs']) ? max(0, min(600000, (int) $b['durationMs'])) : 0;
        $targetUrl = !empty($b['targetUrl']) ? substr(trim((string) $b['targetUrl']), 0, 500) : null;
        $meta = !empty($b['meta']) && is_array($b['meta']) ? json_encode($b['meta']) : null;
        $country = $this->resolveCountry($req, $b);
        $device = $this->resolveDevice($ua);
        $utmSource = !empty($b['utmSource']) ? substr(trim((string) $b['utmSource']), 0, 100) : null;
        $utmMedium = !empty($b['utmMedium']) ? substr(trim((string) $b['utmMedium']), 0, 100) : null;
        $utmCampaign = !empty($b['utmCampaign']) ? substr(trim((string) $b['utmCampaign']), 0, 100) : null;

        Db::run(
            'INSERT INTO analytics_events
             (tenant_id, flipbook_id, visitor_hash, session_id, event_type, page_number, duration_ms, target_url, meta, country, device, utm_source, utm_medium, utm_campaign)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $f['tenant_id'],
                $f['id'],
                $visitorHash,
                $sessionId,
                $eventType,
                $pageNumber,
                $durationMs,
                $targetUrl,
                $meta,
                $country,
                $device,
                $utmSource,
                $utmMedium,
                $utmCampaign,
            ]
        );

        // Update session-level reading time, max page reached & completion status on views table
        if ($eventType === 'page_view') {
            $addSec = max(1, (int) round($durationMs / 1000));
            $pageNum = $pageNumber ?? 1;
            $totalPages = max(1, (int) $f['page_count']);
            $isCompleted = $pageNum >= $totalPages ? 1 : 0;

            $lastView = Db::one(
                'SELECT id, max_page_reached, completed FROM views WHERE flipbook_id = ? AND visitor_hash = ? ORDER BY id DESC LIMIT 1',
                [$f['id'], $visitorHash]
            );
            if ($lastView) {
                $newMax = max((int) $lastView['max_page_reached'], $pageNum);
                $newComp = ((int) $lastView['completed'] === 1 || $isCompleted === 1 || $newMax >= $totalPages) ? 1 : 0;
                Db::run(
                    'UPDATE views SET duration_seconds = duration_seconds + ?, pages_viewed = pages_viewed + 1, max_page_reached = ?, completed = ? WHERE id = ?',
                    [$addSec, $newMax, $newComp, $lastView['id']]
                );
            }
        }

        return Http::json($res, ['ok' => true]);
    }

    /**
     * Full-text search inside publication pages.
     */
    public function search(Request $req, Response $res, array $args): Response
    {
        $slug = (string) $args['slug'];
        $previewToken = $this->extractPreviewToken($req);
        $isPreview = Storage::verifyPreviewToken($slug, $previewToken);

        $f = Db::one('SELECT id, tenant_id, published_at, workflow_status FROM flipbooks WHERE slug = ? AND status = "ready"', [$slug]);
        if (!$f) return Http::error($res, 'Not found', 404);
        if (!$isPreview && ($f['published_at'] === null || ($f['workflow_status'] ?? 'published') !== 'published')) {
            return Http::error($res, 'Not found', 404);
        }

        $q = trim((string) ($req->getQueryParams()['q'] ?? ''));
        if (mb_strlen($q) < 2) {
            return Http::json($res, ['results' => []]);
        }

        $rows = Db::all(
            'SELECT page_number, text_content FROM pages WHERE flipbook_id = ? AND text_content LIKE ? ORDER BY page_number ASC',
            [$f['id'], '%' . $q . '%']
        );

        $results = [];
        foreach ($rows as $r) {
            $txt = (string) ($r['text_content'] ?? '');
            $pos = mb_stripos($txt, $q);
            $start = max(0, ($pos ?: 0) - 55);
            $snippet = mb_substr($txt, $start, 140);
            if ($start > 0) $snippet = '…' . $snippet;
            if ($start + 140 < mb_strlen($txt)) $snippet .= '…';

            $results[] = [
                'page' => (int) $r['page_number'],
                'snippet' => $snippet,
            ];
        }

        return Http::json($res, ['query' => $q, 'results' => $results]);
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

        // Log download analytics event
        try {
            $server = $req->getServerParams();
            $ip = $server['REMOTE_ADDR'] ?? '127.0.0.1';
            $ua = $req->getHeaderLine('User-Agent');
            $visitorHash = hash('sha256', $ip . '|' . $ua . '|' . date('Y-m-d'));
            Db::run(
                "INSERT INTO analytics_events (tenant_id, flipbook_id, visitor_hash, event_type, country, device)
                 VALUES (?, ?, ?, 'download', ?, ?)",
                [$f['tenant_id'] ?? null, $f['id'], $visitorHash, $this->resolveCountry($req, []), $this->resolveDevice($ua)]
            );
        } catch (Throwable) {
        }

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

    private function resolveDevice(string $ua): string
    {
        if (preg_match('/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i', $ua)) {
            return 'tablet';
        }
        if (preg_match('/(mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop)/i', $ua)) {
            return 'mobile';
        }
        return 'desktop';
    }

    private function resolveCountry(Request $req, array $body = []): string
    {
        if (!empty($body['country']) && preg_match('/^[A-Z]{2}$/i', (string) $body['country'])) {
            return strtoupper((string) $body['country']);
        }
        foreach (['CF-IPCountry', 'X-Country-Code', 'X-Geo-Country'] as $hdr) {
            $val = trim($req->getHeaderLine($hdr));
            if (preg_match('/^[A-Z]{2}$/i', $val) && strtoupper($val) !== 'XX') {
                return strtoupper($val);
            }
        }
        $lang = $req->getHeaderLine('Accept-Language');
        if (preg_match('/[a-z]{2}-([A-Z]{2})/', $lang, $m)) {
            return strtoupper($m[1]);
        }
        return 'FJ'; // Default Nuvis Technologies Fiji region fallback
    }
}
