// ============================================================================
// The scheduler — a plain timer, deliberately not a cron dependency.
//
// One API container runs the stack (docker-compose.yml), so a node-internal
// timer is the whole mechanism: no new dependency, no crontab on the VM to
// forget during a redeploy, and the job is visible in the API's own logs and in
// `job_runs`.
//
// Two behaviours make it survive real life:
//   • CATCH-UP ON BOOT. The VM gets rebooted and containers restart. On start
//     the scheduler asks `job_runs` when the sweep last succeeded; if that is
//     more than `catchUpAfterHours` ago (or never), it runs one shortly after
//     boot instead of waiting for the next 02:00. Missing a night silently was
//     the failure mode of the old browser-side check.
//   • NO OVERLAP. `runAndRecord` refuses to start while a sweep is in flight,
//     so a slow run and the next tick can't collide.
//
// It is OFF under NODE_ENV=test (config.jobs.enabled) so the suite never starts
// background timers.
// ============================================================================
import { config } from '../config.js';
import { query } from '../db.js';
import { logger } from '../logger.js';
import { runAndRecord } from './nightly.js';

let timer: NodeJS.Timeout | null = null;
let stopped = false;

/** Milliseconds from `from` to the next occurrence of hour:minute, local time. */
export function msUntilNextRun(from: Date, hour: number, minute: number): number {
  const next = new Date(from.getFullYear(), from.getMonth(), from.getDate(), hour, minute, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next.getTime() - from.getTime();
}

/** Hours since the last SUCCESSFUL nightly run, or null if it has never run. */
export async function hoursSinceLastSuccess(now = new Date()): Promise<number | null> {
  const { rows } = await query(
    `SELECT started_at FROM job_runs WHERE job = 'nightly' AND ok = true ORDER BY started_at DESC LIMIT 1`,
  );
  if (rows.length === 0 || !rows[0].started_at) return null;
  const last = new Date(rows[0].started_at as string | Date);
  return (now.getTime() - last.getTime()) / (1000 * 60 * 60);
}

function scheduleNext(): void {
  if (stopped) return;
  const delay = msUntilNextRun(new Date(), config.jobs.hour, config.jobs.minute);
  timer = setTimeout(() => {
    void runAndRecord('scheduled')
      .catch((err) => logger.error('scheduler_run_error', { err: String(err) }))
      .finally(scheduleNext);
  }, delay);
  logger.info('nightly_job_scheduled', {
    inMinutes: Math.round(delay / 60000),
    at: `${String(config.jobs.hour).padStart(2, '0')}:${String(config.jobs.minute).padStart(2, '0')}`,
  });
}

/** Starts the nightly timer (and the boot catch-up). No-op when disabled. */
export async function startScheduler(): Promise<void> {
  if (!config.jobs.enabled) {
    logger.info('nightly_job_disabled');
    return;
  }
  stopped = false;
  scheduleNext();

  if (!config.jobs.catchUpOnBoot) return;
  try {
    const hours = await hoursSinceLastSuccess();
    if (hours === null || hours >= config.jobs.catchUpAfterHours) {
      logger.info('nightly_job_catch_up', { hoursSinceLastSuccess: hours });
      // Delayed a little so a boot-storm (migrations, first requests) settles first.
      setTimeout(() => {
        void runAndRecord('boot').catch((err) => logger.error('scheduler_boot_run_error', { err: String(err) }));
      }, config.jobs.bootDelayMs).unref?.();
    }
  } catch (err) {
    // A missing job_runs table (migrations not yet applied) must never stop the API.
    logger.error('nightly_job_catch_up_check_failed', { err: String(err) });
  }
}

/** Cancels the timer. Used by tests and a graceful shutdown. */
export function stopScheduler(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
}
