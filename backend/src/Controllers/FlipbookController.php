<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Rbac;
use App\Support\Storage;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Psr7\Stream;

final class FlipbookController
{
    public function index(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.view');

        $q = trim((string) ($req->getQueryParams()['q'] ?? ''));
        $tenantId = TenantContext::id();

        if ($tenantId !== null) {
            $rows = Db::all(
                'SELECT f.*, (SELECT thumb_path FROM pages p WHERE p.flipbook_id = f.id AND p.page_number = 1) AS cover
                 FROM flipbooks f 
                 WHERE (f.tenant_id = ? OR (f.tenant_id IS NULL AND f.user_id = ?)) AND f.title LIKE ? 
                 ORDER BY f.created_at DESC',
                [$tenantId, $u['id'], '%' . $q . '%']
            );
        } else {
            $rows = Db::all(
                'SELECT f.*, (SELECT thumb_path FROM pages p WHERE p.flipbook_id = f.id AND p.page_number = 1) AS cover
                 FROM flipbooks f WHERE f.user_id = ? AND f.title LIKE ? ORDER BY f.created_at DESC',
                [$u['id'], '%' . $q . '%']
            );
        }

        return Http::json($res, array_map([$this, 'present'], $rows));
    }

    public function create(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.create');

        $tenantId = TenantContext::id();
        $tenant = TenantContext::tenant();
        $plan = Db::one('SELECT * FROM plans WHERE id = ?', [$tenant['plan_id'] ?? $u['plan_id']]);

        $maxAllowed = $tenant ? (int) $tenant['max_flipbooks'] : (int) $plan['max_flipbooks'];
        $countSql = $tenantId !== null ? 'SELECT COUNT(*) c FROM flipbooks WHERE tenant_id = ?' : 'SELECT COUNT(*) c FROM flipbooks WHERE user_id = ?';
        $count = (int) Db::one($countSql, [$tenantId ?? $u['id']])['c'];

        if ($count >= $maxAllowed) {
            return Http::error($res, "Your workspace plan allows a maximum of {$maxAllowed} publications.", 403);
        }

        $file = $req->getUploadedFiles()['file'] ?? null;
        if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
            return Http::error($res, 'Upload failed', 422, ['file' => 'Please choose a PDF']);
        }
        if ($file->getSize() > $plan['max_upload_mb'] * 1048576) {
            return Http::error($res, 'Validation failed', 422, ['file' => "Max file size is {$plan['max_upload_mb']} MB"]);
        }

        $tmp = sys_get_temp_dir() . DIRECTORY_SEPARATOR . bin2hex(random_bytes(8)) . '.pdf';
        $file->moveTo($tmp);
        if (file_get_contents($tmp, false, null, 0, 5) !== '%PDF-') {
            @unlink($tmp);
            return Http::error($res, 'Validation failed', 422, ['file' => 'File is not a valid PDF']);
        }

        $body = (array) $req->getParsedBody();
        $title = trim((string) ($body['title'] ?? '')) ?: pathinfo($file->getClientFilename() ?? 'Untitled', PATHINFO_FILENAME);
        $slug = $this->uniqueSlug($title);

        // Pre-insert to obtain unique ID
        Db::run(
            "INSERT INTO flipbooks (user_id, tenant_id, title, slug, status) VALUES (?, ?, ?, ?, 'uploading')",
            [$u['id'], $tenantId, mb_substr($title, 0, 200), $slug]
        );
        $id = (int) Db::pdo()->lastInsertId();

        // Save into tenant-isolated storage path
        $effectiveTenantId = $tenantId ?? 1;
        $rel = Storage::sourcePdfRel($effectiveTenantId, $id);
        $dest = Storage::root() . '/' . $rel;
        Storage::ensureDir(dirname($dest));
        rename($tmp, $dest);

        Db::run("UPDATE flipbooks SET source_pdf_path = ?, status = 'processing' WHERE id = ?", [$rel, $id]);
        Db::run("INSERT INTO jobs (type, payload) VALUES ('convert_pdf', ?)", [json_encode(['flipbook_id' => $id])]);

