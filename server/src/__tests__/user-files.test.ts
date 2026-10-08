// Finding R2 of the 8 Oct audit, both halves:
//   1. `/col/users` is the open company directory, and every users document
//      carries the person's certificate SCANS (base64 files) — so any employee
//      could download every colleague's scanned certificates.
//   2. The analytics model and the nightly sweep bulk-loaded whole documents,
//      pulling every scan and evidence file in the company into the api process
//      on any manager's TNA request.
// Own minimal pg-mem harness so fixture drift elsewhere cannot hide a regression.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;
let query: (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

const SCAN = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const CERTS = [
  { id: 'c1', name: 'H2S Awareness', expiryDate: '2030-01-01', fileUrl: SCAN, fileName: 'h2s.png' },
  { id: 'c2', name: 'First Aid', expiryDate: '2030-06-01' },
];

const PASSWORD = 'files-pass';
const ADMIN = { id: 'f-admin', email: 'fadmin@eprom.local' };
const CEO = { id: 'f-ceo', email: 'fceo@eprom.local' };
const BOSS = { id: 'f-boss', email: 'fboss@eprom.local' }; // managerId route
const HEAD = { id: 'f-head', email: 'fhead@eprom.local' }; // runs the section
const OWNER = { id: 'f-owner', email: 'fowner@eprom.local' };
const PEER = { id: 'f-peer', email: 'fpeer@eprom.local' };

async function seedUser(u: { id: string; email: string }, role: string, extra: Record<string, unknown> = {}) {
  const pw = await import('../auth/password.js');
  await query('INSERT INTO users (id, data) VALUES ($1, $2)', [
    u.id,
    { id: u.id, name: u.email, email: u.email, role, status: 'ACTIVE', ...extra },
  ]);
  await query('INSERT INTO auth_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)', [
    u.id,
    u.email,
    await pw.hashPassword(PASSWORD),
  ]);
}

async function tokenFor(u: { email: string }): Promise<string> {
  const res = await request(app).post('/auth/login').send({ email: u.email, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.body.token;
}

function certsOf(doc: { certificates?: unknown }): any[] {
  const c = doc.certificates;
  return typeof c === 'string' ? JSON.parse(c) : (c as any[]);
}

async function ownerAsSeenBy(u: { email: string }) {
  const token = await tokenFor(u);
  const list = await request(app).get('/col/users').set('Authorization', `Bearer ${token}`);
  expect(list.status).toBe(200);
  const fromList = list.body.documents.find((d: any) => d.id === OWNER.id).data;
  const one = await request(app).get(`/col/users/${OWNER.id}`).set('Authorization', `Bearer ${token}`);
  expect(one.status).toBe(200);
  return { fromList, fromOne: one.body.data };
}

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret';
  process.env.BCRYPT_ROUNDS = '4';
  process.env.BOOTSTRAP_ADMIN_EMAIL = '';

  const { newDb } = await import('pg-mem');
  const { Pool } = newDb().adapters.createPg();
  const db = await import('../db.js');
  db.setPool(new Pool() as any);
  query = db.query;

  const cols =
    '(id TEXT PRIMARY KEY, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())';
  for (const t of ['users', 'skills', 'assessments', 'evidences', 'departments']) {
    await query(`CREATE TABLE ${t} ${cols}`);
  }
  for (const t of ['jobProfiles', 'workExperiences', 'appSettings', 'trainingCourses']) {
    await query(`CREATE TABLE "${t}" ${cols}`);
  }
  await query(
    'CREATE TABLE auth_credentials (user_id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, must_reset BOOLEAN, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  await query(
    'CREATE TABLE tombstones (collection TEXT NOT NULL, id TEXT NOT NULL, deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (collection, id))',
  );

  await query('INSERT INTO departments (id, data) VALUES ($1, $2)', [
    'sec-1',
    { id: 'sec-1', name: 'Section One', type: 'SECTION', managerId: HEAD.id },
  ]);
  await seedUser(ADMIN, 'ADMIN');
  await seedUser(CEO, 'CEO');
  await seedUser(BOSS, 'EMPLOYEE', { orgLevel: 'SH' });
  await seedUser(HEAD, 'EMPLOYEE', { orgLevel: 'SH' });
  await seedUser(PEER, 'EMPLOYEE', { orgLevel: 'JP', departmentId: 'sec-1' });
  // Stored the way the SPA writes it: certificates as a JSON STRING.
  await seedUser(OWNER, 'EMPLOYEE', {
    orgLevel: 'JP',
    managerId: BOSS.id,
    departmentId: 'sec-1',
    isArchived: false,
    avatarUrl: SCAN,
    certificates: JSON.stringify(CERTS),
  });
  await query('INSERT INTO evidences (id, data) VALUES ($1, $2)', [
    'ev-1',
    { id: 'ev-1', userId: OWNER.id, skillId: 'sk-1', status: 'APPROVED', assignedScore: 3, fileUrl: SCAN },
  ]);

  const { createApp } = await import('../app.js');
  app = createApp();
});

describe('certificate scans are not part of the open directory (R2)', () => {
  it('a colleague gets the certificate names and dates, but never the scan', async () => {
    const { fromList, fromOne } = await ownerAsSeenBy(PEER);
    for (const doc of [fromList, fromOne]) {
      // Same wire shape as stored — the SPA parses a string.
      expect(typeof doc.certificates).toBe('string');
      const certs = certsOf(doc);
      expect(certs.map((c) => c.name)).toEqual(['H2S Awareness', 'First Aid']);
      expect(certs[0].expiryDate).toBe('2030-01-01');
      expect(certs.some((c) => 'fileUrl' in c)).toBe(false);
      expect(doc.certificates).not.toContain('base64');
    }
  });

  it('the person themselves still gets their own scan', async () => {
    const { fromList, fromOne } = await ownerAsSeenBy(OWNER);
    expect(certsOf(fromList)[0].fileUrl).toBe(SCAN);
    expect(certsOf(fromOne)[0].fileUrl).toBe(SCAN);
  });

  it('their manager (managerId) and their section head (department route) still get it', async () => {
    for (const reader of [BOSS, HEAD]) {
      const { fromList, fromOne } = await ownerAsSeenBy(reader);
      expect(certsOf(fromList)[0].fileUrl).toBe(SCAN);
      expect(certsOf(fromOne)[0].fileUrl).toBe(SCAN);
    }
  });

  it('admin and CEO still get it', async () => {
    for (const reader of [ADMIN, CEO]) {
      const { fromList } = await ownerAsSeenBy(reader);
      expect(certsOf(fromList)[0].fileUrl).toBe(SCAN);
    }
  });

  it('the redacted copy keeps the rest of the profile (the avatar is directory data)', async () => {
    const { fromOne } = await ownerAsSeenBy(PEER);
    expect(fromOne.name).toBe(OWNER.email);
    expect(fromOne.managerId).toBe(BOSS.id);
    expect(fromOne.avatarUrl).toBe(SCAN);
  });
});

describe('bulk loads read fields, not files (R2)', () => {
  it('loadFields returns only the listed fields, with JSON types kept', async () => {
    const { loadFields, USER_FIELDS, EVIDENCE_FIELDS } = await import('../jobs/load.js');
    const users = await loadFields('users', USER_FIELDS);
    const owner = users.find((u) => u.id === OWNER.id)!;
    expect(owner.data).not.toHaveProperty('certificates');
    expect(owner.data).not.toHaveProperty('avatarUrl');
    expect(owner.data.name).toBe(OWNER.email);
    expect(owner.data.isArchived).toBe(false); // a boolean, not the text 'false'

    const [ev] = await loadFields('evidences', EVIDENCE_FIELDS);
    expect(ev.data).not.toHaveProperty('fileUrl');
    expect(ev.data.assignedScore).toBe(3); // a number, not '3'
  });

  it('the analytics model still scores from the trimmed load', async () => {
    const { loadAnalyticsModel } = await import('../analytics/model.js');
    const model = await loadAnalyticsModel();
    expect(model.usersById.get(OWNER.id)?.managerId).toBe(BOSS.id);
    expect(model.index.evidenceScores.get(`${OWNER.id}|sk-1`)).toEqual([3]);
  });

  it('certificateMeta keeps the dates and drops the scan', async () => {
    const { certificateMeta } = await import('../jobs/load.js');
    expect(certificateMeta(CERTS[0])).toEqual({
      id: 'c1',
      name: 'H2S Awareness',
      expiryDate: '2030-01-01',
      fileName: 'h2s.png',
    });
  });
});
