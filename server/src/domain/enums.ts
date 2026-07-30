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
