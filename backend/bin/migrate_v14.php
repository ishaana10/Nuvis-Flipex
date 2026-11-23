<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

echo "Running Migration v14: Flipex Branded URLs, Strict Slug Resolution & Publisher Identity...\n";

try {
    $pdo = Db::pdo();

    // 1. Slug History & Redirects Table
    echo "  -> Ensuring slug_redirects table...\n";
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS `slug_redirects` (
          `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          `entity_type` ENUM('tenant','flipbook') NOT NULL,
          `entity_id` BIGINT UNSIGNED NOT NULL,
          `tenant_id` BIGINT UNSIGNED NULL,
          `old_slug` VARCHAR(120) NOT NULL,
          `new_slug` VARCHAR(120) NOT NULL,
          `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX `idx_redirect_lookup` (`entity_type`, `old_slug`),
          INDEX `idx_redirect_entity` (`entity_type`, `entity_id`),
          INDEX `idx_redirect_tenant_old` (`entity_type`, `tenant_id`, `old_slug`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");

    // Helper to check column existence safely
    $checkColumn = function (string $table, string $column) use ($pdo): bool {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM `{$table}` LIKE ?");
        $stmt->execute([$column]);
        return (bool) $stmt->fetch();
    };

    // Helper to check index existence safely
    $checkIndex = function (string $table, string $indexName) use ($pdo): bool {
        $stmt = $pdo->prepare("SHOW INDEX FROM `{$table}` WHERE Key_name = ?");
        $stmt->execute([$indexName]);
        return (bool) $stmt->fetch();
    };

    // 2. Extend tenants table
    echo "  -> Checking tenants table columns...\n";
    $tenantColumns = [
        'display_name' => "ALTER TABLE `tenants` ADD COLUMN `display_name` VARCHAR(150) NULL AFTER `name`",
        'slug_updated_at' => "ALTER TABLE `tenants` ADD COLUMN `slug_updated_at` DATETIME NULL AFTER `slug`",
        'public_profile_enabled' => "ALTER TABLE `tenants` ADD COLUMN `public_profile_enabled` TINYINT(1) NOT NULL DEFAULT 1",
        'custom_domain' => "ALTER TABLE `tenants` ADD COLUMN `custom_domain` VARCHAR(255) NULL",
        'custom_domain_verified' => "ALTER TABLE `tenants` ADD COLUMN `custom_domain_verified` TINYINT(1) NOT NULL DEFAULT 0",
        'custom_domain_txt' => "ALTER TABLE `tenants` ADD COLUMN `custom_domain_txt` VARCHAR(120) NULL",
    ];

    foreach ($tenantColumns as $col => $sql) {
        if (!$checkColumn('tenants', $col)) {
            $pdo->exec($sql);
            echo "     + Added column {$col} to tenants\n";
        }
    }

    // 3. Extend flipbooks table
    echo "  -> Checking flipbooks table columns...\n";
    $flipbookColumns = [
        'public_slug' => "ALTER TABLE `flipbooks` ADD COLUMN `public_slug` VARCHAR(120) NULL AFTER `slug`",
        'canonical_url' => "ALTER TABLE `flipbooks` ADD COLUMN `canonical_url` VARCHAR(255) NULL",
        'slug_updated_at' => "ALTER TABLE `flipbooks` ADD COLUMN `slug_updated_at` DATETIME NULL",
    ];

    foreach ($flipbookColumns as $col => $sql) {
        if (!$checkColumn('flipbooks', $col)) {
            $pdo->exec($sql);
            echo "     + Added column {$col} to flipbooks\n";
        }
    }

    // Unique index on flipbooks (tenant_id, public_slug)
    if (!$checkIndex('flipbooks', 'uq_fb_tenant_public_slug')) {
        try {
            $pdo->exec("CREATE UNIQUE INDEX `uq_fb_tenant_public_slug` ON `flipbooks` (`tenant_id`, `public_slug`)");
            echo "     + Created unique index uq_fb_tenant_public_slug on flipbooks\n";
        } catch (\Throwable $e) {
            echo "     * Notice on uq_fb_tenant_public_slug: " . $e->getMessage() . "\n";
        }
    }

    // 4. Extend tenant_storefronts table
    echo "  -> Checking tenant_storefronts table columns...\n";
    $storefrontColumns = [
        'theme_primary' => "ALTER TABLE `tenant_storefronts` ADD COLUMN `theme_primary` VARCHAR(9) NULL DEFAULT '#0b3a6e'",
        'theme_secondary' => "ALTER TABLE `tenant_storefronts` ADD COLUMN `theme_secondary` VARCHAR(9) NULL DEFAULT '#1d6fb8'",
    ];

    foreach ($storefrontColumns as $col => $sql) {
        if (!$checkColumn('tenant_storefronts', $col)) {
            $pdo->exec($sql);
            echo "     + Added column {$col} to tenant_storefronts\n";
        }
    }

    // 5. Backfill existing records
    echo "  -> Backfilling data...\n";
    $pdo->exec("UPDATE tenants SET display_name = TRIM(REPLACE(name, ' Workspace', '')) WHERE display_name IS NULL OR display_name = ''");
    $pdo->exec("UPDATE flipbooks SET public_slug = slug WHERE public_slug IS NULL OR public_slug = ''");
    $pdo->exec("
        UPDATE flipbooks f
        JOIN tenants t ON f.tenant_id = t.id
        SET f.canonical_url = CONCAT('/', t.slug, '/docs/', COALESCE(NULLIF(f.public_slug, ''), f.slug))
        WHERE f.canonical_url IS NULL OR f.canonical_url = ''
    ");

    echo "Migration v14 completed successfully!\n";
} catch (\Throwable $e) {
    echo "Migration v14 error: " . $e->getMessage() . "\n";
    exit(1);
}
