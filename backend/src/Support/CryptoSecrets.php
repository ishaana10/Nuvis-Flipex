<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Centralized Cryptographic Secret Manager & Entropy Validator.
 *
 * Enforces:
 * - Separate secrets for JWT authentication, signed storage URLs, draft preview tokens, and publication unlock tokens.
 * - Strict rejection of weak/predictable defaults or placeholder strings (e.g. 'change-me-to-a-long-random-string', 'nuvis_fallback_secret_key').
 * - Minimum length (>= 32 bytes) and Shannon entropy (>= 3.0 bits/byte) checks.
 * - Zero hardcoded fallback secrets in any environment.
 * - Seamless secret rotation via PREVIOUS_*_SECRET verification support.
 */
final class CryptoSecrets
{
    public const MIN_SECRET_LENGTH = 32;
    public const MIN_ENTROPY_BITS = 3.0;

    private const FORBIDDEN_PATTERNS = [
        'change-me',
        'changeme',
        'change_me',
        'replace_with',
        'replace-with',
        'generate_using',
        'generate-using',
        'nuvis_fallback',
        'fallback_secret',
        'default_secret',
        'your-secret',
        'your_secret',
        'example_secret',
        'secret_key_here',
        'password123',
        '1234567890',
    ];

    /**
     * Check whether a candidate secret meets length, placeholder, and entropy requirements.
     */
    public static function isStrongSecret(?string $secret): bool
    {
        if ($secret === null) {
            return false;
        }
        $trimmed = trim($secret);
        if (strlen($trimmed) < self::MIN_SECRET_LENGTH) {
            return false;
        }

        $lower = strtolower($trimmed);
        foreach (self::FORBIDDEN_PATTERNS as $pattern) {
            if (str_contains($lower, $pattern)) {
                return false;
            }
        }

        if (self::shannonEntropy($trimmed) < self::MIN_ENTROPY_BITS) {
            return false;
        }

        return true;
    }

    /**
     * Calculate Shannon entropy in bits per character.
     */
    public static function shannonEntropy(string $value): float
    {
        $len = strlen($value);
        if ($len === 0) {
            return 0.0;
        }
        $counts = count_chars($value, 1);
        $entropy = 0.0;
        foreach ($counts as $count) {
            $p = $count / $len;
            $entropy -= $p * log($p, 2);
        }
        return $entropy;
    }

    /**
     * Generate a cryptographically random 256-bit (64 hex chars) secret.
     */
    public static function generateSecret(int $bytes = 32): string
    {
        return bin2hex(random_bytes(max(32, $bytes)));
    }

    /**
     * Primary secret for signing and verifying JWT access tokens.
     */
    public static function jwtSecret(): string
    {
        $secret = trim((string) ($_ENV['JWT_SECRET'] ?? ''));
        if (!self::isStrongSecret($secret)) {
            throw new \RuntimeException(
                'CRITICAL SECURITY CONFIGURATION ERROR: JWT_SECRET is missing, too short, or set to a weak placeholder. Run `php bin/install.php` to provision strong cryptographic secrets.',
                500
            );
        }
        return $secret;
    }

    public static function previousJwtSecret(): ?string
    {
        $prev = trim((string) ($_ENV['PREVIOUS_JWT_SECRET'] ?? ''));
        return self::isStrongSecret($prev) ? $prev : null;
    }

    /**
     * Dedicated secret for signing temporary document storage URLs (/api/v1/files/signed).
     * Never falls back to a hardcoded string. Uses STORAGE_SIGNING_SECRET or HKDF-derived subkey from a verified strong JWT_SECRET.
     */
    public static function storageSigningSecret(): string
    {
        $explicit = trim((string) ($_ENV['STORAGE_SIGNING_SECRET'] ?? ''));
        if ($explicit !== '') {
            if (!self::isStrongSecret($explicit)) {
                throw new \RuntimeException('CRITICAL SECURITY CONFIGURATION ERROR: STORAGE_SIGNING_SECRET is weak or invalid.', 500);
            }
            return $explicit;
        }
        return hash_hkdf('sha256', self::jwtSecret(), 32, 'nuvis-flipex:storage-signed-url:v1');
    }

    public static function previousStorageSigningSecret(): ?string
    {
        $prev = trim((string) ($_ENV['PREVIOUS_STORAGE_SIGNING_SECRET'] ?? ''));
        if (self::isStrongSecret($prev)) {
            return $prev;
        }
        $prevJwt = self::previousJwtSecret();
        return $prevJwt ? hash_hkdf('sha256', $prevJwt, 32, 'nuvis-flipex:storage-signed-url:v1') : null;
    }

