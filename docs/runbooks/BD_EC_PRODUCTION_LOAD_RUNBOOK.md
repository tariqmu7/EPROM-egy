# Runbook — loading Business Development & External Contracts into ECMS

**What this is.** The end-to-end procedure that filled an ECMS database with the real
BD / External-Contracts department — 123 competencies, 16 job profiles, 10 employee
accounts, 86 training courses — plus the **demo** history, development plans and monthly
snapshots that let the system be shown as if it had been live since June 2026.

It was executed against the laptop's local Postgres on 2026-08-21. Run the same
sequence, in the same order, to reproduce it on an EPROM server.

> **Read this first — a large part of the loaded content is DEMO data.**
> The competency catalogue, job profiles and people are real (from the reviewed BD/EC
> workbook and `Employees Info.xlsx`). The **training courses, all assessment history,
> all evidences, all development plans and the June/July snapshots are fabricated** for
> the trial. Every one of those rows says so in its own text. Section 6 says how to
> remove them. Nobody has been evaluated and nothing has been agreed.

---

## 1. Prerequisites

| Need | Detail |
|---|---|
| Database | A running ECMS Postgres with migrations applied. Locally that is the embedded cluster started by `server/scripts/serve-local.ts` (or `run.bat`) on `127.0.0.1:5433`, db `eprom_cms`. |
| Connection | The loaders read the same env vars as the API (`PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` from `server/.env`). |
| Node | Node 20+, dependencies installed in `server/` (`npm install`). `.mts` scripts run under `npx tsx`. |
| Python | Python 3.11+ with `openpyxl`, for the extract steps only. |
| Source pack | `BD and IC Job Profile/1_Final_Deliverables/` — the reviewed competency workbook, `ECMS_Upload_2_JOB.xlsx`, and `Employees Info.xlsx` (sheet `Final`). |
| Org chart | The 129 EPROM departments must already be loaded; the loaders refuse on an unknown `departmentId`. |

All scripts live in `server/scripts/etl/bd-ec/`; their JSON output lands in
`server/scripts/etl/data/bd-ec/`. Run them from the `server/` directory.

**The pattern, and why it matters:** every step is a *Python extract that validates and
refuses on any problem*, followed by a *Node loader that upserts idempotently under stable
ids*. Nothing is hand-written into the database, and re-running a step updates in place
rather than duplicating. Each loader takes `--dry-run`; use it first, every time.

---

## 2. Load order

Steps 1–5 are the real data. Steps 6–8 are the demo layer and are optional.

### Step 1 — Competency catalogue (123 skills)

```bash
python scripts/etl/bd-ec/extract_skills.py          # -> data/bd-ec/skills.json
node   scripts/etl/bd-ec/load-skills.mjs --dry-run
node   scripts/etl/bd-ec/load-skills.mjs
```

Skill ids come from the workbook's `Code` column (`BD-T-01` becomes `sk-bd-t-01`). ECMS
matches skills **by name**, so the loader refuses if a live skill already holds a catalogue
name under a different id. On the laptop run, the 20 pre-existing seed skills were
**archived, not deleted** (`--archive-placeholders`), because deleting a skill orphans
anything that ever referenced it.

### Step 2 — Job profiles, FR to SH (12 profiles)

```bash
python scripts/etl/bd-ec/extract_jobs.py            # -> data/bd-ec/jobProfiles.json
node   scripts/etl/bd-ec/load-jobs.mjs --dry-run
node   scripts/etl/bd-ec/load-jobs.mjs
```

BD ladder x4 and EC ladder x4, plus the EC ladder duplicated onto the project
follow-up section (ids `jp-ec-*-fu`, codes `EC-*-FU`) because the org chart has two
sections under `d-bizdev-ext` sharing one catalogue. **The two EC copies must be kept
identical — change one, change the other.**

The loader refuses on an unknown department or a skill id that is not live.
`requiredSkills` is stored as a JSON **string**, which is what the app's own save writes.

### Step 3 — Leadership profiles (GM / AGM x2 / DM)

```bash
python scripts/etl/bd-ec/derive_leadership.py       # -> data/bd-ec/jobProfilesLeadership.json
node   scripts/etl/bd-ec/load-jobs.mjs data/bd-ec/jobProfilesLeadership.json
```

