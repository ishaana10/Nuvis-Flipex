<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Support\Audit;
use App\Support\Db;
use App\Support\Http;
use App\Support\Rbac;
use App\Support\TenantContext;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class RoleController
{
    /**
     * List all available roles (system defaults + tenant custom roles) with active member counts.
     */
    public function index(Request $req, Response $res): Response
    {
        Rbac::ensureSchema();
        $u = $req->getAttribute('user');
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : null);

        // Fetch roles from database
        try {
            if ($tenantId !== null) {
                $sql = 'SELECT * FROM tenant_roles WHERE tenant_id IS NULL OR tenant_id = ? ORDER BY is_system DESC, id ASC';
                $rows = Db::all($sql, [$tenantId]);
            } else {
                $sql = 'SELECT * FROM tenant_roles WHERE tenant_id IS NULL ORDER BY is_system DESC, id ASC';
                $rows = Db::all($sql);
            }
        } catch (\Throwable) {
            $rows = [];
        }

        // If table is empty or not yet migrated, construct from standard defaults
        if (empty($rows)) {
            $rolesList = [];
            $idCounter = 1;
            foreach (Rbac::DEFAULT_ROLE_PERMISSIONS as $slug => $perms) {
                $name = match ($slug) {
                    'owner'   => 'Tenant Owner',
                    'admin'   => 'Tenant Administrator',
                    'editor'  => 'Content Editor',
                    'viewer'  => 'Viewer / Reader',
                    'finance' => 'Billing & Finance Manager',
                    default   => ucfirst($slug),
                };
                $desc = match ($slug) {
                    'owner'   => 'Full administrative, financial, and operational authority over the tenant workspace, publications, and team.',
                    'admin'   => 'Workspace administrator managing publications, hotspots, team members, integrations, and workspace settings.',
                    'editor'  => 'Creates, customizes, and publishes flipbooks and hotspots. Restricted from deleting publications, billing, devops, and tenant settings.',
                    'viewer'  => 'Read-only access to view publications, search content, and view basic engagement analytics.',
                    'finance' => 'Manages company billing, subscription invoices, payment submissions, and Fiji bank transfer reconciliations.',
                    default   => 'Custom tenant role with defined permissions.',
                };
                $rolesList[] = [
                    'id'          => $idCounter++,
                    'name'        => $name,
                    'slug'        => $slug,
                    'description' => $desc,
                    'isSystem'    => true,
                    'permissions' => $perms,
                    'memberCount' => 0,
                ];
            }
            return Http::json($res, $rolesList);
        }

        // Calculate member counts per role (strictly scoped to current tenant if tenant-authenticated)
        $counts = [];
        try {
            if ($tenantId !== null) {
                $countRows = Db::all(
                    'SELECT tenant_role, COUNT(*) as cnt FROM users WHERE deleted_at IS NULL AND tenant_id = ? GROUP BY tenant_role',
                    [$tenantId]
                );
            } else {
                $countRows = Db::all('SELECT tenant_role, COUNT(*) as cnt FROM users WHERE deleted_at IS NULL GROUP BY tenant_role');
            }
            foreach ($countRows as $cr) {
                $counts[$cr['tenant_role']] = (int) $cr['cnt'];
            }
        } catch (\Throwable) {
        }

        $rolesList = array_map(function ($r) use ($counts) {
            $perms = is_array($r['permissions']) ? $r['permissions'] : json_decode((string) ($r['permissions'] ?? '[]'), true);
            return [
                'id'          => (int) $r['id'],
                'tenantId'    => $r['tenant_id'] ? (int) $r['tenant_id'] : null,
                'name'        => $r['name'],
                'slug'        => $r['slug'],
                'description' => $r['description'] ?? '',
                'isSystem'    => (bool) $r['is_system'],
                'permissions' => is_array($perms) ? $perms : [],
                'memberCount' => $counts[$r['slug']] ?? 0,
                'createdAt'   => $r['created_at'] ?? null,
                'updatedAt'   => $r['updated_at'] ?? null,
            ];
        }, $rows);

        return Http::json($res, [
            'roles' => $rolesList,
            'permissionsMatrix' => self::buildPermissionsMatrix(),
        ]);
    }

    /**
     * Get dictionary of all permissions grouped by module.
     */
    public function permissionsMatrix(Request $req, Response $res): Response
    {
        return Http::json($res, self::buildPermissionsMatrix());
    }

    public static function buildPermissionsMatrix(): array
    {
        $grouped = [];
        foreach (Rbac::ALL_PERMISSIONS as $permKey => $meta) {
            $mod = $meta['module'];
            if (!isset($grouped[$mod])) {
                $grouped[$mod] = [
                    'module'      => $mod,
                    'label'       => match ($mod) {
                        'publications' => 'Publications & Content',
                        'analytics'    => 'Analytics & Engagement',
                        'team'         => 'Team & User Management',
                        'settings'     => 'Workspace Settings',
                        'integrations' => 'Integrations & REST API',
                        'billing'      => 'Commercial Billing & Invoices',
                        'devops'       => 'DevOps & System Infrastructure',
                        default        => ucfirst($mod),
                    },
                    'permissions' => [],
                ];
            }
            $grouped[$mod]['permissions'][] = [
                'key'    => $permKey,
                'action' => $meta['action'],
                'label'  => $meta['label'],
                'desc'   => $meta['desc'],
            ];
        }

        return array_values($grouped);
    }

    /**
     * Create a new custom role.
     */
    public function create(Request $req, Response $res): Response
    {
        Rbac::ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'roles.manage');

        $b = (array) $req->getParsedBody();
        $name = trim((string) ($b['name'] ?? ''));
        $slug = trim(strtolower((string) ($b['slug'] ?? '')));
        $desc = trim((string) ($b['description'] ?? ''));
        $perms = $b['permissions'] ?? [];

        if ($name === '') {
            return Http::error($res, 'Role name is required', 422);
        }
        if ($slug === '') {
            $slug = preg_replace('#[^a-z0-9_-]+#', '_', strtolower($name)) ?: 'custom_role';
        }
        if (!is_array($perms)) {
            $perms = [];
        }

        // Filter permissions against defined whitelist
        $validPerms = array_values(array_intersect($perms, array_keys(Rbac::ALL_PERMISSIONS)));

        $tenantId = ($u['role'] === 'admin' && array_key_exists('tenantId', $b))
            ? (!empty($b['tenantId']) ? (int) $b['tenantId'] : null)
            : (TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : null));

        // Check if slug already exists in this scope
        $existing = $tenantId !== null
            ? Db::one('SELECT id FROM tenant_roles WHERE slug = ? AND (tenant_id = ? OR tenant_id IS NULL)', [$slug, $tenantId])
            : Db::one('SELECT id FROM tenant_roles WHERE slug = ? AND tenant_id IS NULL', [$slug]);

        if ($existing) {
            return Http::error($res, "A role with slug '{$slug}' already exists", 409);
        }

        Db::run(
            'INSERT INTO tenant_roles (tenant_id, name, slug, description, is_system, permissions) VALUES (?, ?, ?, ?, 0, ?)',
            [$tenantId, $name, $slug, $desc, json_encode($validPerms, JSON_UNESCAPED_SLASHES)]
        );

        $id = (int) Db::pdo()->lastInsertId();
        Audit::log('roles.create', 'role', $id, ['name' => $name, 'slug' => $slug, 'permissions' => $validPerms]);

        return Http::json($res, [
            'id'          => $id,
            'tenantId'    => $tenantId,
            'name'        => $name,
            'slug'        => $slug,
            'description' => $desc,
            'isSystem'    => false,
            'permissions' => $validPerms,
            'memberCount' => 0,
        ], 201);
    }

    /**
     * Update an existing role's permissions, name, or description.
     */
    public function update(Request $req, Response $res, array $args): Response
    {
        Rbac::ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'roles.manage');

        $id = (int) $args['id'];
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : null);
        $role = Db::one('SELECT * FROM tenant_roles WHERE id = ?', [$id]);
        if (!$role) {
            return Http::error($res, 'Role not found', 404);
        }

        // Cross-tenant authorization check: tenant administrators cannot edit global system roles or roles from other tenants
        if (($u['role'] ?? '') !== 'admin') {
            if (!empty($role['is_system'])) {
                return Http::error($res, 'System default roles cannot be modified by workspace administrators', 403);
            }
            if ($tenantId === null || (int) ($role['tenant_id'] ?? 0) !== $tenantId) {
                return Http::error($res, 'Unauthorized access to role from another tenant', 403);
            }
        }

        $b = (array) $req->getParsedBody();
        $name = isset($b['name']) ? trim((string) $b['name']) : $role['name'];
        $desc = isset($b['description']) ? trim((string) $b['description']) : ($role['description'] ?? '');

        if ($name === '') {
            return Http::error($res, 'Role name cannot be empty', 422);
        }

        $perms = $role['permissions'];
        if (isset($b['permissions']) && is_array($b['permissions'])) {
            $perms = array_values(array_intersect($b['permissions'], array_keys(Rbac::ALL_PERMISSIONS)));
        } elseif (is_string($perms)) {
            $perms = json_decode($perms, true) ?: [];
        }

        Db::run(
            'UPDATE tenant_roles SET name = ?, description = ?, permissions = ? WHERE id = ?',
            [$name, $desc, json_encode($perms, JSON_UNESCAPED_SLASHES), $id]
        );

        Audit::log('roles.update', 'role', $id, ['name' => $name, 'permissions' => $perms]);

        return Http::json($res, [
            'id'          => $id,
            'tenantId'    => $role['tenant_id'] ? (int) $role['tenant_id'] : null,
            'name'        => $name,
            'slug'        => $role['slug'],
            'description' => $desc,
            'isSystem'    => (bool) $role['is_system'],
            'permissions' => $perms,
        ]);
    }

    /**
     * Delete a custom role (system roles cannot be deleted).
     */
    public function delete(Request $req, Response $res, array $args): Response
    {
        Rbac::ensureSchema();
        $u = $req->getAttribute('user');
        Rbac::authorize($u, 'roles.manage');

        $id = (int) $args['id'];
        $tenantId = TenantContext::id() ?? (!empty($u['tenant_id']) ? (int) $u['tenant_id'] : null);
        $role = Db::one('SELECT * FROM tenant_roles WHERE id = ?', [$id]);
        if (!$role) {
            return Http::error($res, 'Role not found', 404);
        }

        if (!empty($role['is_system'])) {
            return Http::error($res, 'System default roles (Owner, Admin, Editor, Viewer, Finance) cannot be deleted', 400);
        }

        // Cross-tenant authorization check: tenant administrators cannot delete roles from other tenants
        if (($u['role'] ?? '') !== 'admin') {
            if ($tenantId === null || (int) ($role['tenant_id'] ?? 0) !== $tenantId) {
                return Http::error($res, 'Unauthorized access to role from another tenant', 403);
            }
        }

        // Reassign any users currently assigned to this custom role to 'viewer' strictly within this tenant
        if (!empty($role['tenant_id'])) {
            Db::run('UPDATE users SET tenant_role = "viewer" WHERE tenant_role = ? AND tenant_id = ?', [$role['slug'], (int) $role['tenant_id']]);
        } else {
            // Global custom role deleted by platform administrator
            Db::run('UPDATE users SET tenant_role = "viewer" WHERE tenant_role = ?', [$role['slug']]);
        }

        Db::run('DELETE FROM tenant_roles WHERE id = ?', [$id]);
        Audit::log('roles.delete', 'role', $id, ['name' => $role['name'], 'slug' => $role['slug']]);

        return Http::json($res, ['success' => true, 'reassignedTo' => 'viewer']);
    }
}
