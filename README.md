# Nuvis Flipex — Enterprise Interactive Digital Publication Platform

[![Proprietary Software](https://img.shields.io/badge/License-Proprietary-amber.svg)](mailto:nilesh@nuvistechnologies.com.fj)
[![Nuvis Technologies](https://img.shields.io/badge/Company-Nuvis%20Technologies-f59e0b.svg)](mailto:nilesh@nuvistechnologies.com.fj)
[![PHP](https://img.shields.io/badge/PHP-8.3%2B-blue.svg)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0%20%7C%208.4-informational.svg)](https://www.mysql.com/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg)](https://www.typescriptlang.org/)
[![UI Standard](https://img.shields.io/badge/Design%20System-BoardUI-golden.svg)](https://github.com/BoardUI/boardui)

> **PROPRIETARY & CONFIDENTIAL**  
> **Nuvis Flipex** is an official proprietary software product designed and engineered by **Nuvis Technologies**.  
> All intellectual property, trademarks, UI designs, and source code are the exclusive property of Nuvis Technologies.  
> 
> For enterprise licensing, bespoke deployments, white-label partnerships, or technical enquiries, please contact:  
> 📧 **Nilesh Chandra** — [nilesh@nuvistechnologies.com.fj](mailto:nilesh@nuvistechnologies.com.fj)

---

## 🌟 Executive Overview

**Nuvis Flipex** is a modern, high-performance, multi-tenant digital publishing platform that transforms static PDF documents into rich, interactive HTML5 3D flipbooks. Engineered for enterprise magazines, commercial product catalogues, academic newsletters, annual reports, and brochures, Nuvis Flipex delivers a tactile, magazine-like reading experience across desktop, tablet, and mobile devices.

Equipped with robust customer isolation, fine-grained subscription management, multi-currency corporate billing, two-factor authentication (2FA), an interactive hotspot editor, and comprehensive system administration, Nuvis Flipex provides an end-to-end publishing infrastructure for corporate enterprises, media houses, and educational institutions.

---

## 🎨 Visual Identity & UI Standards

Nuvis Flipex adheres strictly to the **BoardUI Standard** ([boardui/boardui](https://github.com/boardui/boardui)):
- **Signature Golden Brand Accent:** `#F5C542` / `amber-400` / `amber-500` with brushed metallic typography gradients.
- **Design System:** Source-based component primitives placed in `frontend/src/components/ui/*`.
- **Accessibility & State:** Powered by React Aria Components for WCAG-compliant interactions.
- **Styling Tokens:** Tailwind CSS utility styling paired with standard design system tokens (`cx` / `cn`).

---

## 🚀 Key Feature Matrix

### 📖 Interactive Flipbook Engine
- **Realistic 3D Page Turn:** Physics-based page curls and hard-cover simulations using StPageFlip.
- **Acoustic Feedback:** Authentic paper-turn audio effects with toggleable mute controls.
- **Single & Double Spread Modes:** Adaptive responsive layout switching between 2-page book spread on desktop and single-page display on mobile.
- **Fullscreen & Smooth Zoom:** Immersive fullscreen reading with a specialized dynamic zoom slider (100% to 300%) and intuitive click-and-drag panning.
- **Interactive Thumbnails & Navigation:** Visual page scroller, direct page jumper, table of contents, and quick bookmarking.

### 🎯 Interactive Hotspot & Link Editor
- **WYSIWYG Hotspot Placement:** Visual drag-and-drop hotspot creator directly on publication pages.
- **Multi-Modal Hotspots:**
  - 🌐 External Web Hyperlinks (open in new tab with custom labels).
  - 📄 Internal Page Jumps (navigate directly to index, chapter, or back cover).
  - 🎬 Embedded Multimedia (YouTube, Vimeo, and HTML5 video overlays).
  - 🎵 Audio Narration & Clips (embedded voiceovers and background music).
  - 💬 Tooltips & Rich Information Popups.

### 🏢 Strict Multi-Tenant Customer Isolation
- **Tenant Scoping:** Every database entity (publications, pages, hotspots, API keys, webhooks, audit logs) is scoped strictly by `tenant_id`.
- **Storage Isolation:** Publication assets and uploaded source PDFs are isolated in dedicated directories under `/storage/tenants/{tenant_id}/`.
- **Hashed API Keys:** Corporate API keys are hashed using SHA-256 with tenant context verification.
- **Workspace Slugs:** Customizable corporate workspaces (e.g. `/nuvis`, `/central-college`).

### 💳 Corporate Billing & Subscription Invoicing
- **Tenant Billing Self-Service:** Workspace members can view their company's active subscription tier, payment status (`PAID`, `PENDING`, `OVERDUE`, `TRIAL`, `EXEMPT`), billing cycle, payment reference, and renewal dates.
- **Admin Billing Management:** System Administrators can view and update every tenant's payment details, including:
  - Legal Billing Entity & Accounts Email.
  - Tax / TIN / VAT Registration Number (e.g. `FJ-TIN-8938210`).
  - Payment Method (Direct Bank Transfer, Credit/Debit Card, Direct Debit via BSP/ANZ/Westpac, Cheque, Cash).
  - Billing Cycle (Monthly, Quarterly, Annually).
  - Custom Billing Rate & Multi-Currency Support (`FJD`, `USD`, `AUD`, `NZD`, `EUR`).
  - Invoice Reference Numbers & Payment Audit Notes.

### 🛡️ Enterprise Security & Administration
- **Administrative Management Console:**
  - 📊 Real-time platform KPI dashboard (users, companies, flipbooks, pages converted, views).
  - 👥 User Management: Create accounts, assign Granular RBAC roles (`owner`, `admin`, `editor`, `viewer`), suspend access, and trigger instant password resets.
  - 🏢 Company (Tenant) Management: Provision workspaces, configure storage/publication quotas, and manage corporate billing.
  - 📦 Subscription Tier Editor: Configure storage limits, page limits, upload caps, and white-label branding toggles.
  - ✉️ Email Setup & Access Controls: Configure platform SMTP, toggle public self-registration on/off, test mail delivery, and dispatch global announcements.
  - 🛡️ Live Security & Threat Monitoring: Real-time visibility into brute-force lockout events, token replay attempts, cross-tenant IDOR violations, and chronological administrative audit logs.
- **Role-Based Access Control (RBAC):**
  - Granular permissions enforced at middleware and repository levels (`owner`, `admin`, `editor`, `viewer`).
  - Strict tenant boundary validation blocking IDOR enumeration across flipbooks, hotspots, analytics, and billing.
- **Dual Two-Factor Authentication (2FA):**
  - **Authenticator App (RFC 6238 TOTP):** Mobile app support (Google Authenticator, Microsoft Authenticator, 1Password, Authy) with dynamic truncation and time-drift tolerance.
  - **Email OTP Verification:** Single-use 6-digit codes sent via transactional email, valid for 10 minutes.
- **Token Rotation & Replay Attack Defense:**
  - Refresh tokens rotate upon every refresh exchange.
  - Replay of revoked tokens immediately terminates the entire user session family and logs a critical security alert.
- **Protected Document Streaming:**
  - Direct HTTP web access to `/storage/` is strictly prohibited.
  - Publication assets and source PDFs stream exclusively through authorized, access-controlled endpoints with password unlock validation.
- **Automated Security Verification:**
  - Built-in test suite (`php backend/bin/test_security.php`) validating 24 core security and isolation invariants.

### ⚡ Modular Multi-Engine PDF Conversion Pipeline
- **Adaptive Rendering Drivers:**
  - 🚀 **Ghostscript CLI (`/usr/bin/gs`):** Primary driver for A2 Hosting, cPanel, and Linux shared hosting.
  - 🎨 **PHP Imagick Extension:** In-process rasterization via cPanel PHP 8.3 extension.
  - ⚡ **Poppler pdftoppm CLI:** High-performance vector rendering for dedicated or upgraded environments.
  - 🔄 **Automatic Discovery & Failover:** Seamlessly resolves available drivers and automatically fails over if one engine is unavailable.
- **Asynchronous Worker:** CLI background worker daemon converts multi-page PDFs asynchronously.
- **Automated Metadata Extraction:** Dimension calculations, page counts, aspect ratios, and thumbnail extraction.
- **Instant Customer Notifications:** Automatic email dispatched to the publisher once document processing completes.

---

## 🏛️ Architecture & Technology Stack

```
                     +---------------------------------------+
                     |           Nuvis Flipex Web            |
                     | React 18 · TypeScript · Vite · BoardUI|
                     +-------------------+-------------------+
                                         | REST API (JSON)
                                         v
                     +---------------------------------------+
                     |         PHP 8.3 Slim 4 Backend        |
                     |  Controllers · Auth · Mailer · Storage|
                     +---------+-------------------+---------+
                               |                   |
            +------------------+                   +------------------+
            v                                                         v
+-----------------------+                                 +-----------------------+
|  MySQL 8.4 Database   |                                 |   Conversion Worker   |
| Multi-tenant isolation|                                 | Ghostscript / Imagick |
|  Tenants · Users · DB |                                 |  / Poppler pdftoppm   |
+-----------------------+                                 +-----------------------+
```

| Layer | Technologies | Description |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, React Router 6, Lucide/Remix Icons | BoardUI standard interface, StPageFlip viewer, interactive hotspot editor, administrative console. |
| **Backend** | PHP 8.3+, Slim Framework 4, PSR-7 / PSR-15, Firebase JWT | RESTful API, multi-tenant middleware, authentication, rate limiting, and business logic. |
| **Database** | MySQL 8.0 / 8.4 Enterprise | Relational storage with foreign key constraints, JSON columns for hotspot coordinates, tenant scoping indexes. |
| **PDF Processing** | Ghostscript (`/usr/bin/gs`), Imagick Extension, Poppler (`pdftoppm`) | Multi-engine high-fidelity PDF page rasterization into web-optimized image assets. |
| **Email Engine** | PHPMailer 6.9, SMTP with TLS/SSL | Dynamic database-driven SMTP delivery, transactional HTML templates, local audit logs. |

---

## 📂 Project Directory Structure

```
emagzine/
├── AGENTS.md                  # AI Agent & Developer Guidelines (BoardUI Standard)
├── README.md                  # Nuvis Flipex master documentation
├── INSTALLATION.md            # Detailed production and local setup guide
├── backend/
│   ├── bin/
│   │   ├── install.php        # Secure installation wizard (dynamic passwords & keys)
│   │   ├── migrate.php        # Database schema migrations & versioning
│   │   ├── test_security.php  # Automated tenant isolation & security test suite
│   │   └── worker.php         # Asynchronous PDF conversion worker daemon
│   ├── public/
│   │   ├── index.php          # API gateway & router definition
│   │   └── .htaccess          # Apache rewrite rules
│   ├── src/
│   │   ├── Controllers/       # Admin, Auth, Flipbook, Hotspot, Me, Public
│   │   ├── Middleware/        # Auth (JWT), TenantScope (IDOR protection), RateLimit
│   │   └── Support/           # Audit, Db, Mailer, Jwt, Rbac, SecurityMonitor, Storage, Totp
│   ├── storage/
│   │   ├── .htaccess          # Protected directory (Require all denied)
│   │   ├── mail_logs/         # Local audit fallback for dispatched emails
│   │   └── tenants/           # Isolated customer publications & PDFs
│   ├── composer.json          # PHP dependencies
│   └── .env.example           # Backend configuration template
└── frontend/
    ├── src/
    │   ├── api/client.ts      # REST API client with automatic token refreshing
    │   ├── assets/            # Official Nuvis Flipex golden logo & brand media
    │   ├── auth/              # Auth context & 2FA state management
    │   ├── components/        # BoardUI components, Form fields, Viewer
    │   ├── pages/             # Dashboard, AdminPanel, Settings, Login, Register
    │   └── styles.css         # BoardUI design system & Nuvis golden accents
    ├── package.json           # Frontend dependencies
    └── vite.config.ts         # Vite bundler configuration
```

---

## 🔒 Customer Isolation & Enterprise Security Policy

1. **Scoped Queries & IDOR Prevention:** Every database query touching publications, pages, hotspots, or API keys is scoped to the tenant:
   ```sql
   SELECT * FROM flipbooks WHERE id = ? AND tenant_id = ?
   ```
   Cross-tenant attempts return `404 Not Found` to prevent identity enumeration.
2. **Directory Isolation & Protected Document Streaming:** Internal storage is kept outside the public web root (`backend/storage/tenants/{tenant_id}/...`) with direct HTTP access denied. Documents stream strictly through access-controlled API endpoints requiring active session or unlock tokens.
3. **Granular RBAC:** Access permissions are checked using the `Rbac` matrix across `owner`, `admin`, `editor`, and `viewer` roles.
4. **Session Hardening & Replay Defense:** Refresh tokens rotate on every exchange. Attempting to reuse an expired/revoked token immediately triggers family revocation of all active sessions and raises a critical security event.
5. **Argon2ID Hashing & Dynamic Secrets:** All user passwords are encrypted using `PASSWORD_ARGON2ID`. No default passwords or static JWT keys exist in production deployments.
6. **Live Threat Monitoring & Audit Trail:** Chronological security logging (`security_events`, `audit_logs`) with IP address, user agent, and contextual event metadata.
7. **Automated Verification:** 24 unit and isolation tests run via `php backend/bin/test_security.php` before production deployment.

---

## 📬 Commercial Enquiries & Support

**Nuvis Flipex** is commercially supported and maintained by **Nuvis Technologies**.

- **Product:** Nuvis Flipex
- **Developer & Vendor:** Nuvis Technologies
- **Lead Architect:** Nilesh Chandra
- **Email:** [nilesh@nuvistechnologies.com.fj](mailto:nilesh@nuvistechnologies.com.fj)
- **Jurisdiction:** Fiji Islands & International

---

*Copyright © 2026 Nuvis Technologies. All rights reserved. Strictly Proprietary.*
