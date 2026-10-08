// Local verification harness — runs the real Express app against an in-memory
// Postgres (pg-mem), so auth + authorization + routing are exercised end-to-end
// WITHOUT Docker or a real database. Proves the security rules were ported
// correctly before we ever touch the VM.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;
let query: (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

const ADMIN = { id: 'admin-1', email: 'admin@eprom.local' };
const EMP = { id: 'emp-1', email: 'emp@eprom.local' };
const OTHER = { id: 'emp-2', email: 'other@eprom.local' };
const MGR = { id: 'mgr-1', email: 'mgr@eprom.local' }; // manages sub-1 → sub-2 (subtree)
const CEO = { id: 'ceo-1', email: 'ceo@eprom.local' };
// The recovery address BOOTSTRAP_ADMIN_EMAIL points at — nobody is seeded with it.
const BOOTSTRAP_EMAIL = 'bootstrap@eprom.local';
// Session-lifecycle subjects — see 'a live session ends when the account does'.
const SESS = { id: 'sess-1', email: 'sess@eprom.local' };
const SESS_OFF = { id: 'sess-2', email: 'sessoff@eprom.local' };
const SESS_PW = { id: 'sess-3', email: 'sesspw@eprom.local' };

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

async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.BCRYPT_ROUNDS = '4';
  // A REAL bootstrap address here (the other suites use ''): the escalation
  // tests below need the recovery grant to be live, because that grant is what
  // hole H2 abused.
  process.env.BOOTSTRAP_ADMIN_EMAIL = BOOTSTRAP_EMAIL;

  const { newDb } = await import('pg-mem');
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const db = await import('../db.js');
  db.setPool(new Pool() as any);
  query = db.query;

  // Mirrors the shape migrations produce (001 + 002 + 003): document + version +
  // audit columns + timestamps that default. pg-mem doesn't run the .sql
  // migrations, so we declare the columns the route/batch SQL depends on here.
  const cols =
    '(id TEXT PRIMARY KEY, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())';
  for (const t of ['users', 'skills', 'assessments', 'evidences', 'nominations', 'notifications', 'departments']) {
    await query(`CREATE TABLE ${t} ${cols}`);
  }
  // Quoted camelCase tables (case-sensitive), matching what registry.tableFor()
  // emits. workExperiences/appSettings come from migration 005, developmentPlans
  // from 006. A registry entry missing from THIS list 500s every write to it.
  for (const t of ['activityLogs', 'workExperiences', 'appSettings', 'trainingCourses', 'developmentPlans']) {
    await query(`CREATE TABLE "${t}" ${cols}`);
  }
  await query(
    // updated_at mirrors the real schema's NOT NULL DEFAULT now(): authenticate.ts
    // compares the token's `iat` against it to retire tokens issued before a
    // password change, and a null here would silently skip that check.
    'CREATE TABLE auth_credentials (user_id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, must_reset BOOLEAN, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  await query(
    'CREATE TABLE tombstones (collection TEXT NOT NULL, id TEXT NOT NULL, deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (collection, id))',
  );
  // The server's audit log (migration 010) — every write path inserts into it.
  await query(
    'CREATE TABLE audit_log (id TEXT PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(), actor_id TEXT, actor_cid TEXT, actor_name TEXT, actor_email TEXT, action TEXT NOT NULL, collection TEXT NOT NULL, doc_id TEXT NOT NULL, changes JSONB, request_id TEXT)',
  );
  // Stand-ins for what the delta cursor reads to find the oldest open
  // transaction (collections/cursor.ts). A row here plays an in-flight write.
  const { DataType } = await import('pg-mem');
  mem.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'ecms' });
  await query('CREATE TABLE pg_stat_activity (datname TEXT, backend_type TEXT, xact_start TIMESTAMPTZ)');
  // NOTE: there is deliberately no password_reset_tokens table — migration 009
  // dropped it with the half-built reset-by-email flow.

  await seedUser(ADMIN, 'ADMIN', 'admin-pass');
  await seedUser(EMP, 'EMPLOYEE', 'emp-pass', { managerId: 'mgr-x', orgLevel: 'JP' });
  await seedUser(OTHER, 'EMPLOYEE', 'other-pass');
  await seedUser(CEO, 'CEO', 'ceo-pass');
  // Their own accounts, because the session tests below churn passwords and
  // account status — neither can be done to a user other tests depend on.
  await seedUser(SESS, 'EMPLOYEE', 'sess-pass', { orgLevel: 'JP' });
  await seedUser(SESS_OFF, 'EMPLOYEE', 'sessoff-pass', { orgLevel: 'JP' });
  await seedUser(SESS_PW, 'EMPLOYEE', 'sesspw-pass', { orgLevel: 'JP' });

  // Management chain for read-scoping tests: MGR → sub-1 → sub-2.
  await seedUser(MGR, 'EMPLOYEE', 'mgr-pass', { orgLevel: 'SH' });
  await seedDoc('users', 'sub-1', { name: 'Sub One', email: 'sub1@eprom.local', role: 'EMPLOYEE', status: 'ACTIVE', managerId: MGR.id, orgLevel: 'JP' });
  await seedDoc('users', 'sub-2', { name: 'Sub Two', email: 'sub2@eprom.local', role: 'EMPLOYEE', status: 'ACTIVE', managerId: 'sub-1', orgLevel: 'FR' });

  // Assessments (subjectId/raterId are canonical ids == table ids here).
  await seedDoc('assessments', 'a-emp', { subjectId: EMP.id, raterId: 'mgr-x', skillId: 's1', score: 3 }); // EMP as subject
  await seedDoc('assessments', 'a-emp-rater', { subjectId: OTHER.id, raterId: EMP.id, skillId: 's1', score: 4 }); // EMP authored
  await seedDoc('assessments', 'a-other', { subjectId: OTHER.id, raterId: OTHER.id, skillId: 's1', score: 5 }); // EMP must NOT see
  await seedDoc('assessments', 'a-sub', { subjectId: 'sub-1', raterId: 'z', skillId: 's1', score: 2 }); // MGR: direct report
  await seedDoc('assessments', 'a-sub2', { subjectId: 'sub-2', raterId: 'z', skillId: 's1', score: 2 }); // MGR: transitive

  // Evidences.
  await seedDoc('evidences', 'e-emp', { userId: EMP.id, status: 'PENDING' });
  await seedDoc('evidences', 'e-other', { userId: OTHER.id, status: 'PENDING' });
  await seedDoc('evidences', 'e-sub2', { userId: 'sub-2', status: 'PENDING' });

  // Work experiences (same owner/manager scoping as evidences).
  await seedDoc('workExperiences', 'we-emp', { userId: EMP.id, employer: 'Acme', jobTitle: 'Tech', startDate: '2015-01-01', status: 'PENDING' });
  await seedDoc('workExperiences', 'we-emp-verified', { userId: EMP.id, employer: 'Globex', jobTitle: 'Senior Tech', startDate: '2010-01-01', status: 'VERIFIED' });
  await seedDoc('workExperiences', 'we-other', { userId: OTHER.id, employer: 'Initech', jobTitle: 'Analyst', startDate: '2016-01-01', status: 'PENDING' });
  await seedDoc('workExperiences', 'we-sub1', { userId: 'sub-1', employer: 'Stark', jobTitle: 'Lead', startDate: '2017-01-01', status: 'PENDING' }); // MGR's DIRECT report
  await seedDoc('workExperiences', 'we-sub2', { userId: 'sub-2', employer: 'Umbrella', jobTitle: 'Operator', startDate: '2018-01-01', status: 'PENDING' }); // transitive

  // Development plans (migration 006) — same owner + management-chain scoping.
  await seedDoc('developmentPlans', 'dp-emp', { userId: EMP.id, title: 'Plan A', status: 'ACTIVE', createdBy: EMP.id, items: [] });
  await seedDoc('developmentPlans', 'dp-emp-draft', { userId: EMP.id, title: 'Draft', status: 'DRAFT', createdBy: EMP.id, items: [] });
  await seedDoc('developmentPlans', 'dp-other', { userId: OTHER.id, title: 'Plan B', status: 'ACTIVE', createdBy: OTHER.id, items: [] });
  await seedDoc('developmentPlans', 'dp-sub2', { userId: 'sub-2', title: 'Plan C', status: 'ACTIVE', createdBy: 'sub-2', items: [] });

  const { createApp } = await import('../app.js');
  app = createApp();
});

// The identifier is quoted so camelCase tables (workExperiences, activityLogs)
// resolve exactly; an unquoted name would be folded to lowercase and miss them.
// Quoting an all-lowercase name is a no-op, so this is safe for every table.
async function seedDoc(table: string, id: string, data: Record<string, unknown>) {
  await query(`INSERT INTO "${table}" (id, data) VALUES ($1, $2)`, [id, { id, ...data }]);
}

function idsOf(res: { body: { documents: { id: string }[] } }): string[] {
  return res.body.documents.map((d) => d.id);
}

