-- ============================================================================
-- EPROM CMS — initial schema (replaces Firestore)
--
-- Design: every Firestore collection becomes a table of
--   (id TEXT PK, data JSONB, created_at, updated_at).
-- The whole document lives in `data` so the ETL is a near-1:1 copy and the API
-- serves the same object shapes services/store.ts already expects. Hot query
-- fields get btree expression indexes on (data->>'field'); large scans use GIN.
--
-- Password hashes live in a SEPARATE table (auth_credentials) and are NEVER put
-- in the users document, which every authenticated user is allowed to read.
-- ============================================================================

-- ── Core document collections ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  data       JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role        ON users ((data->>'role'));
CREATE INDEX IF NOT EXISTS idx_users_status      ON users ((data->>'status'));
CREATE INDEX IF NOT EXISTS idx_users_department  ON users ((data->>'departmentId'));
CREATE INDEX IF NOT EXISTS idx_users_general     ON users ((data->>'generalDepartmentId'));
CREATE INDEX IF NOT EXISTS idx_users_manager     ON users ((data->>'managerId'));
CREATE INDEX IF NOT EXISTS idx_users_jobprofile  ON users ((data->>'jobProfileId'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (lower(data->>'email'));

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills ((data->>'category'));
CREATE INDEX IF NOT EXISTS idx_skills_status   ON skills ((data->>'status'));

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_departments_parent  ON departments ((data->>'parentId'));
CREATE INDEX IF NOT EXISTS idx_departments_manager ON departments ((data->>'managerId'));
CREATE INDEX IF NOT EXISTS idx_departments_type    ON departments ((data->>'type'));

CREATE TABLE IF NOT EXISTS "jobProfiles" (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobprofiles_department ON "jobProfiles" ((data->>'departmentId'));
CREATE INDEX IF NOT EXISTS idx_jobprofiles_orglevel   ON "jobProfiles" ((data->>'orgLevel'));

CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_assessments_rater   ON assessments ((data->>'raterId'));
CREATE INDEX IF NOT EXISTS idx_assessments_subject ON assessments ((data->>'subjectId'));
CREATE INDEX IF NOT EXISTS idx_assessments_skill   ON assessments ((data->>'skillId'));
CREATE INDEX IF NOT EXISTS idx_assessments_cycle   ON assessments ((data->>'cycleId'));

CREATE TABLE IF NOT EXISTS "activityLogs" (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activitylogs_actor  ON "activityLogs" ((data->>'actorId'));
CREATE INDEX IF NOT EXISTS idx_activitylogs_entity ON "activityLogs" ((data->>'entityId'));

CREATE TABLE IF NOT EXISTS evidences (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evidences_user   ON evidences ((data->>'userId'));
CREATE INDEX IF NOT EXISTS idx_evidences_skill  ON evidences ((data->>'skillId'));
CREATE INDEX IF NOT EXISTS idx_evidences_status ON evidences ((data->>'status'));

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications ((data->>'userId'));
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications ((data->>'isRead'));

CREATE TABLE IF NOT EXISTS "assessmentCycles" (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nominations (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nominations_nominator ON nominations ((data->>'nominatorId'));
CREATE INDEX IF NOT EXISTS idx_nominations_rater     ON nominations ((data->>'raterId'));
CREATE INDEX IF NOT EXISTS idx_nominations_subject   ON nominations ((data->>'subjectId'));

CREATE TABLE IF NOT EXISTS "scheduledAssessments" (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_user  ON "scheduledAssessments" ((data->>'userId'));
CREATE INDEX IF NOT EXISTS idx_scheduled_skill ON "scheduledAssessments" ((data->>'skillId'));

CREATE TABLE IF NOT EXISTS "assessmentPlans" (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "assessmentInstructions" (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "trainingCourses" (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Authentication (kept OUT of the readable users document) ─────────────────

CREATE TABLE IF NOT EXISTS auth_credentials (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  password_hash TEXT,                       -- null until the user sets a password
  must_reset    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_email ON auth_credentials (lower(email));

-- Optional: password-reset tokens (used only if SMTP relay is available).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
