// ============================================================================
// Work-experience → competency translation policy.
//
// These are the SHIPPED DEFAULTS. An admin may override them per-installation
// (the override document lives at appSettings/work-experience and is merged over
// these by DataService.getWorkExperiencePolicy).
//
// Two knobs, doing different jobs:
//   • `bands`  — what a given number of years SUGGESTS. Honest about depth, so
//     the top bands reach 4 and 5.
//   • `maxProvisionalLevel` — what may actually reach a score without anyone
//     having measured it. Deliberately lower than the top band: tenure alone
//     evidences competence, it does not evidence mastery.
// A verifier can therefore be shown "10 years → Expert" while the system still
// only credits Level 3 until a real assessment happens.
// ============================================================================
import { ExperienceLevelBand, WorkExperiencePolicy } from '../types';

export const DEFAULT_WORK_EXPERIENCE_POLICY: WorkExperiencePolicy = {
  enabled: true,
  maxProvisionalLevel: 3, // Skill — never claim Advanced/Expert from tenure alone
  bands: [
    { minYears: 0, maxYears: 2, level: 2 },    // < 2y   → Knowledge
    { minYears: 2, maxYears: 5, level: 3 },    // 2-5y   → Skill
    { minYears: 5, maxYears: 10, level: 4 },   // 5-10y  → Advanced
    { minYears: 10, level: 5 },                // 10y+   → Expert
  ],
};

/**
 * Pure band lookup: how many years maps to which proficiency level.
 * Returns 0 (the "no score" sentinel used throughout scoring) when the input is
 * unusable or no band matches, so a malformed entry can never mint a level.
 */
export function suggestLevelFromYears(years: number, policy: WorkExperiencePolicy): number {
  if (!Number.isFinite(years) || years < 0) return 0;
  const band = (policy.bands || []).find(
    b => years >= b.minYears && (b.maxYears === undefined || years < b.maxYears),
  );
  if (!band) return 0;
  return Math.min(Math.max(Math.round(band.level), 1), 5);
}

/**
 * Validate an admin-edited band table. Returns the list of problems (empty when
 * valid) so the policy editor can block a save that would produce silent gaps —
 * a year range matching no band yields 0, which reads as "never assessed".
 */
export function validateBands(bands: ExperienceLevelBand[]): string[] {
  const errors: string[] = [];
  if (!bands.length) return ['At least one band is required.'];

  const sorted = [...bands].sort((a, b) => a.minYears - b.minYears);
  if (sorted[0].minYears !== 0) errors.push('The first band must start at 0 years.');

  sorted.forEach((b, i) => {
    if (!Number.isFinite(b.minYears) || b.minYears < 0) {
      errors.push(`Band ${i + 1}: "from" must be 0 or more.`);
    }
    if (b.maxYears !== undefined && b.maxYears <= b.minYears) {
      errors.push(`Band ${i + 1}: "to" must be greater than "from".`);
    }
    if (!Number.isInteger(b.level) || b.level < 1 || b.level > 5) {
      errors.push(`Band ${i + 1}: level must be a whole number from 1 to 5.`);
    }
    const next = sorted[i + 1];
    if (next) {
      if (b.maxYears === undefined) {
        errors.push(`Band ${i + 1} is open-ended, so it must be the last band.`);
      } else if (b.maxYears < next.minYears) {
        errors.push(`Gap between ${b.maxYears} and ${next.minYears} years — no band would match.`);
      } else if (b.maxYears > next.minYears) {
        errors.push(`Bands ${i + 1} and ${i + 2} overlap at ${next.minYears} years.`);
      }
    } else if (b.maxYears !== undefined) {
      errors.push('The last band must be open-ended (no "to" value) so long tenures always match.');
    }
  });

  return errors;
}

type ExperienceLevelBandInput = { minYears: number; maxYears?: number; level: number };
