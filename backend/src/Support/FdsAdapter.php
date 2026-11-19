<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Flipex Design Schema (FDS v1.0) Adapter
 *
 * Provides bidirectional translation between legacy canvas_spec structures
 * and the canonical Flipex Design Schema (FDS v1.0).
 */
final class FdsAdapter
{
    public const DEFAULT_WIDTH_PT = 595.28;   // A4 width in pt
    public const DEFAULT_HEIGHT_PT = 841.89;  // A4 height in pt

    /**
     * Determine if a specification array already conforms to FDS.
     */
    public static function isFds(mixed $spec): bool
    {
        return is_array($spec)
            && isset($spec['schema'])
            && $spec['schema'] === FdsValidator::SCHEMA_IDENTIFIER;
    }

    /**
     * Convert any legacy or raw canvas_spec into canonical FDS v1.0.
     *
     * @param array $spec The input canvas_spec (legacy or FDS)
     * @param array $meta Optional document metadata (title, docType, dimensions, etc.)
     * @return array Canonical FDS v1.0 data structure
     */
    public static function toFds(array $spec, array $meta = []): array
    {
        if (self::isFds($spec)) {
            // Already FDS — ensure metadata and document block defaults are filled
            if (empty($spec['document'])) {
                $spec['document'] = self::defaultDocumentBlock($meta);
            }
            return $spec;
        }

        $width = (float) ($meta['width_pt'] ?? ($spec['width'] ?? self::DEFAULT_WIDTH_PT));
        $height = (float) ($meta['height_pt'] ?? ($spec['height'] ?? self::DEFAULT_HEIGHT_PT));
        $orientation = $meta['orientation'] ?? ($width > $height ? 'landscape' : 'portrait');

        $document = [
            'width' => $width,
            'height' => $height,
            'unit' => 'pt',
            'orientation' => $orientation,
            'dpi' => 300,
            'bleed' => [
                'top' => (float) ($meta['bleed_pt'] ?? 9.0),
                'right' => (float) ($meta['bleed_pt'] ?? 9.0),
                'bottom' => (float) ($meta['bleed_pt'] ?? 9.0),
                'left' => (float) ($meta['bleed_pt'] ?? 9.0),
            ],
            'safeMargins' => [
                'top' => 36.0,
                'right' => 36.0,
                'bottom' => 36.0,
                'left' => 36.0,
            ],
            'grid' => [
                'columns' => 12,
                'rows' => 8,
                'gutter' => 12.0,
            ]
        ];

        // Extract pages (handles { pages: [...] } or a flat single page array of elements)
        $rawPages = $spec['pages'] ?? [];
        if (empty($rawPages) && isset($spec['elements'])) {
            $rawPages = [
                [
                    'page_number' => 1,
                    'background' => $spec['background'] ?? null,
                    'elements' => $spec['elements'] ?? []
                ]
            ];
        }

        $pages = [];
        foreach ($rawPages as $idx => $p) {
            $pageNum = (int) ($p['pageNumber'] ?? ($p['page_number'] ?? ($idx + 1)));
            $pageId = (string) ($p['id'] ?? ('page_' . $pageNum));
            $pageType = (string) ($p['type'] ?? ($pageNum === 1 ? 'cover' : 'inside'));

            // Standardize background
            $bg = self::normalizeBackground($p['background'] ?? null);

            // Standardize elements
            $elements = [];
            $rawElements = $p['elements'] ?? [];
            if (is_array($rawElements)) {
                foreach ($rawElements as $elIdx => $el) {
                    $elements[] = self::normalizeElement($el, $elIdx);
                }
            }

            $pages[] = [
                'pageNumber' => $pageNum,
                'id' => $pageId,
                'name' => (string) ($p['name'] ?? ('Page ' . $pageNum)),
                'type' => $pageType,
                'background' => $bg,
                'elements' => $elements
            ];
        }

        if (empty($pages)) {
            $pages[] = [
                'pageNumber' => 1,
                'id' => 'page_1',
                'name' => 'Page 1',
                'type' => 'cover',
                'background' => ['type' => 'solid', 'value' => '#0F172A'],
                'elements' => []
            ];
        }

        return [
            '$schema' => 'https://nuvis.flipex/schemas/fds-v1.json',
            'schema' => FdsValidator::SCHEMA_IDENTIFIER,
            'schemaVersion' => '1.0.0',
            'id' => (string) ($meta['id'] ?? ($spec['id'] ?? uniqid('fds_', true))),
            'title' => (string) ($meta['title'] ?? ($meta['name'] ?? ($spec['title'] ?? 'Untitled Design'))),
            'description' => (string) ($meta['description'] ?? ($spec['description'] ?? '')),
            'category' => (string) ($meta['category'] ?? ($spec['category'] ?? 'magazine')),
            'docType' => (string) ($meta['doc_type'] ?? ($meta['docType'] ?? ($spec['docType'] ?? 'magazine'))),
            'version' => (string) ($meta['version'] ?? ($spec['version'] ?? '1.0.0')),
            'document' => $document,
            'pages' => $pages
        ];
    }

