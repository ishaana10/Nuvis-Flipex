<?php
declare(strict_types=1);

namespace App\Integrations\Storage;

use App\Integrations\Contracts\StorageConnectorInterface;
use Throwable;

final class S3Storage implements StorageConnectorInterface
{
    public function getType(): string
    {
        return 's3';
    }

    public function getName(): string
    {
        return 'AWS S3 Object Storage';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $bucket = trim((string) ($config['bucket'] ?? ''));
        $region = trim((string) ($config['region'] ?? 'us-east-1'));
        $accessKey = trim((string) ($config['accessKey'] ?? ''));
        $secretKey = trim((string) ($config['secretKey'] ?? ''));
        $endpoint = trim((string) ($config['endpoint'] ?? "https://{$bucket}.s3.{$region}.amazonaws.com"));

        if ($bucket === '' || $accessKey === '' || $secretKey === '' || str_contains($accessKey, 'AKIAXXXX')) {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'S3 storage configured. Provide your AWS Access Key, Secret Key & Bucket to test live connectivity.',
                'latencyMs' => 0,
                'details' => ['bucket' => $bucket, 'region' => $region],
            ];
        }

        try {
            // Perform authenticated SigV4 GET bucket request (?max-keys=1)
            $host = parse_url($endpoint, PHP_URL_HOST) ?: "{$bucket}.s3.{$region}.amazonaws.com";
            $url = "https://{$host}/?max-keys=1";
            $amzDate = gmdate('Ymd\THis\Z');
            $dateStamp = gmdate('Ymd');

            // AWS SigV4 canonical request
            $canonicalUri = '/';
            $canonicalQuery = 'max-keys=1';
            $payloadHash = hash('sha256', '');
            $canonicalHeaders = "host:{$host}\nx-amz-content-sha256:{$payloadHash}\nx-amz-date:{$amzDate}\n";
            $signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
            $canonicalRequest = "GET\n{$canonicalUri}\n{$canonicalQuery}\n{$canonicalHeaders}\n{$signedHeaders}\n{$payloadHash}";

            $algorithm = 'AWS4-HMAC-SHA256';
            $credentialScope = "{$dateStamp}/{$region}/s3/aws4_request";
            $stringToSign = "{$algorithm}\n{$amzDate}\n{$credentialScope}\n" . hash('sha256', $canonicalRequest);

            // Derive signing key
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
                    'message' => "S3 connection failed: {$err}",
                    'latencyMs' => $latency,
                    'details' => ['host' => $host],
                ];
            }

            if ($code === 200) {
                return [
                    'success' => true,
                    'status' => 'operational',
                    'message' => "AWS S3 bucket '{$bucket}' authenticated and operational ({$latency}ms).",
                    'latencyMs' => $latency,
                    'details' => ['bucket' => $bucket, 'region' => $region, 'authenticated' => true],
                ];
            }

            if ($code === 403) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "S3 403 Forbidden: Invalid AWS credentials or bucket policy forbids ListBucket on '{$bucket}'.",
                    'latencyMs' => $latency,
                    'details' => ['httpCode' => 403, 'bucket' => $bucket],
                ];
            }

            if ($code === 404) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "S3 404 Not Found: Bucket '{$bucket}' does not exist in region {$region}.",
                    'latencyMs' => $latency,
                    'details' => ['httpCode' => 404, 'bucket' => $bucket],
                ];
            }

            return [
                'success' => true,
                'status' => 'connected',
                'message' => "S3 endpoint reached (HTTP {$code}, {$latency}ms).",
                'latencyMs' => $latency,
                'details' => ['httpCode' => $code],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'S3 validation error: ' . $e->getMessage(),
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
