# FlipBook (Heyzine-style flipbook platform)

See the design doc in the project artifacts. Phase 1 so far: infrastructure + auth + account management.
**This code has not been run yet** (no PHP/Node/Docker on the authoring machine).

## Run (Docker)
```bash
cp backend/.env.example backend/.env
docker compose up -d --build
docker compose exec php composer install
docker compose exec php php bin/migrate.php
cd frontend && npm install && npm run dev
```
- App: http://localhost:5173  ·  API: http://localhost:8080/api/v1/health  ·  Mail inbox: http://localhost:8025

## Done
- Register, email verification, login, rotating refresh tokens (httpOnly cookie), logout
- Forgot/reset password, rate limiting on auth routes
- Profile, change password, session list/revoke, account deletion

## Next
Upload + PDF conversion worker, dashboard CRUD, viewer (StPageFlip), sharing/embed.
