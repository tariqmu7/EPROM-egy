// Finding R4 of the 8 Oct audit: `/auth/change-password` had no rate limit, so
// a stolen or borrowed session could guess the current password without end
// (turning a 12-hour token into the account for good), and every guess was a
// bcrypt compare on the api's only thread. Login was limited per IP, but nothing
// bounded the SUM of password work across callers.
// Own minimal pg-mem harness, with the auth limiters switched ON for this app.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

let app: any;
let query: (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

const PASSWORD = 'limits-pass';
const GUESSER = { id: 'l-guess', email: 'lguess@eprom.local' };
const BYSTANDER = { id: 'l-other', email: 'lother@eprom.local' };

async function seedUser(u: { id: string; email: string }) {
  const pw = await import('../auth/password.js');
  await query('INSERT INTO users (id, data) VALUES ($1, $2)', [
    u.id,
    { id: u.id, name: u.email, email: u.email, role: 'EMPLOYEE', status: 'ACTIVE' },
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

  await query(
    'CREATE TABLE users (id TEXT PRIMARY KEY, data JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  await query(
    'CREATE TABLE auth_credentials (user_id TEXT PRIMARY KEY, email TEXT, password_hash TEXT, must_reset BOOLEAN, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  await seedUser(GUESSER);
  await seedUser(BYSTANDER);

  const { createApp } = await import('../app.js');
  app = createApp({ authRateLimits: true });
});

describe('change-password is rate limited per account (R4)', () => {
  it('stops guessing the current password after 10 tries — even the right one is refused', async () => {
    const token = await tokenFor(GUESSER);
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: `guess-${i}`, newPassword: 'new-password-1' });
      expect(res.status).toBe(403);
    }
    const blocked = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'new-password-1' });
    expect(blocked.status).toBe(429);
    // Nothing changed: the original password still logs in.
    await tokenFor(GUESSER);
  });

  it('the limit is that account’s alone — a colleague can still change theirs', async () => {
    const token = await tokenFor(BYSTANDER);
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: PASSWORD, newPassword: 'bystander-new-1' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });
});

describe('oversized passwords are refused before any hashing (R4)', () => {
  const huge = 'x'.repeat(10_000);

  it('at login', async () => {
    const res = await request(app).post('/auth/login').send({ email: BYSTANDER.email, password: huge });
    expect(res.status).toBe(400);
  });

  it('at change-password', async () => {
    const login = await request(app).post('/auth/login').send({ email: BYSTANDER.email, password: 'bystander-new-1' });
    expect(login.status).toBe(200);
    const res = await request(app)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ currentPassword: 'bystander-new-1', newPassword: huge });
    expect(res.status).toBe(400);
  });
});

describe('the server never runs unbounded password work at once (R4)', () => {
  it('queues a burst up to its limit and refuses the rest outright', async () => {
    const pw = await import('../auth/password.js');
    const burst = await Promise.allSettled(Array.from({ length: 80 }, () => pw.hashPassword('burst-pass')));
    const refused = burst.filter((r) => r.status === 'rejected');
    // 4 running + 64 waiting are served; the other 12 are turned away at once.
    expect(burst.filter((r) => r.status === 'fulfilled')).toHaveLength(68);
    expect(refused).toHaveLength(12);
    for (const r of refused) expect((r as PromiseRejectedResult).reason).toBeInstanceOf(pw.PasswordBusyError);
    // And the gate drains: the next call is served normally.
    expect(await pw.verifyPassword('burst-pass', await pw.hashPassword('burst-pass'))).toBe(true);
  });
});
