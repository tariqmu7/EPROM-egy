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
| `skills` | Competency catalog with 5-level proficiency scale. Each skill owns its assessment definition inline via `assessmentMethods: SkillAssessmentMethod[]` — each block pairs *how* (method + prompt / link / question bank) with *when* (frequency) and *who* (audience). Configured in the **Competency Standard** form (SkillForm). Supersedes the old `assessmentInstructions` + `assessmentPlans` split. Also carries `criticality` (see Skill criticality below) — the weight every gap on this skill is ranked by |
| `jobProfiles` | **One position = one profile.** Each box/position in the org chart is its own job profile, scoped to a single `orgLevel` with a flat `requiredSkills: { skillId, requiredLevel }[]` list |
| `assessments` | Score records per user/skill/cycle (Self, Peer, Manager, Exam, Interview, etc.) |
| `evidences` | Work records submitted by employees, approved by managers |
| `assessmentCycles` | Time-bound evaluation periods (ACTIVE / CLOSED). Read-only now — historical appraisal labelling only; no admin UI writes cycles since the Assessment Engine was removed |
| `assessmentPlans` | **@deprecated** — superseded by inline `Skill.assessmentMethods`. Retained only for legacy parsing + the one-time migration, and for the company-wide `ANNUAL_APPRAISAL` config still read by Behavioral Assessment |
| `departments` | Org units with hierarchy (General → Department → Section) |
| `notifications` | In-app alerts per user |
| `trainingCourses` | **The training catalogue** — courses linked to skills, so a gap can be answered with a real course name (ITP + TNA). Admin CRUD + Excel import at `/admin/courses` ([`src/pages/TrainingCatalogue.tsx`](src/pages/TrainingCatalogue.tsx)). Fields: title · provider · `type` INTERNAL/EXTERNAL/OJT · `linkedSkillIds[]` · code · targetLevel · durationHours · costPerSeat · link. **Soft-delete only** (`isArchived`) — an old plan may still reference the id |
| `workExperiences` | Employment **outside** the company: employee-submitted, manager-verified. Each record tags skills with `{ claimedLevel, yearsApplied, suggestedLevel, verifiedLevel }`. A VERIFIED record's `verifiedLevel` becomes a **capped provisional** competency baseline (see Skill Scoring). Distinct from `User.careerHistory`, which is internal movement only |
| `developmentPlans` | **The saved ITP.** One document per plan: `userId` · `title` · `status` DRAFT/ACTIVE/COMPLETED/ARCHIVED · `items[]` (each freezing `levelAtPlanning` / `gapAtPlanning` / `requiredLevel` beside `status`, `targetDate`, `completionNote`, `supervisorSignOff`, `signedOffBy`, **`levelAtSignOff`**) · `coverageAtPlanning`. Owner + management chain read/write ([`server/src/authz.ts`](server/src/authz.ts) `developmentPlansPolicy` + a **mandatory** `listScope` case). Migration [`006_development_plans.sql`](server/src/migrations/006_development_plans.sql). Deleted only while DRAFT — an agreed plan is archived |
| `appSettings` | Company-wide admin config, one row per key. Row `work-experience` holds the years→level band table + provisional cap. Read-open, admin-write |

### Org Hierarchy (OrgLevel enum)
`CEO` → `ACEO` → `GM` → `AGM` → `DM` → `SH` → `SP` → `JP` → `FR`

A job profile's `orgLevel` is **derived from the org-chart node's structural type** (`COMPANY` / `EXECUTIVE` / `SECTOR` / `GENERAL` / `ASSISTANT_GENERAL` / `DEPARTMENT` / `SECTION` / `POSITION`), never inferred from the position name or who it reports to. Mapping: `EXECUTIVE→CEO`, `SECTOR→ACEO`, `GENERAL→GM`, `ASSISTANT_GENERAL→AGM`, `DEPARTMENT→DM`, `SECTION→SH`, `COMPANY→null` (root wrapper), `POSITION→by title`. (The mapping constant is `DEPT_TYPE_TO_ORG_LEVEL` in `src/types.ts`.)

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

