<?php
declare(strict_types=1);

namespace App\Shared;

use App\Modules\Analytics\AnalyticsModule;
use App\Modules\Audit\AuditModule;
use App\Modules\Authentication\AuthenticationModule;
use App\Modules\Billing\BillingModule;
use App\Modules\DocumentProcessing\DocumentProcessingModule;
use App\Modules\Flipbook\FlipbookModule;
use App\Modules\Hotspots\HotspotsModule;
use App\Modules\Integrations\IntegrationsModule;
use App\Modules\Notifications\NotificationsModule;
use App\Modules\Permissions\PermissionsModule;
use App\Modules\Publications\PublicationsModule;
use App\Modules\Publishing\PublishingModule;
use App\Modules\Subscriptions\SubscriptionsModule;
use App\Modules\Tenants\TenantsModule;
use App\Modules\Users\UsersModule;

/**
 * Central Modular Monolith Registry.
 * Exposes the 15 domain modules, 5 infrastructure services, and 6-layer system architecture topology.
 */
final class ModuleRegistry
{
    /** @var array<class-string<ModuleContract>> */
    public const MODULES = [
        AuthenticationModule::class,
        TenantsModule::class,
        UsersModule::class,
        PermissionsModule::class,
        PublicationsModule::class,
        DocumentProcessingModule::class,
        FlipbookModule::class,
        HotspotsModule::class,
        PublishingModule::class,
        AnalyticsModule::class,
        SubscriptionsModule::class,
        BillingModule::class,
        IntegrationsModule::class,
        NotificationsModule::class,
        AuditModule::class,
    ];

    public static function blueprint(): array
    {
        $modules = [];
        foreach (self::MODULES as $class) {
            $modules[] = [
                'name' => $class::name(),
                'namespace' => "App\\Modules\\" . $class::name(),
                'path' => "backend/src/Modules/" . $class::name() . "/",
                'layer' => $class::layer(),
                'description' => $class::description(),
                'dependencies' => $class::dependencies(),
                'capabilities' => $class::capabilities(),
                'status' => 'active',
            ];
        }

        return [
            'pattern' => 'Modular Monolith (Domain-Driven Layered Architecture)',
            'layers' => [
                [
                    'order' => 1,
                    'title' => 'React + TypeScript Frontend',
                    'subsystems' => ['Admin Console', 'Publisher Studio', '3D & Scroll Flipbook Reader', 'Tenant Billing & Integrations Portal', 'DevOps & Architecture Console'],
                ],
                [
                    'order' => 2,
                    'title' => 'PHP Slim REST API Gateway',
                    'subsystems' => ['Authentication (JWT / Argon2id / API Key)', 'Request Validation', 'RBAC Authorization', 'Tenant Context & IDOR Guard'],
                ],
                [
                    'order' => 3,
                    'title' => 'Business Domain Services (15 Modules)',
                    'subsystems' => ['Publishing Lifecycle', 'Billing & Fiji Reconciliation', 'Commercial Analytics & Heatmaps', 'Users & Password Policy', 'Interactive Hotspots & ERP Catalogues'],
                ],
                [
                    'order' => 4,
                    'title' => 'Infrastructure Services',
                    'subsystems' => ['Object Storage (S3 + CDN)', 'Persistent Queue & Dead-Letter Queue', 'Transactional SMTP Mail', 'Redis Cache & Distributed Locks', 'HMAC-SHA256 Webhooks & JSONL Logging'],
                ],
                [
                    'order' => 5,
                    'title' => 'Stateful Data & Storage Tier',
                    'subsystems' => ['MySQL 8 (Business Data & Reversible Migrations)', 'Redis (Queue, Cache & Distributed Locks)', 'S3-Compatible Object Storage (PDFs, Multi-Res Images, WebP/AVIF Assets)'],
                ],
                [
                    'order' => 6,
                    'title' => 'Isolated Background Workers',
                    'subsystems' => ['Document Conversion Worker (bin/worker.php)', 'Webhook & Scheduled Analytics Notification Worker'],
                ],
            ],
            'modules' => $modules,
            'infrastructure' => [
                ['name' => 'Database', 'path' => 'backend/src/Infrastructure/Database/', 'class' => 'App\\Infrastructure\\Database\\DatabaseManager'],
                ['name' => 'Storage & CDN', 'path' => 'backend/src/Infrastructure/Storage/', 'class' => 'App\\Infrastructure\\Storage\\ObjectStorageAdapter'],
                ['name' => 'Queue & DLQ', 'path' => 'backend/src/Infrastructure/Queue/', 'class' => 'App\\Infrastructure\\Queue\\QueueManager'],
                ['name' => 'Cache & Locks', 'path' => 'backend/src/Infrastructure/Cache/', 'class' => 'App\\Infrastructure\\Cache\\CacheManager'],
                ['name' => 'Mail', 'path' => 'backend/src/Infrastructure/Mail/', 'class' => 'App\\Infrastructure\\Mail\\TransactionalMailer'],
                ['name' => 'Logging & Errors', 'path' => 'backend/src/Infrastructure/Logging/', 'class' => 'App\\Infrastructure\\Logging\\JsonLogger'],
                ['name' => 'Monitoring', 'path' => 'backend/src/Infrastructure/Monitoring/', 'class' => 'App\\Infrastructure\\Monitoring\\SystemHealthService'],
                ['name' => 'Backups & Recovery', 'path' => 'backend/src/Infrastructure/Backup/', 'class' => 'App\\Infrastructure\\Backup\\BackupManager'],
            ],
        ];
    }
}
