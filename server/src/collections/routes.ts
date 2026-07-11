import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { query } from '../db.js';
import { can, listScope, type Action } from '../authz.js';
import type { AuthedUser } from '../types.js';
import { isCollection, tableFor, type CollectionName } from './registry.js';
import { buildWhere, type Filter, type QuerySpec } from './query.js';

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

async function loadDoc(table: string, id: string): Promise<Record<string, any> | null> {
  const { rows } = await query(`SELECT data FROM ${table} WHERE id = $1`, [id]);
  return rows.length ? (rows[0].data as Record<string, any>) : null;
}

function ctxBase(user: AuthedUser) {
  return { user, getUserDoc };
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

  async function runList(name: CollectionName, spec: QuerySpec, user: AuthedUser, res: Response) {
    const table = tableFor(name);
    const scope = await listScope(name, user, getSubordinateIds);
    const { text, params } = buildWhere(spec, scope);
    const { rows } = await query(`SELECT id, data FROM ${table}${text}`, params);
    res.json({ documents: rows.map((r) => ({ id: r.id, data: r.data })) });
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
      const existing = await loadDoc(tableFor(name), req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      if (!(await authorize(name, 'read', req.user!, { docId: req.params.id, existing }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      res.json({ id: req.params.id, data: existing });
    }),
  );

  // CREATE (auto-id) — POST /:name  body: { id?, data }
  router.post(
    '/:name',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const id = (req.body?.id as string) || randomUUID();
      const incoming = { ...(req.body?.data ?? {}), id };
      if (!(await authorize(name, 'create', req.user!, { docId: id, incoming }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      await query(`INSERT INTO ${tableFor(name)} (id, data) VALUES ($1, $2)`, [id, incoming]);
      res.status(201).json({ id, data: incoming });
    }),
  );

  // SET (upsert) — PUT /:name/:id  body: { data }
  router.put(
    '/:name/:id',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const { id } = req.params;
      const table = tableFor(name);
      const existing = await loadDoc(table, id);
      const incoming = { ...(req.body?.data ?? {}), id };
      const action: Action = existing ? 'update' : 'create';
      if (!(await authorize(name, action, req.user!, { docId: id, existing, incoming }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      await query(
        `INSERT INTO ${table} (id, data) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [id, incoming],
      );
      res.json({ id, data: incoming });
    }),
  );

  // UPDATE (merge) — PATCH /:name/:id  body: { data }
  router.patch(
    '/:name/:id',
    h(async (req, res) => {
      const name = resolve(req, res);
      if (!name) return;
      const { id } = req.params;
      const table = tableFor(name);
      const existing = await loadDoc(table, id);
      if (!existing) {
        res.status(404).json({ error: 'not found' });
        return;
      }
      const merged = { ...existing, ...(req.body?.data ?? {}), id };
      if (!(await authorize(name, 'update', req.user!, { docId: id, existing, incoming: merged }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      await query(`UPDATE ${table} SET data = $2, updated_at = now() WHERE id = $1`, [id, merged]);
      res.json({ id, data: merged });
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
      const existing = await loadDoc(table, id);
      if (!existing) {
        res.status(204).end();
        return;
      }
      if (!(await authorize(name, 'delete', req.user!, { docId: id, existing }))) {
        res.status(403).json({ error: 'forbidden' });
        return;
      }
      await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
      res.status(204).end();
    }),
  );

  return router;
}
