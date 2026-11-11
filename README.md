# Nuvis Flipex — Enterprise Interactive Digital Publication Platform

[![Proprietary Software](https://img.shields.io/badge/License-Proprietary-amber.svg)](mailto:nilesh@nuvistechnologies.com.fj)
[![Nuvis Technologies](https://img.shields.io/badge/Company-Nuvis%20Technologies-f59e0b.svg)](mailto:nilesh@nuvistechnologies.com.fj)
[![PHP](https://img.shields.io/badge/PHP-8.3%2B-blue.svg)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0%20%7C%208.4-informational.svg)](https://www.mysql.com/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%205-646cff.svg)](https://vitejs.dev/)
[![UI Standard](https://img.shields.io/badge/Design%20System-BoardUI-golden.svg)](https://github.com/BoardUI/boardui)
[![Security Invariants](https://img.shields.io/badge/Security-24%20Invariants%20Verified-brightgreen.svg)](#-enterprise-security--cryptographic-hardening)

> **PROPRIETARY & CONFIDENTIAL**  
> **Nuvis Flipex** is an official enterprise software product engineered and owned exclusively by **Nuvis Technologies**.  
> All intellectual property, trademarks, UX/UI designs, brand identities, and source code are protected by copyright and international intellectual property law.  
> 
> For enterprise licensing, bespoke deployments, white-label partnerships, or commercial support, please contact:  
> 📧 **Nilesh Chandra** — [nilesh@nuvistechnologies.com.fj](mailto:nilesh@nuvistechnologies.com.fj)

---

## 📑 Table of Contents

1. [Executive Overview](#-executive-overview)
2. [Visual Identity & BoardUI Standard](#-visual-identity--boardui-standard)
3. [Core Feature Matrix](#-core-feature-matrix)
   - [Interactive 3D Flipbook Reader](#1-interactive-3d-flipbook-reader)
   - [Adaptive Client Resource Loading & Performance](#2-adaptive-client-resource-loading--performance)
   - [Route-Level Code Splitting & Chunking](#3-route-level-code-splitting--chunking)
   - [Interactive Hotspot & Rich Media Studio](#4-interactive-hotspot--rich-media-studio)
   - [Modular Multi-Engine PDF Conversion Pipeline](#5-modular-multi-engine-pdf-conversion-pipeline)
   - [High-Concurrency Job Queue & Worker Daemon](#6-high-concurrency-job-queue--worker-daemon)
   - [Multi-Tenant Customer Isolation Architecture](#7-multi-tenant-customer-isolation-architecture)
   - [Enterprise Security & Cryptographic Hardening](#8-enterprise-security--cryptographic-hardening)
   - [Enterprise Integrations Hub](#9-enterprise-integrations-hub)
   - [Commercial Billing, Tax Invoicing & Fiji Bank Reconciliation](#10-commercial-billing-tax-invoicing--fiji-bank-reconciliation)
   - [DevOps Telemetry, Health Monitoring & Backups](#11-devops-telemetry-health-monitoring--backups)
4. [System Architecture & Technology Stack](#-system-architecture--technology-stack)
5. [Directory Layout](#-directory-layout)
6. [Database Schema & Migrations](#-database-schema--migrations)
7. [Installation & Setup](#-installation--setup)
   - [Prerequisites](#prerequisites)
   - [Local Development Setup](#local-development-setup)
   - [Production Deployment (cPanel / Apache / LiteSpeed)](#production-deployment-cpanel--apache--litespeed)
8. [Background Workers & Automation](#-background-workers--automation)
9. [Automated Security & Regression Verification](#-automated-security--regression-verification)
10. [Commercial Support & Contact](#-commercial-support--contact)

---

## 🌟 Executive Overview

**Nuvis Flipex** is a state-of-the-art, multi-tenant digital publishing platform that transforms static PDF documents into rich, tactile, interactive 3D HTML5 flipbooks. Designed specifically for corporate annual reports, luxury retail catalogues, academic newsletters, product brochures, and digital magazines, Nuvis Flipex delivers a responsive, magazine-grade reading experience with zero lag.

Beyond rendering, Flipex serves as an enterprise document management suite featuring:
- **Strict Customer Isolation:** Multi-tenant database partitioning, path-isolated tenant storage, and zero fallback security.
- **Enterprise-Grade Background Workers:** Atomic job queueing with `SKIP LOCKED`, renewable 5-minute leases, progress heartbeat renewals, per-tenant concurrency caps, and graceful shutdown handling.
- **Client-Side Optimization:** Dynamic route-level code splitting (reducing initial bundle by over 60%), adaptive image sliding windows, and canvas device pixel ratio (DPR) throttling for high-density mobile devices.
- **Enterprise Security:** Dual 2FA (RFC 6238 TOTP and Email OTP), SHA-256 scoped API keys, token replay defense with session family revocation, and CSPRNG cryptographic secret management.

---

## 🎨 Visual Identity & BoardUI Standard

Nuvis Flipex adheres to the **BoardUI Standard** ([boardui/boardui](https://github.com/boardui/boardui)):
- **Signature Golden Brand Accent:** `#F5C542` / `amber-400` / `amber-500` with brushed metallic gradients (`.nuvis-brand-text`).
- **Source-Based Component Architecture:** Primitive UI components live directly in `frontend/src/components/ui/*`.
- **Accessibility:** React Aria Components for keyboard navigation, focus management, and WCAG-compliant interactions.
- **Design Tokens:** Strict Tailwind CSS tokenization with dynamic theme switching (Dark/Light mode) and dynamic blue accent presets (`ocean`, `electric`, `sky`, `cobalt`).

---

## 🚀 Core Feature Matrix

### 1. Interactive 3D Flipbook Reader
- **Physics-Based Page Turns:** Realistic 3D mesh curvature and hardcover simulation powered by StPageFlip with custom crease, spine, and shadow highlights.
- **Acoustic Feedback:** Audio synthesis playing authentic page-turning sounds with volume and mute toggles.
- **Responsive Spread Engine:** Dual-page book view on desktop/tablet landscape; auto-switches to single-page portrait layout on mobile without clipping page edges.
- **Precision Zoom & Pan:** Multi-level smooth zoom slider (100% to 300%) with intuitive click-and-drag panning.
- **Visual Navigation:** Interactive thumbnail strip, slider scrubbing, jump-to-page input, Table of Contents (TOC) drawer, and bookmarks.
- **Social Sharing & Fullscreen:** Native Fullscreen API integration, direct page sharing, and OpenGraph server-rendered social preview cards (`/v/:slug`).

### 2. Adaptive Client Resource Loading & Performance
- **Sliding Image Window:** Instead of loading every page image up front, the reader calculates an active window based on device capabilities:
  - *Low-end / Mobile:* Current spread + 2 pages ahead / 1 behind.
  - *Desktop / High-end:* Current spread + 3 pages ahead / 2 behind.
  - *Distant Pages:* Instant, lightweight blank SVG placeholders (`data:image/svg+xml`) that seamlessly swap when flipped into proximity.
- **Adaptive Canvas DPR Clamping:**
  - Prevents mobile memory exhaustion from unbounded `window.devicePixelRatio`.
  - Automatically clamps canvas DPR: **1.0** on low-tier devices, **1.5** on standard mobile, and **2.0** on desktop/high-end.
- **Background Memory Recycling:** Automatically frees decoded image memory for distant pages on constrained devices.

### 3. Route-Level Code Splitting & Chunking
- **Granular React `Suspense` Boundaries:** Every major area is lazily loaded on demand via `React.lazy()`:
  - `PublicViewer` (Reader chunk: ~6 KB + flip engine)
  - `Dashboard` (Publisher management)
  - `AdminPanel` (Super admin console)
  - `DevOpsCenter` (Telemetry & maintenance)
  - `IntegrationsHub` & `BillingPortal`
- **Initial Bundle Reduction:** Initial bundle dropped from ~530 KB down to a lightweight 39 KB app entry + vendor chunks. Public flipbook readers never download administrative, billing, or DevOps code.

### 4. Interactive Hotspot & Rich Media Studio
- **WYSIWYG Visual Canvas:** Drag-and-drop hotspot authoring directly over publication pages.
- **Multi-Modal Interactive Types:**
  - 🌐 *External Links:* Target URLs with customizable hover tooltips and new-tab options.
  - 📄 *Internal Page Jumps:* Rapid navigation to table of contents, specific chapters, or back cover.
  - 🎬 *Embedded Video:* YouTube, Vimeo, and direct MP4 modal overlays.
  - 🎵 *Audio Clips:* Background ambience and narrated voiceover playback.
  - 💬 *Product Callouts:* Commerce price badges and product purchase cards.

### 5. Modular Multi-Engine PDF Conversion Pipeline
- **Tri-Engine Rendering Engine:**
  - 🚀 **Ghostscript CLI (`/usr/bin/gs`):** High-reliability driver for cPanel, A2 Hosting, and Linux shared hosting.
  - 🎨 **PHP Imagick Extension:** In-memory vector rasterization via ImageMagick PHP extension.
  - ⚡ **Poppler pdftoppm CLI:** Ultra-fast vector renderer for dedicated Linux cloud servers.
  - 🔄 *Automatic Failover:* Detects installed binaries and seamlessly routes through available drivers.
- **Strict PDF Pre-Flight Validation:**
  - Validates `%PDF-` magic header bytes.
  - Independently validates the `%%EOF` trailer marker to reject truncated uploads.
  - Detects and rejects password-encrypted PDFs.
  - Enforces plan limits against both metadata and the actual rendered page count to prevent limit bypasses.
- **On-Demand Level 3 High-Resolution Rendering:**
  - 280 DPI ultra-high-resolution zooms rendered on demand.
  - Protected with non-blocking per-page file locks (`flock(LOCK_EX | LOCK_NB)`).
  - Concurrent requests receive the standard-resolution page immediately while the lock holder renders, caching the result to disk without server CPU spikes.

### 6. High-Concurrency Job Queue & Worker Daemon
- **Atomic Queue Claiming:** MySQL 8 `SKIP LOCKED` (with transaction fallback for MariaDB) guarantees workers never claim duplicate jobs.
- **Renewable 5-Minute Leases & Heartbeats:** Every job is bound to a `worker_id` and given a 5-minute lease. Long conversions issue progress heartbeats that renew `lease_expires_at`, preventing stale lock takeover.
- **Tenant Fairness:** Prevents a single tenant uploading 50 publications from starving other tenants:
  - Enforces `JOB_MAX_PER_TENANT` (default: 2 concurrent conversions per tenant).
  - Priority-based scheduling combined with fair-share scheduling.
- **Graceful Shutdown:** Handles `SIGTERM` and `SIGINT` signals, finishing the current page conversion before cleanly exiting.

### 7. Multi-Tenant Customer Isolation Architecture
- **Strict Database Scoping:** All queries touching publications, pages, hotspots, or API keys are validated against `tenant_id` via `TenantScope` middleware and `TenantContext::requireId()`.
- **Zero Default Fallback:** Prohibits implicit fallback to `tenant_id = 1` or unauthenticated defaults.
- **Filesystem Isolation:** All files are strictly partitioned under `/storage/tenants/{tenant_id}/publications/{flipbook_id}/`.
- **Storage Registry:** Real-time tracking of file sizes, SHA-256 hashes, and verification timestamps in `tenant_storage_objects`.
- **Transactional Outbox Pattern:** Application state changes and webhook events are committed atomically within one transaction via `outbox_events` and drained by `outbox_worker.php`.
- **Publication Ledger:** Append-only ledger recording every publication status change, approval decision, and access token.

### 8. Enterprise Security & Cryptographic Hardening
- **Automated Runtime CSPRNG Secrets:** Automatically provisions 256-bit cryptographically secure secrets via `bin2hex(random_bytes(32))` stored in protected `.crypto_secrets.json`, rejecting weak placeholders.
- **Scoped API Key Enforcement:** SHA-256 hashed API keys enforced through RBAC permissions (`flipbooks:read`, `flipbooks:write`, `erp:publish`, `analytics:read`).
- **Session Families & Token Replay Defense:**
  - Refresh tokens belong to explicit `session_families`.
  - Replay of an already-consumed refresh token immediately revokes that device's entire session family and logs a critical security alert.
- **Two-Factor Authentication (2FA):**
  - RFC 6238 TOTP Authenticator apps (Google Authenticator, Microsoft Authenticator, 1Password).
  - Transactional Email OTP with 10-minute validity.
- **Brute Force Defense:** Automatic account lockout (15 minutes) after 5 consecutive failed login attempts.
- **Separated DevOps RBAC:** Global migrations and infrastructure actions are restricted exclusively to Platform Administrators (`role = admin`), while tenant backups are restricted to Tenant Owners.

### 9. Enterprise Integrations Hub
- **RESTful API Keys:** Create, rotate, and revoke scoped API keys with rate-limiting.
- **Webhooks Engine:** Real-time outbound HTTP webhooks signed with `HMAC-SHA256` in the `X-Flipex-Signature` header.
- **Directory & SSO Connectors:** LDAP / Active Directory and SAML 2.0 Single Sign-On configurations.
- **WordPress Integration:** Bundled official Nuvis Flipex WordPress plugin for embedding flipbooks via shortcode `[flipex id="..."]`.
- **ERP Catalogue Synchronization:** Automated ingestion endpoint for corporate catalogues (`/api/v1/integrations/erp/publish-catalogue`).
- **CRM Attribution:** Reader dwell heatmaps, page dwell tracking, and UTM campaign sync.

### 10. Commercial Billing, Tax Invoicing & Fiji Bank Reconciliation
- **Tenant Subscription Portal:** Self-service plan upgrades, billing cycles (Monthly, Quarterly, Annual), and usage meter tracking.
- **Three-Stage Secure Payment Architecture:**
  1. *Customer Payment Submission:* Invoice marked pending/reconciling.
  2. *Payment Verification:* Gateway webhook signature verification (Stripe, M-PAiSA, MyCash) or authorized finance admin confirmation.
  3. *Subscription Activation:* Atomic transaction updating invoice, subscription history, and tenant quotas.
- **Fiji Commercial Invoicing:** TIN/VAT registration compliance (`FJ-TIN`), official PDF tax invoice generation, and bank payment reconciliation (BSP, ANZ, Westpac).

### 11. DevOps Telemetry, Health Monitoring & Backups
- **System Telemetry:** Live CPU utilization, system memory, disk quotas, and document conversion latency.
- **Dead Letter Queue (DLQ):** Failed job inspection, payload review, error stack traces, and manual/automatic retry.
- **Central Exception Reporter:** Structured JSONL logging (`backend/storage/logs/flipex.jsonl`) capturing stack traces and tenant context.
- **Automated Backups:** One-click full database and storage asset archive generation with SHA-256 checksum verification.

---

## 🏛️ System Architecture & Technology Stack

```
                              +-------------------------------------------+
                              |              Nuvis Flipex Web             |
                              |   React 18 · TypeScript · Vite · BoardUI  |
                              +---------------------+---------------------+
                                                    | REST API (JSON)
                                                    v
                              +-------------------------------------------+
                              |           PHP 8.3 Slim 4 Gateway          |
                              |  Controllers · Auth · TenantScope · Mailer|
                              +----------+--------------------+-----------+
                                         |                    |
                  +----------------------+                    +----------------------+
                  v                                                                  v
+------------------------------------+                             +------------------------------------+
|          MySQL 8.4 Database        |                             |        Background Workers          |
|  - Multi-Tenant Data Isolation     |                             |  - JobRunner (SKIP LOCKED Leases)  |
|  - Session Families & Token Hashes |                             |  - Outbox Dispatcher (Webhooks)    |
|  - Immutable Audit & Event Ledgers |                             |  - Ghostscript / Poppler / Imagick |
+------------------------------------+                             +------------------------------------+
```

| Component | Technology | Description |
|---|---|---|
| **Frontend Framework** | React 18.3, TypeScript 5.5 | SPA built on BoardUI primitives, React Router 6, and Vite 5. |
| **Viewer Engine** | StPageFlip + Canvas 2D | 3D physics-based book-turn simulation with adaptive DPR and sliding image windowing. |
| **Backend Framework** | PHP 8.3+, Slim 4, PSR-7 / PSR-15 | RESTful API gateway with token auth, tenant isolation, and rate-limiting. |
| **Database** | MySQL 8.0 / 8.4 Enterprise | InnoDB with composite foreign keys, JSON coordinate columns, and `SKIP LOCKED`. |
| **PDF Rasterization** | Ghostscript (`gs`), Poppler (`pdftoppm`), Imagick | Multi-engine high-fidelity rasterizer producing WebP, AVIF, and high-res JPEG assets. |
| **Cryptographic Security** | Argon2id, CSPRNG, RFC 6238 TOTP | Password hashing, token encryption, and HMAC-SHA256 signature verification. |
| **Transactional Mail** | PHPMailer 6.9, SMTP SSL/TLS | Responsive HTML transactional emails with local file logging fallbacks. |

---

## 📂 Directory Layout

```
emagzine/
├── AGENTS.md                          # BoardUI Standard & Multi-tenant Guidelines
├── README.md                          # Master documentation
├── INSTALLATION.md                    # Detailed deployment and configuration manual
├── .htaccess                          # Apache / LiteSpeed root gateway & SPA routing
├── backend/
│   ├── bin/
│   │   ├── install.php                # CLI installation wizard & secret generator
│   │   ├── migrate.php                # Master migration runner
│   │   ├── migrate_v2.php - v7.php    # Versioned database migrations
│   │   ├── worker.php                 # Asynchronous PDF conversion worker daemon
│   │   ├── outbox_worker.php          # Transactional outbox webhook dispatcher
│   │   ├── backup.php                 # Database & storage backup utility
│   │   ├── partition_analytics.php    # Daily analytics table maintenance
│   │   └── test_security.php          # 24-point security and tenant isolation test suite
│   ├── public/
│   │   ├── index.php                  # API gateway entry point & SSR OpenGraph router
│   │   └── .htaccess                  # Slim URL rewrite rules
│   ├── src/
│   │   ├── Controllers/               # Admin, Auth, Billing, DevOps, Flipbook, Integrations, etc.
│   │   ├── Database/                  # Migration classes and schema builders
│   │   ├── Infrastructure/Logging/    # Central Exception Reporter & JSONL loggers
│   │   ├── Middleware/                # Auth, Cors, RateLimit, TenantScope
│   │   └── Support/                   # CryptoSecrets, Db, JobRunner, PdfRenderer, SessionFamilies, etc.
│   ├── storage/
│   │   ├── .crypto_secrets.json       # Protected 256-bit provisioned encryption secrets
│   │   ├── logs/                      # Structured JSONL application logs
│   │   ├── mail_logs/                 # Local audit fallbacks for dispatched emails
│   │   └── tenants/                   # Isolated customer PDF files & converted assets
│   ├── composer.json                  # PHP package definitions
│   └── .env.example                   # Environment configuration template
└── frontend/
    ├── src/
    │   ├── api/                       # API client with token interceptors
    │   ├── auth/                      # Authentication provider & 2FA state
    │   ├── components/                # BoardUI primitives, FlipbookViewer, HotspotEditor
    │   │   └── viewer/adaptiveLoading # Memory & network-aware image preloading & DPR clamping
    │   ├── pages/                     # Dashboard, PublicViewer, DevOpsCenter, Billing, Admin, etc.
    │   ├── main.tsx                   # Lazy-loaded route boundaries & Suspense wrappers
    │   └── styles.css                 # BoardUI styling & Nuvis golden brand tokens
    ├── package.json                   # NPM dependencies
    └── vite.config.ts                 # Vite bundler configuration & manual chunking
```

---

## 🗄️ Database Schema & Migrations

Nuvis Flipex features a fully managed, versioned migration pipeline located in `backend/bin/`:

| Migration Script | Scope & Capabilities Added |
|---|---|
| **`migrate.php`** | Base schema: `tenants`, `users`, `flipbooks`, `pages`, `plans`, `hotspots`, `analytics`. |
| **`migrate_v2.php`** | Dual 2FA (`totp_secret`, `two_factor_code`), brute-force lockout, and email logs. |
| **`migrate_v3.php`** | Hotspot coordinates, multimedia overlays, and audio enrichment tracks. |
| **`migrate_v4.php`** | Enterprise integrations: `api_keys`, `webhooks`, `system_settings`, `scheduled_reports`. |
| **`migrate_v5.php`** | Job queues (`jobs`), Dead Letter Queue (DLQ), error telemetry, and backup archives. |
| **`migrate_v6.php`** | Commercial billing: `invoices`, `subscription_history`, multi-currency Fiji tax fields. |
| **`migrate_v7.php`** | Multi-tenant architecture: `session_families`, `outbox_events`, `tenant_storage_objects`, `publication_events`, and composite foreign keys. |

To run all pending migrations:
```bash
php backend/bin/migrate.php
```

---

## 💻 Installation & Setup

### Prerequisites
- **PHP:** 8.3 or higher with extensions: `pdo_mysql`, `gd`, `fileinfo`, `mbstring`, `openssl`, `curl` (and optionally `imagick`, `pcntl`).
- **Database:** MySQL 8.0 / 8.4 or MariaDB 10.6+.
- **Node.js:** v18.0 or higher with `npm`.
- **PDF Tools:** Ghostscript (`gs`), Poppler utilities (`pdftoppm`, `pdfinfo`, `pdftotext`).

### Local Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ishaana10/Nuvis-Flipex.git
   cd Nuvis-Flipex
   ```

2. **Configure and Install Backend:**
   ```bash
   cd backend
   composer install
   cp .env.example .env
   # Edit .env with your MySQL credentials (DB_HOST, DB_NAME, DB_USER, DB_PASS)
   php bin/install.php
   php bin/migrate.php
   ```

3. **Configure and Build Frontend:**
   ```bash
   cd ../frontend
   npm install
   npm run build
   ```

4. **Launch Local Servers:**
   - **Backend API (Port 8080):**
     ```bash
     cd backend
     php -S localhost:8080 -t public public/index.php
     ```
   - **Frontend Dev Server (Port 5173):**
     ```bash
     cd frontend
     npm run dev
     ```

---

### Production Deployment (cPanel / Apache / LiteSpeed)

1. **Document Root Structure:**
   Deploy the repository directly into your domain root (e.g., `/home/username/public_html/` or `/home/username/flipex.ict-fj.com/`).
   The included root `.htaccess` handles routing automatically:
   - `/api/v1/*` ➔ Routes to `backend/public/index.php`.
   - `/v/:slug` ➔ Routes to `backend/public/index.php` for SSR OpenGraph metadata.
   - `/storage/*` ➔ Strictly blocked (`403 Forbidden`).
   - Static assets ➔ Served directly from `frontend/dist/assets/*`.
   - Client deep links ➔ Fall back to `frontend/dist/index.html`.

2. **Run Production Installation Wizard:**
   ```bash
   cd backend
   php bin/install.php
   ```
   *The installer automatically generates high-entropy 256-bit CSPRNG secrets for JWT and file signing, validates file permissions, and sets up your super administrator account.*

3. **Build Frontend Bundle:**
   ```bash
   cd frontend
   npm run build
   ```

---

## ⚙️ Background Workers & Automation

### 1. Document Conversion Worker Daemon
The worker converts queued PDF documents into responsive page images, extracts searchable text, and creates thumbnails:
```bash
# Continuous daemon (Systemd or Supervisor):
php backend/bin/worker.php

# Single-execution mode (ideal for cPanel Cron Jobs):
php backend/bin/worker.php --once
```

**Recommended cPanel Cron Job (every minute):**
```cron
* * * * * php /home/username/flipex.ict-fj.com/backend/bin/worker.php --once >/dev/null 2>&1
```

### 2. Transactional Outbox Webhook Dispatcher
Delivers outbound webhook notifications to third-party ERPs, CRMs, and APIs with exponential retry back-off:
```bash
php backend/bin/outbox_worker.php
```

### 3. Analytics Partitioning & Daily Maintenance
Maintains high-volume event tables and prunes stale temporary records:
```bash
0 2 * * * php /home/username/flipex.ict-fj.com/backend/bin/tenant_maintenance.php >/dev/null 2>&1
```

---

## 🛡️ Automated Security & Regression Verification

Nuvis Flipex includes an automated security regression test suite validating **24 strict enterprise isolation and security invariants**:
- Universal route-level IDOR validation across publications, categories, and invoices.
- Strict isolation of filesystem assets in `/storage/tenants/{tenant_id}/`.
- Scoped API key permissions (`flipbooks:read`, `flipbooks:write`, `erp:publish`, `analytics:read`).
- Refresh token replay detection and session family revocation.
- Cryptographic secret entropy enforcement and placeholder rejection.
- Independent `%%EOF` trailer verification and page limit bypass prevention.
- Renewable job leases and atomic worker `SKIP LOCKED` concurrency.

Run the test suite at any time via CLI:
```bash
php backend/bin/test_security.php
```

---

## 📬 Commercial Support & Contact

**Nuvis Flipex** is commercially developed and supported by **Nuvis Technologies**.

- **Product:** Nuvis Flipex
- **Vendor:** Nuvis Technologies
- **Lead Architect:** Nilesh Chandra
- **Email:** [nilesh@nuvistechnologies.com.fj](mailto:nilesh@nuvistechnologies.com.fj)
- **Jurisdiction:** Fiji Islands & International Enterprise Deployment

---

*Copyright © 2026 Nuvis Technologies. All rights reserved. Proprietary and Confidential.*
