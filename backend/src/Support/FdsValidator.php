<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Flipex Design Schema (FDS v1.0) Validator
 *
 * Validates JSON structures against canonical FDS v1.0 specification.
 * Rejects invalid schema tags, corrupted coordinates, missing required properties,
 * and enforces the storage optimization rule (no inline Base64 data URIs).
 */
final class FdsValidator
{
    public const SCHEMA_IDENTIFIER = 'flipex.design';
    public const SUPPORTED_VERSIONS = ['1.0.0', '1.0'];

    public const VALID_UNITS = ['pt', 'px', 'mm', 'in'];
    public const VALID_ORIENTATIONS = ['portrait', 'landscape'];
    public const VALID_PAGE_TYPES = ['cover', 'inside', 'spread_left', 'spread_right', 'back_cover'];
    public const VALID_ELEMENT_TYPES = [
        'text',
        'richText',
        'image',
        'imageFrame',
        'shape',
        'svg',
        'group',
        'productCard',
        'article',
        'photoGrid',
        'photoCollage',
        'studentCard',
        'badge',
        'button',
        'qrCode',
        'folio',
        'toc'
    ];

    /**
     * Validate an FDS v1.0 design document or template.
     *
     * @param array $spec The parsed JSON array
     * @return array{valid: bool, errors: string[], warnings: string[]}
     */
    public static function validate(array $spec): array
    {
        $errors = [];
        $warnings = [];

        // 1. Schema Header Validation
        $schema = (string) ($spec['schema'] ?? '');
        if ($schema !== self::SCHEMA_IDENTIFIER) {
            $errors[] = sprintf("Invalid schema identifier '%s'. Expected '%s'.", $schema, self::SCHEMA_IDENTIFIER);
        }

        $version = (string) ($spec['schemaVersion'] ?? '');
        if (!in_array($version, self::SUPPORTED_VERSIONS, true)) {
            $errors[] = sprintf("Unsupported schemaVersion '%s'. Supported versions: %s.", $version, implode(', ', self::SUPPORTED_VERSIONS));
        }

        // 2. Document Settings
        if (!isset($spec['document']) || !is_array($spec['document'])) {
            $errors[] = "Missing or non-object 'document' specification.";
        } else {
            $doc = $spec['document'];
            $w = (float) ($doc['width'] ?? 0);
            $h = (float) ($doc['height'] ?? 0);
            if ($w <= 0 || $h <= 0) {
                $errors[] = "Document dimensions must be positive numbers (width and height > 0).";
            }
            if (isset($doc['unit']) && !in_array($doc['unit'], self::VALID_UNITS, true)) {
                $warnings[] = sprintf("Unrecognized document unit '%s'. Defaulting to 'pt'.", (string)$doc['unit']);
            }
            if (isset($doc['orientation']) && !in_array($doc['orientation'], self::VALID_ORIENTATIONS, true)) {
                $warnings[] = sprintf("Unrecognized orientation '%s'. Expected 'portrait' or 'landscape'.", (string)$doc['orientation']);
            }
        }

        // 3. Pages Array Validation
        if (!isset($spec['pages']) || !is_array($spec['pages'])) {
            $errors[] = "Missing or invalid 'pages' array in design specification.";
        } elseif (empty($spec['pages'])) {
            $errors[] = "Document must contain at least one page in 'pages'.";
        } else {
            $seenPageNumbers = [];
            foreach ($spec['pages'] as $index => $page) {
                $pagePath = "pages[{$index}]";
                if (!is_array($page)) {
                    $errors[] = "{$pagePath} must be a valid JSON object.";
                    continue;
                }

                $pageNumber = $page['pageNumber'] ?? ($page['page_number'] ?? ($index + 1));
                if (!is_numeric($pageNumber) || (int)$pageNumber < 1) {
                    $errors[] = "{$pagePath}: 'pageNumber' must be an integer >= 1.";
                } else {
                    $pNum = (int)$pageNumber;
                    if (isset($seenPageNumbers[$pNum])) {
                        $warnings[] = "{$pagePath}: duplicate pageNumber {$pNum} detected.";
                    }
                    $seenPageNumbers[$pNum] = true;
                }

                if (isset($page['type']) && !in_array($page['type'], self::VALID_PAGE_TYPES, true)) {
                    $warnings[] = "{$pagePath}: unrecognized page type '{$page['type']}'.";
                }

                // Check background
                if (isset($page['background']) && is_array($page['background'])) {
                    $bg = $page['background'];
                    $bgVal = (string) ($bg['value'] ?? '');
                    if (str_starts_with($bgVal, 'data:image/') && str_contains($bgVal, ';base64,')) {
                        $errors[] = "{$pagePath}.background: Inline Base64 images are disallowed for template storage. Use assetRef or hosted URL.";
                    }
                }

                // Elements Validation
                $elements = $page['elements'] ?? [];
                if (!is_array($elements)) {
                    $errors[] = "{$pagePath}.elements must be an array.";
                } else {
                    foreach ($elements as $elIndex => $element) {
                        $elPath = "{$pagePath}.elements[{$elIndex}]";
                        self::validateElement($element, $elPath, $errors, $warnings);
                    }
                }
            }
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
            'warnings' => $warnings,
        ];
    }

