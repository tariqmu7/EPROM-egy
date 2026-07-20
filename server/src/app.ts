import { randomUUID } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { query } from './db.js';
import { logger } from './logger.js';
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

  // Request id + structured access log. Runs first so every response (including
  // rate-limited ones) carries an `x-request-id` and every log line is
  // correlatable. The finish handler captures the resolved user + latency.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const rid = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('x-request-id', rid);
    req.log = logger.child({ requestId: rid });
    const start = Date.now();
    res.on('finish', () => {
      req.log?.info('request', {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Date.now() - start,
        userId: req.user?.id,
      });
    });
    next();
  });

  // Blunt global API rate limit (per IP) — a backstop against runaway clients
  // and scraping. Auth endpoints keep their own stricter limiter. Disabled
  // under test so the suite's rapid requests aren't throttled.
  if (process.env.NODE_ENV !== 'test') {
    app.use(
      rateLimit({
        windowMs: 60 * 1000,
        max: 600, // ~10 req/s per IP sustained; generous for a polling SPA
        standardHeaders: true,
        legacyHeaders: false,
      }),
    );
  }

  // Liveness (process is up) vs. readiness (DB reachable). Orchestrators and the
  // deploy runbook can distinguish "restart me" from "don't route traffic yet".
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'eprom-cms-api' }));
  app.get('/health/ready', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ ok: true, db: 'up' });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  // Public auth endpoints (login/signup/reset). /me is protected inside the router.
  app.use('/auth', authRouter());

  // Everything below requires a valid session.
  app.use('/col', authenticate, collectionsRouter());
  app.use('/batch', authenticate, batchRouter());

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'not found' }));

  // Error handler — logs with the request id and returns it to the client so a
  // user-reported failure can be traced. Never leaks internals.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    (req.log ?? logger).error('unhandled_error', {
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    res.status(500).json({ error: 'internal server error', requestId: res.getHeader('x-request-id') });
  });

  return app;
}