Derived from the Section Head sets, not from a workbook: **the required levels are a
drafted judgement and still need EPROM's review.** The rule used is that breadth grows
with span of control (DM/AGM inherit their sections' ladder, the GM the union of both),
Management / Behavioral / Soft Skills / Safety are pinned at 5 from DM up, and Technical
is `max(SH, 4)` for DM/AGM but clamped to 3–4 for the GM, so the GM does not carry 123
permanent Expert gaps.

Units are chosen by **structural type** (`GENERAL` to GM, `ASSISTANT_GENERAL` to AGM,
`DEPARTMENT` to DM), never by the position's name. That is why `BD-DM` hangs on
`dept-bizdev-mkt-programs` and not on `d-bizdev-mkt`, which is an ASSISTANT_GENERAL unit.

Known caveat: `BD-DM` is titled "Marketing Programs" but is built on the Business
Development ladder, because the workbook has no Marketing Programs catalogue.

### Step 4 — Employee accounts (10 users)

```bash
python scripts/etl/bd-ec/extract_users.py           # -> data/bd-ec/users.json
node   scripts/etl/bd-ec/load-users.mjs --dry-run
node   scripts/etl/bd-ec/load-users.mjs --password '<temp password>'
```

Ids are `u-<employeeId>`; the one pre-existing account keeps its original id. Emails are
`firstname.lastname@eprom.com` from the transliterated Latin name; the Arabic name is kept
beside it in a non-app field (`arabicName`, with `sourceTitle`) for traceability.

Everyone is created ACTIVE, role `EMPLOYEE`, and **must change the password on first
login** — verified end to end: `POST /auth/login` returns `mustReset: true` and the app's
forced-change screen gates the session. Managers are recognised by subordinates
(`DataService.isManager` via `managerId`), not by role, so no one needs a manager role.

The loader **never overwrites an account that already has a password** unless
`--reset-existing` is passed — that is what protects an existing admin login. It also
refuses on an unknown department / profile / manager, on an `orgLevel` that disagrees with
the assigned profile, and on an email already held by another user id.

Nobody holds a `CEO` role, so the CEO dashboard is reachable only from the admin account.
No avatars were loaded — the source pack has no photos, and an empty avatar beats a fake one.

### Step 5 — Training catalogue (86 courses)

```bash
python scripts/etl/bd-ec/draft_courses.py           # -> data/bd-ec/trainingCourses.json
node   scripts/etl/bd-ec/load-courses.mjs --dry-run
node   scripts/etl/bd-ec/load-courses.mjs
```

> **These courses are drafted, not EPROM's catalogue.** The source pack contains no course
> list. Titles, providers, durations and prices are plausible Egypt-2026 values and **are
> not quotations**; every row repeats that warning in its `description`. Replace them with
> the real catalogue — through this same loader or the app's `BulkUpload type="COURSE"` —
> **before anyone is enrolled or a budget figure leaves the building.**

All 123 live skills are covered, so the page's "skills with no course" headline reads 0.
81 of 86 rows are priced; the 5 OJT rows are deliberately unpriced, because OJT is not a
seat you can buy and a made-up number would flow straight into the TNA budget total. That
is what keeps the TNA's `seatsUncosted` / `skillsUncosted` base honest.

`linkedSkillIds` is written as a real JSON array — `preparePayload` has no stringify rule
for `trainingCourses`. The loader re-validates every link against the database and prints
the uncovered-skill count after loading.

### Step 6 — DEMO assessment history (optional)

```bash
node scripts/etl/bd-ec/dump_placement.mjs           # DB -> data/bd-ec/livePlacement.json
python scripts/etl/bd-ec/generate_history.py        # -> assessments.json + evidences.json
node scripts/etl/bd-ec/load-history.mjs --dry-run
node scripts/etl/bd-ec/load-history.mjs
```

726 assessments and 155 evidences in three waves (2026-06-16 / 07-15 / 08-12).

**Always re-run `dump_placement.mjs` first.** Generation reads the live placement from the
database, never `users.json`, because the two have drifted before (see Findings).

Records are written only in the shape the skill's own primary method can actually be scored
from: direct methods (latest wins, the earlier record lower), APPROVED evidence carrying an
`assignedScore`, or a SELF/PEER/MANAGER trio for `OJT_OBSERVATION`. About 20% of each
person's requirements is left with **no** record on purpose, so the measured/unknown split
stays honest; 6 evidences are left PENDING to give the two supervisors a real approval queue.

Evidence `fileUrl` is a small `data:text/plain` file stating that it is a demo — an empty
string renders a dead Download link.

### Step 7 — DEMO development plans (optional)

```bash
npx tsx scripts/etl/bd-ec/dump_gaps.mts             # DB -> data/bd-ec/liveGaps.json
python  scripts/etl/bd-ec/generate_plans.py         # -> data/bd-ec/developmentPlans.json
node    scripts/etl/bd-ec/load-plans.mjs --dry-run
node    scripts/etl/bd-ec/load-plans.mjs
```

7 plans / 41 items (4 ACTIVE, 1 COMPLETED, 2 DRAFT), including 4 completed-but-unsigned
items so the manager's Development Sign-Off queue has work, 4 in-flight items past their
target date so the nightly sweep has something to chase, and 1 CANCELLED item to exercise
the `completedPct` denominator.

**The before/after is real, not decorative.** `dump_gaps.mts` scores every requirement
three times — at planning (2026-07-05), at sign-off (2026-08-18) and today — by filtering
the scoring inputs by date (assessments by `date`, approved evidence by `reviewedAt`) and
calling the server's own scoring port. `levelAtPlanning` comes from the first and
`levelAtSignOff` from the second; taking both from today's score would produce a plan that
provably achieved nothing.

The app's own rules are reproduced so a loaded plan is indistinguishable from a saved one:
a requirement whose score source is `NONE` is never planned, priority is
`gap x criticality weight`, target date is planning + 3 months for a safety-critical or
1-level gap and + 6 otherwise, and `items` is a real array (no stringify rule).

One deliberate difference: the live ITP picks `getCoursesForSkill()[0]` (load order), but a
frozen plan item must be reproducible, so the dump picks the **cheapest priced** linked
course, ties broken by id.

No notifications are written — a back-dated alert nobody clicked is noise.

### Step 8 — DEMO monthly snapshots (optional)

```bash
npx tsx scripts/etl/bd-ec/backfill-snapshots.mts --dry-run
npx tsx scripts/etl/bd-ec/backfill-snapshots.mts        # June + July only
```

Then take the current month live, exactly as the nightly job would:

```bash
curl -X POST -H "authorization: Bearer <admin JWT>" http://<api>/jobs/run
```

The back-fill does **not** duplicate the snapshot maths. `runMonthlySnapshot` in
`server/src/jobs/snapshots.ts` gained two optional options — `index` (a `ScoringIndex` to
use instead of the live one) and `detailExtra` (merged into each row's `detail`) — so only
the *inputs* move back in time. The script builds an as-of index per month end using the
same date-filtering technique as `dump_gaps.mts`, then calls the real job with `now` set to
that month end. June therefore knows nothing of the July wave.

Back-filled rows carry `detail.demo = true`, `detail.backfilled = true` and a note; the
current-month row, taken live, carries neither. `--purge` deletes exactly the back-filled
rows and leaves live ones alone.

**Honest limit, stated inside every back-filled row:** the roster, job profiles and
requirements are *today's* — nothing in the data records what a profile said in June — so
only the scores are historical.

---

## 3. Verification

Run all of this after a load. It is what was run on 2026-08-21.

```bash
cd server
npm run integrity      # expect: no dangling references across 19 relationships
npm test               # expect: 105 passed
```

Then, with an admin JWT, check the four derived surfaces (the figures below are the
laptop's, for comparison):

```bash
curl -H "authorization: Bearer $T" "$API/analytics/overview?scope=company"
curl -H "authorization: Bearer $T" "$API/analytics/training-needs?scope=company"
curl -H "authorization: Bearer $T" "$API/analytics/snapshots?months=6"
curl -H "authorization: Bearer $T" "$API/analytics/snapshots?scopeId=d-bizdev-ext&months=6"
```

| Check | Expected on the laptop load |
|---|---|
| Row counts | departments 129 · skills 123 live + 20 archived · jobProfiles 16 · users 11 · trainingCourses 86 · assessments 726 · evidences 149 APPROVED + 6 PENDING · developmentPlans 7 · competency_snapshots 45 |
| Company overview | headcount 11, withoutProfile 2, 522/693 measured (75%), compliance 55%, avg gap 0.55 |
| Trend | 2026-06 compliance 5% · 2026-07 7% · 2026-08 55%, and the August row **equals** the live overview figure |
| TNA (company) | 117 rows, budget 1,770,300 EGP with 8 skills / 21 seats uncosted |
| TNA (`d-bizdev-ext`) | headcount 4, 71 rows, 705,200 EGP |
| Snapshot scoping | 45 rows = 15 scopes x 3 months; a department scope returns its own three points, June/July marked `demo` |
| Coverage rule | People with no job profile show `compliancePct: null` and `avgGap: null` — **never 0** |
| Hotspots | Top skills ranked by `weightedGap`; the safety-critical rows lead |

Screen walk (log in as each and confirm the page renders real numbers, not placeholders):

| Screen | Sign in as | What must be true |
|---|---|---|
| EmployeeDashboard `/dashboard` | any of the 10 | Readiness tile shows "X of Y measured"; IDP tab shows that person's plan only |
| ManagerDashboard `/manager` | `ali.ahmed@eprom.com` (4 subordinates) | Team banner + member cards; the Approvals tab holds the 6 PENDING evidences and the unsigned plan items |
| CEOPanel `/ceo` | admin | Company header and personnel table match `/analytics/overview` |
| AdminAnalytics `/admin/analytics` | admin | 5 KPI tiles, hotspots, department table (nulls sorted last), the 3-point trend |
| TrainingNeedsAnalysis `/training-needs` | admin, then a manager | Scope picker; a manager may only reach their own unit |

---

## 4. Placement of the 10 employees (as loaded)

| User id | Name | Level | Profile | Unit | Manager |
|---|---|---|---|---|---|
| `u-560` | Nevine Anwar | GM | `jp-bd-gm` | `g-bizdev` | — |
| `u-1347` | Ali Ahmed | AGM | `jp-bd-agm` | `d-bizdev-mkt` | — |
| `u-1832` | Hisham Abaza | AGM | `jp-ec-agm` | `d-supply-contr` | — (outside BD/EC) |
| `u-1844` | Noha Bahgat | DM | `jp-bd-dm` | `dept-bizdev-mkt-programs` | `u-560` |
| *(existing)* | Tarek Salama | SP | `jp-bd-sp` | `sect-bizdev-mkt-bd` | `u-560` |
| `u-3397` | Mohamed El-Demerdash | SP | **none** | `d-supply-contr` | — |
| `u-3448` | Randa Gadallah | JP | `jp-ec-jp` | `sect-bizdev-ext-contracts` | `u-1347` |
| `u-3910` | Dina Maghazi | FR | `jp-ec-fr` | `sect-bizdev-ext-contracts` | `u-1347` |
| `u-3851` | Mennatallah Soliman | FR | `jp-ec-fr-fu` | `sect-bizdev-ext-followup` | `u-1347` |
| `u-3852` | Abdelrahman Abdelrahim | FR | `jp-ec-fr-fu` | `sect-bizdev-ext-followup` | `u-1347` |

The `jp-*-sh` Section Head profiles are currently unstaffed — the workbook has no section heads.
Placement drifts as the app is used; `dump_placement.mjs` prints what is actually in the database.

---

## 5. Open findings (verified still open on 2026-08-21)

1. **`u-3397` holds no job profile.** They therefore have no requirements, no plan, and
   contribute to no coverage figure — the overview shows `required: 0` and
   `compliancePct: null` for them. Assign a profile (they are a *lawyer* in External
   Contracts, and the EC ladder is written for engineers) or accept that they sit outside
   every number.
2. **`THREE_SIXTY_EVALUATION` skills are never scored.** `computeSkillScore` reaches the
   360° blend only when the primary method is exactly `OJT_OBSERVATION`; the 9 skills
   configured as `THREE_SIXTY_EVALUATION` land in the direct branch, where SELF/PEER/MANAGER
   records are ignored. This looks like a genuine `store.ts` bug, and it leaves roughly 6–9
   requirements per person permanently unmeasured. Not a data problem — do not paper over it
   in the loaders.
3. **Nothing ever falls due.** All 123 skills carry a single assessment method with
   `frequency: ONE_TIME`, `audience: ALL` (verified in the database), so
   `getNextAssessmentDate` always returns null: the employee assessment queue stays empty and
   the nightly sweep has nothing to chase. Real re-assessment frequencies need to be decided
   and set on the Competency Standard form, or in a follow-up load.
4. **Duplicate ACTIVE development plans exist for one user.** Besides the seven loaded
   `dp-*` plans, the database holds two app-created plans for `9bry6ro95`
   (`CB95gCHWdYCkhZc4fCab` and `epyseVt1dh8hM7Z7giX5`), 24 items each, created two seconds
   apart on 2026-08-21 — a double-submit of the save action. Nothing stops a user holding
   several ACTIVE plans at once, and `getCurrentDevelopmentPlan` then picks one of them
   arbitrarily. Delete the duplicate, and consider blocking a second ACTIVE plan (or
   debouncing the save) in the app.
5. **The database placement can drift from `users.json`.** It has happened once already, so
   every regeneration step reads the live database (`dump_placement.mjs`, `dump_gaps.mts`),
   never the extract. Keep it that way.

---

## 6. Removing the demo layer before real use

Run these, in this order, before the first real appraisal cycle:

```bash
cd server
node    scripts/etl/bd-ec/load-plans.mjs   --purge          # deletes every dp-* plan
node    scripts/etl/bd-ec/load-history.mjs --purge          # deletes every asm-* / ev-* row
npx tsx scripts/etl/bd-ec/backfill-snapshots.mts --purge    # deletes back-filled rows only
```

Then replace the drafted training catalogue with EPROM's real one, and re-check
`npm run integrity`.

What the purges **do not** touch, by design: the skills, the job profiles, the user
accounts, and any snapshot row that was taken live.

Every demo row is also findable by its own text — assessments, evidences and plans each
carry `"DEMO DATA - generated for the system trial, ..."` in a comment / notes /
sign-off field, and back-filled snapshots carry `detail.demo = true`.
