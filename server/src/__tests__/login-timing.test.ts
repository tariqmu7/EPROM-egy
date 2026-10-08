// Finding R8 of the 8 Oct audit: /auth/login answered "invalid email or
// password" for both an unknown address and a wrong password, but an unknown
// address skipped bcrypt and came back ~a quarter-second sooner — so the
// response TIME said which emails have an account. Every failed login must now
// cost exactly one bcrypt compare, whatever the reason it failed.
// Timing itself is too noisy to assert on, so the test counts the compares.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

let app: any;
let query: (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

const PASSWORD = 'timing-pass';
const KNOWN = { id: 't-known', email: 'tknown@eprom.local' };
const NO_HASH = { id: 't-nohash', email: 'tnohash@eprom.local' };

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
  const pw = await import('../auth/password.js');
  for (const [u, hash] of [
    [KNOWN, await pw.hashPassword(PASSWORD)],
    [NO_HASH, null],
  ] as const) {
    await query('INSERT INTO users (id, data) VALUES ($1, $2)', [
      u.id,
      { id: u.id, name: u.email, email: u.email, role: 'EMPLOYEE', status: 'ACTIVE' },
    ]);
    await query('INSERT INTO auth_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)', [u.id, u.email, hash]);
  }

  const { createApp } = await import('../app.js');
  app = createApp();
});

afterEach(() => vi.restoreAllMocks());

async function comparesFor(email: string, password: string): Promise<{ status: number; compares: number }> {
  const spy = vi.spyOn(bcrypt, 'compare');
  const res = await request(app).post('/auth/login').send({ email, password });
  const compares = spy.mock.calls.length;
  spy.mockRestore();
  return { status: res.status, compares };
}

describe('login does not reveal which emails exist (R8)', () => {
  it('an unknown email costs the same bcrypt compare as a wrong password', async () => {
    const wrong = await comparesFor(KNOWN.email, 'not-the-password');
    const unknown = await comparesFor('nobody-here@eprom.local', 'not-the-password');
    expect(wrong).toEqual({ status: 401, compares: 1 });
    expect(unknown).toEqual({ status: 401, compares: 1 });
  });

  it('a credential with no password hash is refused at the same cost', async () => {
    expect(await comparesFor(NO_HASH.email, 'anything')).toEqual({ status: 401, compares: 1 });
  });

  it('the dummy compare never lets anyone in, whatever the password', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nobody-here@eprom.local', password: 'no-such-account' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid email or password');
  });

  it('the right password still logs in', async () => {
    const res = await request(app).post('/auth/login').send({ email: KNOWN.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});
