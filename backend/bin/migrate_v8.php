<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

Dotenv\Dotenv::createImmutable(__DIR__ . '/..')->safeLoad();

$pdo = Db::pdo();

echo "Running Nuvis Flipex v8 Tenant Role Manager & Granular RBAC Permissions Migration...\n";

if (!function_exists('addColumnIfNotExistsV8')) {
    function addColumnIfNotExistsV8(\PDO $pdo, string $table, string $column, string $definition): void {
        try {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
            $stmt->execute([$table, $column]);
            if ((int) $stmt->fetchColumn() === 0) {
                $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
                echo "  + Added {$table}.{$column}\n";
            }
        } catch (\Throwable $e) {
            echo "  ! Note adding {$table}.{$column}: " . $e->getMessage() . "\n";
        }
    }
}

// 1. Create tenant_roles table
try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `tenant_roles` (
            `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            `tenant_id` BIGINT UNSIGNED NULL,
            `name` VARCHAR(80) NOT NULL,
            `slug` VARCHAR(60) NOT NULL,
            `description` VARCHAR(255) NULL,
            `is_system` TINYINT(1) NOT NULL DEFAULT 0,
            `permissions` JSON NOT NULL,
            `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_tenant_id` (`tenant_id`),
            UNIQUE KEY `uk_tenant_slug` (`tenant_id`, `slug`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");
    echo "  + Created table tenant_roles\n";
} catch (\Throwable $e) {
    echo "  ! Note creating tenant_roles: " . $e->getMessage() . "\n";
}

// 2. Add custom_permissions to users table
addColumnIfNotExistsV8($pdo, 'users', 'custom_permissions', 'JSON NULL AFTER `tenant_role`');

// 3. Relax users.tenant_role to VARCHAR(60) so custom roles can be assigned
try {
    $pdo->exec("ALTER TABLE `users` MODIFY COLUMN `tenant_role` VARCHAR(60) NOT NULL DEFAULT 'editor'");
    echo "  + Converted users.tenant_role to VARCHAR(60) for dynamic role support\n";
} catch (\Throwable $e) {
    echo "  ! Note modifying users.tenant_role: " . $e->getMessage() . "\n";
}

// 4. Seed Standard System Roles into tenant_roles (if not already seeded)
$standardRoles = [
    [
        'name' => 'Tenant Owner',
        'slug' => 'owner',
        'description' => 'Full administrative, financial, and operational authority over the tenant workspace, publications, and team.',
        'permissions' => [
            'flipbook.view', 'flipbook.create', 'flipbook.edit', 'flipbook.publish', 'flipbook.delete', 'hotspot.manage', 'erp.publish',
            'analytics.view',
            'users.view', 'users.invite', 'users.manage', 'roles.manage',
            'settings.view', 'settings.manage',
            'api_keys.manage', 'webhooks.manage',
            'billing.view', 'billing.manage', 'billing.reconcile',
            'devops.overview', 'devops.jobs', 'devops.backup_request', 'devops.backup_recovery',
            'tenant.delete'
        ],
    ],
    [
        'name' => 'Tenant Administrator',
        'slug' => 'admin',
        'description' => 'Workspace administrator managing publications, hotspots, team members, integrations, and workspace settings.',
        'permissions' => [
            'flipbook.view', 'flipbook.create', 'flipbook.edit', 'flipbook.publish', 'flipbook.delete', 'hotspot.manage', 'erp.publish',
            'analytics.view',
            'users.view', 'users.invite', 'users.manage', 'roles.manage',
            'settings.view', 'settings.manage',
            'api_keys.manage', 'webhooks.manage',
            'billing.view',
            'devops.overview', 'devops.jobs'
        ],
    ],
    [
        'name' => 'Content Editor',
        'slug' => 'editor',
        'description' => 'Creates, customizes, and publishes flipbooks and hotspots. Restricted from deleting publications, billing, devops, and tenant settings.',
        'permissions' => [
            'flipbook.view', 'flipbook.create', 'flipbook.edit', 'flipbook.publish', 'hotspot.manage',
            'analytics.view'
        ],
    ],
    [
        'name' => 'Viewer / Reader',
        'slug' => 'viewer',
        'description' => 'Read-only access to view publications, search content, and view basic engagement analytics.',
        'permissions' => [
            'flipbook.view',
            'analytics.view'
        ],
    ],
    [
        'name' => 'Billing & Finance Manager',
        'slug' => 'finance',
        'description' => 'Manages company billing, subscription invoices, payment submissions, and Fiji bank transfer reconciliations.',
        'permissions' => [
            'billing.view', 'billing.manage', 'billing.reconcile',
            'flipbook.view',
            'analytics.view'
        ],
    ],
];

foreach ($standardRoles as $r) {
    try {
        $stmt = $pdo->prepare("SELECT id FROM tenant_roles WHERE tenant_id IS NULL AND slug = ?");
        $stmt->execute([$r['slug']]);
        if (!$stmt->fetch()) {
            $ins = $pdo->prepare("
                INSERT INTO tenant_roles (tenant_id, name, slug, description, is_system, permissions)
                VALUES (NULL, ?, ?, ?, 1, ?)
            ");
            $ins->execute([
                $r['name'],
                $r['slug'],
                $r['description'],
                json_encode($r['permissions'], JSON_UNESCAPED_SLASHES),
            ]);
            echo "  + Seeded standard system role: {$r['name']} ({$r['slug']})\n";
        }
    } catch (\Throwable $e) {
        echo "  ! Note seeding role {$r['slug']}: " . $e->getMessage() . "\n";
    }
}

// 5. Track in schema_migrations
try {
    $ver = '2026_11_16_000008_tenant_roles_and_granular_rbac';
    $desc = 'Dynamic tenant_roles, custom_permissions on users, and granular RBAC role manager';
    $chk = $pdo->prepare("SELECT COUNT(*) FROM schema_migrations WHERE version = ?");
    $chk->execute([$ver]);
    if ((int) $chk->fetchColumn() === 0) {
        $ins = $pdo->prepare("INSERT INTO schema_migrations (version, description, batch, checksum, applied_at) VALUES (?, ?, 8, ?, NOW())");
        $ins->execute([$ver, $desc, hash('sha256', $ver . $desc)]);
        echo "  + Recorded in schema_migrations table\n";
    }
} catch (\Throwable $e) {
    echo "  ! Note recording migration: " . $e->getMessage() . "\n";
}

echo "Nuvis Flipex v8 migration completed successfully.\n";
