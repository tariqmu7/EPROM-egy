import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// bcryptjs is pure-JS (no native build) so it installs cleanly on Windows dev
// and the Linux VM alike. For extra hardening on the VM this can be swapped for
// argon2id without touching callers.
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}
