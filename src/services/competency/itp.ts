/**
 * ITP — the live training PROPOSAL.
 *
 * Recomputed on every render and NEVER stored: it can say what *should*
 * happen, never what was agreed. Saving it is `developmentPlans`, which stays
 * on `DataService` because it writes.
 *
 * Items are ranked worst-first by WEIGHTED gap — how deep the shortfall is ×
 * how much the skill matters — the same weighting the TNA ranks a unit by. A
 * safety-critical item also gets the shorter target date.
 *
 * Extracted verbatim from `DataService.generateIndividualTrainingPlan` — see
 * `context.ts`.
 */
import {
  IndividualTrainingPlan,
  SKILL_CRITICALITY_WEIGHTS,
  TrainingRecommendation,
  skillCriticalityOf,
  skillCriticalityWeight,
} from '../../types';
import { CompetencyContext } from './context';

export function generateIndividualTrainingPlan(
  ctx: CompetencyContext,
  userId: string,
): IndividualTrainingPlan | null {
  const user = ctx.getUserById(userId);
  if (!user || !user.jobProfileId || !user.orgLevel) return null;

  const job = ctx.getJobProfile(user.jobProfileId);
  if (!job) return null;

  const requirements = ctx.getEffectiveRequirements(job);
  const recommendations: TrainingRecommendation[] = [];

  requirements.forEach(req => {
    const currentScore = ctx.getUserSkillScore(userId, req.skillId);
    const gap = req.requiredLevel - currentScore;

    if (gap > 0) {
      const skill = ctx.getSkill(req.skillId);
      const skillName = skill?.name || 'Unknown Skill';
      const criticality = skillCriticalityOf(skill?.criticality);
      const weight = SKILL_CRITICALITY_WEIGHTS[criticality];

      const matchingCourse = ctx.getCoursesForSkill(req.skillId)[0];

      const recommendationText = matchingCourse
        ? `Enroll in "${matchingCourse.title}" (${matchingCourse.provider}) to bridge the gap.`
        : gap >= 2
        ? `Intensive training and external certification required for ${skillName}.`
        : `On-the-job training and mentorship recommended to reach proficiency level ${req.requiredLevel}.`;

      // A safety-critical shortfall is chased sooner than a deep gap on
      // something optional — the same weighting the TNA ranks a unit by,
      // applied to one person's plan.
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + (criticality === 'SAFETY_CRITICAL' ? 3 : gap >= 2 ? 6 : 3));

      recommendations.push({
        skillId: req.skillId,
        skillName,
        gap,
        recommendation: recommendationText,
        priority: (gap * weight >= 2 ? 'HIGH' : gap * weight >= 1 ? 'MEDIUM' : 'LOW'),
        status: 'NOT_STARTED',
        targetDate: targetDate.toISOString(),
        supervisorSignOff: false,
        courseId: matchingCourse?.id
      });
    }
  });

  return {
    id: `itp_${userId}_${Date.now()}`,
    userId,
    // Worst first by WEIGHTED gap: how deep the shortfall is × how much the
    // skill matters. A 1-level safety gap outranks a 2-level nice-to-have.
    recommendations: recommendations.sort((a, b) =>
      b.gap * skillCriticalityWeight(ctx.getSkill(b.skillId)?.criticality)
      - a.gap * skillCriticalityWeight(ctx.getSkill(a.skillId)?.criticality)
      || b.gap - a.gap),
    generatedAt: new Date().toISOString(),
    status: 'ACTIVE'
  };
}
