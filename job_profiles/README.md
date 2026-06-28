# EPROM Job Profiles

This folder holds **Job Profile** definitions, organized **one folder per General-Manager-level department**, matching the org hierarchy in [`../EPROM_Org_Hierarchy/EPROM_Org_Hierarchy_Tree.md`](../EPROM_Org_Hierarchy/EPROM_Org_Hierarchy_Tree.md).

## Model

Per the system data model, **one position = one job profile**. Each box/position in the org chart is its own job profile, scoped to a single `orgLevel`, with a flat list of required skills and the required proficiency level (1–5) for each.

## Structure

```
job_profiles/
├── README.md            # this file
├── _TEMPLATE.md         # copy this to author a new profile
└── <department>/        # one folder per GM-level department
    └── <section>/       # one sub-folder per SECTION under the department
        ├── <section-head>.md      # SH profile
        ├── <senior-position>.md   # SP
        ├── <junior-position>.md   # JP
        └── <fresh>.md             # FR
```

A GM-level department that has named SECTION boxes groups each section's
position profiles (SH + SP/JP/FR staff) in its own sub-folder. A department
with no section breakdown keeps its position files flat in the department folder.

## How to add a profile

1. Copy [`_TEMPLATE.md`](_TEMPLATE.md) into the relevant department (or section) folder.
2. Rename it to the position (e.g. `personnel-affairs-section-head.md`).
3. Fill in the position, org level, and required skills with levels.

## Proficiency scale

`1 = Awareness · 2 = Basic · 3 = Intermediate · 4 = Advanced · 5 = Expert`

## Org levels

`CEO → ACEO → GM → AGM → DM → SH → SP → JP → FR`

## Hierarchy Level / Type → Org level (mapping — DO NOT infer from name or "reports to")

Every org-chart node carries a structural **type** (set in
[`../scripts/rebuild-org-hierarchy.mjs`](../scripts/rebuild-org-hierarchy.mjs) and stored on each
`departments` doc). A position's `orgLevel` is **derived from that type**, never guessed from the
title or from who it reports to:

| Hierarchy Level / Type | Maps to `orgLevel` | Notes |
|---|---|---|
| `COMPANY` | — | Root wrapper; no job profile. |
| `EXECUTIVE` | `CEO` | Chairman & Managing Director, Vice Chairman. |
| `SECTOR` | `ACEO` | "Assistant to Company President for …" — sits above the functional GMs. |
| `GENERAL` | `GM` | مدير عام — a General-Manager-led general administration. |
| `ASSISTANT_GENERAL` | `AGM` | **Every organisational sub-unit directly under a GM** (e.g. *Business Development & Marketing Programs*, *Personnel Affairs*). The standing unit tier below the General Manager. |
| `DEPARTMENT` | `DM` | Department-Manager unit (available type; reserved for any unit placed below an AGM). |
| `SECTION` | `SH` | Section boxes under a Department. **Deepest unit level** — below it are individual positions (`SP`/`JP`/`FR`), not their own org-chart boxes. |
| `POSITION` | by title | Personal-capacity / titled posts: `مدير عام …` → `GM`, `مدير عام مساعد …` → `AGM`, project/department managers → `DM`. Read the actual title. |

When authoring a profile, record the node's **Hierarchy Level / Type** in the field table and set
`Org level` strictly from this mapping.

## AGM units that split into DEPARTMENT (DM) + SECTION ladders

Where an `ASSISTANT_GENERAL` (AGM) unit has named DEPARTMENT / SECTION boxes
beneath it, the full standing chain is modelled with **real org-chart nodes**:

```
ASSISTANT_GENERAL (AGM)  →  DEPARTMENT (DM)  →  SECTION (SH)  →  SP → JP → FR
```

The **DM** owns the DEPARTMENT node; the **Section Head (SH)** owns the SECTION
node; and the `SP`/`JP`/`FR` staff are individual posts **inside** the SECTION
node (not their own boxes), stepping down one proficiency band per stage.

For thin AGM units that do *not* break down further, a DM profile is still
seeded on the AGM node itself by
[`../scripts/seed-agm-dm-profiles.mjs`](../scripts/seed-agm-dm-profiles.mjs)
(`npm run jobs:seed:agm-dm`) with **empty** `requiredSkills` — admins attach
skills/levels in the Admin Panel.

### Business Development & External Contracting (`g-bizdev`) — fully authored

This GM department is built out end-to-end (org chart approved 2026-06-22). The
two AGM units each split into **two** DEPARTMENT (DM) units, and each DEPARTMENT
owns one same-named SECTION holding the SH + SP/JP/FR ladder:

