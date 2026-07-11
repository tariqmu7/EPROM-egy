import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { query, withTransaction, type Tx } from '../db.js';
import { can, type Action } from '../authz.js';
import { isCollection, tableFor, type CollectionName } from './registry.js';

// Mirrors Firestore writeBatch: an atomic list of set/update/delete ops.
interface BatchOp {
  type: 'set' | 'update' | 'delete';
  collection: string;
  id: string;
  data?: Record<string, any>;
}

async function getUserDoc(id: string): Promise<Record<string, any> | null> {
  const { rows } = await query('SELECT data FROM users WHERE id = $1', [id]);
  return rows.length ? (rows[0].data as Record<string, any>) : null;
}

export function batchRouter(): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next) => {
    try {
      const ops = (req.body?.operations ?? []) as BatchOp[];
      const user = req.user!;

      if (!Array.isArray(ops) || ops.length === 0) {
        res.status(400).json({ error: 'operations array required' });
        return;
      }
      if (ops.length > 500) {
        res.status(400).json({ error: 'batch too large (max 500)' });
        return;
      }

      // Validate collections + authorize every op BEFORE opening the transaction.
      for (const op of ops) {
        if (!isCollection(op.collection)) {
          res.status(404).json({ error: `unknown collection: ${op.collection}` });
          return;
        }
        const name = op.collection as CollectionName;
        const table = tableFor(name);
        const existing = (await query(`SELECT data FROM ${table} WHERE id = $1`, [op.id])).rows[0]?.data ?? null;
        const action: Action = op.type === 'delete' ? 'delete' : existing ? 'update' : 'create';
        const incoming = op.type === 'delete' ? null : { ...(op.data ?? {}), id: op.id };
        const merged = op.type === 'update' && existing ? { ...existing, ...(op.data ?? {}), id: op.id } : incoming;
        const ok = await can(name, action, { user, getUserDoc, docId: op.id, existing, incoming: merged });
        if (!ok) {
          res.status(403).json({ error: `forbidden: ${op.type} ${op.collection}/${op.id}` });
          return;
        }
      }

      await withTransaction(async (tx: Tx) => {
        for (const op of ops) {
          const table = tableFor(op.collection as CollectionName);
          if (op.type === 'delete') {
            await tx(`DELETE FROM ${table} WHERE id = $1`, [op.id]);
          } else if (op.type === 'set') {
            const incoming = { ...(op.data ?? {}), id: op.id };
            await tx(
              `INSERT INTO ${table} (id, data) VALUES ($1, $2)
               ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
              [op.id, incoming],
            );
          } else {
            // update (merge)
            const existing = (await tx(`SELECT data FROM ${table} WHERE id = $1`, [op.id])).rows[0]?.data ?? {};
            const merged = { ...existing, ...(op.data ?? {}), id: op.id };
            await tx(`UPDATE ${table} SET data = $2, updated_at = now() WHERE id = $1`, [op.id, merged]);
          }
        }
      });

      res.json({ ok: true, count: ops.length });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
