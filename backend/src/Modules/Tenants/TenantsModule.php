<?php
declare(strict_types=1);

namespace App\Modules\Tenants;

use App\Middleware\TenantScope;
use App\Shared\ModuleContract;
use App\Support\TenantContext;

final class TenantsModule implements ModuleContract
{
    public static function name(): string { return 'Tenants'; }
    public static function layer(): string { return 'PHP Slim REST API & Multi-Tenancy'; }
    public static function description(): string { return 'Multi-tenant workspace isolation, IDOR prevention, storage path scoping (/storage/tenants/{tenant_id}/), and organization provisioning.'; }
    public static function dependencies(): array { return ['Permissions', 'Subscriptions', 'Infrastructure\\Database', 'Infrastructure\\Storage']; }
    public static function capabilities(): array
    {
        return [
            'middleware' => TenantScope::class,
            'services' => [TenantContext::class],
            'features' => ['Strict tenant_id Query Scoping', 'Cross-Tenant IDOR Guard', 'Isolated Tenant Storage Prefix', 'Organization Branding & Quota Enforcement'],
        ];
    }
}
