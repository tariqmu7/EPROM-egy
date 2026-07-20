-- ============================================================================
-- 003 — Tombstones for delta-sync delete propagation.
--
-- Delta sync fetches rows where `updated_at > cursor`, which cannot observe a
-- HARD delete (the row simply vanishes, leaving nothing to sync). This table
-- records deletions so the client can remove them from its local cache.
--
-- Deliberately unscoped: a tombstone reveals only that "id X in collection Y was
-- deleted", never its contents. The client acts on it solely to evict an id it
-- already had cached (i.e. was already authorised to see), so no data leaks.
--
-- Retention: tombstones are tiny; a background job may prune rows older than the
-- longest expected client-offline window (e.g. 90 days) without harm.
-- ============================================================================
CREATE TABLE IF NOT EXISTS tombstones (
  collection TEXT NOT NULL,
  id         TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS idx_tombstones_deleted_at ON tombstones (deleted_at);
