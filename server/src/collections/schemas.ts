// ============================================================================
// Write-side validation for the generic /col + /batch endpoints.
//
// The document store accepts arbitrary JSON, which is how malformed documents
// used to reach the DB (the frontend still parses defensively — see
// `safeJsonField` in store.ts). This module is the server-side data contract:
// every create/set/update is validated against a per-collection schema before
// it is written.
//
// Design goals (deliberately conservative so we never reject a legitimate write
// the app already performs):
//   • Documents must be JSON OBJECTS (never arrays/primitives/null).
//   • Unknown keys PASS THROUGH (`.passthrough()`) — the model still evolves in
//     the frontend, and we don't want to gate every new field on a server bump.
//   • Known identity/enum fields are validated ONLY WHEN PRESENT, so partial
//     updates and legacy-shaped docs are unaffected.
// The value: a typo'd role, a non-string owner id, or a garbage enum can no
// longer be persisted — the write is rejected with a precise 422 instead of
// silently corrupting scoring/authorization downstream.
// ============================================================================
import { z } from 'zod';
import type { CollectionName } from './registry.js';
// Canonical enums — the single source of truth shared with authz.ts (and
// asserted against the migration CHECK constraints in contracts.test.ts).
import {
  ROLE,
  USER_STATUS,
  ORG_LEVEL,
  WORK_EXPERIENCE_STATUS,
  DEVELOPMENT_PLAN_STATUS,
  SKILL_CRITICALITY,
} from '../domain/enums.js';

// A reference id, when the field is present. Must be a string; the EMPTY STRING
// is accepted and means "not set" — the frontend forms write `''` for cleared
// selects (e.g. a user with no job profile / department yet), so rejecting it
// would 422 every legitimate create. What this still blocks is a non-string
// (number/object/array) id, which is what would actually break authz scoping
// or joins.
const id = z.string();

// Base every document shares: an object with an optional string `id`, allowing
// any additional keys. Per-collection schemas `.extend()` this and stay
// `.passthrough()` so unrecognised fields are preserved untouched.
const baseDoc = z.object({ id: z.string().min(1).optional() }).passthrough();

const usersSchema = baseDoc.extend({
  email: z.string().email().optional(),
  role: z.enum(ROLE).optional(),
  status: z.enum(USER_STATUS).optional(),
  orgLevel: z.enum(ORG_LEVEL).optional(),
  departmentId: id.optional(),
  generalDepartmentId: id.optional(),
  managerId: id.optional(),
  jobProfileId: id.optional(),
});

const assessmentsSchema = baseDoc.extend({
  subjectId: id.optional(),
  raterId: id.optional(),
  skillId: id.optional(),
  cycleId: id.optional(),
  // score is intentionally unconstrained in range: exams import 0–100 while
  // 360°/OJT use the 1–5 scale. We only require it be a finite number if sent.
  score: z.number().finite().optional(),
});

const evidencesSchema = baseDoc.extend({
  userId: id.optional(),
  skillId: id.optional(),
  status: z.string().optional(),
});

const jobProfilesSchema = baseDoc.extend({
  departmentId: id.optional(),
  orgLevel: z.enum(ORG_LEVEL).optional(),
});

// Competency standards. Only `criticality` is really policed: it multiplies
// every gap this skill produces in the training-needs ranking, so a typo'd
// value would quietly mis-rank a training budget. `levels` and
// `assessmentMethods` stay undeclared — preparePayload stringifies neither
// consistently and their shape still moves with the frontend.
const skillsSchema = baseDoc.extend({
  name: z.string().min(1).optional(),
  criticality: z.enum(SKILL_CRITICALITY).optional(),
});

const departmentsSchema = baseDoc.extend({
  parentId: id.optional(),
  managerId: id.optional(),
});

const notificationsSchema = baseDoc.extend({
  userId: id.optional(),
});

