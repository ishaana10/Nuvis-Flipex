<?php
declare(strict_types=1);

namespace App\Integrations\Contracts;

/**
 * Universal interface for enterprise connectors.
 * Every connector MUST implement a real testConnection() that validates connectivity
 * rather than returning mock success messages.
 */
interface ConnectorInterface
{
    /** Unique connector type key (e.g. 'sso', 'ldap', 'crm', 'erp', 'cloud_storage', 'smtp') */
    public function getType(): string;

    /** Human-readable provider name */
    public function getName(): string;

    /**
     * Perform a real connection and handshake test against the remote system.
     *
     * Returns:
     * [
     *   'success'   => (bool) Whether the test succeeded,
     *   'status'    => 'configured' | 'connected' | 'operational' | 'error',
     *   'message'   => (string) Descriptive result or actionable error message,
     *   'latencyMs' => (int) Round-trip latency in milliseconds,
     *   'details'   => (array) Safe diagnostic details (no raw secrets),
     * ]
     *
     * Status semantics:
     * - 'configured': Config exists, but required network endpoints or credentials are blank.
     * - 'connected':  Network handshake succeeded (socket connected, TLS verified, metadata fetched).
     * - 'operational': Full authenticated round-trip succeeded (bind, read, or write verified).
     * - 'error':      Connection refused, DNS failure, TLS mismatch, or invalid credentials.
     *
     * @param array $config Connector configuration options from tenant_integrations
     * @param int $tenantId Owning tenant ID for tenant-scoped operations
     * @return array{success: bool, status: string, message: string, latencyMs: int, details: array}
     */
    public function testConnection(array $config, int $tenantId): array;
}
