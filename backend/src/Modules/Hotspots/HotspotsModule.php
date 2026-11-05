<?php
declare(strict_types=1);

namespace App\Modules\Hotspots;

use App\Controllers\HotspotController;
use App\Shared\ModuleContract;

final class HotspotsModule implements ModuleContract
{
    public static function name(): string { return 'Hotspots'; }
    public static function layer(): string { return 'Business Services'; }
    public static function description(): string { return 'Interactive page enrichments including external links, embedded video/audio players, internal page jumps, and automated ERP product SKU callouts.'; }
    public static function dependencies(): array { return ['Publications', 'Permissions', 'Tenants']; }
    public static function capabilities(): array
    {
        return [
            'controller' => HotspotController::class,
            'features' => ['Link, Video, Audio & Page-Jump Enrichments', 'Automated ERP SKU Pricing Tags', 'Tenant-Scoped Hotspot CRUD'],
        ];
    }
}
