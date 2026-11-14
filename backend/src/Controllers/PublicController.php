<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Infrastructure\Logging\JsonLogger;
use App\Support\CryptoSecrets;
use App\Support\Db;
use App\Support\Http;
use App\Support\PublicationLedger;
use App\Support\Storage;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Stream;
use Throwable;

/** Unauthenticated reader & signed draft-preview endpoints. */
final class PublicController
{
    /** Default password-protected publication unlock session TTL: 30 minutes (1800 seconds). */
    private const UNLOCK_TTL_SECONDS = 1800;

    private static bool $unlockSchemaEnsured = false;
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

        if (empty($toc)) {
            // Generate compact TOC fallback on server using first line of text from first 20 pages or compact headings
            $tocHeads = Db::all(
                'SELECT page_number, SUBSTRING(text_content, 1, 140) as head_text FROM pages WHERE flipbook_id = ? ORDER BY page_number ASC LIMIT 25',
                [$f['id']]
            );
            $toc = [];
            foreach ($tocHeads as $th) {
                $firstLine = '';
                if (!empty($th['head_text'])) {
                    $lines = explode("\n", (string) $th['head_text']);
                    foreach ($lines as $l) {
                        $trimmed = trim($l);
                        if (strlen($trimmed) >= 4 && strlen($trimmed) <= 65) {
                            $firstLine = $trimmed;
                            break;
                        }
                    }
                }
                $toc[] = [
                    'page' => (int) $th['page_number'],
                    'title' => $firstLine !== '' ? "Page {$th['page_number']}: {$firstLine}" : "Page {$th['page_number']}",
                    'level' => 1,
                ];
            }
        }

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

