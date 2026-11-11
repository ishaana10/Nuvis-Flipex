<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

/**
 * Opt-in monthly RANGE partitioning for the high-volume analytics_events table.
 *
 *   php bin/partition_analytics.php              dry-run: shows the statements and blockers
 *   php bin/partition_analytics.php --apply      applies partitioning (takes a table lock; run in a maintenance window)
 *   php bin/partition_analytics.php --extend     adds the next 3 monthly partitions (run monthly from cron)
 *
 * MySQL cannot partition InnoDB tables that have foreign keys and requires the partition key in every unique key,
 * so --apply drops analytics_events' FK to flipbooks (flipbook_id remains tenant-scoped through tenant_id and
 * application-level checks) and widens the primary key to (id, created_at).
 */
$apply = in_array('--apply', $argv, true);
$extend = in_array('--extend', $argv, true);
$pdo = Db::pdo();

function partitionNames(PDO $pdo): array {
    $st = $pdo->query("SELECT PARTITION_NAME FROM information_schema.PARTITIONS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'analytics_events' AND PARTITION_NAME IS NOT NULL ORDER BY PARTITION_ORDINAL_POSITION");
    return $st ? $st->fetchAll(PDO::FETCH_COLUMN) : [];
}

if ($extend) {
    $existing = partitionNames($pdo);
    if (!in_array('p_future', $existing, true)) {
        fwrite(STDERR, "analytics_events is not partitioned (no p_future). Run with --apply first.\n");
        exit(1);
    }
    for ($i = 0; $i < 4; $i++) {
        $first = new DateTimeImmutable('first day of this month 00:00:00');
        $start = $first->modify("+{$i} month");
        $name = 'p' . $start->format('Ym');
        if (in_array($name, $existing, true)) {
            continue;
        }
        $upper = $start->modify('+1 month')->format('Y-m-d');
        $pdo->exec("ALTER TABLE analytics_events REORGANIZE PARTITION p_future INTO (PARTITION {$name} VALUES LESS THAN ('{$upper}'), PARTITION p_future VALUES LESS THAN (MAXVALUE))");
        echo "  + Added partition {$name} (< {$upper})\n";
    }
    exit(0);
}

$existing = partitionNames($pdo);
if ($existing !== []) {
    echo "analytics_events is already partitioned (" . count($existing) . " partitions).\n";
    exit(0);
}

$parts = [];
$cursor = new DateTimeImmutable('first day of this month 00:00:00');
$cursor = $cursor->modify('-12 month');
$parts[] = "PARTITION p_history VALUES LESS THAN ('" . $cursor->format('Y-m-d') . "')";
for ($i = 0; $i < 16; $i++) {
    $next = $cursor->modify('+1 month');
    $parts[] = 'PARTITION p' . $cursor->format('Ym') . " VALUES LESS THAN ('" . $next->format('Y-m-d') . "')";
    $cursor = $next;
}
$parts[] = 'PARTITION p_future VALUES LESS THAN (MAXVALUE)';

$fkName = $pdo->query(
    "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'analytics_events' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1"
)->fetchColumn();

$statements = [];
if ($fkName) {
    $statements[] = "ALTER TABLE analytics_events DROP FOREIGN KEY `{$fkName}`";
}
$statements[] = 'ALTER TABLE analytics_events DROP PRIMARY KEY, ADD PRIMARY KEY (id, created_at)';
$statements[] = "ALTER TABLE analytics_events PARTITION BY RANGE COLUMNS(created_at) (\n  " . implode(",\n  ", $parts) . "\n)";

foreach ($statements as $sql) {
    echo ($apply ? 'EXEC  ' : 'PLAN  ') . $sql . "\n";
    if ($apply) {
        $pdo->exec($sql);
    }
}
echo $apply ? "Partitioning applied.\n" : "Dry run only — re-run with --apply in a maintenance window.\n";
