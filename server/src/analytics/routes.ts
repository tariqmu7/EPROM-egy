// ============================================================================
// /analytics — the derived-numbers surface:
//   • /snapshots      the stored monthly history (migration 008)
//   • /overview       the live coverage picture for a scope (CEO dashboard)
//   • /training-needs the live TNA for a scope (Training Needs screen)
//
// Like /jobs, none of this is part of the generic /col surface: it is
// server-owned derived data, not documents (no registry entry, no zod schema,
// no delta sync, no version column).
//
// Why the live ones exist (finding 7): both figures used to be computed in the
// browser, which meant downloading every user, assessment, evidence and work
// experience in the company to render one page. Here the same maths runs once,
// beside the data, and the page receives a few kilobytes of answer.
//
// Gate: /snapshots and /overview are executive reads — ADMIN or CEO, the
// boundary `canReadAll` draws in authz.ts. /training-needs is also a manager's
// tool, so it accepts a manager asking about their OWN team or a unit they run;
// `resolveScope` is what enforces that, and it refuses anything else.
// ============================================================================
import { Router, type Request, type Response } from 'express';
import { isAdmin } from '../authz.js';
import { query } from '../db.js';
import { getAnalyticsModel } from './model.js';
import { orgOverview, resolveScope, trainingNeeds, ScopeDenied, type ScopeViewer } from './aggregate.js';

const h =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: (e?: unknown) => void) =>
    fn(req, res).catch(next);

function requireOrgReader(req: Request, res: Response): boolean {
  if (req.user && (isAdmin(req.user) || req.user.role === 'CEO')) return true;
  res.status(403).json({ error: 'admin or CEO only' });
  return false;
}

/** The viewer as the scope resolver sees them: their canonical id (what
 *  `managerId` points at) and whether they may look at the whole company. */
function viewerOf(req: Request): ScopeViewer {
  const user = req.user!;
  const canonical = (user.data as Record<string, unknown> | undefined)?.id;
  return {
    id: String(canonical ?? user.id),
    orgWide: isAdmin(user) || user.role === 'CEO',
  };
}

/** Numeric columns come back from pg as strings (NUMERIC) — and as NULL when
 *  nothing was known, which the client must keep as null, never 0. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function analyticsRouter(): Router {
  const router = Router();

  // One scope's history, oldest month first (the order a trend chart wants).
  //   GET /analytics/snapshots                       → whole company
  //   GET /analytics/snapshots?scopeId=<deptId>      → that unit, rolled up
  router.get(
    '/snapshots',
    h(async (req, res) => {
      if (!requireOrgReader(req, res)) return;

      const scopeId = String(req.query.scopeId ?? '').trim();
      const scopeType = scopeId === '' || scopeId === '*' ? 'COMPANY' : 'DEPARTMENT';
      const months = Math.min(Math.max(Number(req.query.months ?? 24) || 24, 1), 120);

      const { rows } = await query(
        `SELECT period, scope_type, scope_id, scope_name, taken_at, headcount, with_requirements,
                required, measured, provisional, unknown, compliant_known, gaps_known, total_gap,
                compliance_pct, avg_gap, measured_pct, detail
           FROM competency_snapshots
          WHERE scope_type = $1 AND scope_id = $2
          ORDER BY period DESC
          LIMIT ${months}`,
        [scopeType, scopeType === 'COMPANY' ? '*' : scopeId],
      );

      res.json({
        scopeType,
        scopeId: scopeType === 'COMPANY' ? '*' : scopeId,
        snapshots: rows
          .map((r) => ({
            period: r.period,
            scopeType: r.scope_type,
            scopeId: r.scope_id,
            scopeName: r.scope_name,
            takenAt: r.taken_at,
            headcount: Number(r.headcount ?? 0),
            withRequirements: Number(r.with_requirements ?? 0),
            required: Number(r.required ?? 0),
            measured: Number(r.measured ?? 0),
            provisional: Number(r.provisional ?? 0),
            unknown: Number(r.unknown ?? 0),
            compliantKnown: Number(r.compliant_known ?? 0),
            gapsKnown: Number(r.gaps_known ?? 0),
            totalGap: Number(r.total_gap ?? 0),
            measuredPct: Number(r.measured_pct ?? 0),
            // Kept NULLABLE end to end: "nothing measured" is not "0%".
            compliancePct: num(r.compliance_pct),
            avgGap: num(r.avg_gap),
            detail: r.detail ?? null,
          }))
          // Chronological for the caller; the LIMIT above needed the newest.
          .reverse(),
      });
    }),
  );

  // The live executive picture for one scope: pooled coverage, a department
  // roll-up and one row per person — everything CEOPanel used to assemble by
  // calling getGroupCoverage once and getUserCoverage per employee.
  //   GET /analytics/overview                  → whole company
  //   GET /analytics/overview?scope=<deptId>   → that unit, rolled up
  router.get(
    '/overview',
    h(async (req, res) => {
      if (!requireOrgReader(req, res)) return;
      const model = await getAnalyticsModel();
      try {
        const scope = resolveScope(model, viewerOf(req), {
          scope: req.query.scope === undefined ? undefined : String(req.query.scope),
          includeSubUnits: req.query.includeSubUnits !== 'false',
        });
        res.json(orgOverview(model, scope));
      } catch (err) {
        if (err instanceof ScopeDenied) return void res.status(403).json({ error: err.message });
        throw err;
      }
    }),
  );

  // The live TNA for one scope. Also a manager's screen, so the scope rules —
  // not the role — decide what may be asked for.
  //   GET /analytics/training-needs?scope=company|team|<deptId>[&includeSubUnits=false]
  router.get(
    '/training-needs',
    h(async (req, res) => {
      const model = await getAnalyticsModel();
      try {
        const scope = resolveScope(model, viewerOf(req), {
          scope: req.query.scope === undefined ? undefined : String(req.query.scope),
          includeSubUnits: req.query.includeSubUnits !== 'false',
        });
        res.json({ scope: { kind: scope.kind, id: scope.id, label: scope.label }, ...trainingNeeds(model, scope.userIds) });
      } catch (err) {
        if (err instanceof ScopeDenied) return void res.status(403).json({ error: err.message });
        throw err;
      }
    }),
  );

  return router;
}
