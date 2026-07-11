# Phase 3 — Frontend Data-Access Swap (integration guide)

This wires the React app to the self-hosted API instead of Firebase. The compat
modules are already built and typecheck against the app:

- `services/api-client.ts` — fetch client + JWT storage
- `services/firestore-compat.ts` — drop-in for `firebase/firestore` (onSnapshot → polling)
- `services/auth-compat.ts` — drop-in for `firebase/auth`

**Do not flip these on until the API + Postgres are running** (locally via Docker
or on the VM). Then follow the steps below and run the checklist.

---

## Step 1 — choose an integration style

### Option A — Vite alias (zero churn to store.ts)
In `vite.config.ts`:
```ts
resolve: {
  alias: {
    'firebase/firestore': path.resolve(__dirname, 'services/firestore-compat.ts'),
    'firebase/auth': path.resolve(__dirname, 'services/auth-compat.ts'),
  },
},
```
Replace `firebase.ts` with:
```ts
export { compatDb as db } from './services/firestore-compat';
export { compatAuth as auth } from './services/auth-compat';
```
Nothing else changes. Add the same aliases to `tsconfig.json` `paths` so `tsc` resolves them.

### Option B — explicit import edits (recommended: clearer, only ~4 files)
| File | Change |
|---|---|
| `services/store.ts` | `from 'firebase/firestore'` → `from './firestore-compat'` |
| `services/store.ts` | `from 'firebase/auth'` → `from './auth-compat'` |
| `services/store.ts` | `import { db, auth } from '../firebase'` → `import { compatDb as db } from './firestore-compat'; import { compatAuth as auth } from './auth-compat';` |
| `App.tsx` | `from './firebase'` + `from 'firebase/auth'` → `from './services/auth-compat'` |
| `pages/EmployeeDashboard.tsx` | `import { auth } from '../firebase'` → `import { compatAuth as auth } from '../services/auth-compat'` (then verify how `auth` is used — see Step 3) |

---

## Step 2 — rewrite `signUp` (the one method that genuinely differs)

Firebase's `createUserWithEmailAndPassword` **signs the new user in**, and
`store.ts` then writes `users/{uid}` itself. Our API creates the user document
server-side during `/auth/signup` and returns PENDING (no session). So the
`persistItem('users', ...)` inside `signUp` would run **unauthenticated → 401**.

Replace the body of `DataService.signUp` (services/store.ts ~L1103) with a call
that hands the profile to the server:

```ts
async signUp(email: string, password: string, userData: Partial<User>) {
  const trimmedEmail = email.trim().toLowerCase();
  try {
    // The API creates the PENDING users document + credentials in one step.
    const cred = await createUserWithEmailAndPassword(
      auth, trimmedEmail, password, userData.name,
    );
    return { user: { id: cred.user.uid, email: trimmedEmail, name: userData.name ?? '', status: 'PENDING' } as User };
  } catch (error: any) {
    return { error: error?.body?.error ?? error?.message ?? 'sign-up failed' };
  }
}
```

To carry extra profile fields (department, etc.) at signup, extend `auth-compat`'s
`createUserWithEmailAndPassword` to pass a `profile` object and forward it in the
`/auth/signup` body (the API already accepts `profile`).

> The **bulk-upload "existing profile" merge** (matching a pre-seeded user by
> email) should move server-side: have `/auth/signup` link to an existing user
> row when the email already exists as a PENDING/ACTIVE record. Track as a
> follow-up; not needed for a clean re-seed.

`loginWithPassword`, `signOut`, `resetPassword`, and the `onAuthStateChanged`
bootstrap in `App.tsx` need **no logic change** — the compat matches their
signatures. Bonus: `cred.user.uid === users.id` always now (JWT `sub` = doc id),
which removes the Firebase uid-vs-docId mismatch noted in the migration history.

---

## Step 3 — check direct `auth` usage in EmployeeDashboard

`pages/EmployeeDashboard.tsx` imports `auth` directly. If it reads
`auth.currentUser`, replace with `getCurrentUser()` from `auth-compat`. Grep the
file for `auth.` after swapping the import and adjust.

---

## Step 4 — polling & refresh

`onSnapshot` now polls every `VITE_POLL_INTERVAL_MS` (default 20s). The store's
existing `subscribe()` / `useSyncExternalStore` layer is untouched, so components
re-render exactly as before — just on a poll cadence instead of live pushes.

- Tune the interval via `.env` (`VITE_POLL_INTERVAL_MS`).
- Optional: add a **Refresh** button that calls the store's re-init to force an
  immediate poll on heavy admin/CEO dashboards.

---

## Step 5 — env + cleanup

- Add `VITE_API_URL` to `.env.local` (e.g. `http://localhost:4000`) and
  `.env.production` (e.g. `/api` when nginx proxies same-origin).
- Remove the Firebase build steps once cutover is confirmed: drop `rules:build`
  from the deploy pipeline, repurpose the `CONFIG.SOURCE` guard, and finally
  `npm remove firebase` + delete the old `.env` `VITE_FIREBASE_*` keys.

---

## Step 6 — runtime test checklist (run once API + Postgres are up)

- [ ] `npm run typecheck` clean (already passing with compat modules present)
- [ ] Log in as admin → dashboards populate within one poll interval
- [ ] Create a skill as admin → appears; as employee → blocked
- [ ] Employee submits evidence → manager sees it → approves → score updates
- [ ] 360° assessment saved; only own rater records editable
- [ ] Notifications show only the logged-in user's
- [ ] Sign out clears the session and returns to the login screen
- [ ] Password reset (admin-set temp password) → forced change on next login
