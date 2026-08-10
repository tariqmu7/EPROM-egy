// ============================================================================
// Server-side AGGREGATES — the live figures the CEO and TNA screens used to
// compute in the browser (finding 7).
//
// Two aggregates, both over an explicit set of employees:
//   • `trainingNeeds`  — one row per skill: who needs it, how many we measured,
//                        how many fall short and by how much. Port of
//                        `generateTrainingNeedsAnalysis` in src/services/store.ts.
//   • `orgOverview`    — the pooled coverage plus a per-department and a
//                        per-person breakdown. What CEOPanel assembled by
//                        calling getGroupCoverage / getUserCoverage in a loop.
//
// PARITY (the rule this workstream keeps): the numbers come from
// `jobs/scoring.ts` — the same brain the monthly snapshot uses and a faithful
// port of `computeSkillScore`. Two rules travel with them:
//   • A never-assessed requirement is UNKNOWN, not a gap. It never reaches a
//     compliance figure, never inflates a priority, and is reported separately.
//   • No percentage without its base: `compliancePct` / `affectedPct` are NULL
//     when nothing is known, never 0.
// Change a rule here and you change it in the store too — or the page and the
// endpoint start disagreeing, which is worse than either being wrong alone.
// ============================================================================
import {
  accumulate,
  finalizeCoverage,
  newCoverageAccumulator,
  skillScore,
  type Coverage,
} from '../jobs/scoring.js';
import {
  DEFAULT_SKILL_CRITICALITY,
  SKILL_CRITICALITY_WEIGHTS,
  type SkillCriticality,
} from '../domain/enums.js';
import { ancestorChain, subtreeIds, type AnalyticsModel, type CourseRef } from './model.js';

// ── Scope resolution ────────────────────────────────────────────────────────

export type ScopeKind = 'COMPANY' | 'DEPARTMENT' | 'TEAM';

export interface ResolvedScope {
  kind: ScopeKind;
  /** '*' for the company, the department id, or the manager's own id for a team. */
  id: string;
  label: string;
  userIds: string[];
}

export interface ScopeViewer {
  /** Canonical user id — what `managerId` and every activity document keys off. */
  id: string;
  orgWide: boolean;
}

/** Departments this person manages directly, restricted to the unit types that
 *  make their members direct reports. Port of `getSubordinates`' dept rule —
 *  a GENERAL-department owner must not inherit a whole org branch as reports. */
const REPORTING_DEPT_TYPES = new Set(['ASSISTANT_GENERAL', 'DEPARTMENT', 'SECTION']);

function managedDeptIds(model: AnalyticsModel, managerId: string): Set<string> {
  const out = new Set<string>();
  for (const [deptId, mgr] of model.deptManagers) {
    if (mgr === managerId && REPORTING_DEPT_TYPES.has(model.deptTypes.get(deptId) ?? '')) out.add(deptId);
  }
  return out;
}

/** Everyone reporting to this person, directly or transitively. Port of
 *  `getSubordinatesRecursive`; cycle-safe, and never includes the manager. */
export function subordinateIds(model: AnalyticsModel, managerId: string): string[] {
  const found = new Set<string>();
  const visited = new Set<string>();
  const walk = (mgr: string) => {
    if (visited.has(mgr)) return;
    visited.add(mgr);
    const depts = managedDeptIds(model, mgr);
    for (const u of model.users) {
      if (u.id === mgr || found.has(u.id)) continue;
      if (u.managerId === mgr || (u.departmentId && depts.has(u.departmentId))) {
        found.add(u.id);
        walk(u.id);
      }
    }
  };
  walk(managerId);
  found.delete(managerId);
  return [...found];
}

/** Units the viewer may analyse: everything for an org-wide reader, otherwise
 *  the subtree under any unit they manage. */
export function analysableDeptIds(model: AnalyticsModel, viewer: ScopeViewer): Set<string> {
  if (viewer.orgWide) return new Set(model.deptParents.keys());
  const out = new Set<string>();
  for (const [deptId, mgr] of model.deptManagers) {
    if (mgr !== viewer.id) continue;
    for (const id of subtreeIds(deptId, model.deptParents)) out.add(id);
  }
  return out;
}

export class ScopeDenied extends Error {}

/**
 * Turns a request's scope parameters into a concrete employee list, refusing
 * anything the viewer is not entitled to see.
 *
 *   scope omitted / 'company'  → whole company (org-wide readers only)
 *   scope = 'team'             → the caller's own reporting tree
 *   scope = <departmentId>     → that unit, by default including its sub-units
 */
