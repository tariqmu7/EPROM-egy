-- ============================================================================
-- 006 — Development plans (the SAVED individual training plan).
--
-- Until now the ITP was generated fresh on every page load and thrown away
-- (`generateIndividualTrainingPlan` in src/services/store.ts), so the system
-- could recommend training but never record that it was agreed, assigned,
-- started, finished or signed off — and could never prove that training moved
-- a competency score. This table is the agreement itself: one row per plan,
-- holding a frozen snapshot of each gap at planning time plus the per-item
-- lifecycle (status → completion → manager sign-off → level re-read).
--
-- Ownership mirrors `workExperiences`: the employee owns the record, their
-- management chain may read and act on it (authz.ts: developmentPlansPolicy +
-- a MANDATORY listScope case — runList never calls can()).
--
-- Conventions (see 001 / 002 / 004 / 005):
--   • (id TEXT PK, data JSONB, created_at, updated_at) document table.
--   • btree EXPRESSION indexes on (data->>'field') — the generic read path
--     emits exactly that (collections/query.ts); no index on the generated
--     column (004 pruned those as dead weight).
--   • version / created_by / updated_by must be added EXPLICITLY: 002's DO-loop
--     iterates a hardcoded table list and cannot see a later table, while the
--     PUT/PATCH SQL in collections/routes.ts references those columns
--     unconditionally.
--   • Enum CHECK is NOT VALID (enforced for new/updated rows only).
--   • No foreign keys, by design — dangling refs are dropped at read time and
--     reported on demand by `npm run integrity`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "developmentPlans" (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── version + audit columns (002's DO-loop cannot reach a later table) ───────
ALTER TABLE "developmentPlans"
  ADD COLUMN IF NOT EXISTS version    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- ── Typed generated projections (back the CHECK + ad-hoc reporting SQL) ─────
ALTER TABLE "developmentPlans"
  ADD COLUMN IF NOT EXISTS user_id TEXT GENERATED ALWAYS AS (data->>'userId') STORED,
  ADD COLUMN IF NOT EXISTS status  TEXT GENERATED ALWAYS AS (data->>'status') STORED;

-- ── Enum CHECK (NOT VALID → new/updated rows only) ──────────────────────────
-- Kept in lockstep with DEVELOPMENT_PLAN_STATUS in src/domain/enums.ts;
-- __tests__/contracts.test.ts asserts the two agree.
ALTER TABLE "developmentPlans"
  ADD CONSTRAINT chk_developmentplans_status
    CHECK (status IS NULL OR status IN ('DRAFT','ACTIVE','COMPLETED','ARCHIVED')) NOT VALID;

-- ── Read-path indexes (expression form; see 004's rationale) ────────────────
CREATE INDEX IF NOT EXISTS idx_developmentplans_user   ON "developmentPlans" ((data->>'userId'));
CREATE INDEX IF NOT EXISTS idx_developmentplans_status ON "developmentPlans" ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_developmentplans_data_gin
  ON "developmentPlans" USING gin (data jsonb_path_ops);
