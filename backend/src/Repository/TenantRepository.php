<?php
declare(strict_types=1);

namespace App\Repository;

use App\Support\Db;
use App\Support\TenantContext;
use InvalidArgumentException;

/**
 * Central tenant-aware repository layer.
 *
 * Every read / write goes through a table registry (no dynamic identifiers from callers), and the tenant
 * predicate is ALWAYS part of the SQL. A tenant-scoped lookup can never return another tenant's row, nor a
 * tenant-less (global / orphan) row. Platform-wide access is only available through the explicitly named
 * `*AsPlatformAdmin()` methods, which refuse to run unless the caller is an interactive platform administrator.
 *
 *   $invoice = TenantRepository::for('invoices')->findForTenant($id);              // uses TenantContext::requireId()
 *   $invoice = TenantRepository::for('invoices')->findForTenant($id, $tenantId);   // explicit tenant
 */
final class TenantRepository
{
    /**
     * table => [tenantColumn, allowedUpdateColumns|null (null = update not allowed through repository)]
     *
     * Route-argument based IDOR middleware uses ROUTE_RESOURCES to map URL patterns to these tables.
     */
    private const TABLES = [
        'flipbooks' => ['tenant_id'],
        'categories' => ['tenant_id'],
        'collections' => ['tenant_id'],
        'folders' => ['tenant_id'],
        'invoices' => ['tenant_id'],
        'payment_transactions' => ['tenant_id'],
        'system_backups' => ['tenant_id'],
        'api_keys' => ['tenant_id'],
        'webhooks' => ['tenant_id'],
        'scheduled_reports' => ['tenant_id'],
        'error_reports' => ['tenant_id'],
        'dead_letter_jobs' => ['tenant_id'],
        'jobs' => ['tenant_id'],
        'tenant_storage_objects' => ['tenant_id'],
        'publication_access_tokens' => ['tenant_id'],
        'publication_approvals' => ['tenant_id'],
        'publication_events' => ['tenant_id'],
        'outbox_events' => ['tenant_id'],
    ];

    /** Tables where platform-owned rows (tenant_id IS NULL) legitimately exist; handled by service-level checks. */
    public const GLOBAL_ROWS_ALLOWED = ['error_reports', 'dead_letter_jobs', 'system_backups'];

    /**
     * URL pattern fragment => [table, route argument]. Matched by TenantScope for universal IDOR protection.
     */
    public const ROUTE_RESOURCES = [
        '/flipbooks/{id' => ['flipbooks', 'id'],
        '/categories/{id' => ['categories', 'id'],
        '/collections/{id' => ['collections', 'id'],
        '/jobs/{id' => ['jobs', 'id'],
        '/api-keys/{id' => ['api_keys', 'id'],
        '/webhooks/{id' => ['webhooks', 'id'],
        '/scheduled-reports/{id' => ['scheduled_reports', 'id'],
        '/invoices/{id' => ['invoices', 'id'],
        '/backups/{id' => ['system_backups', 'id'],
        '/errors/{id' => ['error_reports', 'id'],
        '/dlq/{id' => ['dead_letter_jobs', 'id'],
        '/hotspots/{hid' => ['hotspots', 'hid'],
    ];

    private string $table;
    private string $column;

    private function __construct(string $table)
    {
        if (!isset(self::TABLES[$table])) {
            throw new InvalidArgumentException("Table '{$table}' is not registered as tenant-owned");
        }
        $this->table = $table;
        $this->column = self::TABLES[$table][0];
    }

    public static function for(string $table): self
    {
        return new self($table);
    }

    public static function isRegistered(string $table): bool
    {
        return isset(self::TABLES[$table]);
    }

    private function resolveTenant(?int $tenantId): int
    {
        return $tenantId !== null && $tenantId > 0 ? $tenantId : TenantContext::requireId();
    }

    /** Find a row owned by the tenant; returns null for other tenants' rows and for tenant-less rows. */
    public function findForTenant(int $id, ?int $tenantId = null): ?array
    {
        $tid = $this->resolveTenant($tenantId);
        return Db::one("SELECT * FROM `{$this->table}` WHERE id = ? AND `{$this->column}` = ? LIMIT 1", [$id, $tid]);
    }

    public function existsForTenant(int $id, ?int $tenantId = null): bool
    {
        $tid = $this->resolveTenant($tenantId);
        return Db::one("SELECT 1 AS ok FROM `{$this->table}` WHERE id = ? AND `{$this->column}` = ? LIMIT 1", [$id, $tid]) !== null;
    }

