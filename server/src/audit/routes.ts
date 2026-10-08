// ============================================================================
// GET /audit — read the server's audit log (finding R9, migration 010).
//
// Admin/CEO only: the log names who changed whose record, and carries the
// before/after of scores and profiles. There is deliberately no write route —
// rows are added only by the write paths themselves (audit/log.ts).
//
//   ?limit=N          newest N rows (default 100, max 500)
//   ?before=<iso>     rows strictly older than this time
//   ?beforeId=<id>    the page after a previous one: pass back the response's
//                     `next.beforeId`. Rows of one batch share one timestamp
//                     (the transaction's start), so paging by time alone would
//                     skip the rest of a batch cut at a page edge; ordering by
//                     (at, id) from that row's OWN stored time cannot, and keeps
//                     the database's microseconds a JS Date would round off.
//   ?collection=…&docId=…   one record's history
//   ?actorId=<id>     one person's actions (canonical user id)
// ============================================================================
import { Router, type Request, type Response } from 'express';
import { canReadAll } from '../authz.js';
import { query } from '../db.js';

const h =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: (e?: unknown) => void) =>
    fn(req, res).catch(next);

const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);

export function auditRouter(): Router {
  const router = Router();

  router.get(
    '/',
    h(async (req, res) => {
      if (!req.user || !canReadAll(req.user)) {
        res.status(403).json({ error: 'admin or CEO only' });
        return;
      }
      const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
      const where: string[] = [];
      const params: unknown[] = [];
      const add = (sql: string, value: unknown) => {
        params.push(value);
        where.push(`${sql} $${params.length}`);
      };
      const before = str(req.query.before);
      if (before) {
        if (Number.isNaN(Date.parse(before))) {
          res.status(400).json({ error: 'before must be an ISO date-time' });
          return;
        }
        add('at <', before);
      }
      const beforeId = str(req.query.beforeId);
      if (beforeId) {
        params.push(beforeId);
        const p = `$${params.length}`;
        const t = `(SELECT at FROM audit_log WHERE id = ${p})`;
        where.push(`(at < ${t} OR (at = ${t} AND id < ${p}))`);
      }
      const collection = str(req.query.collection);
      if (collection) add('collection =', collection);
      const docId = str(req.query.docId);
      if (docId) add('doc_id =', docId);
      const actorId = str(req.query.actorId);
      if (actorId) add('actor_cid =', actorId);

      const { rows } = await query(
        `SELECT id, at, actor_cid, actor_name, actor_email, action, collection, doc_id, changes, request_id
           FROM audit_log${where.length ? ` WHERE ${where.join(' AND ')}` : ''}
          ORDER BY at DESC, id DESC
          LIMIT ${limit}`,
        params,
      );
      // A full page may have more behind it; a short one is the end.
      const last = rows.length === limit ? rows[rows.length - 1] : null;
      res.json({
        next: last ? { beforeId: last.id } : null,
        entries: rows.map((r) => ({
          id: r.id,
          at: r.at instanceof Date ? r.at.toISOString() : r.at,
          actorId: r.actor_cid,
          actorName: r.actor_name,
          actorEmail: r.actor_email,
          action: r.action,
          collection: r.collection,
          docId: r.doc_id,
          changes: r.changes ?? {},
          requestId: r.request_id,
        })),
      });
    }),
  );

  return router;
}
