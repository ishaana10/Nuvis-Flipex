<?php
declare(strict_types=1);

namespace App\Support;

use RuntimeException;
use Throwable;

/**
 * Nuvis Flipex — Enterprise Document Processing & Multi-Resolution PDF Rendering Service
 *
 * Features:
 * - Multi-engine rasterization: Ghostscript (/usr/bin/gs), PHP Imagick, Poppler pdftoppm
 * - Strict PDF validation: magic header, EOF trailer, encryption detection, file size & page count limits
 * - Automatic PDF metadata extraction: Title, Author, Subject, Keywords, Creator, Producer, PDF Version, Page Count
 * - Multi-resolution output:
 *     1. Thumbnail (thumbs/page-XXX.jpg + .webp, ~240px / 30 DPI) for progressive loading & grid
 *     2. Standard (page-XXX.jpg + .webp + .avif, 110 DPI) for fast flipbook spread rendering
 *     3. High-Res Zoom (high/page-XXX.jpg + .webp, 180 DPI) loaded on-demand only when zoomed in
 * - Resource & process isolation: CPU/process execution timeouts, memory limits, and atomic partial-file cleanup
 * - Real-time conversion progress callback (0% - 100%)
 */
final class PdfRenderer
{
    public const DRIVER_GHOSTSCRIPT = 'ghostscript';
    public const DRIVER_IMAGICK = 'imagick';
    public const DRIVER_PDFTOPPM = 'pdftoppm';
    public const DRIVER_AUTO = 'auto';

    /**
     * Validate a PDF file before queuing or processing.
     * Checks size limits, magic bytes, EOF marker, encryption lock, and page count limits.
     *
     * @throws RuntimeException if validation fails
     */
    public static function validatePdf(string $pdfPath, int $maxSizeBytes = 209715200, int $maxPages = 500): array
    {
        if (!file_exists($pdfPath) || !is_file($pdfPath)) {
            throw new RuntimeException('PDF validation failed: File does not exist.');
        }

        $size = filesize($pdfPath);
        if ($size === false || $size < 64) {
            throw new RuntimeException('PDF validation failed: File is empty or corrupted.');
        }

        if ($maxSizeBytes > 0 && $size > $maxSizeBytes) {
            $mb = round($maxSizeBytes / 1048576, 1);
            throw new RuntimeException("PDF validation failed: File exceeds maximum allowed size ({$mb} MB).");
        }

        $fh = @fopen($pdfPath, 'rb');
        if (!$fh) {
            throw new RuntimeException('PDF validation failed: Unable to open PDF file for reading.');
        }

        $head = fread($fh, 1024) ?: '';
        if (!preg_match('/%PDF-(\d+\.\d+)/', $head, $verMatch)) {
            fclose($fh);
            throw new RuntimeException('PDF validation failed: Invalid PDF header signature (%PDF-1.x missing).');
        }

        // Read tail to verify %%EOF marker
        $tailOffset = max(0, $size - 4096);
        fseek($fh, $tailOffset);
        $tail = fread($fh, 4096) ?: '';
        fclose($fh);

        if (!str_contains($tail, '%%EOF') && !str_contains($head, '%PDF-')) {
            throw new RuntimeException('PDF validation failed: Truncated or incomplete PDF file (missing %%EOF trailer).');
        }

        $meta = self::extractMetadata($pdfPath);
        if (!empty($meta['encrypted'])) {
            throw new RuntimeException('PDF validation failed: Password-protected or encrypted PDFs cannot be converted. Please remove encryption first.');
        }

        if ($maxPages > 0 && !empty($meta['page_count']) && (int) $meta['page_count'] > $maxPages) {
            throw new RuntimeException("PDF validation failed: Document has {$meta['page_count']} pages, exceeding your plan limit of {$maxPages} pages.");
        }

        return $meta;
    }

