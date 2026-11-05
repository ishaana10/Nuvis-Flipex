<?php
declare(strict_types=1);

namespace App\Modules\Publishing;

use App\Controllers\FlipbookController;
use App\Shared\ModuleContract;

final class PublishingModule implements ModuleContract
{
    public static function name(): string { return 'Publishing'; }
    public static function layer(): string { return 'Business Services'; }
    public static function description(): string { return '7-stage enterprise publishing workflow (Draft -> Processing -> Editing -> In Review -> Scheduled -> Published -> Archived), HMAC-signed draft previews, and auto-expiry.'; }
    public static function dependencies(): array { return ['Publications', 'Permissions', 'Notifications', 'Audit']; }
    public static function capabilities(): array
    {
        return [
            'controller' => FlipbookController::class,
            'features' => ['7-Stage Editorial Lifecycle', 'Editorial Review & Approval Notes', 'Scheduled Publishing & Auto-Expiry', 'HMAC-SHA256 Signed Draft Preview Links'],
        ];
    }
}
