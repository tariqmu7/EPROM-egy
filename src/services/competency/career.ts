/**
 * CAREER PATH — what stands between this person and each rung above them.
 *
 * The coverage rule applies here too: a requirement nobody has measured is an
 * unknown, never a shortfall. It contributes no gap points and it WITHHOLDS
 * READY_NOW, because readiness is a claim about the whole position.
 *
 * Extracted verbatim from `DataService.generateCareerPath` — see `context.ts`.
 */
import {
  CareerLevelProgress,
  CareerProgressionPlan,
  ORG_HIERARCHY_ORDER,
  PromotionRequirement,
} from '../../types';
import { CompetencyContext } from './context';

export function generateCareerPath(ctx: CompetencyContext, userId: string): CareerProgressionPlan | null {
  const user = ctx.getUserById(userId);
  if (!user || !user.jobProfileId || !user.orgLevel) return null;

  const currentJob = ctx.getJobProfile(user.jobProfileId);
  if (!currentJob) return null;

  // Succession Logic: Find all jobs in the same General Department to bridge gap requirements.
  // Prefer the user's explicit generalDepartmentId (the canonical grouping that
  // survives org-chart rebuilds); fall back to walking departmentId up the tree.
  // Jobs are matched either by direct departmentId equality (career-ladder
  // profiles are keyed straight to the general department) or by their own
  // tree walk — robust to orphaned departmentId references.
  const generalDeptId = user.generalDepartmentId || ctx.getGeneralDeptId(user.departmentId);
  const deptJobs = ctx.getAllJobs().filter(j =>
    j.departmentId === generalDeptId || ctx.getGeneralDeptId(j.departmentId) === generalDeptId
  );

  const currentIndex = ORG_HIERARCHY_ORDER.indexOf(user.orgLevel);
  if (currentIndex === -1) return null;

  const roadmap: CareerLevelProgress[] = [];

  // Loop from current position up to GM (index 0)
  for (let i = currentIndex - 1; i >= 0; i--) {
    const level = ORG_HIERARCHY_ORDER[i];

    // Each position is its own profile at a single org level. Find the
    // department's position profile for this higher level and use its
    // required skills as the promotion target.
    const targetJob = deptJobs.find(j => j.orgLevel === level && ctx.getEffectiveRequirements(j).length > 0)
      || deptJobs.find(j => j.orgLevel === level);
    const requirements = ctx.getEffectiveRequirements(targetJob);

    const promReqs: PromotionRequirement[] = [];
    let totalGapPoints = 0;

    requirements.forEach(req => {
      const { score: currentScore, source } = ctx.getUserSkillScoreDetail(userId, req.skillId);
      const gap = Math.max(0, req.requiredLevel - currentScore);
      const skill = ctx.getSkill(req.skillId);
      // A skill that was never assessed is an unknown, not a shortfall — the
      // readiness bar must show it as "not measured" rather than a failure.
      const isMeasured = source !== 'NONE';

      promReqs.push({
        skillId: req.skillId,
        skillName: skill?.name || 'Unknown Skill',
        currentScore,
        requiredScore: req.requiredLevel,
        gap,
        isMeasured
      });

      // Gap points drive readiness, so only MEASURED skills contribute: an
      // unassessed skill would otherwise add a full-size phantom gap.
      if (isMeasured) totalGapPoints += gap;
    });

    const unmeasuredCount = promReqs.filter(r => !r.isMeasured).length;
    const measuredCount = promReqs.length - unmeasuredCount;

    let readinessStatus: 'READY_NOW' | 'READY_1_2_YEARS' | 'READY_3_5_YEARS' | 'DEVELOPMENT_NEEDED' = 'DEVELOPMENT_NEEDED';
    if (measuredCount === 0) {
      // Nothing measured against this level: no readiness claim is possible,
      // so stay on the most conservative bucket rather than invent progress.
      readinessStatus = 'DEVELOPMENT_NEEDED';
    } else if (totalGapPoints === 0 && unmeasuredCount === 0) {
      // READY_NOW is a claim about the whole position — it needs every
      // requirement measured, not just no gaps among those that were.
      readinessStatus = 'READY_NOW';
    } else if (totalGapPoints <= 2) readinessStatus = 'READY_1_2_YEARS';
    else if (totalGapPoints <= 5) readinessStatus = 'READY_3_5_YEARS';

    roadmap.push({
      level,
      requirements: promReqs,
      readinessStatus,
      isDefined: requirements.length > 0,
      unmeasuredCount
    });
  }

  return {
    userId,
    currentLevel: user.orgLevel,
    roadmap
  };
}
