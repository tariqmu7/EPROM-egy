import { Router, type Request, type Response } from 'express';
import { withTransaction, type Tx } from '../db.js';
import { can, type Action } from '../authz.js';
import { isCollection, tableFor, type CollectionName } from './registry.js';
import { validateDoc } from './schemas.js';
import { writeTombstone, clearTombstone } from './tombstones.js';
import { recordAudit, requestIdOf, stampClientLog, type AuditEntry } from '../audit/log.js';

// Mirrors Firestore writeBatch: an atomic list of set/update/delete ops.
interface BatchOp {
  type: 'set' | 'update' | 'delete';
  collection: string;
  id: string;
  data?: Record<string, any>;
}

// Sentinel thrown from inside the transaction to reject the whole batch with a
// specific HTTP status. Throwing rolls the transaction back (all-or-nothing), so
// a single forbidden/invalid op can never partially apply.
class BatchReject extends Error {
  constructor(
    public status: number,
    public payload: Record<string, unknown>,
  ) {
    super('batch_rejected');
    this.name = 'BatchReject';
  }
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

      // Phase 1 — state-INDEPENDENT checks (collection name + document shape).
      // Cheap to reject here before opening a transaction; nothing below depends
      // on DB state, so it's safe to do outside the tx.
      for (const op of ops) {
        if (!isCollection(op.collection)) {
          res.status(404).json({ error: `unknown collection: ${op.collection}` });
          return;
        }
        if (op.type !== 'delete') {
          const v = validateDoc(op.collection as CollectionName, op.data ?? {});
          if (!v.ok) {
            res.status(422).json({ error: 'validation_failed', op: `${op.type} ${op.collection}/${op.id}`, message: v.message });
            return;
          }
        }
      }

      // A browser-written log note carries the session's identity and the
      // server's clock, whatever it arrived with (R9).
      for (const op of ops) {
        if (op.type === 'set') op.data = stampClientLog(op.collection, op.data ?? {}, user);
      }

      // Phase 2 — authorize AND apply inside ONE transaction, in two passes:
      //   Pass 1 authorizes every op against the transactional snapshot (the same
      //     committed state the writes will act on — this is what closes the
      //     check-then-act gap of authorizing on a PRE-transaction read, F-7).
      //   Pass 2 applies the writes.
      // Splitting the passes means no write happens until EVERY op has passed
      // authorization, so a forbidden op can't leave an earlier authorized op
      // applied even on an engine that doesn't roll back (belt-and-braces beyond
      // the transaction's own atomicity). Pass 1 reads each row FOR UPDATE, so
      // the rows a batch authorized cannot change before pass 2 writes them: a
      // concurrent single-doc write waits for the commit and then fails its
      // version compare-and-swap and retries on the batch's result (routes.ts),
      // instead of one silently undoing the other.
      //
      // Pass 1 authorizes each op against the COMPOSED state — what the batch's
      // earlier ops will have made of the data — not against the pre-batch rows
      // (R6). Checking every op against the original let two edits that are each
      // fine alone combine into one that is not: a manager holding a PEER score
      // on their own report could send {subjectId: <a stranger>} and
      // {type: 'MANAGER'} as two updates of the same doc — each passes against
      // the original, together they store a 60%-weight score on someone they do
      // not supervise. `composed` is a working copy that pass 1 advances op by op
      // exactly as pass 2 will write, and the authz lookups read through it too.
      try {
        await withTransaction(async (tx: Tx) => {
          const composed = new Map<string, Record<string, any> | null>();
          const keyOf = (table: string, id: string) => `${table}/${id}`;
          // First touch reads the committed row (FOR UPDATE, see above); every
          // later touch in this batch sees what the earlier ops left behind.
          const current = async (table: string, id: string): Promise<Record<string, any> | null> => {
            const key = keyOf(table, id);
            if (!composed.has(key)) {
              const { rows } = await tx(`SELECT data FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
              composed.set(key, rows.length ? (rows[0].data as Record<string, any>) : null);
            }
            return composed.get(key) ?? null;
          };

          // Read helpers for manager-of/ancestor checks, bound to THIS tx and to
          // the composed state, so authz sees what the writes will produce.
          const getUserDoc = (id: string) => current(tableFor('users'), id);
          const getDepartmentDoc = (id: string) => current(tableFor('departments'), id);

          // What each op did, for the audit rows written with the changes (R9).
          const audits: AuditEntry[] = [];

          // Pass 1: authorize everything first, advancing the composed state.
          for (const op of ops) {
            const name = op.collection as CollectionName;
            const table = tableFor(name);
            const existing = await current(table, op.id);
            const action: Action = op.type === 'delete' ? 'delete' : existing ? 'update' : 'create';
            const incoming = op.type === 'delete' ? null : { ...(op.data ?? {}), id: op.id };
            const merged = op.type === 'update' && existing ? { ...existing, ...(op.data ?? {}), id: op.id } : incoming;

            const ok = await can(name, action, { user, getUserDoc, getDepartmentDoc, docId: op.id, existing, incoming: merged });
            if (!ok) {
              throw new BatchReject(403, { error: `forbidden: ${op.type} ${op.collection}/${op.id}` });
            }

            // What pass 2 will leave in the row. An update of a missing row
            // writes nothing there (UPDATE matches no row), so it stays absent.
            const after = op.type === 'delete' ? null : op.type === 'set' ? incoming : existing ? merged : null;
            composed.set(keyOf(table, op.id), after);
            if (existing || after) {
              audits.push({
                action: op.type === 'delete' ? 'delete' : existing ? 'update' : 'create',
                collection: name,
                docId: op.id,
                before: existing,
                after,
              });
            }
          }

          // Pass 2: apply. Updates re-read `existing` here so two ops touching the
          // same id in one batch compose correctly (mirrors the single-doc path).
          for (const op of ops) {
            const table = tableFor(op.collection as CollectionName);
            if (op.type === 'delete') {
              await tx(`DELETE FROM ${table} WHERE id = $1`, [op.id]);
              await writeTombstone(tx, op.collection, op.id);
            } else if (op.type === 'set') {
              const incoming = { ...(op.data ?? {}), id: op.id };
              await tx(
                `INSERT INTO ${table} (id, data, created_by, updated_by) VALUES ($1, $2, $3, $3)
                 ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, version = ${table}.version + 1,
                   updated_at = now(), updated_by = $3`,
                [op.id, incoming, user.id],
              );
              await clearTombstone(tx, op.collection, op.id);
            } else {
              const existing = (await tx(`SELECT data FROM ${table} WHERE id = $1`, [op.id])).rows[0]?.data ?? {};
              const merged = { ...existing, ...(op.data ?? {}), id: op.id };
              await tx(
                `UPDATE ${table} SET data = $2, version = version + 1, updated_at = now(), updated_by = $3 WHERE id = $1`,
                [op.id, merged, user.id],
              );
            }
          }

          // Inside the same transaction: the batch and its audit rows commit together.
          for (const entry of audits) await recordAudit(tx, user, entry, requestIdOf(req));
        });
      } catch (e) {
        if (e instanceof BatchReject) {
          res.status(e.status).json(e.payload);
          return;
        }
        throw e;
      }

      res.json({ ok: true, count: ops.length });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
