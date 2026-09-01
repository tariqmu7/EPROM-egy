/**
 * The competency engine, exercised WITHOUT booting the store.
 *
 * This is the point of the extraction: the maths that decides a person's level,
 * whether a percentage may be shown at all, and when an assessment falls due,
 * is now reachable from a hand-built context — no auth session, no listeners,
 * no network. `store.test.ts` and `journey-parity.test.ts` still pin the same
 * rules through `DataService`; these tests pin them at the source, where a
 * failure names the module that broke.
 */
import { describe, expect, it } from 'vitest';
import {
  Assessment,
  AssessmentInstruction,
  Evidence,
  JobProfile,
  Skill,
  SkillScoreSource,
  TrainingCourse,
  User,
} from '../../../types';
import {
  CompetencyContext,
  computeSkillScore,
  generateCareerPath,
  generateIndividualTrainingPlan,
  getGroupCoverage,
  getNextAssessmentDate,
  getSkillPrimaryMethod,
  getUserCoverage,
  isUserInAudience,
} from '../index';

// ── A minimal world ────────────────────────────────────────────────────────
// Everything the engine may read, and nothing else. Anything the engine does
// not need is simply absent, which is itself the assertion.

interface World {
  users?: Partial<User>[];
  skills?: Partial<Skill>[];
  jobs?: Partial<JobProfile>[];
  assessments?: Partial<Assessment>[];
  evidences?: Partial<Evidence>[];
  courses?: Partial<TrainingCourse>[];
  instructions?: Partial<AssessmentInstruction>[];
  /** Provisional (VERIFIED work-experience) baselines, by `userId:skillId`. */
  experience?: Record<string, number>;
  managers?: string[];
  /** Cheap general-department resolver: departmentId → general dept id. */
  general?: Record<string, string>;
}

function makeCtx(w: World): CompetencyContext {
  const users = (w.users || []) as User[];
  const skills = (w.skills || []) as Skill[];
  const jobs = (w.jobs || []) as JobProfile[];
  const courses = (w.courses || []) as TrainingCourse[];
  // The engine calls the CACHED wrappers on the real service; here a plain
  // memo stands in, which also proves the engine never depends on the cache
  // being warm or cold.
  const memo = new Map<string, { score: number; source: SkillScoreSource }>();

  const ctx: CompetencyContext = {
    getSkill: (id) => skills.find(s => s.id === id && !s.isArchived),
    getUserById: (id) => users.find(u => u.id === id && !u.isArchived),
    getJobProfile: (id) => jobs.find(j => j.id === id && !j.isArchived),
    getAllJobs: () => jobs.filter(j => !j.isArchived),
    getCoursesForSkill: (skillId) =>
      courses.filter(c => !c.isArchived && (c.linkedSkillIds || []).includes(skillId)),
    getEffectiveRequirements: (profile) =>
      (profile?.requiredSkills || []).filter(r => !!ctx.getSkill(r.skillId)),
    getGeneralDeptId: (deptId) => (deptId ? (w.general?.[deptId] ?? deptId) : undefined),
    isManager: (user) => (w.managers || []).includes(user.id),
    getExperienceBaseline: (userId, skillId) => w.experience?.[`${userId}:${skillId}`] ?? 0,
    getUserSkillScore: (userId, skillId, includeArchived) =>
      includeArchived
        ? computeSkillScore(ctx, userId, skillId, true).score
        : ctx.getUserSkillScoreDetail(userId, skillId).score,
    getUserSkillScoreDetail: (userId, skillId) => {
      const key = `${userId}:${skillId}`;
      const hit = memo.get(key);
      if (hit) return hit;
      const computed = computeSkillScore(ctx, userId, skillId, false);
      memo.set(key, computed);
      return computed;
    },
    assessments: (w.assessments || []) as Assessment[],
    evidences: (w.evidences || []) as Evidence[],
    assessmentInstructions: (w.instructions || []) as AssessmentInstruction[],
  };
  return ctx;
}

const ojtSkill = (id: string, extra: Partial<Skill> = {}): Partial<Skill> => ({
  id,
  name: `Skill ${id}`,
  assessmentMethods: [{ id: `m-${id}`, method: 'OJT_OBSERVATION', questions: [], frequency: 'ONE_TIME', audience: 'ALL' }],
  ...extra,
});

const examSkill = (id: string, extra: Partial<Skill> = {}): Partial<Skill> => ({
  id,
  name: `Skill ${id}`,
  assessmentMethods: [{ id: `m-${id}`, method: 'WRITTEN_EXAM', questions: [], frequency: 'ONE_TIME', audience: 'ALL' }],
  ...extra,
});

const rating = (a: Partial<Assessment>): Partial<Assessment> => ({ date: '2026-01-01T00:00:00.000Z', ...a });

