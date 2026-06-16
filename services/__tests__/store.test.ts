/**
 * Unit tests for DataService core computation methods.
 *
 * Firebase is fully mocked — no network calls are made. Private fields are
 * populated via `(svc as any)` casts so we can exercise the pure logic
 * without needing real Firestore documents.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Firebase mocks (must come before any store import) ─────────────────────
vi.mock('../../firebase', () => ({
  db: {},
  auth: { currentUser: null },
}));

vi.mock('firebase/firestore', () => ({
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
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth: unknown, cb: (u: null) => void) => { cb(null); return vi.fn(); }),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
// ────────────────────────────────────────────────────────────────────────────

import { DataService } from '../store';
import type { User, Skill, Assessment, Evidence, AssessmentPlan, AssessmentInstruction, JobProfile, TrainingCourse, Department } from '../../types';
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

function makePlan(overrides: Partial<AssessmentPlan> = {}): AssessmentPlan {
  return {
    id: 'plan1',
    name: 'Test Plan',
    skillIds: ['skill1'],
    method: 'WRITTEN_EXAM',
    frequency: 'ONE_TIME',
    audience: 'ALL',
    status: 'ACTIVE',
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
    ...overrides,
  };
}

function makeInstruction(overrides: Partial<AssessmentInstruction> = {}): AssessmentInstruction {
  return {
    id: 'instr1',
    name: 'Test Instruction',
    method: 'OJT_OBSERVATION',
    status: 'ACTIVE',
    createdAt: '',
    updatedAt: '',
    evaluationQuestions: [],
    interviewQuestions: [],
    threeSixtyQuestions: [],
    ...overrides,
  };
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
  const SKILL = makeSkill({ id: 'skill1', assessmentMethod: 'WRITTEN_EXAM' });
  const USER = makeUser();

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, {
      skills: [SKILL],
      users: [USER],
      assessments: [],
      evidences: [],
      assessmentPlans: [],
      assessmentInstructions: [],
    });
  });

  it('returns null when no active plan covers the skill', () => {
    expect(svc.getNextAssessmentDate('u1', 'skill1')).toBeNull();
  });

  it('ONE_TIME frequency always returns null (never recurs)', () => {
    inject(svc, { assessmentPlans: [makePlan({ frequency: 'ONE_TIME' })] });
    expect(svc.getNextAssessmentDate('u1', 'skill1')).toBeNull();
  });

  it('WEEKLY frequency — overdue when never assessed', () => {
    inject(svc, { assessmentPlans: [makePlan({ frequency: 'WEEKLY' })] });
    const date = svc.getNextAssessmentDate('u1', 'skill1');
    expect(date).not.toBeNull();
    expect(date!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('WEEKLY frequency — schedules 7 days after last assessment', () => {
    const lastDate = new Date('2025-01-01');
    inject(svc, {
      assessmentPlans: [makePlan({ frequency: 'WEEKLY' })],
      assessments: [makeAssessment({ date: lastDate.toISOString() })],
    });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    const expected = new Date(lastDate);
    expected.setDate(expected.getDate() + 7);
    expect(date.toDateString()).toBe(expected.toDateString());
  });

  it('MONTHLY frequency — schedules 1 month after last assessment', () => {
    const lastDate = new Date('2025-01-01');
    inject(svc, {
      assessmentPlans: [makePlan({ frequency: 'MONTHLY' })],
      assessments: [makeAssessment({ date: lastDate.toISOString() })],
    });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    const expected = new Date(lastDate);
    expected.setMonth(expected.getMonth() + 1);
    expect(date.toDateString()).toBe(expected.toDateString());
  });

  it('QUARTERLY frequency — schedules 3 months after last assessment', () => {
    const lastDate = new Date('2025-01-01');
    inject(svc, {
      assessmentPlans: [makePlan({ frequency: 'QUARTERLY' })],
      assessments: [makeAssessment({ date: lastDate.toISOString() })],
    });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    const expected = new Date(lastDate);
    expected.setMonth(expected.getMonth() + 3);
    expect(date.toDateString()).toBe(expected.toDateString());
  });

  it('ANYTIME_ANNUAL — overdue when never assessed this year', () => {
    inject(svc, { assessmentPlans: [makePlan({ frequency: 'ANYTIME_ANNUAL' })] });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    expect(date.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('ANYTIME_ANNUAL — assessed this year: next due at start of next year', () => {
    const thisYear = new Date().getFullYear();
    inject(svc, {
      assessmentPlans: [makePlan({ frequency: 'ANYTIME_ANNUAL' })],
      assessments: [makeAssessment({ date: `${thisYear}-01-15` })],
    });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    expect(date.getFullYear()).toBe(thisYear + 1);
  });

  it('CERTIFICATE_BASED — overdue when no approved evidence with expiryDate', () => {
    inject(svc, { assessmentPlans: [makePlan({ frequency: 'CERTIFICATE_BASED' })] });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    expect(date.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('CERTIFICATE_BASED — due date equals evidence expiry', () => {
    const expiry = '2027-03-15';
    inject(svc, {
      assessmentPlans: [makePlan({ frequency: 'CERTIFICATE_BASED' })],
      evidences: [makeEvidence({ expiryDate: expiry })],
    });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    expect(date.toISOString().slice(0, 10)).toBe(expiry);
  });

  it('picks the earliest date when multiple plans apply', () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 7);
    const later = new Date();
    later.setMonth(later.getMonth() + 3);
    inject(svc, {
      assessments: [
        makeAssessment({ id: 'a-w', date: soon.toISOString() }),
      ],
      assessmentPlans: [
        makePlan({ id: 'p1', frequency: 'WEEKLY' }),
        makePlan({ id: 'p2', frequency: 'QUARTERLY' }),
      ],
    });
    const date = svc.getNextAssessmentDate('u1', 'skill1')!;
    // Weekly is sooner than quarterly
    expect(date.getTime()).toBeLessThan(later.getTime());
  });
});

// ─── isUserInPlanAudience ───────────────────────────────────────────────────

describe('isUserInPlanAudience', () => {
  let svc: DataService;

  const EMPLOYEE = makeUser({ id: 'emp1', orgLevel: 'SP', departmentId: 'dept1' });
  const FRESH = makeUser({ id: 'fresh1', orgLevel: 'FR', departmentId: 'dept1' });
  const MANAGER = makeUser({ id: 'mgr1', orgLevel: 'SH', departmentId: 'dept2' });

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, {
      users: [EMPLOYEE, FRESH, MANAGER],
      departments: [],
      assessmentInstructions: [],
    });
  });

  it('ALL — matches every user', () => {
    const plan = makePlan({ audience: 'ALL' });
    expect(svc.isUserInPlanAudience('emp1', plan)).toBe(true);
    expect(svc.isUserInPlanAudience('fresh1', plan)).toBe(true);
    expect(svc.isUserInPlanAudience('mgr1', plan)).toBe(true);
  });

  it('FRESH_ONLY — only FR org level', () => {
    const plan = makePlan({ audience: 'FRESH_ONLY' });
    expect(svc.isUserInPlanAudience('fresh1', plan)).toBe(true);
    expect(svc.isUserInPlanAudience('emp1', plan)).toBe(false);
  });

  it('MANAGERS_ONLY — managerial org levels are included', () => {
    const plan = makePlan({ audience: 'MANAGERS_ONLY' });
    // SH is in managerialLevels
    expect(svc.isUserInPlanAudience('mgr1', plan)).toBe(true);
    // SP is not
    expect(svc.isUserInPlanAudience('emp1', plan)).toBe(false);
  });

  it('ORG_LEVELS — matches specified org levels', () => {
    const plan = makePlan({ audience: 'ORG_LEVELS', audienceOrgLevels: ['SP', 'JP'] });
    expect(svc.isUserInPlanAudience('emp1', plan)).toBe(true);
    expect(svc.isUserInPlanAudience('fresh1', plan)).toBe(false);
    expect(svc.isUserInPlanAudience('mgr1', plan)).toBe(false);
  });

  it('DEPARTMENTS — matches specified department IDs', () => {
    const plan = makePlan({ audience: 'DEPARTMENTS', audienceDepartmentIds: ['dept1'] });
    expect(svc.isUserInPlanAudience('emp1', plan)).toBe(true);
    expect(svc.isUserInPlanAudience('fresh1', plan)).toBe(true);
    expect(svc.isUserInPlanAudience('mgr1', plan)).toBe(false);
  });

  it('returns false for unknown user', () => {
    const plan = makePlan({ audience: 'ALL' });
    expect(svc.isUserInPlanAudience('nonexistent', plan)).toBe(false);
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
    expect(levels).toEqual(['DM', 'AGM', 'GM', 'CEO']);
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
    const { writeBatch } = await import('firebase/firestore');
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
    const { updateDoc } = await import('firebase/firestore');
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

    const { updateDoc } = await import('firebase/firestore');
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

    const { updateDoc } = await import('firebase/firestore');
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

// ─── generateDepartmentalTNA ─────────────────────────────────────────────────

describe('generateDepartmentalTNA', () => {
  let svc: DataService;

  const JOB: JobProfile = {
    id: 'job1', title: 'Test Job', description: '', departmentId: 'dept1', orgLevel: 'SP',
    requiredSkills: [{ skillId: 'skill1', requiredLevel: 4 }],
  } as unknown as JobProfile;

  beforeEach(() => {
    svc = makeSvc();
    inject(svc, {
      skills: [makeSkill({ id: 'skill1', name: 'Test Skill', assessmentMethod: 'WRITTEN_EXAM' })],
      jobs: [JOB],
      assessments: [],
      evidences: [],
      trainingCourses: [],
      assessmentInstructions: [],
    });
  });

  it('returns [] when no department members have gaps', () => {
    inject(svc, {
      users: [makeUser({ id: 'u1', departmentId: 'dept1', jobProfileId: 'job1', orgLevel: 'SP' })],
      assessments: [makeAssessment({ subjectId: 'u1', type: 'WRITTEN_EXAM', score: 4 })],
    });
    expect(svc.generateDepartmentalTNA('dept1')).toEqual([]);
  });

  it('aggregates gap counts and totals across department members', () => {
    inject(svc, {
      users: [
        makeUser({ id: 'u1', departmentId: 'dept1', jobProfileId: 'job1', orgLevel: 'SP' }),
        makeUser({ id: 'u2', departmentId: 'dept1', jobProfileId: 'job1', orgLevel: 'SP' }),
      ],
      assessments: [], // both score 0 vs required 4 → gap 4 each
    });
    const tna = svc.generateDepartmentalTNA('dept1');
    expect(tna).toHaveLength(1);
    expect(tna[0].skillId).toBe('skill1');
    expect(tna[0].gapCount).toBe(2);
    expect(tna[0].totalGap).toBe(8);
    expect(tna[0].averageGap).toBe(4);
    expect(tna[0].priority).toBe('HIGH');
  });
});
