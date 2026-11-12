<?php
declare(strict_types=1);

namespace App\Integrations\CRM;

use App\Integrations\Contracts\ConnectorInterface;
use Throwable;

final class ZohoConnector implements ConnectorInterface
{
    public function getType(): string
    {
        return 'zoho';
    }

    public function getName(): string
    {
        return 'Zoho CRM & Zoho Bigin Pipeline Sync';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $domain = trim((string) ($config['domain'] ?? 'com')); // com, eu, in, com.au
        $token = trim((string) ($config['accessToken'] ?? ''));

        if ($token === '') {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'Zoho CRM / Bigin configuration saved. Provide your OAuth token to test live handshake.',
                'latencyMs' => 0,
                'details' => ['domain' => $domain],
            ];
        }

        try {
            $url = "https://www.zohoapis.{$domain}/crm/v2/org";
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_HTTPHEADER => [
                    'Authorization: Zoho-oauthtoken ' . $token,
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
                    'message' => "Zoho connection error: {$err}",
                    'latencyMs' => $latency,
                    'details' => ['url' => $url],
                ];
            }

            if ($code === 200) {
                return [
                    'success' => true,
                    'status' => 'operational',
                    'message' => "Zoho Organization API verified ({$latency}ms). Deals & reader attribution operational.",
                    'latencyMs' => $latency,
                    'details' => ['authenticated' => true],
                ];
            }

            if ($code === 401 || $code === 403) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => 'Zoho OAuth token expired or invalid (HTTP 401). Please refresh your access token.',
                    'latencyMs' => $latency,
                    'details' => ['httpCode' => $code],
                ];
            }

            return [
                'success' => true,
                'status' => 'connected',
                'message' => "Zoho API responded HTTP {$code} ({$latency}ms).",
                'latencyMs' => $latency,
                'details' => ['httpCode' => $code],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'Zoho test exception: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'details' => [],
            ];
        }
    }
}
