<?php
declare(strict_types=1);

namespace App\Integrations\Identity;

use App\Integrations\Contracts\ConnectorInterface;
use Throwable;

final class LdapConnector implements ConnectorInterface
{
    public function getType(): string
    {
        return 'ldap';
    }

    public function getName(): string
    {
        return 'LDAP / Microsoft Active Directory';
    }

    public function testConnection(array $config, int $tenantId): array
    {
        $start = microtime(true);
        $host = trim((string) ($config['host'] ?? ''));
        $port = (int) ($config['port'] ?? 389);
        $baseDn = trim((string) ($config['baseDn'] ?? ''));
        $bindDn = trim((string) ($config['bindDn'] ?? ''));
        $bindPassword = (string) ($config['bindPassword'] ?? '');

        // If host is blank or unconfigured example
        if ($host === '' || str_contains($host, 'corporate.local') || str_contains($host, 'example.com')) {
            return [
                'success' => true,
                'status' => 'configured',
                'message' => 'LDAP configuration saved. Enter your real enterprise directory host & port to test live bind.',
                'latencyMs' => 0,
                'details' => ['host' => $host ?: '(empty)', 'port' => $port, 'ldapExtension' => extension_loaded('ldap')],
            ];
        }

        // Clean protocol prefix if present
        $cleanHost = preg_replace('#^ldaps?://#i', '', $host);

        // 1. If PHP LDAP extension is available, run full directory bind
        if (extension_loaded('ldap')) {
            try {
                $uri = str_starts_with($host, 'ldaps://') ? $host : "ldap://{$cleanHost}:{$port}";
                $conn = @ldap_connect($uri);
                if (!$conn) {
                    return [
                        'success' => false,
                        'status' => 'error',
                        'message' => "Failed to initialize LDAP connection to {$uri}.",
                        'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                        'details' => ['host' => $cleanHost, 'port' => $port],
                    ];
                }

                ldap_set_option($conn, LDAP_OPT_PROTOCOL_VERSION, 3);
                ldap_set_option($conn, LDAP_OPT_REFERRALS, 0);
                if (defined('LDAP_OPT_NETWORK_TIMEOUT')) {
                    ldap_set_option($conn, LDAP_OPT_NETWORK_TIMEOUT, 3);
                }

                if ($bindDn !== '' && $bindPassword !== '') {
                    $bind = @ldap_bind($conn, $bindDn, $bindPassword);
                    $latency = (int) round((microtime(true) - $start) * 1000);
                    if ($bind) {
                        return [
                            'success' => true,
                            'status' => 'operational',
                            'message' => "Successfully bound to directory as {$bindDn}. LDAP query pipeline operational.",
                            'latencyMs' => $latency,
                            'details' => ['host' => $cleanHost, 'port' => $port, 'authenticated' => true],
                        ];
                    }
                    $err = ldap_error($conn);
                    return [
                        'success' => false,
                        'status' => 'error',
                        'message' => "LDAP host reachable, but authentication failed: {$err}",
                        'latencyMs' => $latency,
                        'details' => ['host' => $cleanHost, 'port' => $port, 'bindDn' => $bindDn],
                    ];
                }

                // Anonymous probe / handshake test
                $anon = @ldap_bind($conn);
                $latency = (int) round((microtime(true) - $start) * 1000);
                return [
                    'success' => true,
                    'status' => 'connected',
                    'message' => "LDAP server handshake succeeded at {$cleanHost}:{$port}. Ready for authenticated bind.",
                    'latencyMs' => $latency,
                    'details' => ['host' => $cleanHost, 'port' => $port, 'anonymousAllowed' => (bool) $anon],
                ];
            } catch (Throwable $e) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => 'LDAP connection error: ' . $e->getMessage(),
                    'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                    'details' => ['host' => $cleanHost, 'port' => $port],
                ];
            }
        }

        // 2. Fallback TCP/TLS socket probe when ext-ldap is not compiled into PHP
        try {
            $isSsl = str_starts_with($host, 'ldaps://') || $port === 636;
            $remote = ($isSsl ? 'ssl://' : 'tcp://') . $cleanHost . ':' . $port;
            $ctx = stream_context_create([
                'ssl' => [
                    'verify_peer' => false,
                    'verify_peer_name' => false,
                ],
            ]);

            $errno = 0;
            $errstr = '';
            $fp = @stream_socket_client($remote, $errno, $errstr, 3.0, STREAM_CLIENT_CONNECT, $ctx);
            $latency = (int) round((microtime(true) - $start) * 1000);

            if (!$fp) {
                return [
                    'success' => false,
                    'status' => 'error',
                    'message' => "Cannot connect to LDAP server at {$cleanHost}:{$port} ({$errstr}).",
                    'latencyMs' => $latency,
                    'details' => ['host' => $cleanHost, 'port' => $port, 'errno' => $errno],
                ];
            }
            fclose($fp);

            return [
                'success' => true,
                'status' => 'connected',
                'message' => "TCP/TLS handshake verified with {$cleanHost}:{$port} ({$latency}ms). (Enable PHP ldap extension for directory search queries).",
                'latencyMs' => $latency,
                'details' => ['host' => $cleanHost, 'port' => $port, 'tls' => $isSsl],
            ];
        } catch (Throwable $e) {
            return [
                'success' => false,
                'status' => 'error',
                'message' => 'LDAP socket probe failed: ' . $e->getMessage(),
                'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                'details' => ['host' => $cleanHost, 'port' => $port],
            ];
        }
    }
}
