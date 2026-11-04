<?php
declare(strict_types=1);

namespace App\Support;

use Firebase\JWT\JWT as FirebaseJwt;
use Firebase\JWT\Key;

final class Jwt
{
    private const TTL = 900; // 15 minutes

    public static function issue(int $userId, string $role): string
    {
        $now = time();
        return FirebaseJwt::encode(
            ['sub' => $userId, 'role' => $role, 'iat' => $now, 'exp' => $now + self::TTL],
            $_ENV['JWT_SECRET'],
            'HS256'
        );
    }

    public static function issue2fa(int $userId): string
    {
        $now = time();
        return FirebaseJwt::encode(
            ['sub' => $userId, 'type' => '2fa', 'iat' => $now, 'exp' => $now + 600],
            $_ENV['JWT_SECRET'],
            'HS256'
        );
    }

    public static function verify(string $token): ?object
    {
        try {
            return FirebaseJwt::decode($token, new Key($_ENV['JWT_SECRET'], 'HS256'));
        } catch (\Throwable) {
            return null;
        }
    }
}

