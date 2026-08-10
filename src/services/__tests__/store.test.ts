/**
 * Unit tests for DataService core computation methods.
 *
 * The backend compat shims are fully mocked — no network calls are made.
 * Private fields are populated via `(svc as any)` casts so we can exercise the
 * pure logic without needing real backend documents.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Backend (compat-shim) mocks (must come before any store import) ─────────
vi.mock('../firestore-compat', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ id: 'mock-id' })),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  or: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  startAfter: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()), // returns unsubscribe fn
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: vi.fn(),
  compatDb: {},
}));

vi.mock('../auth-compat', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: null) => void) => { cb(null); return vi.fn(); }),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  compatAuth: { currentUser: null },
}));
// Stored monthly snapshots are the ONE thing the store reads over plain REST
// rather than through the compat shims — see getCompetencySnapshots.
const apiGet = vi.fn();
vi.mock('../api-client', () => ({
  api: { get: (path: string) => apiGet(path), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ApiError: class ApiError extends Error {},
  ApiNetworkError: class ApiNetworkError extends Error {},
  getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(),
}));
// ────────────────────────────────────────────────────────────────────────────

import { DataService } from '../store';
import type { User, Skill, Assessment, Evidence, SkillAssessmentMethod, JobProfile, TrainingCourse, Department, WorkExperience, DevelopmentPlan } from '../../types';
import { Role } from '../../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSvc(): DataService {
  return new DataService();
}

/** Inject private array fields without TypeScript errors. */
function inject(svc: DataService, fields: Record<string, unknown>) {
  Object.assign(svc as unknown as Record<string, unknown>, fields);
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    name: 'Test User',
    email: 'test@example.com',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'dept1',
    orgLevel: 'SP',
    managerId: undefined,
    jobProfileId: 'job1',
    avatarUrl: '',
    certificates: [],
    careerHistory: [],
    ...overrides,
  };
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'skill1',
    name: 'Test Skill',
    category: 'Technical',
    levels: {},
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<Assessment> = {}): Assessment {
  return {
    id: 'a1',
    subjectId: 'u1',
    raterId: 'u1',
    skillId: 'skill1',
    score: 3,
    type: 'SELF',
    date: '2025-01-01',
    cycleId: 'cycle1',
    isArchived: false,
    ...overrides,
  } as Assessment;
}

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: 'e1',
    userId: 'u1',
    skillId: 'skill1',
    status: 'APPROVED',
    assignedScore: 4,
    submittedAt: '2025-01-01',
    title: 'Evidence 1',
    ...overrides,
  } as Evidence;
}

function makeWorkExperience(overrides: Partial<WorkExperience> = {}): WorkExperience {
  return {
    id: 'we1',
    userId: 'u1',
    employer: 'Acme Corp',
    jobTitle: 'Technician',
    startDate: '2010-01-01',
    endDate: '2020-01-01',
    skills: [],
    status: 'VERIFIED',
    submittedAt: '2025-01-01',
    ...overrides,
  } as WorkExperience;
}

function makeMethod(overrides: Partial<SkillAssessmentMethod> = {}): SkillAssessmentMethod {
  return {
    id: 'm1',
    method: 'WRITTEN_EXAM',
    frequency: 'ONE_TIME',
    audience: 'ALL',
    questions: [],
    ...overrides,
  };
}

/** A skill carrying inline assessment method blocks. */
function makeSkillWithMethods(methods: SkillAssessmentMethod[], overrides: Partial<Skill> = {}): Skill {
  return makeSkill({ id: 'skill1', assessmentMethods: methods, ...overrides });
}

// ─── getUserSkillScore ───────────────────────────────────────────────────────

describe('getUserSkillScore', () => {
  let svc: DataService;
  const OJT_SKILL = makeSkill({ id: 'skill-ojt', assessmentMethod: 'OJT_OBSERVATION' });
  const EXAM_SKILL = makeSkill({ id: 'skill-exam', assessmentMethod: 'WRITTEN_EXAM' });

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, {
      skills: [OJT_SKILL, EXAM_SKILL],
      assessments: [],
      evidences: [],
      assessmentInstructions: [],
    });
  });

  it('returns 0 when skill not found', () => {
    expect(svc.getUserSkillScore('u1', 'nonexistent')).toBe(0);
  });

  it('returns 0 when no assessments exist (OJT path)', () => {
    expect(svc.getUserSkillScore('u1', 'skill-ojt')).toBe(0);
  });

  it('360 path — manager-only score (weight 60%) rounds correctly', () => {
    inject(svc, {
      assessments: [makeAssessment({ skillId: 'skill-ojt', type: 'MANAGER', score: 5 })],
    });
    // Only manager (60% weight) → weightedScore=3, totalWeight=0.6 → 3/0.6=5
    expect(svc.getUserSkillScore('u1', 'skill-ojt')).toBe(5);
  });

  it('360 path — full 360 weighted average (self 10, peer 30, manager 60)', () => {
    inject(svc, {
      assessments: [
        makeAssessment({ id: 'a-self',  skillId: 'skill-ojt', type: 'SELF',    score: 2 }),
        makeAssessment({ id: 'a-peer',  skillId: 'skill-ojt', type: 'PEER',    score: 3 }),
        makeAssessment({ id: 'a-mgr',   skillId: 'skill-ojt', type: 'MANAGER', score: 4 }),
      ],
    });
    // (2×0.1 + 3×0.3 + 4×0.6) / (0.1+0.3+0.6) = (0.2+0.9+2.4)/1 = 3.5 → rounds to 4
    expect(svc.getUserSkillScore('u1', 'skill-ojt')).toBe(4);
  });

  it('360 path — custom rater weights override the default blend', () => {
    // Skill with an OJT block weighting manager 100% (self/peer 0%).
    const skill = makeSkillWithMethods(
      [makeMethod({ method: 'OJT_OBSERVATION', audience: 'ALL', raterWeights: { self: 0, peer: 0, manager: 100 } })],
      { id: 'skill-ojt-weighted' }
    );
    inject(svc, {
      skills: [skill],
      users: [makeUser()],
      assessments: [
        makeAssessment({ id: 'w-self', skillId: 'skill-ojt-weighted', type: 'SELF',    score: 1 }),
        makeAssessment({ id: 'w-peer', skillId: 'skill-ojt-weighted', type: 'PEER',    score: 1 }),
        makeAssessment({ id: 'w-mgr',  skillId: 'skill-ojt-weighted', type: 'MANAGER', score: 5 }),
      ],
    });
    // Manager-only weighting → score is the manager rating (5), ignoring self/peer.
    expect(svc.getUserSkillScore('u1', 'skill-ojt-weighted')).toBe(5);
  });

  it('360 path — falls back to default blend when no rater weights configured', () => {
    inject(svc, {
      users: [makeUser()],
      assessments: [
        makeAssessment({ id: 'd-self', skillId: 'skill-ojt', type: 'SELF',    score: 2 }),
        makeAssessment({ id: 'd-peer', skillId: 'skill-ojt', type: 'PEER',    score: 3 }),
        makeAssessment({ id: 'd-mgr',  skillId: 'skill-ojt', type: 'MANAGER', score: 4 }),
      ],
    });
    // Same as the default 10/30/60 blend → 3.5 rounds to 4.
    expect(svc.getUserSkillScore('u1', 'skill-ojt')).toBe(4);
  });

  it('direct assessment path — returns latest score (not highest)', () => {
    inject(svc, {
      assessments: [
        makeAssessment({ id: 'old', skillId: 'skill-exam', type: 'WRITTEN_EXAM', score: 5, date: '2024-01-01' }),
        makeAssessment({ id: 'new', skillId: 'skill-exam', type: 'WRITTEN_EXAM', score: 2, date: '2025-06-01' }),
      ],
    });
    expect(svc.getUserSkillScore('u1', 'skill-exam')).toBe(2);
  });

  it('evidence path — returns highest approved score when no direct assessments', () => {
    inject(svc, {
      assessments: [],
      evidences: [
        makeEvidence({ id: 'e1', skillId: 'skill-exam', assignedScore: 3 }),
        makeEvidence({ id: 'e2', skillId: 'skill-exam', assignedScore: 5 }),
      ],
    });
    expect(svc.getUserSkillScore('u1', 'skill-exam')).toBe(5);
  });

  it('evidence path — ignores unapproved evidence', () => {
    inject(svc, {
      assessments: [],
      evidences: [
        makeEvidence({ id: 'e1', skillId: 'skill-exam', status: 'PENDING', assignedScore: 5 }),
      ],
    });
    expect(svc.getUserSkillScore('u1', 'skill-exam')).toBe(0);
  });

  it('caches result and returns cached value on second call', () => {
    inject(svc, {
      assessments: [makeAssessment({ skillId: 'skill-ojt', type: 'MANAGER', score: 4 })],
    });
    const first = svc.getUserSkillScore('u1', 'skill-ojt');
    // Remove the underlying assessment to prove cache is used
    inject(svc, { assessments: [] });
    const second = svc.getUserSkillScore('u1', 'skill-ojt');
    expect(first).toBe(second);
  });
});

// ─── getNextAssessmentDate ───────────────────────────────────────────────────

