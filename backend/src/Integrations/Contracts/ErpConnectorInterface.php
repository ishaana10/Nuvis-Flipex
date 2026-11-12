<?php
declare(strict_types=1);

namespace App\Integrations\Contracts;

interface ErpConnectorInterface extends ConnectorInterface
{
    /**
     * Fetch products or verify SKU availability from the ERP system.
     * @param array $config
     * @param array{skus?: string[], limit?: int} $filter
     * @return array<string, array{sku: string, name: string, price: string|float, currency?: string, stock?: int}>
     */
    public function fetchProducts(array $config, array $filter = []): array;
}