### Measured vs Unknown (`getUserCoverage` / `getGroupCoverage`)
A skill that was never assessed scores 0, which alone is indistinguishable from "measured and
failed". `CompetencyCoverage` (in `src/types.ts`) splits a requirement list into
`measured` (ASSESSMENT/EVIDENCE) + `provisional` (EXPERIENCE) + `unknown` (NONE), where
`known = measured + provisional`.

> **RULE — no percentage without its base.** Compliance/gap figures are computed over the
> **known** skills only, `compliancePct` is **`null`** when nothing is known (render "—", never
> 0%), and every place a gap or compliance % is shown must also show "X of Y measured". Use the
> shared components in [`src/components/CoverageIndicator.tsx`](src/components/CoverageIndicator.tsx)
> (`CompliancePercent` · `CoverageNote` · `CoverageMeter`) rather than re-deriving the split.

Applied in: EmployeeDashboard (readiness tile, requirement rows, IDP, career ladder), ManagerDashboard
(team banner, member cards, per-role meter), CEOPanel (header, KPIs, personnel table), CompetencyMatrix
(`UNKNOWN` cell state), AdminAnalytics (live measured avg gap), and the exported Statement of
Competence (`measured: false` prints "Not assessed", never a gap). `generateCareerPath` marks each
`PromotionRequirement.isMeasured`, counts gap points from measured skills only, and withholds
`READY_NOW` while any requirement is unmeasured.

### Effective Requirements (`getEffectiveRequirements`)
The single resolver for "what does this position require". Returns the profile's flat `requiredSkills` list (dropping any that reference deleted skills). All readers — scoring, gap, ITP, career, TNA, assessment queues, and the page components — go through it.

### Skill Gap
`gap = requiredLevel - currentScore`

Used to drive ITP generation and career path readiness calculations.

### Skill criticality — not every gap is worth the same money
`Skill.criticality` (`SAFETY_CRITICAL` · `HIGH` · `STANDARD` · `LOW`, in
[`src/types.ts`](src/types.ts) and mirrored in
[`server/src/domain/enums.ts`](server/src/domain/enums.ts)) is the business judgement the maths
cannot derive. It carries a **weight** (×3 / ×2 / ×1 / ×0.5) that **multiplies a gap wherever gaps
are ranked** — it never touches a score, a coverage figure or a compliance %.

- **Absent ⇒ `STANDARD` (×1)**, so every skill written before it existed ranks exactly as before.
  Use `skillCriticalityOf()` / `skillCriticalityWeight()`, never `skill.criticality` raw.
- Set on the **Competency Standard** form (SkillForm) and in the SKILL bulk-import sheet (a blank
  cell keeps the existing judgement — a re-imported old sheet must not reset the lot to STANDARD).
- Applied in **two** places, both worst-first by weighted gap: the TNA rows (below) and
  `generateIndividualTrainingPlan` (item priority = `gap × weight`; a safety-critical item also
  gets the shorter target date). Shown by the shared
  [`CriticalityBadge`](src/components/CriticalityBadge.tsx).
- **The coverage rule still wins**: a skill nobody has measured has no `priorityScore` at all
  (`null` ⇒ LOW). Criticality escalates a *measured* shortfall; it can never escalate silence.

### Career Path (`generateCareerPath`)
For each OrgLevel above the employee, finds the position profile at that level in the same general department and compares the employee's current scores vs. that profile's `requiredSkills`. Readiness buckets: `READY_NOW`, `READY_1_2_YEARS`, `READY_3_5_YEARS`, `DEVELOPMENT_NEEDED`.

### ITP (`generateIndividualTrainingPlan`) — the live PROPOSAL
Auto-generates training recommendations from skill gaps, linked to courses in `trainingCourses`.
It is recomputed on every render and **never stored** — it can say what *should* happen, never what
was agreed. Saving it is the development plan below.