describe('getNextAssessmentDate', () => {
  let svc: DataService;
  const USER = makeUser();

  // Inject the target skill carrying the given inline assessment method blocks.
  const withMethods = (methods: SkillAssessmentMethod[]) =>
    inject(svc, { skills: [makeSkillWithMethods(methods)] });

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, {
      skills: [makeSkill({ id: 'skill1' })],
      users: [USER],
      assessments: [],
      evidences: [],
    });
  });

  it('returns null when no method block schedules the skill', () => {
    expect(svc.getNextAssessmentDate('u1', 'skill1')).toBeNull();
  });

  it('ONE_TIME frequency always returns null (never recurs)', () => {
    withMethods([makeMethod({ frequency: 'ONE_TIME' })]);
    expect(svc.getNextAssessmentDate('u1', 'skill1')).toBeNull();
  });

  it('WEEKLY frequency — overdue when never assessed', () => {
    withMethods([makeMethod({ frequency: 'WEEKLY' })]);
    const date = svc.getNextAssessmentDate('u1', 'skill1');
    expect(date).not.toBeNull();
    expect(date!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('WEEKLY frequency — schedules 7 days after last assessment', () => {
    const lastDate = new Date('2025-01-01');
    withMethods([makeMethod({ frequency: 'WEEKLY' })]);
    inject(svc, { assessments: [makeAssessment({ date: lastDate.toISOString() })] });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    const expected = new Date(lastDate);
    expected.setDate(expected.getDate() + 7);
    expect(date.toDateString()).toBe(expected.toDateString());
  });

  it('MONTHLY frequency — schedules 1 month after last assessment', () => {
    const lastDate = new Date('2025-01-01');
    withMethods([makeMethod({ frequency: 'MONTHLY' })]);
    inject(svc, { assessments: [makeAssessment({ date: lastDate.toISOString() })] });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    const expected = new Date(lastDate);
    expected.setMonth(expected.getMonth() + 1);
    expect(date.toDateString()).toBe(expected.toDateString());
  });

  it('QUARTERLY frequency — schedules 3 months after last assessment', () => {
    const lastDate = new Date('2025-01-01');
    withMethods([makeMethod({ frequency: 'QUARTERLY' })]);
    inject(svc, { assessments: [makeAssessment({ date: lastDate.toISOString() })] });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    const expected = new Date(lastDate);
    expected.setMonth(expected.getMonth() + 3);
    expect(date.toDateString()).toBe(expected.toDateString());
  });

  it('ANYTIME_ANNUAL — overdue when never assessed this year', () => {
    withMethods([makeMethod({ frequency: 'ANYTIME_ANNUAL' })]);
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    expect(date.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('ANYTIME_ANNUAL — assessed this year: next due at start of next year', () => {
    const thisYear = new Date().getFullYear();
    withMethods([makeMethod({ frequency: 'ANYTIME_ANNUAL' })]);
    inject(svc, { assessments: [makeAssessment({ date: `${thisYear}-01-15` })] });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    expect(date.getFullYear()).toBe(thisYear + 1);
  });

  it('CERTIFICATE_BASED — overdue when no approved evidence with expiryDate', () => {
    withMethods([makeMethod({ frequency: 'CERTIFICATE_BASED' })]);
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    expect(date.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('CERTIFICATE_BASED — due date equals evidence expiry', () => {
    const expiry = '2027-03-15';
    withMethods([makeMethod({ frequency: 'CERTIFICATE_BASED' })]);
    inject(svc, { evidences: [makeEvidence({ expiryDate: expiry })] });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    expect(date.toISOString().slice(0, 10)).toBe(expiry);
  });

  it('picks the earliest date when multiple method blocks apply', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const later = new Date();
    later.setMonth(later.getMonth() + 3);
    withMethods([
      makeMethod({ id: 'm-w', frequency: 'WEEKLY' }),
      makeMethod({ id: 'm-q', frequency: 'QUARTERLY' }),
    ]);
    inject(svc, { assessments: [makeAssessment({ id: 'a-w', date: soon.toISOString() })] });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    // Weekly is sooner than quarterly
    expect(date.getTime()).toBeLessThan(later.getTime());
  });
});

// ─── isUserInAudience ────────────────────────────────────────────────────────

describe('isUserInAudience', () => {
  let svc: DataService;

  const EMPLOYEE = makeUser({ id: 'emp1', orgLevel: 'SP', departmentId: 'dept1' });
  const FRESH = makeUser({ id: 'fresh1', orgLevel: 'FR', departmentId: 'dept1' });
  const MANAGER = makeUser({ id: 'mgr1', orgLevel: 'SH', departmentId: 'dept2' });

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, {
      users: [EMPLOYEE, FRESH, MANAGER],
      departments: [],
    });
  });

  it('ALL — matches every user', () => {
    const m = makeMethod({ audience: 'ALL' });
    expect(svc.isUserInAudience('emp1', m)).toBe(true);
    expect(svc.isUserInAudience('fresh1', m)).toBe(true);
    expect(svc.isUserInAudience('mgr1', m)).toBe(true);
  });

  it('FRESH_ONLY — only FR org level', () => {
    const m = makeMethod({ audience: 'FRESH_ONLY' });
    expect(svc.isUserInAudience('fresh1', m)).toBe(true);
    expect(svc.isUserInAudience('emp1', m)).toBe(false);
  });

  it('MANAGERS_ONLY — managerial org levels are included', () => {
    const m = makeMethod({ audience: 'MANAGERS_ONLY' });
    // SH is in managerialLevels
    expect(svc.isUserInAudience('mgr1', m)).toBe(true);
    // SP is not
    expect(svc.isUserInAudience('emp1', m)).toBe(false);
  });

  it('ORG_LEVELS — matches specified org levels', () => {
    const m = makeMethod({ audience: 'ORG_LEVELS', audienceOrgLevels: ['SP', 'JP'] });
    expect(svc.isUserInAudience('emp1', m)).toBe(true);
    expect(svc.isUserInAudience('fresh1', m)).toBe(false);
    expect(svc.isUserInAudience('mgr1', m)).toBe(false);
  });

  it('DEPARTMENTS — matches specified department IDs', () => {
    const m = makeMethod({ audience: 'DEPARTMENTS', audienceDepartmentIds: ['dept1'] });
    expect(svc.isUserInAudience('emp1', m)).toBe(true);
    expect(svc.isUserInAudience('fresh1', m)).toBe(true);
    expect(svc.isUserInAudience('mgr1', m)).toBe(false);
  });

  it('returns false for unknown user', () => {
    const m = makeMethod({ audience: 'ALL' });
    expect(svc.isUserInAudience('nonexistent', m)).toBe(false);
  });
});

// ─── generateCareerPath ──────────────────────────────────────────────────────

describe('generateCareerPath', () => {
  let svc: DataService;

  const SKILL = makeSkill({ id: 'skill1', assessmentMethod: 'WRITTEN_EXAM' });

  const makeJob = (overrides: Partial<JobProfile> = {}): JobProfile => ({
    id: 'job1',
    title: 'Test Job',
    description: '',
    departmentId: 'dept1',
    orgLevel: 'SP',
    requiredSkills: [],
    ...overrides,
  } as unknown as JobProfile);

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, {
      skills: [SKILL],
      assessments: [],
      evidences: [],
      departments: [{ id: 'dept1', name: 'General', type: 'GENERAL', managerId: '' }],
      assessmentInstructions: [],
    });
  });

  it('returns null when user has no jobProfileId', () => {
    inject(svc, { users: [makeUser({ jobProfileId: undefined })], jobs: [] });
    expect(svc.generateCareerPath('u1')).toBeNull();
  });

  it('returns null when user has no orgLevel', () => {
    inject(svc, { users: [makeUser({ orgLevel: undefined })], jobs: [] });
    expect(svc.generateCareerPath('u1')).toBeNull();
  });

  it('READY_NOW — gap is 0 (current score meets requirement)', () => {
    inject(svc, {
      users: [makeUser({ orgLevel: 'JP' })],
      jobs: [makeJob({ orgLevel: 'SP', requiredSkills: [{ skillId: 'skill1', requiredLevel: 3 }] })],
      assessments: [makeAssessment({ type: 'WRITTEN_EXAM', score: 3 })],
    });
    const plan = svc.generateCareerPath('u1')!;
    const spLevel = plan.roadmap.find(r => r.level === 'SP');
    expect(spLevel?.readinessStatus).toBe('READY_NOW');
  });

  it('READY_1_2_YEARS — total gap ≤ 2', () => {
    inject(svc, {
      users: [makeUser({ orgLevel: 'JP' })],
      jobs: [makeJob({ orgLevel: 'SP', requiredSkills: [{ skillId: 'skill1', requiredLevel: 4 }] })],
      assessments: [makeAssessment({ type: 'WRITTEN_EXAM', score: 3 })],
    });
    const plan = svc.generateCareerPath('u1')!;
    const spLevel = plan.roadmap.find(r => r.level === 'SP');
    expect(spLevel?.readinessStatus).toBe('READY_1_2_YEARS');
  });

  it('READY_3_5_YEARS — total gap ≤ 5', () => {
    inject(svc, {
      users: [makeUser({ orgLevel: 'JP' })],
      jobs: [makeJob({ orgLevel: 'SP', requiredSkills: [{ skillId: 'skill1', requiredLevel: 5 }] })],
      assessments: [makeAssessment({ type: 'WRITTEN_EXAM', score: 2 })],
    });
    const plan = svc.generateCareerPath('u1')!;
    const spLevel = plan.roadmap.find(r => r.level === 'SP');
    expect(spLevel?.readinessStatus).toBe('READY_3_5_YEARS');
  });

  it('DEVELOPMENT_NEEDED — total gap > 5', () => {
    inject(svc, {
      users: [makeUser({ orgLevel: 'JP' })],
      jobs: [makeJob({ orgLevel: 'SP', requiredSkills: [{ skillId: 'skill1', requiredLevel: 5 }] })],
      assessments: [], // score = 0, gap = 5 — BUT since gap exactly 5, READY_3_5_YEARS
      // gap > 5 requires score = 0 and level > 5 which is impossible
      // use two skills instead:
    });
    // Re-inject with score 0 and two requirements totalling gap > 5
    const SKILL2 = makeSkill({ id: 'skill2', assessmentMethod: 'WRITTEN_EXAM' });
    inject(svc, {
      skills: [SKILL, SKILL2],
      users: [makeUser({ orgLevel: 'JP' })],
      jobs: [makeJob({
        orgLevel: 'SP',
        requiredSkills: [
          { skillId: 'skill1', requiredLevel: 4 },
          { skillId: 'skill2', requiredLevel: 4 },
        ],
      })],
      assessments: [],
    });
    const plan = svc.generateCareerPath('u1')!;
    const spLevel = plan.roadmap.find(r => r.level === 'SP');
    expect(spLevel?.readinessStatus).toBe('DEVELOPMENT_NEEDED');
  });

  it('roadmap starts from the level above the current and goes up to CEO', () => {
    inject(svc, {
      users: [makeUser({ orgLevel: 'SH' })],
      jobs: [makeJob()],
    });
    const plan = svc.generateCareerPath('u1')!;
    const levels = plan.roadmap.map(r => r.level);
    expect(levels).toEqual(['DM', 'AGM', 'GM', 'ACEO', 'CEO']);
  });
});

