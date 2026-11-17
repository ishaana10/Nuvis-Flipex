<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use App\Support\Db;

echo "Running Migration v11: Educational Publishing, Institutional Workspaces & Classroom Resources...\n";

$sql = "
CREATE TABLE IF NOT EXISTS `educational_profiles` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT UNSIGNED NOT NULL UNIQUE,
  `institution_name` VARCHAR(200) NOT NULL,
  `motto` VARCHAR(255) NULL,
  `academic_year` VARCHAR(50) NOT NULL DEFAULT '2026-2027',
  `institution_type` ENUM('primary','secondary','tertiary','college','vocational','publisher') NOT NULL DEFAULT 'secondary',
  `principal_name` VARCHAR(150) NULL,
  `campus_address` TEXT NULL,
  `contact_email` VARCHAR(190) NULL,
  `contact_phone` VARCHAR(50) NULL,
  `allowed_email_domains` TEXT NULL,
  `crest_url` VARCHAR(500) NULL,
  `banner_url` VARCHAR(500) NULL,
  `portal_slug` VARCHAR(100) NULL UNIQUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_edu_tenant` (`tenant_id`),
  INDEX `idx_edu_portal` (`portal_slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `educational_resources` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `flipbook_id` BIGINT UNSIGNED NOT NULL,
  `page_number` INT NULL,
  `title` VARCHAR(200) NOT NULL,
  `resource_type` ENUM('worksheet','syllabus','exam_paper','solution_guide','audio_lesson','external_link') NOT NULL DEFAULT 'worksheet',
  `file_url` VARCHAR(500) NULL,
  `external_url` VARCHAR(500) NULL,
  `description` TEXT NULL,
  `download_count` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_edu_res_tenant` (`tenant_id`),
  INDEX `idx_edu_res_flipbook` (`flipbook_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `educational_annotations` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `flipbook_id` BIGINT UNSIGNED NOT NULL,
  `page_number` INT NOT NULL,
  `student_name` VARCHAR(120) NOT NULL,
  `student_identifier` VARCHAR(150) NOT NULL,
  `annotation_type` ENUM('note','highlight','bookmark') NOT NULL DEFAULT 'note',
  `color` VARCHAR(30) NOT NULL DEFAULT '#fef08a',
  `note_text` TEXT NULL,
  `rect_data` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_annotations_flipbook` (`flipbook_id`, `page_number`),
  INDEX `idx_annotations_student` (`student_identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
";

try {
    $statements = array_filter(array_map('trim', explode(';', $sql)));
    foreach ($statements as $stmt) {
        if ($stmt !== '') {
            Db::pdo()->exec($stmt);
        }
    }
    echo "Migration v11 completed successfully.\n";
} catch (\Throwable $e) {
    echo "Migration v11 error: " . $e->getMessage() . "\n";
    exit(1);
}
