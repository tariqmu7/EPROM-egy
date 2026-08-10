-- ============================================================================
-- 007 — Job runs (the record that the nightly sweep actually ran).
--
-- Until now there was NO scheduled work on the server at all: the only
-- automatic behaviour in the whole system (certificate expiry) ran in the
-- BROWSER, when somebody happened to log in. Overdue assessments chased nobody.
-- `src/jobs/` adds a nightly sweep; this table is its logbook, so "did it run,
-- when, and what did it find" is a question with an answer.
--
-- This is NOT a document table — it is server-owned operational data, never
-- served through /col (it is not in collections/registry.ts). Hence plain
-- columns, no JSONB `data`, no version/audit columns, and no authz policy;
-- it is read only through the admin-gated GET /jobs/runs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS job_runs (
  id          TEXT PRIMARY KEY,
  job         TEXT NOT NULL,
  -- 'scheduled' (the timer), 'boot' (a catch-up after downtime) or 'manual'
  -- (an admin pressed run). Kept as free text: a new trigger must not need a
  -- migration, and this column is never used for authorization.
  trigger     TEXT NOT NULL DEFAULT 'scheduled',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  ok          BOOLEAN,
  -- Counters from the sweep (users scanned, notifications created, …). Free
  -- shape on purpose: adding a counter must not need a migration.
  summary     JSONB,
  error       TEXT
);

-- "when did the nightly job last succeed" — the boot catch-up asks this on
-- every container start, and the admin endpoint lists the most recent runs.
CREATE INDEX IF NOT EXISTS idx_job_runs_job_started ON job_runs (job, started_at DESC);
