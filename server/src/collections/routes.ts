import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { query } from '../db.js';
import { can, listScope, type Action } from '../authz.js';
import type { AuthedUser } from '../types.js';
import { isCollection, tableFor, type CollectionName } from './registry.js';
import { buildWhere, type Filter, type QuerySpec } from './query.js';
import { validateDoc } from './schemas.js';
import { writeTombstone, clearTombstone } from './tombstones.js';

// Greatest timestamp (as ISO) across a set of Date/string values, or null.
// Drives the delta-sync cursor the client sends back on its next poll.
function maxIso(values: unknown[]): string | null {
  let best = -Infinity;
  let iso: string | null = null;
  for (const v of values) {
    if (v == null) continue;
    const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
    if (Number.isFinite(t) && t > best) {
      best = t;
      iso = new Date(t).toISOString();
    }
  }
  return iso;
}

// Wrap async handlers so thrown errors hit the error middleware.
const h =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: (e?: unknown) => void) =>
    fn(req, res).catch(next);

async function getUserDoc(id: string): Promise<Record<string, any> | null> {
  const { rows } = await query('SELECT data FROM users WHERE id = $1', [id]);
  return rows.length ? (rows[0].data as Record<string, any>) : null;
}

// Full management subtree of a user (self + all transitive direct reports), by
// canonical `id`. Used to scope list reads of assessments/evidences to the rows a
// manager is entitled to. Iterative (one query per org level) so it stays within
// what pg-mem supports and can't recurse unbounded; org depth is ≤ 9.
async function getSubordinateIds(rootCanonicalId: string): Promise<string[]> {
  const all = new Set<string>([rootCanonicalId]);
  let frontier = [rootCanonicalId];
  while (frontier.length > 0) {
    const { rows } = await query(
      `SELECT id, data->>'id' AS cid FROM users WHERE data->>'managerId' = ANY($1::text[])`,
      [frontier],
    );
    const next: string[] = [];
    for (const r of rows) {
      const cid = String(r.cid ?? r.id);
      if (!all.has(cid)) {
        all.add(cid);
        next.push(cid);
      }
    }
    frontier = next;
  }
  return [...all];
}

interface DocRow {
  data: Record<string, any>;
  version: number;
}

// Loads the stored document plus its concurrency version. `data` feeds authz;
// `version` feeds optimistic-concurrency checks on update/delete.
async function loadRow(table: string, id: string): Promise<DocRow | null> {
  const { rows } = await query(`SELECT data, version FROM ${table} WHERE id = $1`, [id]);
  if (!rows.length) return null;
  return { data: rows[0].data as Record<string, any>, version: Number(rows[0].version ?? 1) };
}

// Supervision also runs through department ownership (you manage the section
// somebody sits in), so authz needs department documents as well as user ones.
async function getDepartmentDoc(id: string): Promise<Record<string, any> | null> {
  const { rows } = await query('SELECT data FROM departments WHERE id = $1', [id]);
  return rows.length ? (rows[0].data as Record<string, any>) : null;
}

function ctxBase(user: AuthedUser) {
  return { user, getUserDoc, getDepartmentDoc };
}

async function authorize(
  collection: CollectionName,
  action: Action,
  user: AuthedUser,
  extra: { docId?: string; existing?: Record<string, any> | null; incoming?: Record<string, any> | null },
): Promise<boolean> {
  return can(collection, action, { ...ctxBase(user), ...extra });
}

// Turn ?field=value query params (minus control keys) into equality filters.
function simpleFilters(reqQuery: Record<string, unknown>): Filter[] {
  const control = new Set(['limit', 'orderBy', 'orderDir', 'offset']);
  const filters: Filter[] = [];
  for (const [field, value] of Object.entries(reqQuery)) {
    if (control.has(field) || value == null) continue;
    filters.push({ field, op: 'eq', value: String(value) });
  }
  return filters;
}

// Uniform response envelope: the document plus its server-owned metadata
// (version + timestamps). Additive — existing clients read only `id`/`data`.
function shape(id: string, data: Record<string, any>, meta: { version?: unknown; created_at?: unknown; updated_at?: unknown }) {
  return {
    id,
    data,
    version: Number(meta.version ?? 1),
    createdAt: meta.created_at ?? null,
    updatedAt: meta.updated_at ?? null,
  };
}

