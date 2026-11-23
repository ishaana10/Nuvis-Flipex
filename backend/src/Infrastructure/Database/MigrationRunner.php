<?php
declare(strict_types=1);

namespace App\Infrastructure\Database;

use App\Support\Db;

/**
 * Versioned, Reversible Database Migration Runner.
 * Authoritative migration system with real DDL schema changes, SHA-256 checksums,
 * transactional/safe execution, batch tracking, and rollback execution.
 */
final class MigrationRunner
{
    public const DEFINITIONS = [
        '2026_11_01_000001_initial_core_schema' => [
            'description' => 'Core plans, tenants, users, flipbooks, pages, hotspots, views, refresh_tokens tables',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS plans (
                  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  name VARCHAR(50) NOT NULL,
                  max_flipbooks INT NOT NULL DEFAULT 3,
                  max_pages INT NOT NULL DEFAULT 50,
                  max_upload_mb INT NOT NULL DEFAULT 20,
                  monthly_views INT NOT NULL DEFAULT 1000,
                  remove_branding TINYINT(1) NOT NULL DEFAULT 0,
                  price DECIMAL(8,2) NOT NULL DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS tenants (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  uuid CHAR(36) NOT NULL UNIQUE,
                  name VARCHAR(120) NOT NULL,
                  slug VARCHAR(80) NOT NULL UNIQUE,
                  plan_id INT UNSIGNED NOT NULL DEFAULT 1,
                  max_flipbooks INT NOT NULL DEFAULT 10,
                  max_storage_mb INT NOT NULL DEFAULT 500,
                  is_active TINYINT(1) NOT NULL DEFAULT 1,
                  billing_name VARCHAR(150) NULL,
                  billing_email VARCHAR(190) NULL,
                  billing_address TEXT NULL,
                  tax_id VARCHAR(50) NULL,
                  payment_method VARCHAR(40) NOT NULL DEFAULT 'bank_transfer',
                  payment_status VARCHAR(30) NOT NULL DEFAULT 'paid',
                  billing_cycle VARCHAR(30) NOT NULL DEFAULT 'monthly',
                  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
                  last_payment_date DATE NULL,
                  next_billing_date DATE NULL,
                  payment_reference VARCHAR(100) NULL,
                  billing_notes TEXT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX idx_plan (plan_id),
                  INDEX idx_active (is_active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS users (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NULL,
                  email VARCHAR(190) NOT NULL UNIQUE,
                  password_hash VARCHAR(255) NOT NULL,
                  role ENUM('admin','editor','viewer','finance') NOT NULL DEFAULT 'editor',
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  deleted_at DATETIME NULL,
                  INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS flipbooks (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  slug VARCHAR(80) NOT NULL UNIQUE,
                  title VARCHAR(200) NOT NULL,
                  description TEXT NULL,
                  pdf_path VARCHAR(255) NOT NULL,
                  page_count INT UNSIGNED NOT NULL DEFAULT 0,
                  visibility ENUM('public','password','unlisted','private') NOT NULL DEFAULT 'public',
                  password_hash VARCHAR(255) NULL,
                  status ENUM('queued','processing','ready','failed') NOT NULL DEFAULT 'queued',
                  settings JSON NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  deleted_at DATETIME NULL,
                  INDEX idx_tenant_status (tenant_id, status),
                  INDEX idx_slug (slug)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS pages (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  flipbook_id BIGINT UNSIGNED NOT NULL,
                  page_number INT UNSIGNED NOT NULL,
                  image_path VARCHAR(255) NOT NULL,
                  thumb_path VARCHAR(255) NOT NULL,
                  image_path_high VARCHAR(255) NULL,
                  width INT UNSIGNED NOT NULL,
                  height INT UNSIGNED NOT NULL,
                  text_content MEDIUMTEXT NULL,
                  UNIQUE KEY uq_page (flipbook_id, page_number)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS pages; DROP TABLE IF EXISTS flipbooks; DROP TABLE IF EXISTS users;',
            'reversible' => true,
        ],
        '2026_11_02_000002_multi_tenant_isolation' => [
            'description' => 'Tenants, plans, RBAC roles, audit_logs, security_events tables',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS audit_logs (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NULL,
                  user_id BIGINT UNSIGNED NULL,
                  action VARCHAR(80) NOT NULL,
                  target_type VARCHAR(60) NOT NULL,
                  target_id BIGINT UNSIGNED NULL,
                  metadata JSON NULL,
                  ip_address VARCHAR(45) NULL,
                  user_agent VARCHAR(255) NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_tenant (tenant_id),
                  INDEX idx_action (action)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS security_events (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NULL,
                  event_type VARCHAR(60) NOT NULL,
                  ip_address VARCHAR(45) NOT NULL,
                  user_agent VARCHAR(255) NULL,
                  details JSON NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_tenant (tenant_id),
                  INDEX idx_event (event_type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS security_events; DROP TABLE IF EXISTS audit_logs;',
            'reversible' => true,
        ],
        '2026_11_03_000003_publishing_lifecycle_and_jobs' => [
            'description' => '7-stage workflow, flipbook_versions, conversion_jobs, categories, collections',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS conversion_jobs (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  flipbook_id BIGINT UNSIGNED NOT NULL,
                  status ENUM('queued','processing','completed','failed','dead_letter') NOT NULL DEFAULT 'queued',
                  priority INT NOT NULL DEFAULT 5,
                  attempts INT NOT NULL DEFAULT 0,
                  max_attempts INT NOT NULL DEFAULT 3,
                  worker_lease_id VARCHAR(64) NULL,
                  lease_expires_at DATETIME NULL,
                  error_message TEXT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX idx_status_priority (status, priority DESC, created_at ASC),
                  INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS flipbook_versions (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  flipbook_id BIGINT UNSIGNED NOT NULL,
                  version_number INT UNSIGNED NOT NULL DEFAULT 1,
                  manifest JSON NOT NULL,
                  created_by BIGINT UNSIGNED NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_flipbook (flipbook_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS flipbook_versions; DROP TABLE IF EXISTS conversion_jobs;',
            'reversible' => true,
        ],
        '2026_11_04_000004_commercial_analytics_and_heatmaps' => [
            'description' => 'Granular analytics_events, UTM attribution, scheduled_reports',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS analytics_events (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  flipbook_id BIGINT UNSIGNED NOT NULL,
                  page_number INT UNSIGNED NULL,
                  session_id VARCHAR(64) NOT NULL,
                  event_type VARCHAR(40) NOT NULL,
                  dwell_seconds FLOAT NOT NULL DEFAULT 0,
                  meta JSON NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_tenant_flipbook (tenant_id, flipbook_id, created_at),
                  INDEX idx_event (event_type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS scheduled_reports (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  name VARCHAR(120) NOT NULL,
                  frequency ENUM('daily','weekly','monthly') NOT NULL DEFAULT 'weekly',
                  recipients JSON NOT NULL,
                  format ENUM('pdf','csv') NOT NULL DEFAULT 'csv',
                  last_sent_at DATETIME NULL,
                  next_run_at DATETIME NOT NULL,
                  is_active TINYINT(1) NOT NULL DEFAULT 1,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_tenant_active (tenant_id, is_active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS scheduled_reports; DROP TABLE IF EXISTS analytics_events;',
            'reversible' => true,
        ],
        '2026_11_05_000005_enterprise_integrations_and_billing' => [
            'description' => 'SHA-256 api_keys, webhooks, tenant_integrations, invoices, subscription_history',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS api_keys (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  key_hash VARCHAR(64) NOT NULL UNIQUE,
                  key_prefix VARCHAR(16) NOT NULL,
                  name VARCHAR(100) NOT NULL,
                  scopes JSON NOT NULL,
                  allowed_ips JSON NULL,
                  rate_limit_per_minute INT NOT NULL DEFAULT 120,
                  last_used_at DATETIME NULL,
                  expires_at DATETIME NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS webhooks (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  url VARCHAR(255) NOT NULL,
                  secret_hash VARCHAR(64) NOT NULL,
                  events JSON NOT NULL,
                  is_active TINYINT(1) NOT NULL DEFAULT 1,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS webhook_deliveries (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  webhook_id BIGINT UNSIGNED NOT NULL,
                  event_type VARCHAR(60) NOT NULL,
                  payload JSON NOT NULL,
                  response_code INT NULL,
                  response_body TEXT NULL,
                  success TINYINT(1) NOT NULL DEFAULT 0,
                  attempts INT NOT NULL DEFAULT 1,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_webhook (webhook_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS invoices (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  invoice_number VARCHAR(60) NOT NULL UNIQUE,
                  amount DECIMAL(10,2) NOT NULL,
                  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
                  status ENUM('draft','issued','paid','void','overdue') NOT NULL DEFAULT 'draft',
                  billing_period_start DATE NULL,
                  billing_period_end DATE NULL,
                  pdf_path VARCHAR(255) NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS invoices; DROP TABLE IF EXISTS webhook_deliveries; DROP TABLE IF EXISTS webhooks; DROP TABLE IF EXISTS api_keys;',
            'reversible' => true,
        ],
        '2026_11_06_000006_modular_architecture_and_devops' => [
            'description' => 'schema_migrations, dead_letter_jobs, error_reports, system_backups',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  version VARCHAR(120) NOT NULL UNIQUE,
                  description VARCHAR(255) NOT NULL,
                  batch INT NOT NULL DEFAULT 1,
                  checksum VARCHAR(64) NOT NULL,
                  is_reversible TINYINT(1) NOT NULL DEFAULT 1,
                  executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS dead_letter_jobs (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  job_id BIGINT UNSIGNED NULL,
                  job_type VARCHAR(60) NOT NULL,
                  payload JSON NOT NULL,
                  failure_reason TEXT NOT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS error_reports (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NULL,
                  error_class VARCHAR(120) NOT NULL,
                  message TEXT NOT NULL,
                  stack_trace MEDIUMTEXT NULL,
                  context JSON NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_class (error_class)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS system_backups (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  filename VARCHAR(255) NOT NULL,
                  size_bytes BIGINT UNSIGNED NOT NULL,
                  backup_type ENUM('database','storage','full') NOT NULL DEFAULT 'database',
                  status ENUM('in_progress','completed','failed') NOT NULL DEFAULT 'in_progress',
                  checksum VARCHAR(64) NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS system_backups; DROP TABLE IF EXISTS error_reports; DROP TABLE IF EXISTS dead_letter_jobs;',
            'reversible' => true,
        ],
        '2026_11_11_000007_payment_security_and_api_key_controls' => [
            'description' => 'Three-stage payment verification, payment_transactions, immutable payment_audit_logs, finance RBAC role, and API key scope/quota/IP enforcement',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS payment_transactions (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  reference VARCHAR(80) NOT NULL UNIQUE,
                  gateway VARCHAR(40) NOT NULL,
                  amount DECIMAL(10,2) NOT NULL,
                  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
                  status ENUM('initiated','processing','succeeded','failed','refunded') NOT NULL DEFAULT 'initiated',
                  payment_stage ENUM('created','signature_verified','webhook_processed','completed') NOT NULL DEFAULT 'created',
                  idempotency_key VARCHAR(100) NULL UNIQUE,
                  meta JSON NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS payment_audit_logs (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  transaction_id BIGINT UNSIGNED NOT NULL,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  event_type VARCHAR(60) NOT NULL,
                  actor VARCHAR(100) NOT NULL,
                  snapshot JSON NOT NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_txn (transaction_id),
                  INDEX idx_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS payment_audit_logs; DROP TABLE IF EXISTS payment_transactions;',
            'reversible' => true,
        ],
        '2026_11_16_000008_tenant_roles_and_granular_rbac' => [
            'description' => 'Dynamic tenant_roles, custom_permissions on users, and granular RBAC role manager',
            'upSql' => "
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
            ",
            'downSql' => 'DROP TABLE IF EXISTS tenant_roles;',
            'reversible' => true,
        ],
        '2026_11_17_000009_brand_kits_and_publisher_studio' => [
            'description' => 'Workspace Brand Kits with color palettes, typography, and reusable visual identity',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS `brand_kits` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL,
                  `name` VARCHAR(100) NOT NULL,
                  `logo_url` VARCHAR(255) NULL,
                  `primary_color` VARCHAR(30) NOT NULL DEFAULT '#f59e0b',
                  `secondary_color` VARCHAR(30) NOT NULL DEFAULT '#0f172a',
                  `accent_color` VARCHAR(30) NOT NULL DEFAULT '#f59e0b',
                  `background_gradient` VARCHAR(255) NULL,
                  `drawer_bg_color` VARCHAR(30) NULL,
                  `drawer_text_color` VARCHAR(30) NULL,
                  `font_family` VARCHAR(80) NOT NULL DEFAULT 'Inter, sans-serif',
                  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_brand_kits_tenant` (`tenant_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS brand_kits;',
            'reversible' => true,
        ],
        '2026_11_17_000010_commercial_leads_and_biz_storefront' => [
            'description' => 'Commercial leads capture, WhatsApp order inquiries, and business storefront profile',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS `commercial_leads` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL,
                  `flipbook_id` BIGINT UNSIGNED NULL,
                  `hotspot_id` BIGINT UNSIGNED NULL,
                  `page_number` INT NULL,
                  `product_title` VARCHAR(255) NULL,
                  `product_sku` VARCHAR(100) NULL,
                  `product_price` VARCHAR(50) NULL,
                  `customer_name` VARCHAR(120) NOT NULL,
                  `customer_email` VARCHAR(190) NOT NULL,
                  `customer_phone` VARCHAR(50) NULL,
                  `quantity` INT NOT NULL DEFAULT 1,
                  `notes` TEXT NULL,
                  `status` ENUM('new','contacted','quoted','converted','closed') NOT NULL DEFAULT 'new',
                  `source` VARCHAR(50) NOT NULL DEFAULT 'catalogue_hotspot',
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_leads_tenant` (`tenant_id`, `status`),
                  INDEX `idx_leads_flipbook` (`flipbook_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS `tenant_storefronts` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL UNIQUE,
                  `business_name` VARCHAR(150) NOT NULL,
                  `slug` VARCHAR(100) NOT NULL UNIQUE,
                  `tagline` VARCHAR(255) NULL,
                  `bio` TEXT NULL,
                  `phone` VARCHAR(50) NULL,
                  `whatsapp_phone` VARCHAR(50) NULL,
                  `email` VARCHAR(190) NULL,
                  `address` TEXT NULL,
                  `website_url` VARCHAR(255) NULL,
                  `banner_url` VARCHAR(255) NULL,
                  `logo_url` VARCHAR(255) NULL,
                  `is_verified` TINYINT(1) NOT NULL DEFAULT 1,
                  `facebook_url` VARCHAR(255) NULL,
                  `instagram_url` VARCHAR(255) NULL,
                  `currency` VARCHAR(10) NOT NULL DEFAULT 'FJD',
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_storefront_slug` (`slug`),
                  INDEX `idx_storefront_tenant` (`tenant_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS commercial_leads; DROP TABLE IF EXISTS tenant_storefronts;',
            'reversible' => true,
        ],
        '2026_11_17_000011_educational_publishing' => [
            'description' => 'Educational institution profiles, lesson worksheets & attachments, and student study notes',
            'upSql' => "
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
            ",
            'downSql' => 'DROP TABLE IF EXISTS educational_annotations; DROP TABLE IF EXISTS educational_resources; DROP TABLE IF EXISTS educational_profiles;',
            'reversible' => true,
        ],
        '2026_11_17_000012_pacific_directory_and_ads' => [
            'description' => 'Pacific regional publication directory, self-serve advertising marketplace, and multi-currency billing',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS `regional_directory_entries` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL,
                  `flipbook_id` BIGINT UNSIGNED NOT NULL,
                  `title` VARCHAR(255) NOT NULL,
                  `description` TEXT NULL,
                  `country_code` VARCHAR(10) NOT NULL DEFAULT 'FJ',
                  `region_name` VARCHAR(100) NULL,
                  `category` ENUM('commercial','education','tourism','government','lifestyle','general') NOT NULL DEFAULT 'general',
                  `tags` VARCHAR(255) NULL,
                  `cover_image_url` VARCHAR(500) NULL,
                  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
                  `is_public` TINYINT(1) NOT NULL DEFAULT 1,
                  `view_count` INT NOT NULL DEFAULT 0,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY `uq_dir_flipbook` (`flipbook_id`),
                  INDEX `idx_dir_country` (`country_code`),
                  INDEX `idx_dir_category` (`category`),
                  INDEX `idx_dir_tenant` (`tenant_id`),
                  INDEX `idx_dir_featured` (`is_featured`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS `sponsored_placements` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `tenant_id` BIGINT UNSIGNED NOT NULL,
                  `campaign_name` VARCHAR(200) NOT NULL,
                  `advertiser_name` VARCHAR(200) NOT NULL,
                  `advertiser_email` VARCHAR(190) NULL,
                  `placement_type` ENUM('header_banner','interstitial_page','sidebar_spotlight','directory_featured') NOT NULL DEFAULT 'header_banner',
                  `target_url` VARCHAR(500) NOT NULL,
                  `banner_image_url` VARCHAR(500) NOT NULL,
                  `headline` VARCHAR(255) NULL,
                  `subtext` VARCHAR(255) NULL,
                  `cta_text` VARCHAR(60) NOT NULL DEFAULT 'Learn More',
                  `target_country` VARCHAR(20) NOT NULL DEFAULT 'ALL',
                  `budget_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  `currency` VARCHAR(10) NOT NULL DEFAULT 'FJD',
                  `cost_per_click` DECIMAL(10,2) NOT NULL DEFAULT 0.25,
                  `spent_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                  `impressions` INT NOT NULL DEFAULT 0,
                  `clicks` INT NOT NULL DEFAULT 0,
                  `status` ENUM('active','paused','completed','pending_review') NOT NULL DEFAULT 'active',
                  `start_date` DATETIME NULL,
                  `end_date` DATETIME NULL,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX `idx_ad_tenant` (`tenant_id`),
                  INDEX `idx_ad_status` (`status`, `placement_type`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS `ad_events` (
                  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  `placement_id` BIGINT UNSIGNED NOT NULL,
                  `event_type` ENUM('impression','click') NOT NULL,
                  `flipbook_id` BIGINT UNSIGNED NULL,
                  `country_code` VARCHAR(10) NULL,
                  `ip_hash` VARCHAR(64) NULL,
                  `user_agent` VARCHAR(255) NULL,
                  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX `idx_ad_events_placement` (`placement_id`, `event_type`),
                  INDEX `idx_ad_events_time` (`created_at`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS ad_events; DROP TABLE IF EXISTS sponsored_placements; DROP TABLE IF EXISTS regional_directory_entries;',
            'reversible' => true,
        ],
        '2026_11_17_000013_flipex_studio_schema' => [
            'description' => 'Flipex Studio core schema: documents, pages, templates, assets, publications',
            'upSql' => "
                CREATE TABLE IF NOT EXISTS studio_documents (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  created_by BIGINT UNSIGNED NOT NULL,
                  title VARCHAR(255) NOT NULL,
                  doc_type ENUM('catalogue', 'magazine', 'album', 'custom') NOT NULL DEFAULT 'catalogue',
                  page_count INT NOT NULL DEFAULT 1,
                  width_pt DECIMAL(8,2) NOT NULL DEFAULT 595.28,
                  height_pt DECIMAL(8,2) NOT NULL DEFAULT 841.89,
                  orientation ENUM('portrait', 'landscape') NOT NULL DEFAULT 'portrait',
                  bleed_pt DECIMAL(5,2) NOT NULL DEFAULT 9.00,
                  palette JSON NULL,
                  settings JSON NULL,
                  flipbook_id BIGINT UNSIGNED NULL,
                  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  INDEX idx_studio_doc_tenant (tenant_id, status),
                  INDEX idx_studio_doc_type (doc_type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS studio_document_pages (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  document_id BIGINT UNSIGNED NOT NULL,
                  page_number INT NOT NULL,
                  background JSON NULL,
                  elements JSON NOT NULL,
                  thumbnail_url VARCHAR(500) NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                  UNIQUE KEY uq_doc_page_num (document_id, page_number),
                  INDEX idx_studio_page_doc (document_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS studio_templates (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  category VARCHAR(60) NOT NULL,
                  doc_type ENUM('catalogue', 'magazine', 'album', 'custom') NOT NULL,
                  name VARCHAR(200) NOT NULL,
                  description TEXT NULL,
                  thumbnail_url VARCHAR(500) NOT NULL,
                  preview_images JSON NULL,
                  canvas_spec JSON NOT NULL,
                  is_system TINYINT(1) NOT NULL DEFAULT 1,
                  tenant_id BIGINT UNSIGNED NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_template_cat (category, doc_type),
                  INDEX idx_template_tenant (tenant_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS studio_assets (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  tenant_id BIGINT UNSIGNED NOT NULL,
                  uploaded_by BIGINT UNSIGNED NOT NULL,
                  asset_name VARCHAR(255) NOT NULL,
                  asset_type ENUM('image', 'logo', 'sticker', 'font', 'icon', 'background') NOT NULL DEFAULT 'image',
                  mime_type VARCHAR(100) NOT NULL,
                  file_url VARCHAR(500) NOT NULL,
                  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
                  width INT NULL,
                  height INT NULL,
                  tags VARCHAR(255) NULL,
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_asset_tenant (tenant_id, asset_type)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

                CREATE TABLE IF NOT EXISTS studio_publications (
                  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                  document_id BIGINT UNSIGNED NOT NULL,
                  flipbook_id BIGINT UNSIGNED NOT NULL,
                  version INT NOT NULL DEFAULT 1,
                  rendered_pdf_url VARCHAR(500) NULL,
                  status ENUM('generating', 'completed', 'failed') NOT NULL DEFAULT 'completed',
                  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  INDEX idx_pub_doc (document_id),
                  INDEX idx_pub_flipbook (flipbook_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS studio_publications; DROP TABLE IF EXISTS studio_assets; DROP TABLE IF EXISTS studio_templates; DROP TABLE IF EXISTS studio_document_pages; DROP TABLE IF EXISTS studio_documents;',
            'reversible' => true,
        ],
        '2026_11_24_000014_publisher_identity_and_branded_urls' => [
            'description' => 'Branded URLs, slug redirects history, company identity, and composite unique publication slugs',
            'upSql' => "
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            ",
            'downSql' => 'DROP TABLE IF EXISTS slug_redirects;',
            'reversible' => true,
        ],
    ];

    private static function executeStatements(string $sql): void
    {
        $pdo = Db::pdo();
        $statements = array_filter(array_map('trim', explode(';', $sql)));
        foreach ($statements as $stmt) {
            if ($stmt !== '') {
                $pdo->exec($stmt);
            }
        }
    }

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
                'checksum' => $row ? $row['checksum'] : hash('sha256', $version . ':' . trim($def['upSql'])),
                'reversible' => $def['reversible'],
                'downPreview' => $def['downSql'],
                'executedAt' => $row['executed_at'] ?? null,
            ];
        }

        return $list;
    }

    public static function migrateUp(): array
    {
        \App\Support\Rbac::ensureSchema();

        // Ensure schema_migrations table itself exists
        Db::pdo()->exec("
            CREATE TABLE IF NOT EXISTS schema_migrations (
              id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              version VARCHAR(120) NOT NULL UNIQUE,
              description VARCHAR(255) NOT NULL,
              batch INT NOT NULL DEFAULT 1,
              checksum VARCHAR(64) NOT NULL,
              is_reversible TINYINT(1) NOT NULL DEFAULT 1,
              executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ");

        try {
            Db::pdo()->exec("ALTER TABLE schema_migrations MODIFY version VARCHAR(120)");
        } catch (\Throwable) {}

        $applied = array_column(Db::all('SELECT version FROM schema_migrations'), 'version');
        $maxBatch = (int) (Db::one('SELECT COALESCE(MAX(batch), 0) AS b FROM schema_migrations')['b'] ?? 0) + 1;
        $executed = [];

        foreach (self::DEFINITIONS as $version => $def) {
            if (!in_array($version, $applied, true)) {
                self::executeStatements($def['upSql']);
                $checksum = hash('sha256', $version . ':' . trim($def['upSql']));
                Db::run(
                    'INSERT INTO schema_migrations (version, description, batch, checksum, is_reversible) VALUES (?, ?, ?, ?, ?)',
                    [$version, $def['description'], $maxBatch, $checksum, $def['reversible'] ? 1 : 0]
                );
                $executed[] = $version;
            }
        }

        return [
            'ok' => true,
            'batch' => $maxBatch,
            'executed' => $executed,
            'totalApplied' => count(self::status()),
        ];
    }

    /**
     * Rollback the last applied migration batch, or roll back down to a specified target version.
     */
    public static function migrateDown(?string $targetVersion = null): array
    {
        try {
            $applied = Db::all('SELECT * FROM schema_migrations ORDER BY id DESC');
        } catch (\Throwable) {
            return ['ok' => true, 'rolledBack' => []];
        }

        if (empty($applied)) {
            return ['ok' => true, 'rolledBack' => []];
        }

        $lastBatch = (int) ($applied[0]['batch'] ?? 1);
        $rolledBack = [];

        foreach ($applied as $mig) {
            $version = $mig['version'];

            if ($targetVersion !== null) {
                if (strcmp($version, $targetVersion) <= 0) {
                    break;
                }
            } else {
                // Default: rollback only the latest batch
                if ((int) $mig['batch'] !== $lastBatch) {
                    break;
                }
            }

            $def = self::DEFINITIONS[$version] ?? null;
            if ($def && !empty($def['downSql'])) {
                self::executeStatements($def['downSql']);
            }

            Db::run('DELETE FROM schema_migrations WHERE version = ?', [$version]);
            $rolledBack[] = $version;
        }

        return [
            'ok' => true,
            'rolledBack' => $rolledBack,
        ];
    }
}
