<?php
declare(strict_types=1);

namespace App\Database;

use PDO;
use Throwable;

/**
 * v7 — Multi-tenant database architecture hardening (reversible).
 *
 *  - Tenant-aware composite keys & composite foreign keys (a child row can never reference a parent of another tenant)
 *  - New tables: payment_webhook_events, tenant_usage_daily, tenant_storage_objects, publication_access_tokens,
 *    publication_approvals, publication_events, api_key_usage, session_families, notification_queue, outbox_events
 *  - Immutable (append-only) audit records enforced with database triggers
 *  - Tenant back-fills for legacy rows (jobs, hotspots, analytics, scheduled reports)
 *
 * up()/down()/status() are idempotent, so the migration can be rolled back and re-applied in CI
 * (see bin/test_migrations.php). Every step reports into $report instead of aborting the whole migration.
 */
final class TenantArchitectureMigration
{
    public const VERSION = '2026_11_11_000008_multi_tenant_database_architecture';
    public const DESCRIPTION = 'Composite tenant-aware FKs, outbox/event tables, storage metadata, session families, immutable audit triggers';

    /** Tables that get a (tenant_id, id) unique key so child tables can reference them with composite FKs. */
    private const TENANT_KEY_TABLES = ['flipbooks', 'categories', 'collections', 'folders', 'jobs', 'invoices', 'api_keys', 'webhooks'];

    /**
     * name => [child table, child cols, parent table, parent cols, ON DELETE]
     * Child columns are nullable-aware: a NULL in any column skips the check (MySQL MATCH SIMPLE).
     */
    private const COMPOSITE_FKS = [
        'fk_t_flipbook_category' => ['flipbooks', ['tenant_id', 'category_id'], 'categories', ['tenant_id', 'id'], 'RESTRICT'],
        'fk_t_flipbook_collection' => ['flipbooks', ['tenant_id', 'collection_id'], 'collections', ['tenant_id', 'id'], 'RESTRICT'],
        'fk_t_flipbook_folder' => ['flipbooks', ['tenant_id', 'folder_id'], 'folders', ['tenant_id', 'id'], 'RESTRICT'],
        'fk_t_job_flipbook' => ['jobs', ['tenant_id', 'flipbook_id'], 'flipbooks', ['tenant_id', 'id'], 'CASCADE'],
        'fk_t_hotspot_flipbook' => ['hotspots', ['tenant_id', 'flipbook_id'], 'flipbooks', ['tenant_id', 'id'], 'CASCADE'],
        'fk_t_report_flipbook' => ['scheduled_reports', ['tenant_id', 'flipbook_id'], 'flipbooks', ['tenant_id', 'id'], 'CASCADE'],
        'fk_t_paytx_invoice' => ['payment_transactions', ['tenant_id', 'invoice_id'], 'invoices', ['tenant_id', 'id'], 'RESTRICT'],
        'fk_t_payaudit_invoice' => ['payment_audit_logs', ['tenant_id', 'invoice_id'], 'invoices', ['tenant_id', 'id'], 'RESTRICT'],
        'fk_t_keyusage_key' => ['api_key_usage', ['tenant_id', 'api_key_id'], 'api_keys', ['tenant_id', 'id'], 'CASCADE'],
        'fk_t_storage_flipbook' => ['tenant_storage_objects', ['tenant_id', 'flipbook_id'], 'flipbooks', ['tenant_id', 'id'], 'CASCADE'],
        'fk_t_pubtoken_flipbook' => ['publication_access_tokens', ['tenant_id', 'flipbook_id'], 'flipbooks', ['tenant_id', 'id'], 'CASCADE'],
        'fk_t_approval_flipbook' => ['publication_approvals', ['tenant_id', 'flipbook_id'], 'flipbooks', ['tenant_id', 'id'], 'CASCADE'],
        'fk_t_pubevent_flipbook' => ['publication_events', ['tenant_id', 'flipbook_id'], 'flipbooks', ['tenant_id', 'id'], 'CASCADE'],
    ];

    /** Append-only tables (UPDATE / DELETE blocked unless @nuvis_audit_purge = 1 is set by trusted retention code). */
    public const IMMUTABLE_TABLES = ['audit_logs', 'security_events', 'payment_audit_logs', 'publication_events'];

