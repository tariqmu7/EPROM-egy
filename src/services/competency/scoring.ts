/**
 * SKILL SCORING — the one place a person's level on a skill is decided.
 *
 * The browser half of the pair; `server/src/jobs/scoring.ts` is the port the
 * nightly snapshot and the server aggregates run on. **Change one side, change
 * both** — a stored trend point and the live tile beside it must be the same
 * measure.
 *
 * Extracted verbatim from `DataService.computeSkillScore` — see `context.ts`.
 * The CACHE stays on the service: only it knows when a write invalidates a score.
 */
import { Assessment, SkillScoreSource } from '../../types';
import { CompetencyContext } from './context';
import { getSkillPrimaryMethod } from './resolution';
import { getRaterWeightsForUserSkill } from './scheduling';

/**
 * The uncached score computation, plus where the number came from.
 *
 * Score precedence, strongest first:
 *   1. A real assessment (360° blend, or the latest direct exam/interview/demo)
 *   2. Approved evidence carrying an assignedScore
 *   3. VERIFIED work experience — a capped PROVISIONAL baseline
 * Tier 3 is reached only when 1 and 2 produced nothing at all, so recorded
 * measurement always beats self-reported history.
 */
export function computeSkillScore(
  ctx: CompetencyContext,
  userId: string,
  skillId: string,
  includeArchived: boolean,
): { score: number; source: SkillScoreSource } {
  const skill = ctx.getSkill(skillId);
  if (!skill) return { score: 0, source: 'NONE' };

  let result: number;
  let source: SkillScoreSource;

  // Behavioral (360) Logic
  if (getSkillPrimaryMethod(ctx, skillId) === 'OJT_OBSERVATION') {
    let userAssessments = ctx.assessments.filter(a => a.subjectId === userId && a.skillId === skillId);
    if (!includeArchived) {
      userAssessments = userAssessments.filter(a => !a.isArchived);
    }
    if (userAssessments.length === 0) { result = 0; source = 'NONE'; }
    else {
      // Average across *distinct raters*, counting each rater only once at
      // their most recent rating. The 360 average is meant to blend multiple
      // people's views (esp. peers), not multiple time points from the same
      // person — so a rater who re-rates across cycles must not be
      // double-counted, and the current score reflects their latest input.
      const latestPerRater = (arr: Assessment[]) => {
        const byRater = new Map<string, Assessment>();
        for (const a of arr) {
          const prev = byRater.get(a.raterId);
          if (!prev || new Date(a.date).getTime() > new Date(prev.date).getTime()) byRater.set(a.raterId, a);
        }
        return [...byRater.values()];
      };
      const selfA = latestPerRater(userAssessments.filter(a => a.type === 'SELF'));
      const peerA = latestPerRater(userAssessments.filter(a => a.type === 'PEER'));
      const mgrA = latestPerRater(userAssessments.filter(a => a.type === 'MANAGER'));

      const avgSelf = selfA.length > 0 ? selfA.reduce((s, a) => s + a.score, 0) / selfA.length : null;
      const avgPeer = peerA.length > 0 ? peerA.reduce((s, a) => s + a.score, 0) / peerA.length : null;
      const avgMgr = mgrA.length > 0 ? mgrA.reduce((s, a) => s + a.score, 0) / mgrA.length : null;

      // 360° blend is admin-configurable per skill (see SkillAssessmentMethod
      // .raterWeights); defaults to Self 10 / Peer 30 / Mgr 60. Weights are
      // re-normalized over the rater types that actually submitted.
      const rw = getRaterWeightsForUserSkill(ctx, userId, skillId);
      let totalWeight = 0;
      let weightedScore = 0;

      if (avgSelf !== null) { weightedScore += avgSelf * rw.self; totalWeight += rw.self; }
      if (avgPeer !== null) { weightedScore += avgPeer * rw.peer; totalWeight += rw.peer; }
      if (avgMgr  !== null) { weightedScore += avgMgr  * rw.manager; totalWeight += rw.manager; }

      result = totalWeight === 0 ? 0 : Math.round(weightedScore / totalWeight);
      source = result > 0 ? 'ASSESSMENT' : 'NONE';
    }
  } else {
    // Evidence, Online Assessment, or Interview Logic
    let directAssessments = ctx.assessments.filter(a => a.subjectId === userId && a.skillId === skillId && (a.type === 'WRITTEN_EXAM' || a.type === 'INTERVIEW' || a.type === 'PRACTICAL_DEMO'));
    if (!includeArchived) {
      directAssessments = directAssessments.filter(a => !a.isArchived);
    }

    if (directAssessments.length > 0) {
      result = directAssessments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].score;
      source = 'ASSESSMENT';
    } else {
      const relevantEvidence = ctx.evidences.filter(e => e.userId === userId && e.skillId === skillId && e.status === 'APPROVED' && e.assignedScore);
      if (relevantEvidence.length === 0) { result = 0; source = 'NONE'; }
      else {
        const maxScore = Math.max(...relevantEvidence.map(e => e.assignedScore || 0));
        result = Math.min(Math.max(Math.round(maxScore), 1), 5);
        source = 'EVIDENCE';
      }
    }
  }

  // ── Provisional baseline from VERIFIED work experience ────────────────────
  // Placed AFTER the if/else deliberately, so BOTH branches fall through here.
  // The 360°/OJT branch never reaches the evidence tier, and an unconfigured
  // skill defaults to OJT_OBSERVATION (getSkillPrimaryMethod), so putting this
  // inside the `else` would skip most skills.
  //
  // `result === 0` is precisely "no usable assessment AND no scored evidence".
  if (result === 0) {
    const provisional = ctx.getExperienceBaseline(userId, skillId);
    if (provisional > 0) {
      result = provisional;
      source = 'EXPERIENCE';
    }
  }

  return { score: result, source };
}
