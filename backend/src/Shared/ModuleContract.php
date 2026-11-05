<?php
declare(strict_types=1);

namespace App\Shared;

interface ModuleContract
{
    public static function name(): string;
    public static function layer(): string;
    public static function description(): string;
    public static function dependencies(): array;
    public static function capabilities(): array;
}
