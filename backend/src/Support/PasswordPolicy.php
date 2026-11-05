<?php
declare(strict_types=1);

namespace App\Support;

final class PasswordPolicy
{
    private const COMMON_WEAK_PATTERNS = [
        'password',
        '12345678',
        'qwertyui',
        'admin123',
        'welcome1',
        'letmein1',
        'changeme',
        'flipbook',
        'nuvis123',
        'iloveyou',
    ];

    /**
     * Load the active developer-configured password security policy from system_settings.
     */
    public static function getPolicy(): array
    {
        $map = [];
        try {
            $rows = Db::all("SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'pw_%'");
            foreach ($rows as $r) {
                $map[$r['setting_key']] = $r['setting_value'];
            }
        } catch (\Throwable $e) {
            // Fallback to defaults if table not yet initialized
        }

        $minLength = isset($map['pw_min_length']) ? max(8, min(64, (int) $map['pw_min_length'])) : 8;

        return [
            'minLength' => $minLength,
            'requireUppercase' => ($map['pw_require_uppercase'] ?? '1') === '1',
            'requireLowercase' => ($map['pw_require_lowercase'] ?? '1') === '1',
            'requireNumber' => ($map['pw_require_number'] ?? '1') === '1',
            'requireSpecial' => ($map['pw_require_special'] ?? '1') === '1',
            'disallowUserInfo' => ($map['pw_disallow_user_info'] ?? '1') === '1',
            'disallowCommon' => ($map['pw_disallow_common'] ?? '1') === '1',
            'disallowReuse' => ($map['pw_disallow_reuse'] ?? '1') === '1',
            'hashAlgorithm' => 'Argon2id (Memory-Hard KDF)',
        ];
    }

    /**
     * Validate a candidate password against the developer-configured security policy.
     *
     * @return string|null Null if valid, or descriptive human-readable error message if invalid.
     */
    public static function validate(
        string $password,
        string $userEmail = '',
        string $userName = '',
        ?string $currentPassword = null
    ): ?string {
        $policy = self::getPolicy();
        $errors = [];

        if (mb_strlen($password) < $policy['minLength']) {
            $errors[] = sprintf('at least %d characters', $policy['minLength']);
        }

        if ($policy['requireUppercase'] && !preg_match('/[A-Z]/', $password)) {
            $errors[] = 'an uppercase letter (A-Z)';
        }

        if ($policy['requireLowercase'] && !preg_match('/[a-z]/', $password)) {
            $errors[] = 'a lowercase letter (a-z)';
        }

        if ($policy['requireNumber'] && !preg_match('/[0-9]/', $password)) {
            $errors[] = 'a number (0-9)';
        }

        if ($policy['requireSpecial'] && !preg_match('/[^a-zA-Z0-9]/', $password)) {
            $errors[] = 'a special character (!@#$%^&*)';
        }

        if (!empty($errors)) {
            return 'Password must contain ' . implode(', ', $errors) . '.';
        }

        if ($policy['disallowReuse'] && $currentPassword !== null && $currentPassword !== '' && hash_equals($currentPassword, $password)) {
            return 'New password must be different from your current password.';
        }

        if ($policy['disallowUserInfo']) {
            $lowerPw = strtolower($password);
            if ($userEmail !== '') {
                $localPart = strtolower((string) strtok($userEmail, '@'));
                if (strlen($localPart) >= 3 && str_contains($lowerPw, $localPart)) {
                    return 'Password cannot contain your email username.';
                }
            }
            if ($userName !== '') {
                $parts = preg_split('/\s+/', strtolower(trim($userName))) ?: [];
                foreach ($parts as $part) {
                    if (strlen($part) >= 3 && str_contains($lowerPw, $part)) {
                        return 'Password cannot contain parts of your name.';
                    }
                }
            }
        }

        if ($policy['disallowCommon']) {
            $lowerPw = strtolower($password);
            foreach (self::COMMON_WEAK_PATTERNS as $weak) {
                if (str_contains($lowerPw, $weak)) {
                    return 'Password contains a commonly compromised pattern. Please choose a more unique password.';
                }
            }
        }

        return null;
    }
}
