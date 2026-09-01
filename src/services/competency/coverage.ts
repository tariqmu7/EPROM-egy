/**
 * MEASURED vs UNKNOWN (coverage).
 *
 * Every gap/compliance number in the app divides by "required skills", which
 * silently counts a never-assessed skill as a failed one (score 0). This module
 * is the single place that splits a requirement list into
 * measured / provisional / unknown, so a page can say "X of Y measured" beside
 * any percentage — and show "—" instead of 0% when nothing is known.
 *
 * Compliance is deliberately computed over the KNOWN skills only. A provisional
 * (work-experience) score counts as known because it counts as a score
 * everywhere else, but it is NOT counted as measured.
 *
 * Extracted verbatim from `DataService` — see `context.ts`.
 */
import { CompetencyCoverage } from '../../types';
import { CompetencyContext } from './context';

/**
 * Running totals behind getUserCoverage / getGroupCoverage. Kept separate from
 * the finished CompetencyCoverage so a group total is just repeated addition.
 */
export interface CoverageAccumulator {
  required: number;
  measured: number;
  provisional: number;
  unknown: number;
  compliantKnown: number;
  gapsKnown: number;
  totalGap: number;
}

export function newCoverageAccumulator(): CoverageAccumulator {
  return { required: 0, measured: 0, provisional: 0, unknown: 0, compliantKnown: 0, gapsKnown: 0, totalGap: 0 };
}

export function finalizeCoverage(acc: CoverageAccumulator): CompetencyCoverage {
  const known = acc.measured + acc.provisional;
  return {
    required: acc.required,
    measured: acc.measured,
    provisional: acc.provisional,
    unknown: acc.unknown,
    known,
    measuredPct: acc.required > 0 ? Math.round((acc.measured / acc.required) * 100) : 0,
    knownPct: acc.required > 0 ? Math.round((known / acc.required) * 100) : 0,
    compliantKnown: acc.compliantKnown,
    gapsKnown: acc.gapsKnown,
    totalGap: acc.totalGap,
    // null, never 0 — "nothing measured" is not "0% compliant".
    compliancePct: known > 0 ? Math.round((acc.compliantKnown / known) * 100) : null,
    avgGap: known > 0 ? acc.totalGap / known : null,
  };
}

export function accumulateUserCoverage(
  ctx: CompetencyContext,
  acc: CoverageAccumulator,
  userId: string,
): void {
  const user = ctx.getUserById(userId);
  const job = user?.jobProfileId ? ctx.getJobProfile(user.jobProfileId) : null;
  if (!job) return;

  for (const req of ctx.getEffectiveRequirements(job)) {
    const { score, source } = ctx.getUserSkillScoreDetail(userId, req.skillId);
    acc.required++;

    if (source === 'NONE') {
      // The 0 here means "we never looked", not "they scored nothing" — it
      // must not reach any gap or compliance figure.
      acc.unknown++;
      continue;
    }

    if (source === 'EXPERIENCE') acc.provisional++;
    else acc.measured++;

    const gap = Math.max(0, req.requiredLevel - score);
    if (gap > 0) {
      acc.gapsKnown++;
      acc.totalGap += gap;
    } else {
      acc.compliantKnown++;
    }
  }
}

/** Coverage of one employee against their own job profile's requirements. */
export function getUserCoverage(ctx: CompetencyContext, userId: string): CompetencyCoverage {
  const acc = newCoverageAccumulator();
  accumulateUserCoverage(ctx, acc, userId);
  return finalizeCoverage(acc);
}

/**
 * Coverage summed across a set of employees (a team, a department, the whole
 * company). Percentages are over the pooled requirement count, so a person
 * with no job profile contributes nothing rather than a misleading 0%.
 */
export function getGroupCoverage(ctx: CompetencyContext, userIds: string[]): CompetencyCoverage {
  const acc = newCoverageAccumulator();
  for (const id of userIds) accumulateUserCoverage(ctx, acc, id);
  return finalizeCoverage(acc);
}