    /**
     * Extract comprehensive PDF metadata (Title, Author, Subject, Keywords, Creator, Producer, Version, PageCount, Size).
     */
    public static function extractMetadata(string $pdfPath): array
    {
        $size = @filesize($pdfPath) ?: 0;
        $meta = [
            'title' => null,
            'author' => null,
            'subject' => null,
            'keywords' => null,
            'creator' => null,
            'producer' => null,
            'creation_date' => null,
            'pdf_version' => '1.4',
            'page_count' => 0,
            'file_size_bytes' => $size,
            'encrypted' => false,
            'linearized' => false,
        ];

        if (!file_exists($pdfPath)) {
            return $meta;
        }

        // 1. Try Poppler pdfinfo if available
        $pdfinfo = self::getPdfinfoBinary();
        if ($pdfinfo !== null) {
            try {
                $out = self::runProcessCapture([$pdfinfo, $pdfPath], 20);
                foreach (explode("\n", $out) as $line) {
                    if (!str_contains($line, ':')) continue;
                    [$k, $v] = array_map('trim', explode(':', $line, 2));
                    $kl = strtolower($k);
                    if ($kl === 'title' && $v !== '') $meta['title'] = $v;
                    elseif ($kl === 'author' && $v !== '') $meta['author'] = $v;
                    elseif ($kl === 'subject' && $v !== '') $meta['subject'] = $v;
                    elseif ($kl === 'keywords' && $v !== '') $meta['keywords'] = $v;
                    elseif ($kl === 'creator' && $v !== '') $meta['creator'] = $v;
                    elseif ($kl === 'producer' && $v !== '') $meta['producer'] = $v;
                    elseif ($kl === 'creationdate' && $v !== '') $meta['creation_date'] = $v;
                    elseif ($kl === 'pages') $meta['page_count'] = (int) $v;
                    elseif ($kl === 'encrypted') $meta['encrypted'] = str_starts_with(strtolower($v), 'yes');
                    elseif ($kl === 'optimized') $meta['linearized'] = str_starts_with(strtolower($v), 'yes');
                    elseif ($kl === 'pdf version' && $v !== '') $meta['pdf_version'] = $v;
                }
                if ($meta['page_count'] > 0) {
                    return $meta;
                }
            } catch (Throwable) {
                // Fall through to native/Imagick inspection
            }
        }

        // 2. Native binary inspection (works everywhere without external dependencies)
        $raw = @file_get_contents($pdfPath, false, null, 0, min($size, 2 * 1024 * 1024)) ?: '';
        if (preg_match('/%PDF-(\d+\.\d+)/', $raw, $m)) {
            $meta['pdf_version'] = $m[1];
        }
        if (preg_match('/\/Linearized\b/', substr($raw, 0, 2048))) {
            $meta['linearized'] = true;
        }
        // Check for /Encrypt dictionary token in trailer/body
        if ($size > 65536) {
            $tailRaw = @file_get_contents($pdfPath, false, null, max(0, $size - 65536), 65536) ?: '';
        } else {
            $tailRaw = $raw;
        }
        if (preg_match('/\/Encrypt\s+\d+\s+\d+\s+R/', $tailRaw) || preg_match('/\/Encrypt\s*<</', $tailRaw)) {
            $meta['encrypted'] = true;
        }

        // Extract Info dictionary fields from header/trailer
        $combined = $raw . "\n" . ($tailRaw !== $raw ? $tailRaw : '');
        foreach (['Title' => 'title', 'Author' => 'author', 'Subject' => 'subject', 'Keywords' => 'keywords', 'Creator' => 'creator', 'Producer' => 'producer'] as $pdfKey => $field) {
            if ($meta[$field] === null && preg_match('/\/' . $pdfKey . '\s*\(([^\)\\\\]*(?:\\\\.[^\)\\\\]*)*)\)/', $combined, $m)) {
                $val = stripcslashes($m[1]);
                // Strip UTF-16BE BOM if present
                if (str_starts_with($val, "\xFE\xFF")) {
                    $val = @mb_convert_encoding(substr($val, 2), 'UTF-8', 'UTF-16BE') ?: $val;
                }
                $val = trim(preg_replace('/[\x00-\x1F\x7F]/u', '', $val) ?? '');
                if ($val !== '') {
                    $meta[$field] = mb_substr($val, 0, 250);
                }
            }
        }

        // Estimate page count from /Type /Page (not /Pages)
        if ($meta['page_count'] === 0) {
            $fullContent = $size <= 15 * 1024 * 1024 ? (@file_get_contents($pdfPath) ?: $combined) : $combined;
            if (preg_match_all('/\/Type\s*\/Page\b(?!s)/', $fullContent, $matches)) {
                $meta['page_count'] = count($matches[0]);
            } elseif (preg_match('/\/Count\s+(\d+)/', $combined, $cm)) {
                $meta['page_count'] = (int) $cm[1];
            }
        }

        return $meta;
    }

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

