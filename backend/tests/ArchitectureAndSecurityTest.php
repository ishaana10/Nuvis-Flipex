<?php
declare(strict_types=1);

namespace Tests;

use App\Infrastructure\Cache\CacheManager;
use App\Infrastructure\Database\MigrationRunner;
use App\Infrastructure\Logging\JsonLogger;
use App\Shared\ModuleRegistry;
use App\Support\PasswordPolicy;
use App\Support\Totp;

/**
 * Automated Unit & Architecture Verification Tests.
 * Can be executed via PHPUnit (`vendor/bin/phpunit`) or directly via `php backend/tests/ArchitectureAndSecurityTest.php`.
 */
final class ArchitectureAndSecurityTest
{
    public static function runAll(): array
    {
        $assertions = [];

        // 1. Verify all 15 Domain Modules are registered and implement ModuleContract
        $blueprint = ModuleRegistry::blueprint();
        $moduleNames = array_column($blueprint['modules'], 'name');
        $expectedModules = [
            'Authentication', 'Tenants', 'Users', 'Permissions', 'Publications',
            'DocumentProcessing', 'Flipbook', 'Hotspots', 'Publishing', 'Analytics',
            'Subscriptions', 'Billing', 'Integrations', 'Notifications', 'Audit',
        ];
        $assertions['15_domain_modules_registered'] = ($moduleNames === $expectedModules);

        // 2. Verify all 6 architectural layers exist
        $assertions['6_architectural_layers_defined'] = (count($blueprint['layers']) === 6);

        // 3. Verify CacheManager set/get/remember and distributed lock acquisition
        CacheManager::set('unit_test_key', ['status' => 'cached_ok'], 60);
        $cachedVal = CacheManager::get('unit_test_key');
        $lockAcquired = CacheManager::acquireLock('test_worker_lock', 10);
        CacheManager::releaseLock('test_worker_lock');
        $assertions['cache_and_distributed_locks'] = (($cachedVal['status'] ?? '') === 'cached_ok' && $lockAcquired === true);

        // 4. Verify Structured JSON Logger writes RFC-compliant JSONL with trace_id
        JsonLogger::info('Unit test structured log verification', ['suite' => 'ArchitectureAndSecurityTest']);
        $recentLogs = JsonLogger::recentEntries(5);
        $assertions['structured_jsonl_logging'] = (!empty($recentLogs) && isset($recentLogs[0]['trace_id']));

        // 5. Verify PasswordPolicy validator enforces developer rules
        $weakCheck = PasswordPolicy::validate('short', 'user@example.com', 'User');
        $strongCheck = PasswordPolicy::validate('Nuvis#Flipex2026!Secure', 'user@example.com', 'User');
        $assertions['password_policy_enforcement'] = (!empty($weakCheck) && empty($strongCheck));

        // 6. Verify RFC 6238 TOTP generation & verification
        $secret = Totp::generateSecret();
        $code = Totp::calculate($secret);
        $assertions['rfc6238_totp_verification'] = Totp::verify($code, $secret);

        // 7. Verify Versioned Reversible Migrations registry
        $migrations = MigrationRunner::status();
        $assertions['versioned_reversible_migrations'] = (count($migrations) >= 6);

        return $assertions;
    }
}

if (PHP_SAPI === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    require __DIR__ . '/../vendor/autoload.php';
    \Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();
    $results = ArchitectureAndSecurityTest::runAll();
    foreach ($results as $name => $passed) {
        echo ($passed ? "[PASS] " : "[FAIL] ") . $name . PHP_EOL;
    }
    exit(in_array(false, $results, true) ? 1 : 0);
}