export function resolveScope(
  model: AnalyticsModel,
  viewer: ScopeViewer,
  params: { scope?: string; includeSubUnits?: boolean },
): ResolvedScope {
  const raw = (params.scope ?? '').trim();
  const includeSubUnits = params.includeSubUnits !== false;

  if (raw === '' || raw === '*' || raw.toLowerCase() === 'company') {
    if (!viewer.orgWide) throw new ScopeDenied('company-wide analysis is admin/CEO only');
    return { kind: 'COMPANY', id: '*', label: 'Whole company', userIds: model.users.map((u) => u.id) };
  }

  if (raw.toLowerCase() === 'team') {
    return {
      kind: 'TEAM',
      id: viewer.id,
      label: 'My team',
      userIds: subordinateIds(model, viewer.id),
    };
  }

  if (!model.deptParents.has(raw)) throw new ScopeDenied('unknown department');
  if (!analysableDeptIds(model, viewer).has(raw)) throw new ScopeDenied('not your unit');

  const scope = includeSubUnits ? subtreeIds(raw, model.deptParents) : new Set([raw]);
  const name = model.deptNames.get(raw) ?? raw;
  return {
    kind: 'DEPARTMENT',
    id: raw,
    label: name + (includeSubUnits ? ' (incl. sub-units)' : ' (direct members only)'),
    userIds: model.users.filter((u) => !!u.departmentId && scope.has(u.departmentId)).map((u) => u.id),
  };
}

// ── Training needs ──────────────────────────────────────────────────────────

export interface TrainingNeedRow {
  skillId: string;
  skillName: string;
  skillCategory?: string;
  employeesRequiring: number;
  measured: number;
  provisional: number;
  unknown: number;
  known: number;
  gapCount: number;
  totalGap: number;
  averageGap: number;
  averageGapKnown: number;
  maxRequiredLevel: number;
  affectedPct: number | null;
  criticality: SkillCriticality;
  criticalityWeight: number;
  weightedGap: number;
  priorityScore: number | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  seatCost: number | null;
  estimatedCost: number | null;
  estimatedHours: number | null;
  courses: CourseRef[];
}

export interface TrainingBudgetEstimate {
  skillsCosted: number;
  skillsUncosted: number;
  seatsCosted: number;
  seatsUncosted: number;
  estimatedCost: number | null;
  estimatedHours: number | null;
}

export interface TrainingNeedsResult {
  headcount: number;
  withRequirements: number;
  coverage: Coverage;
  budget: TrainingBudgetEstimate;
  needs: TrainingNeedRow[];
}

// ── Weighting (finding 9: every gap used to weigh the same) ─────────────────
//
// Two different questions, two different numbers, both on every row:
//
//   weightedGap   = totalGap × criticality weight.  HOW BIG the job is —
//                   head count × depth × how much it matters. The list is
//                   SORTED by this, so the top of the page is where the money
//                   should go first.
//   priorityScore = 100 × (share of the measured who fall short)
//                       × (depth, capped at a 2-level gap)
//                       × criticality weight.       HOW URGENT it is,
//                   independent of unit size, which is what the pill shows.
//
// The bands (50 / 20) are set so a STANDARD skill with a full-depth gap
// reproduces the old share-of-measured rule exactly — criticality moves rows,
// it does not re-scale everything. The old rule that survives untouched: a
// skill nobody has measured has no share, so `priorityScore` is NULL and the
// priority is LOW. Silence can never manufacture a HIGH.
const FULL_DEPTH_GAP = 2;

function priorityFromScore(score: number | null): TrainingNeedRow['priority'] {
  if (score === null) return 'LOW';
  if (score >= 50) return 'HIGH';
  if (score >= 20) return 'MEDIUM';
  return 'LOW';
}

/** The cheapest priced course linked to a skill — the basis for its line item.
 *  Cheapest, not first, so an estimate is the floor of what it could cost. */
function costBasis(courses: CourseRef[]): CourseRef | null {
  let best: CourseRef | null = null;
  for (const c of courses) {
    if (typeof c.costPerSeat !== 'number') continue;
    if (!best || c.costPerSeat < (best.costPerSeat as number)) best = c;
  }
  return best;
}

