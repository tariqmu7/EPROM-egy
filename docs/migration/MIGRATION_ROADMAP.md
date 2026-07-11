# EPROM CMS — Self-Hosted Migration Roadmap

**Goal:** Deploy the CMS to EPROM's own Linux servers with its own database and login, fully independent of Firebase (Firestore + Firebase Auth).

**Status legend:** ☐ not started · ◐ in progress · ☑ done · ⚠ blocked

_Last updated: 2026-07-10 · Owner: Tariq_

---

## 0. Locked Decisions

| # | Decision | Choice | Implication |
|---|---|---|---|
| D1 | Backend platform | **Custom Node + PostgreSQL REST API** (TypeScript) | We build and own the API; no BaaS lock-in |
| D2 | Hosting | **Linux VM + Docker Compose** on EPROM network | Whole stack ships as containers |
| D3 | Real-time | **Dropped → polling / manual refresh** | No WebSocket layer; replace 22 `onSnapshot` listeners with pollers |
| D4 | Existing data | **Migrate from Firestore (ETL)** | One-time export → transform → load; preserve document IDs |
| D5 | Auth | **Own JWT login** (email + password, argon2id hash) | Firebase Auth removed; existing login UI repointed |
| D6 | Migrated passwords | **Reset-on-first-login** | Firebase Auth hashes are not exportable (same as the 2026-05 migration note) |

---

## Target Architecture

```
                 EPROM Linux VM  (Docker Compose)
   ┌───────────────────────────────────────────────────────────┐
   │                                                           │
   │   ┌─────────────┐        ┌──────────────────────────┐    │
 443│   │   nginx     │  /     │  web  (React SPA, static)│    │
────┼──▶│ TLS + proxy │───────▶│  built with VITE_API_URL │    │
   │   │             │        └──────────────────────────┘    │
   │   │             │  /api   ┌──────────────────────────┐    │
   │   │             │────────▶│  api  (Node + Express/TS) │    │
   │   └─────────────┘         │  • JWT auth + login       │    │
   │                           │  • authz middleware       │    │
   │                           │  • REST over collections  │    │
   │                           └───────────┬──────────────┘    │
   │                                       │ SQL (parameterized)│
   │                           ┌───────────▼──────────────┐    │
   │                           │  postgres  (data volume)  │    │
   │                           └──────────────────────────┘    │
   │                           ┌──────────────────────────┐    │
   │                           │  backup  (nightly pg_dump)│    │
   │                           └──────────────────────────┘    │
   └───────────────────────────────────────────────────────────┘
```

**Firebase → self-hosted mapping**

| Today (Firebase) | Replacement |
|---|---|
| Firestore collections | PostgreSQL tables (relational columns for queried fields + `JSONB` for nested docs) |
| `firestore.rules` (authz) | **API authorization middleware** (role / department scoping / ownership) — security-critical |
| Firebase Auth (`signIn`/`signUp`/`resetPassword`/`onAuthStateChanged`) | JWT auth endpoints + session check |
| `onSnapshot` real-time (×22) | Polling fetchers writing the same in-memory arrays |
| `firebase.ts` init | `api.ts` fetch client (base URL + JWT header) |
| Firebase Hosting | nginx serving the static SPA build |

---

## Progress Overview

| Phase | Title | Status | % |
|---|---|---|---|
| 0 | Discovery, decisions & infra request | ◐ | 80% |
| 1 | PostgreSQL data model | ☑ | 100% |
| 2 | Backend API + auth + authorization | ☑ | 95% |
| 3 | Frontend data-access swap | ◐ | 70% |
| 4 | Data migration (ETL) | ◐ | 70% |
| 5 | Containerization & deployment | ◐ | 80% |
| 6 | Testing, security, cutover & go-live | ◐ | 15% |

