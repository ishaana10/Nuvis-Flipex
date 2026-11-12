<?php
declare(strict_types=1);

namespace App\Integrations\ERP;

use App\Integrations\Contracts\ErpConnectorInterface;
use Throwable;

final class SapConnector implements ErpConnectorInterface
{
    public function getType(): string
    {
        return 'sap';
    }

    public function getName(): string
    {
        return 'SAP Business One / S/4HANA Service Layer';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $serviceUrl = rtrim(trim((string) ($config['serviceLayerUrl'] ?? ($config['apiUrl'] ?? ''))), '/');
        $companyDb = trim((string) ($config['companyDb'] ?? ''));
        $username = trim((string) ($config['username'] ?? ''));
        $password = (string) ($config['password'] ?? '');

        if ($serviceUrl === '' || str_contains($serviceUrl, 'example.com') || str_contains($serviceUrl, 'corporate.local')) {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'SAP connector configured. Enter your Service Layer / OData URL and Company DB to test live sync.',
                'latencyMs' => 0,
                'details' => ['serviceUrl' => $serviceUrl, 'companyDb' => $companyDb],
            ];
        }

        try {
            // Test 1: Service Layer Login endpoint if credentials supplied
            if ($companyDb !== '' && $username !== '' && $password !== '') {
                $loginUrl = $serviceUrl . (str_contains($serviceUrl, '/b1s/v1') ? '/Login' : '/b1s/v1/Login');
                $payload = json_encode([
                    'CompanyDB' => $companyDb,
                    'UserName' => $username,
                    'Password' => $password,
                ]);

                $ch = curl_init($loginUrl);
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_POST => true,
                    CURLOPT_POSTFIELDS => $payload,
                    CURLOPT_TIMEOUT => 6,
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                ]);
                $body = curl_exec($ch);
                $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $err = curl_error($ch);
                curl_close($ch);

                $latency = (int) round((microtime(true) - $start) * 1000);
                if ($code === 200) {
                    return [
                        'success' => true,
                        'status' => 'operational',
                        'message' => "SAP Service Layer authenticated successfully ({$latency}ms). Company DB: {$companyDb}.",
                        'latencyMs' => $latency,
                        'details' => ['companyDb' => $companyDb, 'authenticated' => true],
                    ];
                }

                if ($code === 401 || $code === 400) {
                    return [
                        'success' => false,
                        'status' => 'error',
                        'message' => "SAP authentication rejected (HTTP {$code}). Verify Company DB, username, and password.",
                        'latencyMs' => $latency,
                        'details' => ['httpCode' => $code],
                    ];
                }
            }

            // Test 2: Reachability of the OData / Service Layer endpoint
            $ch = curl_init($serviceUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 4,
                CURLOPT_SSL_VERIFYPEER => false,
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
                    'message' => "SAP Service Layer unreachable at {$serviceUrl}: {$err}",
                    'latencyMs' => $latency,
                    'details' => ['serviceUrl' => $serviceUrl],
                ];
            }

            return [
                'success' => true,
                'status' => 'connected',
                'message' => "SAP endpoint reachable (HTTP {$code}, {$latency}ms). Ready for Service Layer authentication.",
                'latencyMs' => $latency,
                'details' => ['httpCode' => $code],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'SAP test exception: ' . $e->getMessage(),
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