    /**
     * Dedicated secret for signing unpublished draft preview tokens.
     */
    public static function previewTokenSecret(): string
    {
        $explicit = trim((string) ($_ENV['PREVIEW_TOKEN_SECRET'] ?? ''));
        if ($explicit !== '') {
            if (!self::isStrongSecret($explicit)) {
                throw new \RuntimeException('CRITICAL SECURITY CONFIGURATION ERROR: PREVIEW_TOKEN_SECRET is weak or invalid.', 500);
            }
            return $explicit;
        }
        return hash_hkdf('sha256', self::jwtSecret(), 32, 'nuvis-flipex:draft-preview-token:v1');
    }

    public static function previousPreviewTokenSecret(): ?string
    {
        $prev = trim((string) ($_ENV['PREVIOUS_PREVIEW_TOKEN_SECRET'] ?? ''));
        if (self::isStrongSecret($prev)) {
            return $prev;
        }
        $prevJwt = self::previousJwtSecret();
        return $prevJwt ? hash_hkdf('sha256', $prevJwt, 32, 'nuvis-flipex:draft-preview-token:v1') : null;
    }

    /**
     * Dedicated secret for signing expiring password-protected publication unlock tokens.
     */
    public static function unlockTokenSecret(): string
    {
        $explicit = trim((string) ($_ENV['UNLOCK_TOKEN_SECRET'] ?? ''));
        if ($explicit !== '') {
            if (!self::isStrongSecret($explicit)) {
                throw new \RuntimeException('CRITICAL SECURITY CONFIGURATION ERROR: UNLOCK_TOKEN_SECRET is weak or invalid.', 500);
            }
            return $explicit;
        }
        return hash_hkdf('sha256', self::jwtSecret(), 32, 'nuvis-flipex:publication-unlock-token:v1');
    }

    public static function previousUnlockTokenSecret(): ?string
    {
        $prev = trim((string) ($_ENV['PREVIOUS_UNLOCK_TOKEN_SECRET'] ?? ''));
        if (self::isStrongSecret($prev)) {
            return $prev;
        }
        $prevJwt = self::previousJwtSecret();
        return $prevJwt ? hash_hkdf('sha256', $prevJwt, 32, 'nuvis-flipex:publication-unlock-token:v1') : null;
    }

    /**
     * Ensure all four separated secrets exist and are cryptographically strong in the given .env file content.
     * Returns [$updatedEnvContent, $generatedKeysList].
     */
    public static function ensureEnvSecrets(string $envContent, bool $forceRotate = false): array
    {
        $secretKeys = [
            'JWT_SECRET',
            'STORAGE_SIGNING_SECRET',
            'PREVIEW_TOKEN_SECRET',
            'UNLOCK_TOKEN_SECRET',
        ];

        $generated = [];
        foreach ($secretKeys as $key) {
            $currentVal = '';
            if (preg_match('/^' . preg_quote($key, '/') . '=(.*)$/m', $envContent, $m)) {
                $currentVal = trim($m[1], " \t\n\r\0\x0B\"'");
            }

            if ($forceRotate && self::isStrongSecret($currentVal)) {
                $prevKey = 'PREVIOUS_' . $key;
                if (preg_match('/^' . preg_quote($prevKey, '/') . '=.*$/m', $envContent)) {
                    $envContent = (string) preg_replace(
                        '/^' . preg_quote($prevKey, '/') . '=.*$/m',
                        $prevKey . '=' . $currentVal,
                        $envContent
                    );
                } else {
                    $envContent = rtrim($envContent) . "\n{$prevKey}={$currentVal}\n";
                }
            }

            if ($forceRotate || !self::isStrongSecret($currentVal)) {
                $newSecret = self::generateSecret(32);
                if (preg_match('/^' . preg_quote($key, '/') . '=.*$/m', $envContent)) {
                    $envContent = (string) preg_replace(
                        '/^' . preg_quote($key, '/') . '=.*$/m',
                        $key . '=' . $newSecret,
                        $envContent
                    );
                } else {
                    $envContent = rtrim($envContent) . "\n{$key}={$newSecret}\n";
                }
                $_ENV[$key] = $newSecret;
                $generated[] = $key;
            }
        }

        return [$envContent, $generated];
    }
}
