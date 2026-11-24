# Changelog

All notable changes to Nuvis Flipex. Versions follow semver; the number lives in `/VERSION`
(run `node scripts/bump-version.mjs patch|minor|major` to cut a release).

## [Unreleased]

## [2.3.4] - 2026-11-24

### Fixes
- **Reader bottom bar on small screens:** the page counter no longer wraps one character per line, the Fullscreen button stays on one line (icon only on phones), and the zoom slider is hidden below 900px so the bar fits the screen.

## [2.3.3] - 2026-11-24

### Fixes
- **Customise dialog flicker:** the library no longer polls in the background while Customise, Share or Lifecycle dialogs are open (it only repainted under the blurred backdrop). Effect previews animate on hover or when selected instead of nine canvases at once.

## [2.3.2] - 2026-11-24

### Fixes
- **Flicker (frontend side):** the library now ignores rolling signed-URL expiry/signature changes when polling, so thumbnails keep their image and rows no longer re-render, even if the server is still handing out fresh URLs on every request.

## [2.3.1] - 2026-11-24

### Customise panel
- **Layouts:** each of the 16 layouts now shows a wireframe thumbnail and actually changes the reader (top bar, bottom bar, arrows, slider, zoom). A separate layout can be chosen for mobile.
- **Ambient effects:** the selected effect now renders in the reader and in the live preview.
- **Page flip:** all eight flip transitions are selectable cards with animated icons and work in the reader.
- **Privacy and visibility:** the tab now has show/hide switches for every reader control (top bar, title, contents, bookmarks, resources, notes, presentation, offline, shortcuts, page slider, zoom, arrows, page number).
- **Settings changes show immediately:** the public flipbook JSON now revalidates instead of being cached for 5 minutes.

## [2.3.0] - 2026-11-24

### Fixes: flicker, Studio layout, publish
- **Flicker fixed:** signed thumbnail URLs were regenerated on every list refresh, so while any publication was converting every cover image reloaded every ~2 seconds. URLs are now stable within a time bucket and the library skips re-rendering when nothing changed.
- **Studio editor room:** the recovery-snapshot banner was a stray grid row that squeezed the canvas; it is now a small corner notice. Header buttons (Brand Kits, As Template) no longer stretch full width; side panels are slimmer.
- **Studio documents page scrolls** again (templates and documents below the first row).
- **Reader:** single-page publications no longer render the page twice off-centre. Publishing warns when pages are blank.

### Tabs, icons and publish UI
- **Wrapping tabs everywhere (no scrolling):** one shared `TabBar` (pill / grid / segment / app variants) with bundled inline-SVG icons replaces every tab row in Studio, Dashboard, Share, Lifecycle, Customisation, Admin, Billing, Integrations and DevOps. No icon font, CDN or external asset.
- **Readable buttons:** base-layer resets stop utility background colours from showing the gradient image behind them.
- **Customisation dialog:** live reader preview (header, contents drawer, arrows, toolbar) beside Design and Themes; cards use the full width; emoji in publish/customise buttons replaced with bundled icons.
- **Studio publish respects the plan's publication limit** (403 like uploads; re-publishing an existing document is free).

### Security and audit fixes
- **Webhook SSRF guard** (`App\Support\UrlGuard`): public http(s) targets on ports 80/443/8080/8443 only, no credentials, no private/loopback/link-local/metadata addresses; enforced at creation and at delivery in both dispatchers (no redirects, DNS pinned). `WEBHOOK_ALLOW_PRIVATE=1` opts out for intranet installs.
- **Public unlock / lock / search / download** work on renamed (redirected) slugs; **oEmbed** only exposes live, non-password, non-expired publications of the requested slug.
- **Public directory** no longer errors (`published` / `pages_count` column fixes).

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