// ─── generateIndividualTrainingPlan ─────────────────────────────────────────

describe('generateIndividualTrainingPlan', () => {
  let svc: DataService;

  const SKILL = makeSkill({ id: 'skill1', assessmentMethod: 'WRITTEN_EXAM' });
  const USER = makeUser({ orgLevel: 'SP', jobProfileId: 'job1' });

  const JOB: JobProfile = {
    id: 'job1',
    title: 'Test Job',
    description: '',
    departmentId: 'dept1',
    orgLevel: 'SP',
    requiredSkills: [{ skillId: 'skill1', requiredLevel: 4 }],
  } as unknown as JobProfile;

  const COURSE: TrainingCourse = {
    id: 'course1',
    title: 'Skill Training 101',
    provider: 'Acme',
    linkedSkillIds: ['skill1'],
  } as TrainingCourse;

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, {
      skills: [SKILL],
      users: [USER],
      jobs: [JOB],
      assessments: [],
      evidences: [],
      trainingCourses: [],
      assessmentInstructions: [],
    });
  });

  it('returns null when user has no jobProfileId', () => {
    inject(svc, { users: [makeUser({ jobProfileId: undefined })] });
    expect(svc.generateIndividualTrainingPlan('u1')).toBeNull();
  });

  it('returns empty recommendations when all skills meet required levels', () => {
    inject(svc, {
      assessments: [makeAssessment({ type: 'WRITTEN_EXAM', score: 4 })],
    });
    const itp = svc.generateIndividualTrainingPlan('u1')!;
    expect(itp.recommendations).toHaveLength(0);
  });

  it('generates a recommendation when there is a skill gap', () => {
    // score=0, required=4 → gap=4
    const itp = svc.generateIndividualTrainingPlan('u1')!;
    expect(itp.recommendations).toHaveLength(1);
    expect(itp.recommendations[0].skillId).toBe('skill1');
    expect(itp.recommendations[0].gap).toBe(4);
    expect(itp.recommendations[0].priority).toBe('HIGH');
  });

  it('links a matching training course when one exists', () => {
    inject(svc, { trainingCourses: [COURSE] });
    const itp = svc.generateIndividualTrainingPlan('u1')!;
    expect(itp.recommendations[0].courseId).toBe('course1');
    expect(itp.recommendations[0].recommendation).toContain('Skill Training 101');
  });

  it('recommendations are sorted by gap descending', () => {
    const SKILL2 = makeSkill({ id: 'skill2', assessmentMethod: 'WRITTEN_EXAM' });
    inject(svc, {
      skills: [SKILL, SKILL2],
      jobs: [{
        ...JOB,
        requiredSkills: [
          { skillId: 'skill1', requiredLevel: 3 },
          { skillId: 'skill2', requiredLevel: 5 },
        ],
      }],
      assessments: [],
    });
    const itp = svc.generateIndividualTrainingPlan('u1')!;
    expect(itp.recommendations[0].gap).toBeGreaterThanOrEqual(itp.recommendations[1].gap);
  });

  // Task 8: a gap is ranked by how much the skill matters, not only how deep it
  // is — the same weighting the training-needs analysis applies to a unit.
  it('puts a shallow safety-critical gap above a deeper nice-to-have one', () => {
    const SAFETY = makeSkill({ id: 'safety1', assessmentMethod: 'WRITTEN_EXAM', criticality: 'SAFETY_CRITICAL' });
    const NICE = makeSkill({ id: 'nice1', assessmentMethod: 'WRITTEN_EXAM', criticality: 'LOW' });
    inject(svc, {
      skills: [SAFETY, NICE],
      jobs: [{
        ...JOB,
        requiredSkills: [
          { skillId: 'safety1', requiredLevel: 1 },  // gap 1 × 3 = 3
          { skillId: 'nice1', requiredLevel: 4 },    // gap 4 × 0.5 = 2
        ],
      }],
      assessments: [],
    });
    const itp = svc.generateIndividualTrainingPlan('u1')!;
    expect(itp.recommendations.map(r => r.skillId)).toEqual(['safety1', 'nice1']);
    expect(itp.recommendations[0].priority).toBe('HIGH');
  });

  it('leaves a legacy skill with no criticality ranking exactly as before', () => {
    // Nothing set ⇒ STANDARD ⇒ weight 1 ⇒ gap 4 is still a HIGH priority.
    const itp = svc.generateIndividualTrainingPlan('u1')!;
    expect(itp.recommendations[0].priority).toBe('HIGH');
  });
});

// ─── Development plans (the SAVED training plan) ────────────────────────────

