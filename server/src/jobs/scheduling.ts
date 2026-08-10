// ============================================================================
// Scheduling domain — the server-side port of the "when is this due" maths that
// until now existed ONLY in the browser (`src/services/store.ts`:
// getSkillAssessmentMethods → isUserInAudience → computeMethodNextDueDate →
// getNextAssessmentDate, plus the certificate expiry banding inside
// checkCertificationExpiries).
//
// Everything here is PURE: no DB, no clock of its own (`now` is always passed
// in). That is what makes the nightly sweep testable and what keeps it honest
// against the frontend — same inputs, same answer.
//
// PARITY NOTES (read before changing either side):
//   • The frontend falls back to synthesizing method blocks from the deprecated
//     linked instructions / per-skill fields (`synthesizeLegacyMethods`). Every
//     synthesized block is `frequency: 'ONE_TIME'`, and a ONE_TIME block never
//     becomes due — so for a DUE SWEEP the fallback contributes nothing and is
//     deliberately not ported. A skill with no inline `assessmentMethods` is
//     simply never chased.
//   • `isUserInAudience`'s MANAGERS_ONLY case uses the frontend's
//     `DataService.isManager` rule, which is NOT the same set as authz.ts's
//     ORG_MANAGER_LEVELS (that one also counts SP). Audience matching must
//     agree with what the employee sees on their own dashboard, so this file
//     mirrors the store, not authz. See MANAGERIAL_ORG_LEVELS below.
// ============================================================================

/** How often a method block recurs. Mirrors `AssessmentFrequency` in src/types.ts. */
export type Frequency =
  | 'ONE_TIME'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'ANNUAL_FIXED_DATE'
  | 'ANYTIME_ANNUAL'
  | 'CERTIFICATE_BASED';

/** One inline assessment block on a skill (`Skill.assessmentMethods[]`). */
export interface MethodBlock {
  method?: string;
  frequency?: Frequency | string;
  audience?: string;
  audienceOrgLevels?: string[];
  audienceDepartmentIds?: string[];
  fixedMonth?: number;
  fixedDay?: number;
  /** 360°/OJT rater blend override — read by the scoring port (scoring.ts). */
  raterWeights?: { self?: number; peer?: number; manager?: number };
}

/** The slice of a user document the scheduling maths needs. */
export interface SweepUser {
  /** Canonical id (`data.id`), the id every activity document keys off. */
  id: string;
  /** Table id — what the users row is actually keyed by (may differ post-ETL). */
  rowId: string;
  name: string;
  email?: string;
  role?: string;
  status?: string;
  orgLevel?: string;
  departmentId?: string;
  managerId?: string;
  jobProfileId?: string;
  isArchived?: boolean;
  certificates: CertificateLike[];
  /** True when at least one other user reports to this one. */
  hasSubordinates: boolean;
}

export interface CertificateLike {
  id?: string;
  name?: string;
  expiryDate?: string;
  noExpiry?: boolean;
  renewalStatus?: string;
  [k: string]: unknown;
}

/** Org levels that make someone a manager for AUDIENCE matching — mirrors
 *  `DataService.isManager` in src/services/store.ts (note: no 'SP'). */
export const MANAGERIAL_ORG_LEVELS = ['CEO', 'ACEO', 'GM', 'AGM', 'DM', 'SH'] as const;

/**
 * A JSONB field that may arrive as a real array/object OR as a JSON string,
 * because the frontend's `preparePayload` stringifies some nested fields on the
 * way out (users.certificates, skills.assessmentMethods, jobProfiles.requiredSkills).
 * Mirrors `safeJsonField` in the store: never throws, always yields the fallback.
 */
export function safeJson<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Same rule as the store's `isManager`, minus the ADMIN/CEO role shortcut being
 *  the only path — role, real subordinates, then hierarchy level. */
export function isManagerUser(user: SweepUser): boolean {
  if (user.role === 'ADMIN' || user.role === 'CEO') return true;
  if (user.hasSubordinates) return true;
  return !!user.orgLevel && (MANAGERIAL_ORG_LEVELS as readonly string[]).includes(user.orgLevel);
}

/** Does a method block's audience include this user? Port of `isUserInAudience`. */
export function isUserInAudience(user: SweepUser, block: MethodBlock): boolean {
  switch (block.audience) {
    case 'ALL':
      return true;
    case 'FRESH_ONLY':
      return user.orgLevel === 'FR';
    case 'MANAGERS_ONLY':
      return isManagerUser(user);
    case 'ORG_LEVELS':
      return !!user.orgLevel && (block.audienceOrgLevels || []).includes(user.orgLevel);
    case 'DEPARTMENTS':
      return (block.audienceDepartmentIds || []).includes(user.departmentId ?? '');
    default:
      // Undefined/unknown audience: the frontend returns false, so does this.
      return false;
  }
}

