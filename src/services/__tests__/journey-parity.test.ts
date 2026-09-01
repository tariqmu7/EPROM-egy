/**
 * THE BROWSER HALF OF THE END-TO-END JOURNEY.
 *
 * `server/src/__tests__/journey.test.ts` walks the same life-cycle over the real
 * API: an admin builds a profile, a manager interviews, the employee submits
 * evidence, a development plan is agreed, worked, re-measured and signed off,
 * and the analytics endpoints report the result. That run proves the SERVER's
 * numbers.
 *
 * But two things the employee actually sees are computed in the browser and
 * never leave it: their own coverage figure (`getUserCoverage`) and the ITP
 * PROPOSAL the saved plan is built from (`proposeDevelopmentPlanItems` →
 * `generateIndividualTrainingPlan`). If those disagreed with the server, the
 * dashboard and the CEO's report would tell two different stories about the
 * same person — the exact defect the single scoring brain exists to prevent.
 *
 * So this file replays the SAME journey, with the same fixture at each stage,
 * against `DataService`, and asserts the same figures the server suite asserts.
 * The expected numbers are written out literally on both sides on purpose: if
 * one brain drifts, one of the two files fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Backend (compat-shim) mocks — nothing here talks to the network ─────────
vi.mock('../firestore-compat', () => ({
  collection: vi.fn(), doc: vi.fn(() => ({ id: 'mock-id' })), getDocs: vi.fn(), getDoc: vi.fn(),
  setDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(),
  or: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()), writeBatch: vi.fn(), serverTimestamp: vi.fn(),
  Timestamp: vi.fn(), compatDb: {},
}));
vi.mock('../auth-compat', () => ({
  onAuthStateChanged: vi.fn((_a: unknown, cb: (u: null) => void) => { cb(null); return vi.fn(); }),
  createUserWithEmailAndPassword: vi.fn(), signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(), compatAuth: { currentUser: null },
}));
vi.mock('../api-client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() },
  ApiError: class ApiError extends Error {}, ApiNetworkError: class ApiNetworkError extends Error {},
  getToken: vi.fn(), setToken: vi.fn(), clearToken: vi.fn(),
}));

import { DataService } from '../store';
import type { Assessment, DevelopmentPlan, Evidence, JobProfile, Skill, User } from '../../types';
import { Role } from '../../types';

// The same cast of characters, ids and levels as the server journey.
const EMP = 'jr-emp';
const MGR = 'jr-mgr';
const PROFILE = 'jr-profile';
const SKILL_INTERVIEW = 'jr-skill-pump'; // required 4
const SKILL_EVIDENCE = 'jr-skill-report'; // required 3

const employee: User = {
  id: EMP, name: 'New Joiner', email: 'jr-emp@eprom.local', role: Role.EMPLOYEE, status: 'ACTIVE',
  departmentId: 'jr-dept', orgLevel: 'JP', managerId: MGR, jobProfileId: PROFILE,
  avatarUrl: '', certificates: [], careerHistory: [],
} as unknown as User;

const skills: Skill[] = [
  {
    id: SKILL_INTERVIEW, name: 'Pump Alignment', category: 'TECHNICAL', criticality: 'HIGH', levels: {},
    assessmentMethods: [{ id: 'm-int', method: 'INTERVIEW', frequency: 'ANYTIME_ANNUAL', audience: 'ALL', questions: [] }],
  } as unknown as Skill,
  {
    id: SKILL_EVIDENCE, name: 'Shift Reporting', category: 'TECHNICAL', levels: {},
    assessmentMethods: [{ id: 'm-ev', method: 'WORK_RECORD_REVIEW', frequency: 'ANYTIME_ANNUAL', audience: 'ALL', questions: [] }],
  } as unknown as Skill,
];

const profile: JobProfile = {
  id: PROFILE, title: 'Junior Engineer', description: '', departmentId: 'jr-dept', orgLevel: 'JP',
  requiredSkills: [
    { skillId: SKILL_INTERVIEW, requiredLevel: 4 },
    { skillId: SKILL_EVIDENCE, requiredLevel: 3 },
  ],
} as unknown as JobProfile;

const interviewAt3: Assessment = {
  id: 'jr-interview-1', subjectId: EMP, raterId: MGR, skillId: SKILL_INTERVIEW,
  type: 'INTERVIEW', score: 3, date: '2026-09-01T10:00:00.000Z', isArchived: false,
} as unknown as Assessment;

const interviewAt4: Assessment = {
  id: 'jr-interview-2', subjectId: EMP, raterId: MGR, skillId: SKILL_INTERVIEW,
  type: 'INTERVIEW', score: 4, date: '2026-11-20T10:00:00.000Z', isArchived: false,
} as unknown as Assessment;

const approvedEvidence: Evidence = {
  id: 'jr-evidence', userId: EMP, skillId: SKILL_EVIDENCE, status: 'APPROVED', assignedScore: 3,
  submittedAt: '2026-09-02T08:00:00.000Z', title: 'Weekly shift handover pack',
} as unknown as Evidence;

function svcWith(assessments: Assessment[], evidences: Evidence[], plans: DevelopmentPlan[] = []): DataService {
  const svc = new DataService();
  Object.assign(svc as unknown as Record<string, unknown>, {
    users: [employee],
    jobs: [profile],
    skills,
    assessments,
    evidences,
    workExperiences: [],
    trainingCourses: [],
    developmentPlans: plans,
    assessmentInstructions: [],
    appSettings: {},
  });
  return svc;
}

describe('journey parity — the browser computes what the server reported', () => {
  let svc: DataService;

  beforeEach(() => {
    svc = svcWith([], []);
  });

  // Server journey, step 4.
  it('day one: two requirements, both unknown, and NO percentage', () => {
    const coverage = svc.getUserCoverage(EMP);
    expect(coverage.required).toBe(2);
    expect(coverage.measured).toBe(0);
    expect(coverage.unknown).toBe(2);
    expect(coverage.compliancePct).toBeNull();
    expect(coverage.avgGap).toBeNull();
  });

  it('day one: nothing is proposed for training — an unmeasured skill is an ASSESSMENT need', () => {
    // The rule that keeps a plan honest: silence is not a gap. Both
    // requirements are unknown, so the proposal is empty even though the
    // employee is at 0 on paper.
    expect(svc.proposeDevelopmentPlanItems(EMP)).toEqual([]);
  });

  // Server journey, steps 5 and 6 — the same figures the API returned.
  it('after the interview and the approved evidence: measured 2, compliance 50%, avg gap 0.5', () => {
    svc = svcWith([interviewAt3], [approvedEvidence]);

    expect(svc.getUserSkillScoreDetail(EMP, SKILL_INTERVIEW)).toEqual({ score: 3, source: 'ASSESSMENT' });
    expect(svc.getUserSkillScoreDetail(EMP, SKILL_EVIDENCE)).toEqual({ score: 3, source: 'EVIDENCE' });

    const coverage = svc.getUserCoverage(EMP);
    expect(coverage.required).toBe(2);
    expect(coverage.measured).toBe(2);
    expect(coverage.unknown).toBe(0);
    expect(coverage.compliantKnown).toBe(1);
    expect(coverage.gapsKnown).toBe(1);
    expect(coverage.totalGap).toBe(1);
    expect(coverage.compliancePct).toBe(50);
    expect(coverage.avgGap).toBe(0.5);
  });

  // Server journey, step 7a — this is where the saved plan's one item came from.
  it('the ITP proposes exactly the one measured gap, with the level FROZEN at planning', () => {
    svc = svcWith([interviewAt3], [approvedEvidence]);

    const proposed = svc.proposeDevelopmentPlanItems(EMP);
    expect(proposed.map(i => i.skillId)).toEqual([SKILL_INTERVIEW]);
    expect(proposed[0].requiredLevel).toBe(4);
    expect(proposed[0].levelAtPlanning).toBe(3);
    expect(proposed[0].gapAtPlanning).toBe(1);
    expect(proposed[0].sourceAtPlanning).toBe('ASSESSMENT');
    expect(proposed[0].supervisorSignOff).toBe(false);
  });

  // Server journey, steps 7c and 8a — after the re-measure, from the browser.
  it('after the re-measure and sign-off: fully compliant, and the plan shows the level moved', () => {
    const signedOffPlan: DevelopmentPlan = {
      id: 'jr-plan', userId: EMP, title: '2026 Individual Training Plan', status: 'ACTIVE',
      jobProfileId: PROFILE, createdBy: MGR, createdAt: '2026-09-04T08:00:00.000Z',
      updatedAt: '2026-11-21T08:00:00.000Z',
      items: [{
        id: 'jr-plan-item', skillId: SKILL_INTERVIEW, skillName: 'Pump Alignment',
        requiredLevel: 4, levelAtPlanning: 3, gapAtPlanning: 1, sourceAtPlanning: 'ASSESSMENT',
        recommendation: 'Alignment workshop + supervised job', priority: 'HIGH',
        status: 'COMPLETED', targetDate: '2026-12-01',
        supervisorSignOff: true, signedOffBy: MGR, signedOffAt: '2026-11-21T08:00:00.000Z',
        levelAtSignOff: 4,
      }],
    } as unknown as DevelopmentPlan;

    svc = svcWith([interviewAt3, interviewAt4], [approvedEvidence], [signedOffPlan]);

    const coverage = svc.getUserCoverage(EMP);
    expect(coverage.measured).toBe(2);
    expect(coverage.gapsKnown).toBe(0);
    expect(coverage.totalGap).toBe(0);
    expect(coverage.compliancePct).toBe(100);
    expect(coverage.avgGap).toBe(0);

    const progress = svc.getDevelopmentPlanProgress(signedOffPlan);
    expect(progress.total).toBe(1);
    expect(progress.completed).toBe(1);
    expect(progress.signedOff).toBe(1);
    expect(progress.completedPct).toBe(100);
    // The visible effect of the plan: the level rose and the requirement is met.
    expect(progress.improved).toBe(1);
    expect(progress.levelsGained).toBe(1);
    expect(progress.requirementsMet).toBe(1);

    // And with the gap closed, nothing new is proposed.
    expect(svc.proposeDevelopmentPlanItems(EMP)).toEqual([]);
  });
});
