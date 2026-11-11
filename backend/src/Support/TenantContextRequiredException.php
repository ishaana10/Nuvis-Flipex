<?php
declare(strict_types=1);

namespace App\Support;

use RuntimeException;

/**
 * Raised when a tenant-scoped business operation runs without a resolved tenant.
 * Never silently falls back to a default / first tenant. Surfaces as HTTP 403 via the global error handler.
 */
final class TenantContextRequiredException extends RuntimeException
{
    public function __construct(string $message = 'Tenant context required', int $code = 403)
    {
        parent::__construct($message, $code);
    }
}
