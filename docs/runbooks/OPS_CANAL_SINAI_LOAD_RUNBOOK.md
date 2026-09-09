# Runbook — loading Operations (Canal Cities & Sinai) into ECMS

**What this is.** The end-to-end procedure that added the fourth department to an ECMS
database: the **strategic-tank Operations** organisation under the General Manager of
Operations, Canal Cities & Sinai — **15 new org units + 1 rename**, **105 new
competencies**, **8 job profiles** (Fresh → GM, including two shift roles) and, in a
second phase, **70 people** placed against those profiles.

Executed against the laptop's local Postgres on **2026-09-08** (the structure) and
**2026-09-09** (the people). Run the same sequence, in the same order, to reproduce it on
an EPROM server.

> **The 70 people are INVENTED test data.** EPROM supplied no Operations roster, so
> step 4 loads a fictional one — Egyptian names against employee numbers **90001–90070**
> (ids `u-90001`…`u-90070`, each document flagged `isTestData: true`), a block nothing
> real uses, so one query removes every one of them (see §5). **Do not run step 4 on a
> production database** unless a real roster has replaced the workbook. Steps 1–3 — the
> units, the competencies and the profiles — are real and production-ready.
>
> **Nobody is measured.** This load writes no assessments, evidences, courses, plans or
> snapshots. Placing people buys headcount, requirements and an org chart; it buys no
> score, so every Operations gap, compliance and TNA figure still reads "—" until
> assessments exist. That is the coverage rule working, not a fault.

---

## 1. Prerequisites

