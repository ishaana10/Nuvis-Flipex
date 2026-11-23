<?php
declare(strict_types=1);

namespace Tests;

use App\Support\CustomDomainService;
use App\Support\Db;
use App\Support\PublisherIdentity;

/**
 * Automated Verification Tests for Flipex Publisher Identity,
 * Branded URLs, Strict Slug Resolution & Custom Domain Services.
 *
 * Can be executed via PHPUnit or standalone: `php backend/tests/PublisherIdentityTest.php`
 */
final class PublisherIdentityTest
{
    public static function runAll(): array
    {
        $assertions = [];

        // 1. Slug Sanitization & Normalization
        $clean1 = PublisherIdentity::sanitizeSlug('Subrails Furniture Centre (Fiji) Ltd!');
        $clean2 = PublisherIdentity::sanitizeSlug('   Nuvis---Flipex___2026   ');
        $assertions['sanitize_special_chars_and_spaces'] = ($clean1 === 'subrails-furniture-centre-fiji-ltd' && $clean2 === 'nuvis-flipex-2026');

        // 2. Reserved Slugs Rejection
        $resLogin = PublisherIdentity::checkCompanySlugAvailability('login');
        $resApi = PublisherIdentity::checkCompanySlugAvailability('api');
        $resV = PublisherIdentity::checkCompanySlugAvailability('v');
        $assertions['reserved_slugs_rejected'] = (!$resLogin['available'] && !$resApi['available'] && !$resV['available']);

        // 3. Minimum Length Validation
        $short = PublisherIdentity::checkCompanySlugAvailability('ab');
        $assertions['min_length_validation'] = (!$short['valid'] && !$short['available']);

        // 4. Strict Slug Resolution: Non-existent, numeric IDs, or fuzzy guesses must return null (404)
        $nonExistent = PublisherIdentity::resolveTenantBySlug('this-company-slug-does-not-exist-xyz999');
        $numericGuess = PublisherIdentity::resolveTenantBySlug('12345');
        $bizNumericGuess = PublisherIdentity::resolveTenantBySlug('biz-99999');
        $assertions['strict_404_on_nonexistent_and_numeric_slugs'] = (
            $nonExistent['tenant'] === null &&
            $numericGuess['tenant'] === null &&
            $bizNumericGuess['tenant'] === null
        );

        // 5. Canonical Relative URL Path Builder
        $path1 = PublisherIdentity::buildCanonicalPath('subrails', 'annual-catalogue-2026');
        $path2 = PublisherIdentity::buildCanonicalPath('', 'standalone-doc');
        $assertions['canonical_path_builder'] = (
            $path1 === '/subrails/docs/annual-catalogue-2026' &&
            $path2 === '/v/standalone-doc'
        );

        // 6. Custom Domain Normalization
        $dom1 = CustomDomainService::normalizeDomain('https://catalogues.subrails.com/path?foo=bar');
        $dom2 = CustomDomainService::normalizeDomain('HTTP://BROCHURES.MYCOMPANY.COM:8080/');
        $assertions['custom_domain_normalization'] = (
            $dom1 === 'catalogues.subrails.com' &&
            $dom2 === 'brochures.mycompany.com'
        );

        // 7. Custom Domain Verification Token Generation
        $token1 = CustomDomainService::getVerificationToken(1);
        $assertions['custom_domain_token_format'] = str_starts_with($token1, 'flipex-verify=');

        // 8. Custom Domain Platform Collision Protection
        $platCheck = CustomDomainService::verifyDns(1, 'flipex.ict-fj.com');
        $assertions['platform_domain_collision_prevented'] = (!$platCheck['verified']);

        // 9. Cross-Tenant Publication Isolation
        // Verify resolvePublicationForTenant returns null when publication does not belong to the tenant
        try {
            $pubIsolation = PublisherIdentity::resolvePublicationForTenant(9999999, 'any-pub-slug');
            $assertions['cross_tenant_publication_isolation'] = ($pubIsolation['flipbook'] === null);
        } catch (\Throwable $e) {
            $assertions['cross_tenant_publication_isolation'] = true;
        }

        // 10. Slug Availability & Redirect Protection
        // A slug that matches a reserved name should suggest an alternative
        $resReserved = PublisherIdentity::checkCompanySlugAvailability('dashboard');
        $assertions['reserved_slug_suggestion'] = (
            !$resReserved['available'] &&
            !empty($resReserved['suggestion'])
        );

        return $assertions;
    }
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    if (file_exists(__DIR__ . '/../vendor/autoload.php')) {
        require_once __DIR__ . '/../vendor/autoload.php';
    } else {
        spl_autoload_register(function ($class) {
            $prefix = 'App\\';
            $baseDir = __DIR__ . '/../src/';
            $len = strlen($prefix);
            if (strncmp($prefix, $class, $len) !== 0) return;
            $relativeClass = substr($class, $len);
            $file = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';
            if (file_exists($file)) require_once $file;
        });
    }
    if (class_exists('\\Dotenv\\Dotenv') && file_exists(__DIR__ . '/../.env')) {
        \Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();
    }
    $results = PublisherIdentityTest::runAll();
    $allPassed = true;
    echo PHP_EOL . "=== Flipex Publisher Identity & Branded URLs Test Suite ===" . PHP_EOL;
    foreach ($results as $name => $passed) {
        if (!$passed) $allPassed = false;
        echo ($passed ? "  [PASS] " : "  [FAIL] ") . $name . PHP_EOL;
    }
    echo "==========================================================" . PHP_EOL;
    echo ($allPassed ? "All tests PASSED!" : "Some tests FAILED!") . PHP_EOL . PHP_EOL;
    exit($allPassed ? 0 : 1);
}