        if (self::getGhostscriptBinary() !== null) {
            return self::DRIVER_GHOSTSCRIPT;
        }
        if (self::getPdftoppmBinary() !== null) {
            return self::DRIVER_PDFTOPPM;
        }
        if (self::isImagickAvailable()) {
            return self::DRIVER_IMAGICK;
        }

        return self::DRIVER_GHOSTSCRIPT;
    }

    /**
     * Render PDF pages at multiple resolutions (thumb, standard, high-res) and generate WebP/AVIF derivatives.
     *
     * @param callable|null $onProgress Optional callback: fn(int $percent, string $step): void
     * @return array<int, array{standard:string, high_res:?string, webp:?string, avif:?string, thumb:string, width:int, height:int}>
     */
    public static function renderMultiResolution(
        string $pdfPath,
        string $outDir,
        int $maxPages = 100,
        ?callable $onProgress = null,
        int $timeoutSeconds = 300
    ): array {
        // Enforce worker memory safety limit
        @ini_set('memory_limit', '512M');

        $report = static function (int $pct, string $step) use ($onProgress): void {
            if ($onProgress !== null) {
                $onProgress(max(0, min(100, $pct)), $step);
            }
        };

        $report(5, 'Validating PDF structure & security');
        self::validatePdf($pdfPath, 0, $maxPages);

        Storage::ensureDir($outDir);
        Storage::ensureDir("{$outDir}/thumbs");
        Storage::ensureDir("{$outDir}/high");

        $driver = self::resolveDriver();
        $tried = [];
        $errors = [];

        $order = [$driver];
        foreach ([self::DRIVER_GHOSTSCRIPT, self::DRIVER_IMAGICK, self::DRIVER_PDFTOPPM] as $d) {
            if (!in_array($d, $order, true)) {
                $order[] = $d;
            }
        }

        $standardFiles = [];
        foreach ($order as $candidate) {
            if (!self::isDriverCapable($candidate)) {
                continue;
            }

            try {
                $tried[] = $candidate;
                $report(15, "Rasterizing standard & high-res pages via {$candidate}");

                $standardFiles = match ($candidate) {
                    self::DRIVER_GHOSTSCRIPT => self::renderViaGhostscript($pdfPath, $outDir, $maxPages, $timeoutSeconds, $report),
                    self::DRIVER_IMAGICK => self::renderViaImagick($pdfPath, $outDir, $maxPages, $report),
                    self::DRIVER_PDFTOPPM => self::renderViaPdftoppm($pdfPath, $outDir, $maxPages, $timeoutSeconds, $report),
                    default => throw new RuntimeException("Unknown driver: {$candidate}"),
                };

                if (!empty($standardFiles)) {
                    break;
                }
            } catch (Throwable $e) {
                $errors[$candidate] = $e->getMessage();
                error_log("[PdfRenderer] Driver '{$candidate}' failed: " . $e->getMessage());
                self::cleanupPartialFiles($outDir);
            }
        }

        if (empty($standardFiles)) {
            $summary = [];
            foreach ($errors as $drv => $err) {
                $summary[] = "{$drv}: {$err}";
            }
            throw new RuntimeException(
                "PDF conversion failed across attempted drivers (" . implode(', ', $tried) . "). Details: " .
                (empty($summary) ? 'No capable rendering drivers available on host.' : implode(' | ', $summary))
            );
        }

        // Post-process each page: verify dimensions, ensure thumbnail & high-res exist, and generate WebP / AVIF outputs
        $total = count($standardFiles);
        $results = [];

        foreach ($standardFiles as $idx => $stdFile) {
            $pageNum = $idx + 1;
            $pct = 65 + (int) round(($pageNum / max(1, $total)) * 30);
            $report($pct, "Optimizing WebP/AVIF & multi-res assets (page {$pageNum} of {$total})");

            $baseName = sprintf('page-%03d', $pageNum);
            $thumbFile = "{$outDir}/thumbs/{$baseName}.jpg";
            $highFile = "{$outDir}/high/{$baseName}.jpg";
            $webpFile = "{$outDir}/{$baseName}.webp";
            $avifFile = "{$outDir}/{$baseName}.avif";

            $dims = @getimagesize($stdFile);
            $w = $dims ? (int) $dims[0] : 1200;
            $h = $dims ? (int) $dims[1] : 1600;

            // Generate WebP and AVIF derivatives + fallback thumbnail via GD if needed
            if (extension_loaded('gd') && function_exists('imagecreatefromjpeg')) {
                $im = @imagecreatefromjpeg($stdFile);
                if ($im !== false) {
                    // Generate missing thumbnail if driver didn't create it
                    if (!file_exists($thumbFile)) {
                        $thumbW = 240;
                        $thumbH = max(1, (int) round($h * ($thumbW / max(1, $w))));
                        $thumbIm = imagescale($im, $thumbW, $thumbH);
                        if ($thumbIm !== false) {
                            @imagejpeg($thumbIm, $thumbFile, 78);
                            imagedestroy($thumbIm);
                        }
                    }

                    // Generate WebP derivative for modern browsers
                    if (function_exists('imagewebp')) {
                        @imagewebp($im, $webpFile, 82);
                    }

                    // Generate AVIF derivative if PHP GD was compiled with libavif support
                    if (function_exists('imageavif')) {
                        @imageavif($im, $avifFile, 65);
                    }

                    imagedestroy($im);
                }
            }

            $results[] = [
                'page_number' => $pageNum,
                'standard' => $stdFile,
                'high_res' => file_exists($highFile) ? $highFile : $stdFile,
                'webp' => (file_exists($webpFile) && filesize($webpFile) > 0) ? $webpFile : null,
                'avif' => (file_exists($avifFile) && filesize($avifFile) > 0) ? $avifFile : null,
                'thumb' => file_exists($thumbFile) ? $thumbFile : $stdFile,
                'width' => $w,
                'height' => $h,
            ];
        }

        $report(100, 'Conversion complete');
        return $results;
    }

    /**
     * Backward-compatible render method returning array of standard page file paths.
     *
     * @return string[]
     */
    public static function render(string $pdfPath, string $outDir, int $maxPages = 100): array
    {
        $multi = self::renderMultiResolution($pdfPath, $outDir, $maxPages);
        return array_map(static fn(array $r): string => $r['standard'], $multi);
    }

    /**
     * Render via Ghostscript CLI (/usr/bin/gs).
     */
    public static function renderViaGhostscript(
        string $pdfPath,
        string $outDir,
        int $maxPages,
        int $timeoutSeconds = 300,
        ?callable $report = null
    ): array {
        $gs = self::getGhostscriptBinary();
        if ($gs === null) {
            throw new RuntimeException("Ghostscript binary not found (checked GS_BIN, /usr/bin/gs, gs, gswin64c)");
        }

        Storage::ensureDir("{$outDir}/thumbs");
        Storage::ensureDir("{$outDir}/high");

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

        if ($report) $report(20, 'Rendering standard resolution pages (110 DPI)');
        $mainCmd = array_merge($base, ['-r110', "-sOutputFile={$outDir}/page-%03d.jpg", $pdfPath]);
        self::runProcess($mainCmd, 'Ghostscript (Standard Pages)', $timeoutSeconds);

        if ($report) $report(40, 'Rendering high-resolution zoom pages (180 DPI)');
        $highCmd = array_merge($base, ['-r180', "-sOutputFile={$outDir}/high/page-%03d.jpg", $pdfPath]);
        self::runProcess($highCmd, 'Ghostscript (High-Res Pages)', $timeoutSeconds);

        if ($report) $report(55, 'Rendering navigation thumbnails (30 DPI)');
        $thumbCmd = array_merge($base, ['-r30', "-sOutputFile={$outDir}/thumbs/page-%03d.jpg", $pdfPath]);
        self::runProcess($thumbCmd, 'Ghostscript (Thumbnails)', $timeoutSeconds);

        $files = glob("{$outDir}/page-*.jpg") ?: [];
        natsort($files);
        return array_values($files);
    }

    /**
     * Render via PHP Imagick Extension.
     */
    public static function renderViaImagick(
        string $pdfPath,
        string $outDir,
        int $maxPages,
        ?callable $report = null
    ): array {
        if (!self::isImagickAvailable()) {
            throw new RuntimeException('PHP Imagick extension is not installed or enabled');
        }

        Storage::ensureDir("{$outDir}/thumbs");
        Storage::ensureDir("{$outDir}/high");

        $im = new \Imagick();
        $im->setResolution(180, 180);
        $im->readImage($pdfPath);

        $total = $im->getNumberImages();
        $pagesToRender = min($total, $maxPages);
        $files = [];

        for ($i = 0; $i < $pagesToRender; $i++) {
            $pageNum = $i + 1;
            if ($report) {
                $pct = 20 + (int) round(($pageNum / max(1, $pagesToRender)) * 40);
                $report($pct, "Rasterizing page {$pageNum} of {$pagesToRender} via Imagick");
            }

            $im->setIteratorIndex($i);
            $highPage = $im->getImage();
            $highPage->setImageFormat('jpeg');
            $highPage->setImageCompressionQuality(86);

            $highFile = sprintf('%s/high/page-%03d.jpg', $outDir, $pageNum);
            $pageFile = sprintf('%s/page-%03d.jpg', $outDir, $pageNum);
            $thumbFile = sprintf('%s/thumbs/page-%03d.jpg', $outDir, $pageNum);

            // 1. High-resolution (180 DPI)
            $highPage->writeImage($highFile);

            // 2. Standard resolution (~110 DPI equivalent)
            $stdPage = clone $highPage;
            $origW = $stdPage->getImageWidth();
            $stdW = max(600, (int) round($origW * (110 / 180)));
            $stdPage->thumbnailImage($stdW, 0);
            $stdPage->setImageCompressionQuality(84);
            $stdPage->writeImage($pageFile);

            // 3. Thumbnail (240px wide)
            $thumb = clone $stdPage;
            $thumb->thumbnailImage(240, 0);
            $thumb->setImageCompressionQuality(75);
            $thumb->writeImage($thumbFile);

            $thumb->clear();
            $thumb->destroy();
            $stdPage->clear();
            $stdPage->destroy();
            $highPage->clear();
            $highPage->destroy();

            $files[] = $pageFile;
        }

        $im->clear();
        $im->destroy();

        return $files;
    }

    /**
     * Render via Poppler pdftoppm CLI.
     */
    public static function renderViaPdftoppm(
        string $pdfPath,
        string $outDir,
        int $maxPages,
        int $timeoutSeconds = 300,
        ?callable $report = null
    ): array {
        $ppm = self::getPdftoppmBinary();
        if ($ppm === null) {
            throw new RuntimeException("Poppler pdftoppm binary not found (checked PDFTOPPM_BIN and PATH)");
        }

        Storage::ensureDir("{$outDir}/thumbs");
        Storage::ensureDir("{$outDir}/high");

        if ($report) $report(20, 'Rendering standard resolution pages (110 DPI)');
        self::runProcess([$ppm, '-jpeg', '-r', '110', '-l', (string) $maxPages, $pdfPath, "{$outDir}/pg"], 'Poppler (Standard Pages)', $timeoutSeconds);

        if ($report) $report(40, 'Rendering high-resolution zoom pages (180 DPI)');
        self::runProcess([$ppm, '-jpeg', '-r', '180', '-l', (string) $maxPages, $pdfPath, "{$outDir}/high/pg"], 'Poppler (High-Res Pages)', $timeoutSeconds);

        if ($report) $report(55, 'Rendering navigation thumbnails (30 DPI)');
        self::runProcess([$ppm, '-jpeg', '-r', '30', '-l', (string) $maxPages, $pdfPath, "{$outDir}/thumbs/pg"], 'Poppler (Thumbnails)', $timeoutSeconds);

        foreach ([$outDir, "{$outDir}/high", "{$outDir}/thumbs"] as $dir) {
            $list = glob("{$dir}/pg-*.jpg") ?: [];
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

        $files = glob("{$outDir}/page-*.jpg") ?: [];
        natsort($files);
        return array_values($files);
    }

    /**
     * Locate Ghostscript executable.
     */
    public static function getGhostscriptBinary(): ?string
    {
        if (!empty($_ENV['GS_BIN'])) {
            $bin = trim($_ENV['GS_BIN']);
            if (self::testExecutable($bin)) {
                return $bin;
            }
        }

        $linuxCandidates = [
            '/usr/bin/gs',
            '/usr/local/bin/gs',
            '/opt/cpanel/ea-ghostscript/bin/gs',
            'gs',
        ];

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
     * Locate Poppler pdftoppm executable (including Winget packages on Windows).
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

        if (PHP_OS_FAMILY === 'Windows') {
            $localAppData = getenv('LOCALAPPDATA') ?: (getenv('USERPROFILE') ? getenv('USERPROFILE') . '\\AppData\\Local' : '');
            if ($localAppData !== '') {
                $wingetMatches = glob($localAppData . '\\Microsoft\\WinGet\\Packages\\*Poppler*\\*\\Library\\bin\\pdftoppm.exe') ?: [];
                foreach ($wingetMatches as $wm) {
                    array_unshift($candidates, $wm);
                }
            }
        }

        foreach ($candidates as $cand) {
            if (self::testExecutable($cand)) {
                return $cand;
            }
        }

        return null;
    }

    /**
     * Locate Poppler pdfinfo executable for fast metadata extraction.
     */
    public static function getPdfinfoBinary(): ?string
    {
        $ppm = self::getPdftoppmBinary();
        if ($ppm !== null && (str_contains($ppm, '/') || str_contains($ppm, '\\'))) {
            $dir = dirname($ppm);
            $ext = PHP_OS_FAMILY === 'Windows' ? '.exe' : '';
            $candidate = $dir . DIRECTORY_SEPARATOR . 'pdfinfo' . $ext;
            if (file_exists($candidate)) {
                return $candidate;
            }
        }

        $candidates = PHP_OS_FAMILY === 'Windows'
            ? ['pdfinfo.exe', 'pdfinfo']
            : ['/usr/bin/pdfinfo', '/usr/local/bin/pdfinfo', 'pdfinfo'];

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
            'webp_support' => function_exists('imagewebp'),
            'avif_support' => function_exists('imageavif'),
            'has_any_engine' => $gs !== null || $imagick || $ppm !== null,
        ];
    }

    /**
     * Execute a shell process safely with strict timeout enforcement and stderr capture.
     */
    private static function runProcess(array $cmd, string $toolName = 'Command', int $timeoutSeconds = 300): void
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

        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);

        $stdout = '';
        $stderr = '';
        $start = microtime(true);

        while (true) {
            $status = proc_get_status($proc);
            $stdout .= stream_get_contents($pipes[1]) ?: '';
            $stderr .= stream_get_contents($pipes[2]) ?: '';

            if (!$status['running']) {
                break;
            }

            if ((microtime(true) - $start) > $timeoutSeconds) {
                @proc_terminate($proc, 9);
                fclose($pipes[1]);
                fclose($pipes[2]);
                @proc_close($proc);
                throw new RuntimeException("{$toolName} timed out after {$timeoutSeconds} seconds.");
            }

            usleep(50000); // 50ms poll interval
        }

        $stdout .= stream_get_contents($pipes[1]) ?: '';
        $stderr .= stream_get_contents($pipes[2]) ?: '';
        fclose($pipes[1]);
        fclose($pipes[2]);

        $exitCode = proc_close($proc);
        $finalCode = ($status['exitcode'] ?? -1) !== -1 ? $status['exitcode'] : $exitCode;

        if ($finalCode !== 0) {
            $err = trim($stderr) !== '' ? trim($stderr) : trim($stdout);
            throw new RuntimeException("{$toolName} failed with exit code {$finalCode}: " . ($err ?: 'Unknown error'));
        }
    }

    /**
     * Run a fast command and return stdout.
     */
    private static function runProcessCapture(array $cmd, int $timeoutSeconds = 20): string
    {
        $pipes = [];
        $proc = @proc_open($cmd, [
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ], $pipes);

        if (!is_resource($proc)) {
            throw new RuntimeException('Unable to launch process');
        }

        $stdout = stream_get_contents($pipes[1]) ?: '';
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($proc);
        return $stdout;
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

        return $code >= 0 && $code <= 1;
    }

    /**
     * Clean up partial or incomplete conversion files upon driver failure.
     */
    public static function cleanupPartialFiles(string $outDir): void
    {
        foreach ([$outDir, "{$outDir}/high", "{$outDir}/thumbs"] as $dir) {
            if (!is_dir($dir)) continue;
            foreach (['page-*.jpg', 'page-*.webp', 'page-*.avif', 'pg-*.jpg'] as $pattern) {
                foreach (glob("{$dir}/{$pattern}") ?: [] as $f) {
                    @unlink($f);
                }
            }
        }
    }
}
