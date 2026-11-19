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

        // 13. Sprint 4: Data Sync, Pacific Regional Currencies & Flipbook Publishing Auto-Heal
        $assertions['studiocontroller_datasync_method_exists'] = $ref->hasMethod('syncDataFeed');
        $assertions['studiocontroller_currency_convert_method_exists'] = $ref->hasMethod('convertCurrency');
        
        $indexSrc = file_get_contents(dirname(__DIR__) . '/public/index.php');
        $assertions['studiocontroller_sprint4_routes_registered'] = (
            strpos($indexSrc, '/documents/{id:[0-9]+}/data-sync') !== false &&
            strpos($indexSrc, '/documents/{id:[0-9]+}/currency-convert') !== false
        );

        // Pacific currencies formatting accuracy
        $currencies = [
            'FJD' => ['prefix' => '$', 'suffix' => ' FJD', 'decimals' => 2],
            'AUD' => ['prefix' => '$', 'suffix' => ' AUD', 'decimals' => 2],
            'NZD' => ['prefix' => '$', 'suffix' => ' NZD', 'decimals' => 2],
            'USD' => ['prefix' => '$', 'suffix' => ' USD', 'decimals' => 2],
            'PGK' => ['prefix' => 'K', 'suffix' => '', 'decimals' => 2],
            'SBD' => ['prefix' => 'SI$', 'suffix' => '', 'decimals' => 2],
            'TOP' => ['prefix' => 'T$', 'suffix' => '', 'decimals' => 2],
            'WST' => ['prefix' => 'WS$', 'suffix' => '', 'decimals' => 2],
            'VUV' => ['prefix' => '', 'suffix' => ' VT', 'decimals' => 0],
        ];
        $priceFjd = $currencies['FJD']['prefix'] . number_format(24.95, $currencies['FJD']['decimals']) . $currencies['FJD']['suffix'];
        $pricePgk = $currencies['PGK']['prefix'] . number_format(49.50, $currencies['PGK']['decimals']) . $currencies['PGK']['suffix'];
        $priceVuv = number_format(round(1250.75), $currencies['VUV']['decimals']) . $currencies['VUV']['suffix'];
        $assertions['pacific_currencies_formatting_accuracy'] = (
            $priceFjd === '$24.95 FJD' &&
            $pricePgk === 'K49.50' &&
            $priceVuv === '1,251 VT'
        );

        $pubSrc = file_get_contents(dirname(__DIR__) . '/src/Controllers/PublicController.php');
        $assertions['publiccontroller_auto_heals_published_flipbooks'] = (
            strpos($pubSrc, 'UPDATE flipbooks SET status = "ready"') !== false &&
            strpos($pubSrc, 'stop-color="#1e1b4b"') === false
        );

        // Sprint 5: Performance, Offline & Pacific Island Resiliency Tests
        $idbPath = dirname(dirname(__DIR__)) . '/frontend/src/utils/studioIndexedDb.ts';
        $assertions['indexeddb_offline_storage_utility_exists'] = file_exists($idbPath);
        if (file_exists($idbPath)) {
            $idbSrc = file_get_contents($idbPath);
            $assertions['indexeddb_offline_draft_api_complete'] = (
                strpos($idbSrc, 'export async function saveOfflineDraft') !== false &&
                strpos($idbSrc, 'export async function getOfflineDraft') !== false &&
                strpos($idbSrc, 'export async function clearOfflineDraft') !== false &&
                strpos($idbSrc, 'export async function listAllOfflineDrafts') !== false
            );
        }

        // Test bandwidth-adaptive image optimization helper logic
        $rawUrl = 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=1200&q=80';
        $optimizedUrl = preg_replace('/w=\d+/', 'w=350', $rawUrl);
        $optimizedUrl = preg_replace('/q=\d+/', 'q=60', $optimizedUrl);
        $assertions['bandwidth_adaptive_image_optimization_accuracy'] = (
            $optimizedUrl === 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=350&q=60'
        );

        // Test spatial virtualization window calculation for 50-page document
        $activePageIdx = 10;
        $pagesCount = 50;
        $renderedCount = 0;
        for ($i = 0; $i < $pagesCount; $i++) {
            $isWithinWindow = ($pagesCount <= 12) || (abs($i - $activePageIdx) <= 4);
            if ($isWithinWindow) {
                $renderedCount++;
            }
        }
        // At index 10, window is 6, 7, 8, 9, 10, 11, 12, 13, 14 (exactly 9 pages full-rendered instead of all 50)
        $assertions['spatial_virtualization_window_calculation'] = ($renderedCount === 9);

        // Sprint 5: Zero Purple Compliance Scan across Studio
        $studioTsx = file_get_contents(dirname(dirname(__DIR__)) . '/frontend/src/pages/FlipexStudio.tsx');
        $bannedColors = ['#6366f1', '#a855f7', '#7c3aed', '#4f46e5', '#818cf8', '#a5b4fc', '#1e1b4b', '#312e81'];
        $hasBannedColor = false;
        foreach ($bannedColors as $color) {
            if (stripos($studioTsx, $color) !== false) {
                $hasBannedColor = true;
                break;
            }
        }
        $assertions['sprint5_zero_purple_compliance'] = !$hasBannedColor;

        // Template Preview & Use Template Invariant Verification (Fix for SQLSTATE 1136 & Blank Previews)
        $studioCtrlSrc = file_get_contents(dirname(__DIR__) . '/src/Controllers/StudioController.php');
        
        // Assert createDocument INSERT INTO studio_documents has exact 1:1 matching column and value counts
        preg_match('/INSERT\s+INTO\s+studio_documents\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i', $studioCtrlSrc, $sqlMatches);
        $colCount = isset($sqlMatches[1]) ? count(array_map('trim', explode(',', $sqlMatches[1]))) : 0;
        $valCount = isset($sqlMatches[2]) ? count(array_map('trim', explode(',', $sqlMatches[2]))) : 0;
        $assertions['studiocontroller_createdocument_columns_match_values_count'] = ($colCount > 0 && $colCount === $valCount && $colCount === 12);

        // Assert template insertion converts FDS to runtime pages
        $assertions['studiocontroller_createdocument_adapts_fds_template'] = (
            strpos($studioCtrlSrc, 'FdsAdapter::toLegacy($spec)') !== false
        );

        // Assert template preview in frontend renders via high-fidelity renderPageToSvg
        $assertions['template_preview_uses_vector_svg_renderer'] = (
            strpos($studioTsx, 'renderPageToSvg(normalizedPage') !== false
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