        // Lightweight page manifest: excludes heavy text_content (full-text search uses dedicated search endpoint)
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
            $decodedPayload = json_decode($h['payload'] ?: '{}', true) ?: [];
            $effectiveType = !empty($decodedPayload['subType']) ? (string) $decodedPayload['subType'] : (string) $h['type'];
            $hotspotsByPage[$pNum][] = [
                'id' => (int) $h['id'],
                'type' => $effectiveType,
                'x' => (float) $h['x'],
                'y' => (float) $h['y'],
                'w' => (float) $h['w'],
                'h' => (float) $h['h'],
                'payload' => $decodedPayload,
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
                'imageHigh' => "/api/v1/public/{$f['slug']}/pages/{$p['page_number']}?res=high" . ($p['webp_path'] ? "&format=webp{$previewAmp}" : $previewAmp),
                'webp' => $p['webp_path'] ? "/api/v1/public/{$f['slug']}/pages/{$p['page_number']}?format=webp{$previewAmp}" : null,
                'avif' => !empty($p['avif_path']) ? "/api/v1/public/{$f['slug']}/pages/{$p['page_number']}?format=avif{$previewAmp}" : null,
                'thumb' => "/api/v1/public/{$f['slug']}/thumbs/{$p['page_number']}" . ($p['webp_path'] ? "?format=webp{$previewAmp}" : $previewQuery),
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

    /**
     * Dedicated Cover Page endpoint (Page 1) for social media link preview cards (WhatsApp, Facebook, Twitter, iMessage)
     */
    public function cover(Request $req, Response $res, array $args): Response
    {
        return $this->serveAsset($req, $res, (string) $args['slug'], 1, false);
    }

    /**
     * Server-side rendered HTML reader shell with dynamic OpenGraph, Twitter Card & oEmbed metadata.
     * Generates rich cover page image, publication title, and disclaimer preview when sharing links.
     */
    public function renderViewerHtml(Request $req, Response $res, array $args): Response
    {
        $slug = (string) ($args['slug'] ?? '');
        $previewToken = $this->extractPreviewToken($req);
        $isPreview = Storage::verifyPreviewToken($slug, $previewToken);

        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? LIMIT 1', [$slug]);

        // Fallback to static SPA bundle if publication not found
        $htmlPath = realpath(__DIR__ . '/../../../frontend/dist/index.html');
        if (!$htmlPath || !file_exists($htmlPath)) {
            $htmlPath = realpath(__DIR__ . '/../../../frontend/index.html');
        }

        $html = ($htmlPath && file_exists($htmlPath))
            ? file_get_contents($htmlPath)
            : '<!doctype html><html><head><meta charset="utf-8"><title>Nuvis Flipex</title></head><body><div id="root"></div></body></html>';

        if (!$f) {
            $res->getBody()->write($html);
            return $res->withHeader('Content-Type', 'text/html; charset=utf-8');
        }

        // Determine Base URL (works with reverse proxy, cPanel, HTTPS)
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
            (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https') ? 'https' : 'http';
        $baseUrl = !empty($_SERVER['HTTP_HOST'])
            ? "{$scheme}://{$_SERVER['HTTP_HOST']}"
            : rtrim($_ENV['APP_URL'] ?? 'http://localhost:5173', '/');

        $queryParams = $req->getQueryParams();
        $requestedPage = isset($queryParams['page']) ? max(1, (int) $queryParams['page']) : 1;

        $settings = !empty($f['settings']) ? json_decode((string) $f['settings'], true) : [];
        $seoMeta = !empty($f['seo_meta']) ? json_decode((string) $f['seo_meta'], true) : [];

        // Title Extraction
        $title = !empty($seoMeta['title'])
            ? trim((string) $seoMeta['title'])
            : (!empty($f['title']) ? trim((string) $f['title']) : 'Digital Publication');

        // Description / Disclaimer Extraction (Matches Heyzine catalog style)
        $desc = '';
        if (!empty($seoMeta['description'])) {
            $desc = trim((string) $seoMeta['description']);
        } elseif (!empty($settings['disclaimerText'])) {
            $discTitle = !empty($settings['disclaimerTitle']) ? trim((string) $settings['disclaimerTitle']) : 'Disclaimer';
            $desc = $discTitle . "\n\n" . trim((string) $settings['disclaimerText']);
        } elseif (!empty($f['description'])) {
            $desc = trim((string) $f['description']);
        } elseif (!empty($settings['catalogueSubtitle'])) {
            $desc = trim((string) $settings['catalogueSubtitle']);
        } else {
            // First page text excerpt if available
            $p1 = Db::one('SELECT text_content FROM pages WHERE flipbook_id = ? ORDER BY page_number ASC LIMIT 1', [$f['id']]);
            if (!empty($p1['text_content'])) {
                $desc = mb_substr(preg_replace('/\s+/', ' ', trim((string) $p1['text_content'])), 0, 260);
            }
        }
        if ($desc === '') {
            $company = !empty($settings['companyName']) ? $settings['companyName'] : 'Nuvis Flipex';
            $desc = "View {$title} interactive 3D digital publication online powered by {$company}.";
        }

        // Target page image & dimensions
        $pRow = Db::one(
            'SELECT width, height FROM pages WHERE flipbook_id = ? AND page_number = ? LIMIT 1',
            [$f['id'], $requestedPage]
        );
        if (!$pRow) {
            $pRow = Db::one('SELECT width, height FROM pages WHERE flipbook_id = ? ORDER BY page_number ASC LIMIT 1', [$f['id']]);
        }
        $imgWidth = !empty($pRow['width']) ? (int) $pRow['width'] : 1200;
        $imgHeight = !empty($pRow['height']) ? (int) $pRow['height'] : 1600;

        $pageUrl = $requestedPage > 1 ? "{$baseUrl}/v/{$slug}?page={$requestedPage}" : "{$baseUrl}/v/{$slug}";

        // Image URL for OpenGraph and Twitter cards
        if (!empty($seoMeta['ogImage'])) {
            $coverImageUrl = (string) $seoMeta['ogImage'];
        } elseif ($requestedPage > 1) {
            $coverImageUrl = "{$baseUrl}/api/v1/public/{$slug}/pages/{$requestedPage}?res=standard";
        } else {
            $coverImageUrl = "{$baseUrl}/api/v1/public/{$slug}/cover";
        }

        if ($previewToken) {
            $coverImageUrl .= (str_contains($coverImageUrl, '?') ? '&' : '?') . 'preview=' . urlencode($previewToken);
            $title = "[Draft Preview] " . $title;
        }

        $oembedUrl = "{$baseUrl}/api/v1/oembed?url=" . urlencode($pageUrl);

        $escTitle = htmlspecialchars($title, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $escDesc = htmlspecialchars($desc, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $escCover = htmlspecialchars($coverImageUrl, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $escPageUrl = htmlspecialchars($pageUrl, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $escOembed = htmlspecialchars($oembedUrl, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        $metaTags = <<<HTML
    <title>{$escTitle} | Nuvis Flipex</title>
    <meta name="description" content="{$escDesc}" />

    <!-- Open Graph / WhatsApp / Facebook / LinkedIn / iMessage -->
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Nuvis Flipex" />
    <meta property="og:url" content="{$escPageUrl}" />
    <meta property="og:title" content="{$escTitle}" />
    <meta property="og:description" content="{$escDesc}" />
    <meta property="og:image" content="{$escCover}" />
    <meta property="og:image:secure_url" content="{$escCover}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="{$imgWidth}" />
    <meta property="og:image:height" content="{$imgHeight}" />
    <meta property="og:image:alt" content="{$escTitle} Cover Page" />

    <!-- Twitter / X Large Summary Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="{$escPageUrl}" />
    <meta name="twitter:title" content="{$escTitle}" />
    <meta name="twitter:description" content="{$escDesc}" />
    <meta name="twitter:image" content="{$escCover}" />

    <!-- oEmbed Discovery for WhatsApp / Slack / Discord / WordPress -->
    <link rel="alternate" type="application/json+oembed" href="{$escOembed}" title="{$escTitle}" />
HTML;

        // Inject dynamic meta tags into the HTML head
        if (preg_match('#<title>.*?</title>#i', $html)) {
            $html = preg_replace('#<title>.*?</title>#i', $metaTags, $html, 1);
        } else {
            $html = str_replace('</head>', $metaTags . "\n  </head>", $html);
        }

        $res->getBody()->write($html);
        return $res
            ->withHeader('Content-Type', 'text/html; charset=utf-8')
            ->withHeader('Cache-Control', $isPreview ? 'no-cache, private' : 'public, max-age=300');
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
            // Allow Page 1 (Cover Page) to be viewable for link preview cards (WhatsApp / social) even if visibility is password
            if ($pageNumber > 1 && $f['visibility'] === 'password' && !$this->unlocked($req, $f)) {
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
            if ($format === 'webp') {
                $thumbWebp = preg_replace('/\.jpe?g$/i', '.webp', $rel);
                if (file_exists(Storage::root() . '/' . $thumbWebp)) {
                    $rel = $thumbWebp;
                }
            }
        } elseif ($resMode === 'high') {
            $rel = !empty($p['high_res_path']) ? (string) $p['high_res_path'] : "public/flipbooks/{$f['id']}/high/page-" . sprintf('%03d', $pageNumber) . ".jpg";
            if ($format === 'webp') {
                $highWebp = preg_replace('/\.jpe?g$/i', '.webp', $rel);
                if (file_exists(Storage::root() . '/' . $highWebp)) {
                    $rel = $highWebp;
                }
            }
        } elseif ($format === 'webp' && !empty($p['webp_path'])) {
            $rel = (string) $p['webp_path'];
        } elseif ($format === 'avif' && !empty($p['avif_path'])) {
            $rel = (string) $p['avif_path'];
        } else {
            $rel = (string) $p['image_path'];
        }

        $path = Storage::root() . '/' . $rel;
        if (!file_exists($path)) {
            $tenantId = !empty($f['tenant_id']) ? (int) $f['tenant_id'] : null;
            $altRel = $isThumb
                ? ($tenantId ? "tenants/{$tenantId}/publications/{$f['id']}/thumbs/" . basename($rel) : "public/flipbooks/{$f['id']}/thumbs/" . basename($rel))
                : ($tenantId ? "tenants/{$tenantId}/publications/{$f['id']}/" . basename($rel) : "public/flipbooks/{$f['id']}/" . basename($rel));
            $altPath = Storage::root() . '/' . $altRel;

            if (file_exists($altPath)) {
                $path = $altPath;
            } elseif ($resMode === 'high' && !empty($f['source_pdf_path'])) {
                // On-Demand Level 3 High-Resolution Generation for zoomed pages
                $sourcePdf = Storage::root() . '/' . $f['source_pdf_path'];
                if (file_exists($sourcePdf)) {
                    $targetDir = $tenantId
                        ? Storage::root() . "/tenants/{$tenantId}/publications/{$f['id']}"
                        : Storage::root() . "/public/flipbooks/{$f['id']}";
                    $rendered = \App\Support\PdfRenderer::renderSinglePageHighRes($sourcePdf, $targetDir, $pageNumber);
                    if ($rendered && file_exists($rendered)) {
                        $targetExt = ($format === 'webp') ? 'webp' : 'jpg';
                        $candidate = "{$targetDir}/high/page-" . sprintf('%03d', $pageNumber) . ".{$targetExt}";
                        $path = file_exists($candidate) ? $candidate : $rendered;
                    }
                }
            }

            if (!file_exists($path)) {
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

        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $mime = match ($ext) {
            'webp' => 'image/webp',
            'avif' => 'image/avif',
            'png' => 'image/png',
            default => 'image/jpeg',
        };

        $mtime = @filemtime($path) ?: time();
        $fsize = @filesize($path) ?: 0;
        $etag = 'W/"' . substr(sha1($path . ':' . $mtime . ':' . $fsize), 0, 24) . '"';
        $lastMod = gmdate('D, d M Y H:i:s', $mtime) . ' GMT';

        $isProtected = $isPreview || ($f['visibility'] ?? 'public') === 'password';
        $cacheControl = $isProtected
            ? 'private, no-cache'
            : 'public, max-age=31536000, immutable';

        $ifNoneMatch = trim($req->getHeaderLine('If-None-Match'));
        if ($ifNoneMatch !== '' && ($ifNoneMatch === $etag || str_contains($ifNoneMatch, $etag))) {
            return $res
                ->withStatus(304)
                ->withHeader('ETag', $etag)
                ->withHeader('Last-Modified', $lastMod)
                ->withHeader('Cache-Control', $cacheControl);
        }

        $fh = fopen($path, 'rb');
        $stream = new Stream($fh);

        return $res
            ->withHeader('Content-Type', $mime)
            ->withHeader('Cache-Control', $cacheControl)
            ->withHeader('ETag', $etag)
            ->withHeader('Last-Modified', $lastMod)
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Length', (string) $fsize)
            ->withBody($stream);
    }

    public function unlock(Request $req, Response $res, array $args): Response
    {
        self::ensureUnlockRevocationSchema();

        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? AND published_at IS NOT NULL AND visibility = "password"', [$args['slug']]);
        $pw = (string) (((array) $req->getParsedBody())['password'] ?? '');
        if (!$f || !password_verify($pw, (string) $f['password_hash'])) {
            return Http::error($res, 'Incorrect password', 403);
        }

        $cookies = $req->getCookieParams();
        $readerSid = isset($cookies['nvf_reader_sid']) && preg_match('/^[a-f0-9]{32}$/', (string) $cookies['nvf_reader_sid'])
            ? (string) $cookies['nvf_reader_sid']
            : bin2hex(random_bytes(16));

        $expiresAt = time() + self::UNLOCK_TTL_SECONDS;
        $unlockToken = $this->issueUnlockToken($req, $f, $readerSid, $expiresAt);

        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        $secureAttr = $isHttps ? '; Secure' : '';

        $res = $res
            ->withAddedHeader('Set-Cookie', "nvf_reader_sid={$readerSid}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax{$secureAttr}")
            ->withAddedHeader('Set-Cookie', "nvf_unlock_{$f['id']}={$unlockToken}; Path=/; Max-Age=" . self::UNLOCK_TTL_SECONDS . "; HttpOnly; SameSite=Lax{$secureAttr}");

        return Http::json($res, [
            'unlockToken' => $unlockToken,
            'expiresAt' => gmdate('c', $expiresAt),
            'expiresInSeconds' => self::UNLOCK_TTL_SECONDS,
        ]);
    }

    /**
     * Explicit reader session lock / unlock-token revocation (POST /api/v1/public/{slug}/lock).
     */
    public function lock(Request $req, Response $res, array $args): Response
    {
        self::ensureUnlockRevocationSchema();

        $f = Db::one('SELECT id, tenant_id, slug FROM flipbooks WHERE slug = ?', [(string) $args['slug']]);
        if (!$f) {
            return Http::error($res, 'Not found', 404);
        }

        $rawToken = $this->extractUnlockTokenFromCookieOrHeader($req, (int) $f['id']);
        if ($rawToken !== '') {
            $claims = $this->verifyUnlockTokenClaims($rawToken);
            if ($claims && !empty($claims['jti'])) {
                try {
                    Db::run(
                        'INSERT IGNORE INTO revoked_unlock_tokens (jti, flipbook_id, expires_at) VALUES (?, ?, FROM_UNIXTIME(?))',
                        [(string) $claims['jti'], (int) $f['id'], (int) ($claims['exp'] ?? (time() + self::UNLOCK_TTL_SECONDS))]
                    );
                } catch (Throwable) {
                }
                PublicationLedger::tokenRevoked((string) $claims['jti'], 'reader_lock');
            }
        }

        $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
        $secureAttr = $isHttps ? '; Secure' : '';

        $res = $res->withAddedHeader(
            'Set-Cookie',
            "nvf_unlock_{$f['id']}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax{$secureAttr}"
        );

        return Http::json($res, ['locked' => true, 'revoked' => true]);
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
        if (empty($b)) {
            $rawBody = (string) $req->getBody();
            if ($rawBody !== '') {
                $decoded = json_decode($rawBody, true);
                if (is_array($decoded)) {
                    $b = $decoded;
                }
            }
        }
        $server = $req->getServerParams();
        $ip = $server['REMOTE_ADDR'] ?? '127.0.0.1';
        $ua = $req->getHeaderLine('User-Agent');
        $visitorHash = hash('sha256', $ip . '|' . $ua . '|' . date('Y-m-d'));
        $sessionId = substr(trim((string) ($b['sessionId'] ?? $visitorHash)), 0, 64);

        $eventType = (string) ($b['eventType'] ?? 'page_view');
        $allowedTypes = ['page_view', 'link_click', 'video_play', 'product_click', 'download', 'share', 'search'];
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

        $f = Db::one('SELECT * FROM flipbooks WHERE slug = ? AND status = "ready"', [$slug]);
        if (!$f) return Http::error($res, 'Not found', 404);
        if (!$isPreview && ($f['published_at'] === null || ($f['workflow_status'] ?? 'published') !== 'published')) {
            return Http::error($res, 'Not found', 404);
        }
        if (!$isPreview && ($f['visibility'] ?? 'public') === 'password' && !$this->unlocked($req, $f)) {
            return Http::error($res, 'Password required', 403);
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

    public static function ensureUnlockRevocationSchema(): void
    {
        if (self::$unlockSchemaEnsured) {
            return;
        }
        self::$unlockSchemaEnsured = true;
        try {
            Db::pdo()->exec(
                'CREATE TABLE IF NOT EXISTS revoked_unlock_tokens (
                    jti VARCHAR(64) NOT NULL PRIMARY KEY,
                    flipbook_id INT UNSIGNED NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_revoked_unlock_flipbook (flipbook_id),
                    INDEX idx_revoked_unlock_exp (expires_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
            $col = Db::one(
                "SELECT COLUMN_NAME FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flipbooks' AND COLUMN_NAME = 'unlock_revoked_at' LIMIT 1"
            );
            if (!$col) {
                Db::pdo()->exec('ALTER TABLE flipbooks ADD COLUMN unlock_revoked_at TIMESTAMP NULL DEFAULT NULL');
            }
        } catch (Throwable) {
        }
    }

    private function unlockPasswordVersion(array $f): string
    {
        $revokedAt = (string) ($f['unlock_revoked_at'] ?? '');
        return substr(hash('sha256', (string) ($f['password_hash'] ?? '') . '|' . $revokedAt), 0, 16);
    }

    private function computeUnlockSessionBinding(Request $req, string $readerSid = ''): string
    {
        $ua = substr(trim($req->getHeaderLine('User-Agent')), 0, 180);
        // If cookie readerSid is present, bind to UA + readerSid; if stateless header client, bind to UA
        return substr(hash('sha256', $ua . '|' . $readerSid), 0, 20);
    }

    private function issueUnlockToken(Request $req, array $f, string $readerSid, int $expiresAt): string
    {
        $claims = [
            'fid' => (int) $f['id'],
            'iat' => time(),
            'exp' => $expiresAt,
            'jti' => bin2hex(random_bytes(8)),
            'sbh' => $this->computeUnlockSessionBinding($req, $readerSid),
            'uab' => $this->computeUnlockSessionBinding($req, ''),
            'v'   => $this->unlockPasswordVersion($f),
        ];

        $b64 = rtrim(strtr(base64_encode(json_encode($claims)), '+/', '-_'), '=');
        $sig = hash_hmac('sha256', $b64, CryptoSecrets::unlockTokenSecret());
        PublicationLedger::tokenIssued(
            (int) ($f['tenant_id'] ?? 0),
            (int) $f['id'],
            (string) $claims['jti'],
            $expiresAt,
            'unlock',
            $req->getServerParams()['REMOTE_ADDR'] ?? null,
            $req->getHeaderLine('User-Agent')
        );
        return $b64 . '.' . $sig;
    }

    private function extractUnlockTokenFromCookieOrHeader(Request $req, int $flipbookId): string
    {
        // Reject URL query string tokens (?token=...) so unlock tokens never leak in URLs, logs, or Referer headers
        $queryParams = $req->getQueryParams();
        if (!empty($queryParams['token'])) {
            JsonLogger::warning('Rejected attempt to pass publication unlock token in URL query string', [
                'event' => 'unlock_token.url_query_rejected',
                'flipbook_id' => $flipbookId,
            ]);
        }

        $cookies = $req->getCookieParams();
        $cookieKey = 'nvf_unlock_' . $flipbookId;
        if (!empty($cookies[$cookieKey]) && is_string($cookies[$cookieKey])) {
            return trim($cookies[$cookieKey]);
        }

        $header = trim($req->getHeaderLine('X-Unlock-Token'));
        if ($header !== '') {
            return $header;
        }

        return '';
    }

    private function verifyUnlockTokenClaims(string $rawToken): ?array
    {
        if (!str_contains($rawToken, '.')) {
            return null;
        }
        [$b64, $sig] = explode('.', $rawToken, 2);
        if ($b64 === '' || $sig === '') {
            return null;
        }

        $primaryExpected = hash_hmac('sha256', $b64, CryptoSecrets::unlockTokenSecret());
        $validSig = hash_equals($primaryExpected, $sig);

        if (!$validSig) {
            $prevSecret = CryptoSecrets::previousUnlockTokenSecret();
            if ($prevSecret !== null) {
                $prevExpected = hash_hmac('sha256', $b64, $prevSecret);
                $validSig = hash_equals($prevExpected, $sig);
            }
        }

        if (!$validSig) {
            return null;
        }

        $decoded = base64_decode(strtr($b64, '-_', '+/'), true);
        if ($decoded === false) {
            return null;
        }
        $claims = json_decode($decoded, true);
        return is_array($claims) ? $claims : null;
    }

    private function unlocked(Request $req, array $f): bool
    {
        self::ensureUnlockRevocationSchema();

        $flipbookId = (int) $f['id'];
        $rawToken = $this->extractUnlockTokenFromCookieOrHeader($req, $flipbookId);
        if ($rawToken === '') {
            return false;
        }

        $claims = $this->verifyUnlockTokenClaims($rawToken);
        if (!$claims) {
            return false;
        }

        // 1. Verify publication ID match
        if ((int) ($claims['fid'] ?? 0) !== $flipbookId) {
            return false;
        }

        // 2. Verify expiration timestamp (30-minute TTL)
        $exp = (int) ($claims['exp'] ?? 0);
        if ($exp <= 0 || $exp < time()) {
            return false;
        }

        // 3. Verify password hash & publication-level revocation version
        $expectedVer = $this->unlockPasswordVersion($f);
        if (!isset($claims['v']) || !hash_equals($expectedVer, (string) $claims['v'])) {
            return false;
        }

        // 4. Verify session / client binding
        $cookies = $req->getCookieParams();
        $readerSid = isset($cookies['nvf_reader_sid']) ? (string) $cookies['nvf_reader_sid'] : '';
        $expectedSbh = $this->computeUnlockSessionBinding($req, $readerSid);
        $expectedUab = $this->computeUnlockSessionBinding($req, '');
        $claimSbh = (string) ($claims['sbh'] ?? '');
        $claimUab = (string) ($claims['uab'] ?? '');

        $bindingValid = ($claimSbh !== '' && hash_equals($expectedSbh, $claimSbh))
            || ($readerSid === '' && $claimUab !== '' && hash_equals($expectedUab, $claimUab));
        if (!$bindingValid) {
            return false;
        }

        // 5. Check explicit token revocation list (jti)
        $jti = (string) ($claims['jti'] ?? '');
        if ($jti === '') {
            return false;
        }
        try {
            $revoked = Db::one('SELECT jti FROM revoked_unlock_tokens WHERE jti = ? LIMIT 1', [$jti]);
            if ($revoked) {
                return false;
            }
        } catch (Throwable) {
        }

        return true;
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
