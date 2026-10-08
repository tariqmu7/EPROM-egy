// ============================================================================
// The server's audit log (finding R9) — see migration 010.
//
// Every write path calls `recordAudit` with the SAME runner it wrote with, so
// the audit row lives or dies with the change it describes. Nothing here reads
// the request body for identity: the actor is the verified session.
// ============================================================================
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { canonicalId } from '../authz.js';
import type { AuthedUser } from '../types.js';

type Runner = (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
type Doc = Record<string, any>;

export type AuditAction = 'create' | 'update' | 'delete' | 'set-password' | 'release-login';

export interface AuditEntry {
  action: AuditAction;
  collection: string;
  docId: string;
  before?: Doc | null;
  after?: Doc | null;
  /** Pre-built changes, for actions that are not a document diff. */
  changes?: Record<string, { before?: unknown; after?: unknown }>;
}

// A personal inbox is not a business record (marking one read would flood the
// log), and a client note IS a log entry — auditing its creation would only
// duplicate it. Edits/deletes of notes are refused by authz anyway.
export function shouldAudit(collection: string, action: AuditAction): boolean {
  if (collection === 'notifications') return false;
  if (collection === 'activityLogs' && action === 'create') return false;
  return true;
}

// A value as the log stores it. Certificate scans, evidence files and avatars
// are base64 data URLs of up to ~4.5 MB inside the document; copying them into
// every audit row would multiply the database and spread the files to a second
// place. So a data URL becomes its type and size, and anything long is cut.
const MAX_VALUE_CHARS = 500;
const DATA_URL = /(?<![a-z])data:([a-z0-9.+/-]*)(;[^,"\s\\]*)?,[^"\s\\]*/gi;

export function summarize(value: unknown): unknown {
  if (value === undefined) return undefined;
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  // Also catches files nested in structured or stringified fields (users.certificates).
  const text = raw.replace(DATA_URL, (m, type) => `[file ${type || 'unknown'}, ${m.length} chars]`);
  if (text.length > MAX_VALUE_CHARS) return `${text.slice(0, MAX_VALUE_CHARS)}… [${text.length} chars]`;
  return text === raw ? value : text;
}

// Field → { before, after } for every top-level field that differs. `id` is the
// row key and already on the entry.
export function diffDocs(before: Doc | null | undefined, after: Doc | null | undefined) {
  const changes: Record<string, { before?: unknown; after?: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    if (k === 'id') continue;
    const b = before?.[k];
    const a = after?.[k];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    const entry: { before?: unknown; after?: unknown } = {};
    if (b !== undefined) entry.before = summarize(b);
    if (a !== undefined) entry.after = summarize(a);
    changes[k] = entry;
  }
  return changes;
}

export function requestIdOf(req: Request): string | null {
  const rid = req.res?.getHeader('x-request-id');
  return typeof rid === 'string' ? rid : null;
}

export async function recordAudit(run: Runner, actor: AuthedUser, entry: AuditEntry, requestId: string | null) {
  if (!shouldAudit(entry.collection, entry.action)) return;
  const changes = entry.changes ?? diffDocs(entry.before, entry.after);
  const name = (actor.data as Doc | undefined)?.name;
  await run(
    `INSERT INTO audit_log (id, actor_id, actor_cid, actor_name, actor_email, action, collection, doc_id, changes, request_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      randomUUID(),
      actor.id,
      canonicalId(actor),
      typeof name === 'string' ? name : null,
      actor.authEmail || actor.email || null,
      entry.action,
      entry.collection,
      entry.docId,
      changes,
      requestId,
    ],
  );
}

// A browser-written `activityLogs` note is kept (the pages narrate in words the
// server cannot), but who wrote it and when are no longer the browser's to say:
// whatever arrived is overwritten from the session and the server clock.
export function stampClientLog(collection: string, doc: Doc, actor: AuthedUser): Doc {
  if (collection !== 'activityLogs') return doc;
  const name = (actor.data as Doc | undefined)?.name;
  return {
    ...doc,
    actorId: canonicalId(actor),
    actorName: typeof name === 'string' && name ? name : actor.authEmail || actor.email,
    timestamp: new Date().toISOString(),
  };
}