describe('health + auth', () => {
  // Regression: the API always runs behind the `web` nginx container, which
  // passes the caller in X-Forwarded-For. Without `trust proxy`, express reports
  // the PROXY's address as req.ip for every request, so both rate limiters
  // bucket the entire company together — one busy client can 429 everyone — and
  // the access log attributes every request to nginx.
  it('trusts exactly one reverse proxy hop', () => {
    expect(app.get('trust proxy')).toBe(1);
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/auth/login').send({ email: EMP.email, password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('logs in and returns a token + user', async () => {
    const res = await request(app).post('/auth/login').send({ email: ADMIN.email, password: 'admin-pass' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('/me resolves the session', async () => {
    const token = await login(ADMIN.email, 'admin-pass');
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(ADMIN.id);
  });
});

describe('authorization parity with firestore.rules', () => {
  it('blocks unauthenticated collection access', async () => {
    const res = await request(app).get('/col/skills');
    expect(res.status).toBe(401);
  });

  it('admin can write skills; employee cannot', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const empTok = await login(EMP.email, 'emp-pass');

    const ok = await request(app)
      .put('/col/skills/skill-1')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'Welding', category: 'Technical' } });
    expect(ok.status).toBe(200);

    const denied = await request(app)
      .put('/col/skills/skill-2')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { name: 'Hacking', category: 'Technical' } });
    expect(denied.status).toBe(403);
  });

  it('employee can create an assessment only where they are the rater', async () => {
    const empTok = await login(EMP.email, 'emp-pass');

    const mine = await request(app)
      .post('/col/assessments')
      .set('Authorization', `Bearer ${empTok}`)
      // `type` is now part of the contract: it states the rater/subject
      // relationship the score is paid by, and PEER is the one an unrelated
      // colleague may claim (see the H6 suite below).
      .send({ data: { raterId: EMP.id, subjectId: OTHER.id, skillId: 'skill-1', score: 4, type: 'PEER' } });
    expect(mine.status).toBe(201);

    const forged = await request(app)
      .post('/col/assessments')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { raterId: OTHER.id, subjectId: EMP.id, skillId: 'skill-1', score: 5, type: 'PEER' } });
    expect(forged.status).toBe(403);
  });

  it('notifications are owner-scoped on list and on read', async () => {
    // Seed one notification for each employee.
    await query('INSERT INTO notifications (id, data) VALUES ($1, $2)', [
      'n-emp',
      { id: 'n-emp', userId: EMP.id, title: 'hi', message: 'x', isRead: false },
    ]);
    await query('INSERT INTO notifications (id, data) VALUES ($1, $2)', [
      'n-other',
      { id: 'n-other', userId: OTHER.id, title: 'hi', message: 'x', isRead: false },
    ]);

    const empTok = await login(EMP.email, 'emp-pass');
    const list = await request(app).get('/col/notifications').set('Authorization', `Bearer ${empTok}`);
    expect(list.status).toBe(200);
    const ids = list.body.documents.map((d: any) => d.id);
    expect(ids).toContain('n-emp');
    expect(ids).not.toContain('n-other');

    const foreign = await request(app).get('/col/notifications/n-other').set('Authorization', `Bearer ${empTok}`);
    expect(foreign.status).toBe(403);
  });

  it('employee may edit own profile but not change their role', async () => {
    const empTok = await login(EMP.email, 'emp-pass');

    const nameChange = await request(app)
      .patch(`/col/users/${EMP.id}`)
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { name: 'Renamed' } });
    expect(nameChange.status).toBe(200);

    const roleGrab = await request(app)
      .patch(`/col/users/${EMP.id}`)
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { role: 'ADMIN' } });
    expect(roleGrab.status).toBe(403);
  });
});

describe('read authorization scoping (Section 2 — data privacy)', () => {
  it('assessments list: an employee sees only their own subject/rater rows', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const res = await request(app).post('/col/assessments/query').set('Authorization', `Bearer ${empTok}`).send({});
    expect(res.status).toBe(200);
    const ids = idsOf(res);
    expect(ids).toContain('a-emp'); // own, as subject
    expect(ids).toContain('a-emp-rater'); // authored (rater)
    expect(ids).not.toContain('a-other'); // someone else's score
    expect(ids).not.toContain('a-sub'); // not their report
  });

  it('assessments list: a manager sees the full subordinate subtree (transitive)', async () => {
    const mgrTok = await login(MGR.email, 'mgr-pass');
    const ids = idsOf(await request(app).post('/col/assessments/query').set('Authorization', `Bearer ${mgrTok}`).send({}));
    expect(ids).toContain('a-sub'); // direct report
    expect(ids).toContain('a-sub2'); // report-of-a-report
    expect(ids).not.toContain('a-emp'); // outside the chain
    expect(ids).not.toContain('a-other');
  });

  it('assessments list: admin and CEO read org-wide', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const adminIds = idsOf(await request(app).post('/col/assessments/query').set('Authorization', `Bearer ${adminTok}`).send({}));
    expect(adminIds).toEqual(expect.arrayContaining(['a-emp', 'a-other', 'a-sub', 'a-sub2']));

    const ceoTok = await login(CEO.email, 'ceo-pass');
    const ceoIds = idsOf(await request(app).post('/col/assessments/query').set('Authorization', `Bearer ${ceoTok}`).send({}));
    expect(ceoIds).toEqual(expect.arrayContaining(['a-emp', 'a-other', 'a-sub', 'a-sub2']));
  });

  it('assessments get-one: a stranger is forbidden, the owner is allowed', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const forbidden = await request(app).get('/col/assessments/a-other').set('Authorization', `Bearer ${empTok}`);
    expect(forbidden.status).toBe(403);
    const own = await request(app).get('/col/assessments/a-emp').set('Authorization', `Bearer ${empTok}`);
    expect(own.status).toBe(200);
  });

  it('evidences: employee sees only own; manager may read a subordinate’s', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const empIds = idsOf(await request(app).post('/col/evidences/query').set('Authorization', `Bearer ${empTok}`).send({}));
    expect(empIds).toContain('e-emp');
    expect(empIds).not.toContain('e-other');

    const mgrTok = await login(MGR.email, 'mgr-pass');
    const subEvidence = await request(app).get('/col/evidences/e-sub2').set('Authorization', `Bearer ${mgrTok}`);
    expect(subEvidence.status).toBe(200); // transitive report
    const foreign = await request(app).get('/col/evidences/e-other').set('Authorization', `Bearer ${mgrTok}`);
    expect(foreign.status).toBe(403);
  });
});

describe('workExperiences authorization (owner submits, manager verifies)', () => {
  // THE critical test for this collection. runList applies listScope and never
  // calls can(), so listScope is the ONLY bound on a list read. If the
  // 'workExperiences' case were ever dropped from listScope, the default (null =
  // unrestricted) would publish every employee's employment history to every
  // authenticated user — while get-one kept returning 403 and looked fine.
  it('list is scoped to own records — an employee cannot enumerate the company', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const ids = idsOf(
      await request(app).post('/col/workExperiences/query').set('Authorization', `Bearer ${empTok}`).send({}),
    );
    expect(ids.sort()).toEqual(['we-emp', 'we-emp-verified']);
    expect(ids).not.toContain('we-other');
    expect(ids).not.toContain('we-sub2');
  });

  it('a manager lists and reads the subordinate subtree but not a stranger', async () => {
    const mgrTok = await login(MGR.email, 'mgr-pass');
    const ids = idsOf(
      await request(app).post('/col/workExperiences/query').set('Authorization', `Bearer ${mgrTok}`).send({}),
    );
    expect(ids).toContain('we-sub2'); // transitive report
    expect(ids).not.toContain('we-other');

    expect((await request(app).get('/col/workExperiences/we-sub2').set('Authorization', `Bearer ${mgrTok}`)).status).toBe(200);
    expect((await request(app).get('/col/workExperiences/we-other').set('Authorization', `Bearer ${mgrTok}`)).status).toBe(403);
  });

  it('an employee cannot submit experience under someone else’s id', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const forged = await request(app)
      .put('/col/workExperiences/we-forged')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { userId: OTHER.id, employer: 'Acme', jobTitle: 'Tech', startDate: '2020-01-01', status: 'PENDING' } });
    expect(forged.status).toBe(403);

    const own = await request(app)
      .put('/col/workExperiences/we-own-new')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { userId: EMP.id, employer: 'Acme', jobTitle: 'Tech', startDate: '2020-01-01', status: 'PENDING' } });
    expect(own.status).toBe(200);
  });

  it('the owner may edit while PENDING but not after a verdict', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const whilePending = await request(app)
      .patch('/col/workExperiences/we-emp')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { jobTitle: 'Senior Technician' } });
    expect(whilePending.status).toBe(200);

    const afterVerdict = await request(app)
      .patch('/col/workExperiences/we-emp-verified')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { jobTitle: 'Rewriting history' } });
    expect(afterVerdict.status).toBe(403);
  });

  it('only the DIRECT manager may record a verdict', async () => {
    const otherTok = await login(OTHER.email, 'other-pass');
    const strangerVerify = await request(app)
      .patch('/col/workExperiences/we-sub1')
      .set('Authorization', `Bearer ${otherTok}`)
      .send({ data: { status: 'VERIFIED' } });
    expect(strangerVerify.status).toBe(403);

    const mgrTok = await login(MGR.email, 'mgr-pass');
    const direct = await request(app)
      .patch('/col/workExperiences/we-sub1')
      .set('Authorization', `Bearer ${mgrTok}`)
      .send({ data: { status: 'VERIFIED', reviewedBy: MGR.id } });
    expect(direct.status).toBe(200);

    // Deliberate parity with evidence approval: a skip-level manager may READ a
    // transitive report's record (isAncestorManager) but may NOT sign it off
    // (isManagerOf is one hop). sub-2 reports to sub-1, not to MGR.
    expect((await request(app).get('/col/workExperiences/we-sub2').set('Authorization', `Bearer ${mgrTok}`)).status).toBe(200);
    const skipLevel = await request(app)
      .patch('/col/workExperiences/we-sub2')
      .set('Authorization', `Bearer ${mgrTok}`)
      .send({ data: { status: 'VERIFIED', reviewedBy: MGR.id } });
    expect(skipLevel.status).toBe(403);
  });

  it('rejects an invalid status enum (422)', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const res = await request(app)
      .put('/col/workExperiences/we-bad')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { userId: EMP.id, employer: 'Acme', jobTitle: 'T', startDate: '2020-01-01', status: 'APPROVED' } });
    expect(res.status).toBe(422);
  });

  it('a stranger cannot delete, and the owner cannot delete a verified record', async () => {
    const otherTok = await login(OTHER.email, 'other-pass');
    expect((await request(app).delete('/col/workExperiences/we-sub2').set('Authorization', `Bearer ${otherTok}`)).status).toBe(403);

    const empTok = await login(EMP.email, 'emp-pass');
    expect((await request(app).delete('/col/workExperiences/we-emp-verified').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);
    // ...but may withdraw their own still-pending submission.
    expect((await request(app).delete('/col/workExperiences/we-own-new').set('Authorization', `Bearer ${empTok}`)).status).toBe(204);
  });

  it('development plans are list-scoped to own + subtree, never company-wide', async () => {
    // Same trap as workExperiences: runList only applies listScope, so a missing
    // case would publish every employee's gaps and training record.
    const empTok = await login(EMP.email, 'emp-pass');
    const ids = idsOf(
      await request(app).post('/col/developmentPlans/query').set('Authorization', `Bearer ${empTok}`).send({}),
    );
    expect(ids.sort()).toEqual(['dp-emp', 'dp-emp-draft']);
    expect(ids).not.toContain('dp-other');

    const mgrTok = await login(MGR.email, 'mgr-pass');
    const mgrIds = idsOf(
      await request(app).post('/col/developmentPlans/query').set('Authorization', `Bearer ${mgrTok}`).send({}),
    );
    expect(mgrIds).toContain('dp-sub2'); // transitive report
    expect(mgrIds).not.toContain('dp-other');
  });

  it('a stranger can neither read, create for, nor write another employee’s plan', async () => {
    const otherTok = await login(OTHER.email, 'other-pass');
    expect((await request(app).get('/col/developmentPlans/dp-emp').set('Authorization', `Bearer ${otherTok}`)).status).toBe(403);

    const forged = await request(app)
      .put('/col/developmentPlans/dp-forged')
      .set('Authorization', `Bearer ${otherTok}`)
      .send({ data: { userId: EMP.id, title: 'Not yours', status: 'ACTIVE', createdBy: OTHER.id, items: [] } });
    expect(forged.status).toBe(403);

    const patch = await request(app)
      .patch('/col/developmentPlans/dp-emp')
      .set('Authorization', `Bearer ${otherTok}`)
      .send({ data: { status: 'ARCHIVED' } });
    expect(patch.status).toBe(403);
  });

  it('the owner writes their own plan and a manager may sign a report’s off', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const own = await request(app)
      .put('/col/developmentPlans/dp-emp-new')
      .set('Authorization', `Bearer ${empTok}`)
      .send({
        data: {
          userId: EMP.id,
          title: 'My plan',
          status: 'DRAFT',
          createdBy: EMP.id,
          items: [{ id: 'i1', skillId: 's1', status: 'NOT_STARTED', supervisorSignOff: false }],
        },
      });
    expect(own.status).toBe(200);

    // A skip-level manager MAY act here (unlike work-experience verification):
    // sign-off follows the whole management chain so an absent direct
    // supervisor cannot strand a plan.
    const mgrTok = await login(MGR.email, 'mgr-pass');
    const signOff = await request(app)
      .patch('/col/developmentPlans/dp-sub2')
      .set('Authorization', `Bearer ${mgrTok}`)
      .send({ data: { items: [{ id: 'i1', skillId: 's1', status: 'COMPLETED', supervisorSignOff: true }] } });
    expect(signOff.status).toBe(200);
  });

  it('rejects a bad plan status and a non-array items field (422)', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const badStatus = await request(app)
      .put('/col/developmentPlans/dp-bad')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { userId: EMP.id, title: 'x', status: 'IN_PROGRESS', createdBy: EMP.id, items: [] } });
    expect(badStatus.status).toBe(422);

    const badItems = await request(app)
      .put('/col/developmentPlans/dp-bad2')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { userId: EMP.id, title: 'x', status: 'DRAFT', createdBy: EMP.id, items: 'oops' } });
    expect(badItems.status).toBe(422);
  });

  it('a draft may be deleted but an active plan is archived, never erased', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    expect((await request(app).delete('/col/developmentPlans/dp-emp').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);
    expect((await request(app).delete('/col/developmentPlans/dp-emp-draft').set('Authorization', `Bearer ${empTok}`)).status).toBe(204);
  });

  it('appSettings is read-open and admin-write', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const policy = { bands: [{ minYears: 0, level: 2 }], maxProvisionalLevel: 3, enabled: true };

    const empWrite = await request(app)
      .put('/col/appSettings/work-experience')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: policy });
    expect(empWrite.status).toBe(403);

    const adminWrite = await request(app)
      .put('/col/appSettings/work-experience')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: policy });
    expect(adminWrite.status).toBe(200);

    // Every client must be able to READ it to compute provisional scores.
    const empRead = await request(app).get('/col/appSettings/work-experience').set('Authorization', `Bearer ${empTok}`);
    expect(empRead.status).toBe(200);
    expect(empRead.body.data.maxProvisionalLevel).toBe(3);
  });
});