### Development plan (`developmentPlans`) — the saved, tracked plan
The lifecycle is **propose → save → activate → track → sign off → re-measure**, all in
[`src/services/store.ts`](src/services/store.ts): `proposeDevelopmentPlanItems` (live gaps, nothing
written) → `createDevelopmentPlan` (DRAFT by default; a supervisor assigning one starts it ACTIVE
and notifies the employee) → `setDevelopmentPlanStatus` → `setDevelopmentPlanItemStatus` (completing
an item notifies the manager) → `signOffDevelopmentPlanItem` → `getDevelopmentPlanProgress`.
Supporting readers: `getCurrentDevelopmentPlan` · `getDevelopmentPlans` ·
`getPendingDevelopmentSignOffs` · `getUnplannedDevelopmentItems` / `addDevelopmentPlanItems` (gaps
that appeared after the plan was agreed) · `canSupervise`.

Three rules the feature must keep:

- **A never-assessed skill is never planned.** `proposeDevelopmentPlanItems` drops any requirement
  whose score source is `NONE` — that is an assessment need, not a training gap (same rule as the
  TNA engine). Unknowns are listed separately on the dashboard, outside the plan.
- **The level at planning is FROZEN on the item** (`levelAtPlanning` + `sourceAtPlanning`), and
  sign-off re-reads the score and stores it as `levelAtSignOff`. That stored pair — not a
  re-derivation — is how "did the training move the score" is answered. Re-opening a completed item
  clears its sign-off and `levelAtSignOff`, so a sign-off always refers to finished work.
- **`completedPct` is `null`, never 0, for a plan with nothing in play**, and cancelled items are
  excluded from the denominator (the coverage rule applied to plan progress).

UI: [`src/components/DevelopmentPlanPanel.tsx`](src/components/DevelopmentPlanPanel.tsx), rendered in
the EmployeeDashboard **IDP** tab (`/dashboard/idp`) for the employee and, via the new `viewer` prop
on `EmployeeDashboard`, with supervisor actions when a manager/CEO/admin is viewing the profile. The
manager queue is the **Development Sign-Off** tab of
[`src/pages/SupervisorApproval.tsx`](src/pages/SupervisorApproval.tsx) (`/manager` → Approvals).

### Training catalogue (`/admin/courses`)
The "cure" side: a gap names a skill, a course linked to that skill is what the ITP/TNA can
actually recommend (without one the ITP falls back to "intensive training required"). Store API:
`getAllTrainingCourses(includeArchived?)` · `getCoursesForSkill` (**both exclude archived**) ·
`addTrainingCourse` / `updateTrainingCourse` / `removeTrainingCourse` (archives) /
`restoreTrainingCourse` · `generateTrainingCourseCode`. Bulk Excel import is
`BulkUpload type="COURSE"`, which matches skills **by name or code** and reports any name it could
not match rather than silently dropping the link; a re-import of the same sheet updates in place
(matched on code, else title + provider). The page's headline figure is **skills with no course** —
a required skill nobody can be sent anywhere for is a hole in the plan, not a solved gap.

### TNA — now a SERVER aggregate (`GET /analytics/training-needs`)
Group-level training needs, one row per skill (`TrainingNeed` in `src/types.ts`), rendered by
[`src/pages/TrainingNeedsAnalysis.tsx`](src/pages/TrainingNeedsAnalysis.tsx) at `/training-needs`
(admin + CEO pick any unit or the whole company; a manager gets their own team and any unit they
manage). The engine lives in [`server/src/analytics/aggregate.ts`](server/src/analytics/aggregate.ts)
(`trainingNeeds`), reached through `dataService.getTrainingNeeds(scope, { includeSubUnits })`. The
page also gets the scope's `headcount`, `withRequirements`, pooled `coverage` and a
`budget` estimate; Excel export stays on the page. Four rules the engine must keep:

- **It rolls up.** A department scope covers every unit nested below it (`subtreeIds`; pass
  `includeSubUnits=false` for direct members only). Matching `departmentId` exactly returned nothing
  for a GM or general department, whose people all sit in sections underneath.
- **An unmeasured requirement is an assessment need, not a training gap.** Rows carry `measured` /
  `provisional` / `unknown` / `known` beside `gapCount` / `totalGap` / `averageGap`; `affectedPct`
  is **`null`** when nothing is known, and `priority` is derived from the share of *measured* people
  with a gap — silence can never produce HIGH. A skill with no gap and nothing unknown is dropped.
- **The scope is a permission boundary, not a filter.** `resolveScope` refuses a company-wide ask
  from anyone but ADMIN/CEO and a department the caller does not run; the endpoint returns real
  numbers about real people, so a hole there leaks the whole org chart.