    /** Created by up(); dropped by down() in this (reverse-dependency) order. */
    public const NEW_TABLES = [
        'outbox_events', 'notification_queue', 'session_families', 'api_key_usage', 'publication_events',
        'publication_approvals', 'publication_access_tokens', 'tenant_storage_objects', 'tenant_usage_daily',
        'payment_webhook_events',
    ];

    /** @var list<string> */
    private array $report = [];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<string> human readable log of what happened */
    public function report(): array
    {
        return $this->report;
    }

    // ------------------------------------------------------------------ UP

    public function up(): void
    {
        $this->createTables();
        $this->addColumns();
        $this->backfillTenantIds();
        $this->addTenantKeys();
        $this->addCompositeForeignKeys();
        $this->installImmutableAuditTriggers();
        $this->record();
    }

    /** Idempotently create the v7 tables only (used as a runtime safety net before first use; cheap when already present). */
    public function ensureTables(): void
    {
        $this->createTables();
    }

    private function createTables(): void
    {
        $ddl = [
            'payment_webhook_events' => "CREATE TABLE IF NOT EXISTS payment_webhook_events (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NULL,
                provider VARCHAR(50) NOT NULL,
                event_id VARCHAR(120) NOT NULL,
                event_type VARCHAR(80) NOT NULL,
                signature_verified TINYINT(1) NOT NULL DEFAULT 0,
                invoice_id BIGINT UNSIGNED NULL,
                transaction_id BIGINT UNSIGNED NULL,
                status ENUM('received','processed','rejected','duplicate') NOT NULL DEFAULT 'received',
                error_message VARCHAR(255) NULL,
                payload JSON NULL,
                received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME NULL,
                UNIQUE KEY uq_webhook_provider_event (provider, event_id),
                INDEX idx_webhook_tenant (tenant_id, received_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            'tenant_usage_daily' => "CREATE TABLE IF NOT EXISTS tenant_usage_daily (
                tenant_id BIGINT UNSIGNED NOT NULL,
                usage_date DATE NOT NULL,
                storage_mb DECIMAL(12,2) NOT NULL DEFAULT 0,
                bandwidth_mb DECIMAL(12,2) NOT NULL DEFAULT 0,
                publications INT UNSIGNED NOT NULL DEFAULT 0,
                page_views BIGINT UNSIGNED NOT NULL DEFAULT 0,
                conversions INT UNSIGNED NOT NULL DEFAULT 0,
                api_calls BIGINT UNSIGNED NOT NULL DEFAULT 0,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (tenant_id, usage_date),
                CONSTRAINT fk_usage_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            'tenant_storage_objects' => "CREATE TABLE IF NOT EXISTS tenant_storage_objects (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NOT NULL,
                flipbook_id BIGINT UNSIGNED NULL,
                kind ENUM('source_pdf','page','thumb','high_res','backup','asset') NOT NULL DEFAULT 'asset',
                rel_path VARCHAR(400) NOT NULL,
                size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
                sha256 CHAR(64) NOT NULL,
                mime_type VARCHAR(100) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                verified_at DATETIME NULL,
                deleted_at DATETIME NULL,
                UNIQUE KEY uq_storage_tenant_path (tenant_id, rel_path),
                INDEX idx_storage_flipbook (flipbook_id),
                INDEX idx_storage_sha (sha256),
                CONSTRAINT fk_storage_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            'publication_access_tokens' => "CREATE TABLE IF NOT EXISTS publication_access_tokens (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NOT NULL,
                flipbook_id BIGINT UNSIGNED NOT NULL,
                jti VARCHAR(64) NOT NULL UNIQUE,
                kind ENUM('unlock','preview','share') NOT NULL DEFAULT 'unlock',
                ip VARCHAR(45) NULL,
                user_agent VARCHAR(255) NULL,
                issued_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME NOT NULL,
                revoked_at DATETIME NULL,
                revoked_reason VARCHAR(80) NULL,
                INDEX idx_pubtoken_flipbook (tenant_id, flipbook_id, expires_at),
                CONSTRAINT fk_pubtoken_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            'publication_approvals' => "CREATE TABLE IF NOT EXISTS publication_approvals (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NOT NULL,
                flipbook_id BIGINT UNSIGNED NOT NULL,
                version INT UNSIGNED NOT NULL DEFAULT 1,
                requested_by BIGINT UNSIGNED NULL,
                decided_by BIGINT UNSIGNED NULL,
                decision ENUM('requested','approved','rejected','changes_requested') NOT NULL DEFAULT 'requested',
                notes TEXT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                decided_at DATETIME NULL,
                INDEX idx_approval_flipbook (tenant_id, flipbook_id, version),
                CONSTRAINT fk_approval_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            'publication_events' => "CREATE TABLE IF NOT EXISTS publication_events (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NOT NULL,
                flipbook_id BIGINT UNSIGNED NOT NULL,
                event_type VARCHAR(60) NOT NULL,
                actor_user_id BIGINT UNSIGNED NULL,
                from_status VARCHAR(30) NULL,
                to_status VARCHAR(30) NULL,
                meta JSON NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_pubevent_flipbook (tenant_id, flipbook_id, created_at),
                CONSTRAINT fk_pubevent_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            'api_key_usage' => "CREATE TABLE IF NOT EXISTS api_key_usage (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NOT NULL,
                api_key_id BIGINT UNSIGNED NOT NULL,
                usage_date DATE NOT NULL,
                request_count INT UNSIGNED NOT NULL DEFAULT 0,
                denied_count INT UNSIGNED NOT NULL DEFAULT 0,
                last_ip VARCHAR(64) NULL,
                last_endpoint VARCHAR(160) NULL,
                last_used_at DATETIME NULL,
                UNIQUE KEY uq_key_usage_day (api_key_id, usage_date),
                INDEX idx_key_usage_tenant (tenant_id, usage_date),
                CONSTRAINT fk_keyusage_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            'session_families' => "CREATE TABLE IF NOT EXISTS session_families (
                id CHAR(32) NOT NULL PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NULL,
                user_id BIGINT UNSIGNED NOT NULL,
                user_agent VARCHAR(255) NULL,
                ip VARCHAR(45) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_rotated_at DATETIME NULL,
                rotation_count INT UNSIGNED NOT NULL DEFAULT 0,
                revoked_at DATETIME NULL,
                revoked_reason VARCHAR(80) NULL,
                INDEX idx_session_family_user (user_id, revoked_at),
                INDEX idx_session_family_tenant (tenant_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            'notification_queue' => "CREATE TABLE IF NOT EXISTS notification_queue (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NULL,
                user_id BIGINT UNSIGNED NULL,
                channel ENUM('email','webhook','in_app') NOT NULL DEFAULT 'email',
                template VARCHAR(80) NOT NULL,
                recipient VARCHAR(190) NULL,
                payload JSON NULL,
                status ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
                attempts INT UNSIGNED NOT NULL DEFAULT 0,
                run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                sent_at DATETIME NULL,
                last_error VARCHAR(255) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_notification_due (status, run_at),
                INDEX idx_notification_tenant (tenant_id, status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

            'outbox_events' => "CREATE TABLE IF NOT EXISTS outbox_events (
                id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                tenant_id BIGINT UNSIGNED NOT NULL,
                event_uid CHAR(32) NOT NULL UNIQUE,
                aggregate_type VARCHAR(50) NOT NULL,
                aggregate_id BIGINT UNSIGNED NOT NULL,
                event_type VARCHAR(80) NOT NULL,
                payload JSON NOT NULL,
                status ENUM('pending','processing','delivered','failed','dead') NOT NULL DEFAULT 'pending',
                attempts INT UNSIGNED NOT NULL DEFAULT 0,
                max_attempts INT UNSIGNED NOT NULL DEFAULT 8,
                next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                locked_at DATETIME NULL,
                delivered_at DATETIME NULL,
                last_error VARCHAR(500) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_outbox_due (status, next_attempt_at),
                INDEX idx_outbox_aggregate (tenant_id, aggregate_type, aggregate_id),
                CONSTRAINT fk_outbox_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        ];

        foreach ($ddl as $table => $sql) {
            $this->exec($sql, "create table {$table}");
        }
    }

    private function addColumns(): void
    {
        $this->addColumn('refresh_tokens', 'family_id', 'CHAR(32) NULL');
        $this->addIndex('refresh_tokens', 'idx_refresh_family', '(family_id)');
        $this->addColumn('hotspots', 'tenant_id', 'BIGINT UNSIGNED NULL AFTER id');
        $this->addIndex('hotspots', 'idx_hotspot_tenant', '(tenant_id)');
        $this->addColumn('flipbooks', 'unlock_revoked_at', 'TIMESTAMP NULL DEFAULT NULL');
    }

    private function backfillTenantIds(): void
    {
        $steps = [
            'jobs.tenant_id' => 'UPDATE jobs j JOIN flipbooks f ON f.id = j.flipbook_id SET j.tenant_id = f.tenant_id WHERE j.tenant_id IS NULL AND f.tenant_id IS NOT NULL',
            'hotspots.tenant_id' => 'UPDATE hotspots h JOIN flipbooks f ON f.id = h.flipbook_id SET h.tenant_id = f.tenant_id WHERE h.tenant_id IS NULL AND f.tenant_id IS NOT NULL',
            'analytics_events.tenant_id' => 'UPDATE analytics_events a JOIN flipbooks f ON f.id = a.flipbook_id SET a.tenant_id = f.tenant_id WHERE a.tenant_id IS NULL AND f.tenant_id IS NOT NULL',
            'scheduled_reports.tenant_id' => 'UPDATE scheduled_reports s JOIN users u ON u.id = s.user_id SET s.tenant_id = u.tenant_id WHERE s.tenant_id IS NULL AND u.tenant_id IS NOT NULL',
        ];
        foreach ($steps as $label => $sql) {
            try {
                $n = $this->pdo->exec($sql);
                $this->report[] = "  + Back-filled {$label} ({$n} rows)";
            } catch (Throwable $e) {
                $this->report[] = "  ! Back-fill {$label} skipped: " . $e->getMessage();
            }
        }
    }

    private function addTenantKeys(): void
    {
        foreach (self::TENANT_KEY_TABLES as $table) {
            if ($this->columnExists($table, 'tenant_id')) {
                $this->addUnique($table, 'uq_tenant_id', '(tenant_id, id)');
            }
        }
    }

    private function addCompositeForeignKeys(): void
    {
        foreach (self::COMPOSITE_FKS as $name => [$child, $childCols, $parent, $parentCols, $onDelete]) {
            $this->addCompositeFk($name, $child, $childCols, $parent, $parentCols, $onDelete);
        }
    }

    private function addCompositeFk(string $name, string $child, array $childCols, string $parent, array $parentCols, string $onDelete): void
    {
        if (!$this->tableExists($child) || !$this->tableExists($parent)) {
            $this->report[] = "  ~ {$name}: skipped (table {$child} or {$parent} missing)";
            return;
        }
        foreach ($childCols as $c) {
            if (!$this->columnExists($child, $c)) {
                $this->report[] = "  ~ {$name}: skipped ({$child}.{$c} missing)";
                return;
            }
        }
        if ($this->fkExists($child, $name)) {
            return;
        }
        if (!$this->hasIndexOn($parent, $parentCols)) {
            $this->report[] = "  ~ {$name}: skipped (no unique key on {$parent}(" . implode(',', $parentCols) . '))';
            return;
        }

        // Refuse to apply when legacy rows would violate the constraint — report instead of failing.
        $on = [];
        foreach ($childCols as $i => $c) {
            $on[] = "p.`{$parentCols[$i]}` = c.`{$c}`";
        }
        $notNull = implode(' AND ', array_map(static fn($c) => "c.`{$c}` IS NOT NULL", $childCols));
        $violations = 0;
        try {
            $violations = (int) $this->pdo->query(
                "SELECT COUNT(*) FROM `{$child}` c LEFT JOIN `{$parent}` p ON " . implode(' AND ', $on) . " WHERE {$notNull} AND p.`{$parentCols[0]}` IS NULL"
            )->fetchColumn();
        } catch (Throwable $e) {
            $this->report[] = "  ! {$name}: pre-check failed: " . $e->getMessage();
            return;
        }
        if ($violations > 0) {
            $this->report[] = "  ! {$name}: NOT applied — {$violations} cross-tenant / orphan row(s) in {$child} must be repaired first";
            return;
        }

        $sql = sprintf(
            'ALTER TABLE `%s` ADD CONSTRAINT `%s` FOREIGN KEY (%s) REFERENCES `%s` (%s) ON DELETE %s',
            $child,
            $name,
            '`' . implode('`,`', $childCols) . '`',
            $parent,
            '`' . implode('`,`', $parentCols) . '`',
            $onDelete
        );
        $this->exec($sql, "composite FK {$name}");
    }

    /** Child tables that inherit tenant_id from their publication on insert (so legacy writers cannot create tenant-less rows). */
    private const TENANT_INHERIT_TRIGGERS = ['hotspots', 'jobs'];

    private function installImmutableAuditTriggers(): void
    {
        foreach (self::TENANT_INHERIT_TRIGGERS as $table) {
            if (!$this->tableExists($table) || !$this->columnExists($table, 'tenant_id')) {
                continue;
            }
            $trigger = "trg_{$table}_inherit_tenant";
            $this->exec("DROP TRIGGER IF EXISTS `{$trigger}`", "drop trigger {$trigger}", true);
            $this->exec(
                "CREATE TRIGGER `{$trigger}` BEFORE INSERT ON `{$table}` FOR EACH ROW
                 BEGIN
                   IF NEW.tenant_id IS NULL AND NEW.flipbook_id IS NOT NULL THEN
                     SET NEW.tenant_id = (SELECT tenant_id FROM flipbooks WHERE id = NEW.flipbook_id LIMIT 1);
                   END IF;
                 END",
                "tenant inheritance trigger {$trigger}"
            );
        }

        foreach (self::IMMUTABLE_TABLES as $table) {
            if (!$this->tableExists($table)) {
                continue;
            }
            foreach (['UPDATE' => 'update', 'DELETE' => 'delete'] as $event => $suffix) {
                $trigger = "trg_{$table}_no_{$suffix}";
                $this->exec("DROP TRIGGER IF EXISTS `{$trigger}`", "drop trigger {$trigger}", true);
                $this->exec(
                    "CREATE TRIGGER `{$trigger}` BEFORE {$event} ON `{$table}` FOR EACH ROW
                     BEGIN
                       IF @nuvis_audit_purge IS NULL OR @nuvis_audit_purge <> 1 THEN
                         SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable audit record: {$table} is append-only';
                       END IF;
                     END",
                    "immutable trigger {$trigger}"
                );
            }
        }
    }

    private function record(): void
    {
        try {
            $this->pdo->prepare(
                'INSERT IGNORE INTO schema_migrations (version, description, batch, checksum, is_reversible) VALUES (?, ?, 3, ?, 1)'
            )->execute([self::VERSION, self::DESCRIPTION, hash('sha256', self::VERSION . ':' . self::DESCRIPTION)]);
        } catch (Throwable) {
        }
    }

    // ---------------------------------------------------------------- DOWN

    public function down(): void
    {
        foreach (self::TENANT_INHERIT_TRIGGERS as $table) {
            $this->exec("DROP TRIGGER IF EXISTS `trg_{$table}_inherit_tenant`", "drop trigger {$table}/inherit", true);
        }
        foreach (self::IMMUTABLE_TABLES as $table) {
            foreach (['update', 'delete'] as $suffix) {
                $this->exec("DROP TRIGGER IF EXISTS `trg_{$table}_no_{$suffix}`", "drop trigger {$table}/{$suffix}", true);
            }
        }

        foreach (array_reverse(self::COMPOSITE_FKS, true) as $name => [$child]) {
            if ($this->tableExists($child) && $this->fkExists($child, $name)) {
                $this->exec("ALTER TABLE `{$child}` DROP FOREIGN KEY `{$name}`", "drop FK {$name}");
            }
        }

        foreach (self::TENANT_KEY_TABLES as $table) {
            if ($this->tableExists($table) && $this->indexExists($table, 'uq_tenant_id')) {
                $this->exec("ALTER TABLE `{$table}` DROP INDEX `uq_tenant_id`", "drop key {$table}.uq_tenant_id");
            }
        }

        foreach (self::NEW_TABLES as $table) {
            $this->exec("DROP TABLE IF EXISTS `{$table}`", "drop table {$table}");
        }

        if ($this->columnExists('hotspots', 'tenant_id')) {
            if ($this->indexExists('hotspots', 'idx_hotspot_tenant')) {
                $this->exec('ALTER TABLE `hotspots` DROP INDEX `idx_hotspot_tenant`', 'drop hotspots index', true);
            }
            $this->exec('ALTER TABLE `hotspots` DROP COLUMN `tenant_id`', 'drop hotspots.tenant_id');
        }
        if ($this->columnExists('refresh_tokens', 'family_id')) {
            if ($this->indexExists('refresh_tokens', 'idx_refresh_family')) {
                $this->exec('ALTER TABLE `refresh_tokens` DROP INDEX `idx_refresh_family`', 'drop refresh index', true);
            }
            $this->exec('ALTER TABLE `refresh_tokens` DROP COLUMN `family_id`', 'drop refresh_tokens.family_id');
        }

        try {
            $this->pdo->prepare('DELETE FROM schema_migrations WHERE version = ?')->execute([self::VERSION]);
        } catch (Throwable) {
        }
    }

    // -------------------------------------------------------------- STATUS

    /**
     * @return array{tables:array<string,bool>, composite_fks:array<string,bool>, tenant_keys:array<string,bool>, triggers:array<string,bool>, columns:array<string,bool>}
     */
    public function status(): array
    {
        $tables = [];
        foreach (self::NEW_TABLES as $t) {
            $tables[$t] = $this->tableExists($t);
        }
        $fks = [];
        foreach (self::COMPOSITE_FKS as $name => [$child]) {
            $fks[$name] = $this->tableExists($child) && $this->fkExists($child, $name);
        }
        $keys = [];
        foreach (self::TENANT_KEY_TABLES as $t) {
            $keys[$t] = $this->tableExists($t) && $this->indexExists($t, 'uq_tenant_id');
        }
        $triggers = [];
        foreach (self::TENANT_INHERIT_TRIGGERS as $t) {
            $triggers["trg_{$t}_inherit_tenant"] = $this->triggerExists("trg_{$t}_inherit_tenant");
        }
        foreach (self::IMMUTABLE_TABLES as $t) {
            foreach (['update', 'delete'] as $s) {
                $triggers["trg_{$t}_no_{$s}"] = $this->triggerExists("trg_{$t}_no_{$s}");
            }
        }
        return [
            'tables' => $tables,
            'composite_fks' => $fks,
            'tenant_keys' => $keys,
            'triggers' => $triggers,
            'columns' => [
                'hotspots.tenant_id' => $this->columnExists('hotspots', 'tenant_id'),
                'refresh_tokens.family_id' => $this->columnExists('refresh_tokens', 'family_id'),
            ],
        ];
    }

    // ------------------------------------------------------------- helpers

    private function exec(string $sql, string $label, bool $quiet = false): void
    {
        try {
            $this->pdo->exec($sql);
            if (!$quiet) {
                $this->report[] = "  + {$label}";
            }
        } catch (Throwable $e) {
            $this->report[] = "  ! {$label} failed: " . $e->getMessage();
        }
    }

    private function scalar(string $sql, array $params): int
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        return (int) $st->fetchColumn();
    }

    private function tableExists(string $table): bool
    {
        return $this->scalar('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [$table]) > 0;
    }

    private function columnExists(string $table, string $column): bool
    {
        return $this->scalar('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [$table, $column]) > 0;
    }

    private function indexExists(string $table, string $index): bool
    {
        return $this->scalar('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?', [$table, $index]) > 0;
    }

    private function fkExists(string $table, string $name): bool
    {
        return $this->scalar(
            "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
            [$table, $name]
        ) > 0;
    }

    private function triggerExists(string $name): bool
    {
        return $this->scalar('SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME = ?', [$name]) > 0;
    }

    /** True when $table has an index whose leading columns are exactly $cols (needed by a referencing FK). */
    private function hasIndexOn(string $table, array $cols): bool
    {
        $st = $this->pdo->prepare(
            'SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
             FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? GROUP BY INDEX_NAME'
        );
        $st->execute([$table]);
        $want = implode(',', $cols);
        foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (str_starts_with((string) $row['cols'], $want)) {
                return true;
            }
        }
        return false;
    }

    private function addColumn(string $table, string $column, string $definition): void
    {
        if ($this->tableExists($table) && !$this->columnExists($table, $column)) {
            $this->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}", "add {$table}.{$column}");
        }
    }

    private function addIndex(string $table, string $name, string $cols): void
    {
        if ($this->tableExists($table) && !$this->indexExists($table, $name)) {
            $this->exec("ALTER TABLE `{$table}` ADD INDEX `{$name}` {$cols}", "add index {$table}.{$name}");
        }
    }

    private function addUnique(string $table, string $name, string $cols): void
    {
        if (!$this->indexExists($table, $name)) {
            $this->exec("ALTER TABLE `{$table}` ADD UNIQUE KEY `{$name}` {$cols}", "add unique {$table}.{$name}");
        }
    }
}
