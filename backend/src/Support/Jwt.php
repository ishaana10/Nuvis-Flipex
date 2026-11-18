<?php
declare(strict_types=1);

namespace App\Support;

use Firebase\JWT\JWT as FirebaseJwt;
use Firebase\JWT\Key;

final class Jwt
{
    public static function getTtl(): int
    {
        return SessionSecurity::getConfig()['jwtTtlSeconds'];
    }

    public static function issue(int $userId, string $role): string
    {
        $now = time();
        $ttl = self::getTtl();
        return FirebaseJwt::encode(
            ['sub' => $userId, 'role' => $role, 'iat' => $now, 'exp' => $now + $ttl],
            CryptoSecrets::jwtSecret(),
            'HS256'
        );
    }

    public static function issue2fa(int $userId): string
    {
        $now = time();
        return FirebaseJwt::encode(
            ['sub' => $userId, 'type' => '2fa', 'iat' => $now, 'exp' => $now + 600],
            CryptoSecrets::jwtSecret(),
            'HS256'
        );
    }

    public static function verify(string $token): ?object
    {
        try {
            return FirebaseJwt::decode($token, new Key(CryptoSecrets::jwtSecret(), 'HS256'));
        } catch (\Throwable) {
            $prev = CryptoSecrets::previousJwtSecret();
            if ($prev !== null) {
                try {
                    return FirebaseJwt::decode($token, new Key($prev, 'HS256'));
                } catch (\Throwable) {
                    return null;
                }
            }
            return null;
        }
    }
}
