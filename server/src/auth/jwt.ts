import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenClaims {
  sub: string; // user id
  email: string;
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
    return { sub: String(decoded.sub), email: String((decoded as jwt.JwtPayload).email ?? '') };
  } catch {
    return null;
  }
}