describe('scoring', () => {
  it('blends a 360 skill Self 10 / Peer 30 / Manager 60', () => {
    const ctx = makeCtx({
      skills: [ojtSkill('s1')],
      assessments: [
        rating({ id: 'a1', subjectId: 'u1', skillId: 's1', raterId: 'u1', type: 'SELF', score: 5 }),
        rating({ id: 'a2', subjectId: 'u1', skillId: 's1', raterId: 'p1', type: 'PEER', score: 4 }),
        rating({ id: 'a3', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'MANAGER', score: 2 }),
      ],
    });
    // 5*.1 + 4*.3 + 2*.6 = 0.5 + 1.2 + 1.2 = 2.9 → 3
    expect(computeSkillScore(ctx, 'u1', 's1', false)).toEqual({ score: 3, source: 'ASSESSMENT' });
  });

  it('counts a repeat rater ONCE, at their latest rating', () => {
    const ctx = makeCtx({
      skills: [ojtSkill('s1')],
      assessments: [
        rating({ id: 'a1', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'MANAGER', score: 1, date: '2025-01-01T00:00:00.000Z' }),
        rating({ id: 'a2', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'MANAGER', score: 5, date: '2026-06-01T00:00:00.000Z' }),
      ],
    });
    // The old rating must not drag the average down: 5, not 3.
    expect(computeSkillScore(ctx, 'u1', 's1', false).score).toBe(5);
  });

  it('takes the LATEST direct assessment for a non-360 skill', () => {
    const ctx = makeCtx({
      skills: [examSkill('s1')],
      assessments: [
        rating({ id: 'a1', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'WRITTEN_EXAM', score: 2, date: '2026-06-01T00:00:00.000Z' }),
        rating({ id: 'a2', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'WRITTEN_EXAM', score: 4, date: '2026-01-01T00:00:00.000Z' }),
      ],
    });
    expect(computeSkillScore(ctx, 'u1', 's1', false)).toEqual({ score: 2, source: 'ASSESSMENT' });
  });

  it('falls back to APPROVED evidence, then to a provisional experience baseline', () => {
    const evidenceOnly = makeCtx({
      skills: [examSkill('s1')],
      evidences: [{ id: 'e1', userId: 'u1', skillId: 's1', status: 'APPROVED', assignedScore: 4 } as Partial<Evidence>],
    });
    expect(computeSkillScore(evidenceOnly, 'u1', 's1', false)).toEqual({ score: 4, source: 'EVIDENCE' });

    const experienceOnly = makeCtx({ skills: [examSkill('s1')], experience: { 'u1:s1': 3 } });
    expect(computeSkillScore(experienceOnly, 'u1', 's1', false)).toEqual({ score: 3, source: 'EXPERIENCE' });
  });

  it('reaches the experience tier from the 360 branch too', () => {
    // The regression this guards: the provisional fallback sits AFTER the
    // branch split, so an OJT skill (the default) is not skipped.
    const ctx = makeCtx({ skills: [ojtSkill('s1')], experience: { 'u1:s1': 2 } });
    expect(getSkillPrimaryMethod(ctx, 's1')).toBe('OJT_OBSERVATION');
    expect(computeSkillScore(ctx, 'u1', 's1', false)).toEqual({ score: 2, source: 'EXPERIENCE' });
  });

  it('reports NONE — not 0 as a verdict — when nothing was ever recorded', () => {
    const ctx = makeCtx({ skills: [ojtSkill('s1')] });
    expect(computeSkillScore(ctx, 'u1', 's1', false)).toEqual({ score: 0, source: 'NONE' });
  });
});

describe('coverage', () => {
  const world = (): World => ({
    users: [
      { id: 'u1', jobProfileId: 'j1', orgLevel: 'JP' },
      { id: 'u2', jobProfileId: 'j1', orgLevel: 'JP' },
      { id: 'u3' }, // no job profile — contributes nothing
    ],
    skills: [examSkill('s1'), examSkill('s2')],
    jobs: [{
      id: 'j1', orgLevel: 'JP',
      requiredSkills: [{ skillId: 's1', requiredLevel: 4 }, { skillId: 's2', requiredLevel: 3 }],
    } as Partial<JobProfile>],
  });

  it('returns compliancePct null — never 0 — when nothing is known', () => {
    const ctx = makeCtx(world());
    const cov = getUserCoverage(ctx, 'u1');
    expect(cov).toMatchObject({ required: 2, measured: 0, unknown: 2, known: 0 });
    expect(cov.compliancePct).toBeNull();
    expect(cov.avgGap).toBeNull();
  });

  it('computes compliance over the KNOWN skills only', () => {
    const w = world();
    w.assessments = [rating({ id: 'a1', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'WRITTEN_EXAM', score: 4 })];
    const cov = getUserCoverage(makeCtx(w), 'u1');
    // One of two measured, and that one is compliant → 100% of what is known,
    // with the unknown reported beside it rather than counted as a failure.
    expect(cov).toMatchObject({ required: 2, measured: 1, unknown: 1, known: 1, compliancePct: 100, totalGap: 0 });
  });

  it('counts a provisional score as known but NOT as measured', () => {
    const w = world();
    w.experience = { 'u1:s1': 3 };
    const cov = getUserCoverage(makeCtx(w), 'u1');
    expect(cov).toMatchObject({ measured: 0, provisional: 1, known: 1, unknown: 1, gapsKnown: 1, totalGap: 1 });
  });

  it('pools a group and lets a person with no job profile contribute nothing', () => {
    const w = world();
    w.assessments = [rating({ id: 'a1', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'WRITTEN_EXAM', score: 4 })];
    const cov = getGroupCoverage(makeCtx(w), ['u1', 'u2', 'u3']);
    expect(cov).toMatchObject({ required: 4, measured: 1, unknown: 3 });
  });
});

