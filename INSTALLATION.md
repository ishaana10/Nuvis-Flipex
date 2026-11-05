# Nuvis Flipex — Installation, Configuration & Deployment Manual

> **PROPRIETARY & CONFIDENTIAL**  
> **Nuvis Flipex** is an official proprietary product developed by **Nuvis Technologies**.  
> For enterprise licensing, bespoke deployments, and support enquiries, please contact:  
> 📧 **Nilesh Chandra** — [nilesh@nuvistechnologies.com.fj](mailto:nilesh@nuvistechnologies.com.fj)

---

## 📋 Table of Contents
1. [System Requirements](#1-system-requirements)
2. [Environment Configuration Reference](#2-environment-configuration-reference)
3. [Windows Setup Guide (Development & Production)](#3-windows-setup-guide)
4. [Linux / Ubuntu Production Setup Guide](#4-linux--ubuntu-production-setup-guide)
5. [Docker Compose Deployment](#5-docker-compose-deployment)
6. [Database Setup & Migrations](#6-database-setup--migrations)
7. [Running the Background Conversion Worker](#7-running-the-background-conversion-worker)
8. [SMTP Email Setup & Two-Factor Authentication](#8-smtp-email-setup--two-factor-authentication)
9. [Multi-Tenant Corporate Billing Management](#9-multi-tenant-corporate-billing-management)
10. [Production Verification & Health Checks](#10-production-verification--health-checks)
11. [Troubleshooting & Support](#11-troubleshooting--support)

---

## 1. System Requirements

Ensure the target server or development environment meets the following specifications:

| Component | Minimum Version | Recommended Version | Notes |
|---|---|---|---|
| **Operating System** | Windows 10/11 / Server 2022<br>Ubuntu 22.04 LTS / 24.04 LTS<br>cPanel / CloudLinux (A2 Hosting) | CloudLinux / Ubuntu 24.04 LTS | Cross-platform compatible |
| **PHP** | 8.3.0+ | 8.3.12+ or 8.4+ | Required extensions: `pdo_mysql`, `mbstring`, `fileinfo`, `openssl`, `curl`, `json`. Optional: `imagick` |
| **Database** | MySQL 8.0+ / MariaDB 10.5+ | MySQL 8.4 LTS | Native JSON support and strict SQL mode enabled |
| **Node.js** | 20.x LTS | 20.x or 22.x LTS | Includes `npm` 10+ (for building frontend assets) |
| **PDF Rasterizer** | Ghostscript 9.5+ or Poppler 23+ or Imagick | Ghostscript (`/usr/bin/gs`) | Ready on A2 Hosting at `/usr/bin/gs`; Poppler `pdftoppm` is fully supported as an optional upgrade |
| **Composer** | 2.6+ | 2.8+ | PHP dependency package manager |
| **Web Server** | Apache 2.4 / Nginx 1.22+ / LiteSpeed | Apache / LiteSpeed (cPanel) or Nginx | For reverse proxy and static asset delivery |

---

## 2. Environment Configuration Reference

The backend requires a configured `.env` file located at `backend/.env`. A template is provided at `backend/.env.example`.

### Complete `.env` Specification:

```ini
# Application Mode ('local', 'staging', 'production')
APP_ENV=production

# Base URL of the Frontend Application (used for CORS and email links)
APP_URL=https://flipex.nuvistechnologies.com.fj

# Secret Key for JWT Token Generation (256-bit random key, generated automatically by bin/install.php)
JWT_SECRET=run_bin_install_php_to_generate_secure_random_key

# MySQL Database Connection Details
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=flipbook
DB_USER=flipbook
DB_PASS=YourStrongSecurePasswordHere!

# Platform SMTP Delivery Settings (Default Fallback)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_ENCRYPTION=tls
MAIL_USER=notifications@nuvistechnologies.com.fj
MAIL_PASS=your-smtp-app-password
MAIL_FROM=notifications@nuvistechnologies.com.fj
MAIL_FROM_NAME="Nuvis Flipex"

# Allowed CORS Origin for API requests
CORS_ORIGIN=https://flipex.nuvistechnologies.com.fj

# PDF Rasterization Engine ('auto', 'ghostscript', 'imagick', or 'pdftoppm')
# For A2 Hosting & cPanel shared hosting: use 'ghostscript' or 'imagick'
PDF_DRIVER=ghostscript

# Path to Ghostscript Binary (Ready on A2 Hosting at /usr/bin/gs)
GS_BIN=/usr/bin/gs

# Path to Poppler pdftoppm Binary (Optional: if moved/upgraded to hosting with Poppler)
# PDFTOPPM_BIN=/usr/bin/pdftoppm
```

---

## 3. Windows Setup Guide

### Step 3.1: Install Prerequisites via WinGet (PowerShell)

Open an administrative PowerShell prompt and execute:

```powershell
# Install PHP 8.3, Composer, Node.js, and Poppler
winget install PHP.PHP.8.3
winget install Composer.Composer
winget install OpenJS.NodeJS.LTS
winget install oschwartz10612.Poppler
winget install Oracle.MySQL
```

Verify that tools are accessible:
```powershell
php -v
composer --version
node -v
npm -v
pdftoppm -v
```

### Step 3.2: Configure MySQL Database

Log in to MySQL and initialize the database and dedicated user:

```sql
CREATE DATABASE IF NOT EXISTS flipbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'flipbook'@'127.0.0.1' IDENTIFIED BY 'secret';
GRANT ALL PRIVILEGES ON flipbook.* TO 'flipbook'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### Step 3.3: Install Backend Dependencies & Run Secure Installer

```powershell
cd backend

# Install Composer packages
composer install --no-dev --optimize-autoloader

# Run the Secure Initialization Wizard:
# Prompts for administrator email & password, creates random 256-bit JWT secret,
# initializes the database schema, and seeds default subscription tiers.
php bin/install.php
```

> **Security Note:** In automated environments, use non-interactive mode:  
> `php bin/install.php --email=admin@yourcorp.com --password="YourSecurePassword!"`  
> or generate a random high-entropy password:  
> `php bin/install.php --email=admin@yourcorp.com --generate-password`

### Step 3.4: Install Frontend Dependencies & Build

```powershell
cd ..\frontend
npm.cmd install

# For local development with live reload:
npm.cmd run dev

# Or compile for production distribution:
npm.cmd run build
```

### Step 3.5: Run the Services on Windows

In separate terminal tabs or background tasks:

```powershell
# Tab 1: PHP API Gateway Server
cd backend
php -S 127.0.0.1:8080 -t public public/index.php

# Tab 2: Asynchronous PDF Conversion Worker
cd backend
php bin/worker.php

# Tab 3: Vite Dev Server (or host dist/ on IIS / Nginx)
cd frontend
npm.cmd run dev
```

---

## 3B. A2 Hosting / cPanel CloudLinux Deployment Guide (`flipex.ict-fj.com`)

When deploying on **A2 Hosting** (or any cPanel / CloudLinux server where the repository is placed directly inside your subdomain folder, e.g. `/home/ictfjcom/flipex.ict-fj.com`):

### Step 3B.1: Pull the Latest Repository

The repository includes a pre-built production bundle (`frontend/dist`) and a root `.htaccess` router, so **you do NOT need to run `npm install` or `npm run build` on A2 Hosting** (which avoids A2 Hosting's legacy default `/usr/bin/node` v10.24.0 issue).

```bash
cd /home/ictfjcom/flipex.ict-fj.com
git pull origin main
```

### Step 3B.2: Install Backend Dependencies & Run the Self-Healing Installer

```bash
cd /home/ictfjcom/flipex.ict-fj.com/backend
composer install --no-dev --optimize-autoloader
php bin/install.php
```

What `php bin/install.php` now does automatically:
1. Detects Ghostscript (`/usr/bin/gs`) and PHP `imagick`.
2. Creates all tables from `database/schema.sql` **and automatically adds any missing columns (`tenant_id`, etc.)** if an older table already existed in your MySQL database.
3. Provisions your corporate tenant workspace and Super Administrator login (`nilesh@nuvistechnologies.com.fj`) and prints your generated password.

*(Optional)* If you ever want to build the frontend directly on A2 Hosting SSH instead of using the pre-built `frontend/dist`, activate CloudLinux's Node 20 binary first:
```bash
export PATH=/opt/alt/alt-nodejs20/root/usr/bin:$PATH
node -v   # Should show v20.x.x (instead of v10.24.0)
cd /home/ictfjcom/flipex.ict-fj.com/frontend
npm install && npm run build
```

### Step 3B.3: Add cPanel Cron Job for PDF Background Conversion

In **cPanel → Cron Jobs**, add a per-minute cron job to process uploaded PDFs:
```cron
* * * * * /usr/local/bin/php /home/ictfjcom/flipex.ict-fj.com/backend/bin/worker.php --once >/dev/null 2>&1
```

---

## 4. Linux / Ubuntu Production Setup Guide

Target: Ubuntu 22.04 LTS or 24.04 LTS.

### Step 4.1: Update System & Install Core Packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y software-properties-common curl git unzip poppler-utils nginx mysql-server

# Add Ondřej Surý PHP repository for PHP 8.3
sudo add-apt-repository ppa:ondrej/php -y
sudo apt update

# Install PHP 8.3 and extensions
sudo apt install -y php8.3-cli php8.3-fpm php8.3-mysql php8.3-mbstring \
                    php8.3-xml php8.3-curl php8.3-zip php8.3-gd

# Install Composer
curl -sS https://getcomposer.org/installer | sudo php -- --install-dir=/usr/local/bin --filename=composer

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Step 4.2: Clone Repository & Set Permissions

```bash
cd /var/www
sudo git clone <repository_url> nuvis-flipex
cd nuvis-flipex

sudo chown -R www-data:www-data /var/www/nuvis-flipex
sudo chmod -R 775 /var/www/nuvis-flipex/backend/storage
```

### Step 4.3: Configure Backend & Database

```bash
cd /var/www/nuvis-flipex/backend
cp .env.example .env
nano .env   # Configure DB_PASS, JWT_SECRET, and PDFTOPPM_BIN=/usr/bin/pdftoppm

# Create Database in MySQL
sudo mysql -e "CREATE DATABASE flipbook CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'flipbook'@'localhost' IDENTIFIED BY 'StrongDbPassword2026!';"
sudo mysql -e "GRANT ALL PRIVILEGES ON flipbook.* TO 'flipbook'@'localhost'; FLUSH PRIVILEGES;"

# Install backend dependencies
composer install --no-dev --optimize-autoloader

# Run database schema migrations
php bin/migrate.php
```

### Step 4.4: Build Frontend

```bash
cd /var/www/nuvis-flipex/frontend
npm install
npm run build
```

### Step 4.5: Configure Systemd Services

Create the background conversion worker daemon:

```ini
# /etc/systemd/system/nuvis-flipex-worker.service
[Unit]
Description=Nuvis Flipex PDF Conversion Worker Daemon
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/nuvis-flipex/backend
ExecStart=/usr/bin/php /var/www/nuvis-flipex/backend/bin/worker.php
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable nuvis-flipex-worker
sudo systemctl start nuvis-flipex-worker
sudo systemctl status nuvis-flipex-worker
```

### Step 4.6: Nginx Reverse Proxy Configuration

Create `/etc/nginx/sites-available/nuvis-flipex`:

```nginx
server {
    listen 80;
    server_name flipex.nuvistechnologies.com.fj;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name flipex.nuvistechnologies.com.fj;

    ssl_certificate /etc/letsencrypt/live/flipex.nuvistechnologies.com.fj/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/flipex.nuvistechnologies.com.fj/privkey.pem;

    root /var/www/nuvis-flipex/frontend/dist;
    index index.html;

    client_max_body_size 100M;

    # Static Frontend SPA
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend REST API Gateway
    location /api/ {
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
        fastcgi_index index.php;
        fastcgi_param SCRIPT_FILENAME /var/www/nuvis-flipex/backend/public/index.php;
        include fastcgi_params;
        fastcgi_param HTTP_AUTHORIZATION $http_authorization;
    }

    # CRITICAL SECURITY RULE: Block all direct HTTP access to internal storage
    # Original PDF documents and high-resolution publication pages are strictly protected.
    # Documents and page images are served exclusively via authorized, access-controlled API endpoints:
    # - Reader: /api/v1/public/{slug}/pages/{n}
    # - Thumbnails: /api/v1/public/{slug}/thumbs/{n}
    # - Publisher / Editor: /api/v1/flipbooks/{id}/pages/{n}
    # - Temporary Signed URLs: /api/v1/files/signed
    location ^~ /storage/ {
        deny all;
        return 404;
    }
}
```

Enable the site and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/nuvis-flipex /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 5. Docker Compose Deployment

Nuvis Flipex includes standard container orchestration via `docker-compose.yml`:

```bash
# 1. Copy environment template
cp backend/.env.example backend/.env

# 2. Build and launch containers
docker compose up -d --build

# 3. Install dependencies and run database migrations inside container
docker compose exec php composer install
docker compose exec php php bin/migrate.php

# 4. Access points:
# Web Frontend: http://localhost:5173
# API Health:   http://localhost:8080/api/v1/health
```

---

## 6. Secure Database Setup & Production Initialization

> [!IMPORTANT]
> **Zero Default Passwords Policy:** In adherence to enterprise cybersecurity guidelines, Nuvis Flipex does **not** ship with hardcoded default administrator passwords or predictable secrets. Initial credentials must be set explicitly during installation.

### Initializing via the Secure Installer:

Execute the installer from the backend root:

```bash
cd backend
php bin/install.php
```

The installer performs the following automated hardening procedures:
1. **System & Extension Validation:** Checks for PHP 8.3+, required extensions (`pdo_mysql`, `mbstring`, `fileinfo`, `openssl`), and Poppler `pdftoppm`.
2. **Cryptographic Key Generation:** Generates a high-entropy 256-bit random JWT secret and saves it securely to `backend/.env`.
3. **Database Schema Provisioning:** Imports `backend/database/schema.sql`, constructing tenant-scoped tables, foreign key constraints, and audit logging tables.
4. **Subscription Tier Provisioning:** Seeds standard corporate tiers (Free, Pro, Business, Enterprise) with granular publication and storage quotas.
5. **Secure Administrator Provisioning:**
   - Prompts for the administrator email and a custom secure password (min 10 characters).
   - Alternatively, generates a cryptographically random 16-character password via `--generate-password`.
   - Hashes password using Argon2id (`PASSWORD_ARGON2ID`).
   - Assigns platform role `admin` and workspace role `owner`.

### Automated Non-Interactive Provisioning (CI/CD / Docker):

```bash
# Provide specific credentials:
php bin/install.php --email=admin@yourcompany.com --password="YourComplexMasterPassword2026!"

# Or auto-generate a secure random master password:
php bin/install.php --email=admin@yourcompany.com --generate-password
```

### Role-Based Access Control (RBAC) Hierarchy:

| Role | Scope | Permissions & Capabilities |
|---|---|---|
| **owner** | Tenant Master | Full administrative control over tenant workspace, billing/payment settings, subscription upgrades, user management, and publication deletion. |
| **admin** | Tenant Admin | Manage workspace members, create and edit publications, configure hotspots, inspect analytics, view billing status. |
| **editor** | Publisher | Create, upload, convert, edit, and publish digital publications; configure hotspots and multimedia. |
| **viewer** | Read-Only | Read-only access to published tenant flipbooks and preview materials; cannot edit or delete content. |

---

## 7. Automated Security & Tenant Isolation Verification Suite

Nuvis Flipex includes an automated security test suite (`backend/bin/test_security.php`) that independently validates 24 security and isolation invariants:

```bash
cd backend
php bin/test_security.php
```

### Invariants Tested & Verified:
1. **Cross-Tenant IDOR Protection:** Proves that Tenant A cannot read, mutate, or delete Tenant B's publications.
2. **Database Record Integrity:** Verifies database state remains unaltered following unauthorized access attempts.
3. **Hotspot & Analytics Isolation:** Asserts hotspots and viewer analytics cannot be accessed across tenant boundaries.
4. **Billing Data Isolation:** Confirms Tenant A cannot inspect Tenant B's corporate payment details or invoice totals.
5. **Granular RBAC Enforcement:** Proves that `viewer` cannot delete publications or create hotspots (HTTP 403 Forbidden).
6. **Protected Document Delivery:** Validates that password-protected magazines block unauthenticated direct page access and require cryptographic unlock tokens.
7. **Refresh Token Rotation & Replay Attack Defense:** Tests that replaying a consumed refresh token immediately revokes all sessions in the token family and raises a critical threat event.
8. **RFC 6238 TOTP Authenticator:** Verifies dynamic truncation, time-drift tolerance (±30s), and rejection of invalid or expired codes.

---

## 7. Running the Background Conversion Worker

When a publisher uploads a PDF document through the dashboard, the document is registered in `flipbooks` with status `processing`. The background worker (`backend/bin/worker.php`) handles the job:

1. Polls for unprocessed jobs with exponential backoff.
2. Invokes the active PDF rendering engine (Ghostscript `/usr/bin/gs`, PHP `imagick` extension, or Poppler `pdftoppm`).
3. Extracts individual page count, pixel dimensions, and aspect ratio.
4. Generates web-optimized thumbnail images.
5. Marks the publication `ready`.
6. Dispatches an automated email notification to the customer informing them their publication is live.

To monitor worker activity:
```bash
# Linux systemd or cPanel cron execution:
php backend/bin/worker.php --once

# Running as a continuous daemon:
php backend/bin/worker.php
```

---

## 8. SMTP Email Setup & Two-Factor Authentication

### Step 8.1: Configure SMTP in Admin Console
1. Sign in as Administrator (`nilesh@nuvistechnologies.com.fj`).
2. Navigate to **Admin Panel** > **Tab 5: Email Setup & Platform Access**.
3. Fill in your corporate SMTP server parameters:
   - **SMTP Host:** (e.g. `smtp.office365.com` or `smtp.gmail.com`)
   - **Port:** `587` (TLS) or `465` (SSL)
   - **Encryption:** `tls`
   - **Username / Password:** Credentials or App Password.
   - **From Email:** `notifications@nuvistechnologies.com.fj`
   - **From Name:** `Nuvis Flipex`
4. Click **"Save SMTP Settings"**.
5. Test delivery by entering your email in the **"Send Test Email"** tool.

### Step 8.2: Controlling Self-Registration
In **Tab 5**, administrators can toggle **Allow Public Self-Registration**:
- **Enabled:** Anyone can create an account via `/register`.
- **Disabled:** The `/register` page displays a corporate notice, and the API returns `403 Forbidden`. Only administrators can create new users.

### Step 8.3: Two-Factor Authentication (2FA)
Nuvis Flipex supports dual two-factor verification methods:
- **Mobile Authenticator Apps (RFC 6238 TOTP - Recommended):** Compatible with Google Authenticator, Microsoft Authenticator, 1Password, and Authy. Users scan an `otpauth://` QR code or enter the base32 key, which generates time-synchronized 6-digit verification codes.
- **Email OTP Verification:** Dispatches a single-use 6-digit security code to the user's verified corporate email, valid for 10 minutes.

Users can toggle their preferred 2FA method and view active session tokens directly under **Account Settings** (`/settings`).

---

## 9. Multi-Tenant Corporate Billing Management

### 9.1 Tenant Self-Service View
Every workspace user can navigate to `/settings` to inspect their **Company Subscription & Payment Details** card:
- Active Plan & Monthly/Annual Rate
- Payment Status (`PAID`, `PENDING`, `OVERDUE`, `TRIAL`, `EXEMPT`)
- Payment Reference & Invoice ID
- Last Payment Date & Next Renewal Date
- Company Billing Name, Accounts Email, TIN/Tax ID, and Address

### 9.2 Administrator Billing Management
Administrators manage all tenant billing directly from the **Admin Panel** > **Company Management**:
1. Click the **💳 Billing** action button on any company row.
2. Update:
   - Legal Billing Entity Name & Invoicing Email.
   - Tax / TIN ID (e.g. `FJ-TIN-8938210`).
   - Payment Method (Bank Transfer, Credit Card, Direct Debit via BSP/ANZ/Westpac, Cheque, Cash).
   - Billing Cycle (Monthly, Quarterly, Annually).
   - Payment Status and custom currency rate (`FJD`, `USD`, `AUD`, `NZD`, `EUR`).
   - Next Renewal / Due Date and internal reconciliation notes.
3. Click **"Save Billing Details"** to commit updates.

---

## 10. Production Verification & Security Smoke Tests

Perform the following verification checks after deployment:

```bash
# 1. Check API Health:
curl -i https://flipex.nuvistechnologies.com.fj/api/v1/health
# Expected: HTTP 200 {"ok":true,"time":"..."}

# 2. Run Automated Tenant Isolation & Security Test Suite (24 Checks):
php backend/bin/test_security.php
# Expected: "24 Passed | 0 Failed - ALL TESTS PASSED SUCCESSFULLY!"

# 3. Verify PDF Rasterizer Engine:
# Ghostscript (A2 Hosting / cPanel):
/usr/bin/gs -v
# Or Poppler (if installed):
pdftoppm -v

# 4. Verify Storage Protection:
curl -i https://flipex.nuvistechnologies.com.fj/storage/tenants/1/
# Expected: HTTP 404 / 403 Forbidden (Public access blocked)
```

---

## 11. Troubleshooting & Support

| Symptom | Cause | Solution |
|---|---|---|
| `No capable rendering drivers available` | Ghostscript, Imagick, or Poppler not detected | On A2 Hosting, verify `GS_BIN=/usr/bin/gs` in `backend/.env` or enable `imagick` in cPanel PHP extensions. |
| `pdftoppm: command not found` | Poppler is not installed on shared hosting | Set `PDF_DRIVER=ghostscript` and `GS_BIN=/usr/bin/gs` in `backend/.env`, or use PHP `imagick`. |
| `401 Unauthorized` on Login | Incorrect credentials or expired JWT | Reset admin password using `php bin/install.php` or verify user status in `users` table. |
| `403 Forbidden` on Registration | Self-registration disabled by admin | Enable self-registration in **Admin Panel > Email Setup & Platform Access**. |
| `CORS Error` in Browser Console | `CORS_ORIGIN` does not match frontend domain | Update `CORS_ORIGIN` in `backend/.env` to match the exact frontend URL scheme and port. |
| Emails Not Arriving | SMTP credentials or firewall blocked | Check **Admin Panel > Live Email Audit Log** to inspect delivery status or local fallback in `backend/storage/mail_logs/`. |

---

### Technical Support & Enterprise Contact

For technical assistance, architecture reviews, or bespoke deployments:

**Nuvis Technologies**  
Attn: **Nilesh Chandra**  
Email: [nilesh@nuvistechnologies.com.fj](mailto:nilesh@nuvistechnologies.com.fj)  
Web: [https://nuvistechnologies.com.fj](https://nuvistechnologies.com.fj)

---

*Copyright © 2026 Nuvis Technologies. Proprietary & Confidential.*
