<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Database\TenantArchitectureMigration;
use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

/**
 * Formal migration rollback test for v7:  up → up (idempotent) → down → up.
 * Run against a development / CI database only.
 *
 *   php bin/test_migrations.php
 */
if (($_ENV['APP_ENV'] ?? 'local') === 'production' && !in_array('--force', $argv, true)) {
    fwrite(STDERR, "Refusing to run destructive rollback test in production.\n");
    exit(1);
}

$pass = 0;
$fail = 0;
function check(string $label, bool $ok): void {
    global $pass, $fail;
    $ok ? $pass++ : $fail++;
    echo '  [' . ($ok ? "\e[32mPASS\e[0m" : "\e[31mFAIL\e[0m") . "] {$label}\n";
}

$pdo = Db::pdo();
$m = new TenantArchitectureMigration($pdo);
$summ = static function (array $status): array {
    return [
        'tables' => count(array_filter($status['tables'])),
        'fks' => count(array_filter($status['composite_fks'])),
        'keys' => count(array_filter($status['tenant_keys'])),
        'triggers' => count(array_filter($status['triggers'])),
        'cols' => count(array_filter($status['columns'])),
    ];
};

echo "v7 migration rollback test\n";

$m->up();
$afterUp = $summ($m->status());
check('up(): all ' . count(TenantArchitectureMigration::NEW_TABLES) . ' new tables exist', $afterUp['tables'] === count(TenantArchitectureMigration::NEW_TABLES));
check('up(): immutable audit + tenant-inheritance triggers installed', $afterUp['triggers'] >= count(TenantArchitectureMigration::IMMUTABLE_TABLES) * 2);
check('up(): tenant keys (tenant_id, id) present', $afterUp['keys'] >= 4);
check('up(): hotspots.tenant_id and refresh_tokens.family_id present', $afterUp['cols'] === 2);

$m2 = new TenantArchitectureMigration($pdo);
$m2->up();
check('up() is idempotent (second run changes nothing)', $summ($m2->status()) === $afterUp);

// Immutability: audit rows cannot be altered or deleted without the trusted purge flag
Db::run("INSERT INTO audit_logs (action, target_type) VALUES ('migration.test', 'test')");
$id = (int) Db::pdo()->lastInsertId();
$blockedUpdate = false;
$blockedDelete = false;
try { Db::run("UPDATE audit_logs SET action = 'tampered' WHERE id = ?", [$id]); } catch (Throwable) { $blockedUpdate = true; }
try { Db::run('DELETE FROM audit_logs WHERE id = ?', [$id]); } catch (Throwable) { $blockedDelete = true; }
check('audit_logs UPDATE is rejected by trigger', $blockedUpdate);
check('audit_logs DELETE is rejected by trigger', $blockedDelete);
Db::run('SET @nuvis_audit_purge = 1');
Db::run('DELETE FROM audit_logs WHERE id = ?', [$id]);
Db::run('SET @nuvis_audit_purge = NULL');

$m3 = new TenantArchitectureMigration($pdo);
$m3->down();
$afterDown = $summ($m3->status());
check('down(): all v7 tables dropped', $afterDown['tables'] === 0);
check('down(): composite FKs, tenant keys, triggers and added columns removed', $afterDown['fks'] === 0 && $afterDown['keys'] === 0 && $afterDown['triggers'] === 0 && $afterDown['cols'] === 0);

// Audit trail is mutable again only because triggers are gone — now re-apply
$m4 = new TenantArchitectureMigration($pdo);
$m4->up();
check('re-apply after rollback restores the exact same schema', $summ($m4->status()) === $afterUp);

echo "\nResult: {$pass} passed, {$fail} failed\n";
exit($fail === 0 ? 0 : 1);
