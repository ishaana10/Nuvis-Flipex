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
  country CHAR(2) NULL,
  device VARCHAR(20) NULL,
  referrer VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (flipbook_id, created_at),
  FOREIGN KEY (flipbook_id) REFERENCES flipbooks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS api_keys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  key_hash CHAR(64) NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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
  url VARCHAR(255) NOT NULL,
  event VARCHAR(60) NOT NULL,
  secret VARCHAR(100) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX (tenant_id)
) ENGINE=InnoDB;
