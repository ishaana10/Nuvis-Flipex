<?php
declare(strict_types=1);

namespace App\Integrations\Webhooks;

use App\Support\Db;
use Throwable;

final class WebhookRetryManager
{
    /** Max delivery attempts before dead lettering */
    public const MAX_ATTEMPTS = 5;

    /**
     * Retry failed deliveries for a tenant.
     * @return array{retried: int, succeeded: int, failed: int}
     */
    public static function retryFailedDeliveries(int $tenantId, int $limit = 20): array
    {
        $stats = ['retried' => 0, 'succeeded' => 0, 'failed' => 0];

        $failed = Db::all(
            'SELECT d.*, w.target_url, w.secret_token, w.is_active
             FROM webhook_deliveries d
             JOIN webhooks w ON w.id = d.webhook_id
             WHERE d.tenant_id = ? AND (d.response_code >= 400 OR d.response_code = 0)
             ORDER BY d.id DESC LIMIT ' . max(1, $limit),
            [$tenantId]
        );

        foreach ($failed as $deliv) {
            if (empty($deliv['is_active'])) {
                continue;
            }
            $stats['retried']++;
            $hook = [
                'id' => $deliv['webhook_id'],
                'tenant_id' => $tenantId,
                'target_url' => $deliv['target_url'],
                'secret_token' => $deliv['secret_token'],
            ];
            $payload = json_decode((string) $deliv['payload'], true) ?: [];
            $data = $payload['data'] ?? [];

            try {
                $result = WebhookDispatcher::deliver($hook, (string) $deliv['event_name'], $data);
                if ($result['statusCode'] >= 200 && $result['statusCode'] < 300) {
                    $stats['succeeded']++;
                } else {
                    $stats['failed']++;
                }
            } catch (Throwable) {
                $stats['failed']++;
            }
        }

        return $stats;
    }
}
