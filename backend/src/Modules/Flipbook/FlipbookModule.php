<?php
declare(strict_types=1);

namespace App\Modules\Flipbook;

use App\Controllers\PublicController;
use App\Shared\ModuleContract;

final class FlipbookModule implements ModuleContract
{
    public static function name(): string { return 'Flipbook'; }
    public static function layer(): string { return 'Business Services'; }
    public static function description(): string { return 'Interactive Flipbook Reader delivery, 3D Page-Turn + Vertical Scroll + Accessible Text modes, full-text search, deep page sharing, and protected asset streaming.'; }
    public static function dependencies(): array { return ['Publications', 'Hotspots', 'Analytics', 'Infrastructure\\Storage', 'Infrastructure\\Cache']; }
    public static function capabilities(): array
    {
        return [
            'controller' => PublicController::class,
            'features' => ['3D Flip + Vertical Scroll + Screen-Reader Mode', 'In-Publication Full-Text Search', 'Signed Asset Streaming', 'Password Unlock Tokens', 'Offline Service Worker Caching'],
        ];
    }
}
