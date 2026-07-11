# EPROM Competency Management System (CMS)

An internal web application for employee competency management: define **Job Profiles**
with required skill levels, assign employees, evaluate proficiency across all relevant
skills, and produce skill-gap reports, Individual Training Plans (ITP), and career
progression roadmaps.

The system is **fully self-hosted** — it runs entirely on your own server with no
external cloud dependency.

---

## Architecture

The app is **three parts** that run together:

| Part | What it is | Where |
|---|---|---|
| **Frontend** | React 18 + TypeScript SPA (Vite, Tailwind) | `src/` → builds to `dist/` |
| **Backend (API)** | Node + Express REST API — JWT auth, authorization, generic collection endpoints | `server/` |
| **Database** | PostgreSQL — stores every record (each former collection is a table of JSON documents) | Postgres container / server |

The frontend never talks to the database directly. It calls the API over `/api`
(HTTP + a JWT bearer token); the API is the only thing that touches Postgres.

> **History:** this project was migrated off Firebase (Firestore + Firebase Auth) to
> the self-hosted stack above. That migration is tracked in
> [`docs/migration/`](docs/migration/). The Firebase-shaped calls still used inside
> `src/services/store.ts` are served by compatibility shims
> (`firestore-compat.ts` + `auth-compat.ts`) over the REST API — real-time is polling,
> not `onSnapshot`.

---

## Run locally (Windows, no Docker needed)

**Prerequisites:** Node.js 20+.

One click:

```
run.bat
```

This installs dependencies on first run, then boots:
- **Backend** — Node + an **embedded Postgres** (no external DB to install) + the API on `http://localhost:4000`
- **Frontend** — the Vite dev server on `http://localhost:5173` (opens automatically)

Manual equivalent:

```
cd server && npx tsx scripts/serve-local.ts   # API + embedded Postgres
npm run dev                                    # SPA (in a second terminal)
```

The API seeds a first admin account on startup (email/password come from
`server/.env` — `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Health check:
`GET http://localhost:4000/health` → `{ "ok": true }`.

---

## Deploy to a company server (Docker)

The whole stack ships as containers via **Docker Compose** — you do **not** install
Node or Postgres on the host. See [`docs/runbooks/DEPLOYMENT_RUNBOOK.md`](docs/runbooks/DEPLOYMENT_RUNBOOK.md)
for the full checklist and [`docs/migration/IT_INFRA_REQUEST.md`](docs/migration/IT_INFRA_REQUEST.md)
for what to request from IT.

Short version, on the server:

```
cp .env.docker.example .env      # then edit: set DB password, JWT_SECRET, admin email, CORS_ORIGINS
docker compose up -d --build
```

`docker compose` starts four services (see [`docker-compose.yml`](docker-compose.yml)):

| Service | Role |
|---|---|
| `postgres` | The database (data persisted in a named volume) |
| `api` | The Node/Express API — runs DB migrations automatically on boot |
| `web` | nginx — serves the built SPA **and** reverse-proxies `/api` to `api` (ports 80/443) |
| `backup` | Nightly `pg_dump` to `./backups`, 30-day retention |

Open the app at the DNS name you configured, sign up the bootstrap admin, done.

---

## Configuration

Environment files are gitignored; copy the examples and fill them in.

| File | Used by | Copy from |
|---|---|---|
| `.env.local` / `.env.production` | Frontend (Vite) — `VITE_API_URL`, `VITE_POLL_INTERVAL_MS` | [`.env.example`](.env.example) |
| `server/.env` | API (local dev) — Postgres, JWT, bootstrap admin | [`server/.env.example`](server/.env.example) |
| `.env` (repo root) | Docker Compose — DB password, JWT secret, CORS | [`.env.docker.example`](.env.docker.example) |

---

## Documentation

All docs live under [`docs/`](docs/) (see [`docs/README.md`](docs/README.md) for the index):

- **migration/** — the Firebase → self-hosted plan, status, and the IT infra request.
- **runbooks/** — [deploy](docs/runbooks/DEPLOYMENT_RUNBOOK.md) and [rollback](docs/runbooks/ROLLBACK_RUNBOOK.md) procedures.
- **reference/** — domain model, database linkage, assessment methodology, UI theme.
- **qa/** — quality and production task tracking.

Agent/contributor guidance is in [`CLAUDE.md`](CLAUDE.md); the active hardening tracker is [`WORKPLAN.md`](WORKPLAN.md).

---

## Common scripts

| Command | What it does |
|---|---|
| `npm run dev` | Frontend dev server (needs the API running separately) |
| `npm run build` | Type-check + production build of the SPA → `dist/` |
| `npm test` | Frontend unit tests (Vitest) |
| `npm run typecheck` | Frontend type-check only |
| `cd server && npm run dev` | API in watch mode |
| `cd server && npm test` | API tests (auth + authorization) |
| `cd server && npm run migrate` | Run database migrations manually |
