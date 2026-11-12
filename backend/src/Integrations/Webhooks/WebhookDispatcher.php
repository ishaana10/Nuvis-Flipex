<?php
declare(strict_types=1);

namespace App\Integrations\Webhooks;

use App\Support\Db;
use Throwable;

final class WebhookDispatcher
{
    /**
     * Dispatch an event to all active tenant webhooks subscribed to $eventName.
     */
    public static function dispatch(?int $tenantId, string $eventName, array $data): int
    {
        if (!$tenantId || $tenantId <= 0) {
            return 0;
        }

        $hooks = Db::all(
            'SELECT * FROM webhooks WHERE tenant_id = ? AND is_active = 1',
            [$tenantId]
        );

        $dispatched = 0;
        foreach ($hooks as $hook) {
            $events = json_decode((string) $hook['events'], true) ?: [];
            if (!in_array('*', $events, true) && !in_array($eventName, $events, true)) {
                continue;
            }

            self::deliver($hook, $eventName, $data);
            $dispatched++;
        }

        return $dispatched;
    }

    /**
     * Deliver a single webhook event with signed HMAC-SHA256 headers and audit logging.
     */
    public static function deliver(array $hook, string $eventName, array $data): array
    {
        $payload = [
            'id' => 'evt_' . bin2hex(random_bytes(8)),
            'event' => $eventName,
            'tenant_id' => (int) $hook['tenant_id'],
            'timestamp' => gmdate('c'),
            'data' => $data,
        ];
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $secret = (string) ($hook['secret_token'] ?? '');
        $sigHeader = WebhookSigner::sign((string) $json, $secret);

        $start = microtime(true);
        $statusCode = 200;
        $responseBody = '{"status":"delivered"}';

        $url = (string) $hook['target_url'];
        if (str_starts_with($url, 'http://') || str_starts_with($url, 'https://')) {
            try {
                $ch = curl_init($url);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_POST => true,
                    CURLOPT_POSTFIELDS => $json,
                    CURLOPT_TIMEOUT => 5,
                    CURLOPT_CONNECTTIMEOUT => 3,
                    CURLOPT_HTTPHEADER => [
                        'Content-Type: application/json',
                        'User-Agent: NuvisFlipex-Webhook/2.0',
                        'X-Flipex-Event: ' . $eventName,
                        'X-Flipex-Signature: ' . $sigHeader,
                    ],
                ]);
                $resp = curl_exec($ch);
                $statusCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $err = curl_error($ch);
                curl_close($ch);

                if ($err !== '' && $statusCode === 0) {
                    $statusCode = 504;
                    $responseBody = json_encode(['error' => "Curl delivery failed: {$err}"]);
                } else {
                    $responseBody = mb_substr((string) $resp, 0, 1000);
                }
            } catch (Throwable $e) {
                $statusCode = 500;
                $responseBody = json_encode(['error' => $e->getMessage()]);
            }
        }

        $durationMs = (int) round((microtime(true) - $start) * 1000);

        try {
            Db::run(
                'INSERT INTO webhook_deliveries (tenant_id, webhook_id, event_name, payload, response_code, response_body, duration_ms)
                 VALUES (?, ?, ?, ?, ?, ?, ?)',
                [$hook['tenant_id'], $hook['id'], $eventName, $json, $statusCode, $responseBody, $durationMs]
            );

            Db::run(
                'UPDATE webhooks SET last_triggered_at = NOW(), last_status_code = ? WHERE id = ?',
                [$statusCode, $hook['id']]
            );
        } catch (Throwable) {
        }

        return [
            'statusCode' => $statusCode,
            'durationMs' => $durationMs,
            'signature' => $sigHeader,
            'responseBody' => $responseBody,
        ];
    }
}
