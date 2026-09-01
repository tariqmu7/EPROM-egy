/**
 * The write half of the store, exercised WITHOUT booting the store.
 *
 * Same point as `competency/__tests__/engine.test.ts`, one layer over: these
 * modules change data, so they are driven here through a hand-built `WriteHost`
 * that records every write, notification and audit line instead of sending it
 * anywhere. No auth session, no listeners, no network. What is asserted is the
 * behaviour the business rules depend on — a submission never carries its own
 * verdict, a score cache is dropped whenever a verdict moves, a never-assessed
 * skill is never planned, a sign-off stores the level it saw.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Assessment,
  DevelopmentPlan,
  DevelopmentPlanItem,
  Evidence,
  Notification,
  Skill,
  TrainingCourse,
  User,
  WorkExperience,
} from '../../../types';
import type { WriteHost } from '../host';
import * as writes from '../index';

// The wire. Ids are sequential so an assertion can name them.
let idSeq = 0;
vi.mock('../../firestore-compat', () => ({
  compatDb: {},
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (a: any, name?: string, id?: string) =>
    name === undefined ? { id: `gen-${++idSeq}` } : { collection: name, id: id ?? `gen-${++idSeq}` },
  writeBatch: () => batch,
}));

// The batch the mocked wire hands back — one shared recorder per test.
let batch: { sets: { path: any; payload: any }[]; set: (ref: any, payload: any) => void; commit: () => Promise<void> };

interface World {
  users?: Partial<User>[];
  skills?: Partial<Skill>[];
  evidences?: Partial<Evidence>[];
  workExperiences?: Partial<WorkExperience>[];
  developmentPlans?: Partial<DevelopmentPlan>[];
  trainingCourses?: Partial<TrainingCourse>[];
  notifications?: Partial<Notification>[];
  assessments?: Partial<Assessment>[];
  scores?: Record<string, { score: number; source: any }>;
  itp?: any;
}

interface Recorder extends WriteHost {
  persisted: { collection: string; item: any }[];
  updated: { collection: string; item: any }[];
  removed: { collection: string; id: string }[];
  notified: Omit<Notification, 'id' | 'createdAt' | 'isRead'>[];
  logged: { action: string; target: string }[];
  cacheClears: number;
}

function makeHost(world: World = {}): Recorder {
  const persisted: Recorder['persisted'] = [];
  const updated: Recorder['updated'] = [];
  const removed: Recorder['removed'] = [];
  const notified: Recorder['notified'] = [];
  const logged: Recorder['logged'] = [];
  let cacheClears = 0;

  const host: Recorder = {
    persisted, updated, removed, notified, logged,
    get cacheClears() { return cacheClears; },

    persist: async (collectionName, item) => { persisted.push({ collection: collectionName, item }); },
    update: async (collectionName, item) => { updated.push({ collection: collectionName, item }); },
    remove: async (collectionName, id) => { removed.push({ collection: collectionName, id }); },
    preparePayload: (_c, item) => item,
    reportWriteError: () => {},
    withRetry: (fn) => fn(),

    logActivity: async (action, target) => { logged.push({ action, target }); },
    notify: async (n) => { notified.push(n); },
    clearScoreCache: () => { cacheClears++; },
    currentActor: () => ({ actorId: 'actor-1', actorName: 'Actor' }),
    authUid: () => 'auth-uid',

    users: (world.users || []) as User[],
    evidences: (world.evidences || []) as Evidence[],
    workExperiences: (world.workExperiences || []) as WorkExperience[],
    developmentPlans: (world.developmentPlans || []) as DevelopmentPlan[],
    trainingCourses: (world.trainingCourses || []) as TrainingCourse[],
    notifications: (world.notifications || []) as Notification[],
    assessments: (world.assessments || []) as Assessment[],
    skills: (world.skills || []) as Skill[],

    getUserById: (id) => (world.users || []).find(u => u.id === id) as User | undefined,
    getUserSkillScore: (userId, skillId) => world.scores?.[`${userId}:${skillId}`]?.score ?? 0,
    getUserSkillScoreDetail: (userId, skillId) =>
      world.scores?.[`${userId}:${skillId}`] ?? { score: 0, source: 'NONE' },
    getUserCoverage: () => ({ required: 4, measured: 2, provisional: 1, unknown: 1, known: 3, compliancePct: 50 } as any),
    getTrainingCourse: (id) => (world.trainingCourses || []).find(c => c.id === id) as TrainingCourse | undefined,
    generateIndividualTrainingPlan: () => world.itp ?? null,
    suggestExperienceLevel: (years) => (years >= 5 ? 3 : years >= 2 ? 2 : 1),
  };
  return host;
}

beforeEach(() => {
  idSeq = 0;
  const sets: { path: any; payload: any }[] = [];
  batch = { sets, set: (ref, payload) => { sets.push({ path: ref, payload }); }, commit: async () => {} };
});

// ── Evidence ───────────────────────────────────────────────────────────────
describe('evidence', () => {
  const world = (): World => ({
    users: [{ id: 'emp', name: 'Employee', managerId: 'mgr' }, { id: 'mgr', name: 'Manager' }],
    evidences: [{ id: 'ev1', userId: 'emp', skillId: 's1', status: 'APPROVED', assignedScore: 4, reviewedBy: 'mgr' }],
  });

  it('submits PENDING and batches the manager notification with the record', async () => {
    const host = makeHost(world());
    const created = await writes.addEvidence(host, { userId: 'emp', skillId: 's1', title: 'x' } as any);
    expect(created.status).toBe('PENDING');
    // Both writes go in ONE batch, so neither can be orphaned by a failure.
    expect(batch.sets).toHaveLength(2);
    expect(batch.sets[1].payload.userId).toBe('mgr');
    expect(host.persisted).toHaveLength(0);
  });

  it('does not notify a manager the employee does not have', async () => {
    const host = makeHost({ users: [{ id: 'solo', name: 'Solo' }] });
    await writes.addEvidence(host, { userId: 'solo', skillId: 's1' } as any);
    expect(batch.sets).toHaveLength(1);
  });

  it('an owner edit re-opens review and clears the previous verdict', async () => {
    const host = makeHost(world());
    await writes.updateEvidence(host, 'ev1', { notes: 'fixed' });
    const item = host.updated[0].item as Evidence;
    expect(item.status).toBe('PENDING');
    expect(item.assignedScore).toBeUndefined();
    expect(item.reviewedBy).toBeUndefined();
    expect(host.notified[0].userId).toBe('mgr');
  });

  it('withdrawing an untouched submission does not chase the manager', async () => {
    const host = makeHost({
      users: [{ id: 'emp', name: 'Employee', managerId: 'mgr' }],
      evidences: [{ id: 'ev2', userId: 'emp', status: 'PENDING' }],
    });
    await writes.deleteEvidence(host, 'ev2');
    expect(host.removed).toEqual([{ collection: 'evidences', id: 'ev2' }]);
    expect(host.notified).toHaveLength(0);
  });

  it('a rejection carries no score', async () => {
    const host = makeHost(world());
    await writes.updateEvidenceStatus(host, 'ev1', 'REJECTED', 'mgr', 5, 'not enough');
    const item = host.updated[0].item as Evidence;
    expect(item.assignedScore).toBeUndefined();
    expect(host.notified[0].type).toBe('ERROR');
  });
});

// ── Work experience ────────────────────────────────────────────────────────
describe('work experience', () => {
  const world = (): World => ({
    users: [{ id: 'emp', name: 'Employee', managerId: 'mgr' }],
    workExperiences: [{
      id: 'we1', userId: 'emp', employer: 'ACME', jobTitle: 'Tech', status: 'PENDING',
      skills: [{ skillId: 's1', claimedLevel: 4, yearsApplied: 6, suggestedLevel: 3 }],
    }],
  });

  it('stamps the band-table suggestion at submit time', async () => {
    const host = makeHost(world());
    const entry = await writes.addWorkExperience(host, {
      userId: 'emp', employer: 'ACME', jobTitle: 'Tech',
      skills: [{ skillId: 's1', claimedLevel: 5, yearsApplied: 6 }],
    } as any);
    expect(entry.status).toBe('PENDING');
    expect(entry.skills[0].suggestedLevel).toBe(3);
    expect(host.logged[0].action).toBe('Submitted Work Experience');
  });

  it('an owner edit drops every verified level and clears the score cache', async () => {
    const host = makeHost({
      ...world(),
      workExperiences: [{
        id: 'we1', userId: 'emp', employer: 'ACME', jobTitle: 'Tech', status: 'VERIFIED',
        skills: [{ skillId: 's1', claimedLevel: 4, yearsApplied: 6, suggestedLevel: 3, verifiedLevel: 3 }],
      }],
    });
    await writes.updateWorkExperience(host, 'we1', { employer: 'ACME Ltd' });
    const item = host.updated[0].item as WorkExperience;
    expect(item.status).toBe('PENDING');
    expect(item.skills[0].verifiedLevel).toBeUndefined();
    expect(host.cacheClears).toBe(1);
  });

  it('a verdict clamps the level to 1-5 and clears the score cache', async () => {
    const host = makeHost(world());
    await writes.verifyWorkExperience(host, 'we1', 'VERIFIED', 'mgr', { s1: 9 });
    const item = host.updated[0].item as WorkExperience;
    expect(item.skills[0].verifiedLevel).toBe(5);
    expect(host.cacheClears).toBe(1);
    expect(host.notified[0].type).toBe('SUCCESS');
  });

  it('a rejection leaves no level behind that could score', async () => {
    const host = makeHost(world());
    await writes.verifyWorkExperience(host, 'we1', 'REJECTED', 'mgr');
    const item = host.updated[0].item as WorkExperience;
    expect(item.skills[0].verifiedLevel).toBeUndefined();
  });

  it('deleting a verified record clears the score cache', async () => {
    const host = makeHost({
      ...world(),
      workExperiences: [{ id: 'we1', userId: 'emp', employer: 'ACME', status: 'VERIFIED', skills: [] }],
    });
    await writes.deleteWorkExperience(host, 'we1');
    expect(host.cacheClears).toBe(1);
  });

  it('a policy change clears the score cache — it moves every provisional level', async () => {
    const host = makeHost();
    await writes.updateWorkExperiencePolicy(host, { enabled: true, maxProvisionalLevel: 2, bands: [] } as any);
    expect(host.persisted[0].item.id).toBe('work-experience');
    expect(host.cacheClears).toBe(1);
  });
});

// ── Development plans ──────────────────────────────────────────────────────
describe('development plans', () => {
  const itp = {
    recommendations: [
      { skillId: 'measured', skillName: 'Measured', gap: 2, recommendation: 'Course', priority: 'HIGH', targetDate: '2026-12-01' },
      { skillId: 'unknown', skillName: 'Unknown', gap: 3, recommendation: 'Course', priority: 'HIGH' },
    ],
  };
  const world = (): World => ({
    users: [{ id: 'emp', name: 'Employee', managerId: 'mgr', jobProfileId: 'jp1' }],
    itp,
    scores: { 'emp:measured': { score: 1, source: 'ASSESSMENT' }, 'emp:unknown': { score: 0, source: 'NONE' } },
  });

  it('never plans a skill nobody has measured', () => {
    const items = writes.proposeDevelopmentPlanItems(makeHost(world()), 'emp');
    expect(items.map(i => i.skillId)).toEqual(['measured']);
    // The level at planning is FROZEN on the item — that is what makes
    // "did the training work" answerable later.
    expect(items[0].levelAtPlanning).toBe(1);
    expect(items[0].requiredLevel).toBe(3);
    expect(items[0].sourceAtPlanning).toBe('ASSESSMENT');
  });

  it('a self-written plan starts as a DRAFT and tells nobody', async () => {
    const host = makeHost(world());
    const plan = await writes.createDevelopmentPlan(host, 'emp', { createdBy: 'emp' });
    expect(plan.status).toBe('DRAFT');
    expect(plan.coverageAtPlanning).toEqual({ required: 4, measured: 2, provisional: 1, unknown: 1 });
    expect(host.notified).toHaveLength(0);
  });

  it('an assigned plan starts ACTIVE and notifies the employee', async () => {
    const host = makeHost(world());
    const plan = await writes.createDevelopmentPlan(host, 'emp', { createdBy: 'mgr', status: 'ACTIVE' });
    expect(plan.activatedAt).toBeTruthy();
    expect(host.notified[0].userId).toBe('emp');
  });

  it('refuses to delete anything but a draft', async () => {
    const host = makeHost({ developmentPlans: [{ id: 'p1', status: 'ACTIVE', title: 'Plan', items: [] }] });
    await expect(writes.deleteDevelopmentPlan(host, 'p1')).rejects.toThrow(/draft/i);
    expect(host.removed).toHaveLength(0);
  });

  const planWith = (item: Partial<DevelopmentPlanItem>): World => ({
    users: [{ id: 'emp', name: 'Employee', managerId: 'mgr' }],
    developmentPlans: [{
      id: 'p1', userId: 'emp', status: 'ACTIVE', title: 'Plan',
      items: [{ id: 'i1', skillId: 's1', skillName: 'Skill', requiredLevel: 3, levelAtPlanning: 1, gapAtPlanning: 2, status: 'NOT_STARTED', supervisorSignOff: false, ...item } as DevelopmentPlanItem],
    }],
    scores: { 'emp:s1': { score: 3, source: 'ASSESSMENT' } },
  });

  it('completing an item asks the manager for a sign-off', async () => {
    const host = makeHost(planWith({}));
    await writes.setDevelopmentPlanItemStatus(host, 'p1', 'i1', 'COMPLETED');
    const saved = host.updated[0].item as DevelopmentPlan;
    expect(saved.items[0].completedAt).toBeTruthy();
    expect(host.notified[0].userId).toBe('mgr');
  });

  it('re-opening an item drops the sign-off with the completion', async () => {
    const host = makeHost(planWith({ status: 'COMPLETED', completedAt: 'yesterday', supervisorSignOff: true, signedOffBy: 'mgr', levelAtSignOff: 3 }));
    await writes.setDevelopmentPlanItemStatus(host, 'p1', 'i1', 'IN_PROGRESS');
    const item = (host.updated[0].item as DevelopmentPlan).items[0];
    expect(item.supervisorSignOff).toBe(false);
    expect(item.signedOffBy).toBeUndefined();
    expect(item.levelAtSignOff).toBeUndefined();
    expect(item.completedAt).toBeUndefined();
  });

  it('a sign-off STORES the level it read, and finishes a plan with nothing left in play', async () => {
    const host = makeHost(planWith({ status: 'COMPLETED', completedAt: 'yesterday' }));
    await writes.signOffDevelopmentPlanItem(host, 'p1', 'i1', 'mgr', 'well done');
    const saved = host.updated[0].item as DevelopmentPlan;
    expect(saved.items[0].levelAtSignOff).toBe(3);
    expect(saved.status).toBe('COMPLETED');
    // The before/after pair is what the notification and the audit line report.
    expect(host.notified[0].message).toContain('from 1 to 3');
    expect(host.logged[0].action).toBe('Signed Off Development Item');
  });

  it('a cancelled item does not hold the plan open', async () => {
    const host = makeHost({
      users: [{ id: 'emp', name: 'Employee' }],
      developmentPlans: [{
        id: 'p1', userId: 'emp', status: 'ACTIVE', title: 'Plan',
        items: [
          { id: 'i1', skillId: 's1', skillName: 'A', requiredLevel: 3, levelAtPlanning: 1, gapAtPlanning: 2, status: 'COMPLETED', supervisorSignOff: false } as DevelopmentPlanItem,
          { id: 'i2', skillId: 's2', skillName: 'B', requiredLevel: 3, levelAtPlanning: 1, gapAtPlanning: 2, status: 'CANCELLED', supervisorSignOff: false } as DevelopmentPlanItem,
        ],
      }],
      scores: { 'emp:s1': { score: 3, source: 'ASSESSMENT' } },
    });
    await writes.signOffDevelopmentPlanItem(host, 'p1', 'i1', 'mgr');
    expect((host.updated[0].item as DevelopmentPlan).status).toBe('COMPLETED');
  });

  it('never adds a second item for a skill already on the plan', async () => {
    const host = makeHost(planWith({}));
    const added = await writes.addDevelopmentPlanItems(host, 'p1', [
      { id: 'x', skillId: 's1', skillName: 'Skill' } as DevelopmentPlanItem,
      { id: 'y', skillId: 's2', skillName: 'Other' } as DevelopmentPlanItem,
    ]);
    expect(added).toBe(1);
    expect((host.updated[0].item as DevelopmentPlan).items).toHaveLength(2);
  });
});

// ── Notifications ──────────────────────────────────────────────────────────
describe('notifications', () => {
  it('every browser-written notification names its sender (hole H7)', async () => {
    const host = makeHost();
    await writes.addNotification(host, { userId: 'emp', title: 'Hi', message: 'x', type: 'INFO' });
    expect(host.persisted[0].item.createdBy).toBe('actor-1');
  });

  it('falls back to the auth uid before the roster has loaded', async () => {
    const host = makeHost();
    host.currentActor = () => ({});
    await writes.addNotification(host, { userId: 'emp', title: 'Hi', message: 'x', type: 'INFO' });
    expect(host.persisted[0].item.createdBy).toBe('auth-uid');
  });

  it('marks only this user\'s unread rows', async () => {
    const host = makeHost({
      notifications: [
        { id: 'n1', userId: 'emp', isRead: false },
        { id: 'n2', userId: 'emp', isRead: true },
        { id: 'n3', userId: 'other', isRead: false },
      ],
    });
    await writes.markAllNotificationsAsRead(host, 'emp');
    expect(host.updated.map(u => u.item.id)).toEqual(['n1']);
  });
});

// ── Assessments ────────────────────────────────────────────────────────────
describe('assessments', () => {
  const base = { subjectId: 'emp', raterId: 'mgr', skillId: 's1', score: 3, type: 'MANAGER', method: 'INTERVIEW' };
  const world = (extra: Partial<Assessment> = {}): World => ({
    users: [{ id: 'emp', name: 'Employee' }, { id: 'mgr', name: 'Manager' }],
    skills: [{ id: 's1', name: 'Welding' }],
    assessments: [{ id: 'a1', date: '2026-03-01T00:00:00.000Z', ...base, ...extra } as Assessment],
  });

  it('a re-submission in the same year updates the rater\'s record in place', async () => {
    const host = makeHost(world());
    await writes.addAssessment(host, { ...base, score: 5, date: '2026-09-01T00:00:00.000Z' } as any);
    expect(host.persisted).toHaveLength(0);
    expect(host.updated[0].item.id).toBe('a1');
    expect(host.updated[0].item.score).toBe(5);
  });

  it('a new year is a new historical record, not an overwrite', async () => {
    const host = makeHost(world());
    await writes.addAssessment(host, { ...base, score: 5, date: '2027-01-05T00:00:00.000Z' } as any);
    expect(host.updated).toHaveLength(0);
    expect(host.persisted[0].collection).toBe('assessments');
  });

  it('an explicit cycle is its own bucket', async () => {
    const host = makeHost(world({ cycleId: 'c1' }));
    await writes.addAssessment(host, { ...base, cycleId: 'c2', date: '2026-04-01T00:00:00.000Z' } as any);
    expect(host.updated).toHaveLength(0);
  });

  it('an archived record never blocks a fresh one', async () => {
    const host = makeHost(world({ isArchived: true }));
    await writes.addAssessment(host, { ...base, date: '2026-04-01T00:00:00.000Z' } as any);
    expect(host.updated).toHaveLength(0);
  });

  it('a self-assessment does not notify its own author twice', async () => {
    const host = makeHost({ users: [{ id: 'emp', name: 'Employee' }], skills: [], assessments: [] });
    await writes.addAssessment(host, { ...base, raterId: 'emp', type: 'SELF' } as any);
    expect(host.notified).toHaveLength(1);
  });
});

// ── Training catalogue ─────────────────────────────────────────────────────
describe('training catalogue', () => {
  it('generates a code that does not collide', () => {
    const host = makeHost({ trainingCourses: [{ id: 'c1', code: 'TRN-BASIC-01' } as TrainingCourse] });
    expect(writes.generateTrainingCourseCode(host, { title: 'Basic Welding' })).toBe('TRN-BASIC-02');
  });

  it('keeps a supplied code and stamps the timestamps', async () => {
    const host = makeHost();
    const course = await writes.addTrainingCourse(host, { title: 'Rigging', code: 'TRN-X-01', provider: 'P' } as any);
    expect(course.code).toBe('TRN-X-01');
    expect(course.linkedSkillIds).toEqual([]);
    expect(course.createdAt).toBeTruthy();
  });

  it('removal is a soft delete — an old plan may still name the course', async () => {
    const host = makeHost({ trainingCourses: [{ id: 'c1', title: 'Rigging' } as TrainingCourse] });
    await writes.removeTrainingCourse(host, 'c1');
    expect(host.updated[0].item.isArchived).toBe(true);
    expect(host.removed).toHaveLength(0);
    await writes.restoreTrainingCourse(host, 'c1');
    expect(host.updated[1].item.isArchived).toBe(false);
  });
});
