<?php
declare(strict_types=1);

namespace App\Support;

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as MailerException;

final class Mailer
{
    /** Load configuration from system_settings or env fallback */
    public static function getConfig(): array
    {
        $settings = [];
        try {
            $rows = Db::all('SELECT setting_key, setting_value FROM system_settings');
            foreach ($rows as $r) {
                $settings[$r['setting_key']] = $r['setting_value'];
            }
        } catch (\Throwable) {
            // DB fallback
        }

        return [
            'host' => $settings['smtp_host'] ?? ($_ENV['MAIL_HOST'] ?? '127.0.0.1'),
            'port' => (int) ($settings['smtp_port'] ?? ($_ENV['MAIL_PORT'] ?? 1025)),
            'user' => $settings['smtp_user'] ?? '',
            'pass' => $settings['smtp_pass'] ?? '',
            'encryption' => strtolower($settings['smtp_encryption'] ?? 'none'),
            'from_email' => $settings['smtp_from_email'] ?? ($_ENV['MAIL_FROM'] ?? 'noreply@nuvisflipex.com'),
            'from_name' => $settings['smtp_from_name'] ?? 'Nuvis Flipex',
        ];
    }

    /** Core Dispatch Method with Auto Fallback & Logging */
    public static function send(string $to, string $subject, string $html, string $template = 'generic'): bool
    {
        $cfg = self::getConfig();
        $status = 'sent';
        $error = null;

        try {
            $mail = new PHPMailer(true);
            $mail->isSMTP();
            $mail->Host = $cfg['host'];
            $mail->Port = $cfg['port'];
            $mail->Timeout = 5;

            if ($cfg['encryption'] === 'ssl') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            } elseif ($cfg['encryption'] === 'tls') {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            } else {
                $mail->SMTPAutoTLS = false;
            }

            if (!empty($cfg['user']) && !empty($cfg['pass'])) {
                $mail->SMTPAuth = true;
                $mail->Username = $cfg['user'];
                $mail->Password = $cfg['pass'];
            } else {
                $mail->SMTPAuth = false;
            }

            $mail->setFrom($cfg['from_email'], $cfg['from_name']);
            $mail->addAddress($to);
            $mail->isHTML(true);
            $mail->CharSet = 'UTF-8';
            $mail->Subject = $subject;
            $mail->Body = $html;
            $mail->AltBody = strip_tags(str_replace(['<br>', '<br/>', '</p>'], "\n", $html));

            $mail->send();
        } catch (MailerException | \Throwable $e) {
            // If SMTP is unavailable in development, log as simulated so the app never crashes
            $status = 'simulated';
            $error = $e->getMessage();

            // Save copy to storage for inspection
            $dir = __DIR__ . '/../../storage/mail_logs';
            if (!is_dir($dir)) {
                @mkdir($dir, 0777, true);
            }
            $filename = $dir . '/' . date('Ymd_His') . '_' . bin2hex(random_bytes(3)) . '.html';
            @file_put_contents($filename, "<!-- To: $to | Subject: $subject | Error: $error -->\n" . $html);
        }

        // Record in email_logs audit table
        try {
            $preview = mb_substr(strip_tags($html), 0, 200);
            Db::run(
                'INSERT INTO email_logs (recipient, subject, template, status, error_message, body_preview)
                 VALUES (?, ?, ?, ?, ?, ?)',
                [$to, $subject, $template, $status, $error, $preview]
            );
        } catch (\Throwable) {
            // DB log fallback
        }