    /**
     * @param array<string,scalar|null> $where extra equality filters (column => value); column names are validated.
     */
    public function allForTenant(array $where = [], string $orderBy = 'id DESC', int $limit = 500, ?int $tenantId = null): array
    {
        $tid = $this->resolveTenant($tenantId);
        $sql = "SELECT * FROM `{$this->table}` WHERE `{$this->column}` = ?";
        $params = [$tid];
        foreach ($where as $col => $val) {
            self::assertIdentifier((string) $col);
            $sql .= " AND `{$col}` = ?";
            $params[] = $val;
        }
        if (!preg_match('/^[a-z_]+(\.[a-z_]+)?( (ASC|DESC))?$/i', $orderBy)) {
            throw new InvalidArgumentException('Invalid ORDER BY');
        }
        $sql .= " ORDER BY {$orderBy} LIMIT " . max(1, min(5000, $limit));
        return Db::all($sql, $params);
    }

    /** UPDATE ... WHERE id = ? AND tenant_id = ?  → number of affected rows (0 for foreign rows). */
    public function updateForTenant(int $id, array $fields, ?int $tenantId = null): int
    {
        if ($fields === []) {
            return 0;
        }
        $tid = $this->resolveTenant($tenantId);
        $sets = [];
        $params = [];
        foreach ($fields as $col => $val) {
            self::assertIdentifier((string) $col);
            if ($col === $this->column || $col === 'id') {
                throw new InvalidArgumentException("Column '{$col}' is immutable through the repository");
            }
            $sets[] = "`{$col}` = ?";
            $params[] = $val;
        }
        $params[] = $id;
        $params[] = $tid;
        return Db::run("UPDATE `{$this->table}` SET " . implode(', ', $sets) . " WHERE id = ? AND `{$this->column}` = ?", $params);
    }

    public function deleteForTenant(int $id, ?int $tenantId = null): int
    {
        $tid = $this->resolveTenant($tenantId);
        return Db::run("DELETE FROM `{$this->table}` WHERE id = ? AND `{$this->column}` = ?", [$id, $tid]);
    }

    /** INSERT with the tenant column forced from the resolved tenant (callers cannot override it). */
    public function insertForTenant(array $fields, ?int $tenantId = null): int
    {
        $tid = $this->resolveTenant($tenantId);
        unset($fields[$this->column], $fields['id']);
        $fields = [$this->column => $tid] + $fields;
        $cols = [];
        foreach (array_keys($fields) as $col) {
            self::assertIdentifier((string) $col);
            $cols[] = "`{$col}`";
        }
        $ph = implode(', ', array_fill(0, count($fields), '?'));
        return Db::insert("INSERT INTO `{$this->table}` (" . implode(', ', $cols) . ") VALUES ({$ph})", array_values($fields));
    }

    /**
     * Ownership classification used by the IDOR middleware.
     * @return string 'missing' | 'owned' | 'foreign' | 'global'
     */
    public function classify(int $id, ?int $tenantId): string
    {
        $row = Db::one("SELECT `{$this->column}` AS t FROM `{$this->table}` WHERE id = ? LIMIT 1", [$id]);
        if (!$row) {
            return 'missing';
        }
        if ($row['t'] === null) {
            return 'global';
        }
        return $tenantId !== null && (int) $row['t'] === $tenantId ? 'owned' : 'foreign';
    }

    /** Classify a hotspot-like child row through its parent publication when it has no own tenant column value. */
    public static function classifyHotspot(int $hotspotId, ?int $tenantId): string
    {
        $row = Db::one(
            'SELECT f.tenant_id AS t FROM hotspots h JOIN flipbooks f ON f.id = h.flipbook_id WHERE h.id = ? LIMIT 1',
            [$hotspotId]
        );
        if (!$row) {
            return 'missing';
        }
        if ($row['t'] === null) {
            return 'global';
        }
        return $tenantId !== null && (int) $row['t'] === $tenantId ? 'owned' : 'foreign';
    }

    // ---- Explicit platform-administrator access (never reachable from tenant sessions or API keys) ----

    public function findAsPlatformAdmin(int $id): ?array
    {
        if (!TenantContext::isSuperAdmin()) {
            throw new \App\Support\TenantContextRequiredException('Platform administrator required', 403);
        }
        return Db::one("SELECT * FROM `{$this->table}` WHERE id = ? LIMIT 1", [$id]);
    }

    private static function assertIdentifier(string $name): void
    {
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name)) {
            throw new InvalidArgumentException("Invalid column name '{$name}'");
        }
    }
}
