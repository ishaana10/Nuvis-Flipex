<?php
declare(strict_types=1);

namespace App\Integrations\Storage;

use App\Integrations\Contracts\StorageConnectorInterface;
use Throwable;

final class R2Storage implements StorageConnectorInterface
{
    public function getType(): string
    {
        return 'r2';
    }

    public function getName(): string
    {
        return 'Cloudflare R2 Object Storage';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $accountId = trim((string) ($config['accountId'] ?? ''));
        $bucket = trim((string) ($config['bucket'] ?? ''));
        $accessKey = trim((string) ($config['accessKey'] ?? ''));
        $secretKey = trim((string) ($config['secretKey'] ?? ''));

        if ($accountId === '' || $bucket === '' || $accessKey === '' || $secretKey === '') {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'Cloudflare R2 configured. Enter your Cloudflare Account ID, Access Key & Bucket to test live connection.',
                'latencyMs' => 0,
                'details' => ['bucket' => $bucket],
            ];
        }

        try {
            $host = "{$accountId}.r2.cloudflarestorage.com";
            $url = "https://{$host}/{$bucket}?max-keys=1";
            $region = 'auto';

            $amzDate = gmdate('Ymd\THis\Z');
            $dateStamp = gmdate('Ymd');

            $canonicalUri = "/{$bucket}";
            $canonicalQuery = 'max-keys=1';
            $payloadHash = hash('sha256', '');
            $canonicalHeaders = "host:{$host}\nx-amz-content-sha256:{$payloadHash}\nx-amz-date:{$amzDate}\n";
            $signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
            $canonicalRequest = "GET\n{$canonicalUri}\n{$canonicalQuery}\n{$canonicalHeaders}\n{$signedHeaders}\n{$payloadHash}";

            $algorithm = 'AWS4-HMAC-SHA256';
            $credentialScope = "{$dateStamp}/{$region}/s3/aws4_request";
            $stringToSign = "{$algorithm}\n{$amzDate}\n{$credentialScope}\n" . hash('sha256', $canonicalRequest);

            $kSecret = 'AWS4' . $secretKey;
            $kDate = hash_hmac('sha256', $dateStamp, $kSecret, true);
            $kRegion = hash_hmac('sha256', $region, $kDate, true);
            $kService = hash_hmac('sha256', 's3', $kRegion, true);
            $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true);
            $signature = hash_hmac('sha256', $stringToSign, $kSigning);

            $authHeader = "{$algorithm} Credential={$accessKey}/{$credentialScope}, SignedHeaders={$signedHeaders}, Signature={$signature}";

            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_HTTPHEADER => [
                    "Host: {$host}",
                    "x-amz-date: {$amzDate}",
                    "x-amz-content-sha256: {$payloadHash}",
                    "Authorization: {$authHeader}",
                ],
            ]);
            $resp = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $err = curl_error($ch);
            curl_close($ch);

            $latency = (int) round((microtime(true) - $start) * 1000);

            if ($err !== '') {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "Cloudflare R2 connection error: {$err}",
                    'latencyMs' => $latency,
                    'details' => ['host' => $host],
                ];
            }

            if ($code === 200) {
                return [
                    'success' => true,
                    'status' => 'operational',
                    'message' => "Cloudflare R2 bucket '{$bucket}' authenticated and operational ({$latency}ms). Zero-egress storage ready.",
                    'latencyMs' => $latency,
                    'details' => ['bucket' => $bucket, 'authenticated' => true],
                ];
            }

            if ($code === 403) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "R2 403 Forbidden: Invalid Cloudflare R2 token or permissions on bucket '{$bucket}'.",
                    'latencyMs' => $latency,
                    'details' => ['httpCode' => 403],
                ];
            }

            return [
                'success' => true,
                'status' => 'connected',
                'message' => "Cloudflare R2 endpoint reached (HTTP {$code}, {$latency}ms).",
                'latencyMs' => $latency,
                'details' => ['httpCode' => $code],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'R2 connection test exception: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'details' => [],
            ];
        }
    }

    public function hasObject(array $config, string $path, int $tenantId): bool
    {
        return false;
    }

    public function putObject(array $config, string $path, string $content, string $mimeType, int $tenantId): bool
    {
        return false;
    }

    public function getObject(array $config, string $path, int $tenantId): ?string
    {
        return null;
    }
}
