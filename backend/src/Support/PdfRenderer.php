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

        if (!str_contains($tail, '%%EOF')) {
            throw new RuntimeException('PDF validation failed: PDF is incomplete or corrupted (missing %%EOF trailer).');
        }

        $meta = self::extractMetadata($pdfPath);
        if (!empty($meta['encrypted'])) {
            throw new RuntimeException('PDF validation failed: Password-protected or encrypted PDFs cannot be converted. Please remove encryption first.');
        }

        // When metadata extraction cannot determine the page count the limit is NOT skipped:
        // it is flagged here and enforced against the real rendered page count (see JobRunner::convertPdf).
        $meta['page_count_verified'] = !empty($meta['page_count']) && (int) $meta['page_count'] > 0;

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
            $thumbWebpFile = "{$outDir}/thumbs/{$baseName}.webp";
            $highFile = "{$outDir}/high/{$baseName}.jpg";
            $highWebpFile = "{$outDir}/high/{$baseName}.webp";
            $webpFile = "{$outDir}/{$baseName}.webp";
            $avifFile = "{$outDir}/{$baseName}.avif";

            $isPngMaster = str_ends_with(strtolower($stdFile), '.png');
            $stdJpgFile = "{$outDir}/{$baseName}.jpg";

            $dims = @getimagesize($stdFile);
            $w = $dims ? (int) $dims[0] : 1400;
            $h = $dims ? (int) $dims[1] : 1900;

            // Generate crisp WebP, JPEG and Thumbnail derivatives directly from lossless PNG master (or JPEG)
            if (extension_loaded('gd')) {
                $im = $isPngMaster
                    ? (function_exists('imagecreatefrompng') ? @imagecreatefrompng($stdFile) : false)
                    : (function_exists('imagecreatefromjpeg') ? @imagecreatefromjpeg($stdFile) : false);

                if ($im !== false) {
                    // Level 2: Generate crisp WebP directly from master (~92 quality for sharp text)
                    if (function_exists('imagewebp')) {
                        @imagewebp($im, $webpFile, 92);
                    }

                    // Level 2: Generate standard JPEG fallback if master was PNG
                    if ($isPngMaster || !file_exists($stdJpgFile)) {
                        @imagejpeg($im, $stdJpgFile, 90);
                    }

                    // Level 1: Generate missing thumbnail (350–500px wide, target ~420px for rapid grid & preview)
                    if (!file_exists($thumbFile)) {
                        $thumbW = 420;
                        $thumbH = max(1, (int) round($h * ($thumbW / max(1, $w))));
                        $thumbIm = imagescale($im, $thumbW, $thumbH);
                        if ($thumbIm !== false) {
                            @imagejpeg($thumbIm, $thumbFile, 82);
                            if (function_exists('imagewebp')) {
                                @imagewebp($thumbIm, $thumbWebpFile, 80);
                            }
                            imagedestroy($thumbIm);
                        }
                    } elseif (function_exists('imagewebp') && !file_exists($thumbWebpFile)) {
                        $tIm = @imagecreatefromjpeg($thumbFile);
                        if ($tIm !== false) {
                            @imagewebp($tIm, $thumbWebpFile, 80);
                            imagedestroy($tIm);
                        }
                    }

                    // Level 2: Generate AVIF derivative if PHP GD was compiled with libavif support
                    if (function_exists('imageavif')) {
                        @imageavif($im, $avifFile, 70);
                    }

                    imagedestroy($im);
                }

                // Delete temporary PNG master to conserve storage
                if ($isPngMaster && file_exists($stdJpgFile) && filesize($stdJpgFile) > 0) {
                    @unlink($stdFile);
                }
            }

            $finalStd = file_exists($stdJpgFile) ? $stdJpgFile : $stdFile;

            $results[] = [
                'page_number' => $pageNum,
                'standard' => $finalStd,
                'high_res' => file_exists($highFile) ? $highFile : $finalStd,
                'webp' => (file_exists($webpFile) && filesize($webpFile) > 0) ? $webpFile : null,
                'avif' => (file_exists($avifFile) && filesize($avifFile) > 0) ? $avifFile : null,
                'thumb' => file_exists($thumbFile) ? $thumbFile : $finalStd,
                'width' => $w,
                'height' => $h,
            ];
        }

        $report(100, 'Conversion complete');
        return $results;
    }

    /**
     * Extract per-page text content (for full-text search & screen-reader mode)
     * and automatically generate a Table of Contents (TOC) from PDF bookmarks/headings.
     *
     * @return array{pages_text: array<int, string>, toc: array<int, array{title: string, page: int, level: int}>}
     */
    public static function extractPageTextAndToc(string $pdfPath, int $pageCount): array
    {
        $pagesText = [];
        $toc = [];

        if (!file_exists($pdfPath) || $pageCount <= 0) {
            return ['pages_text' => $pagesText, 'toc' => $toc];
        }

        // 1. Use Poppler pdftotext if available (extracts all pages separated by form-feed \x0C)
        $pdftotext = self::getPdftotextBinary();
        if ($pdftotext !== null) {
            try {
                $tmpTxt = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'flipex_txt_' . bin2hex(random_bytes(6)) . '.txt';
                self::runProcess([$pdftotext, '-enc', 'UTF-8', '-l', (string) $pageCount, $pdfPath, $tmpTxt], 'pdftotext', 60);
                if (file_exists($tmpTxt)) {
                    $rawText = file_get_contents($tmpTxt) ?: '';
                    @unlink($tmpTxt);
                    $splits = explode("\f", $rawText);
                    for ($i = 0; $i < min($pageCount, count($splits)); $i++) {
                        $clean = trim(preg_replace("/[ \t]+/", ' ', $splits[$i]) ?? '');
                        if ($clean !== '') {
                            $pagesText[$i + 1] = mb_substr($clean, 0, 15000);
                        }
                    }
                }
            } catch (Throwable) {
                // Fallback below
            }
        }

        // 2. Fallback: Ghostscript txtwrite device if pdftotext wasn't used
        if (empty($pagesText)) {
            $gs = self::getGhostscriptBinary();
            if ($gs !== null) {
                try {
                    for ($p = 1; $p <= min($pageCount, 100); $p++) {
                        $out = self::runProcessCapture([
                            $gs, '-q', '-dNOPAUSE', '-dBATCH', '-dSAFER',
                            '-sDEVICE=txtwrite', "-dFirstPage={$p}", "-dLastPage={$p}",
                            '-sOutputFile=-', $pdfPath
                        ], 15);
                        $clean = trim(preg_replace("/[ \t]+/", ' ', $out) ?? '');
                        if ($clean !== '') {
                            $pagesText[$p] = mb_substr($clean, 0, 15000);
                        }
                    }
                } catch (Throwable) {
                }
            }
        }

        // 3. Build Automatic Table of Contents (TOC) from extracted page headings
        $seenTitles = [];
        for ($p = 1; $p <= $pageCount; $p++) {
            $txt = $pagesText[$p] ?? '';
            if ($p === 1) {
                $firstLine = self::detectHeadingLine($txt) ?: 'Cover Page';
                $toc[] = ['title' => $firstLine, 'page' => 1, 'level' => 1];
                $seenTitles[strtolower($firstLine)] = true;
                continue;
            }
            $heading = self::detectHeadingLine($txt);
            if ($heading !== null) {
                $key = strtolower($heading);
                if (!isset($seenTitles[$key])) {
                    $seenTitles[$key] = true;
                    $toc[] = ['title' => $heading, 'page' => $p, 'level' => 1];
                }
            }
        }

        // Ensure TOC has reasonable entries if pages had minimal headings
        if (count($toc) <= 1 && $pageCount > 1) {
            $step = $pageCount <= 12 ? 2 : ($pageCount <= 30 ? 4 : 8);
            for ($p = 2; $p <= $pageCount; $p += $step) {
                $snippet = isset($pagesText[$p]) ? mb_substr( strtok($pagesText[$p], "\n") ?: '', 0, 48) : '';
                $title = $snippet !== '' ? "Page {$p}: {$snippet}" : "Page {$p}";
                $toc[] = ['title' => $title, 'page' => $p, 'level' => 1];
            }
        }

        return [
            'pages_text' => $pagesText,
            'toc' => array_slice($toc, 0, 40),
        ];
    }

    private static function detectHeadingLine(string $pageText): ?string
    {
        if ($pageText === '') return null;
        $lines = array_values(array_filter(array_map('trim', explode("\n", $pageText)), static fn($l) => $l !== ''));
        foreach (array_slice($lines, 0, 5) as $line) {
            // Skip pure page numbers or dates or tiny fragments
            if (preg_match('/^\d+$/', $line) || mb_strlen($line) < 4 || mb_strlen($line) > 75) {
                continue;
            }
            // Good candidate heading line
            if (preg_match('/^(chapter|section|part|contents|introduction|overview|editorial|message|report|summary|newsletter|term|feature|notice|[A-Z][A-Za-z0-9\s\-\:&,]{3,65})$/i', $line)) {
                return $line;
            }
        }
        return isset($lines[0]) && mb_strlen($lines[0]) >= 4 && mb_strlen($lines[0]) <= 65 ? $lines[0] : null;
    }

    /**
     * Locate Poppler pdftotext executable for fast full-text & TOC extraction.
     */
    public static function getPdftotextBinary(): ?string
    {
        $ppm = self::getPdftoppmBinary();
        if ($ppm !== null && (str_contains($ppm, '/') || str_contains($ppm, '\\'))) {
            $dir = dirname($ppm);
            $ext = PHP_OS_FAMILY === 'Windows' ? '.exe' : '';
            $candidate = $dir . DIRECTORY_SEPARATOR . 'pdftotext' . $ext;
            if (file_exists($candidate)) {
                return $candidate;
            }
        }

        $candidates = PHP_OS_FAMILY === 'Windows'
            ? ['pdftotext.exe', 'pdftotext']
            : ['/usr/bin/pdftotext', '/usr/local/bin/pdftotext', 'pdftotext'];

        foreach ($candidates as $cand) {
            if (self::testExecutable($cand)) {
                return $cand;
            }
        }

        return null;
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
            '-dTextAlphaBits=4',
            '-dGraphicsAlphaBits=4',
            "-dLastPage={$maxPages}",
        ];

        // Level 2: Standard reading (~1,200–1,600px wide, 165 DPI) rendered directly to lossless PNG master
        if ($report) $report(20, 'Rendering standard resolution pages (165 DPI lossless PNG master)');
        $mainCmd = array_merge($base, ['-sDEVICE=png16m', '-r165', "-sOutputFile={$outDir}/master-%03d.png", $pdfPath]);
        self::runProcess($mainCmd, 'Ghostscript (Standard Pages)', $timeoutSeconds);

        // Single-Pass Optimization: When PHP GD is loaded, renderMultiResolution() scales both .jpg and .webp
        // thumbnails directly from the in-memory 165 DPI PNG master, eliminating a redundant second full-PDF Ghostscript pass.
        if (!extension_loaded('gd') || !function_exists('imagescale')) {
            if ($report) $report(45, 'Rendering navigation thumbnails (50 DPI)');
            $thumbCmd = array_merge($base, ['-sDEVICE=jpeg', '-dJPEGQ=82', '-r50', "-sOutputFile={$outDir}/thumbs/page-%03d.jpg", $pdfPath]);
            self::runProcess($thumbCmd, 'Ghostscript (Thumbnails)', $timeoutSeconds);
        }

        $files = glob("{$outDir}/master-*.png") ?: glob("{$outDir}/page-*.jpg") ?: [];
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
        $im->setResolution(165, 165);
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
            $page = $im->getImage();
            $page->setImageFormat('png24');

            $masterFile = sprintf('%s/master-%03d.png', $outDir, $pageNum);
            $page->writeImage($masterFile);

            // Thumbnail Level 1
            $thumb = clone $page;
            $origW = $thumb->getImageWidth();
            $thumbW = max(350, min(500, (int) round($origW * (50 / 165))));
            $thumb->thumbnailImage($thumbW, 0);
            $thumb->setImageFormat('jpeg');
            $thumb->setImageCompressionQuality(82);
            $thumb->writeImage(sprintf('%s/thumbs/page-%03d.jpg', $outDir, $pageNum));

            $thumb->clear();
            $thumb->destroy();
            $page->clear();
            $page->destroy();

            $files[] = $masterFile;
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

        // Level 2: Standard reading (~1,200–1,600px wide, 165 DPI lossless PNG master)
        if ($report) $report(20, 'Rendering standard resolution pages (165 DPI lossless PNG master)');
        self::runProcess([$ppm, '-png', '-r', '165', '-l', (string) $maxPages, $pdfPath, "{$outDir}/master"], 'Poppler (Standard Pages)', $timeoutSeconds);

        // Single-Pass Optimization: Skip redundant second Poppler pass when PHP GD scales thumbnails in memory
        if (!extension_loaded('gd') || !function_exists('imagescale')) {
            if ($report) $report(45, 'Rendering navigation thumbnails (50 DPI)');
            self::runProcess([$ppm, '-jpeg', '-r', '50', '-l', (string) $maxPages, $pdfPath, "{$outDir}/thumbs/pg"], 'Poppler (Thumbnails)', $timeoutSeconds);

            // Normalize thumbnail filenames
            $thumbList = glob("{$outDir}/thumbs/pg-*.jpg") ?: [];
            if ($thumbList) {
                natsort($thumbList);
                foreach (array_values($thumbList) as $i => $src) {
                    $target = sprintf('%s/thumbs/page-%03d.jpg', $outDir, $i + 1);
                    if ($src !== $target) {
                        @rename($src, $target);
                    }
                }
            }
        }

        // Normalize master filenames (master-1.png -> master-001.png)
        $masterList = glob("{$outDir}/master-*.png") ?: [];
        if ($masterList) {
            natsort($masterList);
            foreach (array_values($masterList) as $i => $src) {
                $target = sprintf('%s/master-%03d.png', $outDir, $i + 1);
                if ($src !== $target) {
                    @rename($src, $target);
                }
            }
        }

        $files = glob("{$outDir}/master-*.png") ?: glob("{$outDir}/page-*.jpg") ?: [];
        natsort($files);
        return array_values($files);
    }

    /**
     * Instant Page-1 Cover Renderer (< 1 second).
     * Rasterizes only Page 1 immediately upon job start so the publisher Dashboard card
     * displays the live cover thumbnail at ~8% conversion progress while pages 2..N render.
     *
     * @return array{page_number:int, standard:string, webp:?string, thumb:string, width:int, height:int}|null
     */
    public static function renderSinglePagePreview(string $pdfPath, string $outDir, int $pageNumber = 1): ?array
    {
        if (!file_exists($pdfPath) || $pageNumber < 1) {
            return null;
        }

        Storage::ensureDir($outDir);
        Storage::ensureDir("{$outDir}/thumbs");
        Storage::ensureDir("{$outDir}/high");

        $baseName = sprintf('page-%03d', $pageNumber);
        $masterPng = sprintf('%s/master-%03d.png', $outDir, $pageNumber);
        $stdJpg = "{$outDir}/{$baseName}.jpg";
        $webpFile = "{$outDir}/{$baseName}.webp";
        $thumbJpg = "{$outDir}/thumbs/{$baseName}.jpg";
        $thumbWebp = "{$outDir}/thumbs/{$baseName}.webp";

        try {
            $gs = self::getGhostscriptBinary();
            $ppm = self::getPdftoppmBinary();

            if ($gs !== null) {
                self::runProcess(
                    [
                        $gs,
                        '-q',
                        '-dNOPAUSE',
                        '-dBATCH',
                        '-dSAFER',
                        '-sDEVICE=png16m',
                        '-dTextAlphaBits=4',
                        '-dGraphicsAlphaBits=4',
                        "-dFirstPage={$pageNumber}",
                        "-dLastPage={$pageNumber}",
                        '-r165',
                        "-sOutputFile={$masterPng}",
                        $pdfPath,
                    ],
                    'Ghostscript (Instant Cover Preview)',
                    25
                );
            } elseif ($ppm !== null) {
                $tmpPrefix = "{$outDir}/cov_tmp";
                self::runProcess(
                    [$ppm, '-png', '-f', (string) $pageNumber, '-l', (string) $pageNumber, '-r', '165', $pdfPath, $tmpPrefix],
                    'Poppler (Instant Cover Preview)',
                    25
                );
                $matches = glob("{$tmpPrefix}*.png") ?: [];
                if (!empty($matches)) {
                    @rename($matches[0], $masterPng);
                }
            }

            if (!file_exists($masterPng)) {
                return null;
            }

            $dims = @getimagesize($masterPng);
            $w = $dims ? (int) $dims[0] : 1400;
            $h = $dims ? (int) $dims[1] : 1900;

            if (extension_loaded('gd') && function_exists('imagecreatefrompng')) {
                $im = @imagecreatefrompng($masterPng);
                if ($im !== false) {
                    @imagejpeg($im, $stdJpg, 90);
                    if (function_exists('imagewebp')) {
                        @imagewebp($im, $webpFile, 92);
                    }
                    $thumbW = 420;
                    $thumbH = max(1, (int) round($h * ($thumbW / max(1, $w))));
                    $thumbIm = imagescale($im, $thumbW, $thumbH);
                    if ($thumbIm !== false) {
                        @imagejpeg($thumbIm, $thumbJpg, 82);
                        if (function_exists('imagewebp')) {
                            @imagewebp($thumbIm, $thumbWebp, 80);
                        }
                        imagedestroy($thumbIm);
                    }
                    imagedestroy($im);
                }
            }

            if (!file_exists($stdJpg)) {
                return null;
            }

            return [
                'page_number' => $pageNumber,
                'standard' => $stdJpg,
                'webp' => file_exists($webpFile) ? $webpFile : null,
                'thumb' => file_exists($thumbJpg) ? $thumbJpg : $stdJpg,
                'width' => $w,
                'height' => $h,
            ];
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Extract embedded PDF hyperlink annotations (/Subtype /Link with /URI + /Rect)
     * and convert PDF bottom-left point coordinates into top-left CSS percentages (0..100%).
     *
     * @return array<int, array{page_number:int, type:string, x:float, y:float, w:float, h:float, payload:array<string,mixed>}>
     */
    public static function extractPdfLinks(string $pdfPath, int $pageCount): array
    {
        if (!file_exists($pdfPath) || $pageCount <= 0) {
            return [];
        }
        $size = @filesize($pdfPath) ?: 0;
        if ($size <= 0 || $size > 40 * 1024 * 1024) {
            return [];
        }

        $raw = @file_get_contents($pdfPath);
        if (!$raw || !str_contains($raw, '/URI')) {
            return [];
        }

        // Detect default MediaBox dimensions (default US Letter 612 x 792 pt)
        $pageW = 612.0;
        $pageH = 792.0;
        if (preg_match('/\/MediaBox\s*\[\s*([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s*\]/', $raw, $mb)) {
            $wPt = abs((float) $mb[3] - (float) $mb[1]);
            $hPt = abs((float) $mb[4] - (float) $mb[2]);
            if ($wPt > 50 && $hPt > 50) {
                $pageW = $wPt;
                $pageH = $hPt;
            }
        }

        // Match PDF Link annotation dictionaries containing both /Rect [...] and /URI (...)
        $extracted = [];
        $seen = [];
        $pattern = '/<<(?:(?!>>).){0,1200}?\/Subtype\s*\/Link(?:(?!>>).){0,1200}?>>/s';
        if (preg_match_all($pattern, $raw, $blocks)) {
            foreach ($blocks[0] as $idx => $block) {
                if (!preg_match('/\/Rect\s*\[\s*([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s+([0-9.\-]+)\s*\]/', $block, $rm)) {
                    continue;
                }
                if (!preg_match('/\/URI\s*\(([^\)\\\\]*(?:\\\\.[^\)\\\\]*)*)\)/', $block, $um)) {
                    continue;
                }
                $uri = trim(stripcslashes($um[1]));
                if ($uri === '' || (!str_starts_with($uri, 'http://') && !str_starts_with($uri, 'https://') && !str_starts_with($uri, 'mailto:'))) {
                    continue;
                }

                $x1 = min((float) $rm[1], (float) $rm[3]);
                $y1 = min((float) $rm[2], (float) $rm[4]);
                $x2 = max((float) $rm[1], (float) $rm[3]);
                $y2 = max((float) $rm[2], (float) $rm[4]);

                $xPct = max(0.0, min(96.0, round(($x1 / $pageW) * 100, 1)));
                // PDF Y-origin is bottom-left; flip to top-left CSS percentage
                $yPct = max(0.0, min(96.0, round((1.0 - ($y2 / $pageH)) * 100, 1)));
                $wPct = max(3.0, min(100.0 - $xPct, round((($x2 - $x1) / $pageW) * 100, 1)));
                $hPct = max(2.5, min(100.0 - $yPct, round((($y2 - $y1) / $pageH) * 100, 1)));

                $estimatedPage = min($pageCount, max(1, (int) ceil((($idx + 1) / max(1, count($blocks[0]))) * $pageCount)));
                $dedupeKey = "{$estimatedPage}:{$uri}:{$xPct}:{$yPct}";
                if (isset($seen[$dedupeKey])) {
                    continue;
                }
                $seen[$dedupeKey] = true;

                $hostLabel = parse_url($uri, PHP_URL_HOST) ?: 'Open Link';
                $isVideo = (bool) preg_match('/(youtube\.com|youtu\.be|vimeo\.com|\.mp4$)/i', $uri);
                $type = $isVideo ? 'video' : 'link';

                $extracted[] = [
                    'page_number' => $estimatedPage,
                    'type' => $type,
                    'x' => $xPct,
                    'y' => $yPct,
                    'w' => $wPct,
                    'h' => $hPct,
                    'payload' => [
                        'title' => $isVideo ? 'Watch Video' : $hostLabel,
                        'url' => $uri,
                        'subType' => $type,
                        'autoExtracted' => true,
                    ],
                ];

                if (count($extracted) >= 120) {
                    break;
                }
            }
        }

        return $extracted;
    }

    /**
     * Level 3: On-Demand High-Resolution Page Renderer (280 DPI, ~2,400–2,800px wide).
     * Renders only the specific page requested when the user zooms in, caching to high/page-XXX.webp and .jpg.
     */
    public static function renderSinglePageHighRes(string $pdfPath, string $outDir, int $pageNumber): ?string
    {
        if (!file_exists($pdfPath) || $pageNumber < 1) {
            return null;
        }

        Storage::ensureDir("{$outDir}/high");
        $baseName = sprintf('page-%03d', $pageNumber);
        foreach (["{$outDir}/high/{$baseName}.webp", "{$outDir}/high/{$baseName}.jpg"] as $cached) {
            if (is_file($cached) && filesize($cached) > 0) {
                return $cached;
            }
        }

        // Per-publication/page generation lock: only ONE request renders a given page; concurrent readers get
        // null immediately and are served the standard-resolution page instead of duplicating CPU-heavy work.
        $lock = @fopen("{$outDir}/high/.lock-{$baseName}", 'c');
        if (!$lock) {
            return null;
        }
        try {
            if (!flock($lock, LOCK_EX | LOCK_NB)) {
                return null;
            }
            try {
                return self::renderSinglePageHighResLocked($pdfPath, $outDir, $pageNumber);
            } finally {
                flock($lock, LOCK_UN);
            }
        } finally {
            fclose($lock);
        }
    }

    private static function renderSinglePageHighResLocked(string $pdfPath, string $outDir, int $pageNumber): ?string
    {

        Storage::ensureDir("{$outDir}/high");
        $baseName = sprintf('page-%03d', $pageNumber);
        $highJpg = "{$outDir}/high/{$baseName}.jpg";
        $highWebp = "{$outDir}/high/{$baseName}.webp";

        if (file_exists($highWebp) && filesize($highWebp) > 0) {
            return $highWebp;
        }
        if (file_exists($highJpg) && filesize($highJpg) > 0) {
            return $highJpg;
        }

        $tmpPrefix = "{$outDir}/high/tmp_hi_{$pageNumber}_" . bin2hex(random_bytes(4));
        $driver = self::resolveDriver();

        try {
            if ($driver === self::DRIVER_PDFTOPPM || self::getPdftoppmBinary() !== null) {
                $ppm = self::getPdftoppmBinary();
                if ($ppm !== null) {
                    self::runProcess(
                        [$ppm, '-png', '-f', (string) $pageNumber, '-l', (string) $pageNumber, '-r', '280', $pdfPath, $tmpPrefix],
                        'Poppler (On-Demand High-Res)',
                        60
                    );
                    $tmpMatches = glob("{$tmpPrefix}*.png") ?: [];
                    if (!empty($tmpMatches)) {
                        $rawPng = $tmpMatches[0];
                        if (extension_loaded('gd') && function_exists('imagecreatefrompng')) {
                            $im = @imagecreatefrompng($rawPng);
                            if ($im !== false) {
                                if (function_exists('imagewebp')) {
                                    @imagewebp($im, $highWebp, 90);
                                }
                                @imagejpeg($im, $highJpg, 88);
                                imagedestroy($im);
                            }
                        }
                        @unlink($rawPng);
                    }
                }
            } elseif ($driver === self::DRIVER_GHOSTSCRIPT || self::getGhostscriptBinary() !== null) {
                $gs = self::getGhostscriptBinary();
                if ($gs !== null) {
                    $rawPng = "{$tmpPrefix}.png";
                    self::runProcess(
                        [
                            $gs,
                            '-q',
                            '-dNOPAUSE',
                            '-dBATCH',
                            '-dSAFER',
                            '-sDEVICE=png16m',
                            '-dTextAlphaBits=4',
                            '-dGraphicsAlphaBits=4',
                            "-dFirstPage={$pageNumber}",
                            "-dLastPage={$pageNumber}",
                            '-r280',
                            "-sOutputFile={$rawPng}",
                            $pdfPath,
                        ],
                        'Ghostscript (On-Demand High-Res)',
                        60
                    );
                    if (file_exists($rawPng)) {
                        if (extension_loaded('gd') && function_exists('imagecreatefrompng')) {
                            $im = @imagecreatefrompng($rawPng);
                            if ($im !== false) {
                                if (function_exists('imagewebp')) {
                                    @imagewebp($im, $highWebp, 90);
                                }
                                @imagejpeg($im, $highJpg, 88);
                                imagedestroy($im);
                            }
                        }
                        @unlink($rawPng);
                    }
                }
            }
        } catch (Throwable $e) {
            error_log("[PdfRenderer] On-demand high-res render failed for page {$pageNumber}: " . $e->getMessage());
        }

        return file_exists($highWebp) ? $highWebp : (file_exists($highJpg) ? $highJpg : null);
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
     * Supports proc_open with automatic fallback to exec() on shared/cPanel hosts where proc_open is restricted.
     */
    private static function runProcess(array $cmd, string $toolName = 'Command', int $timeoutSeconds = 300): void
    {
        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        $canProcOpen = function_exists('proc_open') && !in_array('proc_open', $disabled, true);

        if (!$canProcOpen) {
            if (!function_exists('exec') || in_array('exec', $disabled, true)) {
                throw new RuntimeException("Both proc_open and exec are disabled on this server; cannot run {$toolName}.");
            }
            $cmdStr = implode(' ', array_map('escapeshellarg', $cmd)) . ' 2>&1';
            $output = [];
            $code = 0;
            @exec($cmdStr, $output, $code);
            if ($code !== 0) {
                throw new RuntimeException("{$toolName} failed with exit code {$code}: " . implode("\n", $output));
            }
            return;
        }

        $pipes = [];
        $proc = @proc_open($cmd, [
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ], $pipes);

        if (!is_resource($proc)) {
            $cmdStr = implode(' ', array_map('escapeshellarg', $cmd));
            if (function_exists('exec') && !in_array('exec', $disabled, true)) {
                $output = [];
                $code = 0;
                @exec($cmdStr . ' 2>&1', $output, $code);
                if ($code !== 0) {
                    throw new RuntimeException("{$toolName} failed with exit code {$code}: " . implode("\n", $output));
                }
                return;
            }
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
        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        $canProcOpen = function_exists('proc_open') && !in_array('proc_open', $disabled, true);

        if (!$canProcOpen) {
            if (function_exists('exec') && !in_array('exec', $disabled, true)) {
                $output = [];
                @exec(implode(' ', array_map('escapeshellarg', $cmd)), $output);
                return implode("\n", $output);
            }
            throw new RuntimeException('Unable to launch process');
        }

        $pipes = [];
        $proc = @proc_open($cmd, [
            1 => ['pipe', 'w'],
            2 => ['pipe', 'w'],
        ], $pipes);

        if (!is_resource($proc)) {
            if (function_exists('exec') && !in_array('exec', $disabled, true)) {
                $output = [];
                @exec(implode(' ', array_map('escapeshellarg', $cmd)), $output);
                return implode("\n", $output);
            }
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

        $disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
        if (!function_exists('proc_open') || in_array('proc_open', $disabled, true)) {
            if (function_exists('exec') && !in_array('exec', $disabled, true)) {
                $out = [];
                $code = 127;
                @exec(escapeshellarg($path) . ' -v > /dev/null 2>&1', $out, $code);
                return $code >= 0 && $code <= 1;
            }
            return false;
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
