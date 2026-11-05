<?php
declare(strict_types=1);

namespace App\Modules\Billing;

use App\Controllers\BillingController;
use App\Shared\ModuleContract;

final class BillingModule implements ModuleContract
{
    public static function name(): string { return 'Billing'; }
    public static function layer(): string { return 'Business Services'; }
    public static function description(): string { return 'Multi-currency invoicing (FJD, USD, AUD, NZD, EUR), Fiji VAT/GST tax calculations, storage & bandwidth metering, online payment gateways, and Fiji manual bank transfer reconciliation.'; }
    public static function dependencies(): array { return ['Tenants', 'Subscriptions', 'Integrations', 'Audit']; }
    public static function capabilities(): array
    {
        return [
            'controller' => BillingController::class,
            'features' => ['Itemized Tax Invoice Generation', '15% Fiji VAT / GST Calculation', 'BSP / ANZ / Westpac Fiji Manual Bank Reconciliation', 'Stripe / M-PAiSA / MyCash / PayPal Gateways', 'Storage & Bandwidth Usage Metering'],
        ];
    }
}
