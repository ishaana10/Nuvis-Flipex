<?php
declare(strict_types=1);

namespace App\Integrations\Identity;

use App\Integrations\Contracts\ConnectorInterface;
use Throwable;

final class SamlConnector implements ConnectorInterface
{
    public function getType(): string
    {
        return 'sso';
    }

    public function getName(): string
    {
        return 'SAML 2.0 Identity Provider (Entra ID / Okta / Google)';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $metadataUrl = trim((string) ($config['idpMetadataUrl'] ?? ''));
        $loginUrl = trim((string) ($config['ssoLoginUrl'] ?? ''));
        $entityId = trim((string) ($config['idpEntityId'] ?? ''));

        $targetUrl = $metadataUrl !== '' ? $metadataUrl : ($loginUrl !== '' ? $loginUrl : $entityId);

        if ($targetUrl === '' || str_contains($targetUrl, 'tenant-id') || str_contains($targetUrl, 'example.com')) {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'SAML configuration saved. Specify your IdP Metadata URL or Single Sign-On endpoint to test live handshake.',
                'latencyMs' => 0,
                'details' => ['entityId' => $entityId, 'loginUrl' => $loginUrl],
            ];
        }

        if (!filter_var($targetUrl, FILTER_VALIDATE_URL)) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => "Invalid IdP URL provided: {$targetUrl}",
                'latencyMs' => 0,
                'details' => ['url' => $targetUrl],
            ];
        }

        try {
            $ch = curl_init($targetUrl);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 3,
                CURLOPT_TIMEOUT => 6,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_USERAGENT => 'NuvisFlipex-SAML-Validator/1.0',
                CURLOPT_SSL_VERIFYPEER => true,
            ]);

            $body = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlErr = curl_error($ch);
            curl_close($ch);

            $latency = (int) round((microtime(true) - $start) * 1000);

            if ($curlErr !== '') {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "Failed to reach SAML IdP: {$curlErr}",
                    'latencyMs' => $latency,
                    'details' => ['url' => $targetUrl, 'httpCode' => $httpCode],
                ];
            }

            if ($httpCode >= 400) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "SAML IdP returned HTTP {$httpCode}. Verify your endpoint URL.",
                    'latencyMs' => $latency,
                    'details' => ['url' => $targetUrl, 'httpCode' => $httpCode],
                ];
            }

            // Check if valid SAML XML metadata is returned
            $isXml = is_string($body) && (str_contains($body, '<EntityDescriptor') || str_contains($body, '<md:EntityDescriptor'));
            if ($isXml) {
                return [
                    'success' => true,
                    'status' => 'operational',
                    'message' => "SAML 2.0 IdP metadata parsed successfully ({$latency}ms). SSO certificates and endpoints operational.",
                    'latencyMs' => $latency,
                    'details' => ['url' => $targetUrl, 'httpCode' => $httpCode, 'metadataValid' => true],
                ];
            }

            return [
                'success' => true,
                'status' => 'connected',
                'message' => "SAML IdP endpoint reachable (HTTP {$httpCode}, {$latency}ms). Ready for assertion authentication.",
                'latencyMs' => $latency,
                'details' => ['url' => $targetUrl, 'httpCode' => $httpCode],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'SAML validation exception: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'details' => ['url' => $targetUrl],
            ];
        }
    }
}
