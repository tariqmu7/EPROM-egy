import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORK_EXPERIENCE_POLICY,
  suggestLevelFromYears,
  validateBands,
} from '../experiencePolicy';

const policy = DEFAULT_WORK_EXPERIENCE_POLICY;

describe('suggestLevelFromYears', () => {
  // Bands are [min, max) — the boundary year belongs to the HIGHER band.
  it.each([
    [0, 2],
    [1.99, 2],
    [2, 3],
    [4.99, 3],
    [5, 4],
    [9.99, 4],
    [10, 5],
    [40, 5],
  ])('%s years → level %s', (years, expected) => {
    expect(suggestLevelFromYears(years, policy)).toBe(expected);
  });

  it('returns the 0 "no score" sentinel for unusable input', () => {
    expect(suggestLevelFromYears(-1, policy)).toBe(0);
    expect(suggestLevelFromYears(NaN, policy)).toBe(0);
    expect(suggestLevelFromYears(Infinity, policy)).toBe(0);
  });

  it('returns 0 when no band matches rather than inventing a level', () => {
    const gapped = { ...policy, bands: [{ minYears: 5, maxYears: 10, level: 3 }] };
    expect(suggestLevelFromYears(1, gapped)).toBe(0);
    expect(suggestLevelFromYears(20, gapped)).toBe(0);
  });

  it('clamps a misconfigured band level into the 1-5 scale', () => {
    expect(suggestLevelFromYears(1, { ...policy, bands: [{ minYears: 0, level: 9 }] })).toBe(5);
    expect(suggestLevelFromYears(1, { ...policy, bands: [{ minYears: 0, level: 0 }] })).toBe(1);
  });

  it('tolerates a policy with no bands at all', () => {
    expect(suggestLevelFromYears(3, { ...policy, bands: [] })).toBe(0);
  });
});

describe('validateBands', () => {
  it('accepts the shipped defaults', () => {
    expect(validateBands(policy.bands)).toEqual([]);
  });

  it('rejects an empty table', () => {
    expect(validateBands([])).toHaveLength(1);
  });

  it('catches a gap that would silently yield level 0', () => {
    const errors = validateBands([
      { minYears: 0, maxYears: 2, level: 2 },
      { minYears: 5, level: 4 },
    ]);
    expect(errors.some(e => e.includes('Gap between 2 and 5'))).toBe(true);
  });

  it('catches overlapping bands', () => {
    const errors = validateBands([
      { minYears: 0, maxYears: 5, level: 2 },
      { minYears: 2, level: 4 },
    ]);
    expect(errors.some(e => e.includes('overlap'))).toBe(true);
  });

  it('requires the table to start at 0 and end open-ended', () => {
    expect(validateBands([{ minYears: 1, level: 2 }]).some(e => e.includes('start at 0'))).toBe(true);
    expect(
      validateBands([{ minYears: 0, maxYears: 5, level: 2 }]).some(e => e.includes('open-ended')),
    ).toBe(true);
  });

  it('rejects an out-of-scale or inverted band', () => {
    expect(validateBands([{ minYears: 0, level: 7 }]).some(e => e.includes('1 to 5'))).toBe(true);
    expect(
      validateBands([{ minYears: 5, maxYears: 2, level: 3 }]).some(e => e.includes('greater than')),
    ).toBe(true);
  });
});
