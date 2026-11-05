<?php
declare(strict_types=1);

namespace App\Support;

use RuntimeException;
use Throwable;

/**
 * Nuvis Flipex — Multi-Engine Enterprise PDF Rendering Service
 *
 * Supports three modular rendering drivers:
 * 1. Ghostscript CLI (Primary on A2 Hosting & Linux cPanel: /usr/bin/gs)
 * 2. PHP Imagick Extension (In-process rasterizer via cPanel PHP extension)
 * 3. Poppler pdftoppm CLI (High-speed vector renderer for dedicated/upgraded environments)
 *
 * Configurable via .env:
 * - PDF_DRIVER=ghostscript | imagick | pdftoppm | auto
 * - GS_BIN=/usr/bin/gs
 * - PDFTOPPM_BIN=/usr/bin/pdftoppm
 */
final class PdfRenderer
{
    public const DRIVER_GHOSTSCRIPT = 'ghostscript';
    public const DRIVER_IMAGICK = 'imagick';
    public const DRIVER_PDFTOPPM = 'pdftoppm';
    public const DRIVER_AUTO = 'auto';

    /**
     * Resolve the active rendering driver based on environment config and system capability.
     */
    public static function resolveDriver(?string $preferred = null): string
    {
        $driver = strtolower(trim($preferred ?? $_ENV['PDF_DRIVER'] ?? self::DRIVER_AUTO));

        if ($driver !== self::DRIVER_AUTO) {
            return match ($driver) {
                'gs', 'ghostscript' => self::DRIVER_GHOSTSCRIPT,
                'imagick', 'imagemagick' => self::DRIVER_IMAGICK,
                'poppler', 'pdftoppm' => self::DRIVER_PDFTOPPM,
                default => self::DRIVER_AUTO,
            };
        }

        // Automatic discovery order:
        // 1. Ghostscript (Preferred on A2 Hosting & shared Linux environments: /usr/bin/gs)
        if (self::getGhostscriptBinary() !== null) {
            return self::DRIVER_GHOSTSCRIPT;
        }

        // 2. Poppler pdftoppm (If installed and available in PATH or .env)
        if (self::getPdftoppmBinary() !== null) {
            return self::DRIVER_PDFTOPPM;
        }

        // 3. PHP Imagick Extension
        if (self::isImagickAvailable()) {
            return self::DRIVER_IMAGICK;
        }

        return self::DRIVER_GHOSTSCRIPT; // Default fallback attempt
    }

    /**
     * Render PDF pages and thumbnails to target directory.
     * Implements automatic fallback: if primary driver fails, tries alternative available drivers.
     *
     * @return string[] Array of generated page file paths
     */
    public static function render(string $pdfPath, string $outDir, int $maxPages = 100): array
    {
        if (!file_exists($pdfPath)) {
            throw new RuntimeException("Source PDF file does not exist: {$pdfPath}");
        }

        Storage::ensureDir($outDir);
        Storage::ensureDir("{$outDir}/thumbs");

        $driver = self::resolveDriver();
        $tried = [];
        $errors = [];

        // Determine driver attempt order starting with resolved driver
        $order = [$driver];
        foreach ([self::DRIVER_GHOSTSCRIPT, self::DRIVER_IMAGICK, self::DRIVER_PDFTOPPM] as $d) {
            if (!in_array($d, $order, true)) {
                $order[] = $d;
            }
        }

        foreach ($order as $candidate) {
            if (!self::isDriverCapable($candidate)) {
                continue;
            }

            try {
                $tried[] = $candidate;
                $files = match ($candidate) {
                    self::DRIVER_GHOSTSCRIPT => self::renderViaGhostscript($pdfPath, $outDir, $maxPages),
                    self::DRIVER_IMAGICK => self::renderViaImagick($pdfPath, $outDir, $maxPages),
                    self::DRIVER_PDFTOPPM => self::renderViaPdftoppm($pdfPath, $outDir, $maxPages),
                    default => throw new RuntimeException("Unknown driver: {$candidate}"),
                };

                if (!empty($files)) {
                    return $files;
                }
            } catch (Throwable $e) {
                $errors[$candidate] = $e->getMessage();
                error_log("[PdfRenderer] Driver '{$candidate}' failed: " . $e->getMessage());
                // Clean up partial files before trying next driver
                self::cleanupPartialFiles($outDir);
            }
        }

        $summary = [];
        foreach ($errors as $drv => $err) {
            $summary[] = "{$drv}: {$err}";
        }

        throw new RuntimeException(
            "PDF conversion failed across attempted drivers (" . implode(', ', $tried) . "). Details: " .
            (empty($summary) ? 'No capable rendering drivers available on host.' : implode(' | ', $summary))
        );
    }