    /**
     * Convert an FDS v1.0 document into legacy canvas_spec format for backward compatibility.
     *
     * @param array $fds Canonical FDS structure
     * @return array Legacy canvas_spec array
     */
    public static function toLegacy(array $fds): array
    {
        $legacyPages = [];
        $pages = $fds['pages'] ?? [];

        foreach ($pages as $p) {
            $pageNum = (int) ($p['pageNumber'] ?? 1);
            $legacyElements = [];

            foreach ($p['elements'] ?? [] as $el) {
                $frame = $el['frame'] ?? [
                    'x' => (float) ($el['x'] ?? 0),
                    'y' => (float) ($el['y'] ?? 0),
                    'width' => (float) ($el['w'] ?? 100),
                    'height' => (float) ($el['h'] ?? 100)
                ];

                $legacyType = (string) ($el['type'] ?? 'text');
                if ($legacyType === 'imageFrame') {
                    $legacyType = 'image';
                } elseif ($legacyType === 'productCard') {
                    $legacyType = 'product';
                } elseif ($legacyType === 'article') {
                    $legacyType = 'column_text';
                }

                $legacyEl = [
                    'id' => (string) ($el['id'] ?? uniqid('el_', true)),
                    'type' => $legacyType,
                    'x' => (float) ($frame['x'] ?? 0),
                    'y' => (float) ($frame['y'] ?? 0),
                    'w' => (float) ($frame['width'] ?? 100),
                    'h' => (float) ($frame['height'] ?? 100),
                    'content' => (string) ($el['content'] ?? ''),
                    'style' => $el['style'] ?? [],
                    'locked' => !empty($el['locked']),
                    'zIndex' => (int) ($el['zIndex'] ?? 1)
                ];

                // Preserve block-specific attributes for legacy consumers
                $legacyPassthrough = [
                    'name', 'price', 'originalPrice', 'badge', 'sku', 'stockStatus',
                    'rating', 'whatsappNumber', 'showQrCode', 'image', 'src',
                    'columns', 'columnGutter', 'dropCap', 'authorName', 'authorRole',
                    'authorAvatar', 'kicker', 'subtitle', 'headline', 'description',
                    'award', 'classYear', 'quote', 'photoUrl', 'students', 'albumPhotos',
                    'tocItems', 'folioHeader', 'folioShowPage', 'sectionCategory',
                    'objectFit', 'filterBrightness', 'filterContrast', 'filterSaturation',
                    'filterGrayscale', 'filterBlur', 'shapeType', 'fillType', 'gradientFill',
                    'linkedNextId', 'linkedPrevId'
                ];
                foreach ($legacyPassthrough as $key) {
                    if (isset($el[$key])) {
                        $legacyEl[$key] = $el[$key];
                    }
                }

                // URL resolution for legacy image renderer
                if (isset($el['assetRef']['url'])) {
                    $legacyEl['url'] = $el['assetRef']['url'];
                    if (empty($legacyEl['src'])) $legacyEl['src'] = $el['assetRef']['url'];
                    if (empty($legacyEl['image'])) $legacyEl['image'] = $el['assetRef']['url'];
                } elseif (isset($el['url'])) {
                    $legacyEl['url'] = $el['url'];
                    if (empty($legacyEl['src'])) $legacyEl['src'] = $el['url'];
                    if (empty($legacyEl['image'])) $legacyEl['image'] = $el['url'];
                }

                $legacyElements[] = $legacyEl;
            }

            $legacyPages[] = [
                'page_number' => $pageNum,
                'background' => $p['background'] ?? ['type' => 'color', 'value' => '#0F172A'],
                'elements' => $legacyElements
            ];
        }

        return [
            'pages' => $legacyPages
        ];
    }

    /**
     * Standardize background structure.
     */
    private static function normalizeBackground(mixed $bg): array
    {
        if (is_string($bg)) {
            if (str_starts_with($bg, 'linear-gradient') || str_starts_with($bg, 'radial-gradient')) {
                return ['type' => 'gradient', 'value' => $bg];
            }
            return ['type' => 'solid', 'value' => $bg];
        }

        if (is_array($bg)) {
            $type = $bg['type'] ?? 'solid';
            if ($type === 'color') {
                $type = 'solid';
            }
            return [
                'type' => $type,
                'value' => (string) ($bg['value'] ?? '#0F172A'),
                'stops' => $bg['stops'] ?? null,
                'angle' => isset($bg['angle']) ? (int)$bg['angle'] : null,
            ];
        }

        return ['type' => 'solid', 'value' => '#0F172A'];
    }