| Need | Detail |
|---|---|
| Database | A running ECMS Postgres with migrations applied. Locally that is the embedded cluster started by `server/scripts/serve-local.ts` (or `run.bat`) on `127.0.0.1:5433`, db `eprom_cms`. |
| Connection | The loaders read the same env vars as the API (`PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` from `server/.env`). |
| Node | Node 20+, `npm install` done in `server/`. |
| Python | Python 3.11+ with `openpyxl`, for the extract steps only. |
| Source pack | `BD\ECMS\Job Profiles\1_Final_Deliverables\ECMS_Import\` — `ops_departments.json`, `ECMS_Upload_1_SKILL.xlsx` (272 rows), `ECMS_Upload_2_JOB.xlsx` (2,501 rows). Rebuild them with `_working\generate_ops_departments.py` and `_working\generate_ecms_import.py`. |
| Roster (step 4 only) | `BD\ECMS\Job Profiles\1_Final_Deliverables\Operations_Canal_Sinai\Operations_Roster_TEST_DATA.xlsx` — 70 invented people. Rebuild it with `_working\generate_ops_roster.py`; **never edit the workbook by hand**. |
| Prior load (step 4) | `data/bd-ec/users.json` must be present — the people loader reads it to put strays back where they belong (see step 4). |
| Org chart | The 129 EPROM departments must already be loaded — including `g-canal` and `d-canal-ops`, which **already exist**. The loaders refuse on an unknown parent. |
| Prior load | BD / External Contracts must be loaded first (this load reuses 21 of their skills by name). |

Scripts live in `server/scripts/etl/ops/`; their JSON output lands in
`server/scripts/etl/data/ops/` (git-ignored — regenerate it with the extract step, never
hand-edit it). Run everything from the `server/` directory.

**The pattern:** each step is a *Python extract that validates and refuses on any problem*,
followed by a *Node loader that upserts idempotently under stable ids*. Every loader takes
`--dry-run`; use it first, every time.

---

## 2. Load order

The order is not optional. Units before skills before profiles before people — each step
refuses to load against something the step before it has not created yet.

### Step 1 — Org units (15 new + 1 rename)

```bash
python scripts/etl/ops/extract_departments.py     # -> data/ops/departments.json (16 docs)
node   scripts/etl/ops/load-departments.mjs --dry-run
node   scripts/etl/ops/load-departments.mjs
```

Expect **15 created, 1 renamed, 144 departments total**.

**The rename is the whole reason this step exists as a script.** `d-canal-ops` was live
under the bare name **"Operations"** — and so are `d-west-ops` and `d-south-ops`. Every
ECMS importer matches a department **by name and takes the first match**, so it was renamed
to **"Operations - Canal Cities & Sinai"** before anything was attached to it. The id is
unchanged, so nobody and nothing moved. The **bulk (Excel) importer cannot do this** — an
unmatched name creates a *new* unit — which is why the rename goes through the ETL loader.

The 15 new units are 3 site departments (`dept-canal-ops-suez` / `-ismpsd` / `-sinai`) and
4 sections under each (`…-farm` / `-transfer` / `-quality` / `-planning`).

### Step 2 — Competencies (105 new)

```bash
python scripts/etl/ops/extract_skills.py          # -> data/ops/skills.json (117)
node   scripts/etl/ops/load-skills.mjs --dry-run
node   scripts/etl/ops/load-skills.mjs
```

Expect **105 created, 12 left untouched, 228 live skills**.

- The workbook is the **whole company dictionary** (272 skills, four departments). The
  extract filters it down to the **117** the eight Operations profiles actually require —
  loading the sheet whole would quietly import Marketing as a side effect.
- 96 are new `sk-op-*`. The other 21 merge **by name** onto entries BD/EC/Marketing already
  own and keep their existing `sk-bd-*` ids.
- **105, not 96.** Nine of the 21 "shared" skills (the above-DM leadership set —
  `sk-bd-b-11` / `-b-12` / `-m-14`…`-m-17` / `-f-12` / `-t-23` / `-t-24`) were in the newer
  BD catalogue but had **never been loaded**; the database's 123 came from an older BD
  workbook. They were created under their **BD ids**, so BD / EC / Marketing inherit them
  when those loads are next refreshed.
- **The loader does not overwrite an existing skill.** This load *adds a department*; it
  must not rewrite skills another department is already being measured against. Pass
  `--update-existing` only when that is genuinely what you mean. It also refuses if a
  shared skill is archived in the database.

### Step 3 — Job profiles (8)

```bash
python scripts/etl/ops/extract_jobs.py            # -> data/ops/jobProfiles.json (8, 844 rows)
node   scripts/etl/ops/load-jobs.mjs --dry-run
node   scripts/etl/ops/load-jobs.mjs
```

Expect **8 created, 24 job profiles total**.

| Id | Code | Level | Title | Skills |
|---|---|---|---|---|
| `jp-op-fr` | OP-FR | FR | Operations Engineer – Fresh | 91 |
| `jp-op-jp` | OP-JP | JP | Shift Operations Engineer | 98 |
| `jp-op-sps` | OP-SPS | SP | Shift Supervisor – Operations | 106 |
| `jp-op-spe` | OP-SPE | SP | Senior Operations Engineer – Technical Support | 108 |
| `jp-op-sh` | OP-SH | SH | Operations Section Head | 108 |
| `jp-op-dm` | OP-DM | DM | Operations Department Manager | 117 |
| `jp-op-agm` | OP-AGM | AGM | Assistant General Manager – Operations | 116 |
| `jp-op-gm` | OP-GM | GM | General Manager – Operations, Canal Cities & Sinai | 100 |

- **Two profiles share org level SP and that is correct.** ECMS keys a profile on
  **Title + Department**, not on level, so the shift and the technical ladder coexist.
- `requiredSkills` is written as a JSON **string** — the same wire shape the app's own Job
  Profile form saves, so a loaded profile is byte-comparable to a hand-saved one.
- **The loaders put all eight on `d-canal-ops`** (the eight are shared by all three sites;
  the section a person sits in is recorded on the *person*). Placement is a business
  decision and can be changed in the app afterwards — see section 4.

### Step 4 — People (70 invented)

> Phase 2, run on **2026-09-09**. Test data — read the warning at the top before running
> this against anything but a laptop or a demo database.

```bash
python scripts/etl/ops/extract_users.py           # -> data/ops/users.json (70 + 16 manager refs)
node   scripts/etl/ops/load-users.mjs --dry-run
node   scripts/etl/ops/load-users.mjs
```

Expect **70 created, 0 updated, 16 unit → manager references set, 70 credentials issued**.

By rung: 1 AGM · 3 Department Managers · 12 Section Heads · 20 SP (9 Senior Operations
Engineers + 11 Shift Supervisors — the same rung) · 20 Shift Operations Engineers ·
14 Fresh. By site: Suez **26** · Ismailia & Port Said **24** · Sinai **19** · the AGM
across all three. The database ends with **81 users** (11 real + 70 invented).

- **The extract is the refusal step, not the judgement step.** Unlike the BD/EC loader,
  no `PLACEMENT` dict is buried in the script: `generate_ops_roster.py` already decided
  every unit, rung, profile and reporting line **in the workbook, in the open**.
  `extract_users.py` only checks the workbook against the live org chart and refuses on a
  dead unit id, a unit name the sheet disagrees with, a rung sitting in the wrong node
  **type** (`ASSISTANT_GENERAL`→AGM, `DEPARTMENT`→DM, `SECTION`→SH/SP/JP/FR), a
  `jobProfileId` outside the eight or whose `orgLevel` disagrees, a duplicate email / name
  / employee number, an email already owned by a real account, an employee number outside
  the **90001–90099** block, or a manager who is missing, junior, looping, or a second
  root. Every one of those checks was proved to fire by tampering with a row.
- **Passwords.** All 70 get the same temporary password (`Eprom@2026` by default,
  `--password '<temp>'` to change it) with `must_reset = true`, so the forced-change screen
  gates any first login. An account that **already has a password is left alone** —
  `--reset-existing` overrides — so a re-run can never lock a real person out.
- **16 unit → manager references** (the AGM on `d-canal-ops`, the 3 site DMs, the 12
  Section Heads). That is what gives a manager a team in the app; without it the manager
  dashboard is empty even though the people are there.
- **Step 4 of the loader restores strays.** Anybody sitting in an Operations unit who is
  not on the roster is put back where `data/bd-ec/users.json` says they belong
  (departmentId · generalDepartmentId · orgLevel · jobProfileId · managerId). Three real
  BD / External-Contracts people had been moved into the Sinai tank farm by hand while the
  profile placement was being settled, and their org level no longer matched the profile
  they had been given, so the employee form refused to save them. `--no-restore` skips it;
  a stray with **no** canonical record makes the loader refuse rather than guess.
- **The GM seat is deliberately empty.** `jp-op-gm` has no holder: that rung is the sector
  General Manager of `g-canal`, who also runs Maintenance, HSE & Quality, Inspection and
  the Laboratories. Inventing a person there would claim the whole sector.
- `data/ops/users.json` is generated and git-ignored, like every other extract output.
  Only the scripts are committed.

---

### Step 5 — Two years of demo history (and the demo password)

> Phase 3, run on **2026-09-09**. Invented scores for invented people. Read the warning at
> the top before running this against anything but a laptop or a demo database.

```bash
node   scripts/etl/ops/dump_placement.mjs        # -> data/ops/livePlacement.json
python scripts/etl/ops/generate_history.py       # -> data/ops/assessments.json + evidences.json
node   scripts/etl/ops/load-history.mjs --dry-run
node   scripts/etl/ops/load-history.mjs
node   scripts/etl/ops/set-demo-passwords.mjs    # one shared password for the 90001+ block
```

Expect **6,077 assessments and 992 evidence records created**, and the department to read
**61% measured · 55% compliant over what is known · average gap 0.59**.

- **Five half-yearly campaigns** — Nov 2024 · May 2025 · Nov 2025 · May 2026 · Aug 2026 —
  so the History tab, the trend and the "last assessed" dates all have a past to show.
- **A record is written only in the shape the skill can be scored from.** Exam / interview /
  practical-demo skills get a direct record of that type (latest wins, so the history rises);
  work-record skills get APPROVED evidence with an `assignedScore` (highest wins);
  `OJT_OBSERVATION` skills get a SELF / PEER / MANAGER trio. The six
  `THREE_SIXTY_EVALUATION` skills get **nothing** — `computeSkillScore` reaches the 360
  blend only when the primary method is exactly `OJT_OBSERVATION`, so rows there would look
  assessed and score nothing. They are reported as 360-blocked and left unmeasured.
- **The holes are deliberate.** About a third of each person's requirements (more for a
  recent arrival) has never been looked at, so "X of Y measured" keeps meaning something
  and compliance is a percentage of a real base.
- **Nobody is assessed before they arrived.** Each person gets a joining campaign from their
  rung — Section Heads and above from Nov 2024, Fresh engineers from late 2025/2026 — and
  no record predates it.
- **The row budget is a real constraint.** The SPA reads a collection in ONE query bounded
  by `MAX_PAGE_SIZE` (10,000). Both the generator and the loader refuse above it, because a
  truncated read would score everybody from a partial set with no error anywhere.
- **Re-running is safe**: every id embeds (subject, skill, campaign, type), so a re-run
  updates in place. `--purge` on the loader deletes only `asm-u-9%` / `ev-u-9%`, so the
  BD / External-Contracts demo history is never touched.
- **The demo password.** `set-demo-passwords.mjs` gives every invented account the same
  password (`1234567891` by default, `--password '<pw>'` to change) and clears `must_reset`
  so a demonstration can switch accounts without the forced-change screen. It **refuses**
  any account not marked `isTestData`, so a real person can never be given it. Changing a
  credential ends any session already open on that account.
- **Still missing on purpose:** no certificates, no work experience, no training courses for
  `sk-op-*` (so the TNA budget shows 97 of 107 skills uncosted), no saved development plans
  and no back-filled monthly snapshots. Each is its own piece of work.

---

## 3. Verification

Run all of this after a load. The first table is what was run on 2026-09-08 after steps
1–3; the second is 2026-09-09 after step 4.

```bash
cd server
npm run integrity      # expect: no dangling references across 19 relationships
npm test               # expect: 172 passed (10 files)
```

Result on the laptop load: **integrity clean**, **172/172 server tests green** — and
still clean after the people step (0 dangling references across **19** relationships).

**After steps 1–3 (the structure):**

| Check | Expected |
|---|---|
| Row counts | departments **144** (129 + 15) · live skills **228** (123 + 105) · jobProfiles **24** (16 + 8) |
| `sk-op-*` | 96 present, 0 archived |
| Dangling refs | 0 — every `requiredSkills` entry on the eight profiles resolves to a live skill |
| Org tree | `g-canal` → `d-canal-ops` → 3 site departments → 4 sections each; every parent resolves |
| The rename | `d-canal-ops` reads **"Operations - Canal Cities & Sinai"**; only **two** units are still bare "Operations" (`d-west-ops`, `d-south-ops`) — expected and harmless, they are different regions |
| People | **0** users in the 15 new units — nothing to score yet |
| `/analytics/training-needs?scope=d-canal-ops&includeSubUnits=true` | `200`, headcount **0**, **0** rows — correct, and it must never print 0% or a fake gap |
| `/analytics/overview?scope=company` | unchanged by this load (headcount 11, withoutProfile 2, compliance 55%) — Operations adds no people |

**After step 4 (the people):**

| Check | Expected |
|---|---|
| Row counts | users **81** (11 real + 70 invented); ids `u-90001`…`u-90070`, every one `isTestData: true` |
| Dangling refs | `npm run integrity` → 0 across **19** relationships — every departmentId, jobProfileId and managerId resolves |
| Managers | **21** of the 144 departments name a manager (16 set by this load) |
| Reporting chain | exactly **one** person (the AGM) has no manager; every other chain terminates at them |
| Credentials | 70 accounts with `must_reset = true`; no existing password overwritten |
| Strays | 0 — the three real BD / EC people are back in their own sections |
| `/analytics/training-needs?scope=d-canal-ops&includeSubUnits=true` | headcount **70**, withRequirements **70**, **117** skill rows, required **7,135** / measured **0** / unknown **7,135**, `compliancePct` **null**, every row `priority LOW` with `priorityScore` **null** |

That last row is the point of the whole coverage rule: 70 people with 7,135 requirements
and not one measurement produces **"—"**, never 0%, and never a HIGH-priority training
need invented out of silence.

Screen walk in the app (admin):

| Screen | What must be true |
|---|---|
| `/admin/depts` | The Operations branch expands to 3 sites × 4 sections; after step 4 each populated unit shows its members and names its manager |
| `/admin/skills` | 228 live standards; searching `OP-` finds the 96 new ones with their criticality badges |
| `/admin/jobs` | The eight Operations profiles open and list their skills with required levels |
| `/training-needs` | Picking the Operations scope shows headcount 70 with every requirement **unknown** — "—" for compliance and average gap, **not** a zeroed dashboard |
| `/admin/analytics` | Operations units appear in the department table with `—` compliance and `—` avg gap (nulls sorted **last**); headcount rises by 70 |
| `/admin/users` | The 70 invented people list under their sections with a job profile each; a manager card shows a real team |

---

## 4. Placement of the eight profiles — SETTLED (2026-09-09)

On 2026-09-08, immediately after the load, seven of the eight profiles were moved by hand
in the app onto units on the **Sinai** branch. That left Suez and Ismailia & Port Said with
no job profile at all, and it had silently reset five profiles' `orgLevel` to SH.

**The decision taken on 2026-09-09 was to keep ONE ladder.** All eight profiles sit on
`d-canal-ops` and are shared by the three sites; the site and section a person works in is
recorded on the **person**, not by duplicating the profile. Per-site copies were rejected:
12 sections × 5 rungs would be 60 near-identical documents to maintain.

Two things were done to make that stick:

1. `extract_jobs.py` + `load-jobs.mjs` were re-run (**8 updated**), putting all eight back
   on `d-canal-ops` with their correct org levels.
2. The app hole that made the hand-moves look necessary was fixed: the employee form now
   offers **a unit's ancestors' profiles**, so somebody sitting in
   `sect-canal-ops-suez-farm` can be given the ladder that hangs on `d-canal-ops`
   (commit `48530a4`, 2 new tests).

**Do not move a profile by hand in the app.** A re-run of the extract overwrites hand edits
and can leave an org level disagreeing with the profile, which makes the employee form
refuse to save the person. If a different shape is genuinely wanted, change `DEPARTMENT_ID`
in `scripts/etl/ops/extract_jobs.py` and re-run steps 1–3 — the loaders are idempotent and
the profile ids stay stable.

---

## 5. Rollback

Nothing here is destructive except the rename, and no user data is touched.

```sql
-- undo the profiles
DELETE FROM "jobProfiles" WHERE id LIKE 'jp-op-%';
-- undo the new units (sections first, then departments)
DELETE FROM departments WHERE id LIKE 'sect-canal-ops-%';
DELETE FROM departments WHERE id LIKE 'dept-canal-ops-%';
-- undo the rename
UPDATE departments SET data = jsonb_set(data, '{name}', '"Operations"')
 WHERE id = 'd-canal-ops';