describe('org-level ACEO can be persisted (regression: F-1)', () => {
  it('admin can create a user at the ACEO org level', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app)
      .put('/col/users/aceo-1')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'Sector Head', email: 'aceo@eprom.local', role: 'EMPLOYEE', status: 'ACTIVE', orgLevel: 'ACEO' } });
    expect(res.status).toBe(200);
    expect(res.body.data.orgLevel).toBe('ACEO');
  });
});

describe('activityLogs audit trail (F-2)', () => {
  beforeAll(async () => {
    const now = new Date().toISOString();
    await query('INSERT INTO "activityLogs" (id, data) VALUES ($1, $2)', [
      'log-emp',
      { id: 'log-emp', actorId: EMP.id, action: 'Did thing', target: 'X', timestamp: now },
    ]);
    await query('INSERT INTO "activityLogs" (id, data) VALUES ($1, $2)', [
      'log-other',
      { id: 'log-other', actorId: OTHER.id, action: 'Did thing', target: 'Y', timestamp: now },
    ]);
  });

  it('an employee lists only their own audit entries', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const res = await request(app).post('/col/activityLogs/query').set('Authorization', `Bearer ${empTok}`).send({});
    expect(res.status).toBe(200);
    const ids = idsOf(res);
    expect(ids).toContain('log-emp');
    expect(ids).not.toContain('log-other');
  });

  it('admin reads the whole audit trail', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const ids = idsOf(await request(app).post('/col/activityLogs/query').set('Authorization', `Bearer ${adminTok}`).send({}));
    expect(ids).toEqual(expect.arrayContaining(['log-emp', 'log-other']));
  });

  it('a stranger cannot read another user’s audit entry one-by-one', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const res = await request(app).get('/col/activityLogs/log-other').set('Authorization', `Bearer ${empTok}`);
    expect(res.status).toBe(403);
  });

  it('a log entry is always filed under the sender, whoever it claims to be from (R9)', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const forged = await request(app)
      .post('/col/activityLogs')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ id: 'log-forged', data: { actorId: OTHER.id, actorName: 'Someone Else', action: 'evil', target: 'x', timestamp: '2020-01-01T00:00:00.000Z' } });
    expect(forged.status).toBe(201);
    const { rows } = await query('SELECT data FROM "activityLogs" WHERE id = $1', ['log-forged']);
    expect(rows[0].data.actorId).toBe(EMP.id);
    expect(rows[0].data.actorName).not.toBe('Someone Else'); // the session's own name (an earlier test renames EMP)
    expect(rows[0].data.timestamp).not.toBe('2020-01-01T00:00:00.000Z');

    const own = await request(app)
      .post('/col/activityLogs')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { actorId: EMP.id, action: 'ok', target: 'x', timestamp: new Date().toISOString() } });
    expect(own.status).toBe(201);
  });
});

describe('batch is atomic and authorized inside the transaction (F-7)', () => {
  it('a batch containing one forbidden op writes none of them', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const res = await request(app)
      .post('/batch')
      .set('Authorization', `Bearer ${empTok}`)
      .send({
        operations: [
          { type: 'set', collection: 'notifications', id: 'n-batch', data: { userId: EMP.id, title: 't', message: 'm', isRead: false } },
          { type: 'set', collection: 'skills', id: 'sk-batch', data: { name: 'Nope', category: 'Technical' } }, // admin-only → forbidden
        ],
      });
    expect(res.status).toBe(403);
    // The authorized op must have rolled back with the forbidden one.
    const check = await query('SELECT id FROM notifications WHERE id = $1', ['n-batch']);
    expect(check.rows.length).toBe(0);
  });

  it('a fully authorized batch applies atomically', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const res = await request(app)
      .post('/batch')
      .set('Authorization', `Bearer ${empTok}`)
      .send({
        operations: [
          // `createdBy` is now required on any client-written notification — see
          // the H7 suite below.
          { type: 'set', collection: 'notifications', id: 'n-ok-1', data: { userId: EMP.id, title: 'a', message: 'm', isRead: false, createdBy: EMP.id } },
          { type: 'set', collection: 'notifications', id: 'n-ok-2', data: { userId: EMP.id, title: 'b', message: 'm', isRead: false, createdBy: EMP.id } },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    const check = await query('SELECT id FROM notifications WHERE id IN ($1, $2)', ['n-ok-1', 'n-ok-2']);
    expect(check.rows.length).toBe(2);
  });
});

describe('write-side validation (data contract)', () => {
  it('rejects a user document with an invalid role enum (422)', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app)
      .put('/col/users/bad-role')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'X', email: 'x@eprom.local', role: 'SUPERADMIN', status: 'ACTIVE' } });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_failed');
  });

  it('rejects a training course whose skill links are not an array of ids (422)', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app)
      .put('/col/trainingCourses/bad-links')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { title: 'BOSIET', provider: 'OPITO', type: 'EXTERNAL', linkedSkillIds: 'skill1' } });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('validation_failed');
  });

  it('accepts a well-formed training course', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app)
      .put('/col/trainingCourses/good-course')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({
        data: {
          title: 'BOSIET', provider: 'OPITO', type: 'EXTERNAL',
          linkedSkillIds: ['skill1', 'skill2'], targetLevel: 3, durationHours: 24, costPerSeat: 18000,
        },
      });
    expect(res.status).toBeLessThan(300);
  });

  it('rejects a skill with an invented criticality, and accepts a valid one (422)', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    // Criticality multiplies every gap this skill produces in the training-needs
    // ranking, so a typo here would quietly mis-rank a training budget.
    const bad = await request(app)
      .put('/col/skills/bad-criticality')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'Permit to Work', criticality: 'VERY_IMPORTANT' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error).toBe('validation_failed');

    const good = await request(app)
      .put('/col/skills/good-criticality')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'Permit to Work', criticality: 'SAFETY_CRITICAL' } });
    expect(good.status).toBeLessThan(300);

    // A skill written before criticality existed must still save.
    const legacy = await request(app)
      .put('/col/skills/legacy-skill')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'Old skill', category: 'Technical' } });
    expect(legacy.status).toBeLessThan(300);
  });

  it('rejects a non-object document (422)', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app)
      .put('/col/skills/not-an-object')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: 'just a string' });
    expect(res.status).toBe(422);
  });

  it('accepts a valid document and returns server metadata (version)', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app)
      .put('/col/skills/valid-skill')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'Welding', category: 'Technical' } });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
  });
});

