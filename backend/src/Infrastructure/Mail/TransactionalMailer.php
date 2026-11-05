<?php
declare(strict_types=1);

namespace App\Infrastructure\Mail;

use App\Support\Db;
use App\Support\Mailer;

/**
 * Infrastructure Transactional Mail Service.
 */
final class TransactionalMailer
{
    public static function send(string $to, string $subject, string $type, string $html, ?int $userId = null): bool
    {
        return Mailer::send($to, $subject, $type, $html, $userId);
    }

    public static function status(): array
    {
        $cnt = 0;
        try {
            $cnt = (int) (Db::one('SELECT COUNT(*) AS c FROM email_logs')['c'] ?? 0);
        } catch (\Throwable) {
        }
        return [
            'driver' => !empty($_ENV['SMTP_HOST']) ? 'smtp_tls' : 'transactional_audit_mailer',
            'smtpHost' => $_ENV['SMTP_HOST'] ?? 'smtp.nuvistechnologies.com.fj',
            'smtpPort' => (int) ($_ENV['SMTP_PORT'] ?? 587),
            'totalDispatched' => $cnt,
            'status' => 'operational',
        ];
    }
}
