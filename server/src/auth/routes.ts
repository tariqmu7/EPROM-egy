import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { hashPassword, verifyPassword, MAX_PASSWORD_LENGTH } from './password.js';
import { signToken } from './jwt.js';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../authz.js';

// Brute-force protection on auth endpoints. Off by default under test so the
// suite's many logins aren't throttled (mirrors the global limiter in app.ts);
// a test that is ABOUT the limits turns them on with `rateLimits: true`.
type Middleware = (req: Request, res: Response, next: (e?: unknown) => void) => void;
const passThrough: Middleware = (_req, _res, next) => next();

function makeLimiters(enabled: boolean): { login: Middleware; changePassword: Middleware } {
  if (!enabled) return { login: passThrough, changePassword: passThrough };
  return {
    // Per IP per 15 min — blunt brute-force protection for the public forms.
    login: rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }),
    // Per ACCOUNT, not per IP. The route sits behind `authenticate`, so the
    // caller is known — and the threat is a stolen or borrowed session guessing
    // the current password (which turns a 12-hour token into the account for
    // good), from as many machines as it likes. Every attempt counts, success
    // too: a forced-reset account skips the current-password check, so each
    // call would otherwise be a free bcrypt hash on demand.
    changePassword: rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => `user:${req.user!.id}`,
      message: { error: 'too many password attempts — try again in 15 minutes' },
    }),
  };
}

const emailSchema = z.string().email().transform((s) => s.trim().toLowerCase());

const passwordSchema = z.string().max(MAX_PASSWORD_LENGTH, `password must be at most ${MAX_PASSWORD_LENGTH} characters`);

