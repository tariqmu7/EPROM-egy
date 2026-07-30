# EPROM Competency Management System

## Project Overview

A **self-hosted** React SPA (backed by a Node + Express + PostgreSQL API) for employee competency management. The system allows admins to define **Job Profiles** with required skill levels, assign employees to those profiles, and evaluate each employee's proficiency across all relevant skills. Output includes skill gap reports, Individual Training Plans (ITP), and career progression roadmaps. It runs entirely on company infrastructure — no external cloud dependency. (It was migrated off Firebase; see [`docs/migration/`](docs/migration/).)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS |
| Backend (API) | Node 20 + Express REST API (`server/`) — JWT auth, authz middleware, generic `/col` + `/batch` endpoints |
| Database | PostgreSQL — each former collection is a table of JSON(B) documents; reached **only** through the API |
| Auth | Email/password → JWT (HS256), bcrypt-hashed passwords, issued by the API |
| Deploy | Docker Compose (postgres + api + web/nginx + backup) on one Linux VM |
| Charts | Recharts |
| Icons | Lucide React |
| Bulk Import | XLSX (Excel parsing) |

---

## Project Structure

> **Frontend source lives under `src/`** (deep-restructured 2026-07-11). Config
> files (vite/vitest/tailwind/tsconfig/postcss/eslint) and `index.html` stay at the
> repo root. The self-hosted backend lives under `server/`. Loose docs live under
> `docs/`. See [`WORKPLAN.md`](WORKPLAN.md) for the local-server hardening tracker.

```
ECMS/
├── index.html           # Vite entry → loads /src/main.tsx
├── src/
│   ├── main.tsx         # React bootstrap (was index.tsx)
│   ├── App.tsx          # Root: auth screen + role-based tab routing
│   ├── routes.ts        # Clean-URL routing map + SUB_VIEWS (see Navigation below)
│   ├── types.ts         # All TypeScript interfaces & enums
│   ├── constants.ts     # Proficiency level labels (1=Awareness → 5=Expert)
│   ├── hooks/           # useUrlRouting, usePersistentView, useSessionState, useStoreData
│   ├── services/
│   │   ├── store.ts     # DataService — all data ops & business logic
│   │   ├── api-client.ts        # HTTP client for the self-hosted API (JWT)
│   │   ├── firestore-compat.ts  # Firestore-shaped shim over the REST API (polling)
│   │   └── auth-compat.ts       # Firebase-Auth-shaped shim over JWT auth
│   ├── pages/           # AdminPanel, EmployeeDashboard, ManagerDashboard, CEOPanel,
│   │   │                # EvaluationsHub, OnlineAssessments, ManagerialInterviews,
│   │   │                # BehavioralAssessment (360°), EvidencePortal, etc.
│   │   │                # (skill assessment config is inline via SkillForm +
│   │   │                #  components/AssessmentMethodEditor.tsx)
│   ├── components/      # Layout (sidebar+header), BulkUpload, SearchableSelect,
│   │   │                # NotificationBell, AssessmentHistoryLog, ui/ …
│   ├── i18n/ · utils/ · assets/ · constants/ (standards.ts) · __tests__/
├── server/              # Self-hosted backend: Node + Express + Postgres (JWT auth,
│   │                    # authz middleware, generic /col REST, /batch, migrations,
│   │                    # scripts/serve-local.ts = embedded-Postgres one-command run)
├── deploy/nginx.conf    # SPA + /api reverse proxy (company-domain host)
├── docs/                # migration/ · runbooks/ · qa/ · reference/  (+ docs/README.md)
└── run.bat              # One-click: boots backend (:4000) + frontend (:5173)
```

---

## Core Data Model (Collections)

> Each "collection" below is now a **PostgreSQL table** holding JSON(B) documents
> (original document IDs preserved from the Firebase export). The frontend still
> reads/writes them with Firestore-shaped calls via the compat shims; the API's
> generic `/col/:collection` endpoints translate those to SQL. The logical model is
> unchanged from the Firestore era — only the storage engine changed.

### Key Collections

