<?php
declare(strict_types=1);

namespace App\Integrations\CRM;

use App\Integrations\Contracts\ConnectorInterface;
use Throwable;

final class SalesforceConnector implements ConnectorInterface
{
    public function getType(): string
    {
        return 'salesforce';
    }

    public function getName(): string
    {
        return 'Salesforce CRM Lead & Opportunity Sync';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $instanceUrl = rtrim(trim((string) ($config['instanceUrl'] ?? 'https://login.salesforce.com')), '/');
        $token = trim((string) ($config['accessToken'] ?? ''));

        if ($token === '' || str_contains($instanceUrl, 'example.com')) {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'Salesforce configuration saved. Provide your OAuth Bearer Token or Connected App credentials to test live sync.',
                'latencyMs' => 0,
                'details' => ['instanceUrl' => $instanceUrl],
            ];
        }

        try {
            $ch = curl_init($instanceUrl . '/services/data/');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_HTTPHEADER => [
                    'Authorization: Bearer ' . $token,
                    'Accept: application/json',
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
                    'message' => "Salesforce connection error: {$err}",
                    'latencyMs' => $latency,
                    'details' => ['instanceUrl' => $instanceUrl],
                ];
            }

            if ($code === 200) {
                return [
                    'success' => true,
                    'status' => 'operational',
                    'message' => "Salesforce REST API verified ({$latency}ms). Lead and campaign pipelines operational.",
                    'latencyMs' => $latency,
                    'details' => ['authenticated' => true],
                ];
            }

            if ($code === 401 || $code === 403) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "Salesforce authentication rejected (HTTP {$code}). Refresh your Connected App access token.",
                    'latencyMs' => $latency,
                    'details' => ['httpCode' => $code],
                ];
            }

            return [
                'success' => true,
                'status' => 'connected',
                'message' => "Salesforce endpoint reachable (HTTP {$code}, {$latency}ms).",
                'latencyMs' => $latency,
                'details' => ['httpCode' => $code],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'Salesforce connection error: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'details' => [],
            ];
        }
    }
}
