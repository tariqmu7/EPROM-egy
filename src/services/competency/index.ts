/**
 * THE COMPETENCY ENGINE — the browser's pure maths, lifted out of `store.ts`.
 *
 * Nothing in here reads a listener, writes a document or touches the auth
 * session. Each function takes a `CompetencyContext` (the named set of lookups
 * it is allowed to read) and returns a number, a coverage split or a plan.
 * `DataService` implements the context over its own in-memory collections and
 * keeps thin methods that delegate here, so every existing caller is unchanged.
 *
 * Layered bottom-up — a module only ever imports from the ones above it:
 *
 *   context     the read-only view of the store
 *   resolution  how is this skill assessed (legacy-safe)
 *   scheduling  who does a method block apply to, and when is it next due
 *   scoring     one person's level on one skill
 *   coverage    measured / provisional / unknown, and the % that may be shown
 *   career      readiness against each rung above
 *   itp         the live training proposal
 *
 * `scoring` and `scheduling` have SERVER ports under `server/src/jobs/` that
 * the nightly sweep and the analytics aggregates run on. Change one side,
 * change both.
 */
export type { CompetencyContext } from './context';
export type { CoverageAccumulator } from './coverage';

export {
  getSkillAssessmentLink,
  getSkillAssessmentMethods,
  getSkillAssessmentQuestion,
  getSkillMethods,
  getSkillPrimaryMethod,
  skillHasMethod,
  synthesizeLegacyMethods,
} from './resolution';

export {
  computeMethodNextDueDate,
  getApplicableMethodsForUserSkill,
  getNextAssessmentDate,
  getPassingScoreForUserSkill,
  getRaterWeightsForUserSkill,
  isSkillCertificateBasedForUser,
  isUserInAudience,
} from './scheduling';

export { computeSkillScore } from './scoring';

export {
  accumulateUserCoverage,
  finalizeCoverage,
  getGroupCoverage,
  getUserCoverage,
  newCoverageAccumulator,
} from './coverage';

export { generateCareerPath } from './career';
export { generateIndividualTrainingPlan } from './itp';
