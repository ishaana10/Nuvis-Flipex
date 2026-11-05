<?php
declare(strict_types=1);

namespace App\Modules\Authentication;

use App\Controllers\AuthController;
use App\Middleware\Auth;
use App\Shared\ModuleContract;
use App\Support\Jwt;
use App\Support\PasswordPolicy;
use App\Support\Totp;

final class AuthenticationModule implements ModuleContract
{
    public static function name(): string { return 'Authentication'; }
    public static function layer(): string { return 'PHP Slim REST API & Security'; }
    public static function description(): string { return 'Argon2id authentication, JWT access tokens, rotating refresh tokens with replay detection, RFC 6238 TOTP 2FA, and SHA-256 API Key verification.'; }
    public static function dependencies(): array { return ['Users', 'Tenants', 'Audit', 'Infrastructure\\Database', 'Infrastructure\\Mail']; }
    public static function capabilities(): array
    {
        return [
            'controller' => AuthController::class,
            'middleware' => Auth::class,
            'services' => [Jwt::class, Totp::class, PasswordPolicy::class],
            'features' => ['Argon2id Hashing', 'Refresh Token Family Replay Detection', 'RFC 6238 TOTP Authenticator', 'Email 2FA OTP', 'SHA-256 API Key Auth'],
        ];
    }
}
