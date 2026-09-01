// Shared server types + Express request augmentation.
import type { Logger } from './logger.js';

export interface AuthedUser {
  id: string;
  email: string;
  // The address this session actually SIGNED IN with, read from
  // `auth_credentials` — not the (user-writable) `email` field of the users
  // document. Privilege decisions that key off an address (the bootstrap admin)
  // must use this one; see isAdmin() in authz.ts.
  authEmail: string;
  role: string; // 'ADMIN' | 'EMPLOYEE' | 'CEO'
  orgLevel?: string;
  managerId?: string;
  status?: string;
  data: Record<string, unknown>; // full users document
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
      log?: Logger; // per-request child logger bound with the requestId
    }
  }
}

export {};