/** What the due-date maths needs to know about one user+skill's history. */
export interface DueContext {
  now: Date;
  /** Most recent non-archived assessment date for this user+skill, if any. */
  lastAssessment: Date | null;
  /** Latest expiry across APPROVED evidences carrying an expiryDate, if any. */
  latestCertificateExpiry: Date | null;
}

/**
 * Next due date for ONE method block, or null when it never recurs.
 * Line-for-line port of `computeMethodNextDueDate` in the store.
 */
export function methodNextDueDate(block: MethodBlock, ctx: DueContext): Date | null {
  const { now, lastAssessment, latestCertificateExpiry } = ctx;

  if (block.frequency === 'ONE_TIME' || !block.frequency) return null;

  if (block.frequency === 'CERTIFICATE_BASED') {
    // Due until a valid certificate exists; then due when that certificate expires.
    return latestCertificateExpiry ?? now;
  }

  if (block.frequency === 'ANNUAL_FIXED_DATE') {
    const month = (block.fixedMonth ?? 1) - 1; // JS months are 0-based
    const day = block.fixedDay ?? 1;
    let lastDue = new Date(now.getFullYear(), month, day);
    if (lastDue > now) lastDue = new Date(now.getFullYear() - 1, month, day);
    if (!lastAssessment || lastAssessment < lastDue) return now; // never done since the fixed date
    const next = new Date(now.getFullYear(), month, day);
    if (next <= now) next.setFullYear(next.getFullYear() + 1);
    return next;
  }

  if (block.frequency === 'ANYTIME_ANNUAL') {
    if (!lastAssessment || lastAssessment.getFullYear() < now.getFullYear()) return now;
    return new Date(now.getFullYear() + 1, 0, 1);
  }

  // Rolling intervals: WEEKLY / MONTHLY / QUARTERLY.
  if (!lastAssessment) return now; // never assessed ⇒ due now
  const next = new Date(lastAssessment);
  if (block.frequency === 'WEEKLY') next.setDate(next.getDate() + 7);
  else if (block.frequency === 'MONTHLY') next.setMonth(next.getMonth() + 1);
  else if (block.frequency === 'QUARTERLY') next.setMonth(next.getMonth() + 3);
  else return null; // unknown frequency ⇒ don't invent a schedule
  return next;
}

/**
 * Earliest (most urgent) due date across every block that applies to this user.
 * Null when nothing schedules the skill — treated as one-time, never chased.
 * Port of `getNextAssessmentDate`.
 */
export function nextAssessmentDate(user: SweepUser, blocks: MethodBlock[], ctx: DueContext): Date | null {
  const applicable = blocks.filter((b) => isUserInAudience(user, b));
  let earliest: Date | null = null;
  for (const block of applicable) {
    const due = methodNextDueDate(block, ctx);
    if (!due) continue;
    if (!earliest || due < earliest) earliest = due;
  }
  return earliest;
}

export type RenewalStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';

/**
 * Certificate banding, ported from `checkCertificationExpiries`. Returns the
 * status plus the whole-day countdown (negative once expired).
 *
 * Difference from the browser version, on purpose: the browser only notified
 * when `diffDays` landed EXACTLY on 90/60/30, so a certificate whose 30-day
 * mark fell on a day nobody logged in was never announced. The sweep bands
 * instead (see `expiryBucket`), so a window can't be missed.
 */
export function certificateStatus(expiryDate: string, now: Date): { status: RenewalStatus; diffDays: number } {
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { status: 'EXPIRED', diffDays };
  if (diffDays <= 90) return { status: 'EXPIRING_SOON', diffDays };
  return { status: 'VALID', diffDays };
}

/** The warning window a certificate currently sits in, or null when it's fine.
 *  Part of the notification dedupe key, so each window announces exactly once. */
export function expiryBucket(diffDays: number): 'expired' | '30' | '60' | '90' | null {
  if (diffDays <= 0) return 'expired';
  if (diffDays <= 30) return '30';
  if (diffDays <= 60) return '60';
  if (diffDays <= 90) return '90';
  return null;
}

/** `2026-08` — the period stamp that makes an employee nudge monthly. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `2026-W32` — ISO week stamp that makes the manager digest weekly. */
export function weekKey(d: Date): string {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // ISO: week belongs to the year of its Thursday.
  const dayNum = (target.getUTCDay() + 6) % 7; // Mon=0
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