// Reads an optional `expectedVersion` from a write body for optimistic
// concurrency. Absent → last-write-wins (unchanged legacy behaviour).
function expectedVersionOf(req: Request): number | undefined {
  const v = (req.body as Record<string, unknown> | undefined)?.expectedVersion;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function collectionsRouter(): Router {
  const router = Router();

  function resolve(req: Request, res: Response): CollectionName | null {
    const name = req.params.name;
    if (!isCollection(name)) {
      res.status(404).json({ error: `unknown collection: ${name}` });
      return null;
    }
    return name;
  }

  // Reject a write whose document fails its collection schema (422).
  function rejectInvalid(name: CollectionName, doc: unknown, res: Response): boolean {
    const result = validateDoc(name, doc);
    if (!result.ok) {
      res.status(422).json({ error: 'validation_failed', message: result.message, issues: result.issues });
      return true;
    }
    return false;
  }

  async function runList(name: CollectionName, spec: QuerySpec, user: AuthedUser, res: Response) {
    const table = tableFor(name);
    const scope = await listScope(name, user, getSubordinateIds);
    const since = typeof spec.since === 'string' && spec.since !== '' ? spec.since : null;
    const { text, params } = buildWhere(spec, scope);
    const { rows } = await query(`SELECT id, data, version, created_at, updated_at FROM ${table}${text}`, params);

    const body: {
      documents: ReturnType<typeof shape>[];
      cursor: string | null;
      deletions?: { id: string }[];
    } = {
      documents: rows.map((r) => shape(r.id, r.data, r)),
      cursor: maxIso(rows.map((r) => r.updated_at)),
    };

    // On a delta poll, also report hard deletes since the cursor so the client
    // evicts them, and advance the cursor past the newest deletion too.
    if (since) {
      const del = await query('SELECT id, deleted_at FROM tombstones WHERE collection = $1 AND deleted_at > $2', [
        name,
        since,
      ]);
      body.deletions = del.rows.map((r) => ({ id: r.id as string }));
      body.cursor = maxIso([body.cursor, ...del.rows.map((r) => r.deleted_at)]) ?? since;
    }
    res.json(body);
  }

  // LIST (simple equality filters via query string)
  router.get(
    '/:name',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const spec: QuerySpec = {
        where: simpleFilters(req.query as Record<string, unknown>),
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        orderBy: req.query.orderBy
          ? { field: String(req.query.orderBy), direction: req.query.orderDir === 'desc' ? 'desc' : 'asc' }
          : undefined,
      };
      await runList(name, spec, req.user!, res);
    }),
  );

  // QUERY (structured — supports `in` and `or` groups)
  router.post(
    '/:name/query',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const spec = (req.body ?? {}) as QuerySpec;
      await runList(name, spec, req.user!, res);
    }),
  );

  // GET ONE
  router.get(
    '/:name/:id',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const table = tableFor(name);
      const { rows } = await query(
        `SELECT id, data, version, created_at, updated_at FROM ${table} WHERE id = $1`,
        [req.params.id],
      );
      if (!rows.length) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const row = rows[0];
      if (!(await authorize(name, 'read', req.user!, { docId: req.params.id, existing: row.data }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      res.json(shape(row.id, row.data, row));
    }),
  );

  // CREATE (auto-id) — POST /:name  body: { id?, data }
  router.post(
    '/:name',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const id = (req.body?.id as string) || randomUUID();
      const raw = req.body?.data ?? {};
      if (rejectInvalid(name, raw, res)) return; // reject non-objects/bad enums before spreading
      const incoming = { ...(raw as Record<string, any>), id };
      if (!(await authorize(name, 'create', req.user!, { docId: id, incoming }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const { rows } = await query(
        `INSERT INTO ${tableFor(name)} (id, data, created_by) VALUES ($1, $2, $3)
         RETURNING version, created_at, updated_at`,
        [id, incoming, req.user!.id],
      );
      await clearTombstone(query, name, id); // a re-created id must not stay tombstoned
      res.status(201).json(shape(id, incoming, rows[0] ?? {}));
    }),
  );

  // SET (upsert) — PUT /:name/:id  body: { data, expectedVersion? }
  router.put(
    '/:name/:id',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const { id } = req.params;
      const table = tableFor(name);
      const existing = await loadRow(table, id);
      const raw = req.body?.data ?? {};
      if (rejectInvalid(name, raw, res)) return;
      const incoming = { ...(raw as Record<string, any>), id };
      const action: Action = existing ? 'update' : 'create';
      if (!(await authorize(name, action, req.user!, { docId: id, existing: existing?.data, incoming }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const expected = expectedVersionOf(req);
      if (existing && expected !== undefined && expected !== existing.version) {
        res.status(409).json({ error: 'version_conflict', currentVersion: existing.version });
        return;
      }
      const { rows } = await query(
        `INSERT INTO ${table} (id, data, created_by, updated_by) VALUES ($1, $2, $3, $3)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = ${table}.version + 1,
           updated_at = now(), updated_by = $3
         RETURNING version, created_at, updated_at`,
        [id, incoming, req.user!.id],
      );
      await clearTombstone(query, name, id);
      res.json(shape(id, incoming, rows[0] ?? {}));
    }),
  );

  // UPDATE (merge) — PATCH /:name/:id  body: { data, expectedVersion? }
  router.patch(
    '/:name/:id',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const { id } = req.params;
      const table = tableFor(name);
      const existing = await loadRow(table, id);
      if (!existing) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const raw = req.body?.data ?? {};
      if (rejectInvalid(name, raw, res)) return;
      const merged = { ...existing.data, ...(raw as Record<string, any>), id };
      if (!(await authorize(name, 'update', req.user!, { docId: id, existing: existing.data, incoming: merged }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const expected = expectedVersionOf(req);
      if (expected !== undefined && expected !== existing.version) {
        res.status(409).json({ error: 'version_conflict', currentVersion: existing.version });
        return;
      }
      const { rows } = await query(
        `UPDATE ${table} SET data = $2, version = version + 1, updated_at = now(), updated_by = $3
         WHERE id = $1 RETURNING version, created_at, updated_at`,
        [id, merged, req.user!.id],
      );
      res.json(shape(id, merged, rows[0] ?? {}));
    }),
  );

  // DELETE — DELETE /:name/:id
  router.delete(
    '/:name/:id',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const { id } = req.params;
      const table = tableFor(name);
      const existing = await loadRow(table, id);
      if (!existing) {
        res.status(204).end();
        return;
      }
      if (!(await authorize(name, 'delete', req.user!, { docId: id, existing: existing.data }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      const expected = expectedVersionOf(req);
      if (expected !== undefined && expected !== existing.version) {
        res.status(409).json({ error: 'version_conflict', currentVersion: existing.version });
        return;
      }
      await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      await writeTombstone(query, name, id); // let delta clients evict it
      res.status(204).end();
    }),
  );

  return router;
}
