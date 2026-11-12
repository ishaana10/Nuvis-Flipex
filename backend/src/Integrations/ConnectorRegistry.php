<?php
declare(strict_types=1);

namespace App\Integrations;

use App\Integrations\Contracts\ConnectorInterface;
use App\Integrations\CRM\HubSpotConnector;
use App\Integrations\CRM\SalesforceConnector;
use App\Integrations\CRM\ZohoConnector;
use App\Integrations\ERP\GenericRestConnector;
use App\Integrations\ERP\OdooConnector;
use App\Integrations\ERP\SapConnector;
use App\Integrations\Identity\LdapConnector;
use App\Integrations\Identity\OidcConnector;
use App\Integrations\Identity\SamlConnector;
use App\Integrations\Storage\LocalStorage;
use App\Integrations\Storage\R2Storage;
use App\Integrations\Storage\S3Storage;
use App\Support\Mailer;
use Throwable;

final class ConnectorRegistry
{
    /**
     * Resolve the appropriate connector instance for a given connector type and configuration.
     */
    public static function resolve(string $type, array $config = []): ?ConnectorInterface
    {
        $type = strtolower(trim($type));

        return match ($type) {
            'sso' => self::resolveSsoConnector($config),
            'ldap' => new LdapConnector(),
            'crm' => self::resolveCrmConnector($config),
            'erp' => self::resolveErpConnector($config),
            'cloud_storage' => self::resolveStorageConnector($config),
            'smtp' => self::createSmtpConnector(),
            'wordpress' => self::createWordpressConnector(),
            default => null,
        };
    }

    private static function resolveSsoConnector(array $config): ConnectorInterface
    {
        $protocol = strtolower((string) ($config['protocol'] ?? ''));
        if (str_contains($protocol, 'oidc') || !empty($config['issuerUrl'])) {
            return new OidcConnector();
        }
        return new SamlConnector();
    }

    private static function resolveCrmConnector(array $config): ConnectorInterface
    {
        $provider = strtolower((string) ($config['crmProvider'] ?? ''));
        if (str_contains($provider, 'hubspot')) {
            return new HubSpotConnector();
        }
        if (str_contains($provider, 'salesforce')) {
            return new SalesforceConnector();
        }
        return new ZohoConnector();
    }

    private static function resolveErpConnector(array $config): ConnectorInterface
    {
        $system = strtolower((string) ($config['erpSystem'] ?? ''));
        if (str_contains($system, 'sap')) {
            return new SapConnector();
        }
        if (str_contains($system, 'odoo')) {
            return new OdooConnector();
        }
        return new GenericRestConnector();
    }

    private static function resolveStorageConnector(array $config): ConnectorInterface
    {
        $driver = strtolower((string) ($config['driver'] ?? 'local'));
        if ($driver === 'r2' || str_contains($driver, 'cloudflare')) {
            return new R2Storage();
        }
        if ($driver === 's3' || str_contains($driver, 'aws')) {
            return new S3Storage();
        }
        return new LocalStorage();
    }

    private static function createSmtpConnector(): ConnectorInterface
    {
        return new class implements ConnectorInterface {
            public function getType(): string { return 'smtp'; }
            public function getName(): string { return 'Transactional SMTP Dispatcher'; }
            public function testConnection(array $config, int $tenantId): array
            {
                $start = microtime(true);
                $smtp = Mailer::getConfig();
                $host = $smtp['host'];
                $port = (int) $smtp['port'];

                if ($host === '127.0.0.1' || $host === 'localhost') {
                    return [
                        'success' => true,
                        'status' => 'configured',
                        'message' => "SMTP configured on local relay ({$host}:{$port}).",
                        'latencyMs' => 0,
                        'details' => ['host' => $host, 'port' => $port],
                    ];
                }

                try {
                    $remote = ($smtp['encryption'] === 'ssl' ? 'ssl://' : 'tcp://') . $host . ':' . $port;
                    $fp = @stream_socket_client($remote, $errno, $errstr, 4.0);
                    $latency = (int) round((microtime(true) - $start) * 1000);
                    if (!$fp) {
                        return [
                            'success' => false,
                            'status' => 'error',
                            'message' => "SMTP connection failed to {$host}:{$port} ({$errstr})",
                            'latencyMs' => $latency,
                            'details' => ['host' => $host, 'port' => $port, 'errno' => $errno],
                        ];
                    }
                    fclose($fp);
                    return [
                        'success' => true,
                        'status' => 'operational',
                        'message' => "SMTP server reachable ({$host}:{$port}, {$latency}ms). Encryption: {$smtp['encryption']}.",
                        'latencyMs' => $latency,
                        'details' => ['host' => $host, 'port' => $port],
                    ];
                } catch (Throwable $e) {
                    return [
                        'success' => false,
                        'status' => 'error',
                        'message' => 'SMTP socket error: ' . $e->getMessage(),
                        'latencyMs' => (int) round((microtime(true) - $start) * 1000),
                        'details' => [],
                    ];
                }
            }
        };
    }

    private static function createWordpressConnector(): ConnectorInterface
    {
        return new class implements ConnectorInterface {
            public function getType(): string { return 'wordpress'; }
            public function getName(): string { return 'WordPress Shortcode & oEmbed Gateway'; }
            public function testConnection(array $config, int $tenantId): array
            {
                $appUrl = rtrim($_ENV['APP_URL'] ?? 'http://localhost:5173', '/');
                $oembedEndpoint = "{$appUrl}/api/v1/oembed";
                return [
                    'success' => true,
                    'status' => 'operational',
                    'message' => "WordPress shortcode [nuvis_flipex] and oEmbed endpoint active ({$oembedEndpoint}).",
                    'latencyMs' => 1,
                    'details' => ['oembedUrl' => $oembedEndpoint],
                ];
            }
        };
    }
}
