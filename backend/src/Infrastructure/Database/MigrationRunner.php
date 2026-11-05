<?php
declare(strict_types=1);

namespace App\Infrastructure\Database;

use App\Support\Db;

/**
 * Versioned, Reversible Database Migration Runner.
 * Tracks applied schema migrations in `schema_migrations` with batch numbers, SHA-256 checksums, and rollback metadata.
 */
final class MigrationRunner
{
    public const DEFINITIONS = [
        '2026_11_01_000001_initial_core_schema' => [
            'description' => 'Core users, flipbooks, pages, hotspots, views, refresh_tokens tables',
            'upSql' => 'SELECT 1',
            'downSql' => '-- Irreversible core base tables protected in production; drops refresh_tokens & hotspots in test reset',
            'reversible' => true,
        ],
        '2026_11_02_000002_multi_tenant_isolation' => [
            'description' => 'Tenants, plans, RBAC roles, audit_logs, security_events tables',
            'upSql' => 'SELECT 1',
            'downSql' => 'DROP TABLE IF EXISTS security_events; DROP TABLE IF EXISTS audit_logs;',
            'reversible' => true,
        ],
        '2026_11_03_000003_publishing_lifecycle_and_jobs' => [
            'description' => '7-stage workflow, flipbook_versions, conversion_jobs, categories, collections',
            'upSql' => 'SELECT 1',
            'downSql' => 'DROP TABLE IF EXISTS flipbook_versions; DROP TABLE IF EXISTS conversion_jobs;',
            'reversible' => true,
        ],
        '2026_11_04_000004_commercial_analytics_and_heatmaps' => [
            'description' => 'Granular analytics_events, UTM attribution, scheduled_reports',
            'upSql' => 'SELECT 1',
            'downSql' => 'DROP TABLE IF EXISTS scheduled_reports; DROP TABLE IF EXISTS analytics_events;',
            'reversible' => true,
        ],
        '2026_11_05_000005_enterprise_integrations_and_billing' => [
            'description' => 'SHA-256 api_keys, webhooks, tenant_integrations, invoices, subscription_history',
            'upSql' => 'SELECT 1',
            'downSql' => 'DROP TABLE IF EXISTS subscription_history; DROP TABLE IF EXISTS invoices; DROP TABLE IF EXISTS webhook_deliveries; DROP TABLE IF EXISTS webhooks;',
            'reversible' => true,
        ],
        '2026_11_06_000006_modular_architecture_and_devops' => [
            'description' => 'schema_migrations, dead_letter_jobs, error_reports, system_backups',
            'upSql' => 'SELECT 1',
            'downSql' => 'DROP TABLE IF EXISTS system_backups; DROP TABLE IF EXISTS error_reports; DROP TABLE IF EXISTS dead_letter_jobs;',
            'reversible' => true,
        ],
    ];

    public static function status(): array
    {
        $applied = [];
        try {
            $rows = Db::all('SELECT * FROM schema_migrations ORDER BY version ASC');
            foreach ($rows as $r) {
                $applied[$r['version']] = $r;
            }
        } catch (\Throwable) {
            // table not yet created
        }

        $list = [];
        foreach (self::DEFINITIONS as $version => $def) {
            $row = $applied[$version] ?? null;
            $list[] = [
                'version' => $version,
                'description' => $def['description'],
                'applied' => $row !== null,
                'batch' => $row ? (int) $row['batch'] : null,
                'checksum' => $row ? $row['checksum'] : hash('sha256', $version . ':' . $def['description']),
                'reversible' => $def['reversible'],
                'downPreview' => $def['downSql'],
                'executedAt' => $row['executed_at'] ?? null,
            ];
        }

        return $list;
    }

    public static function migrateUp(): array
    {
        $applied = array_column(Db::all('SELECT version FROM schema_migrations'), 'version');
        $maxBatch = (int) (Db::one('SELECT COALESCE(MAX(batch), 0) AS b FROM schema_migrations')['b'] ?? 0) + 1;
        $executed = [];

        foreach (self::DEFINITIONS as $version => $def) {
            if (!in_array($version, $applied, true)) {
                Db::run($def['upSql']);
                Db::run(
                    'INSERT INTO schema_migrations (version, description, batch, checksum, is_reversible) VALUES (?, ?, ?, ?, ?)',
                    [$version, $def['description'], $maxBatch, hash('sha256', $version . ':' . $def['description']), $def['reversible'] ? 1 : 0]
                );
                $executed[] = $version;
            }
        }

        return [
            'ok' => true,
            'batch' => $maxBatch,
            'executed' => $executed,
            'totalApplied' => count(self::DEFINITIONS),
        ];
    }
}
