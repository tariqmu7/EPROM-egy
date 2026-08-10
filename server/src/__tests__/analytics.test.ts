// Verification for the live aggregate endpoints (src/analytics/).
//
// These moved the CEO and TNA maths off the browser (finding 7), so the two
// things worth proving are:
//   1. the NUMBERS still obey the coverage rules — a never-assessed requirement
//      is unknown, not a gap; no percentage without its base; a provisional
//      work-experience level counts as known but not as measured;
//   2. the SCOPE is a real boundary — a manager may ask about their own team or
//      a unit they run, and nothing else. The endpoint returns the whole
//      company's numbers, so a hole here leaks the entire org chart.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;
let query: (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

const ADMIN = { id: 'an-admin', email: 'an-admin@eprom.local' };
const MGR = { id: 'an-mgr', email: 'an-mgr@eprom.local' };
const EMP = { id: 'an-emp', email: 'an-emp@eprom.local' };
const OTHER = { id: 'an-other', email: 'an-other@eprom.local' };

async function seedUser(u: { id: string; email: string }, role: string, password: string, extra: any = {}) {
  const pw = await import('../auth/password.js');
  await query('INSERT INTO users (id, data) VALUES ($1, $2)', [
    u.id,
    { id: u.id, name: u.email, email: u.email, role, status: 'ACTIVE', ...extra },
  ]);
  await query('INSERT INTO auth_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)', [
    u.id,
    u.email,
    await pw.hashPassword(password),
  ]);
}

async function seedDoc(table: string, id: string, data: Record<string, unknown>) {
  await query(`INSERT INTO "${table}" (id, data) VALUES ($1, $2)`, [id, { id, ...data }]);
}

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let adminToken = '';
let mgrToken = '';
let empToken = '';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.BCRYPT_ROUNDS = '4';
  process.env.BOOTSTRAP_ADMIN_EMAIL = '';

  const { newDb } = await import('pg-mem');
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const db = await import('../db.js');
  db.setPool(new Pool() as any);
  query = db.query;

  const cols =
    '(id TEXT PRIMARY KEY, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())';
  for (const t of ['users', 'skills', 'assessments', 'evidences', 'notifications', 'departments']) {
    await query(`CREATE TABLE ${t} ${cols}`);
  }
  for (const t of ['jobProfiles', 'workExperiences', 'appSettings', 'trainingCourses', 'developmentPlans']) {
    await query(`CREATE TABLE "${t}" ${cols}`);
  }
  await query(
    'CREATE TABLE auth_credentials (user_id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, must_reset BOOLEAN, updated_at TIMESTAMPTZ, created_at TIMESTAMPTZ)',
  );
  await query(
    `CREATE TABLE competency_snapshots (
       id TEXT PRIMARY KEY, period TEXT NOT NULL, scope_type TEXT NOT NULL, scope_id TEXT NOT NULL,
       scope_name TEXT, taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
       headcount INTEGER NOT NULL DEFAULT 0, with_requirements INTEGER NOT NULL DEFAULT 0,
       required INTEGER NOT NULL DEFAULT 0, measured INTEGER NOT NULL DEFAULT 0,
       provisional INTEGER NOT NULL DEFAULT 0, unknown INTEGER NOT NULL DEFAULT 0,
       compliant_known INTEGER NOT NULL DEFAULT 0, gaps_known INTEGER NOT NULL DEFAULT 0,
       total_gap NUMERIC NOT NULL DEFAULT 0, compliance_pct INTEGER, avg_gap NUMERIC,
       measured_pct INTEGER NOT NULL DEFAULT 0, detail JSONB)`,
  );

  // ── Org chart: gd-1 (general) → dept-1 (section, run by MGR) ──────────────
  await seedDoc('departments', 'gd-1', { name: 'General Maintenance', parentId: null, type: 'GENERAL' });
  await seedDoc('departments', 'dept-1', { name: 'Rotating Equipment', parentId: 'gd-1', type: 'SECTION', managerId: MGR.id });
  await seedDoc('departments', 'dept-2', { name: 'Electrical', parentId: 'gd-1', type: 'SECTION' });

  await seedUser(ADMIN, 'ADMIN', 'admin-pass');
  await seedUser(MGR, 'EMPLOYEE', 'mgr-pass', { orgLevel: 'SH', departmentId: 'dept-1' });
  await seedUser(EMP, 'EMPLOYEE', 'emp-pass', {
    orgLevel: 'JP', managerId: MGR.id, departmentId: 'dept-1', jobProfileId: 'jp-1',
  });
  // Somebody in a different unit, so a scope that over-returns is visible.
  await seedUser(OTHER, 'EMPLOYEE', 'other-pass', {
    orgLevel: 'JP', departmentId: 'dept-2', jobProfileId: 'jp-1',
  });
  // Archived people never count.
  await seedDoc('users', 'an-archived', {
    name: 'Gone', email: 'gone@eprom.local', role: 'EMPLOYEE', status: 'ACTIVE',
    departmentId: 'dept-1', jobProfileId: 'jp-1', isArchived: true,
  });

  // s1 measured (interview), s2 provisional (verified experience, capped),
  // s3 never assessed at all — one of each source in one profile.
  await seedDoc('skills', 's1', { name: 'Pump Alignment', category: 'TECHNICAL', assessmentMethods: [{ id: 'm1', method: 'INTERVIEW', frequency: 'QUARTERLY', audience: 'ALL' }] });
  // s2 is deliberately SAFETY_CRITICAL and s1 carries no criticality at all —
  // the pair proves a legacy skill defaults to STANDARD and that criticality
  // cannot promote a skill nobody falls short on.
  await seedDoc('skills', 's2', { name: 'Induction', category: 'SAFETY', criticality: 'SAFETY_CRITICAL', assessmentMethods: [{ id: 'm2', method: 'WRITTEN_EXAM', frequency: 'ONE_TIME', audience: 'ALL' }] });
  await seedDoc('skills', 's3', { name: 'Leadership', category: 'BEHAVIORAL', assessmentMethods: [{ id: 'm3', method: 'WRITTEN_EXAM', frequency: 'ONE_TIME', audience: 'ALL' }] });

  await seedDoc('jobProfiles', 'jp-1', {
    title: 'Junior Engineer', orgLevel: 'JP',
    requiredSkills: JSON.stringify([
      { skillId: 's1', requiredLevel: 4 },
      { skillId: 's2', requiredLevel: 2 },
      { skillId: 's3', requiredLevel: 3 },
      { skillId: 'deleted-skill', requiredLevel: 5 },
    ]),
  });

  // EMP: measured 3 against a required 4 ⇒ a real gap of 1.
  await seedDoc('assessments', 'an-a1', {
    subjectId: EMP.id, skillId: 's1', score: 3, date: '2026-07-01', type: 'INTERVIEW', raterId: MGR.id,
  });
  // EMP: verified experience at level 4 on s2, capped to L3 ⇒ provisional, meets 2.
  await seedDoc('workExperiences', 'an-we1', {
    userId: EMP.id, status: 'VERIFIED',
    skills: JSON.stringify([{ skillId: 's2', verifiedLevel: 4, yearsApplied: 8 }]),
  });
  // A course for s1 (the cure) and an archived one that must never be offered.
  await seedDoc('trainingCourses', 'c1', {
    title: 'Pump Alignment Level 4', provider: 'EPROM Academy', type: 'INTERNAL', linkedSkillIds: ['s1'],
    costPerSeat: 1500, durationHours: 16,
  });
  await seedDoc('trainingCourses', 'c2', {
    title: 'Retired course', provider: 'Old', type: 'EXTERNAL', linkedSkillIds: ['s1'], isArchived: true,
  });

  const { createApp } = await import('../app.js');
  app = createApp();
  adminToken = await login(ADMIN.email, 'admin-pass');
  mgrToken = await login(MGR.email, 'mgr-pass');
  empToken = await login(EMP.email, 'emp-pass');
});

