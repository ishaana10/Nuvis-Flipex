<?php
declare(strict_types=1);

namespace App\Support;

/** Shared SVG safety checks for user-supplied and generated SVG that is later served from our origin. */
final class SvgSafety
{
    public const MAX_BYTES = 5 * 1024 * 1024;

    /** Reject SVG that can execute script, pull in external resources or smuggle entities. */
    public static function isSafe(string $svg): bool
    {
        if ($svg === '' || strlen($svg) > self::MAX_BYTES) {
            return false;
        }
        $patterns = [
            '/<\s*script\b/i', '/<\s*foreignObject\b/i', '/<\s*iframe\b/i', '/<\s*embed\b/i', '/<\s*object\b/i',
            '/<\s*audio\b/i', '/<\s*video\b/i', '/<\s*link\b/i', '/<!ENTITY/i', '/<!DOCTYPE[^>]*\[/i',
            '/\son[a-z]+\s*=/i', '/javascript\s*:/i', '/data\s*:\s*text\/html/i',
            '/(?:xlink:)?href\s*=\s*["\']\s*(?:https?:)?\/\//i', '/url\(\s*["\']?\s*(?:https?:)?\/\//i', '/@import/i',
        ];
        foreach ($patterns as $re) {
            if (preg_match($re, $svg)) {
                return false;
            }
        }
        return true;
    }

    /** Only allow URLs that are safe to place in a published hotspot or link. */
    public static function safeLinkUrl(mixed $url): ?string
    {
        $u = trim((string) $url);
        if ($u === '' || strlen($u) > 2000 || preg_match('/[\x00-\x1f\x7f]/', $u)) {
            return null;
        }
        if (preg_match('#^(https?://|mailto:|tel:)#i', $u)) {
            return $u;
        }
        if ($u[0] === '#' || ($u[0] === '/' && !str_starts_with($u, '//'))) {
            return $u;
        }
        return null;
    }
}
