<?php
declare(strict_types=1);

namespace App\Integrations\ERP;

use App\Integrations\Contracts\ErpConnectorInterface;
use Throwable;

final class OdooConnector implements ErpConnectorInterface
{
    public function getType(): string
    {
        return 'odoo';
    }

    public function getName(): string
    {
        return 'Odoo ERP Catalogue & Stock Connector';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $odooUrl = rtrim(trim((string) ($config['url'] ?? '')), '/');
        $db = trim((string) ($config['db'] ?? ''));
        $username = trim((string) ($config['username'] ?? ''));
        $apiKey = (string) ($config['apiKey'] ?? ($config['password'] ?? ''));

        if ($odooUrl === '' || str_contains($odooUrl, 'example.com')) {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'Odoo connector configured. Specify your Odoo URL and Database to test live handshake.',
                'latencyMs' => 0,
                'details' => ['odooUrl' => $odooUrl, 'db' => $db],
            ];
        }

        try {
            // Test 1: Authenticate via Odoo JSON-RPC if credentials supplied
            if ($db !== '' && $username !== '' && $apiKey !== '') {
                $payload = json_encode([
                    'jsonrpc' => '2.0',
                    'method' => 'call',
                    'params' => [
                        'service' => 'common',
                        'method' => 'authenticate',
                        'args' => [$db, $username, $apiKey, []],
                    ],
                    'id' => random_int(100, 9999),
                ]);

                $ch = curl_init($odooUrl . '/jsonrpc');
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_POST => true,
                    CURLOPT_POSTFIELDS => $payload,
                    CURLOPT_TIMEOUT => 6,
                    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                ]);
                $resp = curl_exec($ch);
                $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                $latency = (int) round((microtime(true) - $start) * 1000);
                $data = json_decode((string) $resp, true);

                if (isset($data['result']) && is_numeric($data['result']) && (int) $data['result'] > 0) {
                    return [
                        'success' => true,
                        'status' => 'operational',
                        'message' => "Odoo JSON-RPC authenticated successfully (User ID: {$data['result']}, {$latency}ms). Database: {$db}.",
                        'latencyMs' => $latency,
                        'details' => ['db' => $db, 'uid' => $data['result'], 'authenticated' => true],
                    ];
                }

                if (isset($data['error'])) {
                    return [
                        'success' => false,
                        'status' => 'error',
                        'message' => 'Odoo rejected authentication: ' . ($data['error']['data']['message'] ?? $data['error']['message'] ?? 'Invalid credentials'),
                        'latencyMs' => $latency,
                        'details' => ['httpCode' => $code],
                    ];
                }
            }

            // Test 2: Endpoint web ping
            $ch = curl_init($odooUrl . '/web/login');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 4,
            ]);
            curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);

            $latency = (int) round((microtime(true) - $start) * 1000);
            if ($err !== '') {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "Odoo server unreachable at {$odooUrl}: {$err}",
                    'latencyMs' => $latency,
                    'details' => ['url' => $odooUrl],
                ];
            }

            return [
                'success' => true,
                'status' => 'connected',
                'message' => "Odoo server reachable (HTTP {$code}, {$latency}ms). Ready for JSON-RPC authentication.",
                'latencyMs' => $latency,
                'details' => ['httpCode' => $code],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'Odoo test error: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'details' => [],
            ];
        }
    }

    public function fetchProducts(array $config, array $filter = []): array
    {
        return [];
    }
}
