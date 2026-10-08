// The delta-sync cursor (R7). A delta poll returns rows with `updated_at >
// cursor`, so the cursor it hands back must never pass a change the client has
// not yet been able to see. Two things used to push it past one:
//
//  1. `updated_at = now()` is the writing transaction's START time, but the row
//     only becomes visible when that transaction COMMITS. A batch that started
//     at 10:00:00.000 and commits at .050 lands stamped .000 — after a poll that
//     already saw a quicker write stamped .020 and moved the cursor to .020. The
//     batch's rows are then older than the cursor and never sent.
//  2. A page cut short by LIMIT still let the newest deletion (or, on a tie, the
//     last row's own timestamp) advance the cursor past rows the page never
//     reached.
//
// So the cursor is capped below a WATERMARK: the start of the oldest transaction
// still open on the database. Anything stamped earlier has committed and was
// visible to the read that followed; anything later is re-sent next poll, which
// is harmless (the client's cache merge is idempotent).

import { logger } from '../logger.js';

type Runner = (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

// A transaction left open longer than this (a stuck "idle in transaction"
// session, a long pg_dump) stops holding the cursor back — otherwise every poll
// would re-send everything since it began. A write slower than this can still be
// missed by a delta, and the client's periodic full resync picks it up.
export const MAX_COMMIT_LAG_MS = 5 * 60_000;

// Epoch ms, or null for a missing / unparseable timestamp.
export function toMs(v: unknown): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(String(v));
  return Number.isFinite(t) ? t : null;
}

let warnedNoActivityView = false;

/**
 * Epoch ms before which every write is committed. Must be read BEFORE the rows
 * it guards: a transaction that commits in between is then simply visible.
 */
export async function readWatermark(run: Runner): Promise<number> {
  try {
    const { rows } = await run(
      `SELECT min(xact_start) AS oldest, now() AS now FROM pg_stat_activity
        WHERE datname = current_database() AND backend_type = 'client backend' AND xact_start IS NOT NULL`,
    );
    const now = toMs(rows[0]?.now) ?? Date.now();
    const oldest = toMs(rows[0]?.oldest) ?? now;
    return Math.max(Math.min(oldest, now), now - MAX_COMMIT_LAG_MS);
  } catch (err) {
    // Without the activity view, assume the worst open transaction: correct,
    // just more re-sending per poll.
    if (!warnedNoActivityView) {
      warnedNoActivityView = true;
      logger.warn('delta_sync_watermark_fallback', { error: err instanceof Error ? err.message : String(err) });
    }
    const { rows } = await run('SELECT now() AS now');
    return (toMs(rows[0]?.now) ?? Date.now()) - MAX_COMMIT_LAG_MS;
  }
}

export interface CursorInput {
  since: string | null; // the cursor the client sent (delta poll), or null (full read)
  rowTimes: unknown[]; // updated_at of the returned rows, in query order
  deletionTimes: unknown[]; // deleted_at of the returned tombstones (delta only)
  truncated: boolean; // the page hit its LIMIT
  watermark: number;
}

/** The cursor to hand back, or null when there is nothing safe to resume from. */
export function nextCursor({ since, rowTimes, deletionTimes, truncated, watermark }: CursorInput): string | null {
  // Strictly below the watermark: a write stamped exactly at it may be in flight.
  const ceiling = watermark - 1;
  const sinceMs = toMs(since);
  const times = rowTimes.map(toMs).filter((t): t is number => t != null);

  if (sinceMs == null) {
    // Full read. A truncated, unordered page says nothing about the rows it
    // left out, so give no cursor and the client stays on full reads.
    if (truncated || times.length === 0) return null;
    return new Date(Math.min(Math.max(...times), ceiling)).toISOString();
  }

  let candidate: number;
  if (truncated && times.length > 0) {
    // Resume just BEFORE the last row's millisecond, so rows sharing its
    // timestamp past the LIMIT come round again. Deletions do not move the
    // cursor here — they are re-reported next poll, which is harmless. If one
    // millisecond holds more than a page, step over it rather than loop
    // forever; the periodic full resync picks up anything left behind.
    const last = Math.floor(times[times.length - 1]);
    candidate = last - 1 > sinceMs ? last - 1 : last + 1;
  } else {
    const dels = deletionTimes.map(toMs).filter((t): t is number => t != null);
    candidate = Math.max(sinceMs, ...times, ...dels);
  }
  // Never move backwards: `since` was itself a safe cursor when it was issued.
  return new Date(Math.max(sinceMs, Math.min(candidate, ceiling))).toISOString();
}
