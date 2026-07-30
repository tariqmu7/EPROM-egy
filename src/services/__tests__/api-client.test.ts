import { describe, it, expect, vi } from 'vitest';
import { api, ApiError, ApiNetworkError } from '../api-client';

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
