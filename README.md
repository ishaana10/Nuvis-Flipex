# Nuvis Flipex — Enterprise Interactive Digital Publication Platform

[![Proprietary Software](https://img.shields.io/badge/License-Proprietary-amber.svg)](mailto:nilesh@nuvistechnologies.com.fj)
[![Nuvis Technologies](https://img.shields.io/badge/Company-Nuvis%20Technologies-f59e0b.svg)](mailto:nilesh@nuvistechnologies.com.fj)
[![PHP](https://img.shields.io/badge/PHP-8.3%2B-blue.svg)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0%20%7C%208.4-informational.svg)](https://www.mysql.com/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%205-646cff.svg)](https://vitejs.dev/)
[![Design System](https://img.shields.io/badge/Design%20System-BoardUI%20%2B%203--Gradient-ff007f.svg)](https://github.com/BoardUI/boardui)
[![Visual Studio](https://img.shields.io/badge/Flipex%20Studio-Native%20Canva--Like%20Engine-9333ea.svg)](#-flipex-studio--native-visual-creation-engine)
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
2. [Visual Identity, BoardUI Standard & 3-Gradient Palette](#-visual-identity-boardui-standard--3-gradient-palette)
3. [Core Feature Matrix](#-core-feature-matrix)
   - [1. Flipex Studio — Native Visual Creation Engine](#1-flipex-studio--native-visual-creation-engine)
   - [2. High-Attraction 3-Gradient System & Canvas Workspace](#2-high-attraction-3-gradient-system--canvas-workspace)
   - [3. Interactive 3D Flipbook Reader](#3-interactive-3d-flipbook-reader)
   - [4. Commercial Business Storefronts & Lead Engine](#4-commercial-business-storefronts--lead-engine)
   - [5. Educational Publishing & Classroom Presentation Suite](#5-educational-publishing--classroom-presentation-suite)
   - [6. Pacific Regional Directory & Ad Marketplace](#6-pacific-regional-directory--ad-marketplace)
   - [7. Interactive Hotspot & Rich Media Studio](#7-interactive-hotspot--rich-media-studio)
   - [8. Modular Multi-Engine PDF Conversion Pipeline](#8-modular-multi-engine-pdf-conversion-pipeline)
   - [9. High-Concurrency Job Queue & Worker Daemon](#9-high-concurrency-job-queue--worker-daemon)
   - [10. Multi-Tenant Customer Isolation Architecture](#10-multi-tenant-customer-isolation-architecture)
   - [11. Enterprise Security, Cryptographic Hardening & Production Gates](#11-enterprise-security-cryptographic-hardening--production-gates)
   - [12. Enterprise Integrations Hub](#12-enterprise-integrations-hub)
   - [13. Commercial Billing, Tax Invoicing & Fiji Bank Reconciliation](#13-commercial-billing-tax-invoicing--fiji-bank-reconciliation)
   - [14. DevOps Telemetry, Health Monitoring & Backups](#14-devops-telemetry-health-monitoring--backups)
4. [Recent System Updates, Fixes & Hardening (Changelog)](#-recent-system-updates-fixes--hardening-changelog)
5. [System Architecture & Technology Stack](#-system-architecture--technology-stack)
6. [Directory Layout](#-directory-layout)
7. [Database Schema & Migrations](#-database-schema--migrations)
8. [Installation & Setup](#-installation--setup)
   - [Prerequisites](#prerequisites)
   - [Local Development Setup](#local-development-setup)
   - [Production Deployment (cPanel / Apache / LiteSpeed)](#production-deployment-cpanel--apache--litespeed)
9. [Background Workers & Automation](#-background-workers--automation)
10. [Automated Security & Regression Verification](#-automated-security--regression-verification)
11. [Commercial Support & Contact](#-commercial-support--contact)

---

## 🌟 Executive Overview

**Nuvis Flipex** is an all-in-one enterprise digital publishing ecosystem. Originating as a high-performance interactive 3D HTML5 flipbook reader for PDFs, Flipex has evolved into a complete, native browser-based design, marketing, educational, and commercial publishing powerhouse.

Designed specifically for corporate annual reports, luxury retail catalogues, academic newsletters, product brochures, school yearbooks, and digital magazines, Nuvis Flipex unifies creation, conversion, monetization, and reading into a single frictionless pipeline:
- **Native Visual Authoring (Flipex Studio):** Create documents from scratch with Canva-like visual tools, specialized e-commerce product cards, multi-column magazine articles, yearbook rosters, and keepsake albums.
- **Direct Dual-Path Publishing:** One-click compilation of studio canvases directly into interactive vector flipbooks, or instant export to vector 300 DPI Print PDFs.
- **Commercial & E-Commerce Suite:** Direct WhatsApp 1-tap ordering, public storefront directories (`/b/:tenant_slug`), hotspot inquiry forms, and lead generation tracking.
- **Educational Publishing:** School portals (`/edu/:tenant_slug`), student interactive study notes, and high-visibility classroom presentation modes with laser pointer overlay.
- **Pacific Regional Localization:** Precision Fiji & Pacific IP geolocation, Fiji Time (`Pacific/Fiji`) timezone alignment, M-PAiSA / MyCash billing, and local bank reconciliation (BSP, ANZ, Westpac).
- **Enterprise Isolation & Zero-Trust Security:** Strict multi-tenant partitioning, atomic job queues with `SKIP LOCKED`, token replay defense, and 24 certified security invariants.

---

## 🎨 Visual Identity, BoardUI Standard & 3-Gradient Palette

Nuvis Flipex adheres to the **BoardUI Standard** ([boardui/boardui](https://github.com/BoardUI/boardui)) elevated with a luxurious **3-Gradient High-Attraction Color System**:

### 1. High-Attraction 3-Gradient Color Architecture
Flat, plain blue buttons have been eliminated throughout the application in favor of five distinctive, vibrant 3-stop linear gradients paired with soft drop glows:
- **Cosmic Aurora** (`linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)`): Primary creation actions, including *Create New Document*, *Launch Studio 🚀*, active document filter pills, active tool categories, *+ Folio*, and CSV auto-generation.
- **Tropical Emerald** (`linear-gradient(135deg, #059669 0%, #10b981 50%, #06b6d4 100%)`): Commerce and publishing actions, including *Publish to Flipbook 🚀*, *Open Live Reader*, card *Reader* badges, Product Card WhatsApp ordering, and standalone WhatsApp chat buttons.
- **Sunset Radiance** (`linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)`): Promotional and highlight callouts, including *Auto TOC 📑*, *Discount Splash Badges*, *Best Seller Ribbons*, and *Principal's Commendation Notes*.
- **Royal Orchid** (`linear-gradient(135deg, #7c3aed 0%, #c026d3 50%, #f43f5e 100%)`): High-end export and keepsakes, including *Print PDF 🖨️*, author bylines, senior graduate rosters, and Polaroid scrapbook frames.
- **Ocean Teal Glow** (`linear-gradient(135deg, #0d9488 0%, #06b6d4 50%, #6366f1 100%)`): Structural operations, including *Save 💾*, card containers, and inspector toggle controls.

### 2. High-Contrast Light & Dark Mode Compatibility
Every button, card, modal, and tool swatch maintains WCAG-compliant contrast ratios across both Dark Mode (`#090d16` / `#0f172a`) and Light Mode (`#f8fafc` / `#ffffff`). Page background swatches use structured CSS grid layouts, preventing text overlay or button wrapping.

---

## 🚀 Core Feature Matrix

### 1. Flipex Studio — Native Visual Creation Engine
A complete, browser-based visual layout engine allowing users to author professional publications without third-party desktop tools:
- **Document Hub & Starter Templates:** Instant document bootstrapping with blank canvases or prebuilt templates for retail supermarket specials, electronic showcases, school yearbooks, lifestyle magazines, and luxury photo albums.
- **Catalogue & WhatsApp E-Commerce Mode:**
  - Standard and tech product cards with price badges, original strike-through prices, SKU tags, and specifications callouts.
  - Direct 1-tap WhatsApp buy buttons pre-populated with localized phone numbers (`+679...`) and order inquiry text.
- **Editorial Magazine Mode:**
  - Balanced 2-column and 3-column article layouts with customizable column gaps.
  - Decorative Drop-Caps and highlighted author bylines with avatar badges.
- **School & Class Yearbook Mode:**
  - 4-student graduate portrait matrices with academic awards (*Dux of School*, *Sports Captain*, *Head Boy/Girl*), leadership roles, and senior quotes.
  - Principal's commendation boxes and academic faculty profiles.
- **Keepsake Photo Album Mode:**
  - Romantic polaroid frames with natural handwritten tilt angles (-5° to +5°).
  - Multi-photo collages, shadow frame styles, and memory note caption ribbons.
- **Automated Publishing Utilities:**
  - **Auto Running Folio:** Injects running header text and page numbers across spreads.
  - **Auto Table of Contents (TOC):** Scans document pages and compiles a Table of Contents with dot leaders and jump targets.
  - **CSV Batch Importer:** Rapidly generates entire product catalogues or yearbook graduate rosters from uploaded or pasted CSV data.
- **Direct Dual-Path Output:**
  - **High-Resolution 300 DPI Print PDF:** Direct vector PDF export endpoint (`/api/v1/studio/documents/{id}/export-pdf?print=1`).
  - **1-Click Flipbook Publishing:** Compiles studio vector DOM/SVG directly into an interactive, mobile-optimized live reader (`/v/:slug`).

### 2. High-Attraction 3-Gradient System & Canvas Workspace
- **Maximized Center Canvas:**
  - Collapsible Left Tools sidebar (`⇤ Tools`) and Right Property Inspector (`Inspector ⇥`) free over **575px+** of horizontal space.
  - Floating quick-restore handles (`▶ Tools` and `Inspector ◀`) on the canvas perimeter permit distraction-free authoring.
- **Auto "Fit to Screen" Scaler:**
  - Integrated **Fit** button calculates container dimensions minus safe margins, automatically framing document spreads at optimal zoom without clipping.
  - Quick zoom presets (`-`, `+`, `Fit`, and 30% to 200% scale).
- **Radial Velvet Canvas Stage:**
  - Canvas board floats on an elevated stage (`radial-gradient(ellipse, #172033 0%, #090d16 100%)`) with multi-layer shadow elevation (`0 25px 65px -12px rgba(0,0,0,0.8)`).
  - Floating bottom status indicator displaying page orientation, point dimensions, active scale, and page counter.
- **Contextual Property Inspector:**
  - **Layer Ordering:** Real-time z-index controls (*▲ Bring Forward* / *▼ Send Backward*).
  - **Typography Selector:** Instant switching between Modern Sans (*Inter*), Editorial Serif (*Playfair Display*), Technical Mono (*Courier New*), Handwritten Script (*Dancing Script*), and Impact Display (*Oswald*), with 4-way text alignment (`⇤`, `≡`, `⇥`, `↔`).
  - **Live WhatsApp Testing:** Active *Test WhatsApp Ordering Link ↗* generator verifying URL encoding, product name, price, and SKU in a live test tab.

### 3. Interactive 3D Flipbook Reader
- **Physics-Based Page Turns:** Realistic 3D mesh curvature and hardcover simulation powered by StPageFlip with custom crease, spine, and shadow highlights.
- **Acoustic Feedback:** Audio synthesis playing authentic page-turning sounds with volume and mute toggles.
- **Responsive Spread Engine:** Dual-page book view on desktop/tablet landscape; auto-switches to single-page portrait layout on mobile without clipping page edges.
- **Precision Zoom & Pan:** Multi-level smooth zoom slider (100% to 300%) with intuitive click-and-drag panning.
- **Visual Navigation:** Interactive thumbnail strip, slider scrubbing, jump-to-page input, Table of Contents (TOC) drawer, and bookmarks.
- **Social Sharing & Fullscreen:** Native Fullscreen API integration, direct page sharing, and OpenGraph server-rendered social preview cards (`/v/:slug`).

### 4. Commercial Business Storefronts & Lead Engine
- **Dedicated Public Business Profiles (`/b/:tenant_slug`):**
  - Showcases all published public publications, brand identity, logo, verified contact info, business hours, and location.
  - Strict visibility filters ensuring internal drafts or private flipbooks never appear on storefronts.
- **In-Reader Commercial Inquiry Hotspots:**
  - Custom lead-capture popups embedded on high-value catalog items.
  - Captures customer name, phone number, email, and specific product inquiries.
- **Commercial Lead Dashboard:**
  - Centralized lead CRM tracking inquiry status (`new`, `contacted`, `converted`, `closed`).
  - Filter by date range, flipbook source, or keyword, with one-click CSV export.

### 5. Educational Publishing & Classroom Presentation Suite
- **Institutional School Portals (`/edu/:tenant_slug`):**
  - Dedicated portals for schools and universities featuring curriculum syllabi, term exam papers, newsletters, and graduation yearbooks.
  - Role-gated document access for students, teachers, and parents.
- **Student Interactive Study Notes:**
  - Floating in-reader study notes drawer with autosave to local browser storage.
  - One-click print/PDF export and quick page referencing.
- **Classroom Presentation Mode:**
  - Fullscreen presenter bar featuring a Virtual Laser Pointer with z-index mesh protection.
  - Presentation pen drawing tools, spotlight focus, and presentation slide transitions.

### 6. Pacific Regional Directory & Ad Marketplace
- **Fiji & Pacific Business Directory (`/directory`):**
  - Regional search directory categorizing merchants, retail supermarkets, educational bodies, and government agencies across Fiji and the South Pacific.
  - Direct links to digital catalogs, WhatsApp chat, and business locations.
- **Self-Serve In-Reader Ad Marketplace:**
  - In-reader banner and sidebar advertising slots.
  - Advertiser self-service onboarding, daily budget controls, impressions tracking, and click-through analytics.
- **Pacific Regional Payment Gateways:**
  - Supports multi-currency pricing (FJD, AUD, NZD, USD).
  - Native integration with Vodafone M-PAiSA, Digicel MyCash, and Pacific commercial bank reconciliations (BSP, ANZ, Westpac).

### 7. Interactive Hotspot & Rich Media Studio
- **WYSIWYG Visual Canvas:** Drag-and-drop hotspot authoring directly over publication pages.
- **Multi-Modal Interactive Types:**
  - 🌐 *External Links:* Target URLs with customizable hover tooltips and new-tab options.
  - 📄 *Internal Page Jumps:* Rapid navigation to table of contents, specific chapters, or back cover.
  - 🎬 *Embedded Video:* YouTube, Vimeo, and direct MP4 modal overlays.
  - 🎵 *Audio Clips:* Background ambience and narrated voiceover playback.
  - 💬 *Product Callouts:* Commerce price badges and product purchase cards.

### 8. Modular Multi-Engine PDF Conversion Pipeline
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

### 9. High-Concurrency Job Queue & Worker Daemon
- **Atomic Queue Claiming:** MySQL 8 `SKIP LOCKED` (with transaction fallback for MariaDB) guarantees workers never claim duplicate jobs.
- **Renewable 5-Minute Leases & Heartbeats:** Every job is bound to a `worker_id` and given a 5-minute lease. Long conversions issue progress heartbeats that renew `lease_expires_at`, preventing stale lock takeover.
- **Tenant Fairness:** Enforces `JOB_MAX_PER_TENANT` (default: 2 concurrent conversions per tenant), preventing queue starvation.
- **Graceful Shutdown:** Handles `SIGTERM` and `SIGINT` signals, finishing the current page conversion before cleanly exiting.

### 10. Multi-Tenant Customer Isolation Architecture
- **Strict Database Scoping:** All queries touching publications, pages, hotspots, or API keys are validated against `tenant_id` via `TenantScope` middleware and `TenantContext::requireId()`.
- **Zero Default Fallback:** Prohibits implicit fallback to `tenant_id = 1` or unauthenticated defaults.
- **Filesystem Isolation:** All files are strictly partitioned under `/storage/tenants/{tenant_id}/publications/{flipbook_id}/`.
- **Storage Registry:** Real-time tracking of file sizes, SHA-256 hashes, and verification timestamps in `tenant_storage_objects`.
- **Transactional Outbox Pattern:** Application state changes and webhook events are committed atomically within one transaction via `outbox_events` and drained by `outbox_worker.php`.

### 11. Enterprise Security, Cryptographic Hardening & Production Gates
- **Automated Runtime CSPRNG Secrets:** Automatically provisions 256-bit cryptographically secure secrets via `bin2hex(random_bytes(32))` stored in protected `.crypto_secrets.json`, rejecting weak placeholders.
- **Scoped API Key Enforcement:** SHA-256 hashed API keys enforced through RBAC permissions (`flipbooks:read`, `flipbooks:write`, `erp:publish`, `analytics:read`).
- **Session Families & Token Replay Defense:** Replay of an already-consumed refresh token immediately revokes that device's entire session family and logs a critical security alert.
- **Two-Factor Authentication (2FA):** RFC 6238 TOTP Authenticator apps and transactional Email OTP.
- **Production Hardening Gates:**
  - Strict database transaction rollback handling (`if (Db::pdo()->inTransaction())`).
  - Atomic Redis cache locks via UUID tokens and atomic Lua script releases.
  - Atomic filesystem lock fallbacks (`flock(LOCK_EX | LOCK_NB)`).
  - Cloudflare R2 / AWS S3 cloud storage adapters with stream chunking.

### 12. Enterprise Integrations Hub
- **RESTful API Keys:** Create, rotate, and revoke scoped API keys with rate-limiting.
- **Webhooks Engine:** Real-time outbound HTTP webhooks signed with `HMAC-SHA256` in the `X-Flipex-Signature` header.
- **Directory & SSO Connectors:** LDAP / Active Directory and SAML 2.0 Single Sign-On configurations.
- **WordPress Integration:** Bundled official Nuvis Flipex WordPress plugin for embedding flipbooks via shortcode `[flipex id="..."]`.
- **ERP Catalogue Synchronization:** Automated ingestion endpoint for corporate catalogues (`/api/v1/integrations/erp/publish-catalogue`).

### 13. Commercial Billing, Tax Invoicing & Fiji Bank Reconciliation
- **Tenant Subscription Portal:** Self-service plan upgrades, billing cycles (Monthly, Quarterly, Annual), and usage meter tracking.
- **Three-Stage Secure Payment Architecture:** Customer Payment Submission $\rightarrow$ Verification (Webhook or Finance Confirmation) $\rightarrow$ Atomic Subscription Activation.
- **Fiji Commercial Invoicing:** TIN/VAT registration compliance (`FJ-TIN`), official PDF tax invoice generation, and bank payment reconciliation (BSP, ANZ, Westpac).

### 14. DevOps Telemetry, Health Monitoring & Backups
- **System Telemetry:** Live CPU utilization, system memory, disk quotas, and document conversion latency.
- **Dead Letter Queue (DLQ):** Failed job inspection, payload review, error stack traces, and manual/automatic retry.
- **Central Exception Reporter:** Structured JSONL logging (`backend/storage/logs/flipex.jsonl`) capturing stack traces and tenant context.
- **Automated Backups:** One-click full database and storage asset archive generation with SHA-256 checksum verification.

---

## 🛠️ Recent System Updates, Fixes & Hardening (Changelog)

The following notable updates, bug fixes, and architectural hardening milestones have been deployed across recent release cycles:

### Release `e276426` — High-Attraction 3-Gradient UI & Studio Canvas Expansion
- **Eliminated Flat Blue Buttons:** Converted all primary, secondary, and tertiary action buttons across the Studio to 5 high-attraction 3-stop linear gradient variants (*Cosmic Aurora*, *Tropical Emerald*, *Sunset Radiance*, *Royal Orchid*, *Ocean Teal Glow*).
- **Collapsible Studio Panels:** Added collapsible Left Tools (`⇤ Tools`) and Right Property Inspector (`Inspector ⇥`) panels, increasing center canvas width from ~600px to over 1,200px+ with floating edge re-open handles.
- **Auto "Fit to Screen" Scaler:** Added dynamic viewport calculation in the studio header zoom bar, auto-scaling document spreads to fit the available container cleanly.
- **Contextual Inspector Upgrades:** Added Layer Z-Index ordering (*▲ Bring Forward* / *▼ Send Backward*), Typography Selector (5 curated font families), 4-way text alignment, and a live WhatsApp test link generator.

### Release `276ba17` & `ed76be6` — PHP 8.3 Strict Typing & Transaction Safety
- **Strict Audit Parameter Fix:** Corrected parameter ordering in `Audit::log($action, $entityType, $entityId, ...)` inside `StudioController.php` to resolve PHP 8.3 `strict_types=1` `TypeError` where integer tenant IDs were passed in place of action strings.
- **Transaction Rollback Safety:** Wrapped all database rollback calls in `if (Db::pdo()->inTransaction())` to eliminate uncaught `PDOException: There is no active transaction` during error handling.
- **Studio Header Wrap Fix:** Removed `flexWrap: 'wrap'` from the studio header, ensuring single-line desktop layout without button overlapping.
- **Background Swatch Grid:** Replaced full-width white bars with clean 4-column color swatch grids.

### Release `753034c` — Light Mode Visibility & Contrast Polish
- **Color Contrast Enforcement:** Resolved text and icon visibility issues across Flipex Studio gallery and canvas workspace in Light Mode.
- **Border & Background Refinements:** Added explicit border and background variables ensuring crisp element boundaries against white backdrops.

### Release `7762184` & `746ff36` — Flipex Studio Creation Modes & Vector PDF Export
- **Specialized Creation Modes:** Built Catalogue Mode, Magazine Mode, Yearbook Mode, and Keepsake Album Mode with dedicated layout components.
- **Auto-Folio & Auto-TOC:** Implemented automated running headers and dynamic Table of Contents compilation.
- **300 DPI Vector PDF Export:** Implemented standalone vector PDF export endpoint (`/studio/documents/{id}/export-pdf?print=1`).
- **Direct Flipbook Publishing:** Integrated 1-click publishing compiling Studio DOM/SVG documents directly into interactive flipbooks.

### Release `0a8ea67` & `ff45dae` — Production Hardening, Geographics & Viewer Layering
- **Precision Fiji Geolocation:** Refined IP geolocation resolver to accurately identify Fiji and South Pacific visitors, eliminating false US country classifications.
- **Fiji Timezone Standardization:** Defaulted display timestamps to Fiji Time (`Pacific/Fiji`) while standardizing backend database records in UTC.
- **Laser Pointer Z-Index Overlay:** Fixed Virtual Laser Pointer layering in Classroom Presentation Mode so the laser beam remains visible over 3D page meshes.
- **Drawer Overlap Resolution:** Corrected side-navigation z-index preventing clipping on Table of Contents and Study Note modals.
- **Atomic Cache Locks:** Implemented UUID ownership validation and Lua script release for Redis locks, paired with atomic `flock` filesystem fallback.
- **Cloud Storage (S3/R2):** Deployed complete native S3/Cloudflare R2 storage adapter with chunked streaming and zero hardcoded secret fallbacks.

### Release `9e5d64c`, `274806b` & `6bf9837` — Commercial, Educational & Pacific Expansion
- **Pacific Regional Directory:** Deployed `/directory` portal with multi-category search and verified merchant profiles.
- **Commercial Storefronts:** Deployed public business profiles (`/b/:tenant_slug`) and commercial lead inquiry modals.
- **Educational Publishing:** Deployed school portals (`/edu/:tenant_slug`), student study notes drawer, and classroom presentation mode.

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
                  +-----------------------+                    +-----------------------+
                  v                                                                    v
+------------------------------------+                               +------------------------------------+
|          MySQL 8.4 Database        |                               |        Background Workers          |
|  - Multi-Tenant Data Isolation     |                               |  - JobRunner (SKIP LOCKED Leases)  |
|  - Session Families & Token Hashes |                               |  - Outbox Dispatcher (Webhooks)    |
|  - Flipex Studio Relational Schema |                               |  - Ghostscript / Poppler / Imagick |
|  - Immutable Audit & Event Ledgers |                               |  - S3/R2 Cloud Object Sync         |
+------------------------------------+                               +------------------------------------+
```

| Component | Technology | Description |
|---|---|---|
| **Frontend Framework** | React 18.3, TypeScript 5.5 | SPA built on BoardUI primitives, React Router 6, and Vite 5. |
| **Creation Engine** | Flipex Studio (DOM/SVG Canvas) | Browser-based visual layout engine with drag-and-drop, snap-to-grid, and print bleeds. |
| **Viewer Engine** | StPageFlip + Canvas 2D | 3D physics-based book-turn simulation with adaptive DPR and sliding image windowing. |
| **Backend Framework** | PHP 8.3+, Slim 4, PSR-7 / PSR-15 | RESTful API gateway with token auth, tenant isolation, and rate-limiting. |
| **Database** | MySQL 8.0 / 8.4 Enterprise | InnoDB with composite foreign keys, JSON coordinate columns, and `SKIP LOCKED`. |
| **PDF Rasterization** | Ghostscript (`gs`), Poppler (`pdftoppm`), Imagick | Multi-engine high-fidelity rasterizer producing WebP, AVIF, and high-res JPEG assets. |
| **Print PDF Generation** | Vector Headless Compiler | Direct vector 300 DPI PDF generation for commercial print readiness. |
| **Cryptographic Security** | Argon2id, CSPRNG, RFC 6238 TOTP | Password hashing, token encryption, and HMAC-SHA256 signature verification. |
| **Transactional Mail** | PHPMailer 6.9, SMTP SSL/TLS | Responsive HTML transactional emails with local file logging fallbacks. |

---

## 📂 Directory Layout

```
Nuvis-Flipex/
├── AGENTS.md                          # BoardUI Standard & Multi-tenant Guidelines
├── README.md                          # Master documentation & changelog
├── INSTALLATION.md                    # Detailed deployment and configuration manual
├── .htaccess                          # Apache / LiteSpeed root gateway & SPA routing
├── backend/
│   ├── bin/
│   │   ├── install.php                # CLI installation wizard & secret generator
│   │   ├── migrate.php                # Master migration runner (v1 to v13)
│   │   ├── migrate_v2.php - v12.php   # Versioned database migrations
│   │   ├── worker.php                 # Asynchronous PDF conversion worker daemon
│   │   ├── outbox_worker.php          # Transactional outbox webhook dispatcher
│   │   ├── backup.php                 # Database & storage backup utility
│   │   ├── tenant_maintenance.php     # Daily analytics & temporary file maintenance
│   │   └── test_security.php          # 24-point security and tenant isolation test suite
│   ├── public/
│   │   ├── index.php                  # API gateway entry point & SSR OpenGraph router
│   │   └── .htaccess                  # Slim URL rewrite rules
│   ├── src/
│   │   ├── Controllers/               # StudioController, CommercialController, EduController, etc.
│   │   ├── Database/                  # Migration classes and schema builders
│   │   ├── Infrastructure/            # MigrationRunner, ObjectStorageAdapter, Central Exception Reporter
│   │   ├── Middleware/                # Auth, Cors, RateLimit, TenantScope
│   │   └── Support/                   # Audit, CryptoSecrets, Db, JobRunner, PdfRenderer, Storage, etc.
│   ├── storage/
│   │   ├── .crypto_secrets.json       # Protected 256-bit provisioned encryption secrets
│   │   ├── logs/                      # Structured JSONL application logs
│   │   └── tenants/                   # Isolated customer PDF files & converted assets
│   ├── composer.json                  # PHP package definitions
│   └── .env.example                   # Environment configuration template
└── frontend/
    ├── src/
    │   ├── api/                       # API client with token interceptors
    │   ├── auth/                      # Authentication provider & 2FA state
    │   ├── components/                # BoardUI primitives, FlipbookViewer, HotspotEditor, Studio
    │   │   └── viewer/adaptiveLoading # Memory & network-aware image preloading & DPR clamping
    │   ├── pages/                     # FlipexStudio, Dashboard, PublicViewer, PublicDirectory, EduPortal, etc.
    │   ├── main.tsx                   # Lazy-loaded route boundaries & Suspense wrappers
    │   └── styles.css                 # BoardUI tokens & 3-Gradient High-Attraction suite
    ├── package.json                   # NPM dependencies
    └── vite.config.ts                 # Vite bundler configuration & manual chunking
```

---

## 🗄️ Database Schema & Migrations

Nuvis Flipex features a fully managed, versioned migration pipeline tracked in `schema_migrations` and executed via `MigrationRunner`:

| Version Key | Scope & Capabilities Added |
|---|---|
| **`2026_11_01_000001_initial_core_schema`** | Core schema: `plans`, `tenants`, `users`, `flipbooks`, `pages`, `hotspots`, `analytics`. |
| **`2026_11_02_000002_multi_tenant_isolation`** | Dual 2FA (`totp_secret`, `two_factor_code`), brute-force lockout, and isolated storage registries. |
| **`2026_11_03_000003_publishing_lifecycle_and_jobs`** | Asynchronous job queues (`jobs`), Dead Letter Queue (DLQ), and publication ledgers. |
| **`2026_11_04_000004_commercial_analytics_and_heatmaps`** | Advanced reader dwell heatmaps, zoom analytics, and geographic tracking tables. |
| **`2026_11_05_000005_enterprise_integrations_and_billing`** | Scoped API keys (`api_keys`), webhooks, scheduled reports, and commercial tax invoices. |
| **`2026_11_06_000006_modular_architecture_and_devops`** | Error telemetry, backup registries, and multi-tenant outbox events (`outbox_events`). |
| **`2026_11_11_000007_payment_security_and_api_key_controls`** | Payment transaction verification, M-PAiSA / MyCash reference fields, and rate limiters. |
| **`2026_11_16_000008_tenant_roles_and_granular_rbac`** | Custom tenant roles, granular RBAC permissions matrix, and role assignment tables. |
| **`2026_11_17_000009_brand_kits_and_publisher_studio`** | Publisher brand kits (custom palettes, fonts, watermarks, domain mapping). |
| **`2026_11_17_000010_commercial_leads_and_biz_storefront`** | Public business storefronts (`business_profiles`) and commercial buyer lead inquiries (`inquiries`). |
| **`2026_11_17_000011_educational_publishing`** | Educational institutional portals, classroom curriculum modules, and student study notes. |
| **`2026_11_17_000012_pacific_directory_and_ads`** | Pacific business directory listings and self-serve advertising campaign marketplace. |
| **`2026_11_17_000013_flipex_studio_schema`** | Complete Flipex Studio schema: `studio_documents`, `studio_document_pages`, `studio_templates`, `studio_assets`, `studio_publications`. |

To run all pending migrations:
```bash
php backend/bin/migrate.php
```

To inspect migration status:
```bash
php backend/bin/migrate.php --status
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
   - `/b/:slug` ➔ Routes to public business storefronts.
   - `/edu/:slug` ➔ Routes to public school portals.
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

### 3. Analytics Maintenance & Cleanup
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
- Storefront draft isolation prohibiting non-public or unapproved documents.
- Atomic cache lock ownership validation under simulated race conditions.

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
