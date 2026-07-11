# Deployment Runbook — EPROM CMS

Ordered checklist for deploying the **self-hosted** stack (React SPA + Node/Express API +
PostgreSQL) to the company Linux VM via **Docker Compose**. Run each step in sequence.

> **Prerequisite (one-time):** the VM must have **Docker Engine + Docker Compose v2**
> installed, an internal DNS name, and ports 80/443 open. See
> [`../migration/IT_INFRA_REQUEST.md`](../migration/IT_INFRA_REQUEST.md) for the full IT spec.
> Nothing else (Node, Postgres) is installed on the host — they run inside containers.

---

## A. Pre-deploy checks (on your dev machine or CI)

1. **Clean working tree**
   ```
   git status
   ```
   Stash or commit unfinished work before continuing.

2. **Pull the latest main**
   ```
   git checkout main && git pull origin main
   ```

3. **Install dependencies (frontend + backend)**
   ```
   npm ci
   cd server && npm ci && cd ..
   ```

4. **Type-check both**
   ```
   npx tsc --noEmit
   cd server && npm run typecheck && cd ..
   ```
   Fix all errors before continuing.

5. **Lint**
   ```
   npm run lint
   ```

6. **Run tests**
   ```
   npm test                          # frontend (Vitest)
   cd server && npm test && cd ..     # backend (auth + authorization)
   ```
   All tests must pass.

7. **Sanity-build the SPA** (optional — the `web` image also builds it)
   ```
   npm run build
   ```
   Confirm it completes without errors and inspect `dist/`.

---

## B. Configure the server (on the VM, first deploy only)

8. **Get the code onto the VM** — `git clone` the repo (or `git pull` in place). Deploy the
   **whole repo**, not just `dist/`.

9. **Create the Docker Compose env file**
   ```
   cp .env.docker.example .env
   ```
   Edit `.env` and set real values:
   - `PGUSER` / `PGDATABASE` — leave the defaults or set your own.
   - `PGPASSWORD` — a strong database password.
   - `JWT_SECRET` — a long random string. Generate one with:
     ```
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
   - `BOOTSTRAP_ADMIN_EMAIL` — the email that gets admin access on first run.
   - `CORS_ORIGINS` — the DNS name(s) users will hit, e.g. `https://cms.eprom.local`.
   - `ALLOW_SIGNUP` — `true` to let users self-register (creates PENDING accounts).

   > This file holds secrets and is **git-ignored** — never commit it.

10. **(TLS, recommended)** Install the certificate for your DNS name and enable the HTTPS
    `server {}` block in [`../../deploy/nginx/nginx.conf`](../../deploy/nginx/nginx.conf)
    (mount the cert into the `web` container). Until then the app is served over HTTP on port 80.

---

## C. Deploy

11. **Build and start the whole stack**
    ```
    docker compose up -d --build
    ```
    This builds the `api` and `web` images and starts `postgres`, `api`, `web`, and `backup`.
    On an **update** deploy (new code), run the same command — it rebuilds the images and
    recreates the containers; the `postgres` volume and its data are preserved.

12. **Confirm the API ran migrations and everything is healthy**
    ```
    docker compose ps
    docker compose logs api --tail=50
    ```
    The `api` service runs database migrations automatically on boot — confirm the log shows
    migrations applied and the server listening on `:4000`. `postgres` should report `healthy`.

13. **Health check**
    ```
    curl -f http://localhost/api/health
    ```
    Expect `{"ok":true,"service":"eprom-cms-api"}`.

---

## D. Smoke test (post-deploy)

14. Open the DNS URL in a private/incognito window.
15. **First deploy only:** sign up the bootstrap admin (the email from `BOOTSTRAP_ADMIN_EMAIL`),
    then verify the **Admin Panel** loads.
16. Log in as an Employee account and verify the **Employee Dashboard** loads.
17. Submit a test assessment or notification and confirm it persists (reload the page).
18. Deep-link test: navigate to a sub-page (e.g. `/admin/users`), then hard-refresh — it must
    load, not 404 (proves the nginx SPA fallback works).
19. Check `docker compose logs api` and the browser console — no uncaught errors or 401/500s.

---

## E. Backups

- The `backup` service dumps the database nightly to `./backups/cms-<date>.sql.gz` (30-day
  retention). Verify a dump exists after the first night:
  ```
  ls -lh backups/
  ```
- Point IT's off-host backup job at the `./backups` directory (or the NAS path).
- Take a manual dump before any risky change:
  ```
  docker compose exec -T postgres pg_dump -U "$PGUSER" "$PGDATABASE" | gzip > backups/manual-$(date +%F-%H%M).sql.gz
  ```

---

## On failure

- If a step above fails, **do not leave a half-deployed stack serving traffic**.
- See [`ROLLBACK_RUNBOOK.md`](ROLLBACK_RUNBOOK.md) to revert to the previous image/commit and,
  if needed, restore the database from a backup.
