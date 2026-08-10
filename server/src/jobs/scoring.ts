// ============================================================================
// Scoring domain — the server-side port of the ONE scoring brain that until now
// existed only in the browser (`src/services/store.ts`: computeSkillScore →
// getUserSkillScoreDetail, plus accumulateUserCoverage / finalizeCoverage).
//
// It exists so the monthly snapshot (snapshots.ts) records the SAME number the
// employee, the manager and the CEO see on screen. A snapshot computed by a
// second, subtly different brain would be worse than no snapshot at all — it
// would be a trend line that disagrees with every page, which is precisely the
// defect (finding 6) the snapshot is meant to remove.
//
// Everything here is PURE: no DB, no clock. The caller loads the tables once
// and hands over the indexes.
//
// PARITY NOTES (read before changing either side):
//   • Score precedence is identical: a real assessment beats approved evidence,
//     which beats a capped provisional level from VERIFIED work experience. The
//     experience tier is applied AFTER the 360/direct split, not inside the
//     `else` — the 360 branch never reaches the evidence tier and an
//     unconfigured skill defaults to OJT_OBSERVATION, so nesting it would skip
//     most skills. Same trap, same comment, as the store.
//   • The 360 blend averages each rater ONCE, at their latest rating, then
//     applies the (re-normalised) self/peer/manager weights.
//   • `source === 'NONE'` is "we never looked", and it is the reason coverage
//     exists. It must never reach a gap or compliance figure.
// ============================================================================
import { isUserInAudience, type MethodBlock, type SweepUser } from './scheduling.js';

export type ScoreSource = 'ASSESSMENT' | 'EVIDENCE' | 'EXPERIENCE' | 'NONE';

/** The slice of an assessment document scoring needs. */
export interface AssessmentLike {
  type?: string;
  raterId?: string;
  score?: number;
  date?: string;
}

/** Mirrors DEFAULT_RATER_WEIGHTS in src/types.ts. */
export const DEFAULT_RATER_WEIGHTS = { self: 10, peer: 30, manager: 60 };

/** Mirrors DEFAULT_WORK_EXPERIENCE_POLICY in src/constants/experiencePolicy.ts.
 *  Only the two knobs scoring uses — the year bands are a *suggestion* tool for
 *  the verifier and never reach a score. */
export const DEFAULT_EXPERIENCE_POLICY = { enabled: true, maxProvisionalLevel: 3 };

/** Everything the scorer needs, indexed once by the caller. */
export interface ScoringIndex {
  /** skillId → the skill's inline assessment method blocks. */
  skillMethods: Map<string, MethodBlock[]>;
  /** `userId|skillId` → non-archived assessments for that pair. */
  assessments: Map<string, AssessmentLike[]>;
  /** `userId|skillId` → assignedScore of every APPROVED evidence. */
  evidenceScores: Map<string, number[]>;
  /** `userId|skillId` → best verifiedLevel across VERIFIED work experience. */
  experienceLevels: Map<string, number>;
  /** The admin-overridable work-experience policy (appSettings/work-experience). */
  experiencePolicy: { enabled: boolean; maxProvisionalLevel: number };
}

export function pairKey(userId: string, skillId: string): string {
  return `${userId}|${skillId}`;
}

/** Port of `getSkillPrimaryMethod` — an unconfigured skill routes to 360. */
export function primaryMethod(blocks: MethodBlock[]): string {
  return blocks[0]?.method || 'OJT_OBSERVATION';
}

/** Port of `getRaterWeightsForUserSkill`. */
function raterWeightsFor(user: SweepUser, blocks: MethodBlock[]) {
  const block = blocks
    .filter((b) => isUserInAudience(user, b))
    .find((b) => (b.method === 'OJT_OBSERVATION' || b.method === 'THREE_SIXTY_EVALUATION') && b.raterWeights);
  const w = block?.raterWeights;
  if (!w) return DEFAULT_RATER_WEIGHTS;
  return {
    self: Number(w.self ?? DEFAULT_RATER_WEIGHTS.self),
    peer: Number(w.peer ?? DEFAULT_RATER_WEIGHTS.peer),
    manager: Number(w.manager ?? DEFAULT_RATER_WEIGHTS.manager),
  };
}

/** Latest rating per rater — a rater who re-rates across cycles counts once. */
function latestPerRater(list: AssessmentLike[]): AssessmentLike[] {
  const byRater = new Map<string, AssessmentLike>();
  for (const a of list) {
    const rater = String(a.raterId ?? '');
    const prev = byRater.get(rater);
    if (!prev || new Date(String(a.date)).getTime() > new Date(String(prev.date)).getTime()) {
      byRater.set(rater, a);
    }
  }
  return [...byRater.values()];
}

function averageScore(list: AssessmentLike[]): number | null {
  if (list.length === 0) return null;
  return list.reduce((s, a) => s + Number(a.score ?? 0), 0) / list.length;
}

/** The capped provisional level VERIFIED experience supports, or 0.
 *  Port of `getExperienceBaseline`. */