describe('development plans', () => {
  let svc: DataService;
  let updateDocMock: ReturnType<typeof vi.fn>;
  let setDocMock: ReturnType<typeof vi.fn>;

  const SKILL1 = makeSkill({ id: 'skill1', name: 'Pumps', assessmentMethod: 'WRITTEN_EXAM' });
  const SKILL2 = makeSkill({ id: 'skill2', name: 'Valves', assessmentMethod: 'WRITTEN_EXAM' });
  const EMPLOYEE = makeUser({ id: 'u1', managerId: 'mgr1' });
  const MANAGER = makeUser({ id: 'mgr1', orgLevel: 'SH', managerId: undefined });
  const STRANGER = makeUser({ id: 'u9', managerId: undefined });

  const JOB: JobProfile = {
    id: 'job1',
    title: 'Test Job',
    description: '',
    departmentId: 'dept1',
    orgLevel: 'SP',
    requiredSkills: [
      { skillId: 'skill1', requiredLevel: 4 },
      { skillId: 'skill2', requiredLevel: 3 },
    ],
  } as unknown as JobProfile;

  /** A plan already "in the store", as the listener would have delivered it. */
  const makePlan = (overrides: Partial<DevelopmentPlan> = {}): DevelopmentPlan => ({
    id: 'plan1',
    userId: 'u1',
    title: 'Plan',
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'mgr1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    items: [
      {
        id: 'item1',
        skillId: 'skill1',
        skillName: 'Pumps',
        requiredLevel: 4,
        levelAtPlanning: 2,
        gapAtPlanning: 2,
        recommendation: 'Course',
        priority: 'HIGH',
        status: 'NOT_STARTED',
        targetDate: '2026-06-01T00:00:00.000Z',
        supervisorSignOff: false,
      },
    ],
    ...overrides,
  });

  /** The document body handed to the backend by the last write. */
  const lastWrite = (): any => {
    const calls = updateDocMock.mock.calls;
    return calls.length > 0 ? calls[calls.length - 1][1] : undefined;
  };

  beforeEach(async () => {
    const compat = await import('../firestore-compat');
    updateDocMock = compat.updateDoc as ReturnType<typeof vi.fn>;
    setDocMock = compat.setDoc as ReturnType<typeof vi.fn>;
    updateDocMock.mockClear();
    setDocMock.mockClear();

    svc = makeSvc();
    inject(svc, {
      skills: [SKILL1, SKILL2],
      users: [EMPLOYEE, MANAGER, STRANGER],
      jobs: [JOB],
      // skill1 measured at 2 (gap of 2); skill2 never assessed.
      assessments: [makeAssessment({ id: 'a1', type: 'WRITTEN_EXAM', skillId: 'skill1', score: 2 })],
      evidences: [],
      trainingCourses: [],
      assessmentInstructions: [],
      workExperiences: [],
      developmentPlans: [],
      notifications: [],
    });
  });

  it('proposes items for measured gaps only — a never-assessed skill is not a training need', () => {
    const items = svc.proposeDevelopmentPlanItems('u1');
    expect(items.map(i => i.skillId)).toEqual(['skill1']);
    // The level is FROZEN on the item — this is what makes before/after provable.
    expect(items[0].levelAtPlanning).toBe(2);
    expect(items[0].gapAtPlanning).toBe(2);
    expect(items[0].requiredLevel).toBe(4);
    expect(items[0].sourceAtPlanning).toBe('ASSESSMENT');
    expect(items[0].status).toBe('NOT_STARTED');
    expect(items[0].supervisorSignOff).toBe(false);
  });

  it('creates a DRAFT by default and records the coverage it was written from', async () => {
    const plan = await svc.createDevelopmentPlan('u1', { createdBy: 'u1' });
    expect(plan.status).toBe('DRAFT');
    expect(plan.activatedAt).toBeUndefined();
    expect(plan.items).toHaveLength(1);
    // 2 required skills, 1 measured, 1 never assessed — the base the plan covers.
    expect(plan.coverageAtPlanning).toEqual({ required: 2, measured: 1, provisional: 0, unknown: 1 });
    expect(setDocMock).toHaveBeenCalled();
  });

  it('a manager assigning a plan starts it ACTIVE and stamps activation', async () => {
    const plan = await svc.createDevelopmentPlan('u1', { createdBy: 'mgr1', status: 'ACTIVE' });
    expect(plan.status).toBe('ACTIVE');
    expect(plan.activatedAt).toBeTruthy();
  });

  it('completing an item stamps it; re-opening drops the completion and any sign-off', async () => {
    inject(svc, {
      developmentPlans: [makePlan({
        items: [{ ...makePlan().items[0], status: 'COMPLETED', completedAt: '2026-02-01T00:00:00.000Z', supervisorSignOff: true, signedOffBy: 'mgr1', levelAtSignOff: 4 }],
      })],
    });

    await svc.setDevelopmentPlanItemStatus('plan1', 'item1', 'IN_PROGRESS');
    const item = lastWrite().items[0];
    expect(item.status).toBe('IN_PROGRESS');
    expect(item.completedAt).toBeUndefined();
    expect(item.supervisorSignOff).toBe(false);
    expect(item.levelAtSignOff).toBeUndefined();
    expect(item.startedAt).toBeTruthy();
  });

  it('sign-off stores the level measured TODAY against the frozen planning level', async () => {
    inject(svc, {
      developmentPlans: [makePlan({ items: [{ ...makePlan().items[0], status: 'COMPLETED', completedAt: '2026-02-01T00:00:00.000Z' }] })],
      // The employee has since been re-assessed at 4 — the plan worked.
      assessments: [makeAssessment({ id: 'a2', type: 'WRITTEN_EXAM', skillId: 'skill1', score: 4, date: '2026-03-01' })],
    });

    await svc.signOffDevelopmentPlanItem('plan1', 'item1', 'mgr1', 'Verified on the unit');
    const written = lastWrite();
    expect(written.items[0].supervisorSignOff).toBe(true);
    expect(written.items[0].signedOffBy).toBe('mgr1');
    expect(written.items[0].levelAtSignOff).toBe(4);
    expect(written.items[0].levelAtPlanning).toBe(2);
    // Every live item is signed off, so the plan closes itself.
    expect(written.status).toBe('COMPLETED');
    expect(written.completedAt).toBeTruthy();
  });

  it('progress joins today\'s score back on and never divides by a cancelled item', () => {
    const plan = makePlan({
      items: [
        { ...makePlan().items[0], id: 'i1', status: 'COMPLETED', supervisorSignOff: true, levelAtSignOff: 4 },
        { ...makePlan().items[0], id: 'i2', skillId: 'skill2', skillName: 'Valves', requiredLevel: 3, levelAtPlanning: 1, gapAtPlanning: 2, status: 'CANCELLED' },
      ],
    });
    inject(svc, { developmentPlans: [plan] });

    const p = svc.getDevelopmentPlanProgress(plan);
    expect(p.total).toBe(2);
    expect(p.cancelled).toBe(1);
    // 1 completed of 1 still in play — the cancelled item is not a denominator.
    expect(p.completedPct).toBe(100);
    expect(p.signedOff).toBe(1);
    // skill1 currently measures 2 against a planning level of 2 ⇒ no gain yet.
    expect(p.items[0].currentLevel).toBe(2);
    expect(p.items[0].improvement).toBe(0);
    expect(p.levelsGained).toBe(0);
    expect(p.items[0].metRequirement).toBe(false);
  });

  it('an empty plan reports null completion rather than 0%', () => {
    const plan = makePlan({ items: [] });
    expect(svc.getDevelopmentPlanProgress(plan).completedPct).toBeNull();
  });

  it('the sign-off queue shows a report\'s completed items, never the reviewer\'s own', () => {
    inject(svc, {
      developmentPlans: [
        makePlan({ id: 'p-emp', userId: 'u1', items: [{ ...makePlan().items[0], status: 'COMPLETED' }] }),
        makePlan({ id: 'p-mgr', userId: 'mgr1', items: [{ ...makePlan().items[0], status: 'COMPLETED' }] }),
        makePlan({ id: 'p-stranger', userId: 'u9', items: [{ ...makePlan().items[0], status: 'COMPLETED' }] }),
        // Already verified — nothing left to do.
        makePlan({ id: 'p-done', userId: 'u1', items: [{ ...makePlan().items[0], status: 'COMPLETED', supervisorSignOff: true }] }),
      ],
    });

    const queue = svc.getPendingDevelopmentSignOffs('mgr1');
    expect(queue.map(r => r.plan.id)).toEqual(['p-emp']);
  });

  it('refuses to delete a plan that is no longer a draft', async () => {
    inject(svc, { developmentPlans: [makePlan({ status: 'ACTIVE' })] });
    await expect(svc.deleteDevelopmentPlan('plan1')).rejects.toThrow(/draft/i);
  });

  it('canSupervise follows the management chain and never yourself', () => {
    expect(svc.canSupervise('mgr1', 'u1')).toBe(true);
    expect(svc.canSupervise('u1', 'u1')).toBe(false);
    expect(svc.canSupervise('u9', 'u1')).toBe(false);
  });
});

// ─── A4.7: Evidence flow integration (submit → approve → score update) ────────

