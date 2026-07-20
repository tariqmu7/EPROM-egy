import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query, withTransaction } from '../db.js';
import { hashPassword, verifyPassword } from './password.js';
import { signToken } from './jwt.js';
import { authenticate } from '../middleware/authenticate.js';
import { isAdmin } from '../authz.js';

// Brute-force protection on auth endpoints. Disabled under test so the suite's
// many logins aren't throttled (mirrors the global limiter in app.ts).
const loginLimiter =
  process.env.NODE_ENV === 'test'
    ? (_req: Request, _res: Response, next: (e?: unknown) => void) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 20, // per IP per 15 min — blunt brute-force protection
        standardHeaders: true,
        legacyHeaders: false,
      });

const emailSchema = z.string().email().transform((s) => s.trim().toLowerCase());

export function authRouter(): Router {
  const router = Router();

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  router.post('/login', loginLimiter, async (req: Request, res: Response, next) => {
    try {
      const parsed = z.object({ email: emailSchema, password: z.string().min(1) }).safeParse(req.body);
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

  // ── SIGNUP (self-registration → PENDING, needs admin approval) ─────────────
  router.post('/signup', loginLimiter, async (req: Request, res: Response, next) => {
    try {
      if (!config.allowSignup) {
        res.status(403).json({ error: 'signup disabled' });
        return;
      }
      const parsed = z
        .object({
          email: emailSchema,
          password: z.string().min(8, 'password must be at least 8 characters'),
          name: z.string().min(1),
          profile: z.record(z.unknown()).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid input' });
        return;
      }
      const { email, password, name, profile } = parsed.data;

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
        const userDoc = { ...(profile ?? {}), id: newId, name, email, role: 'EMPLOYEE', status: 'PENDING' };
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
  router.post('/change-password', authenticate, async (req: Request, res: Response, next) => {
    try {
      const parsed = z
        .object({ currentPassword: z.string().optional(), newPassword: z.string().min(8) })
        .safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'newPassword must be at least 8 characters' });
        return;
      }
      const userId = req.user!.id;
      const cred = (
        await query('SELECT password_hash, must_reset FROM auth_credentials WHERE user_id = $1', [userId])
      ).rows[0];

      // If the account isn't in a forced-reset state, require the current password.
      if (cred && !cred.must_reset && cred.password_hash) {
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
      res.json({ ok: true });
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
      const parsed = z.object({ userId: z.string().min(1), newPassword: z.string().min(8) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'userId and newPassword (min 8) required' });
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

  // ── REQUEST PASSWORD RESET (token; emailing wired later if SMTP exists) ────
  router.post('/reset-password', loginLimiter, async (req: Request, res: Response, next) => {
    try {
      const parsed = z.object({ email: emailSchema }).safeParse(req.body);
      // Always return 200 so the endpoint can't be used to probe which emails exist.
      if (!parsed.success) {
        res.json({ ok: true });
        return;
      }
      const cred = (await query('SELECT user_id FROM auth_credentials WHERE lower(email) = $1', [parsed.data.email]))
        .rows[0];
      if (cred) {
        const token = randomUUID();
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await query('INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)', [
          token,
          cred.user_id,
          expires,
        ]);
        // TODO(Phase 6): email the reset link via the internal SMTP relay.
        console.log(`[reset-password] token for ${parsed.data.email}: ${token}`);
      }
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return router;
}
