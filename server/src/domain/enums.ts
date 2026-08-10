// ============================================================================
// Canonical domain enums — the single server-side source of truth for the
// role / status / org-level value sets.
//
// Before this module the same lists were hand-copied into four places
// (src/types.ts on the frontend, collections/schemas.ts, authz.ts, and the
// migration CHECK constraints). They drifted: `ACEO` was present everywhere
// except authz.ts, which silently 403'd any user at that level (finding F-1).
//
// schemas.ts (zod) and authz.ts (policy) now both import from here, so those two
// can never drift again. The migration SQL is text and can't import TypeScript,
// so __tests__/contracts.test.ts asserts the CHECK constraints match these
// values — closing the loop on the whole class of bug.
//
// Keep in lockstep with `src/types.ts` on the frontend (its own source of truth).
// ============================================================================

export const ROLE = ['ADMIN', 'EMPLOYEE', 'CEO'] as const;
export type Role = (typeof ROLE)[number];

export const USER_STATUS = ['ACTIVE', 'PENDING', 'REJECTED'] as const;
export type UserStatus = (typeof USER_STATUS)[number];

// Full org hierarchy, top → bottom. ACEO (Assistant CEO / sector head) sits
// between CEO and GM. Deriving both the valid-set and the manager-set from THIS
// one list is what prevents the drift that produced F-1.
export const ORG_LEVEL = ['CEO', 'ACEO', 'GM', 'AGM', 'DM', 'SH', 'SP', 'JP', 'FR'] as const;
export type OrgLevel = (typeof ORG_LEVEL)[number];

// The individual-contributor levels; everything above them denotes a managing
// position for authorization purposes (e.g. may update a subordinate's profile).
export const NON_MANAGER_ORG_LEVELS = ['JP', 'FR'] as const;

// Org levels that make someone a manager. Derived from ORG_LEVEL so it can never
// omit a level (the exact mistake behind F-1, where ACEO was left out).
export const ORG_MANAGER_LEVELS: readonly OrgLevel[] = ORG_LEVEL.filter(
  (l) => !(NON_MANAGER_ORG_LEVELS as readonly string[]).includes(l),
);

// Lifecycle of an employee-submitted work-experience record. Only VERIFIED
// entries may contribute a (capped, provisional) competency baseline — see
// getUserSkillScore in src/services/store.ts.
export const WORK_EXPERIENCE_STATUS = ['PENDING', 'VERIFIED', 'REJECTED'] as const;
export type WorkExperienceStatus = (typeof WORK_EXPERIENCE_STATUS)[number];

// Lifecycle of a saved development plan (migration 006). DRAFT is being written,
// ACTIVE is agreed and in progress, COMPLETED/ARCHIVED are closed. Per-ITEM
// status (NOT_STARTED/IN_PROGRESS/COMPLETED/CANCELLED) lives inside the JSON
// items array and is not projected to a column, so it carries no CHECK.
export const DEVELOPMENT_PLAN_STATUS = ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type DevelopmentPlanStatus = (typeof DEVELOPMENT_PLAN_STATUS)[number];

// How much a gap on a skill matters — the business judgement no amount of
// scoring can derive (finding 9: every gap weighed the same). Stored inside the
// skills JSON, so there is no column and no CHECK to keep in step; the zod
// schema is the only gate. The WEIGHT is a multiplier on the gap, applied by
// analytics/aggregate.ts when it ranks training needs.
//
// Keep in lockstep with SKILL_CRITICALITIES / SKILL_CRITICALITY_WEIGHTS in
// src/types.ts — the browser ranks an individual's plan with the same numbers.
export const SKILL_CRITICALITY = ['SAFETY_CRITICAL', 'HIGH', 'STANDARD', 'LOW'] as const;
export type SkillCriticality = (typeof SKILL_CRITICALITY)[number];

export const SKILL_CRITICALITY_WEIGHTS: Record<SkillCriticality, number> = {
  SAFETY_CRITICAL: 3,
  HIGH: 2,
  STANDARD: 1,
  LOW: 0.5,
};

/** Skills written before criticality existed rank as STANDARD. */
export const DEFAULT_SKILL_CRITICALITY: SkillCriticality = 'STANDARD';

export function skillCriticalityOf(value?: unknown): SkillCriticality {
  return (SKILL_CRITICALITY as readonly string[]).includes(String(value))
    ? (value as SkillCriticality)
    : DEFAULT_SKILL_CRITICALITY;
}
