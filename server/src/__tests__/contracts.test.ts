// Contract parity (finding F-4): the role / status / org-level value sets are
// enforced in four places — the shared enum module, the zod schemas, the authz
// policy, and the migration CHECK constraints. schemas.ts and authz.ts import
// the shared module, so those can't drift. The migration is SQL text and can't
// import TypeScript, so THIS test asserts the CHECK constraints match the shared
// enums — which is exactly the gap that let F-1 (missing ACEO) happen.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import {
  ROLE,
  USER_STATUS,
  ORG_LEVEL,
  ORG_MANAGER_LEVELS,
  WORK_EXPERIENCE_STATUS,
  DEVELOPMENT_PLAN_STATUS,
} from '../domain/enums.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

// Concatenate EVERY migration rather than reading 002 alone: enum CHECKs are
// added by whichever migration creates the table (005 introduces
// chk_workexperiences_status), and a parity test that only looks at one file
// silently stops covering new constraints.
const migration = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n');

// Pull the quoted values from the `IN ('A','B',…)` that follows a named CHECK
// constraint in the migration SQL.
function inValuesFor(constraintName: string): string[] {
  const idx = migration.indexOf(constraintName);
  expect(idx, `constraint ${constraintName} should exist in a migration`).toBeGreaterThan(-1);
  const after = migration.slice(idx);
  const m = after.match(/IN \(([^)]*)\)/);
  expect(m, `an IN (...) list should follow ${constraintName}`).toBeTruthy();
  return [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

const sorted = (a: readonly string[]) => [...a].sort();

describe('enum ↔ migration CHECK parity', () => {
  it('roles match', () => {
    expect(sorted(inValuesFor('chk_users_role'))).toEqual(sorted(ROLE));
  });

  it('user statuses match', () => {
    expect(sorted(inValuesFor('chk_users_status'))).toEqual(sorted(USER_STATUS));
  });

  it('org levels match on both the users and jobProfiles constraints', () => {
    expect(sorted(inValuesFor('chk_users_orglevel'))).toEqual(sorted(ORG_LEVEL));
    expect(sorted(inValuesFor('chk_jobprofiles_orglevel'))).toEqual(sorted(ORG_LEVEL));
  });

  it('work-experience statuses match (005)', () => {
    expect(sorted(inValuesFor('chk_workexperiences_status'))).toEqual(sorted(WORK_EXPERIENCE_STATUS));
  });

  it('development-plan statuses match (006)', () => {
    expect(sorted(inValuesFor('chk_developmentplans_status'))).toEqual(sorted(DEVELOPMENT_PLAN_STATUS));
  });
});

describe('org-level derivations (regression: F-1)', () => {
  it('ACEO is a recognised org level', () => {
    expect(ORG_LEVEL).toContain('ACEO');
  });

  it('ACEO counts as a manager level', () => {
    expect(ORG_MANAGER_LEVELS).toContain('ACEO');
  });

  it('only the two IC levels are excluded from the manager set', () => {
    const nonManagers = ORG_LEVEL.filter((l) => !ORG_MANAGER_LEVELS.includes(l));
    expect(sorted(nonManagers)).toEqual(['FR', 'JP']);
  });
});
