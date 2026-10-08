import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// bcryptjs is pure-JS (no native build) so it installs cleanly on Windows dev
// and the Linux VM alike. For extra hardening on the VM this can be swapped for
// argon2id without touching callers.
//
// It also runs IN the api process: every hash or compare is ~a quarter-second
// of CPU at 12 rounds, on the same thread that serves every other request. The
// rate limiters bound each IP / each account, but not the sum of them, so the
// work itself is gated too: at most MAX_ACTIVE run at once, at most MAX_QUEUED
// wait, and anything beyond that is refused at once (PasswordBusyError → 503)
// rather than queued without end — a flood slows logins down, never the app.
const MAX_ACTIVE = 4;
const MAX_QUEUED = 64;

export class PasswordBusyError extends Error {
  constructor() {
    super('password service busy');
  }
}

let active = 0;
const waiting: Array<() => void> = [];

async function gated<T>(work: () => Promise<T>): Promise<T> {
  if (active >= MAX_ACTIVE) {
    if (waiting.length >= MAX_QUEUED) throw new PasswordBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    active++;
  }
  try {
    return await work();
  } finally {
    // Hand the slot straight to the next waiter (active stays the same), or free it.
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

// bcrypt reads only the first 72 bytes, and a megabyte "password" is a cheap way
// to make the server do pointless work — callers cap input at this length.
export const MAX_PASSWORD_LENGTH = 128;

export async function hashPassword(plain: string): Promise<string> {
  return gated(() => bcrypt.hash(plain, config.bcryptRounds));
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return gated(() => bcrypt.compare(plain, hash));
}
