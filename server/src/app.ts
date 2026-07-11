import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { authRouter } from './auth/routes.js';
import { authenticate } from './middleware/authenticate.js';
import { collectionsRouter } from './collections/routes.js';
import { batchRouter } from './collections/batch.js';

// Builds the Express app WITHOUT starting a listener, so tests can drive it with
// supertest and index.ts can add bootstrap (migrations + listen).
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // Allow same-origin / tools (no Origin header) and the configured SPA origins.
        if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`origin not allowed: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'eprom-cms-api' }));

  // Public auth endpoints (login/signup/reset). /me is protected inside the router.
  app.use('/auth', authRouter());

  // Everything below requires a valid session.
  app.use('/col', authenticate, collectionsRouter());
  app.use('/batch', authenticate, batchRouter());

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  // Error handler — never leak internals to the client.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('unhandled error:', err);
    res.status(500).json({ error: 'internal server error' });
  });

  return app;
}
