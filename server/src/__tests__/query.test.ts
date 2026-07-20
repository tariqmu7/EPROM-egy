// Finding F-3: every list/query must be bounded server-side. buildWhere is the
// single choke point both the GET list and POST query paths flow through, so
// asserting the LIMIT here guarantees no response can be unbounded.
import { describe, expect, it } from 'vitest';
import { buildWhere, MAX_PAGE_SIZE, type QuerySpec } from '../collections/query.js';

// The LIMIT value is always the last pushed parameter.
function limitParam(spec: QuerySpec): number {
  const { text, params } = buildWhere(spec);
  expect(text).toContain('LIMIT');
  return params[params.length - 1] as number;
}

describe('list size is always bounded (F-3)', () => {
  it('applies MAX_PAGE_SIZE when the caller sends no limit', () => {
    expect(limitParam({})).toBe(MAX_PAGE_SIZE);
  });

  it('honours a smaller requested page', () => {
    expect(limitParam({ limit: 25 })).toBe(25);
  });

  it('caps a request larger than MAX_PAGE_SIZE', () => {
    expect(limitParam({ limit: MAX_PAGE_SIZE * 100 })).toBe(MAX_PAGE_SIZE);
  });

  it('bounds even a delta (since) query', () => {
    const { text } = buildWhere({ since: new Date().toISOString() });
    expect(text).toContain('LIMIT');
  });
});
