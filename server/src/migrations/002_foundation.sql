-- ============================================================================
-- 002 — Enterprise foundation for the JSONB document store.
--
-- Hybrid model: keep the flexible `data JSONB` document, but promote the hot,
-- relational fields to first-class TYPED, GENERATED columns so they can be
-- constrained (CHECK), reported on, and joined like any relational table —
-- while the app keeps reading/writing whole documents. Also adds:
--   • optimistic-concurrency `version` + audit columns (created_by/updated_by)
--   • CHECK constraints on the enum fields (NOT VALID: enforced for new/updated
--     rows only, so pre-existing imported rows are never rejected)
--   • GIN indexes on `data` for the large, ad-hoc-queried collections
--
-- NOTE on foreign keys: intentionally OMITTED. The model deliberately tolerates
-- dangling references (e.g. a jobProfile.requiredSkills entry pointing at a
-- deleted skill — the app drops it at read time), and imported data may contain
-- references to rows that were never migrated. Hard FKs would reject both.
-- Revisit FKs only after a dedicated data-cleanup migration.
-- ============================================================================

-- ── 1. version + audit columns on every collection table ────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','skills','departments','"jobProfiles"','assessments','"activityLogs"',
    'evidences','notifications','"assessmentCycles"','nominations',
    '"scheduledAssessments"','"assessmentPlans"','"assessmentInstructions"',
    '"trainingCourses"','projects'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS version    INTEGER NOT NULL DEFAULT 1', t);
    EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS created_by TEXT', t);
    EXECUTE format('ALTER TABLE %s ADD COLUMN IF NOT EXISTS updated_by TEXT', t);
  END LOOP;
END $$;

-- ── 2. Typed generated columns (first-class projections of JSONB fields) ─────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email        TEXT GENERATED ALWAYS AS (lower(data->>'email')) STORED,
  ADD COLUMN IF NOT EXISTS role         TEXT GENERATED ALWAYS AS (data->>'role') STORED,
  ADD COLUMN IF NOT EXISTS status       TEXT GENERATED ALWAYS AS (data->>'status') STORED,
  ADD COLUMN IF NOT EXISTS org_level    TEXT GENERATED ALWAYS AS (data->>'orgLevel') STORED,
  ADD COLUMN IF NOT EXISTS department_id  TEXT GENERATED ALWAYS AS (data->>'departmentId') STORED,
  ADD COLUMN IF NOT EXISTS manager_id     TEXT GENERATED ALWAYS AS (data->>'managerId') STORED,
  ADD COLUMN IF NOT EXISTS job_profile_id TEXT GENERATED ALWAYS AS (data->>'jobProfileId') STORED;

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS subject_id TEXT GENERATED ALWAYS AS (data->>'subjectId') STORED,
  ADD COLUMN IF NOT EXISTS rater_id   TEXT GENERATED ALWAYS AS (data->>'raterId') STORED,
  ADD COLUMN IF NOT EXISTS skill_id   TEXT GENERATED ALWAYS AS (data->>'skillId') STORED,
  ADD COLUMN IF NOT EXISTS cycle_id   TEXT GENERATED ALWAYS AS (data->>'cycleId') STORED;

ALTER TABLE evidences
  ADD COLUMN IF NOT EXISTS user_id  TEXT GENERATED ALWAYS AS (data->>'userId') STORED,
  ADD COLUMN IF NOT EXISTS skill_id TEXT GENERATED ALWAYS AS (data->>'skillId') STORED,
  ADD COLUMN IF NOT EXISTS status   TEXT GENERATED ALWAYS AS (data->>'status') STORED;

ALTER TABLE "jobProfiles"
  ADD COLUMN IF NOT EXISTS department_id TEXT GENERATED ALWAYS AS (data->>'departmentId') STORED,
  ADD COLUMN IF NOT EXISTS org_level     TEXT GENERATED ALWAYS AS (data->>'orgLevel') STORED;

ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS category TEXT GENERATED ALWAYS AS (data->>'category') STORED,
  ADD COLUMN IF NOT EXISTS status   TEXT GENERATED ALWAYS AS (data->>'status') STORED;

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS parent_id TEXT GENERATED ALWAYS AS (data->>'parentId') STORED,
  ADD COLUMN IF NOT EXISTS type      TEXT GENERATED ALWAYS AS (data->>'type') STORED;

-- ── 3. CHECK constraints on the enum columns (NOT VALID → new/updated rows) ──
ALTER TABLE users
  ADD CONSTRAINT chk_users_role
    CHECK (role IS NULL OR role IN ('ADMIN','EMPLOYEE','CEO')) NOT VALID;
ALTER TABLE users
  ADD CONSTRAINT chk_users_status
    CHECK (status IS NULL OR status IN ('ACTIVE','PENDING','REJECTED')) NOT VALID;
ALTER TABLE users
  ADD CONSTRAINT chk_users_orglevel
    CHECK (org_level IS NULL OR org_level IN ('CEO','ACEO','GM','AGM','DM','SH','SP','JP','FR')) NOT VALID;
ALTER TABLE "jobProfiles"
  ADD CONSTRAINT chk_jobprofiles_orglevel
    CHECK (org_level IS NULL OR org_level IN ('CEO','ACEO','GM','AGM','DM','SH','SP','JP','FR')) NOT VALID;

-- ── 4. Indexes on the new typed columns + GIN over the JSONB documents ───────
CREATE INDEX IF NOT EXISTS idx_users_role_col     ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status_col   ON users (status);
CREATE INDEX IF NOT EXISTS idx_assessments_subject_col ON assessments (subject_id);
CREATE INDEX IF NOT EXISTS idx_assessments_rater_col   ON assessments (rater_id);
CREATE INDEX IF NOT EXISTS idx_evidences_user_col      ON evidences (user_id);

-- GIN over the whole document — the "large scans use GIN" the 001 header
-- promised but never created. jsonb_path_ops keeps the index compact and fast
-- for containment (@>) lookups on the busiest collections.
CREATE INDEX IF NOT EXISTS idx_users_data_gin       ON users       USING gin (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_assessments_data_gin ON assessments USING gin (data jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_evidences_data_gin   ON evidences   USING gin (data jsonb_path_ops);