> **Built locally on 2026-07-10 (pre-IT-meeting), verified without the VM:**
> Backend API is code-complete and **tested — 9/9 authz/auth tests pass on an
> in-memory Postgres (pg-mem), server builds, app typechecks clean.** What
> remains needs the actual server (running Postgres, live Firestore export,
> end-to-end app run). See **[MIGRATION_STATUS.md](MIGRATION_STATUS.md)** for the
> exact done / not-done breakdown.
>
> **Refinement to the data model:** each collection is stored as
> `(id, data JSONB, timestamps)` with expression indexes on hot fields — closer
> to Firestore's document shape, trivial ETL, uniform API. (Simpler than the
> original "relational columns + JSONB" idea; same query performance at this scale.)

---

## Phase 0 — Discovery, Decisions & Infra Request

**Outcome:** Everyone agrees on the plan; the server exists and is reachable.

- ☑ Inventory the Firebase surface (done this session):
  - All data access funnels through `DataService` in `services/store.ts` (~2,975 lines, **152 Firestore calls**).
  - **22 `onSnapshot` listeners** (`store.ts` ~L624–L800) mutate in-memory arrays, then call `notifySubscribers()`. Components subscribe via a stable `useSyncExternalStore` layer (`store.ts` L216–L253) — **swapping to polling does not touch page components.**
  - **4 auth methods** in `store.ts` (`signUp` L1103, `signIn` L1160, `resetPassword` L1266, `signOut` L1275) + `onAuthStateChanged` in `App.tsx` L50 and a stray `auth` import in `pages/EmployeeDashboard.tsx` L54.
  - Authorization currently lives entirely in `firestore.rules` (generated from `firestore.rules.template`).
- ☑ Lock decisions D1–D6 (above).
- ☐ **Infra request to IT** — spec the VM:
  - OS (Ubuntu LTS preferred), 4 vCPU / 8 GB RAM / 100 GB SSD (starting point), Docker + Docker Compose.
  - Open ports 80/443 on the internal network; outbound egress policy for `npm`/base images (or an offline image bundle if air-gapped).
  - Internal DNS name (e.g. `cms.eprom.local`) and a TLS certificate (internal CA or public).
  - Backup storage target + retention policy; SMTP relay host if password-reset emails are wanted (else admin-driven reset).
- ☐ Add `/server` workspace to the repo (API lives alongside the web app); keep the app buildable against Firebase until cutover.
- ☐ Confirm password-reset UX: email via SMTP relay **or** admin-set temporary password (decide based on IT).

**Exit criteria:** VM reachable over SSH, Docker works, DNS + TLS ready, repo has a `/server` skeleton.

---

## Phase 1 — PostgreSQL Data Model

**Outcome:** A schema that mirrors `types.ts` with the right indexes.

- ☐ Pick a migrations tool (recommend **Drizzle** or `node-pg-migrate`) and wire it into `/server`.
- ☐ Translate every collection/interface in `types.ts` into tables. Strategy: **relational columns for anything queried/filtered**, `JSONB` for nested document blobs to minimize rewrite.
  - Core tables: `users`, `skills`, `job_profiles`, `assessments`, `evidences`, `assessment_cycles`, `departments`, `notifications`, `training_courses`, `activity_logs`.
  - Plus from `types.ts`: `nominations`, `certificates`, `assessment_plans` (deprecated but read), career-history, scheduled-assessments as needed.
  - Keep nested shapes (`requiredSkills[]`, `assessmentMethods[]`, `raterWeights`) as `JSONB` so `store.ts` logic reuses them unchanged.
- ☐ Add indexes matching current Firestore `where` filters: `users(role, orgLevel, departmentId, managerId, jobProfileId, status)`, `assessments(userId, skillId, cycleId)`, `evidences(userId, status)`, `notifications(userId, read)`.
- ☐ Convert Firestore `Timestamp` → `timestamptz`; preserve original **document IDs** as text primary keys.
- ☐ Stand up a local dev Postgres (Docker) + apply migrations + smoke-seed.