| Collection | Purpose |
|---|---|
| `users` | Employee profiles: role, orgLevel, departmentId, managerId, jobProfileId |
| `skills` | Competency catalog with 5-level proficiency scale. Each skill owns its assessment definition inline via `assessmentMethods: SkillAssessmentMethod[]` — each block pairs *how* (method + prompt / link / question bank) with *when* (frequency) and *who* (audience). Configured in the **Competency Standard** form (SkillForm). Supersedes the old `assessmentInstructions` + `assessmentPlans` split |
| `jobProfiles` | **One position = one profile.** Each box/position in the org chart is its own job profile, scoped to a single `orgLevel` with a flat `requiredSkills: { skillId, requiredLevel }[]` list |
| `assessments` | Score records per user/skill/cycle (Self, Peer, Manager, Exam, Interview, etc.) |
| `evidences` | Work records submitted by employees, approved by managers |
| `assessmentCycles` | Time-bound evaluation periods (ACTIVE / CLOSED). Read-only now — historical appraisal labelling only; no admin UI writes cycles since the Assessment Engine was removed |
| `assessmentPlans` | **@deprecated** — superseded by inline `Skill.assessmentMethods`. Retained only for legacy parsing + the one-time migration, and for the company-wide `ANNUAL_APPRAISAL` config still read by Behavioral Assessment |
| `departments` | Org units with hierarchy (General → Department → Section) |
| `notifications` | In-app alerts per user |
| `trainingCourses` | Courses linked to skills for ITP recommendations |
| `workExperiences` | Employment **outside** the company: employee-submitted, manager-verified. Each record tags skills with `{ claimedLevel, yearsApplied, suggestedLevel, verifiedLevel }`. A VERIFIED record's `verifiedLevel` becomes a **capped provisional** competency baseline (see Skill Scoring). Distinct from `User.careerHistory`, which is internal movement only |
| `appSettings` | Company-wide admin config, one row per key. Row `work-experience` holds the years→level band table + provisional cap. Read-open, admin-write |

### Org Hierarchy (OrgLevel enum)
`CEO` → `ACEO` → `GM` → `AGM` → `DM` → `SH` → `SP` → `JP` → `FR`

A job profile's `orgLevel` is **derived from the org-chart node's structural type** (`COMPANY` / `EXECUTIVE` / `SECTOR` / `GENERAL` / `DEPARTMENT` / `POSITION`), never inferred from the position name or who it reports to. Mapping: `EXECUTIVE→CEO`, `SECTOR→ACEO`, `GENERAL→GM`, `DEPARTMENT→SH`, `POSITION→by title`. (The mapping constant is `DEPT_TYPE_TO_ORG_LEVEL` in `src/types.ts`.)

### User Roles
- `ADMIN` — full system management
- `CEO` — org-wide read + executive analytics
- `EMPLOYEE` — own assessments, ITP, evidence submission
- Managers are employees flagged by `isManager(user)` based on org position

---

## Core Business Logic (services/store.ts)

### Skill Scoring (`getUserSkillScore`)
- **360° / OJT skills**: Weighted average — Self 10% + Peer 30% + Manager 60%
- **Direct assessment skills**: Latest score from WRITTEN_EXAM, INTERVIEW, or PRACTICAL_DEMO
- **Evidence skills**: Highest `assignedScore` from APPROVED work records
- **Provisional fallback (work experience)**: when a skill has **no** usable assessment *and* **no**
  scored approved evidence, the highest `verifiedLevel` across the user's VERIFIED `workExperiences`
  applies, clamped to `appSettings/work-experience.maxProvisionalLevel` (default L3). A real record
  always wins. The fallback sits **after** the 360°/direct branch split in `computeSkillScore` — the
  360° branch never reaches the evidence tier, and `getSkillPrimaryMethod` defaults to
  `OJT_OBSERVATION`, so putting it inside the `else` would skip most skills.
- `getUserSkillScore` is a thin cached wrapper over `computeSkillScore`; use
  `getUserSkillScoreDetail` / `getSkillScoreSource` (`'ASSESSMENT' | 'EVIDENCE' | 'EXPERIENCE' | 'NONE'`)
  to render the "Provisional" badge. `skillScoreCache` stores `{ score, source }` and **must** be
  cleared by any new scoring input.
