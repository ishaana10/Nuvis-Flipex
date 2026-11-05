<?php
declare(strict_types=1);

namespace App\Modules\Subscriptions;

use App\Controllers\BillingController;
use App\Shared\ModuleContract;

final class SubscriptionsModule implements ModuleContract
{
    public static function name(): string { return 'Subscriptions'; }
    public static function layer(): string { return 'Business Services'; }
    public static function description(): string { return 'Subscription plan tiers (Starter, Pro, Enterprise), self-service upgrades/downgrades, automatic renewals, grace periods, overdue auto-suspension, and subscription history.'; }
    public static function dependencies(): array { return ['Tenants', 'Billing', 'Audit', 'Infrastructure\\Database']; }
    public static function capabilities(): array
    {
        return [
            'controller' => BillingController::class,
            'features' => ['Self-Service Plan Upgrade & Downgrade', 'Auto-Renewal Engine', 'Configurable Grace Periods', 'Overdue Auto-Suspension & Instant Reactivation', 'Subscription Audit Trail'],
        ];
    }
}
