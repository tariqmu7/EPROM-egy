-- ============================================================================
-- 005 — Work Experience + app settings.
--
-- `workExperiences`: employee-submitted records of employment OUTSIDE the
-- company, verified by the employee's direct manager (or an admin). Each record
-- tags skills with the years they were applied; on verification the reviewer
-- confirms a per-skill level. A VERIFIED record's level then acts as a capped,
-- PROVISIONAL competency baseline — consumed only where a skill has no
-- assessment and no scored evidence (see getUserSkillScore in
-- src/services/store.ts). A real assessment always wins.
--
-- `appSettings`: one row per config key; row id 'work-experience' holds the
-- years->level band table and the provisional cap. Created here rather than in a
-- later migration so the config store exists from day one of the feature. It is
-- read-open / admin-write (ADMIN_WRITE_COLLECTIONS in authz.ts).
--
-- Conventions (see 001 / 002 / 004):
--   • (id TEXT PK, data JSONB, created_at, updated_at) document tables.
--   • btree EXPRESSION indexes on (data->>'field'): the generic read path always
--     emits data->>'field' (collections/query.ts), so those are the indexes it
--     actually uses. No duplicate index on the generated column — 004 pruned
--     exactly those as dead weight.
--   • version / created_by / updated_by must be added EXPLICITLY here: 002's
--     DO-loop iterates a hardcoded table list and cannot see a table created by
--     a later migration, while the PUT/PATCH SQL in collections/routes.ts
--     references those columns unconditionally.
--   • Enum CHECKs are NOT VALID (enforced for new/updated rows only).
--   • No foreign keys, by design — dangling refs are dropped at read time and
--     reported on demand by `npm run integrity`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "workExperiences" (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "appSettings" (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── version + audit columns (002's DO-loop cannot reach a later table) ───────
ALTER TABLE "workExperiences"
  ADD COLUMN IF NOT EXISTS version    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

ALTER TABLE "appSettings"
  ADD COLUMN IF NOT EXISTS version    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- ── Typed generated projections (back the CHECK + ad-hoc reporting SQL) ─────
ALTER TABLE "workExperiences"
  ADD COLUMN IF NOT EXISTS user_id TEXT GENERATED ALWAYS AS (data->>'userId') STORED,
  ADD COLUMN IF NOT EXISTS status  TEXT GENERATED ALWAYS AS (data->>'status') STORED;

-- ── Enum CHECK (NOT VALID → new/updated rows only) ──────────────────────────
-- Kept in lockstep with WORK_EXPERIENCE_STATUS in src/domain/enums.ts;
-- __tests__/contracts.test.ts asserts the two agree.
ALTER TABLE "workExperiences"
  ADD CONSTRAINT chk_workexperiences_status
    CHECK (status IS NULL OR status IN ('PENDING','VERIFIED','REJECTED')) NOT VALID;

-- ── Read-path indexes (expression form; see 004's rationale) ────────────────
CREATE INDEX IF NOT EXISTS idx_workexperiences_user   ON "workExperiences" ((data->>'userId'));
CREATE INDEX IF NOT EXISTS idx_workexperiences_status ON "workExperiences" ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_workexperiences_data_gin
  ON "workExperiences" USING gin (data jsonb_path_ops);
