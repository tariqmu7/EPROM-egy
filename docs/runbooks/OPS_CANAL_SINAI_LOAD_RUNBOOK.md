# Runbook — loading Operations (Canal Cities & Sinai) into ECMS

**What this is.** The end-to-end procedure that added the fourth department to an ECMS
database: the **strategic-tank Operations** organisation under the General Manager of
Operations, Canal Cities & Sinai — **15 new org units + 1 rename**, **105 new
competencies** and **8 job profiles** (Fresh → GM, including two shift roles).

Executed against the laptop's local Postgres on **2026-09-08**. Run the same sequence, in
the same order, to reproduce it on an EPROM server.

> **Nothing demo about this one.** Unlike
> [`BD_EC_PRODUCTION_LOAD_RUNBOOK.md`](BD_EC_PRODUCTION_LOAD_RUNBOOK.md), this load writes
> **no** people, courses, assessments, evidences, plans or snapshots — only the org units,
> the competency dictionary entries and the job profiles. **Nobody is placed in the 15 new
> units**, so every Operations figure in the app correctly reads "—" until people are
> assigned. That is the coverage rule working, not a fault.

---

## 1. Prerequisites

| Need | Detail |
|---|---|
| Database | A running ECMS Postgres with migrations applied. Locally that is the embedded cluster started by `server/scripts/serve-local.ts` (or `run.bat`) on `127.0.0.1:5433`, db `eprom_cms`. |
| Connection | The loaders read the same env vars as the API (`PGHOST` / `PGPORT` / `PGUSER` / `PGPASSWORD` / `PGDATABASE` from `server/.env`). |
| Node | Node 20+, `npm install` done in `server/`. |
| Python | Python 3.11+ with `openpyxl`, for the extract steps only. |
| Source pack | `BD\ECMS\Job Profiles\1_Final_Deliverables\ECMS_Import\` — `ops_departments.json`, `ECMS_Upload_1_SKILL.xlsx` (272 rows), `ECMS_Upload_2_JOB.xlsx` (2,501 rows). Rebuild them with `_working\generate_ops_departments.py` and `_working\generate_ecms_import.py`. |
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

The order is not optional. Units before skills before profiles — a profile refuses to load
against a department or a skill that is not there yet.

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

---

## 3. Verification

Run all of this after a load. This is what was run on 2026-09-08.

```bash
cd server
npm run integrity      # expect: no dangling references across 19 relationships
npm test               # expect: 172 passed (10 files)
```

Result on the laptop load: **integrity clean**, **172/172 server tests green**.

| Check | Expected after this load |
|---|---|
| Row counts | departments **144** (129 + 15) · live skills **228** (123 + 105) · jobProfiles **24** (16 + 8) |
| `sk-op-*` | 96 present, 0 archived |
| Dangling refs | 0 — every `requiredSkills` entry on the eight profiles resolves to a live skill |
| Org tree | `g-canal` → `d-canal-ops` → 3 site departments → 4 sections each; every parent resolves |
| The rename | `d-canal-ops` reads **"Operations - Canal Cities & Sinai"**; only **two** units are still bare "Operations" (`d-west-ops`, `d-south-ops`) — expected and harmless, they are different regions |
| People | **0** users in the 15 new units — nothing to score yet |
| `/analytics/training-needs?scope=d-canal-ops&includeSubUnits=true` | `200`, headcount **0**, **0** rows — correct, and it must never print 0% or a fake gap |
| `/analytics/overview?scope=company` | unchanged by this load (headcount 11, withoutProfile 2, compliance 55%) — Operations adds no people |

Screen walk in the app (admin):

| Screen | What must be true |
|---|---|
| `/admin/depts` | The Operations branch expands to 3 sites × 4 sections; each new unit shows 0 members |
| `/admin/skills` | 228 live standards; searching `OP-` finds the 96 new ones with their criticality badges |
| `/admin/jobs` | The eight Operations profiles open and list their skills with required levels |
| `/training-needs` | Picking the Operations scope shows an empty state — **not** a zeroed dashboard |
| `/admin/analytics` | Company figures unchanged; Operations units appear in the department table with `—` compliance and `—` avg gap (nulls sorted **last**) |

---

## 4. Placement of the eight profiles — the one open decision

The loaders attach all eight to `d-canal-ops`. **On 2026-09-08, immediately after the load,
seven of the eight were moved by hand in the app** (admin, `/admin/jobs`) onto the real
units — all of them on the **Sinai** branch:

| Profile | Loaded on | Now on |
|---|---|---|
| `jp-op-gm` | `d-canal-ops` | `g-canal` (the GENERAL unit) |
| `jp-op-agm` | `d-canal-ops` | `d-canal-ops` (unchanged) |
| `jp-op-dm` | `d-canal-ops` | `dept-canal-ops-sinai` |
| `jp-op-sh` · `jp-op-spe` · `jp-op-sps` · `jp-op-jp` · `jp-op-fr` | `d-canal-ops` | `sect-canal-ops-sinai-farm` |

**That leaves Suez and Ismailia & Port Said with no job profile at all** — 2 site
departments and 11 of the 12 sections. Anybody placed there will count as
`withoutProfile` and contribute to no coverage, gap or compliance figure. Either the
per-site copies must be created, or the profiles go back onto `d-canal-ops`.

Both arrangements are legitimate; they answer different questions.

- **All on `d-canal-ops`** (as loaded): one profile per rung, shared by all three sites. The
  site a person works at is recorded on the person. Fewest documents to maintain.
- **Per unit** (the hand edits): a profile hangs on the exact unit it belongs to, which is
  what the org-chart screens and the per-unit TNA read most naturally — but it must then be
  **repeated for Suez and Ismailia & Port Said**, or those ten sections have no profile and
  anybody placed in them counts as `withoutProfile` in every figure on the analytics page.

**If the per-unit shape is the one that is wanted, do not hand-copy it.** Change
`DEPARTMENT_ID` in `scripts/etl/ops/extract_jobs.py` to a per-rung/per-site mapping and
re-run steps 1–3 — the loaders are idempotent and will update in place, and the profile ids
stay stable. Hand edits are lost the next time the extract is re-run.

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

**Do not delete the skills.** `sk-op-*` can be removed only while nothing references them;
once anybody is assessed against one, **archive it** (`isArchived: true`) instead —
deleting a skill orphans every assessment, evidence and plan item that ever named it. The
nine `sk-bd-*` leadership skills this load created must **not** be removed at all: BD and
EC profiles now reference them.

---

## 6. Known state at the end of this load (2026-09-08)

- 15 units, 105 skills, 8 profiles in; integrity clean; 172 server tests green.
- **Nobody is assigned to any Operations unit**, so no Operations coverage, gap, ITP, TNA
  or snapshot figure exists yet. Placing people is the next piece of work and is not part
  of this runbook.
- The `d-canal-ops` rename was applied by the ETL loader. It is one edit to undo in
  **Admin → Departments** if the name is not wanted.
- The generators that produce the source workbooks live outside this repo, in
  `BD\ECMS\Job Profiles\_working\`. **Never edit an xlsx by hand — re-run the generator.**