- **Deliberate exception:** `getEmployeeAssessmentQueue` treats an `EXPERIENCE`-sourced score as 0, so
  provisional credit never stops the system asking for the assessment that would confirm it.

### Effective Requirements (`getEffectiveRequirements`)
The single resolver for "what does this position require". Returns the profile's flat `requiredSkills` list (dropping any that reference deleted skills). All readers — scoring, gap, ITP, career, TNA, assessment queues, and the page components — go through it.

### Skill Gap
`gap = requiredLevel - currentScore`

Used to drive ITP generation and career path readiness calculations.

### Career Path (`generateCareerPath`)
For each OrgLevel above the employee, finds the position profile at that level in the same general department and compares the employee's current scores vs. that profile's `requiredSkills`. Readiness buckets: `READY_NOW`, `READY_1_2_YEARS`, `READY_3_5_YEARS`, `DEVELOPMENT_NEEDED`.

### ITP (`generateIndividualTrainingPlan`)
Auto-generates training recommendations from skill gaps, linked to courses in `trainingCourses`.

### TNA (`generateDepartmentalTNA`)
Aggregates skill gaps across a whole department for L&D planning.

### Assessment Scheduling (`getNextAssessmentDate`)
Driven by each skill's inline `assessmentMethods`. For a user+skill it takes every method block whose `audience` matches the user (`isUserInAudience` / `getApplicableMethodsForUserSkill`), computes each block's next-due date from its `frequency`, and returns the **earliest** (most urgent) one. No applicable block ⇒ `null` ⇒ skill is treated as one-time and never becomes due again. Feeds `getEmployeeAssessmentQueue` and the OnlineAssessments / ManagerialInterviews / EvidencePortal due-date displays. `CERTIFICATE_BASED` blocks drive evidence expiry via `isSkillCertificateBasedForUser`. Resolution is legacy-safe: `getSkillAssessmentMethods` falls back to synthesizing blocks from deprecated linked instructions / per-skill fields until the one-time `migrateAssessmentConfigToSkills` runs (admin-triggered).

---

## Assessment Methods

| Method | Description |
|---|---|
| `WRITTEN_EXAM` | Online exam via external link; scores imported |
| `INTERVIEW` | Structured manager interview |
| `PRACTICAL_DEMO` | Hands-on skill demonstration |
| `OJT_OBSERVATION` / `THREE_SIXTY_EVALUATION` | 360° behavioral observation |
| `WORK_RECORD_REVIEW` | Employee submits evidence; manager grades |

---

## Key Workflows

1. **Admin** creates Skills → creates Job Profiles (attaches skills + required levels per OrgLevel) → assigns employees to job profiles
2. **Employee** takes assessments (online/360°/interview) and submits evidence → scores recorded
3. **Manager** reviews evidence, conducts interviews, rates subordinates in 360° evaluations
4. **System** calculates skill gaps → generates ITP and career path
5. **Admin** configures each skill's assessment inline in the **Competency Standard** form (Assessment Methods tab): one or more method blocks, each defining *how* (method + prompt / link / question bank), *when* (frequency) and *who* (audience). These blocks drive when each employee's skills become due for re-assessment

---

## Navigation / Routing

**Clean-URL routing** (History API — no React Router dependency). `activeTab` in `App.tsx`
remains the source of truth for which page renders; a thin sync layer keeps the browser URL,
deep links, page refresh, and back/forward in step with it. Every page has a real, bookmarkable
URL (e.g. `/admin/users`, `/evaluations/360`, `/ceo/profile/:userId`).

Moving parts:
- [`src/routes.ts`](src/routes.ts) — **the single source of truth**: a `TAB_PATHS` map pairing
  each `activeTab` key with a clean path, plus `routeToPath` / `pathToRoute` helpers, plus
  `SUB_VIEWS` (page-level sub-tabs → URL sub-segments) with `buildSubViewPath` /
  `readSubViewFromPath`. Base-path aware (reads `import.meta.env.BASE_URL`).
- [`src/hooks/useUrlRouting.ts`](src/hooks/useUrlRouting.ts) — bidirectional sync: adopts the URL
  on first authenticated render (deep link/refresh), pushes history entries on tab change, applies
  back/forward pops via `applyRoute`. **Skips the state→URL push when the address bar already
  resolves to the active tab**, so adopting a deep link never flattens a sub-view (`/dashboard/history`).
