// ============================================================================
// /jobs — admin-only visibility and control over the scheduled sweep.
//
// A job nobody can see is a job nobody trusts: these two endpoints are how an
// admin answers "is it running?" without SSH-ing to the VM and reading logs.
//
// NOT part of the generic /col surface on purpose — `job_runs` is server-owned
// operational data, not a document collection (no registry entry, no authz
// policy, no delta sync). Both routes are gated on `isAdmin` here.
// ============================================================================
import { Router, type Request, type Response } from 'express';
import { isAdmin } from '../authz.js';
import { query } from '../db.js';
import { isSweepRunning, runAndRecord } from './nightly.js';
import { config } from '../config.js';

const h =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: (e?: unknown) => void) =>
    fn(req, res).catch(next);

function requireAdmin(req: Request, res: Response): boolean {
  if (req.user && isAdmin(req.user)) return true;
  res.status(403).json({ error: 'admin only' });
  return false;
}

export function jobsRouter(): Router {
  const router = Router();

  // Recent runs, newest first, plus the current configuration — enough to tell
  // "scheduled but never fired" from "fired and failed".
  router.get(
    '/runs',
    h(async (req, res) => {
      if (!requireAdmin(req, res)) return;
      const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
      const { rows } = await query(
        `SELECT id, job, trigger, started_at, finished_at, ok, summary, error
           FROM job_runs
          ORDER BY started_at DESC
          LIMIT ${limit}`,
      );
      res.json({
        running: isSweepRunning(),
        config: {
          enabled: config.jobs.enabled,
          at: `${String(config.jobs.hour).padStart(2, '0')}:${String(config.jobs.minute).padStart(2, '0')}`,
        },
        runs: rows.map((r) => ({
          id: r.id,
          job: r.job,
          trigger: r.trigger,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          ok: r.ok,
          summary: r.summary,
          error: r.error,
        })),
      });
    }),
  );

  // Run it now. Synchronous (the caller gets the counters back) because the
  // sweep is seconds-scale at company size, and an admin pressing "run" wants
  // the result, not a job id.
  router.post(
    '/run',
    h(async (req, res) => {
      if (!requireAdmin(req, res)) return;
      if (isSweepRunning()) {
        res.status(409).json({ error: 'a sweep is already running' });
        return;
      }
      const run = await runAndRecord('manual');
      res.status(run.ok ? 200 : 500).json(run);
    }),
  );

  return router;
}
