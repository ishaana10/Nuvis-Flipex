<?php
declare(strict_types=1);

namespace App\Integrations\Contracts;

interface StorageConnectorInterface extends ConnectorInterface
{
    /** Check if an object exists in storage */
    public function hasObject(array $config, string $path, int $tenantId): bool;

    /** Put an object into storage */
    public function putObject(array $config, string $path, string $content, string $mimeType, int $tenantId): bool;

    /** Get an object's contents */
    public function getObject(array $config, string $path, int $tenantId): ?string;
}