describe('delta sync (incremental reads + tombstones)', () => {
  const auth = async () => `Bearer ${await login(ADMIN.email, 'admin-pass')}`;

  it('a delta query returns only rows changed after the cursor', async () => {
    const a = await auth();
    await request(app).put('/col/skills/delta-a').set('Authorization', a).send({ data: { name: 'A', category: 'Technical' } });
    // The cursor stays a millisecond behind "now" (cursor.ts), so give delta-a one.
    await new Promise((r) => setTimeout(r, 5));

    const full = await request(app).post('/col/skills/query').set('Authorization', a).send({});
    expect(full.body.cursor).toBeTruthy();
    const cursor = full.body.cursor;

    await new Promise((r) => setTimeout(r, 8)); // let updated_at advance past the cursor
    await request(app).put('/col/skills/delta-b').set('Authorization', a).send({ data: { name: 'B', category: 'Technical' } });

    const delta = await request(app).post('/col/skills/query').set('Authorization', a).send({ since: cursor });
    const ids = delta.body.documents.map((d: any) => d.id);
    expect(ids).toContain('delta-b'); // changed after cursor
    expect(ids).not.toContain('delta-a'); // unchanged since cursor
  });

  it('a hard delete surfaces as a tombstone in the delta response', async () => {
    const a = await auth();
    await request(app).put('/col/skills/tomb-x').set('Authorization', a).send({ data: { name: 'X', category: 'Technical' } });

    const full = await request(app).post('/col/skills/query').set('Authorization', a).send({});
    const cursor = full.body.cursor;

    await new Promise((r) => setTimeout(r, 8));
    const del = await request(app).delete('/col/skills/tomb-x').set('Authorization', a);
    expect(del.status).toBe(204);

    const delta = await request(app).post('/col/skills/query').set('Authorization', a).send({ since: cursor });
    const deletedIds = (delta.body.deletions ?? []).map((d: any) => d.id);
    expect(deletedIds).toContain('tomb-x');
  });

  // R7. `updated_at = now()` is when the writing transaction STARTED, not when
  // its rows became visible. A slow write still open while a quicker one lands
  // must not be overtaken by the cursor, or its rows are never sent.
  it('the cursor never passes a write that is still committing (R7)', async () => {
    const a = await auth();
    const dbNow = (await query('SELECT now() AS n')).rows[0].n as Date;
    const t0 = new Date(dbNow.getTime() - 2000); // the slow write began 2 s ago…
    await query("INSERT INTO pg_stat_activity VALUES ('ecms', 'client backend', $1)", [t0]);
    let cursor: string;
    try {
      // …a quick write lands meanwhile, and a client polls.
      await request(app).put('/col/skills/r7-fast').set('Authorization', a).send({ data: { name: 'Fast', category: 'Technical' } });
      const full = await request(app).post('/col/skills/query').set('Authorization', a).send({});
      expect(idsOf(full)).toContain('r7-fast');
      cursor = full.body.cursor;
      expect(Date.parse(cursor)).toBeLessThan(t0.getTime());

      // The slow write commits, stamped with its START time.
      await query('INSERT INTO skills (id, data, updated_at) VALUES ($1, $2, $3)', [
        'r7-late',
        { id: 'r7-late', name: 'Late', category: 'Technical' },
        t0,
      ]);
    } finally {
      await query('DELETE FROM pg_stat_activity');
    }

    const delta = await request(app).post('/col/skills/query').set('Authorization', a).send({ since: cursor });
    expect(idsOf(delta)).toContain('r7-late');
  });

  // R7. A page cut short by its LIMIT used to let the newest deletion (or the
  // last row's own timestamp) carry the cursor past rows it never reached.
  it('a page cut short by its limit resumes where it stopped, deletions or not (R7)', async () => {
    const a = await auth();
    const base = Date.parse('2020-01-01T00:00:00.000Z'); // older than every other row
    const at = (ms: number) => new Date(base + ms);
    await query('INSERT INTO nominations (id, data, updated_at) VALUES ($1, $2, $3), ($4, $5, $6)', [
      'r7-n1', { id: 'r7-n1' }, at(100),
      'r7-n2', { id: 'r7-n2' }, at(200),
    ]);
    await query('INSERT INTO tombstones (collection, id, deleted_at) VALUES ($1, $2, $3)', ['nominations', 'r7-gone', at(300)]);

    // A one-row page: r7-n1 fits, r7-n2 does not, and the deletion is newer than both.
    const seen = new Set<string>();
    let since = at(0).toISOString();
    for (let poll = 0; poll < 4 && !seen.has('r7-n2'); poll++) {
      const res = await request(app).post('/col/nominations/query').set('Authorization', a).send({ since, limit: 1 });
      expect(res.status).toBe(200);
      idsOf(res).forEach((id) => seen.add(id));
      since = res.body.cursor;
    }
    expect(seen.has('r7-n1')).toBe(true);
    expect(seen.has('r7-n2')).toBe(true);
  });
});

describe('optimistic concurrency (version)', () => {
  it('increments version on each write and enforces expectedVersion', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');

    const created = await request(app)
      .put('/col/skills/conc-skill')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'Rigging', category: 'Technical' } });
    expect(created.status).toBe(200);
    expect(created.body.version).toBe(1);

    const bumped = await request(app)
      .patch('/col/skills/conc-skill')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'Rigging v2' }, expectedVersion: 1 });
    expect(bumped.status).toBe(200);
    expect(bumped.body.version).toBe(2);

    // A stale writer that still thinks it's on v1 is rejected with the truth.
    const stale = await request(app)
      .patch('/col/skills/conc-skill')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { name: 'Rigging conflict' }, expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.currentVersion).toBe(2);
  });
});