describe('evidence flow integration', () => {
  let svc: DataService;
  // writeBatch mock returns a fake batch object
  let mockBatch: { set: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> };

  const SKILL = makeSkill({ id: 'skill1', assessmentMethod: 'WORK_RECORD_REVIEW' });
  const EMPLOYEE = makeUser({ id: 'emp1', managerId: 'mgr1' });
  const MANAGER = makeUser({ id: 'mgr1', orgLevel: 'SH', managerId: undefined });

  beforeEach(async () => {
    const { writeBatch } = await import('../firestore-compat');
    mockBatch = { set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    (writeBatch as ReturnType<typeof vi.fn>).mockReturnValue(mockBatch);

    svc = makeSvc();
    inject(svc, {
      skills: [SKILL],
      users: [EMPLOYEE, MANAGER],
      evidences: [],
      assessments: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('addEvidence returns a PENDING evidence and writes a Firestore batch', async () => {
    const result = await svc.addEvidence({
      userId: 'emp1',
      skillId: 'skill1',
      fileUrl: '',
      fileName: 'Safety Cert',
      notes: 'Completed safety training',
    });

    expect(result.status).toBe('PENDING');
    expect(result.userId).toBe('emp1');
    expect(result.skillId).toBe('skill1');
    expect(mockBatch.set).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it('addEvidence creates a manager notification when employee has a managerId', async () => {
    await svc.addEvidence({
      userId: 'emp1',
      skillId: 'skill1',
      fileUrl: '',
      fileName: 'Evidence',
      notes: 'desc',
    });

    // Batch should have two set calls: evidence doc + notification doc
    expect(mockBatch.set).toHaveBeenCalledTimes(2);
    const [, [, notifPayload]] = mockBatch.set.mock.calls;
    expect(notifPayload.userId).toBe('mgr1');
    expect(notifPayload.title).toBe('New Evidence Submitted');
  });

  it('addEvidence does not create a notification when employee has no manager', async () => {
    inject(svc, { users: [{ ...EMPLOYEE, managerId: undefined }, MANAGER] });
    await svc.addEvidence({
      userId: 'emp1',
      skillId: 'skill1',
      fileUrl: '',
      fileName: 'Evidence',
      notes: 'desc',
    });

    // Only evidence set, no notification set
    expect(mockBatch.set).toHaveBeenCalledTimes(1);
  });

  it('after approval getUserSkillScore returns the assigned score', async () => {
    const pending = makeEvidence({
      id: 'ev1',
      userId: 'emp1',
      skillId: 'skill1',
      status: 'PENDING',
      assignedScore: undefined,
    });
    inject(svc, { evidences: [pending], assessments: [] });

    // Simulate manager approval
    const { updateDoc } = await import('../firestore-compat');
    (updateDoc as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await svc.updateEvidenceStatus('ev1', 'APPROVED', 'mgr1', 4);

    // Simulate Firestore listener updating local state after commit
    inject(svc, {
      evidences: [{
        ...pending,
        status: 'APPROVED',
        assignedScore: 4,
        reviewedBy: 'mgr1',
      }],
    });

    const score = svc.getUserSkillScore('emp1', 'skill1');
    expect(score).toBe(4);
  });

  it('after rejection getUserSkillScore returns 0 (no approved evidence)', async () => {
    const pending = makeEvidence({
      id: 'ev1',
      userId: 'emp1',
      skillId: 'skill1',
      status: 'PENDING',
      assignedScore: undefined,
    });
    inject(svc, { evidences: [pending], assessments: [] });

    const { updateDoc } = await import('../firestore-compat');
    (updateDoc as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await svc.updateEvidenceStatus('ev1', 'REJECTED', 'mgr1', undefined, 'Insufficient detail');

    // Simulate listener: evidence is REJECTED, no score
    inject(svc, {
      evidences: [{
        ...pending,
        status: 'REJECTED',
        assignedScore: undefined,
        reviewedBy: 'mgr1',
      }],
    });

    const score = svc.getUserSkillScore('emp1', 'skill1');
    expect(score).toBe(0);
  });

  it('updateEvidenceStatus sends an approval notification to the employee', async () => {
    const addNotifSpy = vi.spyOn(svc, 'addNotification' as any).mockResolvedValue(undefined);
    inject(svc, {
      evidences: [makeEvidence({ id: 'ev1', userId: 'emp1', skillId: 'skill1', status: 'PENDING' })],
    });

    const { updateDoc } = await import('../firestore-compat');
    (updateDoc as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await svc.updateEvidenceStatus('ev1', 'APPROVED', 'mgr1', 3);

    expect(addNotifSpy).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'emp1',
      type: 'SUCCESS',
    }));
  });
});

// ─── isManager ───────────────────────────────────────────────────────────────

describe('isManager', () => {
  let svc: DataService;

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, { users: [] });
  });

  it('ADMIN is always a manager', () => {
    expect(svc.isManager(makeUser({ role: Role.ADMIN, orgLevel: 'JP' }))).toBe(true);
  });

  it('CEO role is always a manager', () => {
    expect(svc.isManager(makeUser({ role: Role.CEO, orgLevel: 'JP' }))).toBe(true);
  });

  it('a user with explicit subordinates is a manager regardless of level', () => {
    const boss = makeUser({ id: 'boss', orgLevel: 'JP' });
    inject(svc, { users: [boss, makeUser({ id: 'report', managerId: 'boss' })] });
    expect(svc.isManager(boss)).toBe(true);
  });

  it('falls back to org level — managerial levels are managers', () => {
    expect(svc.isManager(makeUser({ id: 'sh', orgLevel: 'SH' }))).toBe(true);
  });

  it('falls back to org level — non-managerial levels are not', () => {
    expect(svc.isManager(makeUser({ id: 'sp', orgLevel: 'SP' }))).toBe(false);
  });
});

// ─── getEffectiveRequirements ────────────────────────────────────────────────

describe('getEffectiveRequirements', () => {
  let svc: DataService;

  const makeJob = (requiredSkills: { skillId: string; requiredLevel: number }[]): JobProfile => ({
    id: 'job1',
    title: 'Test Job',
    description: '',
    departmentId: 'dept1',
    orgLevel: 'SP',
    requiredSkills,
  } as unknown as JobProfile);

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, { skills: [makeSkill({ id: 'skill1' })] });
  });

  it('returns [] for a null/undefined profile', () => {
    expect(svc.getEffectiveRequirements(null)).toEqual([]);
    expect(svc.getEffectiveRequirements(undefined)).toEqual([]);
  });

  it('drops requirements that reference deleted skills', () => {
    const reqs = svc.getEffectiveRequirements(makeJob([
      { skillId: 'skill1', requiredLevel: 3 },
      { skillId: 'gone', requiredLevel: 4 },
    ]));
    expect(reqs).toHaveLength(1);
    expect(reqs[0].skillId).toBe('skill1');
  });
});

// ─── code generation ─────────────────────────────────────────────────────────

describe('code generation', () => {
  let svc: DataService;

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, { skills: [], departments: [] });
  });

  it('generateSkillCode derives CAT-SUB-NN from category and name', () => {
    const code = svc.generateSkillCode(makeSkill({ category: 'Technical', name: 'Test Skill', code: undefined }));
    expect(code).toBe('TEC-TES-01');
  });

  it('generateSkillCode increments the sequence for an existing prefix', () => {
    inject(svc, { skills: [makeSkill({ id: 's0', code: 'TEC-TES-01' })] });
    const code = svc.generateSkillCode(makeSkill({ category: 'Technical', name: 'Test Skill', code: undefined }));
    expect(code).toBe('TEC-TES-02');
  });

  it('generateJobProfileCode falls back to GEN when department is unknown', () => {
    const code = svc.generateJobProfileCode({
      id: 'job1', title: 'Test Job', departmentId: 'missing', orgLevel: 'SP', requiredSkills: [],
    } as unknown as JobProfile);
    expect(code).toBe('GEN-TJ');
  });

  it('generateJobProfileCode uses the department name prefix and title initials', () => {
    inject(svc, { departments: [{ id: 'dept1', name: 'Engineering', type: 'GENERAL', managerId: '' } as unknown as Department] });
    const code = svc.generateJobProfileCode({
      id: 'job1', title: 'Senior Field Engineer', departmentId: 'dept1', orgLevel: 'SP', requiredSkills: [],
    } as unknown as JobProfile);
    expect(code).toBe('ENG-SFE');
  });
});

// ─── job-profile / hierarchy-level reconciliation ─────────────────────────────