```

Removing the **invented people** — the whole point of the 90001+ block:

```sql
-- their invented two years of history first (or re-run load-history.mjs --purge)
DELETE FROM assessments WHERE id LIKE 'asm-u-9%';
DELETE FROM evidences   WHERE id LIKE 'ev-u-9%';
-- the 70 invented users and their logins
DELETE FROM auth_credentials WHERE user_id LIKE 'u-900%';
DELETE FROM users WHERE id LIKE 'u-900%';
-- and the manager references that pointed at them
UPDATE departments SET data = data - 'managerId'
 WHERE data->>'managerId' LIKE 'u-900%';
```

Check the count first (`SELECT count(*) FROM users WHERE id LIKE 'u-900%'` — expect 70).
Nothing real uses that id block, and every record about them carries their `u-9…` id, so
this leaves nothing orphaned. Re-run steps 4 and 5 to put them back.

**Do not delete the skills.** `sk-op-*` can be removed only while nothing references them;
once anybody is assessed against one, **archive it** (`isArchived: true`) instead —
deleting a skill orphans every assessment, evidence and plan item that ever named it. The
nine `sk-bd-*` leadership skills this load created must **not** be removed at all: BD and
EC profiles now reference them.

---

## 6. Known state at the end of this load (2026-09-09)

- **In:** 15 units + 1 rename, 105 competencies, 8 job profiles, 70 invented people, 16
  unit→manager references, 70 logins, and (step 5) **6,077 invented assessments + 992
  evidence records** spanning Nov 2024 → Aug 2026. Integrity clean, 172 server tests green.
- **The department now shows numbers, and they are invented ones**: 61% measured, 55%
  compliant over what is known, average gap 0.59, 117 TNA rows. Every record says
  "DEMO DATA" in its own comment / notes field and every id carries a `u-9…` subject.
- **What is still absent:** certificates, work experience, training courses for `sk-op-*`
  (the TNA budget therefore reports 97 of 107 skills uncosted), saved development plans and
  back-filled monthly snapshots — so the trend chart starts at the first live snapshot.
- **The 70 people and their whole history are test data** (`u-90001`…`u-90070`,
  `isTestData: true`). §5 removes them in one query. Replace them with a real roster before
  anyone treats an Operations number as fact.
- **All 70 share the password `1234567891`** with no forced change — a demonstration
  convenience that must be undone before the database is anything but a demo.
- **The GM seat (`jp-op-gm`) has no holder**, on purpose — that is the `g-canal` sector
  General Manager, an appointment over five departments, not a seat to invent.
- **One loose end:** `u-3397` came out of the hand-moves with **no job profile**. They will
  count as `withoutProfile` and contribute to no coverage or compliance figure until an
  admin gives them one in **Admin → Users**.
- The `d-canal-ops` rename was applied by the ETL loader. It is one edit to undo in
  **Admin → Departments** if the name is not wanted.
- The generators that produce the source workbooks live outside this repo, in
  `BD\ECMS\Job Profiles\_working\`. **Never edit an xlsx by hand — re-run the generator.**
  The same rule applies to profile placement and to people: re-run the extract, do not
  edit in the app.