        Audit::log('flipbook.create', 'flipbook', $id, ['title' => $title, 'slug' => $slug]);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$id])), 201);
    }

    public function show(Request $req, Response $res, array $args): Response
    {
        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        $out = $this->present($f);
        $out['pages'] = array_map(fn($p) => [
            'n' => (int) $p['page_number'],
            'image' => "/api/v1/flipbooks/{$f['id']}/pages/{$p['page_number']}",
            'thumb' => "/api/v1/flipbooks/{$f['id']}/thumbs/{$p['page_number']}",
            'w' => (int) $p['width'],
            'h' => (int) $p['height'],
        ], Db::all('SELECT * FROM pages WHERE flipbook_id = ? ORDER BY page_number', [$f['id']]));

        return Http::json($res, $out);
    }

    public function update(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.edit');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);
        $b = (array) $req->getParsedBody();

        $title = array_key_exists('title', $b) ? trim((string) $b['title']) : $f['title'];
        if ($title === '' || mb_strlen($title) > 200) {
            return Http::error($res, 'Validation failed', 422, ['title' => 'Title is required']);
        }
        $vis = $b['visibility'] ?? $f['visibility'];
        if (!in_array($vis, ['public', 'unlisted', 'password'], true)) {
            return Http::error($res, 'Validation failed', 422, ['visibility' => 'Invalid visibility']);
        }
        $hash = $f['password_hash'];
        if ($vis === 'password') {
            if (!empty($b['password'])) $hash = password_hash((string) $b['password'], PASSWORD_ARGON2ID);
            elseif (!$hash) return Http::error($res, 'Validation failed', 422, ['password' => 'Password required']);
        } else {
            $hash = null;
        }
        $desc = array_key_exists('description', $b) ? (string) $b['description'] : $f['description'];
        $published = array_key_exists('published', $b) ? ($b['published'] ? date('Y-m-d H:i:s') : null) : $f['published_at'];
        if ($published && $f['status'] !== 'ready') {
            return Http::error($res, 'Flipbook is not ready to publish yet', 409);
        }

        $settings = array_key_exists('settings', $b) ? json_encode($b['settings']) : $f['settings'];

        Db::run(
            'UPDATE flipbooks SET title = ?, description = ?, visibility = ?, password_hash = ?, published_at = ?, settings = ? WHERE id = ?',
            [$title, $desc, $vis, $hash, $published, $settings, $f['id']]
        );

        Audit::log('flipbook.update', 'flipbook', $f['id'], [
            'title' => $title,
            'visibility' => $vis,
            'published' => $published !== null,
        ]);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$f['id']])));
    }

    public function delete(Request $req, Response $res, array $args): Response
    {
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'flipbook.delete');

        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);

        Db::run('DELETE FROM flipbooks WHERE id = ?', [$f['id']]);

        $tenantId = !empty($f['tenant_id']) ? (int) $f['tenant_id'] : 1;
        Storage::rrmdir(Storage::publicationDir($tenantId, (int) $f['id']));
        // Legacy fallback cleanup
        Storage::rrmdir(Storage::root() . '/public/flipbooks/' . $f['id']);
        if ($f['source_pdf_path']) {
            @unlink(Storage::root() . '/' . $f['source_pdf_path']);
        }

        Audit::log('flipbook.delete', 'flipbook', $f['id'], ['title' => $f['title']]);

        return Http::json($res, ['ok' => true]);
    }

    public function status(Request $req, Response $res, array $args): Response
    {
        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);
        return Http::json($res, ['status' => $f['status'], 'pageCount' => (int) $f['page_count']]);
    }

    /** Authorized page stream for authenticated dashboard editor */
    public function servePage(Request $req, Response $res, array $args): Response
    {
        return $this->streamPageAsset($req, $res, (int) $args['id'], (int) $args['page'], false);
    }

    /** Authorized thumbnail stream for authenticated dashboard editor */
    public function serveThumb(Request $req, Response $res, array $args): Response
    {
        return $this->streamPageAsset($req, $res, (int) $args['id'], (int) $args['page'], true);
    }

    /** Secure serving of temporary signed URLs */
    public function serveSigned(Request $req, Response $res): Response
    {
        $params = $req->getQueryParams();
        $path = (string) ($params['path'] ?? '');
        $expires = (int) ($params['expires'] ?? 0);
        $sig = (string) ($params['sig'] ?? '');

        if (!Storage::verifySignature($path, $expires, $sig)) {
            return Http::error($res, 'Forbidden: Invalid or expired signature', 403);
        }

        $fullPath = Storage::root() . '/' . ltrim($path, '/\\');
        if (!file_exists($fullPath)) {
            return Http::error($res, 'File not found', 404);
        }

        $fh = fopen($fullPath, 'rb');
        $stream = new Stream($fh);

        $mime = str_ends_with($path, '.pdf') ? 'application/pdf' : 'image/jpeg';
        return $res
            ->withHeader('Content-Type', $mime)
            ->withHeader('Cache-Control', 'private, max-age=3600')
            ->withHeader('X-Content-Type-Options', 'nosniff')
            ->withHeader('Content-Length', (string) filesize($fullPath))
            ->withBody($stream);
    }

    private function streamPageAsset(Request $req, Response $res, int $flipbookId, int $pageNumber, bool $isThumb): Response
    {
        $f = $this->owned($req, $flipbookId);
        if (!$f) return Http::error($res, 'Not found', 404);

        $p = Db::one('SELECT * FROM pages WHERE flipbook_id = ? AND page_number = ?', [$f['id'], $pageNumber]);
        if (!$p) return Http::error($res, 'Page not found', 404);

        $rel = $isThumb ? $p['thumb_path'] : $p['image_path'];
        $path = Storage::root() . '/' . $rel;

        if (!file_exists($path)) {
            return Http::error($res, 'File not found', 404);
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

    // ---- helpers ----

    public static function storageRoot(): string
    {
        return Storage::root();
    }

    private function owned(Request $req, int $id): ?array
    {
        $f = Db::one('SELECT * FROM flipbooks WHERE id = ?', [$id]);
        if (!$f || !TenantContext::canAccessFlipbook($f)) {
            return null;
        }
        return $f;
    }

    private function present(array $f): array
    {
        return [
            'id' => (int) $f['id'],
            'title' => $f['title'],
            'description' => $f['description'],
            'slug' => $f['slug'],
            'status' => $f['status'],
            'visibility' => $f['visibility'],
            'pageCount' => (int) $f['page_count'],
            'published' => $f['published_at'] !== null,
            'createdAt' => $f['created_at'],
            'cover' => $f['id'] ? "/api/v1/flipbooks/{$f['id']}/thumbs/1" : null,
            'settings' => $f['settings'] ? json_decode($f['settings'], true) : new \stdClass(),
        ];
    }

    private function uniqueSlug(string $title): string
    {
        $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $title) ?: $title)), '-');
        $base = substr($base ?: 'flipbook', 0, 50);
        do {
            $slug = $base . '-' . bin2hex(random_bytes(3));
        } while (Db::one('SELECT id FROM flipbooks WHERE slug = ?', [$slug]));
        return $slug;
    }
}
