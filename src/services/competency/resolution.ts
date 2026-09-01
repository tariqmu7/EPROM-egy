/**
 * ASSESSMENT RESOLUTION (per-skill, legacy-safe).
 *
 * Answers "how is this skill assessed" from the skill's own inline
 * `assessmentMethods` blocks, falling back to the deprecated linked
 * AssessmentInstruction docs / per-skill fields so resolution keeps working
 * before the one-time `migrateAssessmentConfigToSkills` runs.
 *
 * Extracted verbatim from `DataService` — see `context.ts`.
 */
import { AssessmentInstruction, AssessmentMethod, Skill, SkillAssessmentMethod } from '../../types';
import { CompetencyContext } from './context';

// The assessment method blocks defined inline on a skill. Falls back to a
// synthesized block from the deprecated linked-instruction / per-skill fields
// when none are set (covers any not-yet-migrated docs).
export function getSkillAssessmentMethods(ctx: CompetencyContext, skillId: string): SkillAssessmentMethod[] {
  const skill = ctx.getSkill(skillId);
  if (!skill) return [];
  if ((skill.assessmentMethods || []).length > 0) return skill.assessmentMethods!;
  return synthesizeLegacyMethods(ctx, skill);
}

// Build per-skill method blocks from the deprecated linked AssessmentInstruction
// docs or the old per-skill fields, so resolution keeps working before the
// one-time migration runs. Defaults frequency/audience (scheduling lived on
// separate plans, so legacy blocks recur only if a matching plan still does).
export function synthesizeLegacyMethods(ctx: CompetencyContext, skill: Skill): SkillAssessmentMethod[] {
  const fromInstruction = (i: AssessmentInstruction): SkillAssessmentMethod => ({
    id: `legacy-instr:${i.id}`,
    method: i.method,
    assessmentQuestion: i.assessmentQuestion,
    assessmentLink: i.assessmentLink,
    questions: [
      ...(i.evaluationQuestions || []),
      ...(i.interviewQuestions || []),
      ...(i.threeSixtyQuestions || []),
      ...(i.annualAppraisalQuestions || [])
    ],
    frequency: 'ONE_TIME',
    audience: 'ALL'
  });

  const linked = (skill.assessmentInstructionIds || [])
    .map(id => ctx.assessmentInstructions.find(i => i.id === id))
    .filter((i): i is AssessmentInstruction => !!i && i.status === 'ACTIVE');
  if (linked.length > 0) return linked.map(fromInstruction);

  if (skill.assessmentMethod || skill.assessmentQuestion || skill.assessmentLink) {
    return [{
      id: `legacy:${skill.id}`,
      method: skill.assessmentMethod || 'OJT_OBSERVATION',
      assessmentQuestion: skill.assessmentQuestion,
      assessmentLink: skill.assessmentLink,
      questions: [
        ...(skill.evaluationQuestions || []),
        ...(skill.interviewQuestions || []),
        ...(skill.threeSixtyQuestions || [])
      ],
      frequency: 'ONE_TIME',
      audience: 'ALL'
    }];
  }
  return [];
}

export function getSkillMethods(ctx: CompetencyContext, skillId: string): AssessmentMethod[] {
  return Array.from(new Set(getSkillAssessmentMethods(ctx, skillId).map(m => m.method)));
}

export function skillHasMethod(ctx: CompetencyContext, skillId: string, method: AssessmentMethod): boolean {
  return getSkillMethods(ctx, skillId).includes(method);
}

// The method that drives single-method consumers (scoring, queue bucket).
// Defaults to OJT_OBSERVATION so an unconfigured skill still routes to 360.
export function getSkillPrimaryMethod(ctx: CompetencyContext, skillId: string): AssessmentMethod {
  return getSkillAssessmentMethods(ctx, skillId)[0]?.method || 'OJT_OBSERVATION';
}

export function getSkillAssessmentLink(ctx: CompetencyContext, skillId: string): string | undefined {
  const methods = getSkillAssessmentMethods(ctx, skillId);
  const exam = methods.find(m => m.method === 'WRITTEN_EXAM' && m.assessmentLink);
  return exam?.assessmentLink || methods.find(m => m.assessmentLink)?.assessmentLink;
}

export function getSkillAssessmentQuestion(ctx: CompetencyContext, skillId: string): string | undefined {
  return getSkillAssessmentMethods(ctx, skillId).find(m => m.assessmentQuestion)?.assessmentQuestion;
}
