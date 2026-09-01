// The eight authorization holes found by the 1 Sep 2026 review, kept as a
// permanent regression suite.
//
// This started life as a throw-away probe: it logged in as a real employee and
// attacked the real Express app over pg-mem, and ALL EIGHT attacks succeeded
// (200/201/204 where 403 was wanted). Tasks 4a-4c closed them. The probe now
// lives here with its assertions kept as the contract says they must be —
// every attack refused — so a future edit to `authz.ts` cannot quietly
// re-open one.
//
// It is deliberately SEPARATE from api.test.ts and deliberately minimal: its
// own tiny harness (four users, no seeded documents), so it keeps proving the
// holes are shut even if the big suite's fixtures drift. The detailed
// behaviour of each rule — the honest paths that must still work, the
// clearing-a-verdict case, the /batch back doors — is pinned in api.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;
let query: (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

// The recovery address BOOTSTRAP_ADMIN_EMAIL points at. Nobody is seeded with
// it — H2 was an employee claiming it in their own users document.
const BOOTSTRAP_EMAIL = 'rescue@eprom.local';

async function seedUser(id: string, email: string, role: string, password: string, extra: any = {}) {
  const pw = await import('../auth/password.js');
  await query('INSERT INTO users (id, data) VALUES ($1, $2)', [
    id,
    { id, name: email, email, role, status: 'ACTIVE', ...extra },
  ]);
  await query('INSERT INTO auth_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)', [
    id,
    email,
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
  process.env.BOOTSTRAP_ADMIN_EMAIL = BOOTSTRAP_EMAIL;

  const { newDb } = await import('pg-mem');
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  const db = await import('../db.js');
  db.setPool(new Pool() as any);
  query = db.query;

  // Same hand-built schema as api.test.ts (pg-mem does not run the .sql
  // migrations). `departments` is needed because supervises() resolves
  // section/department ownership as well as the managerId chain.
  const cols =
    '(id TEXT PRIMARY KEY, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())';
  for (const t of ['users', 'skills', 'assessments', 'evidences', 'nominations', 'notifications', 'departments']) {
    await query(`CREATE TABLE ${t} ${cols}`);
  }
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

  await seedUser('emp-1', 'emp@eprom.local', 'EMPLOYEE', 'emp-pass', { orgLevel: 'JP', managerId: 'mgr-1' });
  await seedUser('mgr-1', 'mgr@eprom.local', 'EMPLOYEE', 'mgr-pass', { orgLevel: 'SH' });
  await seedUser('ceo-1', 'ceo@eprom.local', 'CEO', 'ceo-pass', { orgLevel: 'CEO' });
  await seedUser('other-1', 'other@eprom.local', 'EMPLOYEE', 'other-pass', { orgLevel: 'JP' });

  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('the eight authorization holes stay closed', () => {
  it('H1 — an employee cannot raise their own org level', async () => {
    const t = await login('emp@eprom.local', 'emp-pass');
    const r = await request(app)
      .patch('/col/users/emp-1')
      .set('Authorization', `Bearer ${t}`)
      .send({ data: { orgLevel: 'GM' } });
    expect(r.status).toBe(403);
    expect((await query('SELECT data FROM users WHERE id = $1', ['emp-1'])).rows[0].data.orgLevel).toBe('JP');
  });

  it('H2 — an employee cannot take the bootstrap admin address', async () => {
    const t = await login('emp@eprom.local', 'emp-pass');
    const r = await request(app)
      .patch('/col/users/emp-1')
      .set('Authorization', `Bearer ${t}`)
      .send({ data: { email: BOOTSTRAP_EMAIL } });
    expect(r.status).toBe(403);
  });

  it('H3 — a manager-level user cannot edit a stranger, nor the CEO', async () => {
    const t = await login('mgr@eprom.local', 'mgr-pass'); // orgLevel SH, manages nobody here
    const stranger = await request(app)
      .patch('/col/users/other-1')
      .set('Authorization', `Bearer ${t}`)
      .send({ data: { status: 'REJECTED', managerId: 'mgr-1' } });
    expect(stranger.status).toBe(403);

    const boss = await request(app)
      .patch('/col/users/ceo-1')
      .set('Authorization', `Bearer ${t}`)
      .send({ data: { status: 'REJECTED' } });
    expect(boss.status).toBe(403);
  });

  it('H4 — an employee cannot self-approve evidence and score it', async () => {
    const t = await login('emp@eprom.local', 'emp-pass');
    const r = await request(app)
      .post('/col/evidences')
      .set('Authorization', `Bearer ${t}`)
      .send({ id: 'ev-x', data: { userId: 'emp-1', skillId: 's1', status: 'APPROVED', assignedScore: 5 } });
    expect(r.status).toBe(403);
  });

  it('H5 — an employee cannot self-verify work experience', async () => {
    const t = await login('emp@eprom.local', 'emp-pass');
    const r = await request(app)
      .post('/col/workExperiences')
      .set('Authorization', `Bearer ${t}`)
      .send({
        id: 'we-x',
        data: {
          userId: 'emp-1',
          employer: 'X',
          jobTitle: 'Y',
          startDate: '2010-01-01',
          status: 'VERIFIED',
          skills: [{ skillId: 's1', verifiedLevel: 5 }],
        },
      });
    expect(r.status).toBe(403);
  });

  it('H6 — an employee cannot write a manager-grade assessment of themselves', async () => {
    const t = await login('emp@eprom.local', 'emp-pass');
    const r = await request(app)
      .post('/col/assessments')
      .set('Authorization', `Bearer ${t}`)
      .send({ id: 'as-x', data: { subjectId: 'emp-1', raterId: 'emp-1', skillId: 's1', score: 5, type: 'MANAGER' } });
    expect(r.status).toBe(403);
  });

  it('H7 — an employee cannot send a notification in the system voice', async () => {
    const t = await login('emp@eprom.local', 'emp-pass');
    const r = await request(app)
      .post('/col/notifications')
      .set('Authorization', `Bearer ${t}`)
      .send({ id: 'n-x', data: { userId: 'other-1', message: 'spoof' } });
    expect(r.status).toBe(403);
  });

  it('H8 — an employee cannot delete their own user document', async () => {
    const t = await login('emp@eprom.local', 'emp-pass');
    const r = await request(app).delete('/col/users/emp-1').set('Authorization', `Bearer ${t}`);
    expect(r.status).toBe(403);
    expect((await query('SELECT 1 FROM users WHERE id = $1', ['emp-1'])).rows.length).toBe(1);
  });
});
