# Migration — Status Snapshot (2026-07-10)

What got built on this PC before the IT meeting, and what's left. Full plan in
[MIGRATION_ROADMAP.md](MIGRATION_ROADMAP.md).

## ✅ Done & verified locally (no server needed)

| Area | Deliverable | Verified |
|---|---|---|
| IT meeting | [IT_INFRA_REQUEST.md](IT_INFRA_REQUEST.md) — VM/Docker/DNS/TLS/backup spec + questions | — |
| DB schema | `server/src/migrations/001_init.sql` — 15 collections + `auth_credentials` + reset tokens, expression indexes | builds |
| API | `server/` — Node + Express + Postgres: JWT login, `/auth/*`, generic `/col/:name` REST, `/batch` (atomic) | typecheck ✓ |
| Authorization | `server/src/authz.ts` — every `firestore.rules` rule ported to server middleware | **9/9 tests ✓** |
| Auth | login / signup(PENDING) / me / change-password / admin-set-password / reset-token | tests ✓ |
| Frontend shim | `services/api-client.ts`, `services/firestore-compat.ts` (onSnapshot→polling), `services/auth-compat.ts` | app typecheck ✓ |
| Frontend guide | [PHASE3_FRONTEND_SWAP.md](PHASE3_FRONTEND_SWAP.md) — exact import edits + the one `signUp` rewrite | — |
| Packaging | `server/Dockerfile`, `Dockerfile.web`, `docker-compose.yml`, `deploy/nginx/nginx.conf`, `.env.docker.example` | — |
| ETL | `server/scripts/etl/` — export-firestore, load-postgres (idempotent), README | — |

**Test proof:** `cd server && npx vitest run` → 9 passing (admin-only writes,
rater-ownership, notification owner-scoping, role-change block, login/session).

## ⏳ Needs the server / live data (do after IT hands over the VM)

1. **Stand up the stack** — `cp .env.docker.example .env`, fill secrets, `docker compose up -d --build`. Confirm `/health` and login.
2. **Flip the frontend** — apply [PHASE3_FRONTEND_SWAP.md](PHASE3_FRONTEND_SWAP.md) (import edits + `signUp` rewrite), run the runtime checklist against the live API. *(Not done here — can't run the full app without a live API/DB.)*
3. **Run the ETL** — export live Firestore (needs a service-account key), load into Postgres, verify counts + spot-check scores.
4. **Set passwords** — migrated users need temp passwords (admin-set) or the reset flow; passwords don't migrate from Firebase.
5. **TLS + backups** — drop in IT's cert (uncomment the 443 block in nginx.conf), confirm the nightly backup writes and a restore works.
6. **Security pass + cutover** — run `/security-review`, load-test, UAT, freeze Firebase → final ETL delta → flip DNS.

## Local dev without Docker (optional, if you get a Postgres)
```bash
cd server && npm install
cp .env.example .env         # point PG* at any Postgres
npm run migrate              # apply schema
npm run dev                  # API on :4000
```
No Postgres handy? The test suite already proves the API on in-memory Postgres:
`npx vitest run`.