**Exit criteria:** `migrate up` builds an empty schema locally; a hand-seeded row round-trips.

---

## Phase 2 — Backend API + Auth + Authorization

**Outcome:** A running API that authenticates users and serves collection data safely.

- ☐ Scaffold Node + TypeScript service (Express or Fastify) in `/server`; `pg` pool; `zod` validation; structured logging.
- ☐ **Auth endpoints:**
  - `POST /auth/login` → verify argon2id hash → issue JWT (short-lived) + refresh; rate-limited.
  - `GET /auth/me` (replaces `onAuthStateChanged`), `POST /auth/logout`, `POST /auth/reset-password`, `POST /auth/signup` (keep the existing pending-approval flow).
- ☐ **JWT middleware** — validate token, attach `req.user`; refresh strategy decided (httpOnly cookie recommended over localStorage).
- ☐ **Generic collection API** mirroring Firestore primitives so `store.ts` business logic is reused as-is:
  - `GET /col/:name` (query params → `where`), `GET /col/:name/:id`, `POST /col/:name` (addDoc), `PUT /col/:name/:id` (setDoc), `PATCH /col/:name/:id` (updateDoc), `DELETE /col/:name/:id`, `POST /batch` (writeBatch).
- ☐ **Authorization middleware — port every rule from `firestore.rules`** into server-side checks (role gates, department/section scoping, record ownership, bootstrap-admin email). Build a table-by-table access matrix. **This is the highest-risk item: the trust boundary moves from Firestore rules to this middleware.**
- ☐ Security basics: parameterized queries only, CORS locked to the SPA origin, login rate limiting, secrets via env, request size limits.

**Exit criteria:** Can log in via `curl`, receive a JWT, and read/write a collection only where authorized.

---

## Phase 3 — Frontend Data-Access Swap

**Outcome:** The SPA talks to the new API; Firebase imports gone. **No page-component rewrites.**

- ☐ Add `services/api.ts` — `fetch` client with base URL (`VITE_API_URL`) and JWT header; remove `firebase.ts`.
- ☐ In `store.ts`, introduce a **Firestore-compat shim** implementing `getDocs/getDoc/setDoc/addDoc/updateDoc/deleteDoc/query/where/writeBatch` against the API. Because all 152 calls use this same handful of primitives, the edit stays mechanical.
- ☐ Replace the 22 `onSnapshot` listeners with `startPolling(collection, cb, intervalMs)` that fetches immediately + on an interval, writes the **same in-memory arrays**, and calls the existing `notifySubscribers()`. The `subscribe()` / `useStoreData` layer is untouched.
  - Tune intervals per collection (e.g. notifications ~30s; org-wide dashboards on navigation + a manual **Refresh** button).
- ☐ Replace auth calls: `signUp`/`signIn`/`resetPassword`/`signOut` in `store.ts` and `onAuthStateChanged` in `App.tsx` → JWT equivalents; fix the stray `auth` import in `EmployeeDashboard.tsx`.
- ☐ Repoint the existing login / signup / forgot-password UI in `App.tsx` at the new auth (the login page already exists — no new screen needed).
- ☐ Retire Firebase build steps: drop `rules:build` from the deploy pipeline; repurpose the `CONFIG.SOURCE` guard; remove `firebase` from `package.json` at the end.

**Exit criteria:** App runs end-to-end against local Postgres + API with `firebase` uninstalled; all dashboards populate via polling.

---

## Phase 4 — Data Migration (ETL)

**Outcome:** Real Firestore data lives in Postgres with IDs preserved.

