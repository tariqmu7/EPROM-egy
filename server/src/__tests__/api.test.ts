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
  process.env.BOOTSTRAP_ADMIN_EMAIL = '';

  const { newDb } = await import('pg-mem');
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const db = await import('../db.js');
  db.setPool(new Pool() as any);
  query = db.query;

  const cols = '(id TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ, created_at TIMESTAMPTZ)';
  for (const t of ['users', 'skills', 'assessments', 'evidences', 'nominations', 'notifications']) {
    await query(`CREATE TABLE ${t} ${cols}`);
  }
  await query(
    'CREATE TABLE auth_credentials (user_id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, must_reset BOOLEAN, updated_at TIMESTAMPTZ, created_at TIMESTAMPTZ)',
  );

  await seedUser(ADMIN, 'ADMIN', 'admin-pass');
  await seedUser(EMP, 'EMPLOYEE', 'emp-pass', { managerId: 'mgr-x', orgLevel: 'JP' });
  await seedUser(OTHER, 'EMPLOYEE', 'other-pass');
  await seedUser(CEO, 'CEO', 'ceo-pass');

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

  const { createApp } = await import('../app.js');
  app = createApp();
});

async function seedDoc(table: string, id: string, data: Record<string, unknown>) {
  await query(`INSERT INTO ${table} (id, data) VALUES ($1, $2)`, [id, { id, ...data }]);
}

function idsOf(res: { body: { documents: { id: string }[] } }): string[] {
  return res.body.documents.map((d) => d.id);
}

describe('health + auth', () => {
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
      .send({ data: { raterId: EMP.id, subjectId: OTHER.id, skillId: 'skill-1', score: 4 } });
    expect(mine.status).toBe(201);

    const forged = await request(app)
      .post('/col/assessments')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { raterId: OTHER.id, subjectId: EMP.id, skillId: 'skill-1', score: 5 } });
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
