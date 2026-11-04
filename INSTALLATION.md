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
| **Operating System** | Windows 10/11 / Server 2022<br>Ubuntu 22.04 LTS / 24.04 LTS | Ubuntu 24.04 LTS | Cross-platform compatible |
| **PHP** | 8.3.0+ | 8.3.12+ or 8.4+ | Required extensions: `pdo_mysql`, `mbstring`, `fileinfo`, `openssl`, `curl`, `json` |
| **Database** | MySQL 8.0+ | MySQL 8.4 LTS | Native JSON support and strict SQL mode enabled |
| **Node.js** | 20.x LTS | 20.x or 22.x LTS | Includes `npm` 10+ |
| **Poppler Utilities** | 23.x+ | 25.x+ | Must include `pdftoppm` binary in executable path |
| **Composer** | 2.6+ | 2.8+ | PHP dependency package manager |
| **Web Server** | Built-in / Nginx 1.22+ | Nginx 1.26+ with HTTPS / TLS 1.3 | For reverse proxy and static asset delivery |

---

## 2. Environment Configuration Reference

The backend requires a configured `.env` file located at `backend/.env`. A template is provided at `backend/.env.example`.

### Complete `.env` Specification:

```ini
# Application Mode ('local', 'staging', 'production')
APP_ENV=production

# Base URL of the Frontend Application (used for CORS and email links)
APP_URL=https://flipex.nuvistechnologies.com.fj

# Secret Key for JWT Token Generation (minimum 32 characters)
JWT_SECRET=f7rz8w9xek3ho61b5ncqa0gjvdptmu4l2ysi_replace_with_secure_random_key

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

# Path to the Poppler pdftoppm Binary
# Linux: /usr/bin/pdftoppm
# Windows: C:\Program Files\Poppler\Library\bin\pdftoppm.exe
PDFTOPPM_BIN=/usr/bin/pdftoppm
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

### Step 3.3: Install Backend Dependencies & Run Migrations

```powershell
cd backend
copy .env.example .env

# Install Composer packages
composer install --no-dev --optimize-autoloader

# Run database migrations and initial seeders
php bin/migrate.php
```

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

    # Public Publication Storage Assets
    location /storage/ {
        alias /var/www/nuvis-flipex/backend/storage/;
        access_log off;
        expires 30d;
        add_header Cache-Control "public, no-transform";
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

## 6. Database Setup & Migrations

The migration engine is located at `backend/bin/migrate.php`. It maintains schema versioning, executes SQL migrations in strict transactional order, and seeds initial system defaults:

### Seeded Default Accounts & Tiers:

- **Super Administrator:**
  - Email: `t@example.com`
  - Password: `secret123`
  - Role: `admin`
- **Initial Corporate Tenant:**
  - Workspace: `Nuvis Flipex Corp` (`/nuvis-flipex`)
  - Subscription Tier: `Enterprise`
  - Quotas: `50` flipbooks, `5,000 MB` storage
  - Default Currency: `FJD` (Fiji Dollars)

To reset or rerun migrations:
```bash
php backend/bin/migrate.php
```

---

## 7. Running the Background Conversion Worker

When a publisher uploads a PDF document through the dashboard, the document is registered in `flipbooks` with status `processing`. The background worker (`backend/bin/worker.php`) handles the job:

1. Polls for unprocessed jobs with exponential backoff.
2. Invokes Poppler `pdftoppm -png -r 150 <input.pdf> <output_dir>/page`.
3. Extracts individual page count, pixel dimensions, and aspect ratio.
4. Generates web-optimized thumbnail images.
5. Marks the publication `ready`.
6. Dispatches an automated email notification to the customer informing them their publication is live.

To monitor worker activity:
```bash
# Linux systemd logs:
journalctl -u nuvis-flipex-worker -f

# Direct CLI execution (for debugging):
php backend/bin/worker.php
```

---

## 8. SMTP Email Setup & Two-Factor Authentication

### Step 8.1: Configure SMTP in Admin Console
1. Sign in as Administrator (`t@example.com`).
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
- Every user can enable 2FA under their **Account Settings** (`/settings`).
- When active, logins trigger a 6-digit one-time password (OTP) sent to the user's email, valid for 10 minutes.

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

## 10. Production Verification & Health Checks

Perform the following smoke tests after deployment:

```bash
# 1. Check API Health:
curl -i https://flipex.nuvistechnologies.com.fj/api/v1/health
# Expected: HTTP 200 {"ok":true,"time":"..."}

# 2. Verify Poppler Binary:
/usr/bin/pdftoppm -v
# Expected: pdftoppm version 24.xx

# 3. Test Database Connectivity:
php backend/bin/migrate.php
# Expected: "Database up to date."
```

---

## 11. Troubleshooting & Support

| Symptom | Cause | Solution |
|---|---|---|
| `pdftoppm: command not found` | Poppler utilities not installed or path incorrect | Install `poppler-utils` (Linux) or verify `PDFTOPPM_BIN` in `backend/.env`. |
| `401 Unauthorized` on Login | Incorrect credentials or expired JWT | Reset admin password using `php -r` or verify user status in `users` table. |
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