| Node (type) | Org level | Profile id(s) | Seed |
|---|---|---|---|
| `g-bizdev` (GENERAL) | GM | `bizdev-gm` | `seed-bizdev-gm-profile.mjs` (`jobs:seed:bizdev-gm`) — reuses 13 `sk-*`, adds `sk-strategic-planning` + `sk-leadership` |
| `d-bizdev-mkt` (ASSISTANT_GENERAL) | AGM | `bizdev-mkt-sp` (unit head) | `seed-bizdev-mkt-profile.mjs` (`jobs:seed:bizdev-mkt`) — creates the 13 base `sk-*` skills |
| `dept-bizdev-mkt-bd` → `sect-bizdev-mkt-bd` | DM → SH/SP/JP/FR | `bizdev-mkt-bd-{dm,sh,snr,jnr,fresh}` | `seed-bizdev-sections.mjs` (`jobs:seed:bizdev-sections`) |
| `dept-bizdev-mkt-programs` → `sect-bizdev-mkt-programs` | DM → SH/SP/JP/FR | `bizdev-mkt-programs-{dm,sh,snr,jnr,fresh}` | `seed-bizdev-sections.mjs` |
| `d-bizdev-ext` (ASSISTANT_GENERAL) | AGM | `bizdev-ext-sp` (unit head) | `seed-bizdev-ext-profile.mjs` (`jobs:seed:bizdev-ext`) — adds 5 contract `sk-*` skills |
| `dept-bizdev-ext-contracts` → `sect-bizdev-ext-contracts` | DM → SH/SP/JP/FR | `bizdev-ext-contracts-{dm,sh,snr,jnr,fresh}` | `seed-bizdev-sections.mjs` |
| `dept-bizdev-ext-followup` → `sect-bizdev-ext-followup` | DM → SH/SP/JP/FR | `bizdev-ext-followup-{dm,sh,snr,jnr,fresh}` | `seed-bizdev-sections.mjs` |

**Run order:** `npm run org:rebuild` → `jobs:seed:bizdev-gm` → `jobs:seed:bizdev-mkt`
→ `jobs:seed:bizdev-ext` → `jobs:seed:bizdev-sections`. The sections seed only
references the `sk-*` catalog (never writes skills), so the three head seeds must
run first. Pass `--prune` to `jobs:seed:bizdev-sections` once to delete the 11
superseded legacy profiles (`bizdev-bd-*`, `bizdev-mkt-dm`, `bizdev-mkt-snr/jnr/fresh`,
`bizdev-ext-snr/jnr/fresh`) — these predate the split and hung off the AGM nodes
or the old UI-created `z3xbqrles` section. The per-unit seeds they came from
(`seed-bizdev-bd-profiles.mjs`, `seed-bizdev-mkt-subpositions.mjs`,
`seed-bizdev-ext-subpositions.mjs`, `seed-bizdev-mkt-dm.mjs`) are now
`@deprecated` in favour of the consolidated `seed-bizdev-sections.mjs`.

The narrative profile docs under
[`business-development-external-contracting/`](business-development-external-contracting/)
(GM, the two AGM heads, the DM, and the Business Development section) remain the
authored references; the consolidated seed is the live source of truth that the
[CMS report](../reporting/business-development-external-contracting/) mirrors.

## Placement rules (enforced in the Admin UI)

The org chart must stay strictly ordered (`CEO → ACEO → GM → AGM → DM → SH → SP → JP → FR`).
The mapping above is the single source of truth — see `DEPT_TYPE_TO_ORG_LEVEL` in
[`../types.ts`](../types.ts) and the validators `validateUnitPlacement` /
`validateJobProfilePlacement` in [`../services/store.ts`](../services/store.ts), which the
Admin Department and Job-Profile forms call before saving:

- **A child unit must sit strictly below its parent.** Every organisational sub-unit directly under
  a `GENERAL` (GM) is an `ASSISTANT_GENERAL` (AGM) box; a `DEPARTMENT` (DM) nests under an AGM and a
  `SECTION` (SH) under a DEPARTMENT. A `SECTION` (SH) is the deepest unit and cannot contain
  sub-units. Skipping intermediate levels is still allowed (a `SECTION` may sit directly under an
  AGM). Titled `POSITION` posts (personal-capacity GM/AGM, project managers) sit alongside units and
  take their level from their title.
- **A job profile must not sit above the unit it belongs to.** A position's `orgLevel` must be the
  unit's level or lower (e.g. a `SECTION` unit may hold an `SH` head plus `SP`/`JP`/`FR` staff, but
  not a `GM`).
