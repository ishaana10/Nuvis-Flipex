<?php
declare(strict_types=1);

namespace App\Integrations\Webhooks;

final class WebhookSigner
{
    public const TOLERANCE_SECONDS = 300;

    /**
     * Compute HMAC-SHA256 signature formatted as: t={timestamp},v1={hash}
     */
    public static function sign(string $payloadJson, string $secret, ?int $timestamp = null): string
    {
        $timestamp ??= time();
        $signedPayload = "{$timestamp}.{$payloadJson}";
        $hash = hash_hmac('sha256', $signedPayload, $secret);
        return "t={$timestamp},v1={$hash}";
    }

    /**
     * Verify a received signature header against a payload and secret.
     */
    public static function verify(string $payloadJson, string $sigHeader, string $secret, int $tolerance = self::TOLERANCE_SECONDS): bool
    {
        $parts = [];
        foreach (explode(',', $sigHeader) as $item) {
            $kv = explode('=', trim($item), 2);
            if (count($kv) === 2) {
                $parts[$kv[0]] = $kv[1];
            }
        }

        if (empty($parts['t']) || empty($parts['v1'])) {
            return false;
        }

        $timestamp = (int) $parts['t'];
        if (abs(time() - $timestamp) > $tolerance) {
            return false; // Signature expired or future clock skew
        }

        $expected = hash_hmac('sha256', "{$timestamp}.{$payloadJson}", $secret);
        return hash_equals($expected, $parts['v1']);
    }
}
