<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Db;
use App\Support\Http;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class FlipbookController
{
    public function index(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $q = trim((string) ($req->getQueryParams()['q'] ?? ''));
        $rows = Db::all(
            'SELECT f.*, (SELECT thumb_path FROM pages p WHERE p.flipbook_id = f.id AND p.page_number = 1) AS cover
             FROM flipbooks f WHERE f.user_id = ? AND f.title LIKE ? ORDER BY f.created_at DESC',
            [$u['id'], '%' . $q . '%']
        );
        return Http::json($res, array_map([$this, 'present'], $rows));
    }

    public function create(Request $req, Response $res): Response
    {
        $u = $req->getAttribute('user');
        $plan = Db::one('SELECT * FROM plans WHERE id = ?', [$u['plan_id']]);

        $count = (int) Db::one('SELECT COUNT(*) c FROM flipbooks WHERE user_id = ?', [$u['id']])['c'];
        if ($count >= (int) $plan['max_flipbooks']) {
            return Http::error($res, "Your plan allows {$plan['max_flipbooks']} flipbooks.", 403);
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
        if (file_get_contents($tmp, false, null, 0, 5) !== '%PDF-') { // magic bytes, not the client MIME
            @unlink($tmp);
            return Http::error($res, 'Validation failed', 422, ['file' => 'File is not a valid PDF']);
        }

        $body = (array) $req->getParsedBody();
        $title = trim((string) ($body['title'] ?? '')) ?: pathinfo($file->getClientFilename() ?? 'Untitled', PATHINFO_FILENAME);
        $slug = $this->uniqueSlug($title);

        $dir = self::storageRoot() . "/private/pdfs";
        @mkdir($dir, 0775, true);
        $rel = "private/pdfs/$slug.pdf";
        rename($tmp, self::storageRoot() . '/' . $rel);

        Db::run(
            "INSERT INTO flipbooks (user_id, title, slug, source_pdf_path, status) VALUES (?, ?, ?, ?, 'processing')",
            [$u['id'], mb_substr($title, 0, 200), $slug, $rel]
        );
        $id = (int) Db::pdo()->lastInsertId();
        Db::run("INSERT INTO jobs (type, payload) VALUES ('convert_pdf', ?)", [json_encode(['flipbook_id' => $id])]);

        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$id])), 201);
    }

    public function show(Request $req, Response $res, array $args): Response
    {
        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);
        $out = $this->present($f);
        $out['pages'] = array_map(fn($p) => [
            'n' => (int) $p['page_number'], 'image' => $this->url($p['image_path']),
            'thumb' => $this->url($p['thumb_path']), 'w' => (int) $p['width'], 'h' => (int) $p['height'],
        ], Db::all('SELECT * FROM pages WHERE flipbook_id = ? ORDER BY page_number', [$f['id']]));
        return Http::json($res, $out);
    }

    public function update(Request $req, Response $res, array $args): Response
    {
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
        return Http::json($res, $this->present(Db::one('SELECT * FROM flipbooks WHERE id = ?', [$f['id']])));
    }

    public function delete(Request $req, Response $res, array $args): Response
    {
        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);
        Db::run('DELETE FROM flipbooks WHERE id = ?', [$f['id']]);
        self::rrmdir(self::storageRoot() . '/public/flipbooks/' . $f['id']);
        if ($f['source_pdf_path']) @unlink(self::storageRoot() . '/' . $f['source_pdf_path']);
        return Http::json($res, ['ok' => true]);
    }

    public function status(Request $req, Response $res, array $args): Response
    {
        $f = $this->owned($req, (int) $args['id']);
        if (!$f) return Http::error($res, 'Not found', 404);
        return Http::json($res, ['status' => $f['status'], 'pageCount' => (int) $f['page_count']]);
    }

    // ---- helpers ----

    public static function storageRoot(): string
    {
        return dirname(__DIR__, 2) . '/storage';
    }

    private function owned(Request $req, int $id): ?array
    {
        return Db::one('SELECT * FROM flipbooks WHERE id = ? AND user_id = ?', [$id, $req->getAttribute('user')['id']]);
    }

    private function url(?string $rel): ?string
    {
        return $rel ? '/storage/' . $rel : null;
    }

    private function present(array $f): array
    {
        return [
            'id' => (int) $f['id'], 'title' => $f['title'], 'description' => $f['description'], 'slug' => $f['slug'],
            'status' => $f['status'], 'visibility' => $f['visibility'], 'pageCount' => (int) $f['page_count'],
            'published' => $f['published_at'] !== null, 'createdAt' => $f['created_at'],
            'cover' => $this->url($f['cover'] ?? null),
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

    private static function rrmdir(string $dir): void
    {
        if (!is_dir($dir)) return;
        foreach (scandir($dir) as $e) {
            if ($e === '.' || $e === '..') continue;
            is_dir("$dir/$e") ? self::rrmdir("$dir/$e") : @unlink("$dir/$e");
        }
        @rmdir($dir);
    }
}
