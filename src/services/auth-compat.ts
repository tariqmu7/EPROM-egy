// ============================================================================
// Firebase-Auth-compatible shim over the self-hosted /auth API.
//
// Provides the subset of `firebase/auth` that store.ts + App.tsx use:
//   signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
//   onAuthStateChanged.
//
// There is deliberately NO sendPasswordResetEmail: reset-by-email was never
// finished (no SMTP relay, no redeem endpoint) and was removed. A forgotten
// password is reset by an admin from Admin → Employees, which forces a change
// at next login.
//
// NOTE ON SIGN-UP: Firebase's createUserWithEmailAndPassword also *signs the
// new user in*, and store.ts then writes the users/{uid} document itself. Our
// API creates the user document server-side during /auth/signup and returns
// PENDING (no session). So store.ts's signUp() needs a small rewrite — see
// PHASE3_FRONTEND_SWAP.md. The compat below returns the created id so the
// rewrite is minimal.
// ============================================================================
import { api, getToken, setToken, clearToken } from './api-client';

export interface ProviderInfo {
  providerId: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface CompatUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  // Firebase-User fields store.ts reads for error diagnostics. In the
  // self-hosted world there is a single credential provider and no anonymous
  // or multi-tenant auth, so these carry constant values.
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: ProviderInfo[];
}

export interface UserCredential {
  user: CompatUser;
}

let currentUser: CompatUser | null = null;

// Auth handle passed around by store.ts / App.tsx. `currentUser` mirrors
// firebase/auth's `auth.currentUser`, resolved from the JWT session and kept in
// sync by signIn/signOut/resolveSession below.
export const compatAuth = {
  __eprom: 'auth' as const,
  get currentUser(): CompatUser | null {
    return currentUser;
  },
};

// Builds a full CompatUser from the minimal fields the API returns.
function mkUser(id: string, email: string | null): CompatUser {
  return { uid: id, email, emailVerified: true, isAnonymous: false, tenantId: null, providerData: [] };
}
const listeners = new Set<(u: CompatUser | null) => void>();
let initialized = false;

function notify() {
  for (const cb of listeners) {
    try {
      cb(currentUser);
    } catch (e) {
      console.error('auth listener threw', e);
    }
  }
}

async function resolveSession(): Promise<void> {
  const token = getToken();
  if (!token) {
    currentUser = null;
    return;
  }
  try {
    const res = await api.get<{ user: { id: string; email?: string }; mustReset?: boolean }>('/auth/me');
    mustResetPassword = !!res.mustReset;
    currentUser = mkUser(res.user.id, res.user.email ?? null);
  } catch {
    clearToken();
    currentUser = null;
  }
}

// True when the last login used an admin-issued temporary password. The app
// must force a password change before letting the session proceed. Cleared by
// changePassword() and by signOut().
let mustResetPassword = false;

export function isPasswordResetRequired(): boolean {
  return mustResetPassword;
}

export async function signInWithEmailAndPassword(
  _auth: unknown,
  email: string,
  password: string,
): Promise<UserCredential> {
  const res = await api.post<{ token: string; user: { id: string; email?: string }; mustReset?: boolean }>(
    '/auth/login',
    { email, password },
  );
  setToken(res.token);
  mustResetPassword = !!res.mustReset;
  currentUser = mkUser(res.user.id, res.user.email ?? email);
  notify();
  return { user: currentUser };
}

// Self-service password change. `currentPassword` is optional only while the
// account is in the forced-reset state (the server enforces this, not us).
export async function changePassword(newPassword: string, currentPassword?: string): Promise<void> {
  await api.post('/auth/change-password', { newPassword, currentPassword });
  mustResetPassword = false;
}

// ADMIN-only: stamp a temporary password onto another user's account. The
// server flags it must_reset, so that user is forced to choose a new one at
// their next sign-in.
export async function adminSetPassword(userId: string, newPassword: string): Promise<void> {
  await api.post('/auth/admin/set-password', { userId, newPassword });
}

// ADMIN-only: give a deleted employee's sign-in back to the pool. Deletes their
// password and frees their email address for reuse; the archived profile itself
// stays for history. Called by DataService.removeUser after the archive commits.
export async function releaseUserLogin(userId: string): Promise<string | null> {
  const res = await api.post<{ emailReleased?: string | null }>('/auth/admin/release-login', { userId });
  return res?.emailReleased ?? null;
}

// Public server config for the login screen. Only tells the UI whether to offer
// the sign-up form; the server still enforces the rule on /auth/signup. Falls
// back to "off" if the API can't be reached — never advertise a form that fails.
export async function fetchAuthConfig(): Promise<{ allowSignup: boolean }> {
  try {
    const res = await api.get<{ allowSignup?: boolean }>('/auth/config');
    return { allowSignup: !!res?.allowSignup };
  } catch {
    return { allowSignup: false };
  }
}

// Signs up a PENDING user. Does NOT establish a session (mirrors the app's
// pending-approval flow). Returns the new user id as `uid` for store.ts.
export async function createUserWithEmailAndPassword(
  _auth: unknown,
  email: string,
  password: string,
  name?: string,
): Promise<UserCredential> {
  const res = await api.post<{ pending: boolean; id?: string }>('/auth/signup', {
    email,
    password,
    name: name ?? email,
  });
  return {
    user: { uid: res.id ?? '', email, emailVerified: false, isAnonymous: false, tenantId: null, providerData: [] },
  };
}

export async function signOut(_auth?: unknown): Promise<void> {
  clearToken();
  currentUser = null;
  mustResetPassword = false;
  notify();
}

// Firebase-style listener. Resolves the current session once on first call,
// then invokes cb on every future auth change. Returns an unsubscribe fn.
export function onAuthStateChanged(_auth: unknown, cb: (user: CompatUser | null) => void): () => void {
  listeners.add(cb);
  if (!initialized) {
    initialized = true;
    void resolveSession().then(() => notify());
  } else {
    // Late subscriber — give it the current state immediately.
    cb(currentUser);
  }
  return () => listeners.delete(cb);
}

export function getCurrentUser(): CompatUser | null {
  return currentUser;
}
