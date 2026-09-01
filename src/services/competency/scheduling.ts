/**
 * ASSESSMENT SCHEDULING — who a method block applies to, and when it next
 * falls due.
 *
 * The browser half of the pair; `server/src/jobs/scheduling.ts` is the port
 * that the nightly sweep runs on. **Change one side, change both** — the sweep
 * chases the same due dates this file shows on screen.
 *
 * Extracted verbatim from `DataService` — see `context.ts`.
 */
import {
  AssessmentAudience,
  DEFAULT_RATER_WEIGHTS,
  OrgLevel,
  RaterWeights,
  SkillAssessmentMethod,
} from '../../types';
import { CompetencyContext } from './context';
import { getSkillAssessmentMethods } from './resolution';

// Does a method block's audience include this user?
export function isUserInAudience(
  ctx: CompetencyContext,
  userId: string,
  m: { audience: AssessmentAudience; audienceOrgLevels?: OrgLevel[]; audienceDepartmentIds?: string[] }
): boolean {
  const user = ctx.getUserById(userId);
  if (!user) return false;
  switch (m.audience) {
    case 'ALL':
      return true;
    case 'FRESH_ONLY':
      return user.orgLevel === 'FR';
    case 'MANAGERS_ONLY':
      return ctx.isManager(user);
    case 'ORG_LEVELS':
      return !!user.orgLevel && (m.audienceOrgLevels || []).includes(user.orgLevel);
    case 'DEPARTMENTS':
      return (m.audienceDepartmentIds || []).includes(user.departmentId);
    default:
      return false;
  }
}

// Per-skill assessment method blocks whose audience applies to the user.
export function getApplicableMethodsForUserSkill(
  ctx: CompetencyContext,
  userId: string,
  skillId: string,
): SkillAssessmentMethod[] {
  return getSkillAssessmentMethods(ctx, skillId).filter(m => isUserInAudience(ctx, userId, m));
}

// The 360°/OJT rater blend (self/peer/manager) to apply for this user+skill.
// Reads the first applicable OJT/360 method block that carries raterWeights;
// falls back to DEFAULT_RATER_WEIGHTS so behavior is unchanged when unset.
export function getRaterWeightsForUserSkill(
  ctx: CompetencyContext,
  userId: string,
  skillId: string,
): RaterWeights {
  const block = getApplicableMethodsForUserSkill(ctx, userId, skillId).find(m =>
    (m.method === 'OJT_OBSERVATION' || m.method === 'THREE_SIXTY_EVALUATION') && m.raterWeights);
  return block?.raterWeights || DEFAULT_RATER_WEIGHTS;
}

// The exam pass mark (0-100) for a user+skill: the job profile's per-skill
// override (JobProfileSkill.passingScorePercent) when set, otherwise the
// skill's own WRITTEN_EXAM default. null when neither is configured.
export function getPassingScoreForUserSkill(
  ctx: CompetencyContext,
  userId: string,
  skillId: string,
): number | null {
  const user = ctx.getUserById(userId);
  const job = user?.jobProfileId ? ctx.getJobProfile(user.jobProfileId) : undefined;
  const profileReq = job
    ? ctx.getEffectiveRequirements(job).find(r => r.skillId === skillId)
    : undefined;
  if (typeof profileReq?.passingScorePercent === 'number') return profileReq.passingScorePercent;
  const examDefault = getSkillAssessmentMethods(ctx, skillId)
    .find(m => m.method === 'WRITTEN_EXAM' && typeof m.passingScorePercent === 'number');
  return typeof examDefault?.passingScorePercent === 'number' ? examDefault.passingScorePercent : null;
}

// True when an applicable method block schedules the skill as
// certificate-based (evidence carries an expiry date).
export function isSkillCertificateBasedForUser(
  ctx: CompetencyContext,
  userId: string,
  skillId: string,
): boolean {
  return getApplicableMethodsForUserSkill(ctx, userId, skillId)
    .some(m => m.frequency === 'CERTIFICATE_BASED');
}

// Next due date for one method block/user/skill, or null if it never recurs.
export function computeMethodNextDueDate(
  ctx: CompetencyContext,
  m: SkillAssessmentMethod,
  userId: string,
  skillId: string,
): Date | null {
  if (m.frequency === 'ONE_TIME') return null;

  const now = new Date();

  if (m.frequency === 'CERTIFICATE_BASED') {
    const userEvidences = ctx.evidences.filter(e =>
      e.userId === userId && e.skillId === skillId && e.status === 'APPROVED' && e.expiryDate);
    if (userEvidences.length === 0) return now; // due until a valid certificate exists
    const latest = userEvidences.slice().sort((a, b) =>
      new Date(b.expiryDate!).getTime() - new Date(a.expiryDate!).getTime())[0];
    return new Date(latest.expiryDate!);
  }

  const userAssessments = ctx.assessments
    .filter(a => a.subjectId === userId && a.skillId === skillId && !a.isArchived)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const lastDate = userAssessments.length > 0 ? new Date(userAssessments[0].date) : null;

  if (m.frequency === 'ANNUAL_FIXED_DATE') {
    const month = (m.fixedMonth ?? 1) - 1; // JS months are 0-based
    const day = m.fixedDay ?? 1;
    // Most recent occurrence of the fixed date on/before today.
    let lastDue = new Date(now.getFullYear(), month, day);
    if (lastDue > now) lastDue = new Date(now.getFullYear() - 1, month, day);
    // Overdue if it has never been assessed since the latest fixed date.
    if (!lastDate || lastDate < lastDue) return now;
    // Otherwise the next occurrence after today.
    const next = new Date(now.getFullYear(), month, day);
    if (next <= now) next.setFullYear(next.getFullYear() + 1);
    return next;
  }

  if (m.frequency === 'ANYTIME_ANNUAL') {
    if (!lastDate || lastDate.getFullYear() < now.getFullYear()) return now;
    return new Date(now.getFullYear() + 1, 0, 1); // due again at the start of next year
  }

  // Rolling intervals: WEEKLY / MONTHLY / QUARTERLY
  if (!lastDate) return now; // never assessed → due now
  const next = new Date(lastDate);
  if (m.frequency === 'WEEKLY') next.setDate(next.getDate() + 7);
  else if (m.frequency === 'MONTHLY') next.setMonth(next.getMonth() + 1);
  else if (m.frequency === 'QUARTERLY') next.setMonth(next.getMonth() + 3);
  return next;
}

// Earliest (most urgent) next-due date across every method block that applies
// to this user+skill. Returns null when no block schedules the skill — a skill
// with no recurring method is treated as one-time and never becomes due again.
export function getNextAssessmentDate(
  ctx: CompetencyContext,
  userId: string,
  skillId: string,
): Date | null {
  const methods = getApplicableMethodsForUserSkill(ctx, userId, skillId);
  if (methods.length === 0) return null;

  let earliest: Date | null = null;
  for (const m of methods) {
    const due = computeMethodNextDueDate(ctx, m, userId, skillId);
    if (!due) continue;
    if (!earliest || due < earliest) earliest = due;
  }
  return earliest;
}