interface NeedTally {
  skillId: string;
  skillName: string;
  skillCategory?: string;
  employeesRequiring: number;
  measured: number;
  provisional: number;
  unknown: number;
  gapCount: number;
  totalGap: number;
  maxRequiredLevel: number;
}

export function trainingNeeds(model: AnalyticsModel, userIds: string[]): TrainingNeedsResult {
  const rows = new Map<string, NeedTally>();
  const pooled = newCoverageAccumulator();
  let withRequirements = 0;

  for (const userId of userIds) {
    const user = model.usersById.get(userId);
    const requirements = user?.jobProfileId ? model.jobRequirements.get(user.jobProfileId) : undefined;
    if (!user || !requirements) continue;
    if (requirements.length > 0) withRequirements++;

    for (const req of requirements) {
      let row = rows.get(req.skillId);
      if (!row) {
        row = {
          skillId: req.skillId,
          skillName: model.skillNames.get(req.skillId) ?? req.skillId,
          skillCategory: model.skillCategories.get(req.skillId),
          employeesRequiring: 0, measured: 0, provisional: 0, unknown: 0,
          gapCount: 0, totalGap: 0, maxRequiredLevel: 0,
        };
        rows.set(req.skillId, row);
      }
      row.employeesRequiring++;
      row.maxRequiredLevel = Math.max(row.maxRequiredLevel, req.requiredLevel);

      const { score, source } = skillScore(user, req.skillId, model.index);
      const gap = accumulate(pooled, req.requiredLevel, score, source);

      if (source === 'NONE') {
        row.unknown++; // never assessed ⇒ an assessment need, not a training need
        continue;
      }
      if (source === 'EXPERIENCE') row.provisional++;
      else row.measured++;
      if (gap > 0) {
        row.gapCount++;
        row.totalGap += gap;
      }
    }
  }

  const needs: TrainingNeedRow[] = [...rows.values()]
    // A skill everybody already meets, with nothing left unmeasured, is not a
    // need — it stays off the list so the page shows work, not noise.
    .filter((r) => r.gapCount > 0 || r.unknown > 0)
    .map((r) => {
      const known = r.measured + r.provisional;
      const affectedPct = known > 0 ? Math.round((r.gapCount / known) * 100) : null;
      const averageGap = r.gapCount > 0 ? r.totalGap / r.gapCount : 0;

      const criticality = model.skillCriticalities.get(r.skillId) ?? DEFAULT_SKILL_CRITICALITY;
      const criticalityWeight = SKILL_CRITICALITY_WEIGHTS[criticality];

      const priorityScore = known > 0
        ? Math.round(
            (r.gapCount / known) * Math.min(1, averageGap / FULL_DEPTH_GAP) * criticalityWeight * 100,
          )
        : null;

      const courses = model.coursesBySkill.get(r.skillId) ?? [];
      const basis = costBasis(courses);
      const seatCost = basis?.costPerSeat ?? null;

      return {
        skillId: r.skillId,
        skillName: r.skillName,
        skillCategory: r.skillCategory,
        employeesRequiring: r.employeesRequiring,
        measured: r.measured,
        provisional: r.provisional,
        unknown: r.unknown,
        known,
        gapCount: r.gapCount,
        totalGap: r.totalGap,
        averageGap,
        averageGapKnown: known > 0 ? r.totalGap / known : 0,
        maxRequiredLevel: r.maxRequiredLevel,
        affectedPct,
        criticality,
        criticalityWeight,
        weightedGap: r.totalGap * criticalityWeight,
        priorityScore,
        priority: priorityFromScore(priorityScore),
        seatCost,
        estimatedCost: seatCost === null ? null : seatCost * r.gapCount,
        estimatedHours:
          basis && typeof basis.durationHours === 'number' ? basis.durationHours * r.gapCount : null,
        courses,
      };
    })
    // Worst first by WEIGHTED gap — the size of the job, criticality included.
    // Rows that are only an assessment need (no gap) weigh 0 and fall to the
    // bottom, ordered by how much is unknown.
    .sort((a, b) =>
      b.weightedGap - a.weightedGap ||
      (b.priorityScore ?? -1) - (a.priorityScore ?? -1) ||
      b.gapCount - a.gapCount ||
      b.unknown - a.unknown ||
      a.skillName.localeCompare(b.skillName));

  return {
    headcount: userIds.length,
    withRequirements,
    coverage: finalizeCoverage(pooled),
    budget: budgetOf(needs),
    needs,
  };
}