describe('orgLevel reconciliation', () => {
  let svc: DataService;

  const JOB = {
    id: 'job1', title: 'Field Engineer', description: '', departmentId: 'dept1',
    orgLevel: 'JP', requiredSkills: [],
  } as unknown as JobProfile;

  beforeEach(async () => {
    svc = makeSvc();
    inject(svc, { jobs: [JOB], users: [], departments: [{ id: 'dept1', name: 'Eng', type: 'DEPARTMENT', managerId: '' }] });
    const fs = await import('../firestore-compat');
    (fs.setDoc as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (fs.updateDoc as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  it('addUser derives orgLevel from the assigned job profile, overriding a mismatched value', async () => {
    const user = makeUser({ jobProfileId: 'job1', orgLevel: 'SP' }); // SP conflicts with JOB's JP
    await svc.addUser(user);
    expect(user.orgLevel).toBe('JP');
  });

  it('updateUser keeps the user orgLevel pinned to the profile level', async () => {
    const user = makeUser({ jobProfileId: 'job1', orgLevel: 'GM' });
    await svc.updateUser(user);
    expect(user.orgLevel).toBe('JP');
  });

  it('leaves orgLevel untouched when no job profile is assigned', async () => {
    const user = makeUser({ jobProfileId: undefined, departmentId: '', orgLevel: 'SP' });
    await svc.addUser(user);
    expect(user.orgLevel).toBe('SP');
  });

  it('getUserOrgLevelMismatch flags a conflict and returns the expected level', () => {
    expect(svc.getUserOrgLevelMismatch({ jobProfileId: 'job1', orgLevel: 'SP' })).toBe('JP');
    expect(svc.getUserOrgLevelMismatch({ jobProfileId: 'job1', orgLevel: 'JP' })).toBeNull();
    expect(svc.getUserOrgLevelMismatch({ jobProfileId: undefined, orgLevel: 'SP' })).toBeNull();
  });
});

// ─── Department scoping (what the TNA screen picks its scope from) ──────────
//
// The TNA engine itself has MOVED TO THE SERVER (`GET /analytics/training-needs`,
// server/src/analytics/aggregate.ts, covered by server/src/__tests__/analytics.test.ts).
// It used to run here, which meant downloading the whole company to answer a
// question about one section. What stays in the browser is the resolution of a
// unit to its people, which the pickers and the analytics filter still use.

describe('getDepartmentSubtreeIds / getDepartmentMembers', () => {
  let svc: DataService;

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, {
      departments: [
        { id: 'dept1', name: 'General Ops', type: 'GENERAL' },
        { id: 'sec1', name: 'Section A', type: 'SECTION', parentId: 'dept1' },
        { id: 'sec2', name: 'Section B', type: 'SECTION', parentId: 'sec1' },
      ] as unknown as Department[],
      users: [
        makeUser({ id: 'u1', departmentId: 'sec1' }),
        makeUser({ id: 'u2', departmentId: 'sec2' }),
      ],
    });
  });

  it('walks the whole subtree, not just direct children', () => {
    expect(svc.getDepartmentSubtreeIds('dept1').sort()).toEqual(['dept1', 'sec1', 'sec2']);
  });

  it('rolls members up — a general department has nobody sitting in it directly', () => {
    expect(svc.getDepartmentMembers('dept1').map(u => u.id).sort()).toEqual(['u1', 'u2']);
    expect(svc.getDepartmentMembers('dept1', false)).toEqual([]);
  });
});

// ─── Work experience → provisional competency baseline ───────────────────────

describe('work experience scoring (provisional baseline)', () => {
  let svc: DataService;

  // Default policy: bands 0-2→L2, 2-5→L3, 5-10→L4, 10+→L5, capped at L3.
  const OJT_SKILL = makeSkill({ id: 'skill1', assessmentMethod: 'OJT_OBSERVATION' });
  const EXAM_SKILL = makeSkillWithMethods([makeMethod({ method: 'WRITTEN_EXAM' })], { id: 'skill1' });
  const USER = makeUser({ id: 'u1' });

  const verified = (level: number, skillId = 'skill1') =>
    makeWorkExperience({
      status: 'VERIFIED',
      skills: [{ skillId, claimedLevel: level, yearsApplied: 12, verifiedLevel: level }],
    });

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, { users: [USER], skills: [EXAM_SKILL], assessments: [], evidences: [], workExperiences: [] });
  });

  it('yields no score when the employee has no work experience', () => {
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(0);
    expect(svc.getSkillScoreSource('u1', 'skill1')).toBe('NONE');
  });

  it('credits a verified level and reports it as provisional', () => {
    inject(svc, { workExperiences: [verified(3)] });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(3);
    expect(svc.getSkillScoreSource('u1', 'skill1')).toBe('EXPERIENCE');
  });

  it('caps the provisional score at the policy maximum', () => {
    // Verifier confirmed Level 5, but tenure alone may not exceed the L3 cap.
    inject(svc, { workExperiences: [verified(5)] });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(3);
    expect(svc.getSkillScoreSource('u1', 'skill1')).toBe('EXPERIENCE');
  });

  it('takes the highest verified level across employers', () => {
    inject(svc, {
      workExperiences: [
        makeWorkExperience({ id: 'we1', status: 'VERIFIED', skills: [{ skillId: 'skill1', claimedLevel: 1, yearsApplied: 1, verifiedLevel: 1 }] }),
        makeWorkExperience({ id: 'we2', status: 'VERIFIED', skills: [{ skillId: 'skill1', claimedLevel: 3, yearsApplied: 4, verifiedLevel: 3 }] }),
      ],
    });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(3);
  });

  it('ignores entries that are not VERIFIED', () => {
    for (const status of ['PENDING', 'REJECTED'] as const) {
      const s = makeSvc();
      inject(s, {
        users: [USER], skills: [EXAM_SKILL], assessments: [], evidences: [],
        workExperiences: [makeWorkExperience({ status, skills: [{ skillId: 'skill1', claimedLevel: 3, yearsApplied: 9, verifiedLevel: 3 }] })],
      });
      expect(s.getUserSkillScore('u1', 'skill1')).toBe(0);
      expect(s.getSkillScoreSource('u1', 'skill1')).toBe('NONE');
    }
  });

  it('ignores a verified entry whose skill was never given a level', () => {
    inject(svc, {
      workExperiences: [makeWorkExperience({ status: 'VERIFIED', skills: [{ skillId: 'skill1', claimedLevel: 4, yearsApplied: 9 }] })],
    });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(0);
  });

  it('ignores experience tagged against a different skill', () => {
    inject(svc, { workExperiences: [verified(3, 'other-skill')] });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(0);
  });

  it('yields nothing when the policy is disabled', () => {
    inject(svc, {
      workExperiences: [verified(3)],
      appSettings: { 'work-experience': { enabled: false, maxProvisionalLevel: 3, bands: [] } },
    });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(0);
    expect(svc.getSkillScoreSource('u1', 'skill1')).toBe('NONE');
  });

  it('honours an admin-raised cap', () => {
    inject(svc, {
      workExperiences: [verified(5)],
      appSettings: { 'work-experience': { enabled: true, maxProvisionalLevel: 5, bands: [] } },
    });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(5);
  });

  // ── Precedence: a real record always wins ──────────────────────────────────

  it('a direct assessment outranks experience, even when scored lower', () => {
    inject(svc, {
      workExperiences: [verified(3)],
      assessments: [makeAssessment({ type: 'WRITTEN_EXAM', score: 2, date: '2025-06-01' })],
    });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(2);
    expect(svc.getSkillScoreSource('u1', 'skill1')).toBe('ASSESSMENT');
  });

  it('approved evidence outranks experience', () => {
    inject(svc, {
      workExperiences: [verified(3)],
      evidences: [makeEvidence({ status: 'APPROVED', assignedScore: 2 })],
    });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(2);
    expect(svc.getSkillScoreSource('u1', 'skill1')).toBe('EVIDENCE');
  });

  it('a 360 manager rating outranks experience on a behavioral skill', () => {
    inject(svc, {
      skills: [OJT_SKILL],
      workExperiences: [verified(3)],
      assessments: [makeAssessment({ type: 'MANAGER', score: 2, raterId: 'mgr1' })],
    });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(2);
    expect(svc.getSkillScoreSource('u1', 'skill1')).toBe('ASSESSMENT');
  });

  // REGRESSION: the 360/OJT branch returns early and never reaches the evidence
  // tier, and an unconfigured skill defaults to OJT_OBSERVATION — so a fallback
  // written inside the `else` would skip most skills in the catalog.
  it('falls through to experience on a behavioral skill with no ratings', () => {
    inject(svc, { skills: [OJT_SKILL], workExperiences: [verified(3)] });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(3);
    expect(svc.getSkillScoreSource('u1', 'skill1')).toBe('EXPERIENCE');
  });

  it('falls through to experience for a skill with no assessment config at all', () => {
    inject(svc, { skills: [makeSkill({ id: 'skill1' })], workExperiences: [verified(3)] });
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(3);
    expect(svc.getSkillScoreSource('u1', 'skill1')).toBe('EXPERIENCE');
  });

  it('getUserSkillScoreDetail returns score and source together', () => {
    inject(svc, { workExperiences: [verified(3)] });
    expect(svc.getUserSkillScoreDetail('u1', 'skill1')).toEqual({ score: 3, source: 'EXPERIENCE' });
  });

  it('sums verified years across employers for display', () => {
    inject(svc, {
      workExperiences: [
        makeWorkExperience({ id: 'we1', status: 'VERIFIED', skills: [{ skillId: 'skill1', claimedLevel: 3, yearsApplied: 4, verifiedLevel: 3 }] }),
        makeWorkExperience({ id: 'we2', status: 'VERIFIED', skills: [{ skillId: 'skill1', claimedLevel: 2, yearsApplied: 2.5, verifiedLevel: 2 }] }),
        makeWorkExperience({ id: 'we3', status: 'PENDING', skills: [{ skillId: 'skill1', claimedLevel: 5, yearsApplied: 99, verifiedLevel: 5 }] }),
      ],
    });
    expect(svc.getExperienceYears('u1', 'skill1')).toBe(6.5);
  });
});

describe('work experience never suppresses a real assessment', () => {
  // The single deliberate exception to "provisional counts like any other
  // score": if experience satisfied the requirement here, the system would stop
  // asking for the assessment that would actually confirm it.
  it('keeps the skill in the assessment queue despite a sufficient provisional score', () => {
    const svc = makeSvc();
    inject(svc, {
      users: [makeUser({ id: 'u1', jobProfileId: 'job1', orgLevel: 'SP' })],
      skills: [makeSkillWithMethods([makeMethod({ method: 'WRITTEN_EXAM' })], { id: 'skill1' })],
      jobs: [{ id: 'job1', title: 'Tech', departmentId: 'dept1', orgLevel: 'SP', requiredSkills: [{ skillId: 'skill1', requiredLevel: 3 }] } as JobProfile],
      assessments: [], evidences: [], scheduledAssessments: [],
      workExperiences: [makeWorkExperience({ status: 'VERIFIED', skills: [{ skillId: 'skill1', claimedLevel: 3, yearsApplied: 12, verifiedLevel: 3 }] })],
    });

    // The provisional score meets the requirement…
    expect(svc.getUserSkillScore('u1', 'skill1')).toBe(3);
    // …but the exam is still queued, and shows the employee at 0 (unmeasured).
    const queue = svc.getEmployeeAssessmentQueue('u1')!;
    const queued = [...queue.writtenExams, ...queue.managerialInterviews, ...queue.evaluations360, ...queue.workRecords];
    expect(queued.map((q: any) => q.skill.id)).toContain('skill1');
    expect(queued.find((q: any) => q.skill.id === 'skill1').currentLevel).toBe(0);
  });

  it('closes the ITP gap once experience is verified', () => {
    const base = {
      users: [makeUser({ id: 'u1', jobProfileId: 'job1', orgLevel: 'SP' })],
      skills: [makeSkillWithMethods([makeMethod({ method: 'WRITTEN_EXAM' })], { id: 'skill1' })],
      jobs: [{ id: 'job1', title: 'Tech', departmentId: 'dept1', orgLevel: 'SP', requiredSkills: [{ skillId: 'skill1', requiredLevel: 3 }] } as JobProfile],
      assessments: [], evidences: [], trainingCourses: [],
    };

    const without = makeSvc();
    inject(without, { ...base, workExperiences: [] });
    expect(without.generateIndividualTrainingPlan('u1')!.recommendations).toHaveLength(1);

    const withExp = makeSvc();
    inject(withExp, {
      ...base,
      workExperiences: [makeWorkExperience({ status: 'VERIFIED', skills: [{ skillId: 'skill1', claimedLevel: 3, yearsApplied: 12, verifiedLevel: 3 }] })],
    });
    expect(withExp.generateIndividualTrainingPlan('u1')!.recommendations).toHaveLength(0);
  });
});

