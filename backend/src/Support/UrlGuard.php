<?php
declare(strict_types=1);

namespace App\Support;

/**
 * Outbound URL safety (SSRF guard) for webhooks and any server-side fetch of tenant-supplied URLs.
 *
 * Rules: http(s) only, no credentials in the URL, standard web ports, and every address the host
 * resolves to must be public (no loopback, private, link-local/cloud-metadata or reserved ranges).
 * Set WEBHOOK_ALLOW_PRIVATE=1 in .env to allow private targets on a trusted intranet install.
 */
final class UrlGuard
{
    private const PORTS = [80, 443, 8080, 8443];

    /** @return array{host:string,port:int,ips:string[]}|null  null when the URL is not safe to call */
    public static function check(string $url): ?array
    {
        $url = trim($url);
        if ($url === '' || strlen($url) > 2048 || preg_match('/[\x00-\x20\x7f]/', $url)) {
            return null;
        }
        $p = parse_url($url);
        if (!$p || empty($p['host']) || !in_array(strtolower((string) ($p['scheme'] ?? '')), ['http', 'https'], true)) {
            return null;
        }
        if (isset($p['user']) || isset($p['pass'])) {
            return null;
        }
        $scheme = strtolower((string) $p['scheme']);
        $port = (int) ($p['port'] ?? ($scheme === 'https' ? 443 : 80));
        if (!in_array($port, self::PORTS, true)) {
            return null;
        }

        $host = trim((string) $p['host'], '[]');
        $ips = [];
        if (filter_var($host, FILTER_VALIDATE_IP)) {
            $ips = [$host];
        } else {
            if (!preg_match('/^[A-Za-z0-9.-]+$/', $host) || strcasecmp($host, 'localhost') === 0) {
                return null;
            }
            $v4 = @gethostbynamel($host) ?: [];
            $v6 = [];
            if (function_exists('dns_get_record')) {
                foreach ((@dns_get_record($host, DNS_AAAA) ?: []) as $r) {
                    if (!empty($r['ipv6'])) {
                        $v6[] = $r['ipv6'];
                    }
                }
            }
            $ips = array_merge($v4, $v6);
        }
        if (!$ips) {
            return null; // unresolvable
        }

        $allowPrivate = in_array(strtolower((string) ($_ENV['WEBHOOK_ALLOW_PRIVATE'] ?? getenv('WEBHOOK_ALLOW_PRIVATE') ?: '')), ['1', 'true', 'yes'], true);
        foreach ($ips as $ip) {
            $flags = FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE;
            if (!$allowPrivate && !filter_var($ip, FILTER_VALIDATE_IP, $flags)) {
                return null;
            }
            // IPv4-mapped IPv6 (::ffff:10.0.0.1) and link-local v6
            if (!$allowPrivate && stripos($ip, '::ffff:') === 0 && !filter_var(substr($ip, 7), FILTER_VALIDATE_IP, $flags)) {
                return null;
            }
            if (!$allowPrivate && preg_match('/^(fe80|fc|fd)/i', $ip)) {
                return null;
            }
        }
        return ['host' => $host, 'port' => $port, 'ips' => $ips];
    }
}