describe('scheduling', () => {
  it('matches an audience by org level, department, freshness and manager grade', () => {
    const ctx = makeCtx({
      users: [{ id: 'u1', orgLevel: 'FR', departmentId: 'd1' }, { id: 'u2', orgLevel: 'SH', departmentId: 'd2' }],
      managers: ['u2'],
    });
    expect(isUserInAudience(ctx, 'u1', { audience: 'ALL' })).toBe(true);
    expect(isUserInAudience(ctx, 'u1', { audience: 'FRESH_ONLY' })).toBe(true);
    expect(isUserInAudience(ctx, 'u2', { audience: 'FRESH_ONLY' })).toBe(false);
    expect(isUserInAudience(ctx, 'u2', { audience: 'MANAGERS_ONLY' })).toBe(true);
    expect(isUserInAudience(ctx, 'u1', { audience: 'MANAGERS_ONLY' })).toBe(false);
    expect(isUserInAudience(ctx, 'u2', { audience: 'ORG_LEVELS', audienceOrgLevels: ['SH'] })).toBe(true);
    expect(isUserInAudience(ctx, 'u1', { audience: 'DEPARTMENTS', audienceDepartmentIds: ['d1'] })).toBe(true);
    // A user the context cannot resolve is in no audience at all.
    expect(isUserInAudience(ctx, 'ghost', { audience: 'ALL' })).toBe(false);
  });

  it('never becomes due again when no block schedules the skill', () => {
    const ctx = makeCtx({ users: [{ id: 'u1' }], skills: [ojtSkill('s1')] }); // ONE_TIME
    expect(getNextAssessmentDate(ctx, 'u1', 's1')).toBeNull();
  });

  it('is due NOW when a recurring skill has never been assessed', () => {
    const ctx = makeCtx({
      users: [{ id: 'u1' }],
      skills: [ojtSkill('s1', {
        assessmentMethods: [{ id: 'm1', method: 'OJT_OBSERVATION', questions: [], frequency: 'QUARTERLY', audience: 'ALL' }],
      })],
    });
    const due = getNextAssessmentDate(ctx, 'u1', 's1');
    expect(due).toBeInstanceOf(Date);
    expect(due!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('takes the EARLIEST due date across the applicable blocks', () => {
    const lastYear = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
    const ctx = makeCtx({
      users: [{ id: 'u1' }],
      skills: [ojtSkill('s1', {
        assessmentMethods: [
          { id: 'm1', method: 'OJT_OBSERVATION', questions: [], frequency: 'ONE_TIME', audience: 'ALL' },
          { id: 'm2', method: 'INTERVIEW', questions: [], frequency: 'MONTHLY', audience: 'ALL' },
        ],
      })],
      assessments: [rating({ id: 'a1', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'INTERVIEW', score: 3, date: lastYear })],
    });
    // The ONE_TIME block contributes nothing; the monthly one is long overdue.
    expect(getNextAssessmentDate(ctx, 'u1', 's1')!.getTime()).toBeLessThan(Date.now());
  });
});

describe('career path', () => {
  const ladder = (): World => ({
    users: [{ id: 'u1', jobProfileId: 'j-jp', orgLevel: 'JP', departmentId: 'd1', generalDepartmentId: 'd1' }],
    skills: [examSkill('s1'), examSkill('s2')],
    jobs: [
      { id: 'j-jp', orgLevel: 'JP', departmentId: 'd1', requiredSkills: [] } as Partial<JobProfile>,
      { id: 'j-sp', orgLevel: 'SP', departmentId: 'd1', requiredSkills: [{ skillId: 's1', requiredLevel: 3 }, { skillId: 's2', requiredLevel: 3 }] } as Partial<JobProfile>,
    ],
  });

  it('withholds READY_NOW while ANY requirement is unmeasured', () => {
    const w = ladder();
    // s1 is met; s2 was never looked at.
    w.assessments = [rating({ id: 'a1', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'WRITTEN_EXAM', score: 3 })];
    const path = generateCareerPath(makeCtx(w), 'u1')!;
    const sp = path.roadmap.find(r => r.level === 'SP')!;
    expect(sp.unmeasuredCount).toBe(1);
    expect(sp.readinessStatus).not.toBe('READY_NOW');
    // …and the unmeasured skill adds NO phantom gap points.
    expect(sp.requirements.find(r => r.skillId === 's2')!.isMeasured).toBe(false);
  });

  it('grants READY_NOW only when every requirement is measured and met', () => {
    const w = ladder();
    w.assessments = [
      rating({ id: 'a1', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'WRITTEN_EXAM', score: 3 }),
      rating({ id: 'a2', subjectId: 'u1', skillId: 's2', raterId: 'm1', type: 'WRITTEN_EXAM', score: 4 }),
    ];
    const sp = generateCareerPath(makeCtx(w), 'u1')!.roadmap.find(r => r.level === 'SP')!;
    expect(sp).toMatchObject({ unmeasuredCount: 0, readinessStatus: 'READY_NOW' });
  });

  it('stays on the most conservative bucket when NOTHING is measured', () => {
    const sp = generateCareerPath(makeCtx(ladder()), 'u1')!.roadmap.find(r => r.level === 'SP')!;
    expect(sp.readinessStatus).toBe('DEVELOPMENT_NEEDED');
  });
});

describe('ITP', () => {
  it('ranks worst-first by WEIGHTED gap, so a shallow safety gap outranks a deep optional one', () => {
    const ctx = makeCtx({
      users: [{ id: 'u1', jobProfileId: 'j1', orgLevel: 'JP' }],
      skills: [
        examSkill('safety', { criticality: 'SAFETY_CRITICAL' }),
        examSkill('nice', { criticality: 'LOW' }),
      ],
      jobs: [{
        id: 'j1', orgLevel: 'JP',
        requiredSkills: [{ skillId: 'safety', requiredLevel: 4 }, { skillId: 'nice', requiredLevel: 5 }],
      } as Partial<JobProfile>],
      assessments: [
        // 1-level gap on the safety skill (weight ×3 → 3)…
        rating({ id: 'a1', subjectId: 'u1', skillId: 'safety', raterId: 'm1', type: 'WRITTEN_EXAM', score: 3 }),
        // …vs a 2-level gap on the LOW one (weight ×0.5 → 1).
        rating({ id: 'a2', subjectId: 'u1', skillId: 'nice', raterId: 'm1', type: 'WRITTEN_EXAM', score: 3 }),
      ],
    });
    const itp = generateIndividualTrainingPlan(ctx, 'u1')!;
    expect(itp.recommendations.map(r => r.skillId)).toEqual(['safety', 'nice']);
    expect(itp.recommendations[0]).toMatchObject({ gap: 1, priority: 'HIGH' });
    expect(itp.recommendations[1]).toMatchObject({ gap: 2, priority: 'MEDIUM' });
  });

  it('names a real course when one is linked, and says so plainly when none is', () => {
    const base: World = {
      users: [{ id: 'u1', jobProfileId: 'j1', orgLevel: 'JP' }],
      skills: [examSkill('s1')],
      jobs: [{ id: 'j1', orgLevel: 'JP', requiredSkills: [{ skillId: 's1', requiredLevel: 4 }] } as Partial<JobProfile>],
      assessments: [rating({ id: 'a1', subjectId: 'u1', skillId: 's1', raterId: 'm1', type: 'WRITTEN_EXAM', score: 1 })],
    };
    const without = generateIndividualTrainingPlan(makeCtx(base), 'u1')!;
    expect(without.recommendations[0].recommendation).toContain('Intensive training');
    expect(without.recommendations[0].courseId).toBeUndefined();

    const withCourse = generateIndividualTrainingPlan(
      makeCtx({ ...base, courses: [{ id: 'c1', title: 'Pumps 101', provider: 'EPROM', linkedSkillIds: ['s1'] } as Partial<TrainingCourse>] }),
      'u1',
    )!;
    expect(withCourse.recommendations[0].recommendation).toContain('Pumps 101');
    expect(withCourse.recommendations[0].courseId).toBe('c1');
  });

  it('proposes nothing for a person with no job profile', () => {
    const ctx = makeCtx({ users: [{ id: 'u1', orgLevel: 'JP' }] });
    expect(generateIndividualTrainingPlan(ctx, 'u1')).toBeNull();
  });
});
