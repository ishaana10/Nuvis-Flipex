<?php
declare(strict_types=1);

namespace App\Modules\DocumentProcessing;

use App\Shared\ModuleContract;
use App\Support\PdfRenderer;

final class DocumentProcessingModule implements ModuleContract
{
    public static function name(): string { return 'DocumentProcessing'; }
    public static function layer(): string { return 'Background Workers & Infrastructure'; }
    public static function description(): string { return 'Isolated PDF worker service generating multi-resolution pages (Thumb, Standard, High-Res), WebP/AVIF output, PDF metadata & TOC extraction, and Dead-Letter Queue recovery.'; }
    public static function dependencies(): array { return ['Publications', 'Infrastructure\\Queue', 'Infrastructure\\Storage']; }
    public static function capabilities(): array
    {
        return [
            'services' => [PdfRenderer::class],
            'worker' => 'backend/bin/worker.php',
            'features' => ['Multi-Resolution Rendering', 'WebP & AVIF Output', 'Automatic PDF Metadata & TOC Extraction', 'PDF Header/EOF Validation', 'Retry & Dead-Letter Recovery'],
        ];
    }
}
