<?php
declare(strict_types=1);

namespace App\Support;

/**
 * RFC 6238 Time-Based One-Time Password (TOTP) Implementation.
 * Compatible with Google Authenticator, Microsoft Authenticator, Authy, and 1Password.
 */
final class Totp
{
    private const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    /** Generate a random 160-bit (20 byte) Base32-encoded TOTP Secret Key */
    public static function generateSecret(int $length = 32): string
    {
        $bytes = random_bytes((int) ceil($length * 5 / 8));
        return substr(self::base32Encode($bytes), 0, $length);
    }

    /** Generate standard otpauth:// URI for QR code generation */
    public static function getOtpAuthUri(string $email, string $secret, string $issuer = 'Nuvis Flipex'): string
    {
        $label = rawurlencode($issuer) . ':' . rawurlencode($email);
        $params = http_build_query([
            'secret' => $secret,
            'issuer' => $issuer,
            'algorithm' => 'SHA1',
            'digits' => 6,
            'period' => 30,
        ]);
        return "otpauth://totp/{$label}?{$params}";
    }

    /** Calculate TOTP code for a given timestamp (default: current time) */
    public static function calculate(string $secret, ?int $timestamp = null, int $digits = 6, int $period = 30): string
    {
        $timestamp ??= time();
        $counter = (int) floor($timestamp / $period);

        $secretBytes = self::base32Decode($secret);
        // Pack counter into 8-byte big-endian binary string
        $binaryCounter = pack('N*', 0) . pack('N*', $counter);

        $hash = hash_hmac('sha1', $binaryCounter, $secretBytes, true);
        $offset = ord(substr($hash, -1)) & 0x0F;

        $unpacked = unpack('N', substr($hash, $offset, 4));
        $value = ($unpacked[1] & 0x7FFFFFFF) % (10 ** $digits);

        return str_pad((string) $value, $digits, '0', STR_PAD_LEFT);
    }

    /** Verify a 6-digit code allowing a time drift window of +/- 1 time-step (30 seconds) */
    public static function verify(string $code, string $secret, int $window = 1, ?int $timestamp = null): bool
    {
        $code = trim($code);
        if (strlen($code) !== 6 || !ctype_digit($code)) {
            return false;
        }

        $timestamp ??= time();
        for ($i = -$window; $i <= $window; $i++) {
            $expected = self::calculate($secret, $timestamp + ($i * 30));
            if (hash_equals($expected, $code)) {
                return true;
            }
        }

        return false;
    }

    /** Base32 encoding */
    public static function base32Encode(string $data): string
    {
        if (empty($data)) return '';
        $binary = '';
        foreach (str_split($data) as $c) {
            $binary .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
        }
        $chunks = str_split($binary, 5);
        $out = '';
        foreach ($chunks as $chunk) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            $out .= self::BASE32_ALPHABET[bindec($chunk)];
        }
        return $out;
    }

    /** Base32 decoding */
    public static function base32Decode(string $base32): string
    {
        $base32 = strtoupper(trim($base32));
        $base32 = preg_replace('/[^A-Z2-7]/', '', $base32) ?? '';
        if (empty($base32)) return '';

        $binary = '';
        for ($i = 0, $len = strlen($base32); $i < $len; $i++) {
            $pos = strpos(self::BASE32_ALPHABET, $base32[$i]);
            if ($pos === false) continue;
            $binary .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
        }

        $chunks = str_split($binary, 8);
        $out = '';
        foreach ($chunks as $chunk) {
            if (strlen($chunk) === 8) {
                $out .= chr(bindec($chunk));
            }
        }
        return $out;
    }
}
