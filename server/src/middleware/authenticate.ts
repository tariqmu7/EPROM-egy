import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../auth/jwt.js';
import { query } from '../db.js';
import type { AuthedUser } from '../types.js';

// `iat` is whole seconds; a credential written in the same second as the token
// can read as up to 999 ms later. Allow for that plus a little slack.
const CLOCK_SKEW_MS = 2000;

// Verifies the Bearer JWT, loads the fresh users document (so role/orgLevel/
// managerId used for authz are never stale), and attaches req.user.
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'missing bearer token' });
    return;
  }

  const claims = verifyToken(token);
  if (!claims) {
    res.status(401).json({ error: 'invalid or expired token' });
    return;
  }

  // The credential email comes from `auth_credentials`, joined here rather than
  // taken from the users document: the document's `email` is writable by the
  // user, and isAdmin() grants the bootstrap admin by address (was H2 — an
  // employee who set their own document email to the bootstrap address became
  // admin). The credential row is only ever written by the auth routes.
  const { rows } = await query(
    `SELECT u.id, u.data, c.email AS auth_email, c.updated_at AS credential_updated_at
       FROM users u LEFT JOIN auth_credentials c ON c.user_id = u.id
      WHERE u.id = $1`,
    [claims.sub],
  );
  if (rows.length === 0) {
    res.status(401).json({ error: 'user no longer exists' });
    return;
  }

  // A password change retires every token issued before it. The JWT is
  // stateless, so without this an admin resetting a compromised account's
  // password would leave the attacker's existing token working for the whole
  // JWT_EXPIRES_IN window (12h by default) — the reset would not actually lock
  // them out. `auth_credentials.updated_at` moves on every change-password and
  // admin set-password, and `iat` is stamped on the token; a token older than
  // that is dead. Whoever changed the password gets a fresh token back from the
  // endpoint, so their own tab stays signed in.
  //
  // `iat` has SECOND precision, so a token minted in the same second as the
  // credential write can look up to 999 ms older than it. CLOCK_SKEW_MS covers
  // that; the cost is only that revocation takes effect a second later.
  const credentialUpdatedAt = rows[0].credential_updated_at as Date | string | null | undefined;
  if (claims.iat !== undefined && credentialUpdatedAt) {
    const changedAtMs = new Date(credentialUpdatedAt).getTime();
    if (Number.isFinite(changedAtMs) && claims.iat * 1000 < changedAtMs - CLOCK_SKEW_MS) {
      res.status(401).json({ error: 'session ended by a password change' });
      return;
    }
  }

  const data = rows[0].data as Record<string, unknown>;
  // A user deactivated/rejected after their token was issued cannot act.
  if (data.status && data.status !== 'ACTIVE') {
    res.status(403).json({ error: 'account_not_active', status: String(data.status) });
    return;
  }

  const user: AuthedUser = {
    id: rows[0].id,
    email: String(data.email ?? claims.email ?? ''),
    authEmail: String(rows[0].auth_email ?? ''),
    role: String(data.role ?? 'EMPLOYEE'),
    orgLevel: data.orgLevel as string | undefined,
    managerId: data.managerId as string | undefined,
    status: data.status as string | undefined,
    data,
  };
  req.user = user;
  next();
}