describe('work experience submission + verification', () => {
  let svc: DataService;
  let mockBatch: { set: ReturnType<typeof vi.fn>; commit: ReturnType<typeof vi.fn> };

  const EMPLOYEE = makeUser({ id: 'emp1', managerId: 'mgr1' });
  const MANAGER = makeUser({ id: 'mgr1', orgLevel: 'SH', managerId: undefined });
  const LONER = makeUser({ id: 'emp2', managerId: undefined });

  const draft = {
    userId: 'emp1',
    employer: 'Acme Corp',
    jobTitle: 'Senior Technician',
    startDate: '2010-01-01',
    endDate: '2020-01-01',
    skills: [{ skillId: 'skill1', claimedLevel: 4, yearsApplied: 7 }],
  };

  beforeEach(async () => {
    const { writeBatch, updateDoc } = await import('../firestore-compat');
    mockBatch = { set: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
    (writeBatch as ReturnType<typeof vi.fn>).mockReturnValue(mockBatch);
    (updateDoc as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    svc = makeSvc();
    inject(svc, {
      users: [EMPLOYEE, MANAGER, LONER],
      skills: [makeSkill({ id: 'skill1' })],
      workExperiences: [],
      assessments: [], evidences: [], notifications: [],
    });
  });

  afterEach(() => vi.clearAllMocks());

  it('submits as PENDING and stamps the band-table suggestion', async () => {
    const result = await svc.addWorkExperience(draft);
    expect(result.status).toBe('PENDING');
    // 7 years lands in the 5-10 band → suggests Level 4 (above the L3 cap: the
    // suggestion is honest, the cap constrains what reaches the score).
    expect(result.skills[0].suggestedLevel).toBe(4);
    expect(result.skills[0].verifiedLevel).toBeUndefined();
    expect(mockBatch.commit).toHaveBeenCalled();
  });

  it('notifies the manager on submission', async () => {
    await svc.addWorkExperience(draft);
    expect(mockBatch.set).toHaveBeenCalledTimes(2);
    const [, [, notif]] = mockBatch.set.mock.calls;
    expect(notif.userId).toBe('mgr1');
    expect(notif.actionLink).toBe('manager-approvals');
  });

  it('writes only the record when the employee has no manager', async () => {
    await svc.addWorkExperience({ ...draft, userId: 'emp2' });
    expect(mockBatch.set).toHaveBeenCalledTimes(1);
  });

  it('verification applies the reviewer override', async () => {
    const entry = makeWorkExperience({ id: 'we1', userId: 'emp1', status: 'PENDING', skills: [{ skillId: 'skill1', claimedLevel: 4, yearsApplied: 7, suggestedLevel: 4 }] });
    inject(svc, { workExperiences: [entry] });

    await svc.verifyWorkExperience('we1', 'VERIFIED', 'mgr1', { skill1: 2 }, 'Partial scope');

    const { updateDoc } = await import('../firestore-compat');
    const [, payload] = (updateDoc as ReturnType<typeof vi.fn>).mock.calls[0];
    const saved = JSON.parse(payload.skills);
    expect(saved[0].verifiedLevel).toBe(2);
    expect(payload.status).toBe('VERIFIED');
    expect(payload.reviewedBy).toBe('mgr1');
    expect(payload.reviewerComment).toBe('Partial scope');
  });

  it('verification falls back to the stamped suggestion when not overridden', async () => {
    inject(svc, {
      workExperiences: [makeWorkExperience({ id: 'we1', userId: 'emp1', status: 'PENDING', skills: [{ skillId: 'skill1', claimedLevel: 4, yearsApplied: 7, suggestedLevel: 4 }] })],
    });
    await svc.verifyWorkExperience('we1', 'VERIFIED', 'mgr1');

    const { updateDoc } = await import('../firestore-compat');
    const [, payload] = (updateDoc as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(payload.skills)[0].verifiedLevel).toBe(4);
  });

  it('rejection clears every level so nothing can be credited', async () => {
    inject(svc, {
      workExperiences: [makeWorkExperience({ id: 'we1', userId: 'emp1', status: 'PENDING', skills: [{ skillId: 'skill1', claimedLevel: 4, yearsApplied: 7, suggestedLevel: 4 }] })],
    });
    await svc.verifyWorkExperience('we1', 'REJECTED', 'mgr1', undefined, 'Cannot confirm');

    const { updateDoc } = await import('../firestore-compat');
    const [, payload] = (updateDoc as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload.status).toBe('REJECTED');
    expect(JSON.parse(payload.skills)[0].verifiedLevel).toBeUndefined();
  });

  it('editing a verified record re-opens it and drops the old verdict', async () => {
    inject(svc, {
      workExperiences: [makeWorkExperience({ id: 'we1', userId: 'emp1', status: 'VERIFIED', reviewedBy: 'mgr1', skills: [{ skillId: 'skill1', claimedLevel: 4, yearsApplied: 7, verifiedLevel: 4 }] })],
    });
    await svc.updateWorkExperience('we1', { jobTitle: 'Lead Technician' });

    const { updateDoc } = await import('../firestore-compat');
    const [, payload] = (updateDoc as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(payload.status).toBe('PENDING');
    expect(payload.reviewedBy).toBeUndefined();
    expect(JSON.parse(payload.skills)[0].verifiedLevel).toBeUndefined();
  });
});

describe('getPendingWorkExperienceVerifications', () => {
  const MANAGER = makeUser({ id: 'mgr1', orgLevel: 'SH', managerId: undefined });
  const REPORT = makeUser({ id: 'emp1', managerId: 'mgr1' });
  const STRANGER = makeUser({ id: 'emp9', managerId: 'other-mgr' });
  const ADMIN_USER = makeUser({ id: 'adm1', role: Role.ADMIN, managerId: undefined });

  const pending = (id: string, userId: string) => makeWorkExperience({ id, userId, status: 'PENDING' });

  function svcWith() {
    const svc = makeSvc();
    inject(svc, {
      users: [MANAGER, REPORT, STRANGER, ADMIN_USER],
      departments: [],
      workExperiences: [
        pending('we-report', 'emp1'),
        pending('we-stranger', 'emp9'),
        pending('we-own', 'mgr1'),
        makeWorkExperience({ id: 'we-done', userId: 'emp1', status: 'VERIFIED' }),
      ],
    });
    return svc;
  }

  it('a manager sees pending entries from their own reports only', () => {
    const ids = svcWith().getPendingWorkExperienceVerifications('mgr1').map(w => w.id);
    expect(ids).toContain('we-report');
    expect(ids).not.toContain('we-stranger');
  });

  it('nobody verifies their own experience', () => {
    expect(svcWith().getPendingWorkExperienceVerifications('mgr1').map(w => w.id)).not.toContain('we-own');
  });

  it('already-reviewed entries drop out of the queue', () => {
    expect(svcWith().getPendingWorkExperienceVerifications('mgr1').map(w => w.id)).not.toContain('we-done');
  });

  it('an admin sees every pending entry', () => {
    const ids = svcWith().getPendingWorkExperienceVerifications('adm1').map(w => w.id);
    expect(ids).toEqual(expect.arrayContaining(['we-report', 'we-stranger', 'we-own']));
  });
});

// ─── Coverage: measured vs unknown ───────────────────────────────────────────

describe('getUserCoverage / getGroupCoverage', () => {
  const EXAM_SKILL = (id: string) => makeSkill({ id, assessmentMethod: 'WRITTEN_EXAM' });

  const job = (requiredSkills: { skillId: string; requiredLevel: number }[]): JobProfile => ({
    id: 'job1',
    title: 'Test Job',
    description: '',
    departmentId: 'dept1',
    orgLevel: 'SP',
    requiredSkills,
  } as unknown as JobProfile);

  function svcWith(fields: Record<string, unknown>): DataService {
    const svc = makeSvc();
    inject(svc, {
      skills: [EXAM_SKILL('skill1'), EXAM_SKILL('skill2'), EXAM_SKILL('skill3')],
      users: [makeUser({ jobProfileId: 'job1' })],
      jobs: [job([
        { skillId: 'skill1', requiredLevel: 3 },
        { skillId: 'skill2', requiredLevel: 3 },
        { skillId: 'skill3', requiredLevel: 3 },
      ])],
      assessments: [],
      evidences: [],
      workExperiences: [],
      assessmentInstructions: [],
      departments: [{ id: 'dept1', name: 'General', type: 'GENERAL', managerId: '' }],
      ...fields,
    });
    return svc;
  }

  it('nothing assessed ⇒ everything unknown and compliance is null, not 0%', () => {
    const c = svcWith({}).getUserCoverage('u1');
    expect(c.required).toBe(3);
    expect(c.measured).toBe(0);
    expect(c.unknown).toBe(3);
    expect(c.known).toBe(0);
    expect(c.compliancePct).toBeNull();
    expect(c.gapsKnown).toBe(0);
    expect(c.totalGap).toBe(0);
  });

  it('counts only real records as measured, and states compliance over them', () => {
    const svc = svcWith({
      assessments: [
        makeAssessment({ id: 'a1', skillId: 'skill1', type: 'WRITTEN_EXAM', score: 4 }),
        makeAssessment({ id: 'a2', skillId: 'skill2', type: 'WRITTEN_EXAM', score: 1 }),
      ],
    });
    const c = svc.getUserCoverage('u1');
    expect(c.measured).toBe(2);
    expect(c.unknown).toBe(1);
    expect(c.measuredPct).toBe(67);
    expect(c.compliantKnown).toBe(1);
    expect(c.gapsKnown).toBe(1);
    expect(c.compliancePct).toBe(50); // 1 of the 2 measured — the unknown is excluded
    expect(c.totalGap).toBe(2);       // required 3 − score 1, unknown adds nothing
  });

  it('approved evidence counts as measured', () => {
    const svc = svcWith({
      evidences: [makeEvidence({ id: 'e1', skillId: 'skill1', status: 'APPROVED', assignedScore: 3 })],
    });
    const c = svc.getUserCoverage('u1');
    expect(c.measured).toBe(1);
    expect(c.provisional).toBe(0);
    expect(c.compliancePct).toBe(100);
  });

  it('a provisional (work-experience) score is known but NOT measured', () => {
    const svc = svcWith({
      workExperiences: [
        makeWorkExperience({
          id: 'we1',
          status: 'VERIFIED',
          skills: [{ skillId: 'skill1', claimedLevel: 3, yearsApplied: 10, suggestedLevel: 3, verifiedLevel: 3 }],
        }),
      ],
      appSettings: [{ id: 'work-experience', enabled: true, maxProvisionalLevel: 3, bands: [] }],
    });
    const c = svc.getUserCoverage('u1');
    expect(c.measured).toBe(0);
    expect(c.provisional).toBe(1);
    expect(c.known).toBe(1);
    expect(c.unknown).toBe(2);
    expect(c.measuredPct).toBe(0);
    expect(c.compliancePct).toBe(100); // met, but on a provisional basis only
  });

  it('a user with no job profile contributes nothing', () => {
    const svc = svcWith({ users: [makeUser({ jobProfileId: undefined })] });
    const c = svc.getUserCoverage('u1');
    expect(c.required).toBe(0);
    expect(c.compliancePct).toBeNull();
    expect(c.measuredPct).toBe(0);
  });

  it('group coverage pools the requirement counts across people', () => {
    const svc = svcWith({
      users: [makeUser({ id: 'u1', jobProfileId: 'job1' }), makeUser({ id: 'u2', jobProfileId: 'job1' })],
      assessments: [makeAssessment({ id: 'a1', subjectId: 'u1', skillId: 'skill1', type: 'WRITTEN_EXAM', score: 4 })],
    });
    const c = svc.getGroupCoverage(['u1', 'u2']);
    expect(c.required).toBe(6);
    expect(c.measured).toBe(1);
    expect(c.unknown).toBe(5);
    expect(c.compliancePct).toBe(100); // the single measured skill meets its level
  });
});

// ─── Training catalogue (courses linked to skills) ───────────────────────────

describe('training catalogue', () => {
  let svc: DataService;

  const course = (overrides: Partial<TrainingCourse> = {}): TrainingCourse => ({
    id: 'c1',
    title: 'Pump Alignment',
    provider: 'EPROM Training Centre',
    type: 'INTERNAL',
    linkedSkillIds: ['skill1'],
    ...overrides,
  });

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, { skills: [makeSkill()], trainingCourses: [], users: [], jobs: [], assessments: [], evidences: [] });
  });

  afterEach(() => { vi.clearAllMocks(); });

  it('getCoursesForSkill returns every course linked to the skill', () => {
    inject(svc, {
      trainingCourses: [
        course({ id: 'c1', linkedSkillIds: ['skill1', 'skill2'] }),
        course({ id: 'c2', linkedSkillIds: ['skill2'] }),
      ],
    });
    expect(svc.getCoursesForSkill('skill1').map(c => c.id)).toEqual(['c1']);
    expect(svc.getCoursesForSkill('skill2').map(c => c.id)).toEqual(['c1', 'c2']);
  });

  it('an archived course is hidden from lists and from recommendations', () => {
    inject(svc, { trainingCourses: [course({ id: 'c1', isArchived: true }), course({ id: 'c2' })] });
    expect(svc.getAllTrainingCourses().map(c => c.id)).toEqual(['c2']);
    expect(svc.getAllTrainingCourses(true)).toHaveLength(2);
    expect(svc.getCoursesForSkill('skill1').map(c => c.id)).toEqual(['c2']);
  });

  it('generateTrainingCourseCode is derived from the title and never collides', () => {
    const first = svc.generateTrainingCourseCode({ title: 'Pump Alignment' });
    expect(first).toBe('TRN-PUMPA-01');
    inject(svc, { trainingCourses: [course({ code: first })] });
    expect(svc.generateTrainingCourseCode({ title: 'Pump Alignment' })).toBe('TRN-PUMPA-02');
  });

  it('addTrainingCourse fills in id, code and timestamps', async () => {
    const saved = await svc.addTrainingCourse({
      title: 'Confined Space Entry',
      provider: 'OPITO',
      type: 'EXTERNAL',
      linkedSkillIds: ['skill1'],
    });
    expect(saved.id).toBeTruthy();
    expect(saved.code).toMatch(/^TRN-/);
    expect(saved.createdAt).toBeTruthy();
    expect(saved.isArchived).toBeUndefined();
  });

  it('removeTrainingCourse archives rather than deletes (old plans still resolve it)', async () => {
    const existing = course({ id: 'c1' });
    inject(svc, { trainingCourses: [existing] });
    const { updateDoc } = await import('../firestore-compat');
    await svc.removeTrainingCourse('c1');
    const written = (updateDoc as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect(written.isArchived).toBe(true);
    expect(written.title).toBe('Pump Alignment');
  });

  it('the ITP names a live course but ignores an archived one', () => {
    const USER = makeUser({ orgLevel: 'SP', jobProfileId: 'job1' });
    const JOB = {
      id: 'job1', title: 'Test Job', description: '', departmentId: 'dept1',
      orgLevel: 'SP', requiredSkills: [{ skillId: 'skill1', requiredLevel: 4 }],
    } as unknown as JobProfile;
    inject(svc, {
      users: [USER], jobs: [JOB], skills: [makeSkill({ assessmentMethod: 'WRITTEN_EXAM' })],
      trainingCourses: [course({ id: 'c1', title: 'Pump Alignment', isArchived: true })],
    });
    const archivedPlan = svc.generateIndividualTrainingPlan('u1')!;
    expect(archivedPlan.recommendations[0].courseId).toBeUndefined();
    expect(archivedPlan.recommendations[0].recommendation).not.toContain('Pump Alignment');

    inject(svc, { trainingCourses: [course({ id: 'c1', title: 'Pump Alignment' })] });
    const livePlan = svc.generateIndividualTrainingPlan('u1')!;
    expect(livePlan.recommendations[0].courseId).toBe('c1');
    expect(livePlan.recommendations[0].recommendation).toContain('Pump Alignment');
  });
});

describe('stored monthly snapshots', () => {
  let svc: DataService;

  beforeEach(() => {
    svc = new DataService();
    apiGet.mockReset();
    apiGet.mockResolvedValue({ snapshots: [] });
  });

  it('asks for the whole company when no department is selected', async () => {
    await svc.getCompetencySnapshots();
    await svc.getCompetencySnapshots('ALL');
    // No scopeId at all ⇒ the server answers with the COMPANY scope.
    expect(apiGet.mock.calls.every(([p]) => !p.includes('scopeId'))).toBe(true);
  });

  it('scopes to a department and encodes the id', async () => {
    await svc.getCompetencySnapshots('dept 1/a', 6);
    expect(apiGet).toHaveBeenCalledWith('/analytics/snapshots?months=6&scopeId=dept%201%2Fa');
  });

  it('passes the stored rows through untouched, nulls included', async () => {
    // compliancePct/avgGap are null when nothing was measured that month — the
    // store must not helpfully turn them into 0.
    apiGet.mockResolvedValue({
      snapshots: [{ period: '2026-07', compliancePct: null, avgGap: null, measured: 0, required: 4 }],
    });
    const rows = await svc.getCompetencySnapshots();
    expect(rows).toHaveLength(1);
    expect(rows[0].compliancePct).toBeNull();
    expect(rows[0].avgGap).toBeNull();
  });

  it('survives an empty response body', async () => {
    apiGet.mockResolvedValue({});
    expect(await svc.getCompetencySnapshots()).toEqual([]);
  });
});

// ─── Live server-side aggregates ────────────────────────────────────────────
//
// The maths lives on the server (covered by server/src/__tests__/analytics.test.ts).
// What matters here is that the store asks for the RIGHT SCOPE — the endpoint
// treats the scope as a permission boundary, and a wrong string is either a 403
// or, worse, somebody else's numbers.

describe('server-side aggregates (overview / training needs)', () => {
  let svc: DataService;

  beforeEach(() => {
    svc = makeSvc();
    apiGet.mockReset();
    apiGet.mockResolvedValue({});
  });

  it('asks for the company when no scope is given', async () => {
    await svc.getOrgOverview();
    await svc.getOrgOverview('ALL');
    expect(apiGet.mock.calls.every(([p]) => p === '/analytics/overview?scope=company')).toBe(true);
  });

  it('encodes a department id', async () => {
    await svc.getOrgOverview('dept 1/a');
    expect(apiGet).toHaveBeenCalledWith('/analytics/overview?scope=dept%201%2Fa');
  });

  it('passes the training-needs scope through, sub-units included by default', async () => {
    await svc.getTrainingNeeds('team');
    expect(apiGet).toHaveBeenCalledWith('/analytics/training-needs?scope=team');

    await svc.getTrainingNeeds('dept1', { includeSubUnits: false });
    expect(apiGet).toHaveBeenCalledWith('/analytics/training-needs?scope=dept1&includeSubUnits=false');
  });
});
