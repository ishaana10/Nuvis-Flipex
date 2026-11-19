<?php
declare(strict_types=1);

namespace Tests;

// Standalone PSR-4 autoloader fallback
spl_autoload_register(function (string $class) {
    if (str_starts_with($class, 'App\\')) {
        $file = __DIR__ . '/../src/' . str_replace('\\', '/', substr($class, 4)) . '.php';
        if (file_exists($file)) {
            require_once $file;
        }
    }
});

use App\Support\FdsValidator;
use App\Support\FdsAdapter;

final class StudioDesignSchemaTest
{
    public static function runAll(): array
    {
        $assertions = [];

        // 1. FDS Validator: Validate valid FDS v1.0 schema
        $validFds = [
            'schema' => 'flipex.design',
            'schemaVersion' => '1.0.0',
            'id' => 'test_doc_01',
            'title' => 'Test Magazine',
            'document' => [
                'width' => 595.28,
                'height' => 841.89,
                'unit' => 'pt',
                'orientation' => 'portrait'
            ],
            'pages' => [
                [
                    'pageNumber' => 1,
                    'type' => 'cover',
                    'background' => ['type' => 'solid', 'value' => '#0F172A'],
                    'elements' => [
                        [
                            'id' => 'h1',
                            'type' => 'text',
                            'frame' => ['x' => 40, 'y' => 50, 'width' => 500, 'height' => 60],
                            'content' => 'Hello Pacific'
                        ]
                    ]
                ]
            ]
        ];
        $res = FdsValidator::validate($validFds);
        $assertions['fds_validates_canonical_spec'] = ($res['valid'] === true && empty($res['errors']));

        // 2. FDS Validator: Rejects invalid schema identifier
        $invalidSchema = $validFds;
        $invalidSchema['schema'] = 'wrong.schema';
        $res = FdsValidator::validate($invalidSchema);
        $assertions['fds_rejects_wrong_schema'] = ($res['valid'] === false && count($res['errors']) > 0);

        // 3. FDS Validator: Enforce server storage optimization (Rejects inline Base64)
        $base64Fds = $validFds;
        $base64Fds['pages'][0]['elements'][] = [
            'id' => 'img_bad',
            'type' => 'imageFrame',
            'frame' => ['x' => 40, 'y' => 120, 'width' => 200, 'height' => 200],
            'assetRef' => [
                'source' => 'upload',
                'url' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            ]
        ];
        $res = FdsValidator::validate($base64Fds);
        $assertions['fds_rejects_inline_base64_storage_bloat'] = (
            $res['valid'] === false &&
            str_contains(implode(' ', $res['errors']), 'Inline Base64')
        );

        // 4. FDS Adapter: Detects FDS vs legacy
        $assertions['fds_adapter_detects_fds'] = FdsAdapter::isFds($validFds);
        $assertions['fds_adapter_detects_legacy'] = !FdsAdapter::isFds(['pages' => []]);

        // 5. FDS Adapter: Converts legacy canvas_spec to FDS v1.0
        $legacySpec = [
            'pages' => [
                [
                    'page_number' => 1,
                    'background' => '#0F172A',
                    'elements' => [
                        [
                            'id' => 'legacy_text',
                            'type' => 'text',
                            'x' => 50,
                            'y' => 60,
                            'w' => 300,
                            'h' => 40,
                            'content' => 'Legacy Headline',
                            'style' => ['fontSize' => 24, 'color' => '#FFFFFF']
                        ],
                        [
                            'id' => 'legacy_img',
                            'type' => 'image',
                            'x' => 50,
                            'y' => 110,
                            'w' => 400,
                            'h' => 250,
                            'url' => 'https://images.unsplash.com/photo-1542838132-92c53300491e'
                        ]
                    ]
                ]
            ]
        ];
        $adapted = FdsAdapter::toFds($legacySpec, ['title' => 'Adapted Legacy Doc']);
        $assertions['fds_adapter_converts_legacy'] = (
            FdsAdapter::isFds($adapted) &&
            isset($adapted['document']['width']) &&
            isset($adapted['pages'][0]['elements'][0]['frame']['width']) &&
            $adapted['pages'][0]['elements'][0]['frame']['width'] === 300.0 &&
            $adapted['pages'][0]['elements'][1]['type'] === 'imageFrame'
        );

        // 6. FDS Adapter: Converts FDS back to legacy format for older clients
        $backToLegacy = FdsAdapter::toLegacy($adapted);
        $assertions['fds_adapter_exports_backward_compatible_legacy'] = (
            isset($backToLegacy['pages'][0]['elements'][0]['w']) &&
            $backToLegacy['pages'][0]['elements'][0]['w'] === 300.0 &&
            isset($backToLegacy['pages'][0]['elements'][1]['url'])
        );

        // 7. Verify Template Manifest & JSON Files Integrity
        $manifestPath = __DIR__ . '/../resources/studio/templates/manifest.json';
        $assertions['manifest_file_exists'] = file_exists($manifestPath);

        $manifestData = json_decode((string)file_get_contents($manifestPath), true);
        $assertions['manifest_has_at_least_10_templates'] = (
            is_array($manifestData) &&
            isset($manifestData['templates']) &&
            count($manifestData['templates']) >= 10
        );

        $allTemplatesValid = true;
        $noBase64Found = true;
        $baseDir = __DIR__ . '/../resources/studio/templates/';

        if (is_array($manifestData) && !empty($manifestData['templates'])) {
            foreach ($manifestData['templates'] as $t) {
                $filePath = $baseDir . ($t['file'] ?? '');
                if (!file_exists($filePath)) {
                    $allTemplatesValid = false;
                    break;
                }
                $content = (string)file_get_contents($filePath);
                if (str_contains($content, 'data:image/') && str_contains($content, ';base64,')) {
                    $noBase64Found = false;
                }
                $json = json_decode($content, true);
                if (!is_array($json)) {
                    $allTemplatesValid = false;
                    break;
                }
                $v = FdsValidator::validate($json);
                if (!$v['valid']) {
                    $allTemplatesValid = false;
                    break;
                }
            }
        }
        $assertions['all_file_templates_exist_and_validate'] = $allTemplatesValid;
        $assertions['zero_inline_base64_in_template_library'] = $noBase64Found;

        // 8. Verify StudioController Controller Method Signatures (no Auth::user class errors)
        $controllerSrc = (string)file_get_contents(__DIR__ . '/../src/Controllers/StudioController.php');
        $assertions['no_unimported_auth_user_in_studiocontroller'] = !str_contains($controllerSrc, 'Auth::user($req)');
        $assertions['list_assets_assigns_user'] = (bool)preg_match('/function\s+listAssets\b.*?\$u\s*=\s*\$req->getAttribute\(\'user\'\);/s', $controllerSrc);

        // 9. Reflection Verification of StudioController Methods
        $ref = new \ReflectionClass(\App\Controllers\StudioController::class);
        $assertions['studiocontroller_list_templates_exists'] = $ref->hasMethod('listTemplates');
        $assertions['studiocontroller_get_template_exists'] = $ref->hasMethod('getTemplate');
        $assertions['studiocontroller_save_template_exists'] = $ref->hasMethod('saveTemplate');
        $assertions['studiocontroller_delete_template_exists'] = $ref->hasMethod('deleteTemplate');
        $assertions['studiocontroller_list_assets_exists'] = $ref->hasMethod('listAssets');
        $assertions['studiocontroller_upload_asset_exists'] = $ref->hasMethod('uploadAsset');
        $assertions['studiocontroller_delete_asset_exists'] = $ref->hasMethod('deleteAsset');

        // 10. Pacific Stock Library Provider Verification
        $controller = new \App\Controllers\StudioController();
        $stockAssets = $controller->getStockLibraryAssets();
        $assertions['stock_library_has_curated_assets'] = (count($stockAssets) >= 15);

        $retailFilter = $controller->getStockLibraryAssets('retail');
        $assertions['stock_library_category_filtering'] = (count($retailFilter) > 0 && count($retailFilter) < count($stockAssets));

        $stockZeroBase64 = true;
        foreach ($stockAssets as $sa) {
            if (str_starts_with($sa['url'] ?? '', 'data:image/') && str_contains($sa['url'] ?? '', ';base64,')) {
                $stockZeroBase64 = false;
                break;
            }
        }
        $assertions['stock_library_zero_base64'] = $stockZeroBase64;

        // 11. Sprint 3 Block Adapters & FDS Normalization
        $specWithCommercialBlocks = [
            'pages' => [
                [
                    'page_number' => 1,
                    'elements' => [
                        [
                            'id' => 'prod_1',
                            'type' => 'product',
                            'name' => 'Island Kokoda Pack',
                            'price' => '$22.50',
                            'originalPrice' => '$28.00',
                            'sku' => 'KOK-01',
                            'whatsappNumber' => '+6799991234',
                            'rating' => 5,
                            'stockStatus' => 'in_stock',
                            'badge' => 'FRESH',
                            'image' => 'https://example.com/kokoda.jpg',
                            'x' => 10, 'y' => 20, 'w' => 200, 'h' => 260
                        ],
                        [
                          'id' => 'art_1',
                          'type' => 'column_text',
                          'kicker' => 'CORAL REEF SANCTUARY',
                          'subtitle' => 'Marine conservation in Fiji archipelagos',
                          'content' => 'The warm afternoon breeze drifted across the outer barrier...',
                          'columns' => 2,
                          'columnGutter' => 24,
                          'dropCap' => true,
                          'authorName' => 'Alisi Tavua',
                          'x' => 10, 'y' => 300, 'w' => 500, 'h' => 250
                        ],
                        [
                          'id' => 'stu_1',
                          'type' => 'studentCard',
                          'name' => 'Mereani Ravula',
                          'award' => '🏆 Dux of Class 2026',
                          'classYear' => 'Class of 2026',
                          'quote' => 'Curiosity and integrity pave our path.',
                          'photoUrl' => 'https://example.com/mereani.jpg',
                          'x' => 10, 'y' => 560, 'w' => 240, 'h' => 280
                        ]
                    ]
                ]
            ]
        ];

        $adaptedBlocks = FdsAdapter::toFds($specWithCommercialBlocks);
        $elMap = [];
        foreach ($adaptedBlocks['pages'][0]['elements'] as $el) {
            $elMap[$el['id']] = $el;
        }

        $assertions['fds_adapter_normalizes_product_and_article'] = (
            isset($elMap['prod_1']) &&
            $elMap['prod_1']['type'] === 'productCard' &&
            $elMap['prod_1']['sku'] === 'KOK-01' &&
            $elMap['prod_1']['whatsappNumber'] === '+6799991234' &&
            isset($elMap['art_1']) &&
            $elMap['art_1']['type'] === 'article' &&
            $elMap['art_1']['dropCap'] === true &&
            $elMap['art_1']['kicker'] === 'CORAL REEF SANCTUARY'
        );

        $assertions['fds_adapter_preserves_student_card'] = (
            isset($elMap['stu_1']) &&
            $elMap['stu_1']['type'] === 'studentCard' &&
            $elMap['stu_1']['award'] === '🏆 Dux of Class 2026' &&
            $elMap['stu_1']['classYear'] === 'Class of 2026'
        );

        $exportedLegacy = FdsAdapter::toLegacy($adaptedBlocks);
        $legacyElMap = [];
        foreach ($exportedLegacy['pages'][0]['elements'] as $el) {
            $legacyElMap[$el['id']] = $el;
        }

        $assertions['fds_adapter_exports_backward_compatible_product_and_article'] = (
            isset($legacyElMap['prod_1']) &&
            $legacyElMap['prod_1']['type'] === 'product' &&
            $legacyElMap['prod_1']['sku'] === 'KOK-01' &&
            isset($legacyElMap['art_1']) &&
            $legacyElMap['art_1']['type'] === 'column_text' &&
            $legacyElMap['art_1']['dropCap'] === true &&
            isset($legacyElMap['stu_1']) &&
            $legacyElMap['stu_1']['award'] === '🏆 Dux of Class 2026'
        );

        // 12. StudioController TOC & Hotspot Endpoints Verification
        $assertions['studiocontroller_generate_toc_exists'] = $ref->hasMethod('generateToc');
        $controllerSrc = file_get_contents(dirname(__DIR__) . '/src/Controllers/StudioController.php');
        $assertions['studiocontroller_generatetoc_recognizes_modern_fds_types'] = (
            strpos($controllerSrc, "type === 'article'") !== false &&
            strpos($controllerSrc, "type === 'productCard'") !== false &&
            strpos($controllerSrc, "type === 'studentCard'") !== false
        );
        $assertions['studiocontroller_hotspots_recognize_productcard_and_studentcard'] = (
            strpos($controllerSrc, "type === 'productCard'") !== false &&
            strpos($controllerSrc, "type === 'studentCard'") !== false
        );

        return $assertions;
    }
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $results = StudioDesignSchemaTest::runAll();
    $allPassed = true;
    echo "====================================================================\n";
    echo "   Nuvis Flipex — Flipex Design Schema (FDS v1.0) & Studio Tests    \n";
    echo "====================================================================\n";
    foreach ($results as $name => $passed) {
        if (!$passed) {
            $allPassed = false;
        }
        echo ($passed ? "[PASS] " : "[FAIL] ") . $name . PHP_EOL;
    }
    echo "--------------------------------------------------------------------\n";
    echo "Result: " . ($allPassed ? "ALL TESTS PASSED\n" : "SOME TESTS FAILED\n");
    exit($allPassed ? 0 : 1);
}