export function authRouter(opts: { rateLimits?: boolean } = {}): Router {
  const router = Router();
  const limit = makeLimiters(opts.rateLimits ?? process.env.NODE_ENV !== 'test');

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  router.post('/login', limit.login, async (req: Request, res: Response, next) => {
    try {
      const parsed = z.object({ email: emailSchema, password: passwordSchema.min(1) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'email and password required' });
        return;
      }
      const { email, password } = parsed.data;

      const cred = (
        await query('SELECT user_id, password_hash, must_reset FROM auth_credentials WHERE lower(email) = $1', [email])
      ).rows[0];

      // Constant-ish response: never reveal whether the email exists.
      if (!cred || !(await verifyPassword(password, cred.password_hash))) {
        res.status(401).json({ error: 'invalid email or password' });
        return;
      }

      const userRow = (await query('SELECT id, data FROM users WHERE id = $1', [cred.user_id])).rows[0];
      if (!userRow) {
        res.status(401).json({ error: 'invalid email or password' });
        return;
      }
      const data = userRow.data as Record<string, any>;
      // A deleted (archived) employee must never get back in, even if a
      // credential survived — e.g. a profile archived before /admin/release-login
      // existed, or one restored from an older backup. Reported as
      // `account_not_active` so this doesn't become an is-this-person-here probe.
      if (data.isArchived) {
        res.status(403).json({ error: 'account_not_active', status: 'ARCHIVED' });
        return;
      }
      if (data.status && data.status !== 'ACTIVE') {
        res.status(403).json({ error: 'account_not_active', status: data.status });
        return;
      }

      const token = signToken({ sub: userRow.id, email: String(data.email ?? email) });
      res.json({ token, user: { id: userRow.id, ...data }, mustReset: !!cred.must_reset });
    } catch (e) {
      next(e);
    }
  });

  // ── PUBLIC CONFIG ─────────────────────────────────────────────────────────
  // Lets the SPA hide the sign-up form when self-registration is off, instead of
  // offering a form that can only ever fail with 403. The server remains the
  // enforcement point — this is presentation only.
  router.get('/config', (_req: Request, res: Response) => {
    res.json({ allowSignup: config.allowSignup });
  });

  // ── SIGNUP (self-registration → PENDING, needs admin approval) ─────────────
  // The new users document is built from email + name and NOTHING else the
  // caller sends. This route writes straight to SQL, so neither the zod schemas
  // nor the protected-field rule in authz.ts ever see it: an accepted extra
  // field (an old `profile` blob was spread in here) would let a stranger
  // arrive already holding an orgLevel, a managerId, a jobProfileId or an
  // unchecked file URL. Placement in the org chart is an admin's job, done
  // when the account is approved. Unknown keys are stripped by zod.
  router.post('/signup', limit.login, async (req: Request, res: Response, next) => {
    try {
      const parsed = z
        .object({
          email: emailSchema,
          password: passwordSchema.min(8, 'password must be at least 8 characters'),
          name: z.string().trim().min(1, 'name is required').max(200, 'name must be at most 200 characters'),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid input' });
        return;
      }
      const { email, password, name } = parsed.data;

      // Self-registration off: only the configured bootstrap admin may still
      // claim their account (first-run / recovery), everyone else is created by
      // an admin. Checked after parsing so the exemption can look at the email.
      if (!config.allowSignup && (!config.bootstrapAdminEmail || email !== config.bootstrapAdminEmail)) {
        res.status(403).json({ error: 'Self-registration is disabled. Ask your administrator for an account.' });
        return;
      }

      // A credential already means this email has finished signing up before.
      const credExists =
        (await query('SELECT 1 FROM auth_credentials WHERE lower(email) = $1', [email])).rows.length > 0;
      if (credExists) {
        res.status(409).json({ error: 'email already registered' });
        return;
      }

      // An email can already own a users row WITHOUT a credential: profiles
      // imported from Firebase (Firebase Auth was not migrated) or seeded via
      // bulk upload. First-time sign-up must LINK the password onto that
      // existing profile — inserting a second users row would violate the
      // unique email index (idx_users_email) and 500. Either way the account
      // lands in the approval queue (PENDING) so an admin confirms the person
      // before granting access.
      const existing = (await query("SELECT id FROM users WHERE lower(data->>'email') = $1", [email])).rows[0];
      const passwordHash = await hashPassword(password);

      const id = await withTransaction(async (tx) => {
        if (existing) {
          const uid = existing.id as string;
          await tx(`UPDATE users SET data = data || '{"status":"PENDING"}'::jsonb, updated_at = now() WHERE id = $1`, [
            uid,
          ]);
          await tx('INSERT INTO auth_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)', [
            uid,
            email,
            passwordHash,
          ]);
          return uid;
        }
        const newId = randomUUID();
        const userDoc = { id: newId, name, email, role: 'EMPLOYEE', status: 'PENDING' };
        await tx('INSERT INTO users (id, data) VALUES ($1, $2)', [newId, userDoc]);
        await tx('INSERT INTO auth_credentials (user_id, email, password_hash) VALUES ($1, $2, $3)', [
          newId,
          email,
          passwordHash,
        ]);
        return newId;
      });

      res.status(201).json({ pending: true, id });
    } catch (e) {
      next(e);
    }
  });

  // ── WHO AM I (replaces onAuthStateChanged resolution) ──────────────────────
  // Reports `mustReset` too: the client gates the whole app behind a forced
  // password change, and that gate has to survive a page refresh (which
  // re-resolves the session here rather than through /login).
  router.get('/me', authenticate, async (req: Request, res: Response, next) => {
    try {
      const cred = (await query('SELECT must_reset FROM auth_credentials WHERE user_id = $1', [req.user!.id])).rows[0];
      res.json({ user: { id: req.user!.id, ...req.user!.data }, mustReset: !!cred?.must_reset });
    } catch (e) {
      next(e);
    }
  });

  // ── CHANGE PASSWORD (authenticated; also completes must_reset) ─────────────
  router.post('/change-password', authenticate, limit.changePassword, async (req: Request, res: Response, next) => {
    try {
      const parsed = z
        .object({ currentPassword: passwordSchema.optional(), newPassword: passwordSchema.min(8) })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: `newPassword must be 8 to ${MAX_PASSWORD_LENGTH} characters` });
        return;
      }
      const userId = req.user!.id;
      const cred = (
        await query('SELECT password_hash, must_reset FROM auth_credentials WHERE user_id = $1', [userId])
      ).rows[0];

      // No credential row = the login was released (or never existed). This
      // route must never CREATE one: it would mint a fresh password and token
      // for a leaver without asking for any current password. Only an admin
      // (/admin/set-password) can give someone a login back.
      if (!cred) {
        res.status(403).json({ error: 'no login to change' });
        return;
      }

      // If the account isn't in a forced-reset state, require the current password.
      if (!cred.must_reset && cred.password_hash) {
        const ok = parsed.data.currentPassword
          ? await verifyPassword(parsed.data.currentPassword, cred.password_hash)
          : false;
        if (!ok) {
          res.status(403).json({ error: 'current password incorrect' });
          return;
        }
      }

      await query(
        `INSERT INTO auth_credentials (user_id, email, password_hash, must_reset)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, must_reset = false, updated_at = now()`,
        [userId, req.user!.email, await hashPassword(parsed.data.newPassword)],
      );
      // Every token issued before this moment is now dead (authenticate.ts
      // compares `iat` against the credential's updated_at) — that is the point:
      // changing your password signs your OTHER sessions out. Hand this caller a
      // fresh one so the tab they are sitting in survives its own change.
      const token = signToken({ sub: userId, email: req.user!.authEmail || req.user!.email });
      res.json({ ok: true, token });
    } catch (e) {
      next(e);
    }
  });

  // ── ADMIN: set a temporary password for a user (no SMTP needed) ────────────
  router.post('/admin/set-password', authenticate, async (req: Request, res: Response, next) => {
    try {
      if (!isAdmin(req.user!)) {
        res.status(403).json({ error: 'admin only' });
        return;
      }
      const parsed = z.object({ userId: z.string().min(1), newPassword: passwordSchema.min(8) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: `userId and newPassword (8 to ${MAX_PASSWORD_LENGTH} characters) required` });
        return;
      }
      const target = (await query('SELECT data FROM users WHERE id = $1', [parsed.data.userId])).rows[0];
      if (!target) {
        res.status(404).json({ error: 'user not found' });
        return;
      }
      await query(
        `INSERT INTO auth_credentials (user_id, email, password_hash, must_reset)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, must_reset = true, updated_at = now()`,
        [parsed.data.userId, String((target.data as any).email ?? ''), await hashPassword(parsed.data.newPassword)],
      );
      res.json({ ok: true, mustReset: true });
    } catch (e) {
      next(e);
    }
  });

  // ── ADMIN: release a deleted employee's login ──────────────────────────────
  // "Delete" in Admin → Employees ARCHIVES the profile so assessment history,
  // evidence and org-chart references survive. That used to leave the person's
  // sign-in behind: the credential row stayed, and the email stayed in the user
  // document — where the unique index on lower(data->>'email') keeps the address
  // claimed forever. So a leaver could still log in, and their address could
  // never be reissued.
  //
  // This frees both, in ONE transaction:
  //   • the credential row is deleted → no password and no route back in (and
  //     /login now also refuses archived profiles);
  //   • the address moves out of `email` into `archivedEmail` → the index no
  //     longer holds it, so the address can be used for a new account, while the
  //     archived record still shows who it belonged to.
  // The KEY is removed, not blanked: several archived profiles with `email: ''`
  // would collide on that same unique index.
  //
  // Idempotent — safe to re-run on a profile whose login is already released.
  router.post('/admin/release-login', authenticate, async (req: Request, res: Response, next) => {
    try {
      if (!isAdmin(req.user!)) {
        res.status(403).json({ error: 'admin only' });
        return;
      }
      const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'userId required' });
        return;
      }
      const { userId } = parsed.data;
      // An admin releasing their own login would lock themselves out of the
      // system they'd need in order to undo it.
      if (userId === req.user!.id) {
        res.status(400).json({ error: 'cannot release your own login' });
        return;
      }
      const target = (await query('SELECT id FROM users WHERE id = $1', [userId])).rows[0];
      if (!target) {
        res.status(404).json({ error: 'user not found' });
        return;
      }

      const freedEmail = await withTransaction(async (tx) => {
        await tx('DELETE FROM auth_credentials WHERE user_id = $1', [userId]);
        // Read-modify-write under a row lock rather than jsonb surgery in SQL:
        // the document is the app's shape, and this keeps the key removal
        // obvious (and portable to the pg-mem test harness).
        const row = (await tx('SELECT data FROM users WHERE id = $1 FOR UPDATE', [userId])).rows[0];
        const data = { ...((row?.data ?? {}) as Record<string, any>) };
        const currentEmail = typeof data.email === 'string' && data.email ? data.email : null;
        if (currentEmail) {
          delete data.email;
          data.archivedEmail = currentEmail;
          await tx(
            `UPDATE users SET data = $2, version = version + 1, updated_at = now(), updated_by = $3 WHERE id = $1`,
            [userId, data, req.user!.id],
          );
        }
        // Null on a repeat call — nothing was left to free.
        return currentEmail;
      });

      res.json({ ok: true, emailReleased: freedEmail });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
