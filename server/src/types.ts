// Shared server types + Express request augmentation.

export interface AuthedUser {
  id: string;
  email: string;
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
    }
  }
}

export {};
