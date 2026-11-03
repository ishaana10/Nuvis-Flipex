<?php
declare(strict_types=1);

namespace App\Support;

use PHPMailer\PHPMailer\PHPMailer;

final class Mailer
{
    public static function send(string $to, string $subject, string $html): void
    {
        $m = new PHPMailer(true);
        $m->isSMTP();
        $m->Host = $_ENV['MAIL_HOST'];
        $m->Port = (int) $_ENV['MAIL_PORT'];
        $m->SMTPAuth = false;
        $m->SMTPAutoTLS = false;
        $m->setFrom($_ENV['MAIL_FROM'], 'FlipBook');
        $m->addAddress($to);
        $m->isHTML(true);
        $m->CharSet = 'UTF-8';
        $m->Subject = $subject;
        $m->Body = $html;
        $m->send();
    }
}