        return $status === 'sent';
    }

    /** Branded HTML Shell with Golden Nuvis Flipex Styling */
    public static function wrapTemplate(string $title, string $content, ?string $btnText = null, ?string $btnUrl = null): string
    {
        $appUrl = $_ENV['APP_URL'] ?? 'http://localhost:5173';
        $buttonHtml = '';
        if ($btnText && $btnUrl) {
            $buttonHtml = "
            <div style=\"text-align: center; margin: 30px 0;\">
              <a href=\"{$btnUrl}\" style=\"background: linear-gradient(135deg, #F5C542 0%, #E5A528 100%); color: #18191c; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 8px; display: inline-block; font-size: 15px; box-shadow: 0 4px 12px rgba(245, 197, 66, 0.35); text-transform: uppercase; letter-spacing: 0.5px;\">
                {$btnText}
              </a>
            </div>";
        }

        return "
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset=\"utf-8\">
          <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
          <title>{$title}</title>
        </head>
        <body style=\"margin: 0; padding: 0; background-color: #0f172a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #334155;\">
          <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color: #0f172a; padding: 40px 15px;\">
            <tr>
              <td align=\"center\">
                <table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3);\">
                  <!-- Golden Brand Header -->
                  <tr>
                    <td style=\"background: #111827; padding: 30px 40px; text-align: center; border-bottom: 3px solid #F5C542;\">
                      <h1 style=\"margin: 0; font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;\">
                        <span style=\"color: #F5C542;\">Nuvis</span> <span style=\"color: #ffffff;\">Flipex</span>
                      </h1>
                      <p style=\"margin: 5px 0 0 0; color: #94a3b8; font-size: 13px;\">Next-Gen Digital Publication Platform</p>
                    </td>
                  </tr>
                  <!-- Body Content -->
                  <tr>
                    <td style=\"padding: 40px;\">
                      <h2 style=\"margin: 0 0 18px 0; color: #0f172a; font-size: 20px; font-weight: 700;\">{$title}</h2>
                      <div style=\"font-size: 15px; line-height: 1.6; color: #475569;\">
                        {$content}
                      </div>
                      {$buttonHtml}
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style=\"background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;\">
                      <p style=\"margin: 0 0 6px 0;\">© " . date('Y') . " Nuvis Flipex. All rights reserved.</p>
                      <p style=\"margin: 0;\">If you did not request this email, you can safely disregard it.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>";
    }

    /** 1. Password Reset Notification */
    public static function passwordReset(string $to, string $name, string $resetUrl): bool
    {
        $title = "Reset Your Nuvis Flipex Password";
        $content = "
        <p>Hello <b>" . htmlspecialchars($name) . "</b>,</p>
        <p>We received a request to reset the password for your Nuvis Flipex account.</p>
        <p>Click the button below to choose a new password. This secure link is valid for <b>1 hour</b>.</p>";

        $html = self::wrapTemplate($title, $content, "Reset Password", $resetUrl);
        return self::send($to, "Reset your Nuvis Flipex password", $html, 'password_reset');
    }

    /** 2. Welcome & Account Created Notification */
    public static function accountCreated(string $to, string $name, ?string $tempPassword = null): bool
    {
        $appUrl = $_ENV['APP_URL'] ?? 'http://localhost:5173';
        $title = "Welcome to Nuvis Flipex!";
        $credBlock = $tempPassword
            ? "<div style=\"background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 20px; margin: 20px 0;\">
                 <p style=\"margin: 0 0 6px 0; font-size: 13px; color: #64748b;\">Your Temporary Credentials:</p>
                 <p style=\"margin: 0; font-family: monospace; font-size: 15px;\"><strong>Email:</strong> " . htmlspecialchars($to) . "<br><strong>Password:</strong> " . htmlspecialchars($tempPassword) . "</p>
               </div>"
            : "";

        $content = "
        <p>Hello <b>" . htmlspecialchars($name) . "</b>,</p>
        <p>Your account on <b>Nuvis Flipex</b> has been successfully created. You can now publish interactive 3D digital magazines, customize readers, and track customer engagement.</p>
        {$credBlock}
        <p>Click the button below to sign in to your dashboard.</p>";

        $html = self::wrapTemplate($title, $content, "Sign In to Console", $appUrl . "/login");
        return self::send($to, "Welcome to Nuvis Flipex — Account Created", $html, 'account_created');
    }

    /** 3. Two-Factor Authentication OTP Code */
    public static function send2faCode(string $to, string $name, string $code): bool
    {
        $title = "Your Security Verification Code";
        $content = "
        <p>Hello <b>" . htmlspecialchars($name) . "</b>,</p>
        <p>To verify your identity and complete sign-in to Nuvis Flipex, please enter the following 6-digit verification code:</p>
        <div style=\"text-align: center; margin: 30px 0;\">
          <div style=\"display: inline-block; background: #f1f5f9; border: 2px dashed #F5C542; border-radius: 10px; padding: 16px 36px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0f172a; font-family: monospace;\">
            {$code}
          </div>
        </div>
        <p style=\"font-size: 13px; color: #64748b; text-align: center;\">This code expires in <b>10 minutes</b>. Never share this code with anyone.</p>";

        $html = self::wrapTemplate($title, $content);
        return self::send($to, "Your Nuvis Flipex 2FA Code: {$code}", $html, 'two_factor_otp');
    }

    /** 4. Customer Publication Converted & Published Notification */
    public static function publicationConverted(string $to, string $name, string $flipbookTitle, string $readerUrl): bool
    {
        $title = "Your Flipbook is Ready to Read!";
        $content = "
        <p>Hello <b>" . htmlspecialchars($name) . "</b>,</p>
        <p>Great news! Your publication <b>“" . htmlspecialchars($flipbookTitle) . "”</b> has finished high-resolution processing and is now published online.</p>
        <p>Readers can now view page-flipping transitions, interactive audio, and responsive zoom on desktop, tablet, and mobile.</p>";

        $html = self::wrapTemplate($title, $content, "Open Flipbook Reader", $readerUrl);
        return self::send($to, "Publication Ready: “{$flipbookTitle}”", $html, 'publication_ready');
    }

    /** 5. Custom / Broadcast Customer Notification */
    public static function customNotification(string $to, string $subject, string $title, string $message, ?string $btnText = null, ?string $btnUrl = null): bool
    {
        $content = "<p>" . nl2br(htmlspecialchars($message)) . "</p>";
        $html = self::wrapTemplate($title, $content, $btnText, $btnUrl);
        return self::send($to, $subject, $html, 'custom_broadcast');
    }
}
