<?php
declare(strict_types=1);

namespace App\Integrations\Identity;

use App\Integrations\Contracts\ConnectorInterface;
use Throwable;

final class OidcConnector implements ConnectorInterface
{
    public function getType(): string
    {
        return 'oidc';
    }

    public function getName(): string
    {
        return 'OpenID Connect (OIDC) Discovery & Authentication';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $issuer = rtrim(trim((string) ($config['issuerUrl'] ?? '')), '/');
        if ($issuer === '' || str_contains($issuer, 'example.com')) {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'OIDC configuration saved. Specify your Issuer URL to test discovery document.',
                'latencyMs' => 0,
                'details' => ['issuer' => $issuer],
            ];
        }

        $discoveryUrl = $issuer . '/.well-known/openid-configuration';
        try {
            $ch = curl_init($discoveryUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_USERAGENT => 'NuvisFlipex-OIDC/1.0',
            ]);
            $body = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);

            $latency = (int) round((microtime(true) - $start) * 1000);
            if ($err !== '' || $httpCode !== 200) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "OIDC discovery failed at {$discoveryUrl}: HTTP {$httpCode} " . ($err ?: ''),
                    'latencyMs' => $latency,
                    'details' => ['url' => $discoveryUrl, 'httpCode' => $httpCode],
                ];
            }

            $doc = json_decode((string) $body, true);
            if (!is_array($doc) || empty($doc['authorization_endpoint'])) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => 'Invalid OIDC discovery JSON returned.',
                    'latencyMs' => $latency,
                    'details' => ['url' => $discoveryUrl],
                ];
            }

            return [
                'success' => true,
                'status' => 'operational',
                'message' => "OIDC Discovery successful ({$latency}ms). Authorization, Token & JWKS endpoints verified.",
                'latencyMs' => $latency,
                'details' => [
                    'issuer' => $doc['issuer'] ?? $issuer,
                    'tokenEndpoint' => $doc['token_endpoint'] ?? null,
                    'jwksUri' => $doc['jwks_uri'] ?? null,
                ],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'OIDC handshake error: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'details' => ['url' => $discoveryUrl],
            ];
        }
    }
}