- **Sub-view persistence (refresh-stable + deep-linkable):**
  - [`src/hooks/usePersistentView.ts`](src/hooks/usePersistentView.ts) — a `useState` drop-in that
    syncs a page's sub-tab to a URL sub-segment (`/dashboard/idp`) **and** sessionStorage. Has an
    `enabled` flag so a page reused in an embedded context (EmployeeDashboard inside a CEO/manager
    profile) does NOT rewrite the URL. Used by EmployeeDashboard (Overview/IDP/History/Certificates/Career).
  - [`src/hooks/useSessionState.ts`](src/hooks/useSessionState.ts) — sessionStorage-backed `useState`
    for finer in-page state that shouldn't own a URL (admin list filters, the dept Personnel/Sub-units
    drill-down tab).
  - EvaluationsHub reports sub-tab changes up via an `onTabChange` callback → App points `activeTab`
    at that sub-tab's existing route (`/evaluations/360` …), so the URL + refresh follow.
- `base: '/'` in [`vite.config.ts`](vite.config.ts) — the app is served from a domain **root**
  (company-domain nginx), not GitHub Pages, so bundled asset URLs are absolute and resolve
  correctly at any route depth.

> **RULE — every feature must be routable.** When you add a page/tab, add a row to `TAB_PATHS`
> in `src/routes.ts`. Navigation still flows through `setActiveTab` / `onSwitchTab` (unchanged) —
> the sync layer turns any tab change into a URL automatically. A tab with no row still renders but
> its URL falls back to `/dashboard` and it won't be deep-linkable. Parameterised routes (like
> `ceo-view-profile`) are handled explicitly in `routeToPath`/`pathToRoute`. For a page with
> **sub-tabs**, add a `SUB_VIEWS` entry and use `usePersistentView` so each sub-tab is a real URL.

| Tab Key | Path | Component | Role |
|---|---|---|---|
| `emp-dashboard` | `/dashboard` | EmployeeDashboard | Employee |
| `evaluations` | `/evaluations` | EvaluationsHub | Employee |
| `manager-dashboard` | `/manager` | ManagerDashboard | Manager |
| `admin-dashboard/users/jobs/skills/depts/analytics` | `/admin`, `/admin/users`, … | AdminPanel | Admin |
| `admin-experience` | `/admin/experience` | WorkExperienceAdmin | Admin |
| `ceo-dashboard` / `ceo-view-profile` | `/ceo`, `/ceo/profile/:userId` | CEOPanel | CEO |

> **Deploy note:** clean URLs need the host to serve `index.html` for any unknown path (SPA
> fallback). In production the **`web` container (nginx)** serves the built SPA (`npm run build`
> → `dist/`, baked into the image) **and** reverse-proxies `/api/` to the `api` container — see
> [`deploy/nginx/nginx.conf`](deploy/nginx/nginx.conf) (Docker) and [`deploy/nginx.conf`](deploy/nginx.conf)
> (standalone host install). The `try_files $uri $uri/ /index.html;` line is what makes deep links
> survive a hard refresh. CI validates the build via [`.github/workflows/ci.yml`](.github/workflows/ci.yml)
> but does not deploy — deployment is `docker compose up -d --build` on the VM (see
> [`docs/runbooks/DEPLOYMENT_RUNBOOK.md`](docs/runbooks/DEPLOYMENT_RUNBOOK.md)).

---

## Development Notes

