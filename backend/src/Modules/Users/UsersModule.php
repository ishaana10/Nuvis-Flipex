<?php
declare(strict_types=1);

namespace App\Modules\Users;

use App\Controllers\AdminController;
use App\Controllers\MeController;
use App\Shared\ModuleContract;

final class UsersModule implements ModuleContract
{
    public static function name(): string { return 'Users'; }
    public static function layer(): string { return 'Business Services'; }
    public static function description(): string { return 'User profile management, active session tracking, developer-configurable password policies, and tenant member administration.'; }
    public static function dependencies(): array { return ['Tenants', 'Permissions', 'Audit', 'Infrastructure\\Database']; }
    public static function capabilities(): array
    {
        return [
            'controllers' => [MeController::class, AdminController::class],
            'features' => ['Profile & Session Revocation', 'Developer Password Security Policy', 'Multi-Publisher & Editor Assignment'],
        ];
    }
}
