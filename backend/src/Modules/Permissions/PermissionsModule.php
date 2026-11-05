<?php
declare(strict_types=1);

namespace App\Modules\Permissions;

use App\Shared\ModuleContract;
use App\Support\Rbac;

final class PermissionsModule implements ModuleContract
{
    public static function name(): string { return 'Permissions'; }
    public static function layer(): string { return 'PHP Slim REST API & Authorization'; }
    public static function description(): string { return 'Granular Role-Based Access Control (RBAC) enforcing Owner, Admin, Editor, Publisher, and Viewer permission matrices per tenant.'; }
    public static function dependencies(): array { return ['Tenants', 'Audit']; }
    public static function capabilities(): array
    {
        return [
            'services' => [Rbac::class],
            'features' => ['Role Matrix (Owner / Editor / Viewer / Super Admin)', 'Endpoint & Action Authorization', 'Editorial Approval Gatekeeping'],
        ];
    }
}