    /**
     * Validate an individual element node.
     */
    private static function validateElement(mixed $el, string $path, array &$errors, array &$warnings): void
    {
        if (!is_array($el)) {
            $errors[] = "{$path} must be a valid JSON object.";
            return;
        }

        $id = (string) ($el['id'] ?? '');
        if ($id === '') {
            $warnings[] = "{$path}: element is missing a unique 'id'.";
        }

        $type = (string) ($el['type'] ?? '');
        if (!in_array($type, self::VALID_ELEMENT_TYPES, true)) {
            $warnings[] = "{$path}: unrecognized element type '{$type}'.";
        }

        // Frame validation (accepts either frame {x, y, width, height} or legacy flat {x, y, w, h})
        $hasFrame = isset($el['frame']) && is_array($el['frame']);
        $hasFlatCoords = isset($el['x'], $el['y'], $el['w'], $el['h']);

        if (!$hasFrame && !$hasFlatCoords) {
            $errors[] = "{$path}: element must define bounds via 'frame' object or 'x', 'y', 'w', 'h'.";
        } elseif ($hasFrame) {
            $frame = $el['frame'];
            $w = (float) ($frame['width'] ?? 0);
            $h = (float) ($frame['height'] ?? 0);
            if ($w < 0 || $h < 0) {
                $errors[] = "{$path}.frame: width and height cannot be negative numbers.";
            }
        } else {
            $w = (float) ($el['w'] ?? 0);
            $h = (float) ($el['h'] ?? 0);
            if ($w < 0 || $h < 0) {
                $errors[] = "{$path}: w and h cannot be negative numbers.";
            }
        }

        // Reject inline Base64 payloads (enforces server storage optimization)
        $urlToCheck = '';
        if (isset($el['assetRef']['url']) && is_string($el['assetRef']['url'])) {
            $urlToCheck = $el['assetRef']['url'];
        } elseif (isset($el['url']) && is_string($el['url'])) {
            $urlToCheck = $el['url'];
        }

        if ($urlToCheck !== '' && str_starts_with($urlToCheck, 'data:image/') && str_contains($urlToCheck, ';base64,')) {
            $errors[] = "{$path}: Inline Base64 image payload detected. Templates and documents must use asset references or safe CDN URLs.";
        }

        // Group recursion
        if ($type === 'group' && isset($el['elements']) && is_array($el['elements'])) {
            foreach ($el['elements'] as $childIndex => $child) {
                self::validateElement($child, "{$path}.elements[{$childIndex}]", $errors, $warnings);
            }
        }
    }
}