function experienceBaseline(best: number, policy: ScoringIndex['experiencePolicy']): number {
  if (!policy.enabled || best <= 0) return 0;
  const cap = Math.min(5, Math.max(1, Math.round(policy.maxProvisionalLevel)));
  return Math.min(Math.max(Math.round(best), 1), cap);
}

/**
 * One employee's score on one skill, with where the number came from.
 * Line-for-line port of `computeSkillScore`.
 */
export function skillScore(
  user: SweepUser,
  skillId: string,
  index: ScoringIndex,
): { score: number; source: ScoreSource } {
  const blocks = index.skillMethods.get(skillId);
  // No such skill (a requirement pointing at a deleted one) — the store returns
  // NONE rather than 0/ASSESSMENT.
  if (!blocks) return { score: 0, source: 'NONE' };

  const key = pairKey(user.id, skillId);
  const all = index.assessments.get(key) ?? [];

  let result: number;
  let source: ScoreSource;

  if (primaryMethod(blocks) === 'OJT_OBSERVATION') {
    if (all.length === 0) {
      result = 0;
      source = 'NONE';
    } else {
      const avgSelf = averageScore(latestPerRater(all.filter((a) => a.type === 'SELF')));
      const avgPeer = averageScore(latestPerRater(all.filter((a) => a.type === 'PEER')));
      const avgMgr = averageScore(latestPerRater(all.filter((a) => a.type === 'MANAGER')));

      const rw = raterWeightsFor(user, blocks);
      let totalWeight = 0;
      let weighted = 0;
      if (avgSelf !== null) { weighted += avgSelf * rw.self; totalWeight += rw.self; }
      if (avgPeer !== null) { weighted += avgPeer * rw.peer; totalWeight += rw.peer; }
      if (avgMgr !== null) { weighted += avgMgr * rw.manager; totalWeight += rw.manager; }

      result = totalWeight === 0 ? 0 : Math.round(weighted / totalWeight);
      source = result > 0 ? 'ASSESSMENT' : 'NONE';
    }
  } else {
    const direct = all.filter(
      (a) => a.type === 'WRITTEN_EXAM' || a.type === 'INTERVIEW' || a.type === 'PRACTICAL_DEMO',
    );
    if (direct.length > 0) {
      const latest = [...direct].sort(
        (a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime(),
      )[0];
      result = Number(latest.score ?? 0);
      source = 'ASSESSMENT';
    } else {
      const scores = (index.evidenceScores.get(key) ?? []).filter((s) => s > 0);
      if (scores.length === 0) {
        result = 0;
        source = 'NONE';
      } else {
        result = Math.min(Math.max(Math.round(Math.max(...scores)), 1), 5);
        source = 'EVIDENCE';
      }
    }
  }

  // AFTER the if/else on purpose — see the parity note at the top of the file.
  if (result === 0) {
    const provisional = experienceBaseline(index.experienceLevels.get(key) ?? 0, index.experiencePolicy);
    if (provisional > 0) {
      result = provisional;
      source = 'EXPERIENCE';
    }
  }

  return { score: result, source };
}

// ── Coverage ────────────────────────────────────────────────────────────────
// Port of CoverageAccumulator / finalizeCoverage in src/services/store.ts.

export interface CoverageAccumulator {
  required: number;
  measured: number;
  provisional: number;
  unknown: number;
  compliantKnown: number;
  gapsKnown: number;
  totalGap: number;
}

export interface Coverage extends CoverageAccumulator {
  known: number;
  measuredPct: number;
  knownPct: number;
  compliancePct: number | null;
  avgGap: number | null;
}

export function newCoverageAccumulator(): CoverageAccumulator {
  return { required: 0, measured: 0, provisional: 0, unknown: 0, compliantKnown: 0, gapsKnown: 0, totalGap: 0 };
}

/** Adds one scored requirement to a running total. Returns the gap, so a caller
 *  keeping per-skill tallies doesn't have to recompute it. */
export function accumulate(
  acc: CoverageAccumulator,
  requiredLevel: number,
  score: number,
  source: ScoreSource,
): number {
  acc.required++;
  if (source === 'NONE') {
    // The 0 means "we never looked", not "they scored nothing".
    acc.unknown++;
    return 0;
  }
  if (source === 'EXPERIENCE') acc.provisional++;
  else acc.measured++;

  const gap = Math.max(0, requiredLevel - score);
  if (gap > 0) {
    acc.gapsKnown++;
    acc.totalGap += gap;
  } else {
    acc.compliantKnown++;
  }
  return gap;
}

export function finalizeCoverage(acc: CoverageAccumulator): Coverage {
  const known = acc.measured + acc.provisional;
  return {
    ...acc,
    known,
    measuredPct: acc.required > 0 ? Math.round((acc.measured / acc.required) * 100) : 0,
    knownPct: acc.required > 0 ? Math.round((known / acc.required) * 100) : 0,
    // null, never 0 — "nothing measured" is not "0% compliant".
    compliancePct: known > 0 ? Math.round((acc.compliantKnown / known) * 100) : null,
    avgGap: known > 0 ? acc.totalGap / known : null,
  };
}
