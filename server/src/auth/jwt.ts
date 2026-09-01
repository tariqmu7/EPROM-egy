import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenClaims {
  sub: string; // user id
  email: string;
  // Seconds since the epoch, stamped by jsonwebtoken on sign. Used to retire a
  // token issued BEFORE the account's password last changed — see
  // middleware/authenticate.ts. Absent on a token minted before this existed.
  iat?: number;
}

export function signToken(claims: TokenClaims): string {
  return jwt.sign(claims, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenClaims | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (typeof decoded === 'string') return null;
    const payload = decoded as jwt.JwtPayload;
    return {
      sub: String(decoded.sub),
      email: String(payload.email ?? ''),
      iat: typeof payload.iat === 'number' ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}