describe('GET /analytics/overview', () => {
  it('gives the admin the company picture, with unknowns kept out of compliance', async () => {
    const res = await request(app).get('/analytics/overview').set(auth(adminToken));
    expect(res.status).toBe(200);

    // EMP + OTHER carry the profile; ADMIN and MGR have none. The archived user
    // is not in the roster at all.
    expect(res.body.headcount).toBe(4);
    expect(res.body.withRequirements).toBe(2);

    const c = res.body.coverage;
    // 3 live requirements each (the 4th points at a deleted skill and is dropped).
    expect(c.required).toBe(6);
    expect(c.measured).toBe(1);       // EMP's s1 interview
    expect(c.provisional).toBe(1);    // EMP's capped experience on s2
    expect(c.unknown).toBe(4);        // EMP's s3 + all three of OTHER's
    expect(c.known).toBe(2);
    expect(c.gapsKnown).toBe(1);      // s1: 3 against a required 4
    expect(c.totalGap).toBe(1);
    expect(c.compliancePct).toBe(50); // 1 compliant of 2 KNOWN, not of 6
  });

  it('rolls a general department up from the sections beneath it', async () => {
    const res = await request(app).get('/analytics/overview').set(auth(adminToken));
    const rows: any[] = res.body.departments;

    const gd = rows.find((r) => r.departmentId === 'gd-1');
    // Nobody sits in gd-1 directly; it must still see both sections' people.
    expect(gd.headcount).toBe(3); // MGR + EMP + OTHER
    expect(gd.withRequirements).toBe(2);

    const dept1 = rows.find((r) => r.departmentId === 'dept-1');
    expect(dept1.headcount).toBe(2);
    expect(dept1.coverage.measured).toBe(1);
    expect(dept1.parentId).toBe('gd-1');
  });

  it('reports "—" (null), not 0%, for someone nothing is known about', async () => {
    const res = await request(app).get('/analytics/overview').set(auth(adminToken));
    const people: any[] = res.body.people;

    const other = people.find((p) => p.userId === OTHER.id);
    expect(other.coverage.required).toBe(3);
    expect(other.coverage.unknown).toBe(3);
    expect(other.coverage.compliancePct).toBeNull();
    expect(other.coverage.avgGap).toBeNull();

    // No job profile ⇒ no requirements ⇒ nothing to report, not a 0% score.
    const admin = people.find((p) => p.userId === ADMIN.id);
    expect(admin.coverage.required).toBe(0);
    expect(admin.coverage.compliancePct).toBeNull();
    expect(res.body.withoutProfile).toBe(2);
  });

  it('scopes to one department when asked', async () => {
    const res = await request(app).get('/analytics/overview?scope=dept-2').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.scope.kind).toBe('DEPARTMENT');
    expect(res.body.people.map((p: any) => p.userId)).toEqual([OTHER.id]);
    expect(res.body.coverage.measured).toBe(0);
    expect(res.body.coverage.unknown).toBe(3);
  });

  it('ranks the skill hotspots the same way the training-needs table does', async () => {
    const [overview, tna] = await Promise.all([
      request(app).get('/analytics/overview').set(auth(adminToken)),
      request(app).get('/analytics/training-needs').set(auth(adminToken)),
    ]);
    const gaps: any[] = overview.body.topSkillGaps;

    // One ranking key (weighted gap) across both screens: the analytics page and
    // the TNA can never nominate a different worst skill for the same scope.
    expect(gaps[0].skillId).toBe(tna.body.needs[0].skillId);
    expect(gaps[0].weightedGap).toBe(tna.body.needs[0].weightedGap);

    const s1 = gaps.find((g) => g.skillId === 's1');
    expect(s1.employeesRequiring).toBe(2);
    expect(s1.measured).toBe(1);
    expect(s1.unknown).toBe(1);
    expect(s1.gapCount).toBe(1);
    expect(s1.averageGap).toBe(1);
    expect(s1.affectedPct).toBe(100);
    // Never judged ⇒ STANDARD ×1, so the weighted gap is the raw gap.
    expect(s1.criticality).toBe('STANDARD');
    expect(s1.weightedGap).toBe(1);

    // s3 is safety-relevant to nobody's score: it was never measured at all, so
    // it has no share of the measured and cannot outrank a real shortfall.
    const s3 = gaps.find((g) => g.skillId === 's3');
    expect(s3.known).toBe(0);
    expect(s3.unknown).toBe(2);
    expect(s3.affectedPct).toBeNull();
    expect(s3.weightedGap).toBe(0);
    expect(gaps.indexOf(s3)).toBeGreaterThan(gaps.indexOf(s1));
  });

  it('is closed to everyone below CEO', async () => {
    expect((await request(app).get('/analytics/overview').set(auth(mgrToken))).status).toBe(403);
    expect((await request(app).get('/analytics/overview').set(auth(empToken))).status).toBe(403);
    expect((await request(app).get('/analytics/overview')).status).toBe(401);
  });
});

