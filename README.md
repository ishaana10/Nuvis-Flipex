# Nuvis Flipex — Enterprise Interactive Digital Publication Platform

[![Proprietary Software](https://img.shields.io/badge/License-Proprietary-amber.svg)](mailto:nilesh@nuvistechnologies.com.fj)
[![Nuvis Technologies](https://img.shields.io/badge/Company-Nuvis%20Technologies-f59e0b.svg)](mailto:nilesh@nuvistechnologies.com.fj)
[![PHP](https://img.shields.io/badge/PHP-8.3%2B-blue.svg)](https://www.php.net/)
[![MySQL](https://img.shields.io/badge/MySQL-8.0%20%7C%208.4-informational.svg)](https://www.mysql.com/)
[![React](https://img.shields.io/badge/React-18.3-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178c6.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Bundler-Vite%205-646cff.svg)](https://vitejs.dev/)
[![Design System](https://img.shields.io/badge/Design%20System-BoardUI%20%2B%203--Gradient-0284c7.svg)](https://github.com/BoardUI/boardui)
[![Visual Studio](https://img.shields.io/badge/Flipex%20Studio-Developer%20Alpha%20Preview-0284c7.svg)](#-flipex-studio--native-visual-creation-engine)
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
2. [Visual Identity, BoardUI Standard & Dynamic Palette](#-visual-identity-boardui-standard--dynamic-palette)
3. [Core Feature Matrix](#-core-feature-matrix)
   - [1. Flipex Studio — Native Visual Creation Engine (Developer Alpha)](#1-flipex-studio--native-visual-creation-engine-developer-alpha)
   - [2. Dynamic 3-Gradient System & Canvas Workspace](#2-dynamic-3-gradient-system--canvas-workspace)
   - [3. Interactive 3D Flipbook Reader](#3-interactive-3d-flipbook-reader)
   - [4. Commercial Business Storefronts & Lead Engine](#4-commercial-business-storefronts--lead-engine)
   - [5. Educational Publishing & Classroom Presentation Suite](#5-educational-publishing--classroom-presentation-suite)
   - [6. Pacific Regional Directory & Ad Marketplace](#6-pacific-regional-directory--ad-marketplace)
   - [7. Interactive Hotspot & Rich Media Studio](#7-interactive-hotspot--rich-media-studio)
   - [8. Modular Multi-Engine PDF Conversion Pipeline](#8-modular-multi-engine-pdf-conversion-pipeline)
   - [9. High-Concurrency Job Queue & Worker Daemon](#9-high-concurrency-job-queue--worker-daemon)
   - [10. Multi-Tenant Customer Isolation Architecture](#10-multi-tenant-customer-isolation-architecture)
   - [11. Enterprise Security, Cryptographic Hardening & Production Gates](#11-enterprise-security-cryptographic-hardening--production-gates)
   - [12. Developer Session Security & Inactivity Center](#12-developer-session-security--inactivity-center)
   - [13. Enterprise Integrations Hub](#13-enterprise-integrations-hub)
   - [14. Commercial Billing, Tax Invoicing & Fiji Bank Reconciliation](#14-commercial-billing-tax-invoicing--fiji-bank-reconciliation)
   - [15. DevOps Telemetry, Health Monitoring & Backups](#15-devops-telemetry-health-monitoring--backups)
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
- **Native Visual Authoring (Flipex Studio):** Create documents from scratch with Canva-like visual tools, specialized e-commerce product cards, multi-column magazine articles, yearbook rosters, and keepsake albums. (Currently in Developer Alpha Preview).
- **Direct Dual-Path Publishing:** One-click compilation of studio canvases directly into interactive vector flipbooks, or instant export to vector 300 DPI Print PDFs.
- **Commercial & E-Commerce Suite:** Direct WhatsApp 1-tap ordering, public storefront directories (`/b/:tenant_slug`), hotspot inquiry forms, and lead generation tracking.
- **Educational Publishing:** School portals (`/edu/:tenant_slug`), student interactive study notes, and high-visibility classroom presentation modes with laser pointer overlay.
- **Pacific Regional Localization:** Precision Fiji & Pacific IP geolocation, Fiji Time (`Pacific/Fiji`) timezone alignment, M-PAiSA / MyCash billing, and local bank reconciliation (BSP, ANZ, Westpac).
- **Enterprise Isolation & Zero-Trust Security:** Strict multi-tenant partitioning, atomic job queues with `SKIP LOCKED`, token replay defense, configurable session lifetime security, and 24 certified security invariants.

---

## 🎨 Visual Identity, BoardUI Standard & Dynamic Palette

Nuvis Flipex adheres to the **BoardUI Standard** ([boardui/boardui](https://github.com/BoardUI/boardui)) elevated with a modern **Dynamic 3-Gradient High-Attraction Color System**:

### 1. Zero-Purple High-Attraction Brand Architecture
In strict adherence to brand standards, all purple color tones have been eliminated across the platform in favor of clean **Nuvis Dynamic Ocean Blue**, **Emerald**, **Warm Amber**, and **Titanium Slate**:
- **Pacific Azure / Dynamic Ocean** (`linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #0c4a6e 100%)`): Primary creation actions, including *Create New Document*, *Launch Studio 🚀*, active document filter pills, active tool categories, *+ Folio*, and CSV auto-generation.
- **Tropical Emerald** (`linear-gradient(135deg, #059669 0%, #10b981 50%, #047857 100%)`): Commerce and publishing actions, including *Publish to Flipbook 🚀*, *Open Live Reader*, card *Reader* badges, Product Card WhatsApp ordering, and standalone WhatsApp chat buttons.
- **Sunset Ember** (`linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #b91c1c 100%)`): Promotional and highlight callouts, including *Auto TOC 📑*, *Discount Splash Badges*, *Best Seller Ribbons*, and *Principal's Commendation Notes*.
- **Nordic Slate / Titanium** (`linear-gradient(135deg, #1e293b 0%, #334155 50%, #475569 100%)`): High-end export and keepsakes, including *Print PDF 🖨️*, author bylines, senior graduate rosters, and Polaroid scrapbook frames.
- **Ocean Teal Glow** (`linear-gradient(135deg, #0d9488 0%, #06b6d4 50%, #0284c7 100%)`): Structural operations, including *Save 💾*, card containers, and inspector toggle controls.

### 2. Curated 3-Gradient Document Presets
Flipex Studio includes 8 curated 3-gradient presets matching the clean corporate aesthetic:
1. **Pacific Azure:** `#0284c7` (0%) ➔ `#0369a1` (50%) ➔ `#0c4a6e` (100%)
2. **Sunset Ember:** `#f59e0b` (0%) ➔ `#ea580c` (50%) ➔ `#b91c1c` (100%)
3. **Tropical Emerald:** `#064e3b` (0%) ➔ `#059669` (50%) ➔ `#10b981` (100%)
4. **Ocean Abyss:** `#0f172a` (0%) ➔ `#0e7490` (50%) ➔ `#14b8a6` (100%)
5. **Nordic Slate:** `#1e293b` (0%) ➔ `#334155` (50%) ➔ `#475569` (100%)
6. **Clean Frost:** `#f8fafc` (0%) ➔ `#e2e8f0` (50%) ➔ `#cbd5e1` (100%)
7. **Warm Parchment:** `#fffbeb` (0%) ➔ `#fef3c7` (50%) ➔ `#fed7aa` (100%)
8. **Midnight Noir:** `#020617` (0%) ➔ `#0f172a` (50%) ➔ `#1e293b` (100%)

### 3. High-Contrast Light & Dark Mode Compatibility
Every button, card, modal, and tool swatch maintains WCAG-compliant contrast ratios across both Dark Mode (`#090d16` / `#0f172a`) and Light Mode (`#f8fafc` / `#ffffff`). Input fields use high-contrast white text on dark slate backgrounds (`#0f172a`) with blue focus outlines (`#0284c7`), ensuring crisp readability for all dimensional and property controls.

---

## 🚀 Core Feature Matrix

### 1. Flipex Studio — Native Visual Creation Engine (Developer Alpha)
A complete, browser-based visual layout engine allowing users to author professional publications without third-party desktop tools.
> [!NOTE]
> Flipex Studio is currently in **Developer Alpha Preview** (`user.role === 'admin'`) and restricted from general workspaces while undergoing final feature hardening. Non-admin tenants see a descriptive Developer Preview notification card.

- **Document Hub & Starter Templates:** Instant document bootstrapping with blank canvases or prebuilt templates for retail supermarket specials, electronic showcases, school yearbooks, lifestyle magazines, and luxury photo albums.
- **Catalogue & WhatsApp E-Commerce Mode:**
  - Standard and tech product cards with price badges, original strike-through prices, SKU tags, and specifications callouts.
  - Direct 1-tap WhatsApp buy buttons pre-populated with localized phone numbers (`+679...`) and order inquiry text.
- **Editorial Magazine Mode:**
  - Balanced 2-column and 3-column article layouts with customizable column gaps.
  - Linked text frames with character overflow streaming across consecutive pages (`linkedNextId` / `linkedPrevId`).
  - Decorative Drop-Caps and highlighted author bylines with avatar badges.
- **School & Class Yearbook Mode:**
  - 4-student graduate portrait matrices with academic awards (*Dux of School*, *Sports Captain*, *Head Boy/Girl*), leadership roles, and senior quotes.
  - Principal's commendation boxes and academic faculty profiles.
- **Keepsake Photo Album Mode:**
  - Romantic polaroid frames with natural handwritten tilt angles (-5° to +5°).
  - Multi-photo collages, shadow frame styles, and memory note caption ribbons.
- **Automated Publishing Utilities:**
  - **Auto Running Folio:** Injects running header text and page numbers across spreads with dynamic token resolution (`{page}`, `{total}`, `{title}`, `{section}`, `{date}`).
  - **Auto Table of Contents (TOC):** Scans document pages and compiles a Table of Contents with dot leaders and jump targets.
  - **CSV Batch Importer:** Rapidly generates entire product catalogues or yearbook graduate rosters from uploaded or pasted CSV data.
- **Direct Dual-Path Output:**
  - **High-Resolution 300 DPI Print PDF:** Direct vector PDF export endpoint (`/api/v1/studio/documents/{id}/export-pdf?print=1`).
  - **1-Click Flipbook Publishing:** Compiles studio vector DOM/SVG directly into an interactive, mobile-optimized live reader (`/v/:slug`).

### 2. Dynamic 3-Gradient System & Canvas Workspace
- **Deduplicated Background Controls (Right Panel Only):**
  - All background controls reside **exclusively in the right Inspector panel** under `🎨 Page & 3-Gradient`. The left tools drawer contains a clean quick-link to open the Page Inspector, eliminating redundant UI.
  - **Full 9-Angle Alignment Compass:** Interactive compass supporting `↖ 315°`, `⬆ 0°`, `↗ 45°`, `⬅ 270°`, `⊙ Radial Glow`, `➔ 90°`, `↙ 225°`, `⬇ 180°`, and `↘ 135°`.
  - **Batch Synchronisation:** 1-click *Apply to All Pages* button instantly applies background styling across the entire publication.
- **Maximized Desktop Canvas:**
  - Full widescreen canvas (`100vw` by `100vh`) with collapsible Left Tools sidebar (`⇤ Tools`) and Right Property Inspector (`Inspector ⇥`).
  - Automatically hides general dashboard rail navigation when inside the Studio canvas.
- **Auto "Fit to Screen" Scaler:**
  - Integrated **Fit** button calculates container dimensions minus safe margins, automatically framing document spreads at optimal zoom without clipping.
  - Quick zoom presets (`-`, `+`, `Fit`, and 30% to 200% scale).
- **High-Contrast Inspector Inputs:**
  - Form inputs (`X`, `Y`, `W`, `H`, rotation, font size) feature pure white typography (`#ffffff`, font-weight 700) on `#0f172a` slate inputs with `#0284c7` focus rings.

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
  - Validates `%PDF-` magic header bytes and `%%EOF` trailer marker.
  - Detects and rejects password-encrypted PDFs.
  - Enforces plan limits against both metadata and the actual rendered page count.
- **On-Demand Level 3 High-Resolution Rendering:**
  - 280 DPI ultra-high-resolution zooms rendered on demand with non-blocking per-page file locks (`flock(LOCK_EX | LOCK_NB)`).

### 9. High-Concurrency Job Queue & Worker Daemon
- **Atomic Queue Claiming:** MySQL 8 `SKIP LOCKED` (with transaction fallback for MariaDB) guarantees workers never claim duplicate jobs.
- **Renewable 5-Minute Leases & Heartbeats:** Every job is bound to a `worker_id` and given a 5-minute lease. Long conversions issue progress heartbeats renewing `lease_expires_at`.
- **Tenant Fairness:** Enforces `JOB_MAX_PER_TENANT` (default: 2 concurrent conversions per tenant).
- **Graceful Shutdown:** Handles `SIGTERM` and `SIGINT` signals, finishing the current page conversion before cleanly exiting.

### 10. Multi-Tenant Customer Isolation Architecture
- **Strict Database Scoping:** All queries touching publications, pages, hotspots, or API keys are validated against `tenant_id` via `TenantScope` middleware and `TenantContext::requireId()`.
- **Zero Default Fallback:** Prohibits implicit fallback to `tenant_id = 1` or unauthenticated defaults.
- **Filesystem Isolation:** All files are strictly partitioned under `/storage/tenants/{tenant_id}/publications/{flipbook_id}/`.
- **Transactional Outbox Pattern:** Application state changes and webhook events are committed atomically via `outbox_events` and drained by `outbox_worker.php`.

### 11. Enterprise Security, Cryptographic Hardening & Production Gates
- **Automated Runtime CSPRNG Secrets:** Automatically provisions 256-bit cryptographically secure secrets via `bin2hex(random_bytes(32))` stored in protected `.crypto_secrets.json`.
- **Scoped API Key Enforcement:** SHA-256 hashed API keys enforced through RBAC permissions (`flipbooks:read`, `flipbooks:write`, `erp:publish`, `analytics:read`).
- **Two-Factor Authentication (2FA):** RFC 6238 TOTP Authenticator apps and transactional Email OTP.

### 12. Developer Session Security & Inactivity Center
- **Configurable JWT Access Token Lifetime:**
  - Managed dynamically via `SessionSecurity.php` and persisted in `system_settings`.
  - Default: **1 hour (3600s)**. Presets available: 15 min (Strict), 1 hour (Balanced), 4 hours (Studio), 24 hours (Extended).
- **Token Rotation Grace Window (30s):**
  - Solves autosave race conditions. When multiple asynchronous requests (e.g., debounced studio saves) fire concurrently, tokens refreshed within the 30-second window are honored without false replay revoking.
- **Automated Keep-Alive Heartbeat:**
  - Active 4-minute heartbeat in `AuthContext.tsx` pinging `/api/v1/auth/keepalive`, renewing tokens and preventing drops during intense authoring sessions.
- **DevOps Management Tab (`/devops`):**
  - Dedicated **Session Security & Expiration** sub-tab showing live metrics for Active Token Grants, Session Families, Replay Revocations, Cookie SameSite policies, and Inactivity Idle Timeouts.
  - Emergency One-Click Action: *Revoke All Platform Sessions*.

### 13. Enterprise Integrations Hub
- **RESTful API Keys:** Create, rotate, and revoke scoped API keys with rate-limiting.
- **Webhooks Engine:** Real-time outbound HTTP webhooks signed with `HMAC-SHA256` in the `X-Flipex-Signature` header.
- **Directory & SSO Connectors:** LDAP / Active Directory and SAML 2.0 Single Sign-On configurations.
- **WordPress Integration:** Bundled official Nuvis Flipex WordPress plugin for embedding flipbooks via shortcode `[flipex id="..."]`.
- **ERP Catalogue Synchronization:** Automated ingestion endpoint for corporate catalogues (`/api/v1/integrations/erp/publish-catalogue`).

### 14. Commercial Billing, Tax Invoicing & Fiji Bank Reconciliation
- **Tenant Subscription Portal:** Self-service plan upgrades, billing cycles (Monthly, Quarterly, Annual), and usage meter tracking.
- **Three-Stage Secure Payment Architecture:** Customer Payment Submission $\rightarrow$ Verification (Webhook or Finance Confirmation) $\rightarrow$ Atomic Subscription Activation.
- **Fiji Commercial Invoicing:** TIN/VAT registration compliance (`FJ-TIN`), official PDF tax invoice generation, and bank payment reconciliation (BSP, ANZ, Westpac).

### 15. DevOps Telemetry, Health Monitoring & Backups
- **System Telemetry:** Live CPU utilization, system memory, disk quotas, and document conversion latency.
- **Dead Letter Queue (DLQ):** Failed job inspection, payload review, error stack traces, and manual/automatic retry.
- **Central Exception Reporter:** Structured JSONL logging (`backend/storage/logs/flipex.jsonl`) capturing stack traces and tenant context.
- **Automated Backups:** One-click full database and storage asset archive generation with SHA-256 checksum verification.

---

## 🛠️ Recent System Updates, Fixes & Hardening (Changelog)

The following notable updates, bug fixes, and architectural hardening milestones have been deployed across recent release cycles:

### Release Sprint 5 — Performance, Offline Resiliency & Pacific Island Bandwidth Optimization
- **IndexedDB Structured Cloning Storage Engine (`frontend/src/utils/studioIndexedDb.ts`):**
  - Provides multi-megabyte structured cloning storage for 50+ page documents, eliminating the browser 5MB `localStorage` quota crashes during long offline design sessions.
  - Full API: `saveOfflineDraft(draft)`, `getOfflineDraft(docId)`, `clearOfflineDraft(docId)`, and `listAllOfflineDrafts()`.
- **Network Drop Protection & Reconnection Synchronization:**
  - Online/offline event monitoring (`navigator.onLine` + `window.addEventListener`).
  - Buffers multi-page document changes locally with `pendingOfflineSync` state and `🟠 Offline (Saved to Device)` status pill.
  - Automatically syncs pending changes to `/api/v1/studio/documents/{id}/autosave` immediately when network connectivity is restored, with zero data loss.
- **Pacific Island Bandwidth Optimization & Data Saver Mode:**
  - Auto-detects 2G/3G and satellite network tiers via `navigator.connection` (`saveData`, `effectiveType`).
  - Prominent top-bar `⚡ Data Saver: ON/OFF` toggle with emerald/slate badge.
  - Intelligently rewrites high-resolution image URLs to compressed lightweight assets (`w=350&q=60`), slashing data consumption by up to 75% on high-latency Pacific island networks (Fiji, Tonga, Samoa, Vanuatu, Solomon Islands, PNG).
  - Stretches autosave debouncing to 2.5s on slow networks to eliminate HTTP queue congestion.
- **Bottom Filmstrip Spatial Virtualization:**
  - Implements dynamic spatial windowing on documents with >12 pages: only pages within 4 positions of the active page (`Math.abs(pageIdx - activePageIndex) <= 4`) render full miniature SVG vectors; distant pages render high-performance proxy cards with page numbers and element count badges.
  - Maintains silky-smooth 60 FPS scrolling across large 50+ page commercial wholesale catalogues.
- **100% Zero Purple Elimination:**
  - Completely purged all residual purple and indigo tokens (`#818cf8`, `#a5b4fc`, `#f5d0fe`, `#c7d2fe`, `#1e1b4b`) across `FlipexStudio.tsx` and stylesheets. Standardized strictly on Pacific Ocean Blue (`#0284c7`, `#0369a1`), Emerald (`#059669`), Slate (`#0f172a`, `#1e293b`), and Amber (`#f59e0b`).
- **Automated Verification Test Suite:**
  - Added 5 new automated regression tests to `StudioDesignSchemaTest.php` validating IndexedDB contract compliance, bandwidth-adaptive image optimization, spatial windowing calculations, and Zero Purple compliance (39 / 39 tests passing).

### Release Sprint 4 — Data Binding, Dynamic Catalogues & Advanced Multi-Page Publishing
- **Server-Side Live Data Sync (`POST /api/v1/studio/documents/{id}/data-sync`):**
  - High-performance atomic synchronization of pricing, was-prices, promotional badges, inventory stock status, and product images directly into `studio_document_pages` with audit ledger logging.
  - Supports matching by `sku`, `name`, or `id` with document-wide or page-scoped operations.
- **Pacific Regional Currency Switcher (`POST /api/v1/studio/documents/{id}/currency-convert`):**
  - Native multi-currency engine supporting 9 South Pacific island currencies: **FJD** (Fiji $), **AUD** (Australia $), **NZD** (New Zealand $), **USD** (US $), **PGK** (PNG Kina), **SBD** (Solomon Islands SI$), **TOP** (Tonga T$), **WST** (Samoa WS$), and **VUV** (Vanuatu Vatu).
  - Exchange rate multipliers with customizable rounding modes (Exact `.XX`, Retail Psychological `.99`, Whole Unit / No Cents).
- **Dynamic Template Token Resolver:**
  - One-click resolution of dynamic editorial tokens (`{{doc.title}}`, `{{doc.category}}`, `{{page.number}}`, `{{page.total}}`, `{{date}}`, `{{year}}`, `{{company}}`) across text frames and articles.
- **2-Page Connected Magazine Story Generator:**
  - One-click generation of two facing pages with linked editorial article columns, enlarged serif drop-caps, kicker category headers, deck subtitles, author byline cards, pull quotes, image frames, running folios, and automatic centerfold spine view (`spreadMode`).
- **Real-Time Overflow Meter & Flow Diagnostics:**
  - In-inspector capacity meter showing character and word metrics, frame utilization %, and live warnings when long-form text exceeds frame boundaries before flowing to next pages.
- **Unified Commercial Preflight Inspector:**
  - Top-bar preflight quality tool scanning all document pages for missing images, placeholder graphics, unpriced products, missing SKUs, and empty text frames, with one-click jump navigation.
- **Flipbook Preview & Live Reader Healing:**
  - Hardened `PublicController.php` and `StudioController.php` to auto-heal flipbook status from `draft`/`approved` to `ready` upon publication, eliminating the "flipbook doesn't exist or isn't published" reader error.
- **100% Zero Purple Audit:**
  - Completely purged all residual purple and indigo tokens (`#1e1b4b`, `#312e81`, `#6366f1`) from `FlipexStudio.tsx`, `PublicController.php`, and `StudioController.php` SVG compositors.
- **Automated Test Suite Expansion:**
  - Added 5 new automated regression tests to `StudioDesignSchemaTest.php` covering data sync, currency conversion, Pacific currency formatting accuracy, and flipbook auto-healing (34 / 34 tests passing).

### Release Sprint 3 — Core Editor Capabilities & Commercial Blocks
- **Editorial Magazine & Article Layouts (`article` / `column_text`):**
  - Added decorative enlarged drop-cap initials (48px serif), kicker category headers, standfirst deck subtitles, and author bylines (avatar, name, role).
  - Supports 1, 2, and 3 column text layout with configurable column gutters and responsive column balances.
- **Commercial FMCG Product Cards with 1-Tap WhatsApp Ordering (`productCard`):**
  - Promo splash badges (`SPECIAL 20% OFF`, `HOT DEAL`), stock status pills (`In Stock`, `Low Stock`, `Pre-Order`), customer star ratings (1-5), SKU code generator (`🎲 Gen`), and dual pricing (current + strikethrough was price).
  - Generates direct 1-tap WhatsApp click-to-chat checkout link: `https://wa.me/{number}?text=Bula! I would like to order: {name} ({price}) SKU: {sku}`.
- **School Yearbook Student Profile Cards (`studentCard`):**
  - Circular student portraits, academic honours / Dux badges (`🏆 Dux of Class 2026`), graduation class, and inspirational quotes.
  - Curated Pacific student stock photo integration.
- **Automated Dynamic Table of Contents (TOC) & Running Folios:**
  - Dynamic "⚡ Auto-Detect Headings from All Pages" button generating dotted-leader TOC blocks with direct in-editor click-to-page jump navigation.
  - Running folios with dynamic token replacement (`{page}`, `{total}`, `{title}`, `{category}`).

### Release Sprint 2 — Dynamic Template Library, Curated Pacific Stock Assets & Media Management
- **Media Asset Architecture & Stock Library Provider:**
  - Enhanced `StudioController::listAssets()` to support dual scopes: `tenant` (private customer uploads) and `library` (curated high-resolution stock imagery).
  - Seeded comprehensive Pacific stock assets categorized into FMCG/Retail, Dining & Hospitality (Kokoda, Lobster, Cocktails), Technology, Denarau Real Estate, Coral Reefs, and Senior Graduate Portraits.
  - Added full search indexing (`q`), asset categorization, and pagination controls.
- **Secure File Upload & Storage Enforcement:**
  - Implemented strict MIME-type validation (`image/jpeg`, `image/png`, `image/webp`, `image/svg+xml`) and 15MB file-size limits in `uploadAsset()`.
  - Added automatic server-side image dimension extraction (`width`, `height`) via `@getimagesize` to optimize canvas layout scaling and aspect ratios.
  - Added `DELETE /api/v1/studio/assets/{id}` with tenant verification, automatic local disk cleanup, and security audit trails.
  - Proactively blocks inline Base64 data URIs from being registered as asset URLs.
- **Interactive Asset Management Drawer & Inspector Integration:**
  - Upgraded Flipex Studio `Media & Photos` drawer with real-time toggle between `📁 My Uploads` and `🌴 Pacific Stock Library`.
  - Added one-click in-place asset replacement: selecting any image on the canvas lets users swap it with another upload or library asset in one click without resetting coordinates or dimensions.
  - Added asset deletion with confirmation tooltips and visual metadata badges (`width × height`, file size).
  - 100% purged all residual indigo and purple UI classes in favor of Nuvis Sky/Ocean (`#0284c7`) and Emerald accents.
- **Automated Verification Expansion:**
  - Extended `StudioDesignSchemaTest.php` with 5 additional test checks (totaling 22 automated tests) validating reflection of all asset endpoints, curated stock library cataloging, category filtering, and zero Base64 compliance.

### Release Sprint 1 — Flipex Design Schema (FDS v1.0), Versioned Template Architecture & Studio Controller Stabilisation
- **Studio Controller API Fixes & Invariant Hardening:**
  - Resolved `Auth::user($req)` class-resolution bugs in `StudioController.php` across `listTemplates`, `getTemplate`, `saveTemplate`, and `deleteTemplate`, standardizing on Slim 4 `$u = $req->getAttribute('user')`.
  - Fixed unassigned `$u` variable in `listAssets()`, guaranteeing robust tenant isolation for studio asset management without 500 errors.
- **Flipex Design Schema (FDS v1.0) Specification & Validator:**
  - Implemented canonical `FdsValidator.php` (`schema: "flipex.design"`, `schemaVersion: "1.0.0"`).
  - Validates document dimensions, units, bleed, safe margins, orientation, and layout structures.
  - Enforces server storage optimization: strictly rejects inline Base64 data URIs in templates or saved documents, requiring reference-based asset architecture (`assetRef`).
- **Bidirectional Backward-Compatible Adapter (`FdsAdapter.php`):**
  - Seamless bidirectional translation between legacy flat `canvas_spec` coordinates (`x, y, w, h`) and canonical FDS v1.0 (`frame`, `transform`, `style`, `assetRef`, `dataBinding`).
  - Ensures existing canvas editor scripts, flipbook publication generators, and print export pipelines continue to function without breaking changes.
- **File-Based Versioned Template Architecture:**
  - Extracted 10 hardcoded PHP array templates out of `StudioController.php` into modular, versioned JSON files under `backend/resources/studio/templates/` (`catalogue/`, `magazine/`, `album/`, `yearbook/`, `custom/`).
  - Created `manifest.json` cataloging all templates with metadata, category, page count, and dimensions.
  - Replaced the flawed `COUNT(*) >= 10` seeder with an intelligent, version-aware upsert mechanism based on `template_key` and semantic `version`.
- **Automated Verification Test Suite (`StudioDesignSchemaTest.php`):**
  - Added 17 automated regression and architectural verification tests covering schema validation, Base64 rejection, legacy adapter translation, manifest integrity, template JSON validation, and controller method signatures.
  - Registered `composer test:studio` script in `composer.json`.

### Release `2ad0a38` — Developer Session Security Suite, Background Deduplication, Alpha Access Governance & Zero-Purple UI Standard
- **Developer Tab Session Security & Expiration Policies:**
  - Built `SessionSecurity.php` providing configurable JWT access token TTL (default: 3600s / 1 hr), refresh token retention (30 days), and inactivity timeouts (24h).
  - Integrated a **30-second token rotation grace window** in `AuthController.php`, preventing false-positive token replay lockouts caused by rapid asynchronous autosave requests during studio editing.
  - Added `GET /api/v1/auth/keepalive` endpoint and an active 4-minute keepalive heartbeat in `AuthContext.tsx`.
  - Added a dedicated **🔐 Session Security & Expiration** sub-tab in `DevOpsCenter.tsx` with live telemetry counters (Active Token Grants, Session Families, Replay-Protected Revocations), parameter configuration, and an emergency platform session revocation action.
- **Deduplication of Background Controls (Right Panel Only):**
  - Completely removed the duplicated 370-line background generator section from the left magazine drawer in `FlipexStudio.tsx`.
  - Background controls (3-Gradient generator with all 9 alignment angles + solid color swatches) now reside **exclusively in the right Inspector panel** under `🎨 Page & 3-Gradient`.
  - Added a clean, compact quick-link in the left magazine drawer allowing users to jump directly to the right inspector tab.
- **Developer Alpha Access Governance:**
  - Restricted `/studio` and `/studio/:id` to platform developers and administrators (`user.role === 'admin'`) in `ProtectedRoute.tsx`.
  - Studio link in the sidebar rail is only visible to admin accounts. Non-admin users attempting access are blocked with an informative Developer Alpha Preview card.
  - Studio topbar badge updated to `🛠️ DEVELOPER PREVIEW (ALPHA)`.
- **100% Purple Color Elimination:**
  - Systematically purged all purple hex codes (`#a855f7`, `#7c3aed`, `#6366f1`, `#c084fc`, etc.) across `FlipexStudio.tsx` and `styles.css`.
  - Replaced all buttons, active outlines, focus rings, sliders, and badges with **Nuvis Dynamic Ocean Blue (`#0284c7`, `#0369a1`)**, **Emerald (`#059669`)**, and **Titanium Slate (`#1e293b`)**.
  - Replaced purple gradient presets with clean palettes: `Pacific Azure`, `Sunset Ember`, `Tropical Emerald`, `Ocean Abyss`, `Nordic Slate`, `Clean Frost`, `Warm Parchment`, and `Midnight Noir`.
- **High-Contrast Inspector Input Readability:**
  - Standardized `.studio-prop-input` and `.studio-prop-select` styling with pure white text (`#ffffff`, font-weight 700) on `#0f172a` slate inputs with `#0284c7` focus rings, ensuring high visibility for all position and dimensional coordinates.

### Release `e276426` — High-Attraction 3-Gradient UI & Studio Canvas Expansion
- **Eliminated Flat Blue Buttons:** Converted all primary, secondary, and tertiary action buttons across the Studio to 5 high-attraction 3-stop linear gradient variants.
- **Collapsible Studio Panels:** Added collapsible Left Tools (`⇤ Tools`) and Right Property Inspector (`Inspector ⇥`) panels, increasing center canvas width to over 1,200px+ with floating edge re-open handles.
- **Auto "Fit to Screen" Scaler:** Added dynamic viewport calculation in the studio header zoom bar, auto-scaling document spreads to fit the available container cleanly.
- **Contextual Inspector Upgrades:** Added Layer Z-Index ordering (*▲ Bring Forward* / *▼ Send Backward*), Typography Selector (5 curated font families), 4-way text alignment, and a live WhatsApp test link generator.

### Release `276ba17` & `ed76be6` — PHP 8.3 Strict Typing & Transaction Safety
- **Strict Audit Parameter Fix:** Corrected parameter ordering in `Audit::log($action, $entityType, $entityId, ...)` inside `StudioController.php` to resolve PHP 8.3 `strict_types=1` `TypeError`.
- **Transaction Rollback Safety:** Wrapped all database rollback calls in `if (Db::pdo()->inTransaction())` to eliminate uncaught `PDOException: There is no active transaction` during error handling.
- **Studio Header Wrap Fix:** Removed `flexWrap: 'wrap'` from the studio header, ensuring single-line desktop layout without button overlapping.
- **Background Swatch Grid:** Replaced full-width white bars with clean 4-column color swatch grids.

### Release `2026-11-18` — Expansive Desktop Workspace, High-Contrast Inspector & 3-Gradient Studio Suite
- **Full-Width Desktop Canvas Workspace (Zero Margins):** Unconstrained the studio route from container limits (`.studio-shell`, `.studio-body`, `.app-main-studio` at `100vw` by `100vh`), automatically hiding the general dashboard sidebar rail and topbar when in studio canvas mode. Eliminates all side whitespace on desktop widescreen displays.
- **Auto-Fit Viewport Scaling:** Automatically scales canvas zoom on document load and panel collapse, maximizing document preview and visual ergonomics.
- **3-Gradient Page Background Suite (Directly in Inspector):**
  - **All 9 Gradient Alignment Options:** 3x3 interactive compass grid (`↖ 315°`, `⬆ 0°`, `↗ 45°`, `⬅ 270°`, `⊙ Radial Glow`, `➔ 90°`, `↙ 225°`, `⬇ 180°`, `↘ 135°`).
  - **3 Color Gradient Stops:** Independent color pickers and hex inputs for Stop 1 (0%), Stop 2 (50%), and Stop 3 (100%).
  - **Apply to All Pages:** 1-click batch application synchronizing background styling across the entire publication.
  - **Adaptive High-Contrast Article Text:** Automatically defaults multi-column magazine articles and text blocks to crisp pure white (`#F8FAFC`) on dark/gradient backgrounds.
- **Backend Print & PDF Export Support:** Upgraded `StudioController.php` print generator to render CSS gradients and solid backgrounds seamlessly in print previews and vector PDFs.

### Release Stage 6 — Specialized Magazine Creator & Publish/Preview Healing
- **Linked Text Frames (Overflow Streaming):** Connected multi-column article and text frames with automatic capacity calculation and character overflow forwarding (`linkedNextId` / `linkedPrevId`). When an article exceeds its frame capacity on Page N, the overflow text streams into the designated frame on Page N+1 with interactive `🔗 Flowing →` and `🔗 Flow In` indicators.
- **Facing-Pages & 2-Page Spreads:** Added `📖 2-Page Spread` toggle in top studio toolbar with realistic magazine centerfold binding spine, live facing-page preview, and 1-tap spread navigation.
- **Master Pages & Dynamic Headers:** Automated Master Page presets (Glossy Editorial, Modern Minimalist, Spread Alternating Folios) with real-time dynamic token substitution (`{page}`, `{total}`, `{title}`, `{section}`, `{date}`).
- **Automated Dynamic TOC:** Scans editorial headings across pages, generates dotted-leader indexes with in-studio jump clicks and reader `page` hotspots.
- **Publish & Live Reader Auto-Heal Fix:** Synchronized `status = 'ready'`, `workflow_status = 'published'`, and `published_at = IFNULL(published_at, NOW())` in `StudioController.php` and `PublicController.php` to prevent preview/reader 404 errors.

### Release Stages 7, 8 & 9 — Specialized Album & Yearbook Creator, Publishing Pipeline & Brand Kits
- **Bulk Photo Ingestion & Keepsake Albums (Stage 7):** Multi-file drag-and-drop dropzone in the Album tab with staged memory thumbnail gallery and 4 instant collage generators (*Polaroid Scatter*, *Modern Mosaic*, *Clean 3x3 Photo Grid*, *Full-Bleed Photo Hero Spread*).
- **Graduate & Student Roster Engine (Stage 7):** Instant graduate portrait roster presets (4, 6, 8, 12 cards/page) with portrait photo, academic award badges, student name, leadership role, senior quote, and multi-page CSV bulk import.
- **Print Resolution Protection (DPI Guard - Stage 7):** Real-time element DPI calculation (`dpi = Math.round(naturalW / (w / 72))`), canvas warning badges (`⚠️ <150 DPI`), and pre-flight `🛡️ DPI Guard` Inspection Modal.
- **Debounced Document-Wide Autosave & Crash Recovery (Stage 8):** Atomic document-wide saving debounced at 1.5 seconds with revision incrementing, real-time `localStorage` recovery snapshot, crash recovery banner, and topbar status indicator (`☁️ Saved` / `⏳ Saving…` / `⚠️ Offline`).
- **Unified High-Fidelity Rendering Pipeline (Stage 8):** Canonical `renderPageToSvg()` vector compositor compiling full-fidelity composite SVG pages directly into the flipbook publication pipeline.
- **Background Export Queue & Jobs (Stage 8):** Asynchronous background export queue table `studio_export_jobs` with `/studio/export/queue` and `/studio/export/status` endpoints.
- **Brand Kits & Design Tokens (Stage 9):** Workspace Brand Kits integration via `/api/brand-kits` with 1-click styling synchronization and custom brand token saving.

### Release Stage 5 — Specialized Catalogue Creator & Dynamic Inventory Sync
- **1-Tap Product Grid Generators:** 5 commercial layout generators: 1-Product Hero Showcase, 2-Product Split Spread, 3-Product Balanced Tier, 4-Product Standard Grid, and 6-Product Supermarket Specials.
- **Live Inventory CSV Integration & Auto-Pagination:** Paginated multi-page catalogue generation from CSV data with layout density selection (4 or 6 products per page).
- **Dynamic Flash Markdown Tool:** Instant percentage price markdowns across active page or entire catalogue (10%, 15%, 20%, 25%, 30%, 50%) with 1-click pricing restoration.
- **In-Place SKU Price Sync:** Dynamic inventory sync from CSV that matches products across all pages and updates pricing and badges in-place without disturbing layout, fonts, or graphic compositions.
- **Normalized Reader Hotspots:** Studio publish pipeline compiles product elements and WhatsApp buttons into normalized percentage reader coordinates (`0.0%` - `100.0%`) for responsive alignment.

### Release Stage 4 — Flipex Studio Template Platform & Discovery Browser
- **10 Commercial Template Categories:** Integrated prebuilt multi-page templates across Retail/Supermarkets, Tech/Electronics, Food/Menus, Real Estate, School Yearbooks, Lifestyle Magazines, Wedding Albums, Annual Reports, Marketing Brochures, and Creative Portfolios.
- **Template Discovery Hub:** Dedicated browser with category filter pills, keyword search, format selection, and official vs. custom team template scoping.
- **Interactive Multi-Page Preview Modal:** Interactive page-by-page inspection sheet with thumbnail carousel, commercial layout specifications, and 1-click document bootstrapping.
- **Save as Reusable Template Workflow:** Direct API endpoint (`POST /studio/templates`) and in-editor modal allowing users to save custom publications as organization templates.

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
| **Creation Engine** | Flipex Studio (DOM/SVG Canvas) | Browser-based visual layout engine with drag-and-drop, snap-to-grid, and print bleeds (Developer Alpha). |
| **Viewer Engine** | StPageFlip + Canvas 2D | 3D physics-based book-turn simulation with adaptive DPR and sliding image windowing. |
| **Backend Framework** | PHP 8.3+, Slim 4, PSR-7 / PSR-15 | RESTful API gateway with token auth, tenant isolation, and rate-limiting. |
| **Database** | MySQL 8.0 / 8.4 Enterprise | InnoDB with composite foreign keys, JSON coordinate columns, and `SKIP LOCKED`. |
| **PDF Rasterization** | Ghostscript (`gs`), Poppler (`pdftoppm`), Imagick | Multi-engine high-fidelity rasterizer producing WebP, AVIF, and high-res JPEG assets. |
| **Print PDF Generation** | Vector Headless Compiler | Direct vector 300 DPI PDF generation for commercial print readiness. |
| **Cryptographic Security** | Argon2id, CSPRNG, RFC 6238 TOTP | Password hashing, token encryption, and HMAC-SHA256 signature verification. |
| **Session Security** | SessionSecurity Service, HS256 JWT, Keepalive Heartbeat | Configurable JWT lifetime, 30s token rotation grace window, and active keepalive. |
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
│   │   ├── Controllers/               # StudioController, DevOpsController, AuthController, etc.
│   │   ├── Database/                  # Migration classes and schema builders
│   │   ├── Infrastructure/            # MigrationRunner, ObjectStorageAdapter, Central Exception Reporter
│   │   ├── Middleware/                # Auth, Cors, RateLimit, TenantScope
│   │   └── Support/                   # Audit, CryptoSecrets, Db, JobRunner, SessionSecurity, Storage, etc.
│   ├── storage/
│   │   ├── .crypto_secrets.json       # Protected 256-bit provisioned encryption secrets
│   │   ├── logs/                      # Structured JSONL application logs
│   │   └── tenants/                   # Isolated customer PDF files & converted assets
│   ├── composer.json                  # PHP package definitions
│   └── .env.example                   # Environment configuration template
└── frontend/
    ├── src/
    │   ├── api/                       # API client with token interceptors
    │   ├── auth/                      # Authentication provider, 2FA state & keepalive heartbeat
    │   ├── components/                # BoardUI primitives, FlipbookViewer, HotspotEditor, ProtectedRoute
    │   │   └── viewer/adaptiveLoading # Memory & network-aware image preloading & DPR clamping
    │   ├── pages/                     # FlipexStudio, DevOpsCenter, Dashboard, PublicViewer, EduPortal, etc.
    │   ├── main.tsx                   # Lazy-loaded route boundaries & Suspense wrappers
    │   └── styles.css                 # BoardUI tokens & Dynamic 3-Gradient High-Attraction suite
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
| **`2026_11_17_000013_flipex_studio_schema`** | Complete Flipex Studio schema: `studio_documents`, `studio_document_pages`, `studio_templates`, `studio_assets`, `studio_publications`, `studio_export_jobs`. |

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
```cron
0 2 * * * php /home/username/flipex.ict-fj.com/backend/bin/tenant_maintenance.php >/dev/null 2>&1
```

---

## 🛡️ Automated Security & Regression Verification

Nuvis Flipex includes an automated security regression test suite validating **24 strict enterprise isolation and security invariants**:
- Universal route-level IDOR validation across publications, categories, and invoices.
- Strict isolation of filesystem assets in `/storage/tenants/{tenant_id}/`.
- Scoped API key permissions (`flipbooks:read`, `flipbooks:write`, `erp:publish`, `analytics:read`).
- Refresh token replay detection, 30s race-condition grace windows, and session family revocation.
- Cryptographic secret entropy enforcement and placeholder rejection.
- Independent `%%EOF` trailer verification and page limit bypass prevention.
- Renewable job leases and atomic worker `SKIP LOCKED` concurrency.
- Storefront draft isolation prohibiting non-public or unapproved documents.
- Atomic cache lock ownership validation under simulated race conditions.

Run the test suites at any time via CLI:
```bash
# Automated security and tenant isolation verification (24 invariants)
php backend/bin/test_security.php

# Flipex Design Schema (FDS v1.0), template library, commercial blocks & studio controller tests (29 checks)
php backend/tests/StudioDesignSchemaTest.php
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