    /**
     * Standardize element node structure.
     */
    private static function normalizeElement(mixed $el, int $index): array
    {
        if (!is_array($el)) {
            return [
                'id' => 'el_' . ($index + 1),
                'type' => 'text',
                'frame' => ['x' => 0, 'y' => 0, 'width' => 100, 'height' => 50],
                'x' => 0, 'y' => 0, 'w' => 100, 'h' => 50,
                'style' => [],
                'content' => '',
                'zIndex' => 1
            ];
        }

        $x = (float) ($el['frame']['x'] ?? ($el['x'] ?? 0));
        $y = (float) ($el['frame']['y'] ?? ($el['y'] ?? 0));
        $w = (float) ($el['frame']['width'] ?? ($el['w'] ?? 100));
        $h = (float) ($el['frame']['height'] ?? ($el['h'] ?? 50));

        $type = (string) ($el['type'] ?? 'text');
        if ($type === 'image') {
            $type = 'imageFrame';
        } elseif ($type === 'product') {
            $type = 'productCard';
        } elseif ($type === 'column_text') {
            $type = 'article';
        }
        $id = (string) ($el['id'] ?? ('el_' . ($index + 1)));

        $normalized = [
            'id' => $id,
            'type' => $type,
            'frame' => [
                'x' => $x,
                'y' => $y,
                'width' => $w,
                'height' => $h
            ],
            // Dual-mode coordinate fields for backward-compatibility with older frontends
            'x' => $x,
            'y' => $y,
            'w' => $w,
            'h' => $h,
            'transform' => [
                'rotation' => (float) ($el['transform']['rotation'] ?? ($el['rotation'] ?? 0)),
                'scaleX' => (float) ($el['transform']['scaleX'] ?? 1),
                'scaleY' => (float) ($el['transform']['scaleY'] ?? 1),
                'opacity' => (float) ($el['transform']['opacity'] ?? ($el['opacity'] ?? 1)),
            ],
            'style' => $el['style'] ?? [],
            'content' => (string) ($el['content'] ?? ''),
            'locked' => !empty($el['locked']),
            'editable' => $el['editable'] ?? true,
            'zIndex' => (int) ($el['zIndex'] ?? 1),
        ];

        // Normalize image frame asset references
        if ($type === 'image' || $type === 'imageFrame') {
            $url = (string) ($el['assetRef']['url'] ?? ($el['url'] ?? ''));
            $normalized['assetRef'] = [
                'source' => (string) ($el['assetRef']['source'] ?? (empty($url) ? 'placeholder' : 'external')),
                'assetId' => $el['assetRef']['assetId'] ?? null,
                'url' => $url,
                'alt' => (string) ($el['assetRef']['alt'] ?? ($el['alt'] ?? '')),
                'fit' => (string) ($el['assetRef']['fit'] ?? ($el['fit'] ?? 'cover'))
            ];
            $normalized['url'] = $url; // Keep for legacy
        }

        // Additional high-level block properties
        if (isset($el['dataBinding'])) {
            $normalized['dataBinding'] = $el['dataBinding'];
        }

        // Preserve block attributes for commercial, editorial, yearbook, album, toc, and folio
        $passthroughKeys = [
            'name', 'price', 'originalPrice', 'badge', 'sku', 'stockStatus',
            'rating', 'whatsappNumber', 'showQrCode', 'image', 'src',
            'columns', 'columnGutter', 'dropCap', 'authorName', 'authorRole',
            'authorAvatar', 'kicker', 'subtitle', 'headline', 'description',
            'award', 'classYear', 'quote', 'photoUrl', 'students', 'albumPhotos',
            'tocItems', 'folioHeader', 'folioShowPage', 'sectionCategory',
            'objectFit', 'filterBrightness', 'filterContrast', 'filterSaturation',
            'filterGrayscale', 'filterBlur', 'shapeType', 'fillType', 'gradientFill',
            'linkedNextId', 'linkedPrevId'
        ];
        foreach ($passthroughKeys as $key) {
            if (isset($el[$key])) {
                $normalized[$key] = $el[$key];
            }
        }

        return $normalized;
    }

    private static function defaultDocumentBlock(array $meta): array
    {
        $w = (float) ($meta['width_pt'] ?? self::DEFAULT_WIDTH_PT);
        $h = (float) ($meta['height_pt'] ?? self::DEFAULT_HEIGHT_PT);
        return [
            'width' => $w,
            'height' => $h,
            'unit' => 'pt',
            'orientation' => $w > $h ? 'landscape' : 'portrait',
            'dpi' => 300,
            'bleed' => ['top' => 9.0, 'right' => 9.0, 'bottom' => 9.0, 'left' => 9.0],
            'safeMargins' => ['top' => 36.0, 'right' => 36.0, 'bottom' => 36.0, 'left' => 36.0],
            'grid' => ['columns' => 12, 'rows' => 8, 'gutter' => 12.0]
        ];
    }
}