    /**
     * Render via Ghostscript CLI (/usr/bin/gs).
     */
    public static function renderViaGhostscript(string $pdfPath, string $outDir, int $maxPages): array
    {
        $gs = self::getGhostscriptBinary();
        if ($gs === null) {
            throw new RuntimeException("Ghostscript binary not found (checked GS_BIN, /usr/bin/gs, gs, gswin64c)");
        }

        $base = [
            $gs,
            '-q',
            '-dNOPAUSE',
            '-dBATCH',
            '-dSAFER',
            '-sDEVICE=jpeg',
            '-dJPEGQ=85',
            '-dTextAlphaBits=4',
            '-dGraphicsAlphaBits=4',
            "-dLastPage={$maxPages}",
        ];

        // 1. High-resolution reader pages (110 DPI)
        $mainCmd = array_merge($base, ['-r110', "-sOutputFile={$outDir}/page-%03d.jpg", $pdfPath]);
        self::runProcess($mainCmd, 'Ghostscript (Pages)');

        // 2. Optimized navigation thumbnails (25 DPI)
        $thumbCmd = array_merge($base, ['-r25', "-sOutputFile={$outDir}/thumbs/page-%03d.jpg", $pdfPath]);
        self::runProcess($thumbCmd, 'Ghostscript (Thumbnails)');

        $files = glob("{$outDir}/page-*.jpg");
        natsort($files);
        return array_values($files);
    }

    /**
     * Render via PHP Imagick Extension.
     */
    public static function renderViaImagick(string $pdfPath, string $outDir, int $maxPages): array
    {
        if (!self::isImagickAvailable()) {
            throw new RuntimeException('PHP Imagick extension is not installed or enabled');
        }

        $im = new \Imagick();
        $im->setResolution(110, 110);
        $im->readImage($pdfPath);

        $total = $im->getNumberImages();
        $pagesToRender = min($total, $maxPages);
        $files = [];

        for ($i = 0; $i < $pagesToRender; $i++) {
            $im->setIteratorIndex($i);
            $page = $im->getImage();
            $page->setImageFormat('jpeg');
            $page->setImageCompressionQuality(85);

            $pageFile = sprintf('%s/page-%03d.jpg', $outDir, $i + 1);
            $thumbFile = sprintf('%s/thumbs/page-%03d.jpg', $outDir, $i + 1);

            $page->writeImage($pageFile);

            // Thumbnail generation
            $thumb = clone $page;
            $thumb->thumbnailImage(240, 0); // 240px wide proportional thumbnail
            $thumb->setImageCompressionQuality(75);
            $thumb->writeImage($thumbFile);

            $thumb->clear();
            $thumb->destroy();
            $page->clear();
            $page->destroy();

            $files[] = $pageFile;
        }

        $im->clear();
        $im->destroy();

        return $files;
    }

    /**
     * Render via Poppler pdftoppm CLI.
     */
    public static function renderViaPdftoppm(string $pdfPath, string $outDir, int $maxPages): array
    {
        $ppm = self::getPdftoppmBinary();
        if ($ppm === null) {
            throw new RuntimeException("Poppler pdftoppm binary not found (checked PDFTOPPM_BIN and PATH)");
        }

        // Render main pages with prefix 'pg'
        self::runProcess([$ppm, '-jpeg', '-r', '110', '-l', (string) $maxPages, $pdfPath, "{$outDir}/pg"], 'Poppler (Pages)');

        // Render thumbnail pages with prefix 'pg'
        self::runProcess([$ppm, '-jpeg', '-r', '25', '-l', (string) $maxPages, $pdfPath, "{$outDir}/thumbs/pg"], 'Poppler (Thumbnails)');

        // Standardize naming to page-001.jpg, page-002.jpg across directories
        foreach ([$outDir, "{$outDir}/thumbs"] as $dir) {
            $list = glob("{$dir}/pg-*.jpg");
            if ($list) {
                natsort($list);
                foreach (array_values($list) as $i => $src) {
                    $target = sprintf('%s/page-%03d.jpg', $dir, $i + 1);
                    if ($src !== $target) {
                        @rename($src, $target);
                    }
                }
            }
        }

        $files = glob("{$outDir}/page-*.jpg");
        natsort($files);
        return array_values($files);
    }

    /**
     * Locate Ghostscript executable.
     */
    public static function getGhostscriptBinary(): ?string
    {
        // 1. Explicit environment variable (e.g. GS_BIN=/usr/bin/gs on A2 Hosting)
        if (!empty($_ENV['GS_BIN'])) {
            $bin = trim($_ENV['GS_BIN']);
            if (self::testExecutable($bin)) {
                return $bin;
            }
        }

        // 2. Standard Linux / cPanel locations
        $linuxCandidates = [
            '/usr/bin/gs',
            '/usr/local/bin/gs',
            '/opt/cpanel/ea-ghostscript/bin/gs',
            'gs',
        ];

        // 3. Windows locations
        $windowsCandidates = [
            'gswin64c.exe',
            'gswin64c',
            'gswin32c.exe',
            'gswin32c',
            'C:\\Program Files\\gs\\gs10.04.0\\bin\\gswin64c.exe',
            'C:\\Program Files\\gs\\gs10.03.0\\bin\\gswin64c.exe',
            'C:\\Program Files\\gs\\gs10.02.0\\bin\\gswin64c.exe',
            'gs',
        ];

        $candidates = PHP_OS_FAMILY === 'Windows' ? $windowsCandidates : $linuxCandidates;

        foreach ($candidates as $cand) {
            if (self::testExecutable($cand)) {
                return $cand;
            }
        }

        return null;
    }