// Admin-issued temporary password: the only password-recovery path until an
// SMTP relay exists for self-service email resets.
describe('admin password reset → forced change', () => {
  // The half-built reset-by-email route is GONE (there was never a redeem
  // endpoint or an SMTP relay). An admin-issued temporary password below is the
  // only supported way back in — this pins that the dead route stays dead.
  it('has no self-service password-reset endpoint', async () => {
    const res = await request(app).post('/auth/reset-password').send({ email: EMP.email });
    expect(res.status).toBe(404);
  });

  it('non-admins cannot set another user\'s password', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const res = await request(app)
      .post('/auth/admin/set-password')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ userId: MGR.id, newPassword: 'hijacked-pass' });
    expect(res.status).toBe(403);
  });

  // Runs last in the file: it permanently changes EMP's password.
  it('issues a temp password, flags mustReset, and clears it on change', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const TEMP = 'Temp-Pass-1234';

    const set = await request(app)
      .post('/auth/admin/set-password')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ userId: EMP.id, newPassword: TEMP });
    expect(set.status).toBe(200);

    // The old password no longer works; the temp one does and is flagged.
    const stale = await request(app).post('/auth/login').send({ email: EMP.email, password: 'emp-pass' });
    expect(stale.status).toBe(401);

    const fresh = await request(app).post('/auth/login').send({ email: EMP.email, password: TEMP });
    expect(fresh.status).toBe(200);
    expect(fresh.body.mustReset).toBe(true);
    const tok = fresh.body.token;

    // The flag survives a page refresh (which re-resolves via /auth/me).
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${tok}`);
    expect(me.body.mustReset).toBe(true);

    // While forced, the current password is not required to set a new one.
    const changed = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${tok}`)
      .send({ newPassword: 'chosen-by-me-9' });
    expect(changed.status).toBe(200);

    const after = await request(app).post('/auth/login').send({ email: EMP.email, password: 'chosen-by-me-9' });
    expect(after.status).toBe(200);
    expect(after.body.mustReset).toBe(false);

    // Now that the account is settled, a change demands the current password.
    const noCurrent = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${after.body.token}`)
      .send({ newPassword: 'another-new-pw' });
    expect(noCurrent.status).toBe(403);
  });
});

describe('self-registration is off by default', () => {
  // No ALLOW_SIGNUP in this suite's env, so config falls back to its default.
  // This test is the guard on that default: flip it back to `true` in config.ts
  // and the API starts letting strangers claim email addresses again.
  it('rejects a sign-up when the flag is unset', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ email: 'walk-in@eprom.local', password: 'longenough1', name: 'Walk In' });
    expect(res.status).toBe(403);
    // No half-made account is left behind.
    const { rows } = await query("SELECT id FROM users WHERE lower(data->>'email') = $1", ['walk-in@eprom.local']);
    expect(rows.length).toBe(0);
  });

  it('advertises the setting to the login screen', async () => {
    const res = await request(app).get('/auth/config');
    expect(res.status).toBe(200);
    expect(res.body.allowSignup).toBe(false);
  });
});

// Hole R5: signup writes straight to SQL, past zod and the protected-field
// rule, and used to spread a caller-supplied `profile` into the new document.
describe('a sign-up cannot place itself in the org chart', () => {
  it('keeps only email + name, whatever else is sent', async () => {
    const { config } = await import('../config.js');
    const was = config.allowSignup;
    config.allowSignup = true;
    try {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          email: 'climber@eprom.local',
          password: 'longenough1',
          name: '  Climber  ',
          role: 'ADMIN',
          status: 'ACTIVE',
          profile: {
            orgLevel: 'GM',
            managerId: 'ceo-1',
            departmentId: 'sub-1',
            jobProfileId: 'jp-gm',
            role: 'ADMIN',
            status: 'ACTIVE',
            avatarUrl: 'javascript:alert(1)',
          },
        });
      expect(res.status).toBe(201);
      const { rows } = await query('SELECT data FROM users WHERE id = $1', [res.body.id]);
      expect(rows[0].data).toEqual({
        id: res.body.id,
        name: 'Climber',
        email: 'climber@eprom.local',
        role: 'EMPLOYEE',
        status: 'PENDING',
      });
    } finally {
      config.allowSignup = was;
    }
  });
});

// ── The users-table escalation chain (holes H1, H2, H3, H8) ─────────────────
// Every test here is a plain employee (or a merely-senior one) attacking the
// real app over HTTP. Each one SUCCEEDED before this was fixed.
describe('users: privilege escalation is closed', () => {
  // Its own employee, not EMP: the admin-reset suite above rotates EMP's
  // password, and these tests must not depend on where they sit in the file.
  const ESC = { id: 'esc-1', email: 'escalator@eprom.local' };
  beforeAll(async () => {
    await seedUser(ESC, 'EMPLOYEE', 'esc-pass', { managerId: 'mgr-x', orgLevel: 'JP' });
  });

  it('H1 — an employee cannot raise their own org level (or move themselves in the org chart)', async () => {
    const empTok = await login(ESC.email, 'esc-pass');

    for (const patch of [{ orgLevel: 'GM' }, { status: 'PENDING' }, { managerId: ESC.id }, { departmentId: 'd-x' }]) {
      const res = await request(app)
        .patch(`/col/users/${ESC.id}`)
        .set('Authorization', `Bearer ${empTok}`)
        .send({ data: patch });
      expect([res.status, JSON.stringify(patch)]).toEqual([403, JSON.stringify(patch)]);
    }

    const row = (await query('SELECT data FROM users WHERE id = $1', [ESC.id])).rows[0];
    expect(row.data.orgLevel).toBe('JP');
    expect(row.data.status).toBe('ACTIVE');
    expect(row.data.managerId).toBe('mgr-x');

    // The ordinary profile edit still works — this is a field lock, not a freeze.
    const ok = await request(app)
      .patch(`/col/users/${ESC.id}`)
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { name: 'Renamed Again', certificates: [] } });
    expect(ok.status).toBe(200);
  });

  it('H2 — an employee cannot take the bootstrap admin address', async () => {
    const empTok = await login(ESC.email, 'esc-pass');
    const res = await request(app)
      .patch(`/col/users/${ESC.id}`)
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { email: BOOTSTRAP_EMAIL } });
    expect(res.status).toBe(403);
  });

  it('H2 — and even holding that address in the DOCUMENT grants nothing: the grant follows the login', async () => {
    // Straight into the DB, so this stands even if the field lock above ever
    // regresses: what must not confer admin is the users document's `email`.
    const IMPOSTOR = { id: 'impostor-1', email: 'impostor@eprom.local' };
    await seedUser(IMPOSTOR, 'EMPLOYEE', 'impostor-pass');
    const before = (await query('SELECT data FROM users WHERE id = $1', [IMPOSTOR.id])).rows[0].data;
    await query('UPDATE users SET data = $2 WHERE id = $1', [IMPOSTOR.id, { ...before, email: BOOTSTRAP_EMAIL }]);

    const tok = await login(IMPOSTOR.email, 'impostor-pass');
    const write = await request(app)
      .put('/col/skills/impostor-skill')
      .set('Authorization', `Bearer ${tok}`)
      .send({ data: { name: 'Forged', category: 'X' } });
    expect(write.status).toBe(403); // admin-write collection

    const promote = await request(app)
      .patch(`/col/users/${ESC.id}`)
      .set('Authorization', `Bearer ${tok}`)
      .send({ data: { role: 'ADMIN' } });
    expect(promote.status).toBe(403);
  });

  it('H3 — a senior employee cannot edit someone they do not manage', async () => {
    const mgrTok = await login(MGR.email, 'mgr-pass'); // orgLevel SH, manages sub-1 → sub-2

    const stranger = await request(app)
      .patch(`/col/users/${OTHER.id}`)
      .set('Authorization', `Bearer ${mgrTok}`)
      .send({ data: { name: 'Hijacked' } });
    expect(stranger.status).toBe(403);

    const boss = await request(app)
      .patch(`/col/users/${CEO.id}`)
      .set('Authorization', `Bearer ${mgrTok}`)
      .send({ data: { name: 'Hijacked' } });
    expect(boss.status).toBe(403);

    // Their OWN people stay editable, transitively (certificate approval).
    const own = await request(app)
      .patch('/col/users/sub-2')
      .set('Authorization', `Bearer ${mgrTok}`)
      .send({ data: { certificates: [] } });
    expect(own.status).toBe(200);

    // But not their people's privilege fields.
    const promoteReport = await request(app)
      .patch('/col/users/sub-2')
      .set('Authorization', `Bearer ${mgrTok}`)
      .send({ data: { orgLevel: 'GM' } });
    expect(promoteReport.status).toBe(403);
  });

  it('H8 — an employee cannot delete their own account, nor anyone else’s', async () => {
    const empTok = await login(ESC.email, 'esc-pass');
    const res = await request(app).delete(`/col/users/${ESC.id}`).set('Authorization', `Bearer ${empTok}`);
    expect(res.status).toBe(403);
    expect((await query('SELECT 1 FROM users WHERE id = $1', [ESC.id])).rows.length).toBe(1);
  });
});

describe('submissions: nobody may award themselves a verdict', () => {
  // Its own employee + evidence record, for the same reason as the escalation
  // suite above: the admin-reset tests rotate EMP's password, and this suite
  // must not depend on where it sits in the file. SUBJ reports DIRECTLY to MGR,
  // which is what the reviewer path needs.
  const SUBJ = { id: 'vsubj-1', email: 'vsubj@eprom.local' };
  beforeAll(async () => {
    await seedUser(SUBJ, 'EMPLOYEE', 'vsubj-pass', { managerId: MGR.id, orgLevel: 'JP' });
    await seedDoc('evidences', 'e-vsubj', { userId: SUBJ.id, skillId: 's-1', status: 'PENDING' });
  });
  // H4/H5 — a plain employee used to be able to POST an evidence record already
  // APPROVED with assignedScore 5, or a work experience already VERIFIED with a
  // verifiedLevel, and thereby award themselves a competency level.
  it('H4 — an employee cannot create pre-approved, self-scored evidence', async () => {
    const empTok = await login(SUBJ.email, 'vsubj-pass');

    const selfApproved = await request(app)
      .post('/col/evidences')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ id: 'e-self-approved', data: { userId: SUBJ.id, skillId: 's-1', status: 'APPROVED', assignedScore: 5 } });
    expect(selfApproved.status).toBe(403);

    // Even PENDING, a score is the reviewer's to write.
    const scoredPending = await request(app)
      .post('/col/evidences')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ id: 'e-self-scored', data: { userId: SUBJ.id, skillId: 's-1', status: 'PENDING', assignedScore: 5 } });
    expect(scoredPending.status).toBe(403);

    // The real submission still works.
    const honest = await request(app)
      .post('/col/evidences')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ id: 'e-honest', data: { userId: SUBJ.id, skillId: 's-1', status: 'PENDING', notes: 'my work' } });
    expect(honest.status).toBe(201);
    expect((await query('SELECT 1 FROM evidences WHERE id = $1', ['e-self-approved'])).rows.length).toBe(0);
  });

  it('H4 — nor approve or score their own pending evidence by PATCH', async () => {
    const empTok = await login(SUBJ.email, 'vsubj-pass');
    for (const patch of [{ status: 'APPROVED' }, { assignedScore: 5 }, { status: 'APPROVED', assignedScore: 5 }, { reviewedBy: SUBJ.id }]) {
      const res = await request(app)
        .patch('/col/evidences/e-honest')
        .set('Authorization', `Bearer ${empTok}`)
        .send({ data: patch });
      expect([res.status, JSON.stringify(patch)]).toEqual([403, JSON.stringify(patch)]);
    }
    // Editing the submission itself is still allowed (it stays PENDING).
    const edit = await request(app)
      .patch('/col/evidences/e-honest')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { notes: 'better notes' } });
    expect(edit.status).toBe(200);
    expect((await query('SELECT data FROM evidences WHERE id = $1', ['e-honest'])).rows[0].data.status).toBe('PENDING');
  });

  it('H4 — the manager review path is untouched', async () => {
    const mgrTok = await login(MGR.email, 'mgr-pass');
    const approve = await request(app)
      .patch('/col/evidences/e-vsubj')
      .set('Authorization', `Bearer ${mgrTok}`)
      .send({ data: { status: 'APPROVED', assignedScore: 4, reviewedBy: MGR.id } });
    expect(approve.status).toBe(200);
  });

  it('H5 — an employee cannot self-verify work experience, on create or by PATCH', async () => {
    const empTok = await login(SUBJ.email, 'vsubj-pass');
    const skills = JSON.stringify([{ skillId: 's-1', claimedLevel: 4, yearsApplied: 8, verifiedLevel: 5 }]);

    const selfVerified = await request(app)
      .put('/col/workExperiences/we-self-verified')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { userId: SUBJ.id, employer: 'Acme', jobTitle: 'T', startDate: '2010-01-01', status: 'VERIFIED', skills } });
    expect(selfVerified.status).toBe(403);

    // PENDING but carrying a verified level is the same self-award: the score
    // reader only looks at VERIFIED records, but one PATCH away it would count.
    const levelled = await request(app)
      .put('/col/workExperiences/we-self-levelled')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { userId: SUBJ.id, employer: 'Acme', jobTitle: 'T', startDate: '2010-01-01', status: 'PENDING', skills } });
    expect(levelled.status).toBe(403);

    // A clean claim goes through…
    const claim = JSON.stringify([{ skillId: 's-1', claimedLevel: 4, yearsApplied: 8, suggestedLevel: 3 }]);
    const honest = await request(app)
      .put('/col/workExperiences/we-honest')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { userId: SUBJ.id, employer: 'Acme', jobTitle: 'T', startDate: '2010-01-01', status: 'PENDING', skills: claim } });
    expect(honest.status).toBe(200);

    // …and cannot then be verified by its own owner.
    for (const patch of [{ status: 'VERIFIED' }, { skills }, { reviewedBy: SUBJ.id }]) {
      const res = await request(app)
        .patch('/col/workExperiences/we-honest')
        .set('Authorization', `Bearer ${empTok}`)
        .send({ data: patch });
      expect([res.status, JSON.stringify(patch)]).toEqual([403, JSON.stringify(patch)]);
    }
    expect((await query('SELECT data FROM "workExperiences" WHERE id = $1', ['we-honest'])).rows[0].data.status).toBe('PENDING');
  });

  it('H4/H5 — the same rule holds through /batch (no back door)', async () => {
    const empTok = await login(SUBJ.email, 'vsubj-pass');
    const res = await request(app)
      .post('/batch')
      .set('Authorization', `Bearer ${empTok}`)
      .send({
        operations: [
          { type: 'set', collection: 'evidences', id: 'e-batch', data: { userId: SUBJ.id, skillId: 's-1', status: 'APPROVED', assignedScore: 5 } },
        ],
      });
    expect(res.status).toBe(403);
    expect((await query('SELECT 1 FROM evidences WHERE id = $1', ['e-batch'])).rows.length).toBe(0);
  });
});

describe('deleting an employee releases their login', () => {
  const LEAVER = { id: 'leaver-1', email: 'leaver@eprom.local' };

  it('is admin-only', async () => {
    await seedUser(LEAVER, 'EMPLOYEE', 'leaver-pass');
    const otherTok = await login(OTHER.email, 'other-pass');
    const res = await request(app)
      .post('/auth/admin/release-login')
      .set('Authorization', `Bearer ${otherTok}`)
      .send({ userId: LEAVER.id });
    expect(res.status).toBe(403);
  });

  it('refuses to release the caller\'s own login', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app)
      .post('/auth/admin/release-login')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ userId: ADMIN.id });
    expect(res.status).toBe(400);
  });

  it('destroys the password, frees the email, and keeps the archived profile', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    // What the UI does first: archive the profile.
    const before = (await query('SELECT data FROM users WHERE id = $1', [LEAVER.id])).rows[0].data;
    await query('UPDATE users SET data = $2 WHERE id = $1', [LEAVER.id, { ...before, isArchived: true }]);

    const res = await request(app)
      .post('/auth/admin/release-login')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ userId: LEAVER.id });
    expect(res.status).toBe(200);
    expect(res.body.emailReleased).toBe(LEAVER.email);

    // The password is gone.
    expect((await query('SELECT 1 FROM auth_credentials WHERE user_id = $1', [LEAVER.id])).rows.length).toBe(0);

    // The profile survives for history, but no longer holds the address — the
    // KEY is removed, not blanked, so the unique email index lets it be reissued.
    const row = (await query('SELECT data FROM users WHERE id = $1', [LEAVER.id])).rows[0];
    expect(row).toBeTruthy();
    expect(row.data.email).toBeUndefined();
    expect(row.data.archivedEmail).toBe(LEAVER.email);
    expect(row.data.isArchived).toBe(true);
    expect((await query("SELECT id FROM users WHERE lower(data->>'email') = $1", [LEAVER.email])).rows.length).toBe(0);

    // They cannot sign in, with the old password or any other.
    const relogin = await request(app).post('/auth/login').send({ email: LEAVER.email, password: 'leaver-pass' });
    expect(relogin.status).toBe(401);
  });

  it('is idempotent — a second release is a no-op, not an error', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app)
      .post('/auth/admin/release-login')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ userId: LEAVER.id });
    expect(res.status).toBe(200);
    expect(res.body.emailReleased).toBe(null);
  });

  it('ends a leaver\'s OPEN session — archive, then release, then the change-password back door', async () => {
    // The hole: archive leaves status ACTIVE, release deletes the credential row
    // (which also disabled the iat check), and change-password then INSERTED a
    // new credential with no current password and handed back a fresh token.
    const quitter = { id: 'quitter-1', email: 'quitter@eprom.local' };
    await seedUser(quitter, 'EMPLOYEE', 'quitter-pass');
    const oldTok = await login(quitter.email, 'quitter-pass');
    const adminTok = await login(ADMIN.email, 'admin-pass');

    // Archived (what Admin → delete does first): the open token stops working.
    const before = (await query('SELECT data FROM users WHERE id = $1', [quitter.id])).rows[0].data;
    await query('UPDATE users SET data = $2 WHERE id = $1', [quitter.id, { ...before, isArchived: true }]);
    const me1 = await request(app).get('/auth/me').set('Authorization', `Bearer ${oldTok}`);
    expect(me1.status).toBe(403);
    expect(me1.body.error).toBe('account_not_active');

    // Released: still refused, now because there is no login at all.
    const rel = await request(app)
      .post('/auth/admin/release-login')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ userId: quitter.id });
    expect(rel.status).toBe(200);
    // Even with the archive flag cleared (an admin "restore"), the old token is dead.
    const now = (await query('SELECT data FROM users WHERE id = $1', [quitter.id])).rows[0].data;
    await query('UPDATE users SET data = $2 WHERE id = $1', [quitter.id, { ...now, isArchived: false }]);
    const me2 = await request(app).get('/auth/me').set('Authorization', `Bearer ${oldTok}`);
    expect(me2.status).toBe(401);

    // And the back door: no new password, no new token, no credential row created.
    const cp = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${oldTok}`)
      .send({ newPassword: 'i-am-back-forever' });
    expect(cp.status).toBe(401);
    expect(cp.body.token).toBeUndefined();
    expect((await query('SELECT 1 FROM auth_credentials WHERE user_id = $1', [quitter.id])).rows.length).toBe(0);
  });

  it('blocks login for an archived profile whose credential survived', async () => {
    // Pre-existing state: archived before this feature shipped, credential intact.
    const legacy = { id: 'legacy-archived', email: 'legacy@eprom.local' };
    await seedUser(legacy, 'EMPLOYEE', 'legacy-pass', { isArchived: true });
    const res = await request(app).post('/auth/login').send({ email: legacy.email, password: 'legacy-pass' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('account_not_active');
  });
});