- ☐ **Export** all Firestore collections (Firebase Admin SDK / `gcloud firestore export`) — keep document IDs.
- ☐ **Transform** — map JSON to the Phase-1 schema; Firestore `Timestamp` → `timestamptz`; nested arrays → `JSONB`.
- ☐ **Load** — idempotent, re-runnable loader (safe to run twice for the cutover delta).
- ☐ **Users** — create rows; set `must_reset_password` (passwords can't come from Firebase Auth). Decide bulk temp-password vs first-login reset.
- ☐ Port the seed `.mjs` scripts (`seed-job-profiles`, `rebuild-org-hierarchy`, etc.) to target Postgres, or run them once post-load.
- ☐ **Verify** — row counts + spot-checks vs Firestore; validate skill scores/gaps for a sample of users match the old app.

**Exit criteria:** A verification report shows Postgres parity with the current Firestore data.

---

## Phase 5 — Containerization & Deployment

**Outcome:** The whole system runs on the EPROM VM via `docker compose up`.

- ☐ Dockerfiles: multi-stage API image; web build → static assets served by nginx.
- ☐ `docker-compose.yml`: `postgres` (named volume) + `api` + `nginx` (+ optional restricted `pgadmin`); health checks, restart policies, resource limits.
- ☐ nginx: serve the SPA, proxy `/api`, terminate TLS, set security headers.
- ☐ Secrets/env: DB creds + `JWT_SECRET` for the API; `VITE_API_URL` baked into the web build.
- ☐ **Backups:** nightly `pg_dump` to the backup target + a **tested restore**; document retention.
- ☐ Rewrite `DEPLOYMENT_RUNBOOK.md` and `ROLLBACK_RUNBOOK.md` for the container stack (remove Firestore-rules steps).

**Exit criteria:** Fresh `docker compose up` on the VM yields a working app over HTTPS at the internal DNS name.

---

## Phase 6 — Testing, Security, Cutover & Go-Live

**Outcome:** Verified, hardened, live on EPROM servers.

- ☐ **Parity tests:** extend `services/__tests__/store.test.ts` to run against the API; every DataService method covered.
- ☐ **Authorization tests:** each role can/can't do X — port the intent of the Firestore rules into API tests. Gate cutover on these passing.
- ☐ **Security review:** JWT lifetime/storage, password policy, login rate limiting, SQL-injection (parameterized), CORS, secrets handling, TLS config, backup encryption. (Run `/security-review`.)
- ☐ Load/soak test on the VM with realistic org volume; confirm polling intervals don't overload Postgres (check the indexes).
- ☐ **UAT** with a few real users across roles (Admin / CEO / Manager / Employee).
- ☐ **Cutover:** freeze Firebase writes → run final ETL delta → flip DNS to the VM → smoke test → announce.
- ☐ Keep a read-only Firebase export as fallback; after a stable window, decommission Firebase and remove the `firebase` dependency.
- ☐ Post-go-live monitoring (API logs, DB size, backup success, error rates).

**Exit criteria:** Users work entirely on the self-hosted system; Firebase is off the critical path.

---

## Top Risks & Watch-Items

1. **Authorization parity (highest).** Firestore enforced rules server-side; now the API middleware is the only gate. Nothing ships until the role/scoping/ownership tests pass.
2. **Password migration UX.** Firebase Auth hashes aren't exportable → reset-on-first-login; communicate to users, provide an admin fallback.
3. **Polling load.** Wrong intervals or missing indexes can hammer Postgres. Tune per collection; index every filter.
4. **On-prem email.** Password-reset emails need an SMTP relay; if unavailable, use admin-driven resets.
5. **Parallel run.** Keep the Firebase build deployable until cutover succeeds; the ETL loader must be re-runnable for the final delta.

---

## Rough Sequencing

Phases 1–2 (schema + API) are the backbone and can start immediately. Phase 3 (frontend swap) can begin as soon as the API skeleton exists and overlaps Phase 2. Phase 4 (ETL) needs the schema (Phase 1) done. Phase 5 packages it; Phase 6 verifies and flips. Indicative effort: a focused 6-phase sequence, with authorization (Phase 2) and ETL verification (Phase 4) as the pace-setters.
