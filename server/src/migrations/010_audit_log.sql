-- ============================================================================
-- 010 — The server's own audit log (finding R9).
--
-- `activityLogs` was written by the BROWSER: the page decided whether to log
-- an action at all, what it was called, who did it and when. A client that
-- skipped the call, or posted straight to the API, changed competence records
-- with no trace — so it was a narration, not an audit trail.
--
-- This table is written by the API itself, in the SAME transaction as every
-- write through /col and /batch (plus the admin password/login actions), so a
-- change and its audit row commit together or not at all. The actor comes from
-- the verified session, the time from the database clock.
--
-- Like job_runs it is server-owned data, NOT a /col collection (not in
-- collections/registry.ts): there is no route that updates or deletes a row,
-- for anyone. It is read only through the admin/CEO-gated GET /audit.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The session's users-table id, its canonical `id`, name and sign-in address,
  -- copied at write time: a later rename or deletion must not rewrite history.
  actor_id    TEXT,
  actor_cid   TEXT,
  actor_name  TEXT,
  actor_email TEXT,
  -- create / update / delete for documents; set-password / release-login for
  -- the admin account actions. Free text: a new action must not need a migration.
  action      TEXT NOT NULL,
  collection  TEXT NOT NULL,
  doc_id      TEXT NOT NULL,
  -- Field → { before, after } for what changed. Large values (file data URLs,
  -- long text) are summarised, never copied — see audit/log.ts.
  changes     JSONB,
  request_id  TEXT
);

-- Newest first, overall and per record / per person — the three questions the
-- endpoint answers.
CREATE INDEX IF NOT EXISTS idx_audit_log_at        ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_doc       ON audit_log (collection, doc_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor     ON audit_log (actor_cid, at DESC);