- All data access goes through `DataService` in `src/services/store.ts` — do not call the API/DB directly from components.
- `src/types.ts` is the source of truth for all interfaces; update it before adding new fields.
- `src/constants.ts` holds proficiency level labels — the scale is always 1–5.
- **Backend:** the app now talks to the self-hosted API under `server/` (Node + Express +
  Postgres, JWT auth). In the browser, `store.ts` still uses Firestore-shaped calls — they are
  served by the compat shims (`src/services/firestore-compat.ts` + `auth-compat.ts`) over
  `src/services/api-client.ts`. `VITE_API_URL` points the SPA at the API (`.env.local` /
  `.env.production`). Real-time is polling (`VITE_POLL_INTERVAL_MS`), not `onSnapshot` — but the
  poll is now **delta sync**: each `onSnapshot` listener keeps a local cache and fetches only
  rows changed since a cursor (`updated_at`), plus hard-deletes as **tombstones**, reconstructing
  the same full snapshot `store.ts` consumes (so no listener code changed). A full resync runs
  periodically to self-heal edge cases. Ordered listeners (e.g. `activityLogs`) opt out and stay
  full-snapshot. Merge-writes (`updateDoc` / `setDoc(merge)`) carry **optimistic concurrency**:
  the shim sends the last-seen `version`, and on a `409` re-reads and retries (server re-merges),
  surfacing `VersionConflictError` only on a genuine same-field race. Full-replace `setDoc` and
  `writeBatch` stay last-write-wins. All of this lives in `firestore-compat.ts`.
- **Local run:** `run.bat` (or `cd server && npx tsx scripts/serve-local.ts` for the API +
  embedded Postgres, and `npm run dev` for the SPA). Seeded admin comes from `server/.env`
  (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).
- Firebase→self-hosted migration is tracked in [`docs/migration/`](docs/migration/). Cutover
  (Phase 6) is still pending; `firebase.ts` and the Firestore rules pipeline have been removed
  from the frontend.

---

## Backend / Self-Hosted Infrastructure

The app is served entirely from company infrastructure — a single Linux VM running the
whole stack via **Docker Compose** ([`docker-compose.yml`](docker-compose.yml)). No Firebase,
no external cloud. Four services:

| Service | Image / build | Role |
|---|---|---|
| `postgres` | `postgres:16-alpine` | The database; data persisted in the `pgdata` named volume |
| `api` | `./server` (Node 20 + Express) | REST API; **runs DB migrations on boot**; JWT auth |
| `web` | [`Dockerfile.web`](Dockerfile.web) (nginx) | Serves the built SPA + reverse-proxies `/api` (ports 80/443) |
| `backup` | `postgres:16-alpine` | Nightly `pg_dump` → `./backups`, 30-day retention |

### API surface ([`server/src/app.ts`](server/src/app.ts))
- `GET /health` — liveness (`{ ok: true }`), unauthenticated. `GET /health/ready` also pings the
  DB (`503` if down) so orchestrators can tell "restart me" from "not ready yet".
- `/auth/*` — public: `login`, `signup`, password reset; `/auth/me` is protected. Auth endpoints
  are rate-limited; a blunt global IP rate limit guards the rest (off under `NODE_ENV=test`).
- `/col/:collection` — authenticated generic CRUD/query over the Postgres tables
  (allowlisted collection names in [`server/src/collections/registry.ts`](server/src/collections/registry.ts)).
  Every write is validated against a per-collection **zod schema**
  ([`server/src/collections/schemas.ts`](server/src/collections/schemas.ts)) — a malformed doc is
  rejected `422` before it hits the DB (permissive: unknown keys pass through; only known
  identity/enum fields are enforced when present). The role/status/orgLevel value sets live in ONE
  place — [`server/src/domain/enums.ts`](server/src/domain/enums.ts) — imported by both the zod
  schemas and `authz.ts`, with a parity test asserting the migration `CHECK`s agree
  ([`server/src/__tests__/contracts.test.ts`](server/src/__tests__/contracts.test.ts)). Every
  list/query response is bounded server-side by `MAX_PAGE_SIZE` (no unbounded reads).
- `/batch` — authenticated multi-write. Inside ONE transaction it authorizes **every** op first,
  then applies them, so a single forbidden op rolls the whole batch back and never partially applies.