- **Rows are ranked by WEIGHTED gap and costed at catalogue prices.** `weightedGap = totalGap ×
  criticality weight` is the sort key (how big the job is); `priorityScore` = share of the measured
  who fall short × depth (capped at a 2-level gap) × weight, banded 50 / 20 into HIGH / MEDIUM / LOW
  — set so a STANDARD skill with a full-depth gap reproduces the old share-of-measured rule exactly.
  `seatCost` is the **cheapest priced** linked course (unpriced ≠ free), `estimatedCost =
  seatCost × gapCount`, and the scope's `budget` (`TrainingBudgetEstimate`) always reports
  `skillsUncosted` / `seatsUncosted` beside the total — **no total without its base**, the money
  version of the coverage rule. Rows with only unknowns weigh 0 and sink to the bottom.

### Assessment Scheduling (`getNextAssessmentDate`)
Driven by each skill's inline `assessmentMethods`. For a user+skill it takes every method block whose `audience` matches the user (`isUserInAudience` / `getApplicableMethodsForUserSkill`), computes each block's next-due date from its `frequency`, and returns the **earliest** (most urgent) one. No applicable block ⇒ `null` ⇒ skill is treated as one-time and never becomes due again. Feeds `getEmployeeAssessmentQueue` and the OnlineAssessments / ManagerialInterviews / EvidencePortal due-date displays. `CERTIFICATE_BASED` blocks drive evidence expiry via `isSkillCertificateBasedForUser`. Resolution is legacy-safe: `getSkillAssessmentMethods` falls back to synthesizing blocks from deprecated linked instructions / per-skill fields until the one-time `migrateAssessmentConfigToSkills` runs (admin-triggered).

### The nightly sweep — the only thing that acts without being asked
Everything else in the system is *pull*: a number is computed when somebody opens
a page. The nightly job in [`server/src/jobs/`](server/src/jobs/) is the one *push*.
It runs **inside the api process** (a timer, not a crontab — nothing to forget on a
redeploy), at `JOBS_HOUR:JOBS_MINUTE` local server time (default 02:00), and:

1. re-bands every employee's certificates (`renewalStatus` VALID / EXPIRING_SOON /
   EXPIRED) and warns the owner at the 90 / 60 / 30-day and expired marks;
2. chases every assessment that is **due or overdue** against the employee's job
   profile (`nextAssessmentDate`, the server port of `getNextAssessmentDate`);
3. chases **overdue items on ACTIVE development plans**;
4. sends each manager **one weekly digest** of the three, never a copy of each alert;
5. writes this month's **competency snapshot** for the company and every populated
   department (see Stored history below).

Three rules the job must keep:

- **Every notification carries a `sourceKey` and is written only if that key is
  unused.** The key embeds its own period (`assess:<userId>:2026-08`,
  `cert:<userId>:<certId>:30`, `team:<managerId>:2026-W32`), which is what stops a
  job that runs *every night* from saying the same thing every night. An employee
  gets at most one assessment nudge and one plan nudge per month; a manager one
  digest per week.