/**
 * Adds the line items up. Only skills that actually have a gap can carry a
 * bill, and the total is reported beside how much of it could NOT be priced —
 * the same rule as every percentage here: no total without its base.
 */
export function budgetOf(needs: TrainingNeedRow[]): TrainingBudgetEstimate {
  let skillsCosted = 0;
  let skillsUncosted = 0;
  let seatsCosted = 0;
  let seatsUncosted = 0;
  let estimatedCost = 0;
  let estimatedHours = 0;
  let anyHours = false;

  for (const n of needs) {
    if (n.gapCount === 0) continue; // an assessment need, not a training bill
    if (n.estimatedCost === null) {
      skillsUncosted++;
      seatsUncosted += n.gapCount;
      continue;
    }
    skillsCosted++;
    seatsCosted += n.gapCount;
    estimatedCost += n.estimatedCost;
    if (n.estimatedHours !== null) {
      estimatedHours += n.estimatedHours;
      anyHours = true;
    }
  }

  return {
    skillsCosted,
    skillsUncosted,
    seatsCosted,
    seatsUncosted,
    estimatedCost: skillsCosted > 0 ? Math.round(estimatedCost) : null,
    estimatedHours: anyHours ? Math.round(estimatedHours) : null,
  };
}

// ── Organisation overview ───────────────────────────────────────────────────

export interface PersonCoverageRow {
  userId: string;
  name: string;
  departmentId?: string;
  orgLevel?: string;
  coverage: Coverage;
}

export interface DepartmentCoverageRow {
  departmentId: string;
  name: string;
  parentId: string | null;
  headcount: number;
  withRequirements: number;
  coverage: Coverage;
}

/**
 * One skill's position across the scope — the "hotspot" row the analytics screen
 * ranks. Same shape of judgement as a TNA row, minus the money: how many people
 * need it, how many we actually looked at, how many fall short and by how much,
 * weighted by how much a gap on it matters.
 *
 * `weightedGap` is the ranking key, exactly as in `trainingNeeds`, so the worst
 * skill on the analytics page and the top of the training-needs table are the
 * same skill. `affectedPct` is null when nothing is known — silence never gets
 * a percentage.
 */
export interface OrgSkillGapRow {
  skillId: string;
  skillName: string;
  skillCategory?: string;
  employeesRequiring: number;
  measured: number;
  provisional: number;
  known: number;
  gapCount: number;
  totalGap: number;
  averageGap: number;
  unknown: number;
  affectedPct: number | null;
  criticality: SkillCriticality;
  criticalityWeight: number;
  weightedGap: number;
}

export interface OrgOverview {
  scope: { kind: ScopeKind; id: string; label: string };
  headcount: number;
  withRequirements: number;
  /** People in scope carrying no job profile — nothing can be required of them. */
  withoutProfile: number;
  coverage: Coverage;
  departments: DepartmentCoverageRow[];
  people: PersonCoverageRow[];
  /** Worst skills in scope, worst first by weighted gap. */
  topSkillGaps: OrgSkillGapRow[];
}

/** How many hotspot rows the overview ships. Enough to fill a table and an
 *  export sheet; the full per-skill list is the training-needs endpoint's job. */
const TOP_SKILL_GAPS = 15;

/**
 * One pass over the scope producing the pooled figure, the per-person figures
 * the directory table shows, and a department roll-up for comparison.
 *
 * Departments roll UP the ancestor chain (a unit's row covers its whole
 * subtree), matching the TNA and the stored snapshot — a general department has
 * no direct members at all, its people sit in sections underneath.
 */
