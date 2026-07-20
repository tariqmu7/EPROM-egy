-- ============================================================================
-- 004 — Prune redundant hot-field indexes (finding F-6).
--
-- Migration 001 created btree EXPRESSION indexes on (data->>'field') for the hot
-- query fields. Migration 002 then added typed GENERATED columns for those same
-- fields AND a second btree index on each column.
--
-- The application's generic read path always emits `data->>'field'` (see
-- collections/query.ts), so it uses the 001 expression indexes; the 002 column
-- indexes were never on the app's read path. Only the generated COLUMNS carry
-- their weight there — they back the CHECK constraints and any ad-hoc/reporting
-- SQL. Maintaining a second index per field is pure write-amplification.
--
-- This drops the five duplicate column indexes. The generated columns and their
-- CHECK constraints are left intact; a reporting query that filters on a column
-- can get a dedicated index the day it actually needs one.
-- ============================================================================
DROP INDEX IF EXISTS idx_users_role_col;
DROP INDEX IF EXISTS idx_users_status_col;
DROP INDEX IF EXISTS idx_assessments_subject_col;
DROP INDEX IF EXISTS idx_assessments_rater_col;
DROP INDEX IF EXISTS idx_evidences_user_col;