- **The maths is a PURE port, not a second brain.** [`jobs/scheduling.ts`](server/src/jobs/scheduling.ts)
  mirrors the store's audience matching, frequency maths and certificate banding
  (including the `MANAGERS_ONLY` set, which follows `DataService.isManager` — *not*
  authz's `ORG_MANAGER_LEVELS`, which also counts SP), and
  [`jobs/scoring.ts`](server/src/jobs/scoring.ts) mirrors `computeSkillScore` +
  the coverage split. Change one side, change both.
- **It reads much and writes little**: notifications, plus `renewalStatus` on a
  user's own certificates. Certificate re-banding is a read-modify-write under
  `SELECT … FOR UPDATE` and preserves the field's wire shape (string vs array).

Only ACTIVE, non-archived people are chased. Every run is logged in **`job_runs`**
(migration [`007_job_runs.sql`](server/src/migrations/007_job_runs.sql)) — server-owned
operational data, deliberately **not** a `/col` collection. Admin-only
`GET /jobs/runs` (recent runs + config) and `POST /jobs/run` (run now, returns the
counters) make it visible. On boot the scheduler catches up if the last successful
run is older than `JOBS_CATCH_UP_AFTER_HOURS`, so a night lost to a reboot is not
skipped. `checkCertificationExpiries` has been **removed from the browser** — it
only ever covered whoever happened to log in.

### Stored history — monthly snapshots
Every other number in this system is recomputed live, so nothing could answer
"where were we in June?". The nightly sweep's last step writes one row per scope
per month into **`competency_snapshots`** (migration
[`008_competency_snapshots.sql`](server/src/migrations/008_competency_snapshots.sql)),
built by [`jobs/snapshots.ts`](server/src/jobs/snapshots.ts) on the scoring port
above — so a point on the trend chart and the live figure beside it are the same
measure. Like `job_runs` it is server-owned derived data, **not** a `/col`
collection; it is read through admin/CEO-only
`GET /analytics/snapshots[?scopeId=<deptId>&months=N]`
([`server/src/analytics/routes.ts`](server/src/analytics/routes.ts)) and, in the
frontend, `dataService.getCompetencySnapshots()` → [`src/pages/AdminAnalytics.tsx`](src/pages/AdminAnalytics.tsx).

Four rules:

- **One row per scope per month, refreshed in place** (`UNIQUE (period, scope_type,
  scope_id)`). The job runs nightly, so a month settles on its last reading and the
  current month is always live; re-running never appends a second point. The write
  is `UPDATE`-then-`INSERT`, not `ON CONFLICT` — pg-mem can't infer the target.
- **Departments roll UP** (a unit's row covers its whole subtree, walking each
  person's ancestor chain), matching `generateDepartmentalTNA`. Units with nobody
  in them get no row.
- **`compliance_pct` and `avg_gap` are NULLABLE and stay null end to end** when
  nothing is known — the "no percentage without its base" rule, all the way to the
  chart, which leaves a break in the line rather than plotting a drop to zero.
- **Nothing is back-filled.** History starts at the first snapshot; assessing
  someone today would otherwise make last June look better than it was. The page
  says so instead of drawing a fake past — this is what replaced AdminAnalytics'
  old browser-side replay of assessment records (which ignored evidence and
  work-experience scores and disagreed with every other screen).

### Where the maths runs (and why it is not all in the browser)
Everything used to be computed in the page: the CEO dashboard scored the whole company on every
render, and the TNA downloaded the entire company to answer a question about one section (finding 7
of the analytical-engine review). The org-wide aggregates now run on the server:

- [`server/src/analytics/model.ts`](server/src/analytics/model.ts) loads and indexes the documents
  ONCE (`loadAnalyticsModel`, plus a 15-second `getAnalyticsModel` cache so a polling SPA does not
  reload it every few seconds; the cache is off under `NODE_ENV=test`). The nightly snapshot uses the
  same loader, so a stored point and a live tile cannot come from differently-shaped inputs.
- [`server/src/analytics/aggregate.ts`](server/src/analytics/aggregate.ts) computes `trainingNeeds`
  and `orgOverview` on [`server/src/jobs/scoring.ts`](server/src/jobs/scoring.ts) — the one scoring
  port — and resolves/authorizes the scope (`resolveScope`).
- The browser keeps the SMALL-scope maths: `getUserCoverage` / `getGroupCoverage` for one person or
  one manager's team (EmployeeDashboard, ManagerDashboard), which are already in memory.

**The pages must never print a placeholder number while a server figure is in flight.** CEOPanel,
AdminAnalytics and the TNA page render "—" / "Measuring…" / a skeleton until the response lands: a
zeroed coverage tile reads as a finding, which is the exact lie the coverage rule exists to remove.

### Organization Analytics (`/admin/analytics`)
The executive read of the whole position, in [`src/pages/AdminAnalytics.tsx`](src/pages/AdminAnalytics.tsx):
a scope picker (whole company or any unit, **rolled up**), five KPI tiles (headcount + unprofiled ·
assessment coverage · compliance over measured · average gap · never assessed), a **skill hotspot**
table, a **department comparison** table, the stored monthly trend, and a five-sheet **Excel export**
(Summary · Skill hotspots · Departments · People · History). It computes nothing itself beyond a raw
assessment count — the figures are `GET /analytics/overview` (live) and `GET /analytics/snapshots`
(history).

- **Hotspots are ranked by the same `weightedGap` as the TNA**, so the two screens can never nominate
  a different worst skill. `orgOverview.topSkillGaps` therefore carries the full row
  (`OrgSkillGapRow`: employeesRequiring / measured / provisional / known / gapCount / averageGap /
  unknown / affectedPct / criticality / weight / weightedGap), top 15. Money stays on the TNA.
- **The department table sorts nulls LAST in every column.** A unit nobody has measured has no
  compliance and no average gap; sorting those as 0 would either crown it as fully compliant or
  condemn it as the worst gap in the company (pinned by `src/pages/__tests__/AdminAnalytics.test.ts`).
  A unit's row covers its whole subtree, so general departments repeat their sections' people — read
  a branch, not a sum.
- **People with no job profile are named, not hidden.** `withoutProfile` contributes no coverage, gap
  or compliance figure anywhere, so the page says how many of the headcount sit outside every number
  on it.

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
| `admin-courses` | `/admin/courses` | TrainingCatalogue | Admin |
| `training-needs` | `/training-needs` | TrainingNeedsAnalysis | Admin · CEO · Manager |
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
- `/auth/*` — public: `login`, `signup`; `/auth/me` is protected. There is **no self-service
  password reset** — the half-built `/auth/reset-password` (a token nothing could redeem, with no
  SMTP relay) was removed along with its table in migration
  [`009_drop_password_reset_tokens.sql`](server/src/migrations/009_drop_password_reset_tokens.sql).
  A forgotten password is reset by an admin (`/auth/admin/set-password`), which sets
  `must_reset` and forces a change at next login. Auth endpoints
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
- `/jobs` — **admin-only** view of the scheduled work: `GET /jobs/runs` (recent `job_runs` rows +
  whether the timer is enabled and at what hour) and `POST /jobs/run` (runs the nightly sweep now,
  `409` if one is already in flight). Not a `/col` collection — see The nightly sweep above.
- `/analytics/*` — the derived-numbers surface, none of it a `/col` collection
  ([`server/src/analytics/`](server/src/analytics/)):
  - `GET /analytics/snapshots` — **admin/CEO-only** read of the stored monthly snapshots
    (`?scopeId=<deptId>` for one unit rolled up, `?months=N`, oldest first). See Stored history above.
  - `GET /analytics/overview` — **admin/CEO-only** LIVE picture of a scope (`?scope=company|<deptId>`):
    pooled coverage, a department roll-up and one row per person. What CEOPanel and AdminAnalytics
    render.
  - `GET /analytics/training-needs` — the live TNA for a scope (`?scope=company|team|<deptId>`,
    `&includeSubUnits=false`). Also a manager's tool, so the **scope**, not the role, is the gate.

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
  old `firestore.rules` (owner/manager scoping, admin-write allowlist). On a `users` document the
  **privilege fields are admin-only** — `id`, `email`, `role`, `status`, `orgLevel`, `managerId`,
  `departmentId`, `jobProfileId`, `isArchived` (`PROTECTED_USER_FIELDS`): the owner and the person's
  managers may write everything else (name, avatar, certificates) but may not move anyone in the org
  chart, and a users document can only be deleted by an admin. "Their managers" means a real
  ancestor in the management chain (`isAncestorManager`), not merely somebody holding a
  manager-grade org level. The **bootstrap-admin grant keys off the address the session signed in
  with** (`auth_credentials`, carried as `AuthedUser.authEmail`), never the users document's
  user-writable `email` field.
- **A submission never carries its own verdict.** `evidences` and `workExperiences` are claims the
  employee makes and somebody else judges, and the judgement is what feeds a score — so a write by
  the **subject** of the record (create or update, any non-admin) must arrive/stay `PENDING` with
  the reviewer's fields unchanged: `assignedScore` / `reviewedAt` / `reviewedBy` / `reviewerComment`,
  plus no per-skill `verifiedLevel` on a work experience. Clearing them is fine (that is what
  re-submitting an edited record does); adding them is a 403. Only the person's **direct manager**
  (`isManagerOf`) or an admin writes the verdict, and never on their own record. Without this an
  employee could POST an already-`APPROVED`, self-scored evidence, or an already-`VERIFIED`
  experience, and award themselves a competency level over the API in one call.
- **An assessment's `type` is a claim about who scored whom, and the server re-derives it.** The
  score engine pays by type — a MANAGER score carries 60% of a 360 result against a SELF score's
  10%, and INTERVIEW / WRITTEN_EXAM are taken at face value as the latest score — so `type` is
  authorized, not accepted: `SELF` only on yourself; `MANAGER` / `INTERVIEW` / `PRACTICAL_DEMO` /
  `WRITTEN_EXAM` / `WORK_RECORD_REVIEW` only on somebody you **supervise**; `UPWARD` only on
  somebody who supervises **you**; `PEER` on anyone but yourself. Supervision here is `supervises()`
  in [`server/src/authz.ts`](server/src/authz.ts) — the explicit `managerId` chain **or** ownership
  of the department/section the person sits in, mirroring `DataService.getSubordinates`, which is
  why `PolicyCtx` now also carries `getDepartmentDoc`. Admins are exempt (imported exam scores have
  no rater relationship to prove). Without this an employee could POST `subjectId = raterId = self`
  with `type: 'MANAGER'` and hand themselves the heavyweight score.
- **A notification written from a browser must name its sender.** Create used to require only a
  recipient id, so any employee could drop a message into anybody's bell in the system's own voice.
  Restricting the *recipient* would not fix that and would break the app (an employee's re-submission
  notifies their manager, a reviewer notifies the employee, a 360 rater notifies a peer, a nomination
  notifies any colleague), so the rule is **attribution**: a non-admin create must carry
  `createdBy` = the caller, and `sourceKey` stays the nightly sweep's alone. `DataService.addNotification`
  stamps `createdBy` from the live session; the sweep writes straight to SQL with none, and
  [`NotificationBell`](src/components/NotificationBell.tsx) shows "From <name>" or "System" on every
  row — so nothing a colleague wrote can pass itself off as the system.
- **An uploaded file is decided by its BYTES, on both sides.** ECMS has no object storage: a
  certificate scan, an evidence file, an exam sheet and an avatar are all base64 `data:` URLs
  stored inside the document, so `accept=".pdf,image/*"` is a picker hint and nothing more. The
  browser half is [`src/utils/fileUpload.ts`](src/utils/fileUpload.ts) — a size cap enforced before
  the read, a **magic-byte** allowlist (PNG · JPG · WebP · GIF · PDF), a data URL rebuilt with the
  DETECTED type, and `safeFileName` for the display name. The server half is independent, in
  [`server/src/collections/schemas.ts`](server/src/collections/schemas.ts): `users.avatarUrl`,
  `evidences.fileUrl` and every `fileUrl` inside the stringified `users.certificates` must be
  empty, an https link, or a data URL of an allowlisted type under ~4.5 MB — so `javascript:` and
  `data:text/html` can never be stored, whatever the browser did. **SVG is not an attachment type**
  (it can carry script); it is allowed for an avatar only because the generated initials avatar is
  one, and an avatar is only ever rendered in an `<img>`. Bulk import caps the workbook at 10 MB and
  5,000 rows, and **every exported Excel cell** goes through `safeExportCell` — a value starting
  `= + - @` is a formula on the recipient's machine.
- `BOOTSTRAP_ADMIN_EMAIL` is treated as ADMIN before any user holds the `ADMIN` role
  (first-run / recovery only); normal admin access is role-driven (`users` doc `role == 'ADMIN'`).

### Data migration notes (from the Firebase era)
- All collections were exported and loaded into Postgres with original document IDs preserved
  (ETL: [`server/scripts/etl/`](server/scripts/etl/)).
- Firebase Auth accounts are **not** migratable — users must sign up again with the same email;
  the new account is linked to the existing profile by email on first sign-up.
- User avatars are base64 data URLs stored directly in the `users` document (no object storage).
- Live-data cutover is the migration's own **Phase 6** — see [`docs/migration/`](docs/migration/).
