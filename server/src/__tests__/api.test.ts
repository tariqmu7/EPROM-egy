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

  // Mirrors the shape migrations produce (001 + 002 + 003): document + version +
  // audit columns + timestamps that default. pg-mem doesn't run the .sql
  // migrations, so we declare the columns the route/batch SQL depends on here.
  const cols =
    '(id TEXT PRIMARY KEY, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())';
  for (const t of ['users', 'skills', 'assessments', 'evidences', 'nominations', 'notifications']) {
    await query(`CREATE TABLE ${t} ${cols}`);
  }
  // activityLogs is a camelCase table (quoted, case-sensitive), matching what
  // registry.tableFor('activityLogs') emits.
  await query(`CREATE TABLE "activityLogs" ${cols}`);
  await query(
    'CREATE TABLE auth_credentials (user_id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, must_reset BOOLEAN, updated_at TIMESTAMPTZ, created_at TIMESTAMPTZ)',
  );
  await query(
    'CREATE TABLE tombstones (collection TEXT NOT NULL, id TEXT NOT NULL, deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (collection, id))',
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

  it('a user cannot forge a log entry under another user id, but can log as themselves', async () => {
    const empTok = await login(EMP.email, 'emp-pass');
    const forged = await request(app)
      .post('/col/activityLogs')
      .set('Authorization', `Bearer ${empTok}`)
      .send({ data: { actorId: OTHER.id, action: 'evil', target: 'x', timestamp: new Date().toISOString() } });
    expect(forged.status).toBe(403);

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
          { type: 'set', collection: 'notifications', id: 'n-ok-1', data: { userId: EMP.id, title: 'a', message: 'm', isRead: false } },
          { type: 'set', collection: 'notifications', id: 'n-ok-2', data: { userId: EMP.id, title: 'b', message: 'm', isRead: false } },
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
