<?php
declare(strict_types=1);

namespace App\Modules\Notifications;

use App\Infrastructure\Mail\TransactionalMailer;
use App\Shared\ModuleContract;
use App\Support\WebhookDispatcher;

final class NotificationsModule implements ModuleContract
{
    public static function name(): string { return 'Notifications'; }
    public static function layer(): string { return 'Business Services & Background Workers'; }
    public static function description(): string { return 'Transactional SMTP email dispatch, in-app conversion job notifications, scheduled analytics delivery, and outgoing webhook event broadcasts.'; }
    public static function dependencies(): array { return ['Users', 'Tenants', 'Infrastructure\\Mail', 'Infrastructure\\Queue']; }
    public static function capabilities(): array
    {
        return [
            'services' => [TransactionalMailer::class, WebhookDispatcher::class],
            'features' => ['Transactional SMTP Mailer', 'In-App Header Bell Telemetry', 'Scheduled Analytics Dispatch', 'Admin Broadcast Announcements'],
        ];
    }
}
