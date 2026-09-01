// Low-level HTTP client for the self-hosted CMS API. Holds the JWT (localStorage)
// and attaches it as a Bearer token. Everything else (firestore-compat,
// auth-compat) is built on top of this.

import { newId } from '../utils/uuid';

const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

const TOKEN_KEY = 'eprom_cms_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore storage failures (private mode) */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

// Pull the human-readable part out of the API's error envelope
// (`{ error, message?, issues? }`), if there is one.
function detailOf(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const b = body as { error?: unknown; message?: unknown };
  const parts = [b.error, b.message].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return parts.join(' — ');
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    // Surface the server's own explanation. Without it every rejection reads as
    // a bare "API 422" in the console and the offending field stays invisible.
    super(`API ${status}${detailOf(body) ? `: ${detailOf(body)}` : ''}`);
    this.name = 'ApiError';
  }
}

// The API host was unreachable — the request never got a response. `fetch` rejects
// with a bare `TypeError: Failed to fetch` here, which surfaces verbatim on the
// login screen and tells the user nothing. Name the actual cause instead: the API
// is down, the wrong VITE_API_URL is baked in, or CORS/TLS blocked the call.
export class ApiNetworkError extends Error {
  constructor(public baseUrl: string, public cause?: unknown) {
    super(
      `Cannot reach the API server at ${baseUrl}. Make sure the backend is running ` +
        `(run.bat, or "cd server && npx tsx scripts/serve-local.ts") and that ` +
        `VITE_API_URL points at it.`,
    );
    this.name = 'ApiNetworkError';
  }
}

// A short correlation id per request. The server echoes it back and stamps it on
// every log line for that request, so a failure reported by a user can be traced.
const newRequestId = newId;

// ── The session is dead ──────────────────────────────────────────────────────
// A token can stop working WHILE the app is open: it expires (12h), an admin
// deactivates or archives the account, or a password change retires it. The
// client used to drop the token on a 401 and throw — so React kept rendering a
// signed-in app whose every request failed silently, and the user went on typing
// into a page that could no longer save. Anything that rejects an AUTHENTICATED
// request as "you are not a valid session any more" now ends the session for
// real: auth-compat registers a handler here that clears the user and notifies
// App, which falls back to the login screen with an explanation.
export type SessionEndReason = 'expired' | 'account_not_active' | 'password_changed';

let onSessionInvalid: ((reason: SessionEndReason) => void) | null = null;

export function setSessionInvalidHandler(fn: ((reason: SessionEndReason) => void) | null): void {
  onSessionInvalid = fn;
}

// A 403 is USUALLY an ordinary authorization refusal ("you may not edit that
// user") and must NOT end the session. Only the server's account-level codes do.
function sessionEndReason(status: number, body: unknown): SessionEndReason | null {
  const code = typeof (body as { error?: unknown })?.error === 'string' ? (body as { error: string }).error : '';
  if (status === 403) return code === 'account_not_active' ? 'account_not_active' : null;
  if (status !== 401) return null;
  return code.includes('password change') ? 'password_changed' : 'expired';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'X-Request-Id': newRequestId() };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // Only a transport-level failure lands here; HTTP errors come back as a
    // response and are handled below.
    throw new ApiNetworkError(API_BASE, e);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    // Only a request that CARRIED a token can have its session invalidated. A
    // 401 from /auth/login is a wrong password, not a dead session — firing the
    // handler there would blank the login screen the user is typing into.
    const reason = token ? sessionEndReason(res.status, parsed) : null;
    if (reason) {
      clearToken();
      onSessionInvalid?.(reason);
    }
    throw new ApiError(res.status, parsed);
  }
  return parsed as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