// ===========================================================================
// H6 — an assessment's TYPE is a claim about who scored whom, and the score
// engine pays by it (a MANAGER score carries 60% of a 360 result, a SELF score
// 10%; INTERVIEW / WRITTEN_EXAM are taken at face value as the latest score).
// Create only ever checked that the rater was the caller, so an employee could
// post `subjectId = raterId = self` with `type: 'MANAGER'` and award themselves
// the heavyweight score. The server now re-derives the same mapping the three
// writing screens use.
// ===========================================================================
describe('assessments: the type must match the real relationship', () => {
  // Its own little org, independent of where this suite sits in the file:
  //   rel-boss  -- managerId -->  rel-emp                  (the chain route)
  //   rel-head  -- manages SECTION dept-rel -->  rel-emp   (the department route)
  const REL_EMP = { id: 'rel-emp', email: 'relemp@eprom.local' };
  const REL_BOSS = { id: 'rel-boss', email: 'relboss@eprom.local' };
  const REL_HEAD = { id: 'rel-head', email: 'relhead@eprom.local' };
  const REL_PEER = { id: 'rel-peer', email: 'relpeer@eprom.local' };

  beforeAll(async () => {
    await seedUser(REL_BOSS, 'EMPLOYEE', 'relboss-pass', { orgLevel: 'SH' });
    await seedUser(REL_HEAD, 'EMPLOYEE', 'relhead-pass', { orgLevel: 'SH' });
    await seedUser(REL_PEER, 'EMPLOYEE', 'relpeer-pass', { orgLevel: 'JP', departmentId: 'dept-rel' });
    await seedUser(REL_EMP, 'EMPLOYEE', 'relemp-pass', {
      orgLevel: 'JP',
      managerId: REL_BOSS.id,
      departmentId: 'dept-rel',
    });
    await seedDoc('departments', 'dept-rel', { name: 'Rel Section', type: 'SECTION', managerId: REL_HEAD.id });
  });

  const post = (tok: string, id: string, data: Record<string, unknown>) =>
    request(app).post('/col/assessments').set('Authorization', `Bearer ${tok}`).send({ id, data });

  it('H6 - an employee cannot write a manager-grade score of themselves', async () => {
    const tok = await login(REL_EMP.email, 'relemp-pass');

    for (const type of ['MANAGER', 'INTERVIEW', 'PRACTICAL_DEMO', 'WRITTEN_EXAM', 'WORK_RECORD_REVIEW']) {
      const res = await post(tok, `a-self-${type}`, {
        raterId: REL_EMP.id, subjectId: REL_EMP.id, skillId: 's-1', score: 5, type,
      });
      expect(res.status).toBe(403);
    }

    // The honest self-evaluation still works - it is just worth 10%.
    const honest = await post(tok, 'a-self-ok', {
      raterId: REL_EMP.id, subjectId: REL_EMP.id, skillId: 's-1', score: 5, type: 'SELF',
    });
    expect(honest.status).toBe(201);
  });

  it('a colleague may rate a peer, but not as their manager', async () => {
    const tok = await login(REL_PEER.email, 'relpeer-pass');

    const peer = await post(tok, 'a-peer-ok', {
      raterId: REL_PEER.id, subjectId: REL_EMP.id, skillId: 's-1', score: 4, type: 'PEER',
    });
    expect(peer.status).toBe(201);

    const posing = await post(tok, 'a-peer-posing', {
      raterId: REL_PEER.id, subjectId: REL_EMP.id, skillId: 's-1', score: 5, type: 'MANAGER',
    });
    expect(posing.status).toBe(403);
  });

  it('a real supervisor may - by the chain OR by owning the section', async () => {
    const bossTok = await login(REL_BOSS.email, 'relboss-pass');
    const byChain = await post(bossTok, 'a-mgr-chain', {
      raterId: REL_BOSS.id, subjectId: REL_EMP.id, skillId: 's-1', score: 4, type: 'MANAGER',
    });
    expect(byChain.status).toBe(201);

    // The department route matters: the SPA calls everyone in a section you own
    // a direct report, so a section head who is nobody else's `managerId` must
    // still be able to score them.
    const headTok = await login(REL_HEAD.email, 'relhead-pass');
    const byDept = await post(headTok, 'a-mgr-dept', {
      raterId: REL_HEAD.id, subjectId: REL_EMP.id, skillId: 's-1', score: 4, type: 'INTERVIEW',
    });
    expect(byDept.status).toBe(201);
  });

  it('UPWARD is only allowed against your own supervisor', async () => {
    const tok = await login(REL_EMP.email, 'relemp-pass');

    const real = await post(tok, 'a-up-ok', {
      raterId: REL_EMP.id, subjectId: REL_BOSS.id, skillId: 's-1', score: 3, type: 'UPWARD',
    });
    expect(real.status).toBe(201);

    // A stranger is not "my supervisor" - that would put an unearned upward
    // record on their profile.
    const stranger = await post(tok, 'a-up-stranger', {
      raterId: REL_EMP.id, subjectId: OTHER.id, skillId: 's-1', score: 1, type: 'UPWARD',
    });
    expect(stranger.status).toBe(403);
  });

  it('an edit cannot upgrade a peer score into a manager score', async () => {
    const tok = await login(REL_PEER.email, 'relpeer-pass');
    const upgrade = await request(app)
      .patch('/col/assessments/a-peer-ok')
      .set('Authorization', `Bearer ${tok}`)
      .send({ data: { type: 'MANAGER', score: 5 } });
    expect(upgrade.status).toBe(403);
  });

  it('the /batch route is not a back door', async () => {
    const tok = await login(REL_EMP.email, 'relemp-pass');
    const res = await request(app)
      .post('/batch')
      .set('Authorization', `Bearer ${tok}`)
      .send({
        operations: [
          { type: 'set', collection: 'assessments', id: 'a-batch-self', data: { raterId: REL_EMP.id, subjectId: REL_EMP.id, skillId: 's-1', score: 5, type: 'MANAGER' } },
        ],
      });
    expect(res.status).toBe(403);
    const check = await query('SELECT id FROM assessments WHERE id = $1', ['a-batch-self']);
    expect(check.rows.length).toBe(0);
  });
});

