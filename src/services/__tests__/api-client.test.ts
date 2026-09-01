import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  api,
  ApiError,
  ApiNetworkError,
  clearToken,
  getToken,
  setToken,
  setSessionInvalidHandler,
} from '../api-client';

// A dead backend used to reach the login screen as the browser's bare
// "Failed to fetch". These pin the two failure shapes apart: no response at all
// (ApiNetworkError, actionable) vs. a response carrying an HTTP error (ApiError).
describe('network failure surfacing', () => {
  it('wraps a fetch rejection in an actionable ApiNetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await api.post('/auth/login', { email: 'a@b.c' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiNetworkError);
    expect((err as ApiNetworkError).message).toContain('Cannot reach the API server');
    expect((err as ApiNetworkError).message).not.toBe('Failed to fetch');
  });

  it('still throws ApiError (not ApiNetworkError) on an HTTP error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 }),
      ),
    );
    const err = await api.post('/auth/login', { email: 'a@b.c' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(ApiNetworkError);
    expect((err as ApiError).status).toBe(401);
  });
});

// ── A dead session must END the session ─────────────────────────────────────
// Before this, a 401 mid-session only dropped the token and threw: React went on
// rendering a signed-in app whose every request failed, so the user kept working
// on a page that could no longer save anything. These pin the rule that decides
// when a rejection means "you are not a session any more" — and, just as
// importantly, when it does not.
describe('session invalidation', () => {
  const reply = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));

  beforeEach(() => {
    setToken('a-token');
  });
  afterEach(() => {
    setSessionInvalidHandler(null);
    clearToken();
    vi.unstubAllGlobals();
  });

  it('ends the session and drops the token on a 401', async () => {
    const seen: string[] = [];
    setSessionInvalidHandler((r) => seen.push(r));
    reply(401, { error: 'invalid or expired token' });

    await api.get('/auth/me').catch(() => {});
    expect(seen).toEqual(['expired']);
    expect(getToken()).toBeNull();
  });

  it('names a password change as the reason, so the user can be told', async () => {
    const seen: string[] = [];
    setSessionInvalidHandler((r) => seen.push(r));
    reply(401, { error: 'session ended by a password change' });

    await api.get('/auth/me').catch(() => {});
    expect(seen).toEqual(['password_changed']);
  });

  it('ends the session on a deactivated account (403 account_not_active)', async () => {
    const seen: string[] = [];
    setSessionInvalidHandler((r) => seen.push(r));
    reply(403, { error: 'account_not_active', status: 'REJECTED' });

    await api.get('/auth/me').catch(() => {});
    expect(seen).toEqual(['account_not_active']);
    expect(getToken()).toBeNull();
  });

  // The one that matters most: 403 is the everyday answer to "you may not edit
  // that user". Signing people out on it would make the app unusable.
  it('leaves the session alone on an ordinary permission refusal', async () => {
    const seen: string[] = [];
    setSessionInvalidHandler((r) => seen.push(r));
    reply(403, { error: 'forbidden' });

    await api.patch('/col/users/someone-else', { name: 'x' }).catch(() => {});
    expect(seen).toEqual([]);
    expect(getToken()).toBe('a-token');
  });

  // A wrong password at the login screen is a 401 with no token on the request.
  // Firing the handler there would blank the form the user is typing into.
  it('ignores a 401 on an unauthenticated request', async () => {
    clearToken();
    const seen: string[] = [];
    setSessionInvalidHandler((r) => seen.push(r));
    reply(401, { error: 'invalid email or password' });

    await api.post('/auth/login', { email: 'a@b.c', password: 'nope' }).catch(() => {});
    expect(seen).toEqual([]);
  });
});