export function orgOverview(model: AnalyticsModel, scope: ResolvedScope): OrgOverview {
  const pooled = newCoverageAccumulator();
  const people: PersonCoverageRow[] = [];
  const skills = new Map<string, SkillTally>();
  const depts = new Map<string, { headcount: number; withRequirements: number; acc: ReturnType<typeof newCoverageAccumulator> }>();

  const inScope = new Set(scope.userIds);
  let withRequirements = 0;
  let withoutProfile = 0;

  for (const userId of scope.userIds) {
    const user = model.usersById.get(userId);
    if (!user) continue;

    const chain = user.departmentId ? ancestorChain(user.departmentId, model.deptParents) : [];
    const deptAccs = chain.map((deptId) => {
      let d = depts.get(deptId);
      if (!d) {
        d = { headcount: 0, withRequirements: 0, acc: newCoverageAccumulator() };
        depts.set(deptId, d);
      }
      return d;
    });
    for (const d of deptAccs) d.headcount++;

    const requirements = user.jobProfileId ? model.jobRequirements.get(user.jobProfileId) : undefined;
    if (!requirements || requirements.length === 0) {
      if (!user.jobProfileId) withoutProfile++;
      people.push({
        userId: user.id,
        name: user.name,
        departmentId: user.departmentId,
        orgLevel: user.orgLevel,
        coverage: finalizeCoverage(newCoverageAccumulator()),
      });
      continue;
    }
    withRequirements++;
    for (const d of deptAccs) d.withRequirements++;

    const own = newCoverageAccumulator();
    for (const req of requirements) {
      const { score, source } = skillScore(user, req.skillId, model.index);
      const gap = accumulate(own, req.requiredLevel, score, source);
      accumulate(pooled, req.requiredLevel, score, source);
      for (const d of deptAccs) accumulate(d.acc, req.requiredLevel, score, source);

      let s = skills.get(req.skillId);
      if (!s) {
        s = {
          skillId: req.skillId,
          skillName: model.skillNames.get(req.skillId) ?? req.skillId,
          skillCategory: model.skillCategories.get(req.skillId),
          criticality: model.skillCriticalities.get(req.skillId) ?? DEFAULT_SKILL_CRITICALITY,
          employeesRequiring: 0, measured: 0, provisional: 0,
          gapCount: 0, totalGap: 0, unknown: 0,
        };
        skills.set(req.skillId, s);
      }
      s.employeesRequiring++;
      if (source === 'NONE') s.unknown++;
      else {
        if (source === 'EXPERIENCE') s.provisional++;
        else s.measured++;
        if (gap > 0) {
          s.gapCount++;
          s.totalGap += gap;
        }
      }
    }

    people.push({
      userId: user.id,
      name: user.name,
      departmentId: user.departmentId,
      orgLevel: user.orgLevel,
      coverage: finalizeCoverage(own),
    });
  }

  const departments: DepartmentCoverageRow[] = [...depts.entries()]
    .map(([departmentId, d]) => ({
      departmentId,
      name: model.deptNames.get(departmentId) ?? departmentId,
      parentId: model.deptParents.get(departmentId) ?? null,
      headcount: d.headcount,
      withRequirements: d.withRequirements,
      coverage: finalizeCoverage(d.acc),
    }))
    .sort((a, b) => b.headcount - a.headcount || a.name.localeCompare(b.name));

  return {
    scope: { kind: scope.kind, id: scope.id, label: scope.label },
    headcount: inScope.size,
    withRequirements,
    withoutProfile,
    coverage: finalizeCoverage(pooled),
    departments,
    people: people.sort((a, b) => a.name.localeCompare(b.name)),
    topSkillGaps: [...skills.values()]
      .filter((s) => s.totalGap > 0 || s.unknown > 0)
      .map(finalizeSkillTally)
      // Worst first by WEIGHTED gap, the same ranking the training-needs table
      // uses, so the two screens never nominate different worst skills. A row
      // that is only an assessment need weighs 0 and sinks, ordered by how much
      // of it is unknown.
      .sort((a, b) =>
        b.weightedGap - a.weightedGap ||
        b.gapCount - a.gapCount ||
        b.unknown - a.unknown ||
        a.skillName.localeCompare(b.skillName))
      .slice(0, TOP_SKILL_GAPS),
  };
}

interface SkillTally {
  skillId: string;
  skillName: string;
  skillCategory?: string;
  criticality: SkillCriticality;
  employeesRequiring: number;
  measured: number;
  provisional: number;
  gapCount: number;
  totalGap: number;
  unknown: number;
}

function finalizeSkillTally(s: SkillTally): OrgSkillGapRow {
  const known = s.measured + s.provisional;
  const criticalityWeight = SKILL_CRITICALITY_WEIGHTS[s.criticality];
  return {
    ...s,
    known,
    averageGap: s.gapCount > 0 ? s.totalGap / s.gapCount : 0,
    // No percentage without its base: nothing known ⇒ no share, not 0%.
    affectedPct: known > 0 ? Math.round((s.gapCount / known) * 100) : null,
    criticalityWeight,
    weightedGap: s.totalGap * criticalityWeight,
  };
}
