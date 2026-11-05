CREATE TABLE IF NOT EXISTS plans (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  max_flipbooks INT NOT NULL DEFAULT 3,
  max_pages INT NOT NULL DEFAULT 50,
  max_upload_mb INT NOT NULL DEFAULT 20,
  monthly_views INT NOT NULL DEFAULT 1000,
  remove_branding TINYINT(1) NOT NULL DEFAULT 0,
  price DECIMAL(8,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB;

INSERT INTO plans (id, name, max_flipbooks, max_pages, max_upload_mb, monthly_views, remove_branding, price)
VALUES 
  (1, 'Free', 3, 50, 20, 1000, 0, 0.00),
  (2, 'Pro', 15, 150, 50, 10000, 1, 29.00),
  (3, 'Enterprise', 100, 500, 200, 100000, 1, 99.00)
ON DUPLICATE KEY UPDATE name = VALUES(name);

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
  auto_renew TINYINT(1) NOT NULL DEFAULT 1,
  grace_period_days INT UNSIGNED NOT NULL DEFAULT 7,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  payment_gateway VARCHAR(50) NOT NULL DEFAULT 'bank_transfer_fiji',
  gateway_customer_id VARCHAR(120) NULL,
  storage_used_mb DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  bandwidth_used_mb DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  suspended_at DATETIME NULL,
  suspension_reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(120) NOT NULL,
  avatar_path VARCHAR(255) NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  tenant_role ENUM('owner','admin','editor','viewer') NOT NULL DEFAULT 'editor',
  plan_id INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',
  two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
  two_factor_method ENUM('email','totp') NOT NULL DEFAULT 'email',
  totp_secret VARCHAR(64) NULL,
  two_factor_code VARCHAR(10) NULL,
  two_factor_expires_at DATETIME NULL,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  lockout_until DATETIME NULL,
  email_verified_at DATETIME NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  INDEX (tenant_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  user_agent VARCHAR(255) NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('verify','reset') NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rate_limits (
  k VARCHAR(190) NOT NULL,
  window_start INT UNSIGNED NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (k, window_start)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS folders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  INDEX (tenant_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  description TEXT NULL,
  color VARCHAR(30) NOT NULL DEFAULT '#F5C542',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS collections (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  description TEXT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS flipbooks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  folder_id BIGINT UNSIGNED NULL,
  category_id BIGINT UNSIGNED NULL,
  collection_id BIGINT UNSIGNED NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  source_pdf_path VARCHAR(255) NULL,
  page_count INT NOT NULL DEFAULT 0,
  status ENUM('uploading','processing','ready','failed') NOT NULL DEFAULT 'uploading',
  workflow_status ENUM('draft','processing','editing','in_review','scheduled','published','archived') NOT NULL DEFAULT 'draft',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  visibility ENUM('public','unlisted','password') NOT NULL DEFAULT 'unlisted',
  password_hash VARCHAR(255) NULL,
  settings JSON NULL,
  pdf_metadata JSON NULL,
  seo_meta JSON NULL,
  toc JSON NULL,
  conversion_progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  conversion_step VARCHAR(150) NULL,
  conversion_error TEXT NULL,
  review_notes TEXT NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  scheduled_at DATETIME NULL,
  expires_at DATETIME NULL,
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (user_id),
  INDEX (workflow_status),
  INDEX (category_id),
  INDEX (collection_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS flipbook_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  flipbook_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  source_pdf_path VARCHAR(255) NOT NULL,
  page_count INT NOT NULL DEFAULT 0,
  file_size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  pdf_metadata JSON NULL,
  pages_snapshot JSON NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (flipbook_id, version_number),
  FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flipbook_id BIGINT UNSIGNED NOT NULL,
  page_number INT NOT NULL,
  image_path VARCHAR(255) NOT NULL,
  high_res_path VARCHAR(255) NULL,
  webp_path VARCHAR(255) NULL,
  avif_path VARCHAR(255) NULL,
  thumb_path VARCHAR(255) NOT NULL,
  width INT NOT NULL,
  height INT NOT NULL,
  text_content MEDIUMTEXT NULL,
  UNIQUE (flipbook_id, page_number),
  FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hotspots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flipbook_id BIGINT UNSIGNED NOT NULL,
  page_number INT NOT NULL,
  type ENUM('link','video','audio','image') NOT NULL,
  x FLOAT NOT NULL, y FLOAT NOT NULL, w FLOAT NOT NULL, h FLOAT NOT NULL,
  payload JSON NOT NULL,
  FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS views (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  flipbook_id BIGINT UNSIGNED NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  session_id VARCHAR(64) NULL,
  country CHAR(2) NULL,
  device VARCHAR(20) NULL,
  referrer VARCHAR(255) NULL,
  duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  pages_viewed INT UNSIGNED NOT NULL DEFAULT 1,
  max_page_reached INT UNSIGNED NOT NULL DEFAULT 1,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  utm_source VARCHAR(100) NULL,
  utm_medium VARCHAR(100) NULL,
  utm_campaign VARCHAR(100) NULL,
  utm_term VARCHAR(100) NULL,
  utm_content VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (flipbook_id, created_at),
  INDEX (session_id),
  FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  flipbook_id BIGINT UNSIGNED NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  session_id VARCHAR(64) NULL,
  event_type ENUM('page_view','link_click','video_play','download','share','search') NOT NULL,
  page_number INT UNSIGNED NULL,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  target_url VARCHAR(500) NULL,
  meta JSON NULL,
  country CHAR(2) NULL,
  device VARCHAR(20) NULL,
  utm_source VARCHAR(100) NULL,
  utm_medium VARCHAR(100) NULL,
  utm_campaign VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (flipbook_id, event_type, created_at),
  INDEX (flipbook_id, page_number),
  FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  flipbook_id BIGINT UNSIGNED NULL,
  recipient_email VARCHAR(190) NOT NULL,
  frequency ENUM('daily','weekly','monthly') NOT NULL DEFAULT 'weekly',
  format ENUM('csv','pdf_summary') NOT NULL DEFAULT 'pdf_summary',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS api_keys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  key_prefix VARCHAR(24) NOT NULL DEFAULT 'nvf_live_',
  key_hash CHAR(64) NOT NULL UNIQUE,
  scopes JSON NULL,
  last_used_at DATETIME NULL,
  last_used_ip VARCHAR(64) NULL,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (key_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  flipbook_id BIGINT UNSIGNED NULL,
  type VARCHAR(50) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  current_step VARCHAR(150) NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  timeout_seconds INT NOT NULL DEFAULT 300,
  run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  locked_at DATETIME NULL,
  done_at DATETIME NULL,
  error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (flipbook_id),
  INDEX (status),
  INDEX (done_at, run_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(50) NULL,
  target_id BIGINT UNSIGNED NULL,
  meta JSON NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (user_id),
  INDEX (action),
  INDEX (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(60) NOT NULL,
  severity ENUM('info','warning','critical') NOT NULL DEFAULT 'info',
  ip VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) NULL,
  details JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (event_type),
  INDEX (severity),
  INDEX (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  setting_value TEXT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS email_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recipient VARCHAR(190) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  template VARCHAR(60) NOT NULL,
  status ENUM('sent','simulated','failed') NOT NULL DEFAULT 'sent',
  error_message TEXT NULL,
  preview TEXT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (recipient),
  INDEX (sent_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS webhooks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL DEFAULT 'Webhook Endpoint',
  target_url VARCHAR(500) NULL,
  url VARCHAR(255) NULL,
  secret_token VARCHAR(120) NULL,
  secret VARCHAR(100) NULL,
  events JSON NULL,
  event VARCHAR(60) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_triggered_at DATETIME NULL,
  last_status_code INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  webhook_id BIGINT UNSIGNED NOT NULL,
  event_name VARCHAR(80) NOT NULL,
  payload JSON NULL,
  response_code INT NOT NULL DEFAULT 200,
  response_body TEXT NULL,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  INDEX (webhook_id, created_at),
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  connector_type ENUM('sso','ldap','wordpress','erp','crm','cloud_storage','smtp') NOT NULL,
  provider_name VARCHAR(120) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  config_json JSON NULL,
  last_sync_at DATETIME NULL,
  sync_status VARCHAR(80) NOT NULL DEFAULT 'configured',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_tenant_connector (tenant_id, connector_type),
  INDEX (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  plan_id BIGINT UNSIGNED NULL,
  billing_cycle VARCHAR(30) NOT NULL DEFAULT 'monthly',
  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  usage_overage_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  tax_rate DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  status ENUM('draft','issued','reconciling','paid','overdue','void') NOT NULL DEFAULT 'issued',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer_fiji',
  payment_reference VARCHAR(120) NULL,
  bank_name VARCHAR(80) NULL,
  line_items JSON NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  paid_at DATETIME NULL,
  reconciled_by BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id, status),
  INDEX (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscription_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  from_plan_id BIGINT UNSIGNED NULL,
  to_plan_id BIGINT UNSIGNED NULL,
  action ENUM('initial','upgrade','downgrade','renewal','grace_period','suspension','reactivation','reconciliation') NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'FJD',
  payment_method VARCHAR(50) NULL,
  reference VARCHAR(120) NULL,
  notes VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  batch INT UNSIGNED NOT NULL DEFAULT 1,
  checksum CHAR(64) NOT NULL,
  is_reversible TINYINT(1) NOT NULL DEFAULT 1,
  executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dead_letter_jobs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  original_job_id BIGINT UNSIGNED NULL,
  queue_name VARCHAR(64) NOT NULL DEFAULT 'document-processing',
  job_type VARCHAR(80) NOT NULL DEFAULT 'pdf_conversion',
  payload JSON NULL,
  exception_class VARCHAR(160) NULL,
  error_message TEXT NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 3,
  status ENUM('dead','requeued','resolved') NOT NULL DEFAULT 'dead',
  failed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  requeued_at DATETIME NULL,
  INDEX (tenant_id, status),
  INDEX (failed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS error_reports (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NULL,
  trace_id VARCHAR(64) NOT NULL,
  severity ENUM('warning','error','critical') NOT NULL DEFAULT 'error',
  exception_class VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  file VARCHAR(255) NOT NULL,
  line INT UNSIGNED NOT NULL DEFAULT 0,
  request_method VARCHAR(16) NULL,
  request_uri VARCHAR(255) NULL,
  context_json JSON NULL,
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  occurrences INT UNSIGNED NOT NULL DEFAULT 1,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id, resolved),
  INDEX (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_backups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  backup_code VARCHAR(64) NOT NULL UNIQUE,
  backup_type ENUM('full_snapshot','mysql_schema_data','tenant_storage') NOT NULL DEFAULT 'full_snapshot',
  file_path VARCHAR(255) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  checksum_sha256 CHAR(64) NOT NULL,
  tables_count INT UNSIGNED NOT NULL DEFAULT 0,
  rows_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  files_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('completed','verified','restored','failed') NOT NULL DEFAULT 'completed',
  recovery_tested_at DATETIME NULL,
  recovery_notes VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