describe('GET /analytics/training-needs', () => {
  it('separates a training gap from an assessment gap', async () => {
    const res = await request(app).get('/analytics/training-needs').set(auth(adminToken));
    expect(res.status).toBe(200);

    const bySkill = Object.fromEntries(res.body.needs.map((n: any) => [n.skillId, n]));

    // s1: two people require it, one measured with a gap, one never assessed.
    expect(bySkill.s1.employeesRequiring).toBe(2);
    expect(bySkill.s1.measured).toBe(1);
    expect(bySkill.s1.unknown).toBe(1);
    expect(bySkill.s1.gapCount).toBe(1);
    expect(bySkill.s1.totalGap).toBe(1);
    expect(bySkill.s1.affectedPct).toBe(100);
    expect(bySkill.s1.priority).toBe('HIGH');
    // The cure, archived course excluded.
    expect(bySkill.s1.courses.map((c: any) => c.id)).toEqual(['c1']);

    // s2: EMP meets it provisionally, OTHER was never assessed. No gap, but the
    // unknown keeps the row on the list — as assessment work, never as budget.
    expect(bySkill.s2.gapCount).toBe(0);
    expect(bySkill.s2.provisional).toBe(1);
    expect(bySkill.s2.unknown).toBe(1);
    expect(bySkill.s2.affectedPct).toBe(0);
    expect(bySkill.s2.priority).toBe('LOW');

    // s3: nobody measured at all ⇒ no percentage, and silence cannot make a HIGH.
    expect(bySkill.s3.known).toBe(0);
    expect(bySkill.s3.unknown).toBe(2);
    expect(bySkill.s3.affectedPct).toBeNull();
    expect(bySkill.s3.priority).toBe('LOW');
  });

  it('ships the weighting and the costed bill to the browser', async () => {
    const res = await request(app).get('/analytics/training-needs').set(auth(adminToken));
    const bySkill = Object.fromEntries(res.body.needs.map((n: any) => [n.skillId, n]));

    // s1 was never judged ⇒ STANDARD, weight 1, and the raw gap is the ranking.
    expect(bySkill.s1.criticality).toBe('STANDARD');
    expect(bySkill.s1.criticalityWeight).toBe(1);
    expect(bySkill.s1.weightedGap).toBe(1);
    expect(bySkill.s1.priorityScore).toBe(50);
    // One person short × the linked course's price.
    expect(bySkill.s1.seatCost).toBe(1500);
    expect(bySkill.s1.estimatedCost).toBe(1500);
    expect(bySkill.s1.estimatedHours).toBe(16);

    // Safety critical, but nobody measured falls short — still not a priority.
    expect(bySkill.s2.criticality).toBe('SAFETY_CRITICAL');
    expect(bySkill.s2.criticalityWeight).toBe(3);
    expect(bySkill.s2.priority).toBe('LOW');
    expect(bySkill.s2.estimatedCost).toBeNull();

    // The bill, and how much of it nobody can price.
    expect(res.body.budget).toEqual({
      skillsCosted: 1, skillsUncosted: 0, seatsCosted: 1, seatsUncosted: 0,
      estimatedCost: 1500, estimatedHours: 16,
    });
  });

  it("gives a manager their own team without the rest of the company", async () => {
    const res = await request(app).get('/analytics/training-needs?scope=team').set(auth(mgrToken));
    expect(res.status).toBe(200);
    expect(res.body.scope.kind).toBe('TEAM');
    // EMP only: OTHER is in another section, and the manager never counts themselves.
    expect(res.body.headcount).toBe(1);
    expect(res.body.withRequirements).toBe(1);
    expect(res.body.coverage.required).toBe(3);
  });

  it('lets a manager analyse a unit they run, and refuses one they do not', async () => {
    const mine = await request(app).get('/analytics/training-needs?scope=dept-1').set(auth(mgrToken));
    expect(mine.status).toBe(200);
    expect(mine.body.headcount).toBe(2); // MGR + EMP

    for (const scope of ['dept-2', 'gd-1', 'company', '']) {
      const res = await request(app)
        .get(`/analytics/training-needs?scope=${scope}`)
        .set(auth(mgrToken));
      expect(res.status).toBe(403);
    }
  });

  it('refuses an unknown department instead of silently widening the scope', async () => {
    const res = await request(app).get('/analytics/training-needs?scope=nope').set(auth(adminToken));
    expect(res.status).toBe(403);
  });

  it('gives an ordinary employee an empty team, never the company', async () => {
    const team = await request(app).get('/analytics/training-needs?scope=team').set(auth(empToken));
    expect(team.status).toBe(200);
    expect(team.body.headcount).toBe(0);
    expect(team.body.needs).toEqual([]);

    expect((await request(app).get('/analytics/training-needs').set(auth(empToken))).status).toBe(403);
  });

  it('agrees with the pooled coverage the overview reports', async () => {
    const [tna, overview] = await Promise.all([
      request(app).get('/analytics/training-needs').set(auth(adminToken)),
      request(app).get('/analytics/overview').set(auth(adminToken)),
    ]);
    // One brain, two endpoints: the TNA banner and the CEO tile must never
    // print different numbers for the same scope.
    expect(tna.body.coverage).toEqual(overview.body.coverage);
  });
});
