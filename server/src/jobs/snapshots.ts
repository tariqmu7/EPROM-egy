// ============================================================================
// The monthly competency snapshot — the system's memory of its own numbers.
//
// Finding 6 of the analytical-engine review: every figure in this app is
// recomputed live, so nothing could answer "where were we in June?". The only
// trend on offer was AdminAnalytics replaying assessment records in the
// browser, which counted a never-assessed skill as a full gap and ignored
// evidence and work-experience scores entirely — a line that disagreed with
// every other screen.
//
// This writes one row per scope per month (migration 008), computed with the
// SAME scoring brain the pages use (scoring.ts, the port of computeSkillScore).
//
// Two design rules:
//   • IDEMPOTENT. The nightly sweep calls this every night; the row for the
//     current month is refreshed in place, never appended to. So a month's
//     stored point settles on the last reading taken during that month, and the
//     current month is always live. Re-running the job twice changes nothing.
//   • NO PERCENTAGE WITHOUT ITS BASE. `compliancePct` and `avgGap` are stored
//     NULL when nothing is known, exactly as `finalizeCoverage` returns them.
//     Writing 0 would reinstate the "unmeasured looks like failure" lie this
//     workstream exists to remove.
//
// Departments are rolled UP (a unit's row covers its whole subtree), matching
// `generateDepartmentalTNA` — a GM or general department has no direct members
// at all, its people sit in sections underneath.
// ============================================================================
import { randomUUID } from 'node:crypto';
import { query } from '../db.js';
import { ancestorChain, loadAnalyticsModel } from '../analytics/model.js';
import { monthKey } from './scheduling.js';
import { accumulate, finalizeCoverage, newCoverageAccumulator, skillScore, type ScoringIndex } from './scoring.js';

export interface SnapshotSummary {
  period: string;
  scopesWritten: number;
  /** Employees whose job profile carries at least one live requirement. */
  withRequirements: number;
  ms: number;
}

interface SkillGapTally {
  skillId: string;
  skillName: string;
  gapCount: number;
  totalGap: number;
  unknown: number;
}

interface ScopeAccumulator {
  scopeType: 'COMPANY' | 'DEPARTMENT';
  scopeId: string;
  scopeName: string | null;
  headcount: number;
  withRequirements: number;
  coverage: ReturnType<typeof newCoverageAccumulator>;
  skills: Map<string, SkillGapTally>;
}

function newScope(scopeType: ScopeAccumulator['scopeType'], scopeId: string, scopeName: string | null): ScopeAccumulator {
  return {
    scopeType,
    scopeId,
    scopeName,
    headcount: 0,
    withRequirements: 0,
    coverage: newCoverageAccumulator(),
    skills: new Map(),
  };
}

function tally(scope: ScopeAccumulator, skillId: string, skillName: string, gap: number, unknown: boolean): void {
  let row = scope.skills.get(skillId);
  if (!row) {
    row = { skillId, skillName, gapCount: 0, totalGap: 0, unknown: 0 };
    scope.skills.set(skillId, row);
  }
  if (unknown) row.unknown++;
  else if (gap > 0) {
    row.gapCount++;
    row.totalGap += gap;
  }
}

/** Writes (or refreshes) one scope's row for the period. UPDATE-then-INSERT
 *  rather than ON CONFLICT: pg-mem, the server test harness, does not support
 *  conflict-target inference on a unique index. */
