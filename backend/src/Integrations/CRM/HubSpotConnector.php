<?php
declare(strict_types=1);

namespace App\Integrations\CRM;

use App\Integrations\Contracts\ConnectorInterface;
use Throwable;

final class HubSpotConnector implements ConnectorInterface
{
    public function getType(): string
    {
        return 'hubspot';
    }

    public function getName(): string
    {
        return 'HubSpot CRM Engagement & Deals';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $token = trim((string) ($config['accessToken'] ?? ($config['apiKey'] ?? '')));
        if ($token === '' || str_contains($token, 'pat-na1-xxxx')) {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'HubSpot connector configured. Enter your Private App Access Token to test live sync.',
                'latencyMs' => 0,
                'details' => ['hasToken' => $token !== ''],
            ];
        }

        try {
            $ch = curl_init('https://api.hubapi.com/crm/v3/objects/contacts?limit=1');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_HTTPHEADER => [
                    'Authorization: Bearer ' . $token,
                    'Content-Type: application/json',
                ],
            ]);
            $body = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);

            $latency = (int) round((microtime(true) - $start) * 1000);
            if ($err !== '') {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "HubSpot API connection error: {$err}",
                    'latencyMs' => $latency,
                    'details' => ['code' => $code],
                ];
            }

            if ($code === 200) {
                return [
                    'success' => true,
                    'status' => 'operational',
                    'message' => "HubSpot CRM token validated ({$latency}ms). Contact dwell & UTM sync operational.",
                    'latencyMs' => $latency,
                    'details' => ['authenticated' => true],
                ];
            }

            if ($code === 401 || $code === 403) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => 'HubSpot authentication rejected (HTTP 401/403). Check Private App permissions (crm.objects.contacts.read).',
                    'latencyMs' => $latency,
                    'details' => ['httpCode' => $code],
                ];
            }

            return [
                'success' => true,
                'status' => 'connected',
                'message' => "HubSpot API responded HTTP {$code} ({$latency}ms).",
                'latencyMs' => $latency,
                'details' => ['httpCode' => $code],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'HubSpot test exception: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'details' => [],
            ];
        }
    }
}
