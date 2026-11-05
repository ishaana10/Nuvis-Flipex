<?php
declare(strict_types=1);

namespace App\Modules\Analytics;

use App\Controllers\AnalyticsController;
use App\Shared\ModuleContract;

final class AnalyticsModule implements ModuleContract
{
    public static function name(): string { return 'Analytics'; }
    public static function layer(): string { return 'Business Services'; }
    public static function description(): string { return 'Commercial publication analytics, page-by-page engagement heatmaps, completion rates, UTM campaign attribution, publication comparisons, CSV/PDF export, and scheduled reports.'; }
    public static function dependencies(): array { return ['Publications', 'Tenants', 'Notifications', 'Infrastructure\\Database']; }
    public static function capabilities(): array
    {
        return [
            'controller' => AnalyticsController::class,
            'features' => ['Page Engagement Attention Heatmap', 'UTM Campaign Attribution', 'Side-by-Side Publication Comparison', 'CSV & PDF Executive Reports', 'Scheduled Email Reports'],
        ];
    }
}
