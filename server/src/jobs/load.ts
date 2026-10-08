// ============================================================================
// Bulk loads for the sweep and the analytics model — FIELDS, never documents.
//
// ECMS has no object storage: every certificate scan, evidence file and avatar
// is a base64 data URL INSIDE its document (up to ~4.5 MB each). A
// `SELECT data FROM users` therefore pulls every scan in the company into the
// api process, and the analytics model did exactly that — on every TNA request
// any manager could make, and again every night. A few hundred scans is enough
// to run the container out of memory (finding R2 of the 8 Oct audit).
//
// So a bulk load names the fields it reads and Postgres sends only those
// (`data->'field'`, which keeps the JSON type: a boolean stays a boolean, an
// array stays an array, a stringified array stays a string). A field nobody
// lists here is never read — a new file field added later stays out by default.
// ============================================================================
import { query } from '../db.js';

export interface LoadedRow {
  id: string;
  data: Record<string, any>;
}

const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Every row of `table`, carrying only `fields` of its document. */
export async function loadFields(table: string, fields: readonly string[]): Promise<LoadedRow[]> {
  for (const f of fields) {
    if (!FIELD_RE.test(f)) throw new Error(`loadFields: bad field name "${f}"`);
  }
  const cols = fields.map((f, i) => `data->'${f}' AS f${i}`).join(', ');
  const { rows } = await query(`SELECT id${cols ? `, ${cols}` : ''} FROM ${table}`);
  return rows.map((r) => {
    const data: Record<string, any> = {};
    fields.forEach((f, i) => {
      const v = r[`f${i}`];
      if (v !== null && v !== undefined) data[f] = v;
    });
    return { id: String(r.id), data };
  });
}

/** The roster fields both loaders read. No avatar, no certificates. */
export const USER_FIELDS = [
  'id', 'name', 'email', 'role', 'status', 'orgLevel',
  'departmentId', 'managerId', 'jobProfileId', 'isArchived',
] as const;

/** Evidence fields the scoring / scheduling ports read. No `fileUrl`. */
export const EVIDENCE_FIELDS = ['status', 'userId', 'skillId', 'assignedScore', 'expiryDate'] as const;

/** Assessment fields the scoring / scheduling ports read. */
export const ASSESSMENT_FIELDS = ['isArchived', 'subjectId', 'skillId', 'type', 'raterId', 'score', 'date'] as const;

/** Work-experience fields the provisional baseline reads. */
export const EXPERIENCE_FIELDS = ['status', 'userId', 'skills'] as const;

/**
 * A certificate's metadata with the scan dropped. The sweep needs the dates to
 * re-band and warn; it never needs the file, so it never keeps it.
 */
export function certificateMeta<T extends Record<string, unknown>>(cert: T): Omit<T, 'fileUrl'> {
  if (!cert || typeof cert !== 'object') return cert;
  const { fileUrl: _drop, ...rest } = cert;
  return rest;
}
