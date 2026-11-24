# Changelog

All notable changes to Nuvis Flipex. Versions follow semver; the number lives in `/VERSION`
(run `node scripts/bump-version.mjs patch|minor|major` to cut a release).

## [Unreleased]

### Studio (Flipex Studio)
- **Publish now works from Studio:** pages are rendered server-side to SVG (`StudioSvgRenderer`) and stored per tenant, so documents created in the editor, from a template or through the API all publish the same way and open in the public flipbook viewer.
- **18 new bundled templates** (supermarket, tech, restaurant, real estate, yearbook, lifestyle magazine, wedding, annual report, adventure, portfolio, cafe menu, price list, newsletter, school prospectus, family album, travel journal, event programme, lookbook), 3-4 pages each with real content. Regenerate with `scripts/gen-templates.py`.
- **26 original CC0 stock illustrations** served from `/api/v1/studio-stock/{id}.svg` (`scripts/gen-stock-art.py`); every Unsplash hotlink is gone, so Studio has no external image dependency.
- **Template API:** `POST /api/v1/studio/templates/import` and `GET /api/v1/studio/templates/{id}/export` (FDS v1.0 JSON). API keys with the flipbooks scope can now use `/studio`.
- **Navigation:** "Back to Dashboard" on the Studio hub and a gold "Dashboard" button in the editor (saves first).
- **Security:** tenant context is required (no fallback to tenant 1), `flipbook.publish` / `flipbook.edit` permission checks, strict size and count limits, SVG safety checks, sanitized link URLs, CSP sandbox on served SVG, and no exception text leaked to clients.
- **Navigation & icons:** all Studio tab rows (hub sections, document filters, template categories and sources, editor tool tabs, editor toolbar) are now scrollable strips with arrow buttons, edge fades, wheel/drag scrolling, keyboard arrows/Home/End and automatic scroll to the active tab. Emoji in navigation and main actions are replaced by a bundled inline SVG icon set (`components/studio/StudioIcon.tsx`), so there is no icon font or CDN.
- **UI fixes:** template card titles and the "Keep Editing" button were unreadable (light-on-light).
- After deploying, run `php backend/bin/cache.php flush` so the new template manifest is picked up.

### Added
- Dependency-free Redis support (phpredis or built-in client; unix socket for A2 Turbo, TCP for VPS) with automatic file/MySQL fallback.
- Redis-backed rate limiting, locks, cache namespaces and a schema-check guard (`SchemaGuard`) so DDL no longer runs on every request.
- `backend/bin/cache.php` (status, ping, flush, gc).

### Changed
- Removed Tailwind and the fontsource npm packages: utilities are now a static `utilities.css` and the font is bundled locally. No new external dependencies.

### Fixed
- Dashboard filter pills and other buttons had unreadable text (cascade-layer conflict with base button styles).

## v2.2.0 - 2026-11-24

### Versioning
- One source of truth: the root `VERSION` file now drives the frontend (injected at build time), the API (`/api/v1/version`, `/api/v1/health`), the DevOps console and `package.json`. Previously these were four hand-edited, disagreeing values.
- `dist/version.json` is emitted on every build; open browser tabs detect a new release and offer a one-click refresh.
- `scripts/bump-version.mjs` bumps the version, updates the changelog and can create the git tag. CI rebuilds the committed `frontend/dist` and tags/releases from `VERSION`.

### Security
- Removed the per-request "self-healing" query that unlocked every locked account and activated every pending/unverified user. Account lockout is now actually enforced at login.
- Suspended or disabled accounts can no longer be re-activated by signing in.
- Login lookup is deterministic (exact email/username first; looser matches only when unambiguous). Plain-text stored passwords are no longer accepted; legacy MD5/SHA1/SHA256/MySQL hashes are compared in constant time and upgraded to Argon2id on first login.
- Email 2FA codes are compared in constant time.
- Studio uploads: type is detected from file contents, the extension is derived from it (never from the client filename), SVGs with scripts or external references are rejected, and served files carry a sandbox CSP.
- Studio SVG renderer escapes all interpolated text, URLs and CSS values (stored-XSS fix).
- CORS uses an explicit allow-list (no wildcard with credentials). The internal worker endpoint requires a dedicated `WORKER_SECRET` instead of falling back to `JWT_SECRET`.
- `.htaccess` blocks `.git`, dotfiles, docs, compose files and frontend sources; adds CSP, HSTS and Permissions-Policy.

### Interface
- Commercial visual refresh: gold brand identity on a three-stop blue gradient system.