**Response envelope + concurrency.** Reads/writes return `{ id, data, version, createdAt, updatedAt }`
(additive — the compat shim still reads `.data`). Every table carries a `version` that bumps on
each write, plus `created_by`/`updated_by` audit columns. A write may send an optional
`expectedVersion`; a mismatch returns `409 version_conflict` with the current version
(optimistic concurrency — absent ⇒ legacy last-write-wins). See migration
[`002_foundation.sql`](server/src/migrations/002_foundation.sql), which also promotes hot JSONB
fields (role/status/orgLevel/ids…) to typed **generated columns** with `CHECK` enum constraints
(DB-level defense beneath zod) and adds GIN indexes over `data`. The generic read path filters via
`data->>'field'` (served by the 001 expression indexes), so migration
[`004_prune_redundant_indexes.sql`](server/src/migrations/004_prune_redundant_indexes.sql) dropped the
duplicate generated-column indexes 002 had added — the typed columns remain for their `CHECK`s and
reporting. Migrations are applied transactionally with checksum drift-detection
([`server/src/migrate.ts`](server/src/migrate.ts)) — **never edit an applied migration; add a new one.**
Because there are no foreign keys (dangling refs are dropped at read time), `npm run integrity` (in
`server/`) reports any orphaned references on demand ([`server/scripts/check-integrity.ts`](server/scripts/check-integrity.ts)).

**Delta sync + tombstones.** `POST /col/:collection/query` accepts an optional `since` cursor;
when set it returns only rows with `updated_at > since` (ordered by `updated_at`), plus a
`deletions[]` list from the **`tombstones`** table ([`003_tombstones.sql`](server/src/migrations/003_tombstones.sql))
so clients can evict hard-deleted ids, plus a `cursor` for the next poll. Every response now
carries `cursor`. DELETE writes a tombstone; create/set clears it (helpers in
[`server/src/collections/tombstones.ts`](server/src/collections/tombstones.ts)). The cursor is
millisecond-precision, so a boundary row may be re-sent once — harmless (the client cache merge is
idempotent).

**Observability.** Every request gets an `x-request-id` (honoured from the client or generated),
a per-request child logger, and a structured JSON access log; the error handler logs with that id
and returns it in the `500` body. Zero-dependency logger in [`server/src/logger.ts`](server/src/logger.ts)
(`LOG_LEVEL` env; silent under test).

### Configuration (env vars, all gitignored)
- **Frontend (Vite):** `VITE_API_URL` (points the SPA at the API — `/api` behind nginx) and
  `VITE_POLL_INTERVAL_MS` (poll cadence, since there is no `onSnapshot`). Copy
  [`.env.example`](.env.example) → `.env.local` / `.env.production`.
- **API (local dev):** Postgres (`PG*`), `JWT_SECRET` (**required in prod — no default**),
  `JWT_EXPIRES_IN`, `BCRYPT_ROUNDS`, `BOOTSTRAP_ADMIN_EMAIL`, `ALLOW_SIGNUP`, `CORS_ORIGINS`.
  Copy [`server/.env.example`](server/.env.example) → `server/.env`. Resolved in
  [`server/src/config.ts`](server/src/config.ts).
- **Docker Compose:** copy [`.env.docker.example`](.env.docker.example) → `.env` (repo root):
  `PGUSER` / `PGPASSWORD` / `PGDATABASE`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `CORS_ORIGINS`.

### Auth & authorization
- Email/password. Passwords are **bcrypt**-hashed; login issues a **JWT (HS256)** signed with
  `JWT_SECRET`. The token is stored client-side and sent as a bearer token; every request
  reloads the fresh user doc so role/status is never stale, and non-`ACTIVE` accounts are locked out.
- **Authorization** is enforced server-side in [`server/src/authz.ts`](server/src/authz.ts) +
  [`server/src/middleware/authenticate.ts`](server/src/middleware/authenticate.ts) — a port of the
  old `firestore.rules` (self-update cannot change `role`, owner/manager scoping, admin-write allowlist).
- `BOOTSTRAP_ADMIN_EMAIL` is treated as ADMIN before any user holds the `ADMIN` role
  (first-run / recovery only); normal admin access is role-driven (`users` doc `role == 'ADMIN'`).

### Data migration notes (from the Firebase era)
- All collections were exported and loaded into Postgres with original document IDs preserved
  (ETL: [`server/scripts/etl/`](server/scripts/etl/)).
- Firebase Auth accounts are **not** migratable — users must sign up again with the same email;
  the new account is linked to the existing profile by email on first sign-up.
- User avatars are base64 data URLs stored directly in the `users` document (no object storage).
- Live-data cutover is the migration's own **Phase 6** — see [`docs/migration/`](docs/migration/).