async function persist(
  scope: ScopeAccumulator,
  period: string,
  takenAt: Date,
  detailExtra: Record<string, unknown> = {},
): Promise<void> {
  const c = finalizeCoverage(scope.coverage);
  const detail = {
    topSkillGaps: [...scope.skills.values()]
      .filter((s) => s.totalGap > 0 || s.unknown > 0)
      .sort((a, b) => b.totalGap - a.totalGap || b.unknown - a.unknown)
      .slice(0, 10),
    ...detailExtra,
  };

  const values = [
    period,
    scope.scopeType,
    scope.scopeId,
    scope.scopeName,
    takenAt.toISOString(),
    scope.headcount,
    scope.withRequirements,
    c.required,
    c.measured,
    c.provisional,
    c.unknown,
    c.compliantKnown,
    c.gapsKnown,
    c.totalGap,
    c.compliancePct,
    c.avgGap,
    c.measuredPct,
    JSON.stringify(detail),
  ];

  const updated = await query(
    `UPDATE competency_snapshots
        SET scope_name = $4, taken_at = $5, headcount = $6, with_requirements = $7,
            required = $8, measured = $9, provisional = $10, unknown = $11,
            compliant_known = $12, gaps_known = $13, total_gap = $14,
            compliance_pct = $15, avg_gap = $16, measured_pct = $17, detail = $18
      WHERE period = $1 AND scope_type = $2 AND scope_id = $3`,
    values,
  );
  if ((updated.rowCount ?? 0) > 0) return;

  await query(
    `INSERT INTO competency_snapshots
       (id, period, scope_type, scope_id, scope_name, taken_at, headcount, with_requirements,
        required, measured, provisional, unknown, compliant_known, gaps_known, total_gap,
        compliance_pct, avg_gap, measured_pct, detail)
     VALUES ($19, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
    [...values, randomUUID()],
  );
}

/**
 * Builds and stores this month's snapshot for the company and every department
 * that has people in it. Called by the nightly sweep; safe to call repeatedly.
 */
export async function runMonthlySnapshot(
  opts: {
    now?: Date;
    /** Scoring inputs to use INSTEAD of the model's live index. The nightly
     *  sweep never passes this; a back-fill passes an index whose assessments
     *  and evidence are filtered to a cut-off date, so an old month is scored
     *  on what was actually known then rather than on today's records. */
    index?: ScoringIndex;
    /** Merged into every written row's `detail` (a back-fill marks itself). */
    detailExtra?: Record<string, unknown>;
  } = {},
): Promise<SnapshotSummary> {
  const now = opts.now ?? new Date();
  const startedMs = Date.now();
  const period = monthKey(now);

  // One load, one set of indexes — shared with the live aggregate endpoints
  // (analytics/model.ts), so a stored point and the figure on screen can never
  // be computed from differently-shaped inputs.
  const model = await loadAnalyticsModel();
  const { users, jobRequirements, skillNames, deptParents, deptNames } = model;
  const index = opts.index ?? model.index;
  const detailExtra = opts.detailExtra ?? {};


  const company = newScope('COMPANY', '*', 'Whole company');
  const departments = new Map<string, ScopeAccumulator>();
  const scopeFor = (deptId: string): ScopeAccumulator => {
    let s = departments.get(deptId);
    if (!s) {
      s = newScope('DEPARTMENT', deptId, deptNames.get(deptId) ?? null);
      departments.set(deptId, s);
    }
    return s;
  };

  let withRequirements = 0;
  for (const user of users) {
    // A unit's row covers its whole subtree, so walking each person's ancestor
    // chain once is the roll-up (and is O(people × depth), not O(units × people)).
    const scopes: ScopeAccumulator[] = [company];
    if (user.departmentId) {
      for (const deptId of ancestorChain(user.departmentId, deptParents)) scopes.push(scopeFor(deptId));
    }
    for (const s of scopes) s.headcount++;

    const requirements = user.jobProfileId ? jobRequirements.get(user.jobProfileId) : undefined;
    if (!requirements || requirements.length === 0) continue;
    withRequirements++;
    for (const s of scopes) s.withRequirements++;

    for (const req of requirements) {
      const { score, source } = skillScore(user, req.skillId, index);
      const name = skillNames.get(req.skillId) ?? req.skillId;
      for (const s of scopes) {
        const gap = accumulate(s.coverage, req.requiredLevel, score, source);
        tally(s, req.skillId, name, gap, source === 'NONE');
      }
    }
  }

  await persist(company, period, now, detailExtra);
  for (const scope of departments.values()) {
    // Empty units are skipped: a row of zeroes is not a measurement, and a
    // company with 129 departments would otherwise bury the real ones.
    if (scope.headcount === 0) continue;
    await persist(scope, period, now, detailExtra);
  }

  return {
    period,
    scopesWritten: 1 + [...departments.values()].filter((s) => s.headcount > 0).length,
    withRequirements,
    ms: Date.now() - startedMs,
  };
}
