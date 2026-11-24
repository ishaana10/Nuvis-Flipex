<?php
declare(strict_types=1);

namespace App\Support;

/** Bundled, original vector artwork (backend/resources/studio/stock). No hotlinks, no licences. */
final class StockLibrary
{
    private static ?array $manifest = null;

    private static function dir(): string
    {
        return dirname(__DIR__, 2) . '/resources/studio/stock';
    }

    public static function manifest(): array
    {
        if (self::$manifest === null) {
            $raw = @file_get_contents(self::dir() . '/stock.json');
            $d = $raw ? json_decode($raw, true) : null;
            self::$manifest = is_array($d) ? $d : ['items' => [], 'legacyUnsplash' => []];
        }
        return self::$manifest;
    }

    /** @return array<int,array<string,mixed>> catalogue entries with public URLs */
    public static function items(string $category = '', string $q = ''): array
    {
        $out = [];
        foreach (self::manifest()['items'] as $it) {
            if ($category !== '' && $category !== 'all' && $it['category'] !== $category) {
                continue;
            }
            if ($q !== '' && !str_contains(strtolower($it['name'] . ' ' . $it['tags']), strtolower($q))) {
                continue;
            }
            $out[] = [
                'id' => $it['id'],
                'name' => $it['name'],
                'category' => $it['category'],
                'asset_type' => $it['assetType'],
                'url' => self::url($it['id']),
                'width' => $it['width'],
                'height' => $it['height'],
                'tags' => $it['tags'],
                'license' => 'CC0 (original artwork bundled with Flipex)',
            ];
        }
        return $out;
    }

    public static function url(string $id): string
    {
        return '/api/v1/studio-stock/' . $id . '.svg';
    }

    public static function path(string $id): ?string
    {
        if (!preg_match('/^[a-z0-9_]{3,60}$/', $id)) {
            return null;
        }
        $p = self::dir() . '/' . $id . '.svg';
        return is_file($p) ? $p : null;
    }

    public static function dataUri(string $id): ?string
    {
        $p = self::path($id);
        $svg = $p ? (string) file_get_contents($p) : '';
        return $svg !== '' && SvgSafety::isSafe($svg) ? 'data:image/svg+xml;base64,' . base64_encode($svg) : null;
    }
}
