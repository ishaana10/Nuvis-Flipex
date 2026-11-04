<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Controllers\FlipbookController;
use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$once = in_array('--once', $argv, true);
echo "Worker started.\n";

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

    $root = FlipbookController::storageRoot();
    $pdf = $root . '/' . $f['source_pdf_path'];
    $outRel = "public/flipbooks/$flipbookId";
    $out = "$root/$outRel";
    @mkdir("$out/thumbs", 0775, true);

    render($pdf, $out, (int) $f['max_pages']);
    $files = glob("$out/page-*.jpg");
    sort($files);
    if (!$files) throw new RuntimeException('No pages produced');

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
    echo "Converted flipbook $flipbookId: " . count($files) . " pages\n";

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

function run(array $cmd): void
{
    $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($proc)) throw new RuntimeException('Cannot start Ghostscript');
    $stderr = stream_get_contents($pipes[2]);
    stream_get_contents($pipes[1]);
    if (proc_close($proc) !== 0) throw new RuntimeException('Ghostscript failed: ' . trim($stderr));
}

/** Render pages (110dpi) and thumbnails (20dpi) as page-NNN.jpg using pdftoppm (Poppler) or Ghostscript. */
function render(string $pdf, string $out, int $maxPages): void
{
    $ppm = $_ENV['PDFTOPPM_BIN'] ?? '';
    if ($ppm !== '') {
        run([$ppm, '-jpeg', '-r', '110', '-l', (string) $maxPages, $pdf, "$out/pg"]);
        run([$ppm, '-jpeg', '-r', '20', '-l', (string) $maxPages, $pdf, "$out/thumbs/pg"]);
        foreach ([$out, "$out/thumbs"] as $dir) {
            $list = glob("$dir/pg-*.jpg");
            natsort($list);
            foreach (array_values($list) as $i => $src) {
                rename($src, sprintf('%s/page-%03d.jpg', $dir, $i + 1));
            }
        }
        return;
    }
    $base = [gsBinary(), '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=jpeg', '-dJPEGQ=82',
        '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', '-dLastPage=' . $maxPages];
    run(array_merge($base, ['-r110', "-sOutputFile=$out/page-%03d.jpg", $pdf]));
    run(array_merge($base, ['-r20', "-sOutputFile=$out/thumbs/page-%03d.jpg", $pdf]));
}
