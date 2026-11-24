<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Server-side page renderer: Studio canvas elements -> a self-contained, script-free SVG.
 *
 * Why server side: published pages are stored as files and shown in <img>/reader contexts where an
 * SVG cannot fetch anything external and cannot use foreignObject reliably. So images are embedded as
 * data URIs (bundled stock art, the tenant's own uploaded assets, or inline raster data) and text is
 * laid out as plain <text>. Every interpolated value is escaped or validated. The result is also run
 * through SvgSafety::isSafe() before it is written.
 */
final class StudioSvgRenderer
{
    private const MAX_INLINE_IMAGE = 3 * 1024 * 1024;

    public static function esc(mixed $v): string
    {
        return htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE | ENT_XML1, 'UTF-8');
    }

    private static function num(mixed $v, float $d): float
    {
        return is_numeric($v) && is_finite((float) $v) ? (float) $v : $d;
    }

    private static function n(float $v): string
    {
        return rtrim(rtrim(number_format($v, 2, '.', ''), '0'), '.') ?: '0';
    }

    /** Paint/colour value: hex, rgb(a)/hsl(a), or a plain keyword. Anything else falls back. */
    private static function color(mixed $v, string $fallback): string
    {
        $c = trim((string) $v);
        if (preg_match('/^#[0-9a-f]{3,8}$/i', $c) || preg_match('/^(rgb|hsl)a?\(\s*[\d.%\s,\/-]+\)$/i', $c) || preg_match('/^[a-z]{3,20}$/i', $c)) {
            return $c;
        }
        return $fallback;
    }

    private static function font(mixed $v): string
    {
        $f = trim((string) $v);
        $f = preg_replace('/[^\w\s,\-]/u', '', $f) ?? '';
        return $f !== '' ? $f . ', Helvetica, Arial, sans-serif' : 'Helvetica, Arial, sans-serif';
    }

    private static function id(mixed $v): string
    {
        return preg_replace('/[^\w-]/', '', (string) $v) ?: 'x';
    }

    /** Resolve an image reference to a data: URI we are willing to embed, or null. */
    public static function imageData(mixed $ref, int $tenantId): ?string
    {
        $r = trim((string) $ref);
        if ($r === '') {
            return null;
        }
        if (preg_match('#^data:image/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$#', $r) && strlen($r) <= self::MAX_INLINE_IMAGE * 1.4) {
            return $r;
        }
        if (preg_match('#studio-stock/([a-z0-9_]+)(?:\.svg)?(?:[?\#].*)?$#', $r, $m) || preg_match('#^stock:([a-z0-9_]+)$#', $r, $m)) {
            return StockLibrary::dataUri($m[1]);
        }
        // The tenant's own uploaded asset (signed URL carries ?path=tenants/{id}/studio/file.ext).
        $query = (string) parse_url($r, PHP_URL_QUERY);
        parse_str($query, $q);
        $path = (string) ($q['path'] ?? '');
        if ($path !== '' && $tenantId > 0 && preg_match('#^tenants/' . $tenantId . '/studio/[a-f0-9]{8,64}\.(png|jpg|jpeg|webp|gif|svg)$#', $path, $pm)) {
            $full = Storage::root() . '/' . $path;
            if (is_file($full) && filesize($full) <= self::MAX_INLINE_IMAGE) {
                $bytes = (string) file_get_contents($full);
                $ext = $pm[1];
                if ($ext === 'svg') {
                    return SvgSafety::isSafe($bytes) ? 'data:image/svg+xml;base64,' . base64_encode($bytes) : null;
                }
                $mime = $ext === 'jpg' ? 'jpeg' : $ext;
                return 'data:image/' . $mime . ';base64,' . base64_encode($bytes);
            }
        }
        return null;
    }

    private static function imageRef(array $el): string
    {
        foreach (['src', 'image', 'url', 'photoUrl'] as $k) {
            if (!empty($el[$k]) && is_string($el[$k])) {
                return $el[$k];
            }
        }
        return (string) ($el['assetRef']['url'] ?? '');
    }

    /** Wrap text to a pixel width using an average-glyph-width estimate. */
    private static function wrap(string $text, float $width, float $fontSize, bool $bold, float $spacing = 0.0, bool $upper = false): array
    {
        $avg = $fontSize * ($bold ? 0.6 : 0.54) * ($upper ? 1.12 : 1.0) + $spacing;
        $max = max(1, (int) floor($width / $avg));
        $lines = [];
        foreach (preg_split('/\R/u', $text) ?: [''] as $para) {
            $words = preg_split('/\s+/u', trim($para), -1, PREG_SPLIT_NO_EMPTY) ?: [];
            if (!$words) {
                $lines[] = '';
                continue;
            }
            $cur = '';
            foreach ($words as $w) {
                $try = $cur === '' ? $w : $cur . ' ' . $w;
                if (mb_strlen($try) > $max && $cur !== '') {
                    $lines[] = $cur;
                    $cur = $w;
                } else {
                    $cur = $try;
                }
            }
            $lines[] = $cur;
        }
        return $lines;
    }

    /** @param array<string,mixed> $page  @return string complete <svg> document */
    public static function renderPage(array $page, float $wPt, float $hPt, int $tenantId, int $pageNumber = 1): string
    {
        $wPt = max(50.0, min(5000.0, $wPt));
        $hPt = max(50.0, min(5000.0, $hPt));
        $bg = is_array($page['background'] ?? null) ? $page['background'] : [];
        $defs = '';
        $fill = '#ffffff';
        $bgVal = (string) ($bg['value'] ?? $bg['color'] ?? '');
        if (($bg['type'] ?? '') === 'gradient' || str_contains($bgVal, 'gradient') || isset($bg['stop1'])) {
            $stops = [];
            if (!empty($bg['stops']) && is_array($bg['stops'])) {
                foreach ($bg['stops'] as $s) {
                    $stops[] = is_array($s) ? ($s['color'] ?? $s['value'] ?? '#0f172a') : $s;
                }
            }
            $stops = $stops ?: [$bg['stop1'] ?? '#0f172a', $bg['stop2'] ?? '#0369a1', $bg['stop3'] ?? '#0284c7'];
            $defs .= '<linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">';
            $cnt = max(1, count($stops) - 1);
            foreach (array_values($stops) as $i => $c) {
                $defs .= '<stop offset="' . self::n($i / $cnt) . '" stop-color="' . self::esc(self::color($c, '#0f172a')) . '"/>';
            }
            $defs .= '</linearGradient>';
            $fill = 'url(#bgGrad)';
        } elseif ($bgVal !== '') {
            $fill = self::color($bgVal, '#ffffff');
        }

        $body = '<rect width="' . self::n($wPt) . '" height="' . self::n($hPt) . '" fill="' . self::esc($fill) . '"/>';

        $elements = is_array($page['elements'] ?? null) ? $page['elements'] : [];
        usort($elements, fn($a, $b) => (int) ($a['zIndex'] ?? $a['style']['zIndex'] ?? 0) <=> (int) ($b['zIndex'] ?? $b['style']['zIndex'] ?? 0));
        $i = 0;
        foreach ($elements as $el) {
            if (!is_array($el) || ($el['hidden'] ?? false) === true) {
                continue;
            }
            $i++;
            $body .= self::renderElement($el, $i, $tenantId, $pageNumber, $defs);
        }

        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' . self::n($wPt) . ' ' . self::n($hPt)
            . '" width="' . self::n($wPt) . '" height="' . self::n($hPt) . '"><defs>' . $defs . '</defs>' . $body . '</svg>';
        return $svg;
    }

    private static function renderElement(array $el, int $i, int $tenantId, int $pageNumber, string &$defs): string
    {
        $style = is_array($el['style'] ?? null) ? $el['style'] : [];
        $frame = is_array($el['frame'] ?? null) ? $el['frame'] : [];
        $x = self::num($el['x'] ?? $frame['x'] ?? 0, 0);
        $y = self::num($el['y'] ?? $frame['y'] ?? 0, 0);
        $w = max(1, min(5000, self::num($el['w'] ?? $frame['width'] ?? 100, 100)));
        $h = max(1, min(5000, self::num($el['h'] ?? $frame['height'] ?? 50, 50)));
        $rot = self::num($el['rotation'] ?? ($el['transform']['rotation'] ?? 0), 0);
        $opacity = max(0, min(1, self::num($style['opacity'] ?? ($el['transform']['opacity'] ?? 1), 1)));
        $type = (string) ($el['type'] ?? '');
        $gAttr = ($rot ? ' transform="rotate(' . self::n($rot) . ' ' . self::n($x + $w / 2) . ' ' . self::n($y + $h / 2) . ')"' : '')
            . ($opacity < 1 ? ' opacity="' . self::n($opacity) . '"' : '');
        $out = '';
        $clip = 'c' . $i;

        $img = null;
        if (in_array($type, ['image', 'imageFrame', 'product', 'productCard', 'studentCard'], true)) {
            $img = self::imageData(self::imageRef($el), $tenantId);
        }

        switch ($type) {
            case 'image':
            case 'imageFrame':
                $r = self::num($style['borderRadius'] ?? 0, 0);
                $defs .= '<clipPath id="' . $clip . '"><rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="' . self::n($r) . '"/></clipPath>';
                $out = $img
                    ? '<image href="' . self::esc($img) . '" x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' . $clip . ')"/>'
                    : '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="' . self::n($r) . '" fill="#e2e8f0"/>';
                break;

            case 'shape':
                $fillC = self::color($style['backgroundColor'] ?? '#0284c7', '#0284c7');
                $rx = ($el['shapeType'] ?? '') === 'circle' ? min($w, $h) / 2 : self::num($style['borderRadius'] ?? 0, 0);
                $bw = self::num($style['borderWidth'] ?? 0, 0);
                $out = '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="' . self::n($rx) . '" fill="' . self::esc($fillC) . '"'
                    . ($bw > 0 ? ' stroke="' . self::esc(self::color($style['borderColor'] ?? '#000000', '#000000')) . '" stroke-width="' . self::n($bw) . '"' : '') . '/>';
                break;

            case 'text':
            case 'column_text':
            case 'article':
            case 'richText':
                $out = self::text($el, $style, $x, $y, $w, $h, $clip, $defs);
                break;

            case 'product':
            case 'productCard':
                $name = self::esc(mb_substr((string) ($el['name'] ?? 'Product'), 0, 60));
                $price = self::esc((string) ($el['price'] ?? ''));
                $old = self::esc((string) ($el['originalPrice'] ?? ''));
                $badge = self::esc((string) ($el['badge'] ?? ''));
                $sku = self::esc((string) ($el['sku'] ?? ''));
                $defs .= '<clipPath id="' . $clip . '"><rect x="' . self::n($x + 8) . '" y="' . self::n($y + 8) . '" width="' . self::n($w - 16) . '" height="' . self::n($h * 0.5) . '" rx="8"/></clipPath>';
                $out = '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="12" fill="#ffffff" stroke="#e2e8f0"/>'
                    . ($img ? '<image href="' . self::esc($img) . '" x="' . self::n($x + 8) . '" y="' . self::n($y + 8) . '" width="' . self::n($w - 16) . '" height="' . self::n($h * 0.5) . '" preserveAspectRatio="xMidYMid slice" clip-path="url(#' . $clip . ')"/>'
                        : '<rect x="' . self::n($x + 8) . '" y="' . self::n($y + 8) . '" width="' . self::n($w - 16) . '" height="' . self::n($h * 0.5) . '" rx="8" fill="#f1f5f9"/>')
                    . ($badge !== '' ? '<rect x="' . self::n($x + 14) . '" y="' . self::n($y + 14) . '" width="' . self::n(min($w - 28, 12 + mb_strlen($badge) * 6.4)) . '" height="20" rx="10" fill="#dc2626"/><text x="' . self::n($x + 22) . '" y="' . self::n($y + 28) . '" font-size="10" font-weight="bold" fill="#ffffff" font-family="Helvetica, Arial, sans-serif">' . $badge . '</text>' : '')
                    . '<text x="' . self::n($x + 12) . '" y="' . self::n($y + $h * 0.64) . '" font-size="12" font-weight="bold" fill="#0f172a" font-family="Helvetica, Arial, sans-serif">' . $name . '</text>'
                    . ($sku !== '' ? '<text x="' . self::n($x + $w - 12) . '" y="' . self::n($y + $h * 0.64) . '" font-size="8" fill="#64748b" text-anchor="end" font-family="monospace">' . $sku . '</text>' : '')
                    . '<text x="' . self::n($x + 12) . '" y="' . self::n($y + $h * 0.76) . '" font-size="16" font-weight="bold" fill="#dc2626" font-family="Helvetica, Arial, sans-serif">' . $price . '</text>'
                    . ($old !== '' ? '<text x="' . self::n($x + 12 + mb_strlen($price) * 9.5 + 6) . '" y="' . self::n($y + $h * 0.76) . '" font-size="11" fill="#94a3b8" text-decoration="line-through" font-family="Helvetica, Arial, sans-serif">' . $old . '</text>' : '')
                    . '<rect x="' . self::n($x + 10) . '" y="' . self::n($y + $h * 0.83) . '" width="' . self::n($w - 20) . '" height="' . self::n(min(28, $h * 0.1)) . '" rx="6" fill="#059669"/>'
                    . '<text x="' . self::n($x + $w / 2) . '" y="' . self::n($y + $h * 0.83 + min(28, $h * 0.1) * 0.66) . '" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">Order on WhatsApp</text>';
                break;

            case 'studentCard':
                $sName = self::esc(mb_substr((string) ($el['name'] ?? 'Student'), 0, 40));
                $award = self::esc(mb_substr((string) ($el['award'] ?? ''), 0, 24));
                $quote = self::esc(mb_substr((string) ($el['quote'] ?? $el['description'] ?? ''), 0, 60));
                $cx = $x + $w / 2;
                $defs .= '<clipPath id="' . $clip . '"><circle cx="' . self::n($cx) . '" cy="' . self::n($y + 60) . '" r="40"/></clipPath>';
                $out = '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="16" fill="#ffffff" stroke="#e2e8f0"/>'
                    . ($award !== '' ? '<rect x="' . self::n($x + $w - 100) . '" y="' . self::n($y + 10) . '" width="90" height="20" rx="10" fill="#f59e0b"/><text x="' . self::n($x + $w - 55) . '" y="' . self::n($y + 24) . '" font-size="9" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">' . $award . '</text>' : '')
                    . ($img ? '<image href="' . self::esc($img) . '" x="' . self::n($cx - 40) . '" y="' . self::n($y + 20) . '" width="80" height="80" preserveAspectRatio="xMidYMid slice" clip-path="url(#' . $clip . ')"/>' : '<circle cx="' . self::n($cx) . '" cy="' . self::n($y + 60) . '" r="40" fill="#e2e8f0"/>')
                    . '<text x="' . self::n($cx) . '" y="' . self::n($y + 125) . '" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">' . $sName . '</text>'
                    . ($quote !== '' ? '<text x="' . self::n($cx) . '" y="' . self::n($y + 145) . '" font-size="10" font-style="italic" fill="#475569" text-anchor="middle" font-family="Georgia, serif">' . $quote . '</text>' : '');
                break;

            case 'toc':
                $items = is_array($el['tocItems'] ?? null) ? array_slice($el['tocItems'], 0, 40) : [];
                $out = '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="12" fill="#ffffff" stroke="#cbd5e1"/>'
                    . '<text x="' . self::n($x + 20) . '" y="' . self::n($y + 30) . '" font-size="15" font-weight="bold" fill="#0f172a" font-family="Helvetica, Arial, sans-serif">' . self::esc($el['content'] ?? 'Contents') . '</text>';
                foreach ($items as $k => $it) {
                    $ry = $y + 56 + $k * 22;
                    $out .= '<text x="' . self::n($x + 20) . '" y="' . self::n($ry) . '" font-size="11" font-weight="600" fill="#1e293b" font-family="Helvetica, Arial, sans-serif">' . self::esc(mb_substr((string) ($it['title'] ?? 'Chapter ' . ($k + 1)), 0, 60)) . '</text>'
                        . '<text x="' . self::n($x + $w - 20) . '" y="' . self::n($ry) . '" font-size="11" font-weight="bold" fill="#0284c7" text-anchor="end" font-family="monospace">' . self::esc($it['page_number'] ?? ($k + 1)) . '</text>';
                }
                break;

            case 'folio':
                $out = '<line x1="' . self::n($x) . '" y1="' . self::n($y + 2) . '" x2="' . self::n($x + $w) . '" y2="' . self::n($y + 2) . '" stroke="#cbd5e1"/>'
                    . '<text x="' . self::n($x) . '" y="' . self::n($y + 14) . '" font-size="9" fill="#94a3b8" font-family="monospace">' . self::esc($el['folioHeader'] ?? 'Nuvis Flipex Publication') . '</text>'
                    . (!empty($el['folioShowPage']) ? '<text x="' . self::n($x + $w) . '" y="' . self::n($y + 14) . '" font-size="9" fill="#94a3b8" text-anchor="end" font-family="monospace">Page ' . $pageNumber . '</text>' : '');
                break;

            case 'yearbook_grid':
            case 'album_spread':
                $out = '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="10" fill="#f1f5f9" stroke="#e2e8f0"/>';
                break;

            case 'button':
            case 'badge':
            case 'whatsapp':
                $btnFill = self::color($style['backgroundColor'] ?? '#059669', '#059669');
                $btnInk = self::color($style['color'] ?? '#ffffff', '#ffffff');
                $out = '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="' . self::n(min($h / 2, 22)) . '" fill="' . self::esc($btnFill) . '"/>'
                    . '<text x="' . self::n($x + $w / 2) . '" y="' . self::n($y + $h / 2 + 4) . '" font-size="12" font-weight="bold" fill="' . self::esc($btnInk) . '" text-anchor="middle" font-family="Helvetica, Arial, sans-serif">' . self::esc(mb_substr((string) ($el['content'] ?? 'Chat & Order on WhatsApp'), 0, 50)) . '</text>';
                break;

            default:
                return '';
        }
        return '<g' . $gAttr . '>' . $out . '</g>';
    }

    private static function text(array $el, array $style, float $x, float $y, float $w, float $h, string $clip, string &$defs): string
    {
        $fs = max(4, min(400, self::num($style['fontSize'] ?? 14, 14)));
        $bold = in_array((string) ($style['fontWeight'] ?? 'normal'), ['bold', '600', '700', '800', '900'], true);
        $italic = ($style['fontStyle'] ?? '') === 'italic';
        $color = self::color($style['color'] ?? '#0f172a', '#0f172a');
        $align = (string) ($style['textAlign'] ?? 'left');
        $lh = max(1.0, min(3.0, self::num($style['lineHeight'] ?? 1.35, 1.35)));
        $ls = (string) ($style['letterSpacing'] ?? '');
        $lsNum = preg_match('/^-?\d+(\.\d+)?/', $ls, $lm) ? (float) $lm[0] : 0.0;
        $upper = ($style['textTransform'] ?? '') === 'uppercase';
        $ff = self::font($style['fontFamily'] ?? '');
        $cols = in_array($el['type'] ?? '', ['column_text', 'article'], true) ? max(1, min(6, (int) self::num($el['columns'] ?? 2, 2))) : 1;
        $gutter = self::num($el['columnGutter'] ?? 20, 20);
        $pad = 0.0;

        $out = '';
        if (!empty($style['backgroundColor']) && ($el['type'] ?? '') === 'text') {
            $out .= '<rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '" rx="' . self::n(self::num($style['borderRadius'] ?? 0, 0)) . '" fill="' . self::esc(self::color($style['backgroundColor'], 'none')) . '"/>';
        }
        $parts = [];
        foreach (['kicker' => [10, true, '#0284c7'], 'subtitle' => [12, false, '#64748b']] as $k => [$sz, $b, $col]) {
            if (!empty($el[$k])) {
                $parts[] = [(string) $el[$k], $sz, $b, $col];
            }
        }
        $content = (string) ($el['content'] ?? '');
        $content = trim(preg_replace('/<[^>]*>/', '', $content) ?? '');
        $content = $upper ? mb_strtoupper($content) : $content;
        $colW = ($w - $pad * 2 - $gutter * ($cols - 1)) / $cols;
        $lines = [];
        foreach ($parts as [$t, $sz, $b, $col]) {
            foreach (self::wrap($t, $colW, (float) $sz, $b, 0.0) as $ln) {
                $lines[] = [$ln, (float) $sz, $b, $col];
            }
        }
        foreach (self::wrap($content, $colW, $fs, $bold, $lsNum, $upper || $content === mb_strtoupper($content)) as $ln) {
            $lines[] = [$ln, $fs, $bold, $color];
        }
        $lineH = $fs * $lh;
        $perCol = max(1, (int) floor(($h - $pad * 2) / $lineH));
        if ($cols > 1) {
            $perCol = max(1, min($perCol, (int) ceil(count($lines) / $cols))); // balance columns like CSS multi-column
        }
        $defs .= '<clipPath id="' . $clip . '"><rect x="' . self::n($x) . '" y="' . self::n($y) . '" width="' . self::n($w) . '" height="' . self::n($h) . '"/></clipPath>';
        $out .= '<g clip-path="url(#' . $clip . ')" font-family="' . self::esc($ff) . '"' . ($italic ? ' font-style="italic"' : '') . ($lsNum ? ' letter-spacing="' . self::n($lsNum) . '"' : '') . '>';
        $maxLines = $perCol * $cols;
        foreach (array_slice($lines, 0, $maxLines) as $idx => [$t, $sz, $b, $col]) {
            if ($t === '') {
                continue;
            }
            $c = intdiv($idx, $perCol);
            $r = $idx % $perCol;
            $cx0 = $x + $pad + $c * ($colW + $gutter);
            $anchor = 'start';
            $tx = $cx0;
            if ($align === 'center') {
                $anchor = 'middle';
                $tx = $cx0 + $colW / 2;
            } elseif ($align === 'right') {
                $anchor = 'end';
                $tx = $cx0 + $colW;
            }
            $ty = $y + $pad + ($r + 1) * $lineH - ($lineH - $sz) / 2 - $sz * 0.18;
            $out .= '<text x="' . self::n($tx) . '" y="' . self::n($ty) . '" font-size="' . self::n($sz) . '" fill="' . self::esc($col) . '"' . ($b ? ' font-weight="bold"' : '') . ' text-anchor="' . $anchor . '"'
                . (($style['textDecoration'] ?? '') === 'underline' ? ' text-decoration="underline"' : '') . '>' . self::esc($t) . '</text>';
        }
        return $out . '</g>';
    }
}