// ===========================================================================
// H7 — a notification used to need nothing but a recipient id, so any employee
// could drop a message into anybody's bell in the system's own voice ("your
// manager approved your evidence"). Restricting the RECIPIENT would not fix
// that and would break the app - the legitimate senders are everywhere. The
// rule is attribution: a client-written notification must name its sender, and
// `sourceKey` stays the nightly sweep's alone.
// ===========================================================================
describe('notifications: nobody may write in the system voice', () => {
  const SENDER = { id: 'notif-1', email: 'notif@eprom.local' };
  beforeAll(async () => {
    await seedUser(SENDER, 'EMPLOYEE', 'notif-pass', { orgLevel: 'JP' });
  });

  const post = (tok: string, id: string, data: Record<string, unknown>) =>
    request(app).post('/col/notifications').set('Authorization', `Bearer ${tok}`).send({ id, data });

  it('H7 - an unattributed notification is refused', async () => {
    const tok = await login(SENDER.email, 'notif-pass');
    const res = await post(tok, 'n-anon', {
      userId: OTHER.id, title: 'Evidence Approved', message: 'Your evidence was approved.', type: 'SUCCESS',
    });
    expect(res.status).toBe(403);
  });

  it('the sender cannot be somebody else', async () => {
    const tok = await login(SENDER.email, 'notif-pass');
    const res = await post(tok, 'n-forged', {
      userId: OTHER.id, title: 'From your boss', message: 'Do this.', type: 'INFO', createdBy: MGR.id,
    });
    expect(res.status).toBe(403);
  });

  it('sourceKey belongs to the nightly sweep, not to a client', async () => {
    const tok = await login(SENDER.email, 'notif-pass');
    const res = await post(tok, 'n-sourcekey', {
      userId: OTHER.id, title: 'Assessment due', message: 'Overdue.', type: 'WARNING',
      createdBy: SENDER.id, sourceKey: 'assess:emp-2:2026-09',
    });
    expect(res.status).toBe(403);
  });

  it('an honest, signed notification still goes through', async () => {
    const tok = await login(SENDER.email, 'notif-pass');
    const res = await post(tok, 'n-signed', {
      userId: OTHER.id, title: 'New Assessment Received', message: 'You received a new assessment.',
      type: 'INFO', createdBy: SENDER.id,
    });
    expect(res.status).toBe(201);
    const row = await query('SELECT data FROM notifications WHERE id = $1', ['n-signed']);
    expect(row.rows[0].data.createdBy).toBe(SENDER.id);
  });

  it('the /batch route is not a back door', async () => {
    const tok = await login(SENDER.email, 'notif-pass');
    const res = await request(app)
      .post('/batch')
      .set('Authorization', `Bearer ${tok}`)
      .send({
        operations: [
          { type: 'set', collection: 'notifications', id: 'n-batch-anon', data: { userId: OTHER.id, title: 'System', message: 'Click here.', type: 'INFO' } },
        ],
      });
    expect(res.status).toBe(403);
    const check = await query('SELECT id FROM notifications WHERE id = $1', ['n-batch-anon']);
    expect(check.rows.length).toBe(0);
  });
});


