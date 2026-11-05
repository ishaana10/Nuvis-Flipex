<?php
declare(strict_types=1);

namespace App\Modules\Audit;

use App\Infrastructure\Logging\CentralExceptionReporter;
use App\Infrastructure\Logging\JsonLogger;
use App\Shared\ModuleContract;
use App\Support\Audit;
use App\Support\SecurityMonitor;

final class AuditModule implements ModuleContract
{
    public static function name(): string { return 'Audit'; }
    public static function layer(): string { return 'Business Services & Observability'; }
    public static function description(): string { return 'Immutable tenant-scoped audit trail, security threat & IDOR monitoring, structured JSON logs, and centralised exception reporting.'; }
    public static function dependencies(): array { return ['Tenants', 'Infrastructure\\Database', 'Infrastructure\\Logging']; }
    public static function capabilities(): array
    {
        return [
            'services' => [Audit::class, SecurityMonitor::class, JsonLogger::class, CentralExceptionReporter::class],
            'features' => ['Immutable Tenant Audit Trail', 'Token Replay & IDOR Security Monitor', 'Structured JSONL Logging', 'Centralised Exception Reporting'],
        ];
    }
}