const workExperiencesSchema = baseDoc.extend({
  userId: id.optional(),
  employer: z.string().min(1).optional(),
  jobTitle: z.string().min(1).optional(),
  startDate: z.string().min(1).optional(),
  status: z.enum(WORK_EXPERIENCE_STATUS).optional(),
  // `skills` is deliberately NOT declared. store.ts's preparePayload
  // JSON.stringify()s nested arrays before writing (same as users.certificates),
  // so on the wire this field is a STRING, not an array. passthrough() carries it
  // untouched. Declaring it as z.array() here would 422 every write.
});

// Training catalogue. `linkedSkillIds` IS declared (unlike workExperiences.skills)
// because preparePayload does not stringify it — it goes over the wire as a real
// JSON array, and a course whose links are the wrong shape can never be matched
// to a gap. Everything else stays optional so a partial update is unaffected.
const trainingCoursesSchema = baseDoc.extend({
  title: z.string().min(1).optional(),
  provider: z.string().optional(),
  type: z.enum(['INTERNAL', 'EXTERNAL', 'OJT']).optional(),
  linkedSkillIds: z.array(z.string()).optional(),
  targetLevel: z.number().int().min(1).max(5).optional(),
  durationHours: z.number().nonnegative().optional(),
  costPerSeat: z.number().nonnegative().optional(),
});

// Saved development plans (migration 006). `items` IS declared as a real array
// — store.ts's preparePayload has no stringify rule for this collection, so it
// arrives as JSON, and an items field of the wrong shape would break every
// progress/sign-off reader. The per-item contract is deliberately thin (id +
// skillId + status) so the UI can keep adding fields without a server bump,
// but a plan can never be written with items that are not objects.
const developmentPlanItemSchema = z
  .object({
    id: z.string().min(1).optional(),
    skillId: id.optional(),
    status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    requiredLevel: z.number().finite().optional(),
    levelAtPlanning: z.number().finite().optional(),
    levelAtSignOff: z.number().finite().optional(),
    supervisorSignOff: z.boolean().optional(),
  })
  .passthrough();

const developmentPlansSchema = baseDoc.extend({
  userId: id.optional(),
  title: z.string().optional(),
  status: z.enum(DEVELOPMENT_PLAN_STATUS).optional(),
  jobProfileId: id.optional(),
  createdBy: id.optional(),
  items: z.array(developmentPlanItemSchema).optional(),
});

// Collections without a specific contract still must be JSON objects.
// (`appSettings` is intentionally absent — it holds free-form admin config and
// is already admin-write-only via ADMIN_WRITE_COLLECTIONS in authz.ts.)
const SCHEMAS: Partial<Record<CollectionName, z.ZodTypeAny>> = {
  users: usersSchema,
  assessments: assessmentsSchema,
  evidences: evidencesSchema,
  jobProfiles: jobProfilesSchema,
  skills: skillsSchema,
  departments: departmentsSchema,
  notifications: notificationsSchema,
  workExperiences: workExperiencesSchema,
  trainingCourses: trainingCoursesSchema,
  developmentPlans: developmentPlansSchema,
};

export interface ValidationResult {
  ok: boolean;
  /** Human-readable first issue, safe to return to the client. */
  message?: string;
  /** All issues (path + message), for logs / detailed error responses. */
  issues?: { path: string; message: string }[];
}

/**
 * Validate an incoming document for a collection. Returns `{ ok: true }` on
 * success, or `{ ok: false, message, issues }` describing what to reject.
 */
export function validateDoc(collection: CollectionName, doc: unknown): ValidationResult {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, message: 'document must be a JSON object' };
  }
  const schema = SCHEMAS[collection] ?? baseDoc;
  const parsed = schema.safeParse(doc);
  if (parsed.success) return { ok: true };

  const issues = parsed.error.issues.map((i) => ({
    path: i.path.join('.') || '(root)',
    message: i.message,
  }));
  return {
    ok: false,
    message: `${issues[0].path}: ${issues[0].message}`,
    issues,
  };
}
