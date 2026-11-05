<?php
declare(strict_types=1);

namespace App\Modules\Publications;

use App\Controllers\FlipbookController;
use App\Shared\ModuleContract;

final class PublicationsModule implements ModuleContract
{
    public static function name(): string { return 'Publications'; }
    public static function layer(): string { return 'Business Services'; }
    public static function description(): string { return 'Publication metadata, categories, collections, custom SEO metadata, custom slugs, duplication, and version history retention.'; }
    public static function dependencies(): array { return ['Tenants', 'DocumentProcessing', 'Publishing', 'Infrastructure\\Storage']; }
    public static function capabilities(): array
    {
        return [
            'controller' => FlipbookController::class,
            'features' => ['Categories & Collections', 'Version History & Rollback', 'Replace PDF Retaining Versions', 'Publication Duplication', 'Custom SEO & Slugs'],
        ];
    }
}
