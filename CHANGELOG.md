# Changelog

All notable changes to Nuvis Flipex. Versions follow semver; the number lives in `/VERSION`
(run `node scripts/bump-version.mjs patch|minor|major` to cut a release).

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
