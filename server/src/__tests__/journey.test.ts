// ============================================================================
// THE END-TO-END JOURNEY — one scripted run of the whole product, over the real
// Express app and a real (in-memory) Postgres.
//
// Every other suite proves ONE rule in isolation: api.test.ts pins the
// authorization matrix, authz-holes.test.ts keeps the eight attacks refused,
// analytics.test.ts checks the coverage maths, jobs.test.ts the nightly sweep.
// None of them answers the question a person actually asks before go-live:
// **does it work from creating an account to reading the numbers?**
//
// So this file walks the real thing, in order, each step using only what the
// previous step produced:
//
//   1. an admin creates a department, two competencies and a job profile;
//   2. the admin creates a manager and an employee and issues each a temporary
//      password (there is no self-service reset — task 2 removed it);
//   3. each of them logs in, is told `mustReset`, and changes their password;
//      the temporary one dies, the old token dies, the new session works;
//   4. the analytics say the employee is measured on NOTHING (compliance null,
//      not 0 — the coverage rule, at the start of a real life-cycle);
//   5. the manager interviews the employee — one requirement becomes measured
//      with a gap of 1;
//   6. the employee submits evidence, the manager judges it — the second
//      requirement becomes measured with no gap. The employee cannot judge
//      their own (a live guard-rail, on the honest path);
//   7. the manager agrees a development plan, the employee works it, the
//      manager RE-MEASURES and signs the item off — sign-off and the
//      notification go in ONE atomic /batch, as the app does it;
//   8. the live analytics now say fully measured, fully compliant, and the TNA
//      no longer names that skill;
//   9. the nightly sweep runs and STORES a monthly snapshot whose numbers are
//      the same numbers — the point of having one scoring brain.
//
// The steps SHARE STATE and MUST run in order (vitest runs a file's tests
// sequentially). That is deliberate: a journey whose steps are independent is
// not a journey.
// ============================================================================
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;
let query: (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

// The only account that exists before the journey starts — the one an admin
// holds on a freshly installed system. Everybody else is created THROUGH the API.
const ADMIN = { id: 'jr-admin', email: 'jr-admin@eprom.local', password: 'admin-pass' };

const DEPT = 'jr-dept';
const PROFILE = 'jr-profile';
const SKILL_INTERVIEW = 'jr-skill-pump'; // judged by an interview → direct score
const SKILL_EVIDENCE = 'jr-skill-report'; // judged from submitted work records

const MGR = { id: 'jr-mgr', email: 'jr-mgr@eprom.local' };
const EMP = { id: 'jr-emp', email: 'jr-emp@eprom.local' };

// Temporary passwords the admin issues, and the ones the two people choose.
const MGR_TEMP = 'mgr-temp-pass';
const MGR_PASS = 'mgr-chosen-pass';
const EMP_TEMP = 'emp-temp-pass';
const EMP_PASS = 'emp-chosen-pass';

const PLAN = 'jr-plan';
const PLAN_ITEM = 'jr-plan-item';

// Session tokens, filled in as the journey goes.
let adminToken = '';
let mgrToken = '';
let empToken = '';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(email: string, password: string) {
  return request(app).post('/auth/login').send({ email, password });
}

/** POST /col/:name — the create the SPA's compat shim makes. */
function createDoc(token: string, name: string, id: string, data: Record<string, unknown>) {
  return request(app).post(`/col/${name}`).set(auth(token)).send({ id, data });
}

/** PATCH /col/:name/:id — the merge write. */
function patchDoc(token: string, name: string, id: string, data: Record<string, unknown>) {
  return request(app).patch(`/col/${name}/${id}`).set(auth(token)).send({ data });
}

/** The employee's row out of GET /analytics/overview. */
async function employeeCoverage(token: string) {
  const res = await request(app).get('/analytics/overview?scope=company').set(auth(token));
  expect(res.status).toBe(200);
  const row = res.body.people.find((p: any) => p.userId === EMP.id);
  expect(row, 'the employee must appear in the overview').toBeTruthy();
  return row.coverage;
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.BCRYPT_ROUNDS = '4';
  // No recovery grant in this suite: every privilege here has to come from a
  // real ADMIN role, the way it does on the VM.
  process.env.BOOTSTRAP_ADMIN_EMAIL = '';

  const { newDb } = await import('pg-mem');
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const db = await import('../db.js');
  db.setPool(new Pool() as any);
  query = db.query;

  // Same hand-built schema as the other suites (pg-mem does not run the .sql
  // migrations): document + version + audit columns + defaulting timestamps.
  const cols =
    '(id TEXT PRIMARY KEY, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())';
  for (const t of ['users', 'skills', 'assessments', 'evidences', 'notifications', 'departments']) {
    await query(`CREATE TABLE ${t} ${cols}`);
  }
  for (const t of [
    'jobProfiles',
    'activityLogs',
    'workExperiences',
    'appSettings',
    'trainingCourses',
    'developmentPlans',
  ]) {
    await query(`CREATE TABLE "${t}" ${cols}`);
  }
  await query(
    'CREATE TABLE auth_credentials (user_id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, must_reset BOOLEAN, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  await query(
    'CREATE TABLE tombstones (collection TEXT NOT NULL, id TEXT NOT NULL, deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (collection, id))',
  );
  await query(
    "CREATE TABLE job_runs (id TEXT PRIMARY KEY, job TEXT NOT NULL, trigger TEXT NOT NULL DEFAULT 'scheduled', started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ, ok BOOLEAN, summary JSONB, error TEXT)",
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

  // The installed system's one account.
  const pw = await import('../auth/password.js');
  await query('INSERT INTO users (id, data) VALUES ($1, $2)', [
    ADMIN.id,
    { id: ADMIN.id, name: 'System Admin', email: ADMIN.email, role: 'ADMIN', status: 'ACTIVE' },
  ]);
  await query('INSERT INTO auth_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)', [
    ADMIN.id,
    ADMIN.email,
    await pw.hashPassword(ADMIN.password),
  ]);

  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('the journey: an empty system → a signed-off, measured employee', () => {
  // ── 1. The admin sets the system up ───────────────────────────────────────
  it('1. the admin signs in and builds the org chart, the competencies and a job profile', async () => {
    const res = await login(ADMIN.email, ADMIN.password);
    expect(res.status).toBe(200);
    expect(res.body.mustReset).toBe(false);
    adminToken = res.body.token;

    expect((await createDoc(adminToken, 'departments', DEPT, {
      name: 'Rotating Equipment', type: 'SECTION', managerId: MGR.id,
    })).status).toBe(201);

    // The first skill is judged by an INTERVIEW — a direct score. The second has
    // no direct method, so it falls to the evidence tier. One of each, because
    // the two halves of computeSkillScore are different code paths.
    expect((await createDoc(adminToken, 'skills', SKILL_INTERVIEW, {
      name: 'Pump Alignment', category: 'TECHNICAL', criticality: 'HIGH',
      assessmentMethods: [{ id: 'm-int', method: 'INTERVIEW', frequency: 'ANYTIME_ANNUAL', audience: 'ALL' }],
    })).status).toBe(201);
    expect((await createDoc(adminToken, 'skills', SKILL_EVIDENCE, {
      name: 'Shift Reporting', category: 'TECHNICAL',
      assessmentMethods: [{ id: 'm-ev', method: 'WORK_RECORD_REVIEW', frequency: 'ANYTIME_ANNUAL', audience: 'ALL' }],
    })).status).toBe(201);

    expect((await createDoc(adminToken, 'jobProfiles', PROFILE, {
      title: 'Junior Engineer', orgLevel: 'JP', departmentId: DEPT,
      requiredSkills: [
        { skillId: SKILL_INTERVIEW, requiredLevel: 4 },
        { skillId: SKILL_EVIDENCE, requiredLevel: 3 },
      ],
    })).status).toBe(201);
  });

  // ── 2. Accounts ───────────────────────────────────────────────────────────
  it('2. the admin creates the manager and the employee and issues temporary passwords', async () => {
    expect((await createDoc(adminToken, 'users', MGR.id, {
      name: 'Section Head', email: MGR.email, role: 'EMPLOYEE', status: 'ACTIVE',
      orgLevel: 'SH', departmentId: DEPT,
    })).status).toBe(201);
    expect((await createDoc(adminToken, 'users', EMP.id, {
      name: 'New Joiner', email: EMP.email, role: 'EMPLOYEE', status: 'ACTIVE',
      orgLevel: 'JP', departmentId: DEPT, managerId: MGR.id, jobProfileId: PROFILE,
    })).status).toBe(201);

    // There is no email in this system and no self-service reset: an account
    // becomes usable only because an admin sets a temporary password on it.
    for (const [userId, newPassword] of [[MGR.id, MGR_TEMP], [EMP.id, EMP_TEMP]] as const) {
      const res = await request(app)
        .post('/auth/admin/set-password')
        .set(auth(adminToken))
        .send({ userId, newPassword });
      expect(res.status).toBe(200);
      expect(res.body.mustReset).toBe(true);
    }
  });

  // ── 3. First login + the forced password change ───────────────────────────
  it('3. each of them logs in, is forced to change the password, and the temporary one dies', async () => {
    for (const [person, temp, chosen] of [
      [MGR, MGR_TEMP, MGR_PASS],
      [EMP, EMP_TEMP, EMP_PASS],
    ] as const) {
      const first = await login(person.email, temp);
      expect(first.status).toBe(200);
      expect(first.body.mustReset, 'a temporary password must announce itself').toBe(true);
      const tempToken = first.body.token;

      // must_reset means the current password is not asked for again — the point
      // of the forced change is that the employee has just used it once.
      const changed = await request(app)
        .post('/auth/change-password')
        .set(auth(tempToken))
        .send({ newPassword: chosen });
      expect(changed.status).toBe(200);
      expect(typeof changed.body.token).toBe('string');

      // The tab doing the change survives (it was handed a fresh token) …
      const me = await request(app).get('/auth/me').set(auth(changed.body.token));
      expect(me.status).toBe(200);
      expect(me.body.user.id).toBe(person.id);
      expect(me.body.mustReset, 'the forced-reset flag is cleared by the change').toBe(false);

      // … while the token issued before the change is dead. `iat` is whole
      // seconds, so push the credential clear of authenticate.ts's 2s skew
      // allowance — in production a second of real time does this by itself.
      await query('UPDATE auth_credentials SET updated_at = $1 WHERE user_id = $2', [
        new Date(Date.now() + 10_000),
        person.id,
      ]);
      const dead = await request(app).get('/auth/me').set(auth(tempToken));
      expect(dead.status).toBe(401);
      // Put the credential's clock back where a real one would be, so the
      // session opened below is not retired by this test's own time travel.
      await query('UPDATE auth_credentials SET updated_at = $1 WHERE user_id = $2', [
        new Date(Date.now() - 10_000),
        person.id,
      ]);

      // The temporary password is gone for good; the chosen one works.
      expect((await login(person.email, temp)).status).toBe(401);
      const now = await login(person.email, chosen);
      expect(now.status).toBe(200);
      expect(now.body.mustReset).toBe(false);
      if (person.id === MGR.id) mgrToken = now.body.token;
      else empToken = now.body.token;
    }
  });

  // ── 4. Day one: nothing is known ──────────────────────────────────────────
  it('4. on day one the employee is measured on NOTHING — compliance is null, not 0%', async () => {
    const coverage = await employeeCoverage(adminToken);
    expect(coverage.required).toBe(2);
    expect(coverage.measured).toBe(0);
    expect(coverage.unknown).toBe(2);
    // The rule the whole product hangs on: a person nobody has assessed is not
    // a person with a 0% score.
    expect(coverage.compliancePct).toBeNull();
    expect(coverage.avgGap).toBeNull();
  });

  // ── 5. The interview ──────────────────────────────────────────────────────
  it('5. the manager interviews the employee — one requirement becomes measured, with a gap', async () => {
    // The guard-rail, on the honest path: the employee cannot write the
    // heavyweight score about themselves (hole H6).
    const selfScored = await createDoc(empToken, 'assessments', 'jr-self-cheat', {
      subjectId: EMP.id, raterId: EMP.id, skillId: SKILL_INTERVIEW,
      type: 'INTERVIEW', score: 5, date: '2026-09-01T09:00:00.000Z',
    });
    expect(selfScored.status).toBe(403);

    expect((await createDoc(mgrToken, 'assessments', 'jr-interview-1', {
      subjectId: EMP.id, raterId: MGR.id, skillId: SKILL_INTERVIEW,
      type: 'INTERVIEW', score: 3, date: '2026-09-01T10:00:00.000Z',
    })).status).toBe(201);

    const coverage = await employeeCoverage(adminToken);
    expect(coverage.measured).toBe(1);
    expect(coverage.unknown).toBe(1);
    expect(coverage.gapsKnown).toBe(1); // required 4, scored 3
    expect(coverage.totalGap).toBe(1);
    expect(coverage.compliancePct).toBe(0); // 0 of the 1 known requirement is met
  });

  // ── 6. The evidence ───────────────────────────────────────────────────────
  it('6. the employee submits evidence and the MANAGER judges it — never the employee', async () => {
    // A submission carries no verdict (hole H4): this is a request, not a score.
    expect((await createDoc(empToken, 'evidences', 'jr-evidence', {
      userId: EMP.id, skillId: SKILL_EVIDENCE, status: 'PENDING',
      title: 'Weekly shift handover pack', description: 'Twelve weeks of handover reports.',
      submittedAt: '2026-09-02T08:00:00.000Z',
    })).status).toBe(201);

    // The employee scoring their own submission is the whole reason the rule
    // exists — refused even though the record is theirs.
    const selfApproved = await patchDoc(empToken, 'evidences', 'jr-evidence', {
      status: 'APPROVED', assignedScore: 5, reviewedBy: EMP.id,
    });
    expect(selfApproved.status).toBe(403);

    expect((await patchDoc(mgrToken, 'evidences', 'jr-evidence', {
      status: 'APPROVED', assignedScore: 3, reviewedBy: MGR.id,
      reviewedAt: '2026-09-03T08:00:00.000Z', reviewerComment: 'Complete and consistent.',
    })).status).toBe(200);

    const coverage = await employeeCoverage(adminToken);
    expect(coverage.required).toBe(2);
    expect(coverage.measured).toBe(2);
    expect(coverage.unknown).toBe(0);
    expect(coverage.compliantKnown).toBe(1); // the evidence skill: required 3, scored 3
    expect(coverage.gapsKnown).toBe(1); // the interview skill still short by 1
    expect(coverage.compliancePct).toBe(50);
    expect(coverage.avgGap).toBe(0.5);
  });

  // ── 7. The plan ───────────────────────────────────────────────────────────
  it('7a. the manager agrees a development plan for the one real gap', async () => {
    // The gap the plan answers is the MEASURED one. A never-assessed
    // requirement is an assessment need, not a training need — by step 6 there
    // are none left, which is why this plan has exactly one item.
    expect((await createDoc(mgrToken, 'developmentPlans', PLAN, {
      userId: EMP.id, title: '2026 Individual Training Plan', status: 'ACTIVE',
      createdBy: MGR.id, jobProfileId: PROFILE, createdAt: '2026-09-04T08:00:00.000Z',
      items: [
        {
          id: PLAN_ITEM, skillId: SKILL_INTERVIEW, status: 'NOT_STARTED',
          requiredLevel: 4, levelAtPlanning: 3, gapAtPlanning: 1, sourceAtPlanning: 'ASSESSMENT',
          targetDate: '2026-12-01', action: 'Alignment workshop + supervised job',
        },
      ],
    })).status).toBe(201);

    // The employee can see the plan that was written about them.
    const mine = await request(app).get(`/col/developmentPlans/${PLAN}`).set(auth(empToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data.items[0].levelAtPlanning).toBe(3);
  });

  it('7b. the employee works the item and marks it complete', async () => {
    const inProgress = await patchDoc(empToken, 'developmentPlans', PLAN, {
      items: [{ id: PLAN_ITEM, skillId: SKILL_INTERVIEW, status: 'IN_PROGRESS', requiredLevel: 4, levelAtPlanning: 3 }],
    });
    expect(inProgress.status).toBe(200);

    const completed = await patchDoc(empToken, 'developmentPlans', PLAN, {
      items: [{
        id: PLAN_ITEM, skillId: SKILL_INTERVIEW, status: 'COMPLETED', requiredLevel: 4, levelAtPlanning: 3,
        completionNote: 'Workshop attended, two alignments supervised.',
      }],
    });
    expect(completed.status).toBe(200);
    expect(completed.body.data.items[0].status).toBe('COMPLETED');
    // Nobody has signed it off yet — completing your own item is a claim.
    expect(completed.body.data.items[0].supervisorSignOff).toBeUndefined();
  });

  it('7c. the manager RE-MEASURES, then signs off and notifies in one atomic batch', async () => {
    // The re-measure is the whole point of the loop: the sign-off records what
    // the score was AFTER the training, beside the frozen level from planning.
    expect((await createDoc(mgrToken, 'assessments', 'jr-interview-2', {
      subjectId: EMP.id, raterId: MGR.id, skillId: SKILL_INTERVIEW,
      type: 'INTERVIEW', score: 4, date: '2026-11-20T10:00:00.000Z',
    })).status).toBe(201);

    // Sign-off + the employee's notification travel together: one forbidden op
    // would roll BOTH back, so the person is never told about a sign-off that
    // did not happen.
    const batch = await request(app)
      .post('/batch')
      .set(auth(mgrToken))
      .send({
        operations: [
          {
            type: 'update', collection: 'developmentPlans', id: PLAN,
            data: {
              items: [{
                id: PLAN_ITEM, skillId: SKILL_INTERVIEW, status: 'COMPLETED', requiredLevel: 4,
                levelAtPlanning: 3, supervisorSignOff: true, signedOffBy: MGR.id, levelAtSignOff: 4,
              }],
            },
          },
          {
            type: 'set', collection: 'notifications', id: 'jr-signoff-note',
            data: {
              userId: EMP.id, createdBy: MGR.id, type: 'PLAN_SIGNED_OFF',
              title: 'Training item signed off',
              message: 'Pump Alignment re-assessed at level 4.',
              createdAt: '2026-11-21T08:00:00.000Z', read: false,
            },
          },
        ],
      });
    expect(batch.status).toBe(200);
    expect(batch.body.count).toBe(2);

    const plan = await request(app).get(`/col/developmentPlans/${PLAN}`).set(auth(mgrToken));
    expect(plan.body.data.items[0].supervisorSignOff).toBe(true);
    // The pair that answers "did the training move the score" without
    // re-deriving anything.
    expect(plan.body.data.items[0].levelAtPlanning).toBe(3);
    expect(plan.body.data.items[0].levelAtSignOff).toBe(4);

    // The employee sees the message, and it is attributable (hole H7): nothing
    // a colleague wrote can pass itself off as the system.
    const bell = await request(app).get(`/col/notifications?userId=${EMP.id}`).set(auth(empToken));
    expect(bell.status).toBe(200);
    const note = bell.body.documents.find((d: any) => d.id === 'jr-signoff-note');
    expect(note).toBeTruthy();
    expect(note.data.createdBy).toBe(MGR.id);
  });

  // ── 8. The numbers on the other side ──────────────────────────────────────
  it('8a. the live analytics show the employee fully measured and fully compliant', async () => {
    const coverage = await employeeCoverage(adminToken);
    expect(coverage.required).toBe(2);
    expect(coverage.measured).toBe(2);
    expect(coverage.unknown).toBe(0);
    expect(coverage.gapsKnown).toBe(0);
    expect(coverage.totalGap).toBe(0);
    expect(coverage.compliancePct).toBe(100);
    expect(coverage.avgGap).toBe(0);
  });

  it('8b. the TNA no longer names the skill that was trained', async () => {
    const res = await request(app).get('/analytics/training-needs?scope=company').set(auth(adminToken));
    expect(res.status).toBe(200);
    // A skill with no gap and nothing unknown is dropped from the rows entirely.
    expect(res.body.needs.find((n: any) => n.skillId === SKILL_INTERVIEW)).toBeUndefined();
    expect(res.body.needs.find((n: any) => n.skillId === SKILL_EVIDENCE)).toBeUndefined();
    expect(res.body.coverage.unknown).toBe(0);
  });

  it('8c. the manager may ask about their own team, the employee may not ask at all', async () => {
    // The scope is a permission boundary, not a filter — this is the journey's
    // version of that rule, checked with the real people it was built for.
    const team = await request(app).get('/analytics/training-needs?scope=team').set(auth(mgrToken));
    expect(team.status).toBe(200);

    expect((await request(app).get('/analytics/overview?scope=company').set(auth(empToken))).status).toBe(403);
    expect((await request(app).get('/analytics/training-needs?scope=company').set(auth(empToken))).status).toBe(403);
  });

  // ── 9. The stored history agrees with the live figure ─────────────────────
  it('9. the nightly sweep stores a snapshot carrying the SAME numbers', async () => {
    const run = await request(app).post('/jobs/run').set(auth(adminToken)).send({});
    expect(run.status).toBe(200);
    expect(run.body.ok).toBe(true);

    const live = await request(app).get('/analytics/overview?scope=company').set(auth(adminToken));
    expect(live.status).toBe(200);

    const snaps = await request(app).get('/analytics/snapshots').set(auth(adminToken));
    expect(snaps.status).toBe(200);
    const latest = snaps.body.snapshots[snaps.body.snapshots.length - 1];
    expect(latest, 'the sweep must have written this month').toBeTruthy();

    // One scoring brain: a point on the trend chart and the tile beside it are
    // the same measure. If these ever disagree, the port has drifted.
    expect(latest.required).toBe(live.body.coverage.required);
    expect(latest.measured).toBe(live.body.coverage.measured);
    expect(latest.unknown).toBe(live.body.coverage.unknown);
    expect(latest.compliancePct).toBe(live.body.coverage.compliancePct);

    // And re-running the sweep refreshes that month in place rather than
    // appending a second point.
    expect((await request(app).post('/jobs/run').set(auth(adminToken)).send({})).status).toBe(200);
    const again = await request(app).get('/analytics/snapshots').set(auth(adminToken));
    expect(again.body.snapshots.length).toBe(snaps.body.snapshots.length);
  });
});
