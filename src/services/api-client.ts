// Low-level HTTP client for the self-hosted CMS API. Holds the JWT (localStorage)
// and attaches it as a Bearer token. Everything else (firestore-compat,
// auth-compat) is built on top of this.

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

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
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
function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
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
    // An expired/invalid token: drop it so the app falls back to the login screen.
    if (res.status === 401) clearToken();
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
