<?php
declare(strict_types=1);

namespace App\Support;

use Throwable;

/**
 * Flipex Custom Domain Verification & Routing Service.
 *
 * Allows publishers to connect custom branded domains (e.g. catalogues.subrails.com)
 * pointing to their Flipex storefront and publications via DNS CNAME & TXT verification.
 */
final class CustomDomainService
{
    public const PLATFORM_CNAME_TARGET = 'flipex.ict-fj.com';

    /**
     * Clean and normalize domain name.
     */
    public static function normalizeDomain(string $input): string
    {
        $d = strtolower(trim($input));
        $d = preg_replace('#^https?://#i', '', $d) ?? '';
        $d = preg_replace('#/.*$#', '', $d) ?? '';
        $d = preg_replace('#:[0-9]+$#', '', $d) ?? '';
        return trim($d, '.');
    }

    /**
     * Generate deterministic verification token for a tenant.
     */
    public static function getVerificationToken(int $tenantId): string
    {
        try {
            $tenant = Db::one('SELECT custom_domain_txt FROM tenants WHERE id = ?', [$tenantId]);
            if (!empty($tenant['custom_domain_txt'])) {
                return (string) $tenant['custom_domain_txt'];
            }
        } catch (Throwable) {
        }
        $token = 'flipex-verify=' . substr(hash('sha256', "tenant-domain-salt-{$tenantId}"), 0, 24);
        try {
            Db::run('UPDATE tenants SET custom_domain_txt = ? WHERE id = ?', [$token, $tenantId]);
        } catch (Throwable) {
        }
        return $token;
    }

    /**
     * Verify DNS records (TXT and/or CNAME) for a custom domain.
     *
     * @return array{
     *   verified: bool,
     *   domain: string,
     *   cnameMatched: bool,
     *   txtMatched: bool,
     *   expectedCname: string,
     *   expectedTxtHost: string,
     *   expectedTxtValue: string,
     *   actualCname?: string,
     *   actualTxt?: string[],
     *   reason: string
     * }
     */
    public static function verifyDns(int $tenantId, string $rawDomain): array
    {
        PublisherIdentity::ensureSchema();
        $domain = self::normalizeDomain($rawDomain);

        if ($domain === '' || !str_contains($domain, '.')) {
            return [
                'verified' => false,
                'domain' => $domain,
                'cnameMatched' => false,
                'txtMatched' => false,
                'expectedCname' => self::PLATFORM_CNAME_TARGET,
                'expectedTxtHost' => "_flipex-verify.{$domain}",
                'expectedTxtValue' => '',
                'reason' => 'Invalid domain format. Please enter a valid fully-qualified domain name (e.g. catalogues.yourcompany.com).',
            ];
        }

        // Prevent platform hostname collision
        if ($domain === self::PLATFORM_CNAME_TARGET || str_ends_with($domain, '.ict-fj.com')) {
            return [
                'verified' => false,
                'domain' => $domain,
                'cnameMatched' => false,
                'txtMatched' => false,
                'expectedCname' => self::PLATFORM_CNAME_TARGET,
                'expectedTxtHost' => "_flipex-verify.{$domain}",
                'expectedTxtValue' => '',
                'reason' => 'The target domain cannot be a Flipex internal domain.',
            ];
        }

        $expectedTxtValue = self::getVerificationToken($tenantId);
        $expectedTxtHost = "_flipex-verify.{$domain}";

        $cnameMatched = false;
        $txtMatched = false;
        $actualCname = '';
        $actualTxt = [];

        // 1. Check CNAME record
        if (function_exists('dns_get_record')) {
            try {
                $cnameRecords = @dns_get_record($domain, DNS_CNAME);
                if (is_array($cnameRecords)) {
                    foreach ($cnameRecords as $rec) {
                        $target = strtolower(rtrim((string) ($rec['target'] ?? ''), '.'));
                        if ($target !== '') {
                            $actualCname = $target;
                            if ($target === self::PLATFORM_CNAME_TARGET) {
                                $cnameMatched = true;
                                break;
                            }
                        }
                    }
                }
            } catch (Throwable) {
            }

            // 2. Check TXT record on _flipex-verify.<domain> or apex <domain>
            try {
                $txtRecords = @dns_get_record($expectedTxtHost, DNS_TXT);
                if (!is_array($txtRecords) || empty($txtRecords)) {
                    $txtRecords = @dns_get_record($domain, DNS_TXT);
                }
                if (is_array($txtRecords)) {
                    foreach ($txtRecords as $rec) {
                        $txtVal = trim((string) ($rec['txt'] ?? ($rec['entries'][0] ?? '')));
                        if ($txtVal !== '') {
                            $actualTxt[] = $txtVal;
                            if (str_contains($txtVal, $expectedTxtValue) || $txtVal === $expectedTxtValue) {
                                $txtMatched = true;
                                break;
                            }
                        }
                    }
                }
            } catch (Throwable) {
            }
        }

        $isVerified = $cnameMatched || $txtMatched;

        // Persist verification status
        try {
            Db::run(
                'UPDATE tenants SET custom_domain = ?, custom_domain_verified = ?, updated_at = NOW() WHERE id = ?',
                [$domain, $isVerified ? 1 : 0, $tenantId]
            );
        } catch (Throwable) {
        }

        $reason = $isVerified
            ? 'Custom domain DNS verified successfully!'
            : 'DNS records not yet propagated or incorrect. Please ensure your CNAME points to ' . self::PLATFORM_CNAME_TARGET . ' or add the TXT record to ' . $expectedTxtHost;

        return [
            'verified' => $isVerified,
            'domain' => $domain,
            'cnameMatched' => $cnameMatched,
            'txtMatched' => $txtMatched,
            'expectedCname' => self::PLATFORM_CNAME_TARGET,
            'expectedTxtHost' => $expectedTxtHost,
            'expectedTxtValue' => $expectedTxtValue,
            'actualCname' => $actualCname,
            'actualTxt' => $actualTxt,
            'reason' => $reason,
        ];
    }

    /**
     * Resolve a tenant by incoming request hostname.
     */
    public static function resolveTenantByHostname(string $host): ?array
    {
        $normalizedHost = self::normalizeDomain($host);
        if ($normalizedHost === '' || $normalizedHost === self::PLATFORM_CNAME_TARGET || in_array($normalizedHost, ['localhost', '127.0.0.1'], true)) {
            return null;
        }

        try {
            return Db::one(
                'SELECT * FROM tenants WHERE custom_domain = ? AND custom_domain_verified = 1 AND is_active = 1 LIMIT 1',
                [$normalizedHost]
            );
        } catch (Throwable) {
            return null;
        }
    }
}