// ── The session must be able to END while the app is open ────────────────────
// A JWT is stateless: once issued it is good until it expires. That means a
// password change or a deactivation does nothing to the sessions already out
// there unless the server checks for it on every request — so an admin resetting
// a compromised account's password would NOT actually lock the attacker out for
// the rest of JWT_EXPIRES_IN (12h). authenticate.ts closes that by comparing the
// token's `iat` against auth_credentials.updated_at.
describe('a live session ends when the account does', () => {
  it('retires a token issued before the password last changed', async () => {
    const tok = await login(SESS.email, 'sess-pass');
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${tok}`)).status).toBe(200);

    // What a password change does to the credential row. Pushed clear of the
    // middleware's CLOCK_SKEW_MS: `iat` is whole seconds, so a real change and
    // a token minted in the same millisecond-fast test are indistinguishable
    // without this — the skew is deliberate (see authenticate.ts) and only
    // delays revocation by a second in production.
    await query('UPDATE auth_credentials SET updated_at = $1 WHERE user_id = $2', [
      new Date(Date.now() + 10_000),
      SESS.id,
    ]);

    const dead = await request(app).get('/auth/me').set('Authorization', `Bearer ${tok}`);
    expect(dead.status).toBe(401);
    expect(String(dead.body.error)).toMatch(/password change/);
  });

  it('hands the caller a fresh token so their own tab survives their own change', async () => {
    const tok = await login(SESS_PW.email, 'sesspw-pass');
    const changed = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${tok}`)
      .send({ currentPassword: 'sesspw-pass', newPassword: 'sesspw-pass-2' });
    expect(changed.status).toBe(200);
    expect(typeof changed.body.token).toBe('string');

    // The returned token is a working session for the same person.
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${changed.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(SESS_PW.id);
    expect(
      (await request(app).post('/auth/login').send({ email: SESS_PW.email, password: 'sesspw-pass-2' })).status,
    ).toBe(200);
  });

  it('refuses a deactivated account mid-session with a code the client can act on', async () => {
    const tok = await login(SESS_OFF.email, 'sessoff-pass');
    expect((await request(app).get('/auth/me').set('Authorization', `Bearer ${tok}`)).status).toBe(200);

    const doc = (await query('SELECT data FROM users WHERE id = $1', [SESS_OFF.id])).rows[0].data;
    await query('UPDATE users SET data = $1 WHERE id = $2', [{ ...doc, status: 'REJECTED' }, SESS_OFF.id]);

    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${tok}`);
    expect(res.status).toBe(403);
    // The CODE matters: the SPA signs the user out on this one, and must NOT
    // sign them out on an ordinary permission refusal (next test).
    expect(res.body.error).toBe('account_not_active');
  });

  it('does not use that code for an ordinary permission refusal', async () => {
    const empTok = await login(OTHER.email, 'other-pass');
    const res = await request(app)
      .patch(`/col/users/${ADMIN.id}`)
      .set('Authorization', `Bearer ${empTok}`)
      .send({ name: 'Not Yours' });
    expect(res.status).toBe(403);
    expect(res.body.error).not.toBe('account_not_active');
  });
});

// R3 — a write that lands between another request's read and its write. pg-mem
// runs one statement at a time, so the race is staged: `onceAfter` lets the
// matching SELECT return its (now stale) row, then commits the rival write
// before the route gets to its UPDATE — exactly the window a busy server has.
async function onceAfter(match: RegExp, rival: () => Promise<unknown>) {
  const db = await import('../db.js');
  const pool = db.getPool() as any;
  const original = pool.query.bind(pool);
  let fired = false;
  pool.query = async (text: string, params?: unknown[]) => {
    const result = await original(text, params);
    if (!fired && match.test(text)) {
      fired = true;
      await rival();
    }
    return result;
  };
  return () => {
    pool.query = original;
  };
}

describe('lost updates: a write never silently undoes another (R3)', () => {
  it("a PATCH re-merges onto a rival write instead of erasing it", async () => {
    await seedDoc('skills', 'race-skill', { name: 'Welding', category: 'Technical' });
    const adminTok = await login(ADMIN.email, 'admin-pass');

    const restore = await onceAfter(/SELECT data, version FROM skills/, async () => {
      const doc = (await query('SELECT data FROM skills WHERE id = $1', ['race-skill'])).rows[0].data;
      await query('UPDATE skills SET data = $1, version = version + 1 WHERE id = $2', [
        { ...doc, description: 'written by the other tab' },
        'race-skill',
      ]);
    });
    try {
      const res = await request(app)
        .patch('/col/skills/race-skill')
        .set('Authorization', `Bearer ${adminTok}`)
        .send({ data: { name: 'Welding (TIG)' } });
      expect(res.status).toBe(200);
      expect(res.body.version).toBe(3); // the rival's bump, then ours — on top of it
    } finally {
      restore();
    }

    const stored = (await query('SELECT data FROM skills WHERE id = $1', ['race-skill'])).rows[0].data;
    expect(stored.name).toBe('Welding (TIG)');
    expect(stored.description).toBe('written by the other tab');
  });

  it("an employee's stale edit cannot undo the manager's verdict that beat it", async () => {
    // Its own employee: earlier suites churn EMP's password.
    const RACER = { id: 'racer-1', email: 'racer@eprom.local' };
    await seedUser(RACER, 'EMPLOYEE', 'racer-pass', { managerId: 'mgr-x', orgLevel: 'JP' });
    await seedDoc('evidences', 'e-race', { userId: RACER.id, status: 'PENDING', title: 'Pump overhaul' });
    const empTok = await login(RACER.email, 'racer-pass');

    // The employee's edit was authorized against PENDING; before it is written,
    // the manager approves and scores the record.
    const restore = await onceAfter(/SELECT data, version FROM evidences/, async () => {
      const doc = (await query('SELECT data FROM evidences WHERE id = $1', ['e-race'])).rows[0].data;
      await query('UPDATE evidences SET data = $1, version = version + 1 WHERE id = $2', [
        { ...doc, status: 'APPROVED', assignedScore: 4, reviewedBy: 'mgr-x' },
        'e-race',
      ]);
    });
    let res;
    try {
      res = await request(app)
        .patch('/col/evidences/e-race')
        .set('Authorization', `Bearer ${empTok}`)
        .send({ data: { title: 'Pump overhaul (edited)' } });
    } finally {
      restore();
    }

    // Re-authorized against the APPROVED record, the edit is no longer the
    // owner's to make — and the verdict survives.
    expect(res.status).toBe(403);
    const stored = (await query('SELECT data FROM evidences WHERE id = $1', ['e-race'])).rows[0].data;
    expect(stored.status).toBe('APPROVED');
    expect(stored.assignedScore).toBe(4);
  });

  it('a DELETE does not remove a document that changed after it was checked', async () => {
    await seedDoc('skills', 'race-del', { name: 'Scaffolding' });
    const adminTok = await login(ADMIN.email, 'admin-pass');

    const restore = await onceAfter(/SELECT data, version FROM skills/, async () => {
      await query('UPDATE skills SET version = version + 1 WHERE id = $1', ['race-del']);
    });
    let res;
    try {
      res = await request(app).delete('/col/skills/race-del').set('Authorization', `Bearer ${adminTok}`);
    } finally {
      restore();
    }
    // It retries on the fresh row (still the admin's to delete) and deletes THAT.
    expect(res.status).toBe(204);
    expect((await query('SELECT id FROM skills WHERE id = $1', ['race-del'])).rows).toHaveLength(0);
  });
});

// ===========================================================================
// R6 — /batch used to authorize every op against the PRE-batch rows, so two
// edits that are each fine alone could combine into one that is not. A manager
// holding a PEER score on their own report sends {subjectId: <a stranger>} and
// {type: 'MANAGER'} as two updates of the same doc: each passes against the
// original, together they store a 60%-weight score on someone the manager does
// not supervise. Each op is now checked against what the earlier ops made of
// the data.
// ===========================================================================
describe('batch: each op is checked against what the earlier ops produced (R6)', () => {
  // Its own little org: comp-boss -- managerId --> comp-report; comp-stranger
  // reports to nobody comp-boss runs.
  const BOSS = { id: 'comp-boss', email: 'compboss@eprom.local' };
  const REPORT = { id: 'comp-report', email: 'compreport@eprom.local' };
  const STRANGER = { id: 'comp-stranger', email: 'compstranger@eprom.local' };

  beforeAll(async () => {
    await seedUser(BOSS, 'EMPLOYEE', 'compboss-pass', { orgLevel: 'SH' });
    await seedUser(REPORT, 'EMPLOYEE', 'compreport-pass', { orgLevel: 'JP', managerId: BOSS.id });
    await seedUser(STRANGER, 'EMPLOYEE', 'compstranger-pass', { orgLevel: 'JP' });
    await seedDoc('assessments', 'a-comp-peer', { raterId: BOSS.id, subjectId: REPORT.id, skillId: 's-1', score: 3, type: 'PEER' });
    await seedDoc('assessments', 'a-comp-honest', { raterId: BOSS.id, subjectId: REPORT.id, skillId: 's-2', score: 3, type: 'PEER' });
  });

  const batch = (tok: string, operations: unknown[]) =>
    request(app).post('/batch').set('Authorization', `Bearer ${tok}`).send({ operations });

  it('two edits that are each allowed cannot combine into a forbidden one', async () => {
    const tok = await login(BOSS.email, 'compboss-pass');
    const res = await batch(tok, [
      { type: 'update', collection: 'assessments', id: 'a-comp-peer', data: { subjectId: STRANGER.id } }, // PEER on a stranger: fine
      { type: 'update', collection: 'assessments', id: 'a-comp-peer', data: { type: 'MANAGER', score: 5 } }, // MANAGER on my report: fine
    ]);
    expect(res.status).toBe(403);
    const { rows } = await query('SELECT data FROM assessments WHERE id = $1', ['a-comp-peer']);
    expect(rows[0].data).toMatchObject({ subjectId: REPORT.id, type: 'PEER', score: 3 });
  });

  it('edits that are fine together still apply together', async () => {
    const tok = await login(BOSS.email, 'compboss-pass');
    const res = await batch(tok, [
      { type: 'update', collection: 'assessments', id: 'a-comp-honest', data: { score: 4 } },
      { type: 'update', collection: 'assessments', id: 'a-comp-honest', data: { type: 'MANAGER' } },
    ]);
    expect(res.status).toBe(200);
    const { rows } = await query('SELECT data FROM assessments WHERE id = $1', ['a-comp-honest']);
    expect(rows[0].data).toMatchObject({ subjectId: REPORT.id, type: 'MANAGER', score: 4 });
  });

  it('an update after a create in the same batch is judged against the created doc', async () => {
    const tok = await login(REPORT.email, 'compreport-pass');
    // Honest: submit, then edit the description — the edit is an update of MY
    // pending record, not a create of a userId-less fragment.
    const ok = await batch(tok, [
      { type: 'set', collection: 'evidences', id: 'e-comp-1', data: { userId: REPORT.id, status: 'PENDING', title: 'Draft' } },
      { type: 'update', collection: 'evidences', id: 'e-comp-1', data: { title: 'Final' } },
    ]);
    expect(ok.status).toBe(200);

    // And the created record is what the verdict rule sees: no self-approval.
    const sneaky = await batch(tok, [
      { type: 'set', collection: 'evidences', id: 'e-comp-2', data: { userId: REPORT.id, status: 'PENDING' } },
      { type: 'update', collection: 'evidences', id: 'e-comp-2', data: { userId: REPORT.id, status: 'APPROVED', assignedScore: 5 } },
    ]);
    expect(sneaky.status).toBe(403);
    const { rows } = await query('SELECT id FROM evidences WHERE id = $1', ['e-comp-2']);
    expect(rows.length).toBe(0);
  });

  it('a delete earlier in the batch is seen by a later op', async () => {
    const tok = await login(REPORT.email, 'compreport-pass');
    await seedDoc('workExperiences', 'we-comp', { userId: REPORT.id, employer: 'Acme', jobTitle: 'Tech', startDate: '2015-01-01', status: 'PENDING' });
    // Withdraw a pending record, then re-create it already VERIFIED: the second
    // op is a CREATE now, and a create may never carry a verdict.
    const res = await batch(tok, [
      { type: 'delete', collection: 'workExperiences', id: 'we-comp' },
      { type: 'set', collection: 'workExperiences', id: 'we-comp', data: { userId: REPORT.id, employer: 'Acme', jobTitle: 'Tech', startDate: '2015-01-01', status: 'VERIFIED' } },
    ]);
    expect(res.status).toBe(403);
    const { rows } = await query('SELECT data FROM "workExperiences" WHERE id = $1', ['we-comp']);
    expect(rows[0].data.status).toBe('PENDING');
  });
});

// R9 — the activity log used to be written by the browser: it chose whether to
// log a change at all, and who and when to say. The server now writes its own
// `audit_log` row in the same transaction as every write, from the session.
describe('the server keeps its own audit log (R9)', () => {
  const AUD = { id: 'aud-emp', email: 'aud@eprom.local' };
  const PDF = `data:application/pdf;base64,${'A'.repeat(4000)}`;

  beforeAll(async () => {
    await seedUser(AUD, 'EMPLOYEE', 'aud-pass', { orgLevel: 'JP' });
  });

  const auditFor = async (collection: string, docId: string) =>
    (await query('SELECT * FROM audit_log WHERE collection = $1 AND doc_id = $2 ORDER BY at', [collection, docId])).rows;

  it('a write through the API leaves a server-written record, attributed to the session', async () => {
    const tok = await login(AUD.email, 'aud-pass');
    const created = await request(app)
      .post('/col/evidences')
      .set('Authorization', `Bearer ${tok}`)
      .send({ id: 'e-aud', data: { userId: AUD.id, status: 'PENDING', title: 'Weld test', fileUrl: PDF } });
    expect(created.status).toBe(201);
    const patched = await request(app)
      .patch('/col/evidences/e-aud')
      .set('Authorization', `Bearer ${tok}`)
      .send({ data: { title: 'Weld test v2' } });
    expect(patched.status).toBe(200);
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const deleted = await request(app).delete('/col/evidences/e-aud').set('Authorization', `Bearer ${adminTok}`);
    expect(deleted.status).toBe(204);

    const rows = await auditFor('evidences', 'e-aud');
    expect(rows.map((r) => r.action)).toEqual(['create', 'update', 'delete']);
    expect(rows.map((r) => r.actor_cid)).toEqual([AUD.id, AUD.id, ADMIN.id]);
    expect(rows[0].actor_email).toBe(AUD.email);
    // Only what changed, before and after.
    expect(rows[1].changes).toEqual({ title: { before: 'Weld test', after: 'Weld test v2' } });
    // The file is described, never copied into the log.
    expect(JSON.stringify(rows[0].changes)).not.toContain('AAAA');
    expect(rows[0].changes.fileUrl.after).toMatch(/^\[file application\/pdf, \d+ chars\]$/);
  });

  it('a batch is audited op by op, and a refused batch leaves no audit rows', async () => {
    const tok = await login(AUD.email, 'aud-pass');
    const ok = await request(app)
      .post('/batch')
      .set('Authorization', `Bearer ${tok}`)
      .send({ operations: [{ type: 'set', collection: 'evidences', id: 'e-aud-b', data: { userId: AUD.id, status: 'PENDING' } }] });
    expect(ok.status).toBe(200);
    expect((await auditFor('evidences', 'e-aud-b')).map((r) => r.action)).toEqual(['create']);

    const refused = await request(app)
      .post('/batch')
      .set('Authorization', `Bearer ${tok}`)
      .send({
        operations: [
          { type: 'set', collection: 'evidences', id: 'e-aud-c', data: { userId: AUD.id, status: 'PENDING' } },
          { type: 'set', collection: 'skills', id: 'sk-aud', data: { name: 'Nope', category: 'Technical' } },
        ],
      });
    expect(refused.status).toBe(403);
    expect(await auditFor('evidences', 'e-aud-c')).toEqual([]);
  });

  it('nobody can edit or delete a log entry through the API, admins included', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const edit = await request(app)
      .patch('/col/activityLogs/log-emp')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ data: { action: 'rewritten' } });
    expect(edit.status).toBe(403);
    const del = await request(app).delete('/col/activityLogs/log-emp').set('Authorization', `Bearer ${adminTok}`);
    expect(del.status).toBe(403);
  });

  it('an admin password reset is audited without the password', async () => {
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const res = await request(app)
      .post('/auth/admin/set-password')
      .set('Authorization', `Bearer ${adminTok}`)
      .send({ userId: AUD.id, newPassword: 'Temp-pass-123' });
    expect(res.status).toBe(200);
    const rows = await auditFor('users', AUD.id);
    const reset = rows.find((r) => r.action === 'set-password');
    expect(reset?.actor_cid).toBe(ADMIN.id);
    expect(JSON.stringify(reset)).not.toContain('Temp-pass-123');
  });

  it('GET /audit is for admin and CEO only, and filters to one record', async () => {
    const empTok = await login(OTHER.email, 'other-pass');
    expect((await request(app).get('/audit').set('Authorization', `Bearer ${empTok}`)).status).toBe(403);

    const ceoTok = await login(CEO.email, 'ceo-pass');
    const res = await request(app)
      .get('/audit?collection=evidences&docId=e-aud')
      .set('Authorization', `Bearer ${ceoTok}`);
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: any) => e.action)).toEqual(['delete', 'update', 'create']);
    expect(res.body.entries[2]).toMatchObject({ actorId: AUD.id, collection: 'evidences', docId: 'e-aud' });

    expect((await request(app).get('/audit?before=yesterday').set('Authorization', `Bearer ${ceoTok}`)).status).toBe(400);
  });

  it('"load older" never skips the rest of a batch cut at a page edge (R9b)', async () => {
    // In Postgres every row one batch writes carries the SAME time (the
    // transaction's start). pg-mem ticks per statement, so stage that directly.
    const at = '2026-10-01T09:00:00.000Z';
    for (const id of ['pg-a', 'pg-b', 'pg-c']) {
      await query(
        `INSERT INTO audit_log (id, at, actor_cid, action, collection, doc_id, changes) VALUES ($1, $2, 'aud-pg', 'create', 'evidences', $1, '{}')`,
        [id, at],
      );
    }
    const adminTok = await login(ADMIN.email, 'admin-pass');
    const get = async (qs: string) => {
      const res = await request(app).get(`/audit?actorId=aud-pg&limit=2${qs}`).set('Authorization', `Bearer ${adminTok}`);
      expect(res.status).toBe(200);
      return res.body;
    };

    const first = await get('');
    expect(first.entries.map((e: any) => e.id)).toEqual(['pg-c', 'pg-b']);
    expect(first.next).toEqual({ beforeId: 'pg-b' });
    // Paging by time alone loses pg-a: it is not older than pg-b, only beside it.
    expect((await get(`&before=${at}`)).entries).toEqual([]);

    const second = await get(`&beforeId=${first.next.beforeId}`);
    expect(second.entries.map((e: any) => e.id)).toEqual(['pg-a']);
    expect(second.next).toBeNull(); // a short page is the end
  });
});
