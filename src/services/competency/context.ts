/**
 * The read-only view of the store that the competency engine needs.
 *
 * Everything under `src/services/competency/` is PURE: given this context it
 * computes a number and writes nothing. `DataService` implements the interface
 * over its own in-memory collections and keeps the thin public methods that the
 * app already calls, so extracting these modules changed no caller and no
 * behaviour — only where the maths lives.
 *
 * Why an explicit context rather than passing the service: it names exactly
 * what the engine is allowed to read (nine lookups and three collections), so a
 * future change to the engine cannot quietly reach for a listener, a write path
 * or the auth session. It is also what makes these functions testable without
 * booting the store.
 *
 * NOTE — `getUserSkillScore` / `getUserSkillScoreDetail` are the CACHED wrappers
 * on `DataService` (see `skillScoreCache`). The engine deliberately calls back
 * into them rather than re-entering `computeSkillScore`, so one page render
 * scores each user+skill once. The cache stays on the service because only the
 * service knows when a write invalidates it.
 */
import {
  Assessment,
  AssessmentInstruction,
  Evidence,
  JobProfile,
  JobProfileSkill,
  Skill,
  SkillScoreSource,
  TrainingCourse,
  User,
} from '../../types';

export interface CompetencyContext {
  // --- Document lookups (all archive-aware, exactly as the store's own are) ---
  getSkill(id: string): Skill | undefined;
  getUserById(id: string): User | undefined;
  getJobProfile(id: string): JobProfile | undefined;
  getAllJobs(includeArchived?: boolean): JobProfile[];
  getCoursesForSkill(skillId: string): TrainingCourse[];

  // --- Derived helpers owned by the store ---
  getEffectiveRequirements(profile: JobProfile | undefined | null): JobProfileSkill[];
  getGeneralDeptId(deptId: string | undefined): string | undefined;
  isManager(user: User): boolean;
  /** Capped provisional baseline from VERIFIED work experience. */
  getExperienceBaseline(userId: string, skillId: string): number;

  // --- The cached score wrappers (see NOTE above) ---
  getUserSkillScore(userId: string, skillId: string, includeArchived?: boolean): number;
  getUserSkillScoreDetail(userId: string, skillId: string): { score: number; source: SkillScoreSource };

  // --- Raw collections the engine scans ---
  readonly assessments: Assessment[];
  readonly evidences: Evidence[];
  readonly assessmentInstructions: AssessmentInstruction[];
}
