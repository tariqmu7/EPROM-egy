import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../auth/jwt.js';
import { query } from '../db.js';
import type { AuthedUser } from '../types.js';

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

  const { rows } = await query('SELECT id, data FROM users WHERE id = $1', [claims.sub]);
  if (rows.length === 0) {
    res.status(401).json({ error: 'user no longer exists' });
    return;
  }

  const data = rows[0].data as Record<string, unknown>;
  // A user deactivated/rejected after their token was issued cannot act.
  if (data.status && data.status !== 'ACTIVE') {
    res.status(403).json({ error: 'account not active' });
    return;
  }

  const user: AuthedUser = {
    id: rows[0].id,
    email: String(data.email ?? claims.email ?? ''),
    role: String(data.role ?? 'EMPLOYEE'),
    orgLevel: data.orgLevel as string | undefined,
    managerId: data.managerId as string | undefined,
    status: data.status as string | undefined,
    data,
  };
  req.user = user;
  next();
}
