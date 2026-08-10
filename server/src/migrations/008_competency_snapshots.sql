-- ============================================================================
-- 008 — Competency snapshots (the system's memory of its own numbers).
--
-- Finding 6 of the analytical-engine review: nothing stores "as at 30 June,
-- department X averaged Y". Every figure in the app is recomputed live, so the
-- only "trend" available was AdminAnalytics replaying assessment records in the
-- browser — which ignored evidence and work-experience scores and therefore
-- disagreed with every other screen.
--
-- One row = one scope, one month. The nightly sweep writes/refreshes the row
-- for the CURRENT month on every run, so a month's row settles on its last
-- reading of that month and the current month is always up to date. That is why
-- (period, scope_type, scope_id) is UNIQUE: re-running the job is idempotent,
-- it never appends a second point to the same month.
--
-- Like `job_runs` this is NOT a document table: server-owned derived data,
-- never served through /col (no registry entry, no zod schema, no authz policy,
-- no version/audit columns). It is read only through the admin/CEO-gated
-- GET /analytics/snapshots.
-- ============================================================================

CREATE TABLE IF NOT EXISTS competency_snapshots (
  id                TEXT PRIMARY KEY,
  -- 'YYYY-MM' — the same monthKey() the notification dedupe uses.
  period            TEXT NOT NULL,
  -- 'COMPANY' or 'DEPARTMENT'. Free text for the same reason as job_runs.trigger:
  -- a new scope kind must not need a migration, and it never authorizes anything.
  scope_type        TEXT NOT NULL,
  -- '*' for the whole company, else the department id. Never NULL, so the
  -- uniqueness rule below applies to the company row too.
  scope_id          TEXT NOT NULL,
  -- The unit's name AS IT WAS when the snapshot was taken. Denormalised on
  -- purpose: a renamed or deleted department must not silently rewrite history.
  scope_name        TEXT,
  taken_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Population
  headcount         INTEGER NOT NULL DEFAULT 0,
  with_requirements INTEGER NOT NULL DEFAULT 0,

  -- Coverage, mirroring CompetencyCoverage in src/types.ts exactly:
  -- required = measured + provisional + unknown, known = measured + provisional.
  required          INTEGER NOT NULL DEFAULT 0,
  measured          INTEGER NOT NULL DEFAULT 0,
  provisional       INTEGER NOT NULL DEFAULT 0,
  unknown           INTEGER NOT NULL DEFAULT 0,
  compliant_known   INTEGER NOT NULL DEFAULT 0,
  gaps_known        INTEGER NOT NULL DEFAULT 0,
  total_gap         NUMERIC NOT NULL DEFAULT 0,

  -- NULLABLE ON PURPOSE — the "no percentage without its base" rule. Nothing
  -- known means no compliance figure and no average gap; storing 0 here would
  -- reinstate exactly the lie this whole workstream removed.
  compliance_pct    INTEGER,
  avg_gap           NUMERIC,
  measured_pct      INTEGER NOT NULL DEFAULT 0,

  -- Free-shape extras (today: the worst skills by summed gap). Adding to the
  -- detail must not need a migration.
  detail            JSONB
);

-- One row per scope per month — this is what makes the nightly write idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS ux_competency_snapshots_scope_period
  ON competency_snapshots (period, scope_type, scope_id);

-- The read path is always "one scope, ordered by month".
CREATE INDEX IF NOT EXISTS idx_competency_snapshots_scope
  ON competency_snapshots (scope_type, scope_id, period);
