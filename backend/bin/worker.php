<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Controllers\FlipbookController;
use App\Support\Db;
use App\Support\PdfRenderer;
use App\Support\Storage;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$once = in_array('--once', $argv, true);
$activeDriver = PdfRenderer::resolveDriver();
echo "===============================================================\n";
echo "   Nuvis Flipex — Asynchronous PDF Conversion Worker Daemon    \n";
echo "   Active PDF Render Engine: {$activeDriver}\n";
echo "===============================================================\n";

do {
    $job = claim();
    if (!$job) {
        if ($once) break;
        sleep(2);
        continue;
    }
    try {
        match ($job['type']) {
            'convert_pdf' => convertPdf((int) json_decode($job['payload'], true)['flipbook_id']),
            default => throw new RuntimeException('Unknown job type ' . $job['type']),
        };
        Db::run('UPDATE jobs SET done_at = NOW() WHERE id = ?', [$job['id']]);
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . "\n");
        $retry = (int) $job['attempts'] < 3;
        Db::run(
            'UPDATE jobs SET error = ?, locked_at = NULL, done_at = ?, run_at = DATE_ADD(NOW(), INTERVAL 1 MINUTE) WHERE id = ?',
            [$e->getMessage(), $retry ? null : date('Y-m-d H:i:s'), $job['id']]
        );
        if (!$retry && ($job['type'] === 'convert_pdf')) {
            $fid = (int) json_decode($job['payload'], true)['flipbook_id'];
            Db::run("UPDATE flipbooks SET status = 'failed' WHERE id = ?", [$fid]);
        }
    }
} while (true);

function claim(): ?array
{
    $pdo = Db::pdo();
    $pdo->beginTransaction();
    $job = Db::one(
        'SELECT * FROM jobs WHERE done_at IS NULL AND run_at <= NOW()
         AND (locked_at IS NULL OR locked_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE))
         ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED'
    );
    if ($job) Db::run('UPDATE jobs SET locked_at = NOW(), attempts = attempts + 1 WHERE id = ?', [$job['id']]);
    $pdo->commit();
    return $job;
}

function gsBinary(): string
{
    if (!empty($_ENV['GS_BIN'])) return $_ENV['GS_BIN'];
    return PHP_OS_FAMILY === 'Windows' ? 'gswin64c' : 'gs';
}

function convertPdf(int $flipbookId): void
{
    $f = Db::one('SELECT f.*, p.max_pages FROM flipbooks f JOIN users u ON u.id = f.user_id JOIN plans p ON p.id = u.plan_id WHERE f.id = ?', [$flipbookId]);
    if (!$f) return;

    $root = Storage::root();
    $pdf = $root . '/' . $f['source_pdf_path'];
    $tenantId = !empty($f['tenant_id']) ? (int) $f['tenant_id'] : 1;
    $outRel = "tenants/{$tenantId}/publications/{$flipbookId}";
    $out = "$root/$outRel";

    echo "Converting publication {$flipbookId} ('{$f['title']}') via " . PdfRenderer::resolveDriver() . "...\n";
    $files = PdfRenderer::render($pdf, $out, (int) $f['max_pages']);
    if (!$files) throw new RuntimeException('No pages produced by PDF renderer');

    Db::run('DELETE FROM pages WHERE flipbook_id = ?', [$flipbookId]);
    foreach ($files as $i => $file) {
        [$w, $h] = getimagesize($file);
        $name = basename($file);
        Db::run(
            'INSERT INTO pages (flipbook_id, page_number, image_path, thumb_path, width, height) VALUES (?, ?, ?, ?, ?, ?)',
            [$flipbookId, $i + 1, "$outRel/$name", "$outRel/thumbs/$name", $w, $h]
        );
    }
    Db::run("UPDATE flipbooks SET status = 'ready', page_count = ? WHERE id = ?", [count($files), $flipbookId]);
    echo "Successfully converted flipbook {$flipbookId}: " . count($files) . " pages.\n";

    // Customer Notification
    try {
        $setting = Db::one("SELECT setting_value FROM system_settings WHERE setting_key = 'notify_customer_on_publish'");
        if (!$setting || $setting['setting_value'] !== '0') {
            $owner = Db::one('SELECT u.email, u.name, f.title, f.slug FROM flipbooks f JOIN users u ON u.id = f.user_id WHERE f.id = ?', [$flipbookId]);
            if ($owner) {
                $readerUrl = ($_ENV['APP_URL'] ?? 'http://localhost:5173') . '/v/' . $owner['slug'];
                \App\Support\Mailer::publicationConverted($owner['email'], $owner['name'], $owner['title'], $readerUrl);
            }
        }
    } catch (\Throwable $e) {
        echo "Notification warning: " . $e->getMessage() . "\n";
    }
}
