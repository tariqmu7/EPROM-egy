// Verification for the nightly sweep (src/jobs/). Two halves:
//   1. the PURE scheduling maths, asserted directly against the rules ported
//      from src/services/store.ts (audience, frequency, certificate banding);
//   2. the SWEEP itself, run against an in-memory Postgres (pg-mem) with a
//      hand-built roster, plus the admin /jobs endpoints through the real app.
//
// The rule that matters most here is the anti-noise one: running the sweep
// twice must not produce a second copy of any notification.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;
let query: (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
let runNightlySweep: typeof import('../jobs/nightly.js').runNightlySweep;
let runAndRecord: typeof import('../jobs/nightly.js').runAndRecord;

const NOW = new Date('2026-08-06T09:00:00Z');
const day = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * 86400000).toISOString();

const ADMIN = { id: 'admin-1', email: 'admin@eprom.local' };
const EMP = { id: 'emp-1', email: 'emp@eprom.local' };

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

async function notificationsFor(userId: string): Promise<any[]> {
  const { rows } = await query(`SELECT data FROM notifications WHERE data->>'userId' = $1`, [userId]);
  return rows.map((r) => r.data);
}

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
  // `trainingCourses` is here because the snapshot now shares the analytics
  // model loader, which reads the catalogue too (analytics/model.ts).
  for (const t of ['jobProfiles', 'developmentPlans', 'workExperiences', 'appSettings', 'trainingCourses']) {
    await query(`CREATE TABLE "${t}" ${cols}`);
  }
  await query(
    'CREATE TABLE auth_credentials (user_id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, must_reset BOOLEAN, updated_at TIMESTAMPTZ, created_at TIMESTAMPTZ)',
  );
  // Migration 007. Plain operational table — no data/version columns.
  await query(
    'CREATE TABLE job_runs (id TEXT PRIMARY KEY, job TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT \'scheduled\', started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ, ok BOOLEAN, summary JSONB, error TEXT)',
  );
  // Migration 008. Same shape — server-owned derived data, not a /col collection.
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

  // ── Roster ───────────────────────────────────────────────────────────────
  await seedUser(ADMIN, 'ADMIN', 'admin-pass');
  // EMP: JP-level employee under MGR, with a job profile, a certificate 20 days
  // from expiry, an overdue quarterly assessment and an overdue plan item.
  await seedUser(EMP, 'EMPLOYEE', 'emp-pass', {
    orgLevel: 'JP',
    managerId: 'mgr-1',
    departmentId: 'dept-1',
    jobProfileId: 'jp-1',
    certificates: [{ id: 'c1', name: 'BOSIET', expiryDate: day(20), renewalStatus: 'VALID' }],
  });
  await seedUser({ id: 'mgr-1', email: 'mgr@eprom.local' }, 'EMPLOYEE', 'mgr-pass', { orgLevel: 'SH' });
  // Inactive people must never be chased.
  await seedDoc('users', 'pending-1', {
    name: 'Pending', email: 'p@eprom.local', role: 'EMPLOYEE', status: 'PENDING',
    jobProfileId: 'jp-1', orgLevel: 'JP',
    certificates: [{ id: 'c9', name: 'Expired thing', expiryDate: day(-5) }],
  });

  // Skill s1 is assessed quarterly for everyone; s2 is ONE_TIME (never chased);
  // s3's audience is MANAGERS_ONLY, so EMP (a JP) is outside it.
  await seedDoc('skills', 's1', { name: 'Pump Alignment', assessmentMethods: [{ id: 'm1', method: 'INTERVIEW', frequency: 'QUARTERLY', audience: 'ALL' }] });
  await seedDoc('skills', 's2', { name: 'Induction', assessmentMethods: [{ id: 'm2', method: 'WRITTEN_EXAM', frequency: 'ONE_TIME', audience: 'ALL' }] });
  await seedDoc('skills', 's3', { name: 'Leadership', assessmentMethods: [{ id: 'm3', method: 'INTERVIEW', frequency: 'MONTHLY', audience: 'MANAGERS_ONLY' }] });

  await seedDoc('jobProfiles', 'jp-1', {
    title: 'Junior Engineer',
    orgLevel: 'JP',
    // Stored as a JSON STRING, exactly as the frontend's preparePayload writes it.
    requiredSkills: JSON.stringify([
      { skillId: 's1', requiredLevel: 3 },
      { skillId: 's2', requiredLevel: 2 },
      { skillId: 's3', requiredLevel: 4 },
      { skillId: 'deleted-skill', requiredLevel: 5 },
    ]),
  });

  // s1 last assessed 200 days ago ⇒ quarterly is overdue. The INTERVIEW type is
  // what makes it a real MEASURED score for the snapshot as well.
  await seedDoc('assessments', 'a1', {
    subjectId: EMP.id, skillId: 's1', score: 3, date: day(-200), type: 'INTERVIEW', raterId: 'mgr-1',
  });

  // dept-1 sits under gd-1, so the snapshot's roll-up can be checked: gd-1 has
  // no direct members at all, yet must still see EMP.
  await seedDoc('departments', 'gd-1', { name: 'General Maintenance', parentId: null });
  await seedDoc('departments', 'dept-1', { name: 'Rotating Equipment', parentId: 'gd-1' });

  // VERIFIED experience tagged at level 4, which the L3 cap must knock down to
  // 3 — and which must count as PROVISIONAL, never as measured.
  await seedDoc('workExperiences', 'we-1', {
    userId: EMP.id, status: 'VERIFIED',
    skills: JSON.stringify([{ skillId: 's2', verifiedLevel: 4, yearsApplied: 8 }]),
  });

  await seedDoc('developmentPlans', 'dp-1', {
    userId: EMP.id, title: 'Plan', status: 'ACTIVE',
    items: [
      { id: 'i1', skillId: 's1', skillName: 'Pump Alignment', status: 'IN_PROGRESS', targetDate: day(-10) },
      { id: 'i2', skillId: 's2', skillName: 'Induction', status: 'COMPLETED', targetDate: day(-30) },
      { id: 'i3', skillId: 's3', skillName: 'Leadership', status: 'NOT_STARTED', targetDate: day(30) },
    ],
  });

  const nightly = await import('../jobs/nightly.js');
  runNightlySweep = nightly.runNightlySweep;
  runAndRecord = nightly.runAndRecord;
  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('scheduling maths (port parity with store.ts)', () => {
  it('matches audiences the way the store does', async () => {
    const { isUserInAudience } = await import('../jobs/scheduling.js');
    const jp: any = { id: 'u', rowId: 'u', name: 'u', orgLevel: 'JP', departmentId: 'd1', certificates: [], hasSubordinates: false };
    const sh: any = { ...jp, orgLevel: 'SH' };
    const fresh: any = { ...jp, orgLevel: 'FR' };

    expect(isUserInAudience(jp, { audience: 'ALL' })).toBe(true);
    expect(isUserInAudience(jp, { audience: 'MANAGERS_ONLY' })).toBe(false);
    expect(isUserInAudience(sh, { audience: 'MANAGERS_ONLY' })).toBe(true);
    // An IC with real direct reports counts as a manager, as in the store.
    expect(isUserInAudience({ ...jp, hasSubordinates: true }, { audience: 'MANAGERS_ONLY' })).toBe(true);
    expect(isUserInAudience(fresh, { audience: 'FRESH_ONLY' })).toBe(true);
    expect(isUserInAudience(jp, { audience: 'ORG_LEVELS', audienceOrgLevels: ['SH'] })).toBe(false);
    expect(isUserInAudience(jp, { audience: 'DEPARTMENTS', audienceDepartmentIds: ['d1'] })).toBe(true);
    // No audience at all ⇒ nobody, never "everybody".
    expect(isUserInAudience(jp, {})).toBe(false);
  });

  it('never schedules a ONE_TIME block, and chases a never-assessed recurring one', async () => {
    const { methodNextDueDate } = await import('../jobs/scheduling.js');
    const ctx = { now: NOW, lastAssessment: null, latestCertificateExpiry: null };
    expect(methodNextDueDate({ frequency: 'ONE_TIME' }, ctx)).toBeNull();
    expect(methodNextDueDate({}, ctx)).toBeNull();
    expect(methodNextDueDate({ frequency: 'QUARTERLY' }, ctx)?.getTime()).toBe(NOW.getTime());
  });

  it('rolls quarterly/monthly/weekly forward from the last assessment', async () => {
    const { methodNextDueDate } = await import('../jobs/scheduling.js');
    const last = new Date('2026-07-01T00:00:00Z');
    const ctx = { now: NOW, lastAssessment: last, latestCertificateExpiry: null };
    expect(methodNextDueDate({ frequency: 'WEEKLY' }, ctx)!.toISOString().slice(0, 10)).toBe('2026-07-08');
    expect(methodNextDueDate({ frequency: 'MONTHLY' }, ctx)!.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(methodNextDueDate({ frequency: 'QUARTERLY' }, ctx)!.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('treats a certificate-based block as due until a valid certificate exists', async () => {
    const { methodNextDueDate } = await import('../jobs/scheduling.js');
    const base = { now: NOW, lastAssessment: null };
    expect(methodNextDueDate({ frequency: 'CERTIFICATE_BASED' }, { ...base, latestCertificateExpiry: null })!.getTime())
      .toBe(NOW.getTime());
    const expiry = new Date('2027-01-01T00:00:00Z');
    expect(methodNextDueDate({ frequency: 'CERTIFICATE_BASED' }, { ...base, latestCertificateExpiry: expiry })).toEqual(expiry);
  });

  it('bands certificate expiry and buckets the warning window', async () => {
    const { certificateStatus, expiryBucket } = await import('../jobs/scheduling.js');
    expect(certificateStatus(day(-1), NOW).status).toBe('EXPIRED');
    expect(certificateStatus(day(20), NOW).status).toBe('EXPIRING_SOON');
    expect(certificateStatus(day(200), NOW).status).toBe('VALID');
    expect(expiryBucket(-3)).toBe('expired');
    expect(expiryBucket(20)).toBe('30');
    expect(expiryBucket(45)).toBe('60');
    expect(expiryBucket(80)).toBe('90');
    expect(expiryBucket(120)).toBeNull();
  });

  it('stamps monthly and ISO-weekly period keys', async () => {
    const { monthKey, weekKey } = await import('../jobs/scheduling.js');
    expect(monthKey(new Date(2026, 7, 6))).toBe('2026-08');
    expect(weekKey(new Date(Date.UTC(2026, 0, 1)))).toBe('2026-W01');
  });

  it('computes the next run time and rolls to tomorrow once the hour has passed', async () => {
    const { msUntilNextRun } = await import('../jobs/scheduler.js');
    const at0100 = new Date(2026, 7, 6, 1, 0, 0);
    expect(msUntilNextRun(at0100, 2, 0)).toBe(60 * 60 * 1000);
    const at0300 = new Date(2026, 7, 6, 3, 0, 0);
    expect(msUntilNextRun(at0300, 2, 0)).toBe(23 * 60 * 60 * 1000);
  });
});

describe('the nightly sweep', () => {
  let first: Awaited<ReturnType<typeof runNightlySweep>>;

  it('finds the overdue work and notifies exactly once per subject', async () => {
    first = await runNightlySweep({ now: NOW });

    // Only the two ACTIVE users are scanned; the PENDING account is not.
    expect(first.usersScanned).toBe(3); // admin + emp + mgr
    expect(first.employeesWithOverdueAssessments).toBe(1);
    // s1 only: s2 is ONE_TIME, s3's audience excludes a JP, and the
    // requirement pointing at a deleted skill is dropped.
    expect(first.overdueAssessments).toBe(1);
    expect(first.employeesWithOverduePlanItems).toBe(1);
    expect(first.overduePlanItems).toBe(1); // completed + future items excluded
    expect(first.managersNotified).toBe(1);

    const empNotes = await notificationsFor(EMP.id);
    const keys = empNotes.map((n) => n.sourceKey).sort();
    expect(keys).toEqual([`assess:${EMP.id}:2026-08`, `cert:${EMP.id}:c1:30`, `plan:${EMP.id}:2026-08`]);
    expect(empNotes.find((n) => n.sourceKey.startsWith('assess'))!.message).toContain('Pump Alignment');
    expect(empNotes.every((n) => n.isRead === false)).toBe(true);

    // The manager gets ONE digest covering all three, not a copy of each alert.
    const mgrNotes = await notificationsFor('mgr-1');
    expect(mgrNotes).toHaveLength(1);
    expect(mgrNotes[0].message).toContain('assessments due');
    expect(mgrNotes[0].message).toContain('overdue development items');
    expect(mgrNotes[0].message).toContain('certificate expiring');

    // Nobody chases a PENDING account.
    expect(await notificationsFor('pending-1')).toHaveLength(0);
  });

  it('re-bands the certificate on the user document', async () => {
    const { rows } = await query('SELECT data, version FROM users WHERE id = $1', [EMP.id]);
    expect(rows[0].data.certificates[0].renewalStatus).toBe('EXPIRING_SOON');
    expect(Number(rows[0].version)).toBe(2);
    expect(first.certificatesRebanded).toBe(1);
    expect(first.usersUpdated).toBe(1);
  });

  it('says nothing new when it runs again the same night', async () => {
    const before = (await query('SELECT id FROM notifications')).rows.length;
    const second = await runNightlySweep({ now: NOW });
    const after = (await query('SELECT id FROM notifications')).rows.length;

    expect(after).toBe(before);
    expect(second.notificationsCreated).toBe(0);
    expect(second.notificationsSuppressed).toBeGreaterThan(0);
    // The findings are still reported — only the telling is suppressed.
    expect(second.overdueAssessments).toBe(1);
    // The certificate band is already correct, so no second write either.
    expect(second.certificatesRebanded).toBe(0);
    expect(second.usersUpdated).toBe(0);
  });

  it('warns again when the certificate crosses into the expired window', async () => {
    const later = new Date(NOW.getTime() + 25 * 86400000); // certificate expired 5 days ago
    const third = await runNightlySweep({ now: later });
    const keys = (await notificationsFor(EMP.id)).map((n) => n.sourceKey);
    expect(keys).toContain(`cert:${EMP.id}:c1:expired`);
    expect(third.certificatesRebanded).toBe(1); // EXPIRING_SOON → EXPIRED
    const { rows } = await query('SELECT data FROM users WHERE id = $1', [EMP.id]);
    expect(rows[0].data.certificates[0].renewalStatus).toBe('EXPIRED');
  });
});

describe('the monthly snapshot', () => {
  const snapshot = async (scopeType: string, scopeId: string) => {
    const { rows } = await query(
      'SELECT * FROM competency_snapshots WHERE scope_type = $1 AND scope_id = $2 AND period = $3',
      [scopeType, scopeId, '2026-08'],
    );
    return rows;
  };

  it('records the company position with the SAME scoring rules as the pages', async () => {
    const rows = await snapshot('COMPANY', '*');
    expect(rows).toHaveLength(1);
    const s = rows[0];

    expect(s.headcount).toBe(3); // the PENDING account is not counted
    expect(s.with_requirements).toBe(1); // only EMP has a job profile

    // EMP's three live requirements (the one pointing at a deleted skill is dropped):
    //   s1 → INTERVIEW score 3 vs required 3  → MEASURED, compliant
    //   s2 → no assessment, verified experience L4 capped to L3 vs required 2
    //        → PROVISIONAL, compliant
    //   s3 → never assessed → UNKNOWN
    expect(s.required).toBe(3);
    expect(s.measured).toBe(1);
    expect(s.provisional).toBe(1);
    expect(s.unknown).toBe(1);
    expect(s.compliant_known).toBe(2);
    expect(s.gaps_known).toBe(0);
    expect(s.measured_pct).toBe(33);
    expect(s.compliance_pct).toBe(100); // over KNOWN skills only
    expect(Number(s.avg_gap)).toBe(0);
  });

  it('rolls a unit up through its parents', async () => {
    const section = await snapshot('DEPARTMENT', 'dept-1');
    const general = await snapshot('DEPARTMENT', 'gd-1');
    expect(section).toHaveLength(1);
    // gd-1 has NO direct members — matching departmentId exactly would return
    // nothing, which is exactly the bug the TNA roll-up fixed.
    expect(general).toHaveLength(1);
    expect(general[0].headcount).toBe(1);
    expect(general[0].measured).toBe(1);
    expect(general[0].scope_name).toBe('General Maintenance');
  });

  it('names the skills nobody can be assessed on', async () => {
    const [s] = await snapshot('COMPANY', '*');
    const detail = typeof s.detail === 'string' ? JSON.parse(s.detail) : s.detail;
    const s3 = detail.topSkillGaps.find((r: any) => r.skillId === 's3');
    expect(s3).toBeTruthy();
    expect(s3.unknown).toBe(1);
    expect(s3.gapCount).toBe(0); // an unmeasured skill is NOT a training gap
  });

  it('refreshes the month in place instead of appending a second point', async () => {
    const before = (await query('SELECT id FROM competency_snapshots')).rows.length;
    const again = await runNightlySweep({ now: NOW });
    const after = (await query('SELECT id FROM competency_snapshots')).rows.length;

    expect(after).toBe(before);
    expect(again.snapshotPeriod).toBe('2026-08');
    // company + dept-1 + gd-1
    expect(again.snapshotScopes).toBe(3);
  });

  it('is served to an admin and refused to an employee', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    expect((await request(app).get('/analytics/snapshots').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);
    expect((await request(app).get('/analytics/snapshots')).status).toBe(401);

    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app).get('/analytics/snapshots').set('Authorization', `Bearer ${adminTok}`);
    expect(res.status).toBe(200);
    expect(res.body.scopeType).toBe('COMPANY');
    expect(res.body.snapshots.length).toBeGreaterThan(0);
    const point = res.body.snapshots[res.body.snapshots.length - 1];
    expect(point.period).toBe('2026-08');
    expect(point.compliancePct).toBe(100);
    expect(point.avgGap).toBe(0);

    const dept = await request(app)
      .get('/analytics/snapshots?scopeId=gd-1')
      .set('Authorization', `Bearer ${adminTok}`);
    expect(dept.status).toBe(200);
    expect(dept.body.scopeType).toBe('DEPARTMENT');
    expect(dept.body.snapshots[0].scopeName).toBe('General Maintenance');
  });
});

describe('/jobs endpoints', () => {
  it('records each run in job_runs', async () => {
    const run = await runAndRecord('manual', NOW);
    expect(run.ok).toBe(true);
    const { rows } = await query('SELECT id, job, trigger, ok FROM job_runs');
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.job === 'nightly')).toBe(true);
  });

  it('is admin-only', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    expect((await request(app).get('/jobs/runs').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);
    expect((await request(app).post('/jobs/run').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);
    expect((await request(app).get('/jobs/runs')).status).toBe(401);
  });

  it('lets an admin list runs and trigger one', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const listed = await request(app).get('/jobs/runs').set('Authorization', `Bearer ${adminTok}`);
    expect(listed.status).toBe(200);
    expect(listed.body.runs.length).toBeGreaterThan(0);
    expect(listed.body.running).toBe(false);
    expect(listed.body.config.at).toBe('02:00');

    const ran = await request(app).post('/jobs/run').set('Authorization', `Bearer ${adminTok}`);
    expect(ran.status).toBe(200);
    expect(ran.body.ok).toBe(true);
    expect(ran.body.trigger).toBe('manual');
    expect(ran.body.summary.usersScanned).toBe(3);
  });
});