    /**
     * Locate Poppler pdftoppm executable.
     */
    public static function getPdftoppmBinary(): ?string
    {
        if (!empty($_ENV['PDFTOPPM_BIN'])) {
            $bin = trim($_ENV['PDFTOPPM_BIN']);
            if (self::testExecutable($bin)) {
                return $bin;
            }
        }

        $candidates = PHP_OS_FAMILY === 'Windows'
            ? ['pdftoppm.exe', 'pdftoppm']
            : ['/usr/bin/pdftoppm', '/usr/local/bin/pdftoppm', 'pdftoppm'];

        foreach ($candidates as $cand) {
            if (self::testExecutable($cand)) {
                return $cand;
            }
        }

        return null;
    }

    /**
     * Check if PHP Imagick extension is available.
     */
    public static function isImagickAvailable(): bool
    {
        return extension_loaded('imagick') && class_exists('\Imagick');
    }

    /**
     * Check if a specific driver is capable of running on this system.
     */
    public static function isDriverCapable(string $driver): bool
    {
        return match ($driver) {
            self::DRIVER_GHOSTSCRIPT => self::getGhostscriptBinary() !== null,
            self::DRIVER_IMAGICK => self::isImagickAvailable(),
            self::DRIVER_PDFTOPPM => self::getPdftoppmBinary() !== null,
            default => false,
        };
    }

    /**
     * Comprehensive diagnostics report for administrative inspection and health checks.
     */
    public static function diagnostics(): array
    {
        $gs = self::getGhostscriptBinary();
        $ppm = self::getPdftoppmBinary();
        $imagick = self::isImagickAvailable();
        $active = self::resolveDriver();

        return [
            'active_driver' => $active,
            'configured_driver' => $_ENV['PDF_DRIVER'] ?? 'auto (default)',
            'ghostscript' => [
                'available' => $gs !== null,
                'path' => $gs ?? 'Not found',
                'env_setting' => $_ENV['GS_BIN'] ?? '(not set, using auto-discovery)',
            ],
            'imagick' => [
                'available' => $imagick,
                'version' => $imagick && defined('\Imagick::IMAGICK_EXTNUM') ? \Imagick::IMAGICK_EXTNUM : ($imagick ? 'Installed' : 'Not installed'),
            ],
            'pdftoppm' => [
                'available' => $ppm !== null,
                'path' => $ppm ?? 'Not found',
                'env_setting' => $_ENV['PDFTOPPM_BIN'] ?? '(not set, using auto-discovery)',
            ],
            'has_any_engine' => $gs !== null || $imagick || $ppm !== null,
        ];
    }

    /**
     * Execute a shell process safely with timeout and stderr capture.
     */
    private static function runProcess(array $cmd, string $toolName = 'Command'): void
    {
        $pipes = [];
        $proc = @proc_open($cmd, [
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ], $pipes);

        if (!is_resource($proc)) {
            $cmdStr = implode(' ', array_map('escapeshellarg', $cmd));
            throw new RuntimeException("Unable to start process for {$toolName}: {$cmdStr}");
        }

        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($proc);
        if ($exitCode !== 0) {
            $err = trim($stderr) !== '' ? trim($stderr) : trim($stdout);
            throw new RuntimeException("{$toolName} failed with exit code {$exitCode}: " . ($err ?: 'Unknown error'));
        }
    }

    /**
     * Test whether an executable can be invoked.
     */
    private static function testExecutable(string $path): bool
    {
        if (file_exists($path) && is_file($path)) {
            if (PHP_OS_FAMILY !== 'Windows' && !is_executable($path)) {
                return false;
            }
            return true;
        }

        // Test running with --version or -v
        $testCmd = [$path, '-v'];
        $pipes = [];
        $proc = @proc_open($testCmd, [
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ], $pipes);

        if (!is_resource($proc)) {
            return false;
        }

        fclose($pipes[1]);
        fclose($pipes[2]);
        $code = proc_close($proc);

        // Many utilities return 0 or 1 on -v, but successfully launch
        return $code >= 0 && $code <= 1;
    }

    /**
     * Clean up partial files upon driver failure.
     */
    private static function cleanupPartialFiles(string $outDir): void
    {
        foreach (glob("{$outDir}/page-*.jpg") ?: [] as $f) {
            @unlink($f);
        }
        foreach (glob("{$outDir}/thumbs/page-*.jpg") ?: [] as $f) {
            @unlink($f);
        }
        foreach (glob("{$outDir}/pg-*.jpg") ?: [] as $f) {
            @unlink($f);
        }
        foreach (glob("{$outDir}/thumbs/pg-*.jpg") ?: [] as $f) {
            @unlink($f);
        }
    }
}
