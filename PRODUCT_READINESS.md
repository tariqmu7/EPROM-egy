# Product Readiness Roadmap — turning ECMS into a sellable product

> **Purpose of this file.** ECMS is currently a well-engineered *internal* competency
> system for EPROM. This document lists everything that stands between "our internal app"
> and "a product EPROM can sell to other companies." Each item is self-contained: what it
> is, why it matters, where in the code it lives, acceptance criteria, and a rough effort.
> Hand any single section back to Claude in a future session (e.g. *"implement section 2
> from PRODUCT_READINESS.md"*) and it can act on it directly.
>
> **Assessment date:** 2026-07-11 · **Branch reviewed:** `feat/clean-url-routing`
>
> **Verdict:** As an internal EPROM tool — functional and solid. As a repeatable product
> sold to multiple companies *as-is* — not yet. Strong foundation, missing the
> product/commercial layer. The items below, done in order, close that gap.

**Effort key:** S = ≤1 day · M = 2–5 days · L = 1–2 weeks · XL = 3+ weeks

---

## Recommended strategy first

Lean into the **self-hosted, one-isolated-instance-per-customer** model. It is the fastest
route to "sellable" because it reuses the Docker Compose stack that already exists, instead
of forcing a full multi-tenant rebuild. Most items below assume that model. If EPROM later
wants a single shared SaaS instance, revisit Section 1 (full multi-tenancy) — it is the only
item that changes materially.

Priority order for a minimum sellable product:
**2 → 3 → 4 → 6 → 5 → 8 → 10** (fix data privacy, white-label, finish migration,
provisioning, tests, SSO, licensing/GDPR). Section 1 only if going true multi-tenant.

---

## 1. Multi-tenancy (only if going shared-SaaS)

- **Status:** Absent. Every table is a flat single-company store. No `tenantId` /
  `companyId` on any row. The only `tenant` references in code are leftover Firebase Auth
  fields (`src/services/store.ts`, `auth-compat.ts`), not real app tenancy.
- **Why it matters:** A single shared deployment cannot safely serve multiple companies
  without data isolation.
- **Two paths:**
  - **A — Instance per customer (recommended):** no schema change; isolate via separate
    Docker Compose stacks / VMs. Cost moves to provisioning (Section 4).
  - **B — True multi-tenancy:** add `tenantId` to every table + every query, tenant-scoped
    auth, tenant resolution from domain/subdomain, cross-tenant leak tests.
- **Where:** `server/src/collections/*`, `server/src/authz.ts` (`listScope`),
  `server/migrations/*`, every read/write path.
- **Acceptance:** (Path B) No query returns another tenant's rows; automated cross-tenant
  isolation test passes.
- **Effort:** A = M · B = XL

---

## 2. Read-authorization / data privacy  **← highest priority**

- **Status:** ✅ **Done for the HR data (2026-07-11).** `server/src/authz.ts` now scopes
  reads of `assessments`, `evidences`, and `nominations` to own records + subordinate
  subtree (managers, transitive) + admin/CEO org-wide. Enforced on both list (a mandatory
  SQL scope via `listScope` → `buildWhere`, using a recursive-subtree helper in
  `collections/routes.ts`) and single-doc reads. Covered by tests in
  `server/src/__tests__/api.test.ts`. **Deliberate carve-outs:** `users` stays open-read
  (internal company directory — org chart / name resolution / 360° pickers depend on it;
  the scores live in the now-scoped collections) and `activityLogs` is unchanged (lower
  priority). Revisit both if a customer requires a private directory / restricted audit log.
- **Original status (for reference):** Too open. In `server/src/authz.ts` nearly every
  collection is `read: true` for *any* authenticated user — `users`, `assessments`,
  `evidences`, `nominations`, `activityLogs`. Any employee can read everyone's scores and
  evidence.
- **Why it matters:** This is performance/HR data (GDPR-relevant). A commercial HR buyer
  will reject open reads. This is the single biggest correctness/trust gap.
- **Where:** `server/src/authz.ts` — `usersPolicy`, `assessmentsPolicy`, `evidencesPolicy`,
  `nominationsPolicy`, and especially `listScope()` (currently only scopes notifications).
- **Fix outline:** Scope reads to: own records + subordinates (manager) + admin/CEO.
  Push the scope into SQL via `listScope` so list endpoints never over-return, not just
  single-doc reads.
- **Acceptance:** An employee querying `assessments`/`evidences`/`users` receives only rows
  they are entitled to; manager sees their reports; admin/CEO see all. Covered by tests.
- **Effort:** M

---

## 3. White-labeling / branding

- **Status:** Hardcoded "EPROM" — 36 references across 16 files (Logo, translations, App,
  export utilities, settings).
- **Why it matters:** A product must carry the *customer's* identity, not EPROM's.
- **Where:** `src/components/Logo.tsx`, `src/i18n/translations.ts`, `src/App.tsx`,
  `src/utils/dataExport.ts`, `src/utils/competenceStatement.ts`, `src/pages/SettingsPage.tsx`.
- **Fix outline:** Introduce a branding config (company name, logo asset, primary theme
  color, app title, document/report header) sourced from env or an admin Settings record.
  Replace all literals with that config.
- **Acceptance:** Changing one config swaps name, logo, colors, and report headers with no
  code edits.
- **Effort:** M

---

## 4. Provisioning & upgrade tooling (for instance-per-customer)

- **Status:** Absent. Admin seeding is via `BOOTSTRAP_ADMIN_EMAIL` env; no turnkey setup,
  no per-customer config bundle, no upgrade/patch path.
- **Why it matters:** Selling to non-technical HR departments requires a repeatable,
  low-touch install and a safe way to ship updates to each customer instance.
- **Where:** `docker-compose.yml`, `deploy/`, `server/scripts/`, `docs/runbooks/`.
- **Fix outline:** Scripted provisioning (generate `.env` with secrets, branding, seed
  admin, org import), versioned migrations run on boot (already partly present), documented
  upgrade command + rollback (extend `ROLLBACK_RUNBOOK.md`), a first-run setup wizard in
  the SPA.
- **Acceptance:** A new customer instance can be stood up from a single documented command
  set with only a config file; upgrading an existing instance is one command and is
  reversible.
- **Effort:** L

---

## 5. Automated test coverage

- **Status:** Very thin. ~9 backend test cases in one file
  (`server/src/__tests__/api.test.ts`), 2 frontend test files
  (`src/services/__tests__/store.test.ts`, `src/__tests__/routes.test.ts`), no E2E.
- **Why it matters:** A product shipped and maintained across releases needs a regression
  net, especially around auth/authz and scoring logic.
- **Where:** expand `server/src/__tests__/`, `src/**/__tests__/`; add an E2E harness
  (Playwright) covering login → assess → gap → ITP.
- **Fix outline:** Prioritize authz tests (tie to Section 2), scoring/gap/career/ITP logic
  in `store.ts`, and one happy-path E2E per role.
- **Acceptance:** CI runs unit + E2E; authorization and scoring paths covered; meaningful
  coverage threshold enforced.
- **Effort:** L

---

## 6. Finish the Firebase → self-hosted migration

- **Status:** ✅ **Mostly done (2026-07-11).** `firebase-admin` removed from the server's
  runtime dependencies (it was only imported by the one-off ETL export script, which
  documents its own `npm i firebase-admin`); server builds/tests green without it. Frontend
  `package.json` is Firebase-free and the root Firebase artifacts (`firebase.ts`,
  `firestore.rules.template`, `.firebaserc`, `firebase*.json`, `firestore.indexes.json`,
  `gen-firestore-rules.mjs`) are deleted. **Remaining:** the compat shims
  (`src/services/*-compat.ts`) are retained as the permanent REST adapter (fine to keep —
  document as such), and the live-data cutover (Phase 6) is an operational step, not code.
- **Original status (for reference):** Incomplete. CLAUDE.md notes cutover (Phase 6) is
  still pending. `firebase-admin` is still a server dependency; auth still flows through
  Firebase-shaped compat shims (`src/services/auth-compat.ts`, `firestore-compat.ts`).
- **Why it matters:** Dead weight, confusion, and a red flag in a buyer's technical
  due-diligence. Also simplifies everything else.
- **Where:** `server/package.json` (`firebase-admin`), `src/services/*-compat.ts`,
  `docs/migration/`, any residual `firestore.rules.template` / `firebase-blueprint.json`.
- **Fix outline:** Complete Phase 6, remove `firebase-admin`, retire the compat shims in
  favor of direct API calls (or keep shims but document them as the permanent adapter),
  delete Firebase artifacts.
- **Acceptance:** No Firebase dependency in `package.json`; app builds and all flows work
  without any Firebase reference.
- **Effort:** M

---

## 7. Enterprise auth — SSO & MFA

- **Status:** Email/password → JWT only (`server/src/auth/`).
- **Why it matters:** Corporate buyers almost always require SAML/OIDC SSO; many require MFA.
- **Where:** `server/src/auth/routes.ts`, `middleware/authenticate.ts`, `authz.ts`, SPA
  login (`src/services/auth-compat.ts`, `App.tsx`).
- **Fix outline:** Add OIDC/SAML login (e.g. via a standard library), map external identity
  to the existing user profile by email, optional TOTP MFA for local accounts.
- **Acceptance:** A customer can wire their IdP; SSO users land with correct role; local
  accounts can enable MFA.
- **Effort:** L

---

## 8. Licensing, GDPR & compliance layer

- **Status:** No LICENSE file, no license model, no GDPR data export/delete, no consent
  records.
- **Why it matters:** HR data + commercial sale = contractual and regulatory obligations.
- **Where:** repo root (LICENSE), `server/src/` (export/delete endpoints), admin UI.
- **Fix outline:** Decide commercial license terms; add per-user data export ("right to
  access") and delete ("right to be forgotten"); document data-processing.
- **Acceptance:** LICENSE present; admin can export and permanently delete a user's data;
  documented DPA-ready data map.
- **Effort:** M

---

## 9. Notifications delivery (email/SMS)

- **Status:** In-app only (`notifications` collection); no outbound channel.
- **Why it matters:** HR workflows (assessment due, evidence approved) expect email.
- **Where:** `server/src/`, `notifications` write paths, `src/components/NotificationBell.tsx`.
- **Fix outline:** Add an email transport (SMTP config per instance) that mirrors in-app
  notifications; make channel configurable.
- **Acceptance:** Key events send email; delivery configurable and off-by-default-safe.
- **Effort:** M

---

## 10. Observability & operations

- **Status (light pass done 2026-07-11):** The `api` service now has a dependency-free
  `/health` healthcheck in `docker-compose.yml`, and `web` waits for the API to be *healthy*
  (not merely started) before serving — closing the boot/migration race. Verified the nightly
  `pg_dump` backup service (30-day retention) and the API error handler (`server/src/app.ts`)
  that logs and returns a generic 500. **Still open (full pass):** centralized/structured
  logging, metrics, an error tracker (e.g. Sentry), and an exportable admin audit trail.
- **Original status (for reference):** `activityLogs` exists but no centralized logging,
  metrics, error tracking, or uptime/health monitoring beyond `/health`.
- **Why it matters:** Enterprise buyers ask for audit trails, monitoring, and supportability.
- **Where:** `server/src/app.ts` (error handler already present), add logging/metrics
  middleware; wire an error tracker (e.g. Sentry) in SPA + API.
- **Fix outline:** Structured request logging, error tracking, basic metrics, exportable
  admin audit trail from `activityLogs`.
- **Acceptance:** Errors are captured centrally; admin can export an audit log; ops has
  health + basic metrics.
- **Effort:** M

---

## 11. Scale & performance hardening

- **Status:** Real-time is polling (`VITE_POLL_INTERVAL_MS`), not push. Avatars are base64
  data URLs stored inside the `users` row.
- **Why it matters:** Fine for small orgs; rough for large enterprises (API load from
  polling, DB bloat from inline images).
- **Where:** `src/services/firestore-compat.ts` (polling), `users` avatar storage.
- **Fix outline:** Consider push/SSE or smarter polling cadence; move avatars/large assets
  to object storage or a dedicated blob table; add pagination where lists can grow large.
- **Acceptance:** Large-org load test passes acceptably; DB size no longer dominated by
  avatar blobs.
- **Effort:** L

---

## 12. Commercial & product surface (non-code)

- **Status:** Absent. No end-user documentation (only ops runbooks), no pricing/tiering,
  no demo/sandbox, no onboarding material.
- **Why it matters:** These are what make it *sellable*, not just deployable.
- **Fix outline:** End-user guides per role, a demo/seed dataset, pricing/packaging
  decision, first-run onboarding, optional feature tiering.
- **Acceptance:** A prospect can be given a demo instance and end-user docs without EPROM
  hand-holding.
- **Effort:** L

---

## Quick reference — do-this-order for a minimum sellable product

1. **Section 2** — lock down read authorization (privacy). *(M)*
2. **Section 3** — white-label branding. *(M)*
3. **Section 6** — finish migration, strip Firebase. *(M)*
4. **Section 4** — provisioning + upgrade tooling. *(L)*
5. **Section 5** — real tests + E2E. *(L)*
6. **Section 7** — SSO. *(L)*
7. **Section 8** — licensing + GDPR. *(M)*

Sections 1, 9, 10, 11, 12 follow based on the target customer profile. Go true multi-tenant
(Section 1B) only if EPROM decides on a shared-SaaS model instead of instance-per-customer.
