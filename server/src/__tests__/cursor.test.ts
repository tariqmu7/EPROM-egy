// The delta-sync cursor rules (R7) — see collections/cursor.ts.
import { describe, expect, it } from 'vitest';
import { nextCursor } from '../collections/cursor.js';

const T = Date.parse('2026-10-08T10:00:00.000Z');
const iso = (ms: number) => new Date(T + ms).toISOString();
const at = (ms: number) => new Date(T + ms);

describe('nextCursor', () => {
  it('stays below the oldest open transaction', () => {
    const c = nextCursor({ since: iso(0), rowTimes: [at(20)], deletionTimes: [], truncated: false, watermark: T + 10 });
    expect(c).toBe(iso(9));
  });

  it('advances to the newest change when nothing is in flight', () => {
    const c = nextCursor({ since: iso(0), rowTimes: [at(20)], deletionTimes: [at(30)], truncated: false, watermark: T + 1000 });
    expect(c).toBe(iso(30));
  });

  it('never moves backwards', () => {
    const c = nextCursor({ since: iso(50), rowTimes: [], deletionTimes: [], truncated: false, watermark: T + 10 });
    expect(c).toBe(iso(50));
  });

  it('a truncated page resumes before its last row, ignoring newer deletions', () => {
    const c = nextCursor({ since: iso(0), rowTimes: [at(100), at(200)], deletionTimes: [at(300)], truncated: true, watermark: T + 1000 });
    expect(c).toBe(iso(199));
  });

  it('a millisecond fuller than a page is stepped over, not looped on', () => {
    const c = nextCursor({ since: iso(199), rowTimes: [at(200), at(200)], deletionTimes: [], truncated: true, watermark: T + 1000 });
    expect(c).toBe(iso(201));
  });

  it('a truncated or empty full read gives no cursor', () => {
    expect(nextCursor({ since: null, rowTimes: [at(5)], deletionTimes: [], truncated: true, watermark: T + 1000 })).toBeNull();
    expect(nextCursor({ since: null, rowTimes: [], deletionTimes: [], truncated: false, watermark: T + 1000 })).toBeNull();
  });

  it('a full read is capped by the watermark too', () => {
    const c = nextCursor({ since: null, rowTimes: [at(5), at(50)], deletionTimes: [], truncated: false, watermark: T + 10 });
    expect(c).toBe(iso(9));
  });
});
