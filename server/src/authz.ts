// ============================================================================
// Authorization — server-side port of firestore.rules.
//
// This is the ONLY trust boundary now. Firestore used to enforce these rules;
// here the API does. Every check below maps 1:1 to a rule in
// firestore.rules.template. Keep the two in sync until Firestore is retired.
// ============================================================================
import { config } from './config.js';
import type { CollectionName } from './collections/registry.js';
import type { Filter, ScopeFilter } from './collections/query.js';
import type { AuthedUser } from './types.js';
// Org-level value sets come from the shared enum module so authz can never drift
// from the zod schemas / migration CHECKs again (was the root cause of F-1).
import { ORG_LEVEL } from './domain/enums.js';

export type Action = 'read' | 'create' | 'update' | 'delete';

type Doc = Record<string, any>;

export interface PolicyCtx {
  user: AuthedUser;
  docId?: string;
  existing?: Doc | null; // current stored document (update/delete/read-one)
  incoming?: Doc | null; // new or merged document (create/update)
  // Looks up another user's document (for manager-of checks). Returns null if absent.
  getUserDoc: (id: string) => Promise<Doc | null>;
}

// ── Helper predicates (mirror the rules' helper functions) ──────────────────

export function isAdmin(user: AuthedUser): boolean {
  if (user.role === 'ADMIN') return true;
  // The bootstrap grant is keyed on the address the session SIGNED IN with
  // (`auth_credentials`), never on the users document's `email` field. The
  // document is user-writable, so comparing it here let any employee become
  // admin by PATCHing their own email to the bootstrap address (hole H2).
  return config.bootstrapAdminEmail !== '' && user.authEmail.toLowerCase() === config.bootstrapAdminEmail;
}

// Org-wide readers: admins + the CEO. These roles legitimately see everyone's
// performance data (executive analytics), so their personal-data reads are not
// scoped. Everyone else is limited to their own + their subordinates' records.
function canReadAll(user: AuthedUser): boolean {
  return isAdmin(user) || user.role === 'CEO';
}

// The user's canonical `id` field. Activity docs (assessments/evidences/…) key
// their owner/subject/rater fields by this canonical id, which post-migration can
// differ from the auth uid; `managerId` uses it too. Falls back to the table id.
function canonicalId(user: AuthedUser): string {
  const cid = (user.data as Record<string, unknown> | undefined)?.id;
  return String(cid ?? user.id);
}

function isOwner(user: AuthedUser, userId?: string): boolean {
  return !!userId && user.id === userId;
}

// Walks up a target's management chain to decide whether the caller manages them
// (directly or transitively). Used to authorize single-doc reads of a
// subordinate's records. Bounded by org depth so a cyclic managerId can't loop.
async function isAncestorManager(ctx: PolicyCtx, targetUserId?: string): Promise<boolean> {
  if (!targetUserId) return false;
  const self = canonicalId(ctx.user);
  if (targetUserId === self) return false; // reading your own record is handled by owner checks
  let node = await ctx.getUserDoc(targetUserId);
  for (let hops = 0; node && hops < 32; hops++) {
    const mgr = node.managerId as string | undefined;
    if (!mgr) return false;
    if (mgr === self) return true;
    node = await ctx.getUserDoc(mgr);
  }
  return false;
}

// NOTE: there is deliberately no "holds a manager-grade org level" predicate any
// more. Being senior is not the same as managing THIS person — use
// isAncestorManager, which follows the actual management chain (hole H3).

async function isManagerOf(ctx: PolicyCtx, targetUserId?: string): Promise<boolean> {
  if (!targetUserId) return false;
  const target = await ctx.getUserDoc(targetUserId);
  return !!target && target.managerId === ctx.user.id;
}

function isValidOrgLevel(doc?: Doc | null): boolean {
  if (!doc || !('orgLevel' in doc) || doc.orgLevel == null) return true;
  return (ORG_LEVEL as readonly string[]).includes(doc.orgLevel);
}

// Collections that only admins may write; everyone authenticated may read.
const ADMIN_WRITE_COLLECTIONS: CollectionName[] = [
  'skills',
  'departments',
  'jobProfiles',
  'assessmentCycles',
  'scheduledAssessments',
  'assessmentPlans',
  'assessmentInstructions',
  'trainingCourses',
  'projects',
  // Company-wide admin config (e.g. the work-experience → level band table).
  // Every authenticated client reads it to compute provisional scores; only an
  // admin may change it.
  'appSettings',
];

// ── Main entry point ────────────────────────────────────────────────────────

export async function can(collection: CollectionName, action: Action, ctx: PolicyCtx): Promise<boolean> {
  const admin = isAdmin(ctx.user);

  // Admin-write collections: read=any authenticated, write=admin only.
  if (ADMIN_WRITE_COLLECTIONS.includes(collection)) {
    return action === 'read' ? true : admin;
  }

  switch (collection) {
    case 'users':
      return usersPolicy(action, ctx, admin);
    case 'assessments':
      return assessmentsPolicy(action, ctx, admin);
    case 'activityLogs':
      return activityLogsPolicy(action, ctx, admin);
    case 'evidences':
      return evidencesPolicy(action, ctx, admin);
    case 'workExperiences':
      return workExperiencesPolicy(action, ctx, admin);
    case 'developmentPlans':
      return developmentPlansPolicy(action, ctx, admin);
    case 'notifications':
      return notificationsPolicy(action, ctx);
    case 'nominations':
      return nominationsPolicy(action, ctx, admin);
    default:
      return false;
  }
}

// ── Per-collection policies ─────────────────────────────────────────────────

// Fields of a users document that decide privilege, identity or org position.
// Only an admin may change them. Everything else on the document (name, avatar,
// phone, certificates, …) stays writable by the owner and by their managers.
//
// Pinning `role` alone was not enough: an employee could raise their own
// `orgLevel` (H1), hand themselves the bootstrap admin address (H2), re-point
// `managerId` at themselves to gain read access to another person's records, or
// flip `status`/`isArchived` to lock someone out.
const PROTECTED_USER_FIELDS = [
  'id',
  'email',
  'role',
  'status',
  'orgLevel',
  'managerId',
  'departmentId',
  'jobProfileId',
  'isArchived',
] as const;

// Absent / null / undefined are ONE state here: a PATCH that never mentions a
// field must not read as "cleared it". Objects/arrays compare structurally.
function sameFieldValue(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

function privilegedUserFieldsUnchanged(existing?: Doc | null, incoming?: Doc | null): boolean {
  if (!existing || !incoming) return false;
  return PROTECTED_USER_FIELDS.every((f) => sameFieldValue(existing[f], incoming[f]));
}

function usersPolicy(action: Action, ctx: PolicyCtx, admin: boolean): boolean | Promise<boolean> {
  const { user, docId, existing, incoming } = ctx;
  switch (action) {
    case 'read':
      // Deliberate carve-out: the `users` collection is the internal company
      // directory (name, title, org position, manager) and must stay broadly
      // readable — the org chart, name resolution, 360° peer pickers and the
      // department-scoped roster all depend on it, and the SPA falls back to a
      // broad users read in transient states. The sensitive performance data
      // (scores, evidence) lives in `assessments`/`evidences`, which ARE scoped.
      // Revisit if a customer requires a private directory.
      return true; // any authenticated
    case 'create':
      return (isOwner(user, docId) || admin) && isValidOrgLevel(incoming);
    case 'update': {
      if (!isValidOrgLevel(incoming)) return false;
      if (admin) return true;
      // Nobody but an admin may touch the privilege/identity fields, whether the
      // document is their own or a subordinate's.
      if (!privilegedUserFieldsUnchanged(existing, incoming)) return false;
      if (isOwner(user, docId)) return true; // own profile: name, avatar, certificates…
      // A manager maintaining one of their own people (e.g. approving a
      // subordinate's certificate). It must be a REAL management relationship —
      // holding a manager-grade org level used to be enough to rewrite any
      // stranger's document, including the CEO's (H3). isAncestorManager walks
      // the chain by canonical id, which is what `managerId` actually holds.
      return isAncestorManager(ctx, existing?.id ? String(existing.id) : docId);
    }
    case 'delete':
      // Admin only. The old self-delete-by-email carve-out was a leftover of the
      // Firebase migration: it let anyone erase their own account while their
      // assessment history stayed behind, orphaned (H8). Removing a person is
      // Admin → Employees, which soft-deletes and reassigns their reports.
      return admin;
  }
}

async function assessmentsPolicy(action: Action, ctx: PolicyCtx, admin: boolean): Promise<boolean> {
  const { user, existing, incoming } = ctx;
  switch (action) {
    case 'read': {
      if (canReadAll(user)) return true;
      if (!existing) return false;
      const self = canonicalId(user);
      // Own records (as subject or rater), or a subordinate's, are visible.
      if (existing.subjectId === self || existing.raterId === self) return true;
      return isAncestorManager(ctx, existing.subjectId);
    }
    case 'create':
      return !!incoming && (incoming.raterId === user.id || admin);
    case 'update':
      return !!existing && (existing.raterId === user.id || admin);
    case 'delete':
      return admin;
  }
}

// ── The verdict rule (holes H4 + H5) ───────────────────────────────────────
//
// Evidence and work experience are both SUBMISSIONS: the employee sends a
// claim, somebody else judges it, and the judgement is what feeds a score.
// Nothing used to separate the two halves, so a plain employee could POST an
// evidence record already `APPROVED` with `assignedScore: 5` (H4), or a work
// experience already `VERIFIED` with a `verifiedLevel` (H5) — a self-awarded
// competency level, over the API, in one call.
//
// The rule below is the whole fix and it is deliberately one rule for both
// collections: **a write by the SUBJECT of the record may never carry a
// verdict.** It must arrive/stay PENDING, and the reviewer's fields must be
// exactly what they already were (absent, on a create). Clearing them is
// allowed — that is what re-submitting an edited record does. Only somebody
// else (the person's manager, via the existing manager branch) or an admin can
// write the verdict, which is what the manager review screens already do.

const EVIDENCE_VERDICT_FIELDS = ['assignedScore', 'reviewedAt', 'reviewedBy', 'reviewerComment'] as const;
const EXPERIENCE_VERDICT_FIELDS = ['reviewedAt', 'reviewedBy', 'reviewerComment'] as const;

// Is this write by the person the record is ABOUT? Matches on both id shapes:
// create/update compare the raw auth uid while stored activity docs key on the
// canonical id, and post-migration the two legitimately differ. Either match
// counts, which is the safe direction — it can only pull MORE writes into the
// stricter branch, never fewer.
function isSubjectOfRecord(user: AuthedUser, doc?: Doc | null): boolean {
  const owner = doc?.userId;
  if (!owner) return false;
  return owner === user.id || owner === canonicalId(user);
}

// `workExperiences.skills` arrives as a JSON STRING (store.ts's preparePayload
// stringifies it, which is also why the zod schema leaves it undeclared), so
// parse before looking for a level. An unparseable value is treated as
// "carries a level" — refuse rather than guess.
function experienceSkillsCarryVerifiedLevel(value: unknown): boolean {
  if (value == null) return false;
  let skills: unknown = value;
  if (typeof value === 'string') {
    try {
      skills = JSON.parse(value);
    } catch {
      return true;
    }
  }
  if (!Array.isArray(skills)) return true;
  return skills.some((s) => s && typeof s === 'object' && (s as Doc).verifiedLevel != null);
}

// Shared by both policies. `existing` is absent on a create, which makes every
// verdict field "must be absent" — exactly what is wanted.
function carriesNoVerdict(
  fields: readonly string[],
  pendingStatus: string,
  existing?: Doc | null,
  incoming?: Doc | null,
): boolean {
  if (!incoming) return false;
  if (incoming.status != null && incoming.status !== pendingStatus) return false;
  return fields.every((f) => incoming[f] == null || sameFieldValue(existing?.[f], incoming[f]));
}

async function evidencesPolicy(action: Action, ctx: PolicyCtx, admin: boolean): Promise<boolean> {
  const { user, existing, incoming } = ctx;
  switch (action) {
    case 'read': {
      if (canReadAll(user)) return true;
      if (!existing) return false;
      if (existing.userId === canonicalId(user)) return true; // own submission
      return isAncestorManager(ctx, existing.userId); // a subordinate's
    }
    case 'create':
      if (admin) return true;
      // Your own submission only, and it arrives as a REQUEST: PENDING, unscored
      // (H4 — this used to accept status APPROVED + assignedScore 5).
      if (!incoming || incoming.userId !== user.id) return false;
      return carriesNoVerdict(EVIDENCE_VERDICT_FIELDS, 'PENDING', null, incoming);
    case 'update':
      if (admin) return true;
      if (existing && existing.userId === user.id && existing.status === 'PENDING') {
        // Editing your own pending submission re-opens it; it may never be the
        // act that approves or scores it.
        return carriesNoVerdict(EVIDENCE_VERDICT_FIELDS, 'PENDING', existing, incoming);
      }
      // The reviewer branch. A manager judging one of their own people writes
      // the verdict here — but never on their own record.
      if (isSubjectOfRecord(user, existing) || isSubjectOfRecord(user, incoming)) return false;
      return isManagerOf(ctx, existing?.userId);
    case 'delete':
      return admin;
  }
}

// Work experience is employee-submitted and manager-verified, so it takes the
// same owner-scoped shape as evidences above — including the deliberate split
// between canonicalId(user) on READ and the raw user.id on create/update
// (activity documents store the canonical id, while a freshly created doc is
// stamped with the auth uid). Do NOT "harmonise" those two: post-migration they
// legitimately differ, and collapsing them breaks either reads or writes.
//
// Verification is a manager write: a direct manager may PATCH a subordinate's
// entry, which is how status=VERIFIED and the per-skill verifiedLevel are set.
// The owner may keep editing only while the entry is still PENDING — once a
// verdict exists, changing it requires re-submission through the client, which
// resets the status.
async function workExperiencesPolicy(action: Action, ctx: PolicyCtx, admin: boolean): Promise<boolean> {
  const { user, existing, incoming } = ctx;
  switch (action) {
    case 'read': {
      if (canReadAll(user)) return true;
      if (!existing) return false;
      if (existing.userId === canonicalId(user)) return true; // own record
      return isAncestorManager(ctx, existing.userId); // a subordinate's
    }
    case 'create':
      if (admin) return true;
      // As with evidence: your own record, submitted PENDING and unverified —
      // no verdict fields and no per-skill `verifiedLevel` (H5).
      if (!incoming || incoming.userId !== user.id) return false;
      return (
        carriesNoVerdict(EXPERIENCE_VERDICT_FIELDS, 'PENDING', null, incoming) &&
        !experienceSkillsCarryVerifiedLevel(incoming.skills)
      );
    case 'update':
      if (admin) return true;
      if (existing && existing.userId === user.id && existing.status === 'PENDING') {
        if (!carriesNoVerdict(EXPERIENCE_VERDICT_FIELDS, 'PENDING', existing, incoming)) return false;
        // Untouched skills come back merged, so "unchanged" is as acceptable as
        // "cleared" — what is refused is the owner ADDING a verified level.
        return (
          !experienceSkillsCarryVerifiedLevel(incoming?.skills) ||
          sameFieldValue(existing.skills, incoming?.skills)
        );
      }
      if (isSubjectOfRecord(user, existing) || isSubjectOfRecord(user, incoming)) return false;
      return isManagerOf(ctx, existing?.userId);
    case 'delete':
      // Deliberately looser than evidencesPolicy (admin-only): an employee may
      // withdraw a record they submitted by mistake, but only while it is still
      // PENDING. Once verified it is part of the competency audit trail and only
      // an admin may remove it.
      if (admin) return true;
      return !!existing && existing.userId === user.id && existing.status === 'PENDING';
  }
}

// A development plan is the employee's own training agreement. Reads follow the
// same owner + management-chain shape as evidences/workExperiences.
//
// Writes are deliberately WIDER than work experience on one axis and narrower on
// another. Wider: the whole plan document is one row, so an employee marking an
// item "in progress" and their manager signing that item off are both PATCHes of
// the same doc — the owner therefore keeps write access for the plan's whole
// life, not only while it is PENDING (there is no such state here). Narrower:
// only the plan's owner, their manager (any ancestor, so a section head can act
// for an absent direct supervisor) or an admin may write at all — nobody else
// can create a plan in someone else's name.
//
// The sign-off flag itself is NOT policed here: doing so would need a field-level
// diff of a JSON array, which this layer does not do for any collection. The
// client sets it only through the manager surfaces; treat it as an integrity
// control, not a security boundary — an employee editing their own plan can
// forge their own sign-off. If that ever matters commercially, move sign-off to
// its own collection rather than trying to diff items here.
async function developmentPlansPolicy(action: Action, ctx: PolicyCtx, admin: boolean): Promise<boolean> {
  const { user, existing, incoming } = ctx;
  const ownerOf = (doc?: Doc | null) => doc?.userId as string | undefined;

  switch (action) {
    case 'read': {
      if (canReadAll(user)) return true;
      if (!existing) return false;
      if (ownerOf(existing) === canonicalId(user)) return true; // own plan
      return isAncestorManager(ctx, ownerOf(existing)); // a subordinate's
    }
    case 'create': {
      if (admin) return true;
      if (!incoming) return false;
      const target = ownerOf(incoming);
      if (target === user.id) return true; // writing my own plan
      return isAncestorManager(ctx, target); // a manager assigning one
    }
    case 'update': {
      if (admin) return true;
      if (!existing) return false;
      if (ownerOf(existing) === user.id) return true; // progress updates
      return isAncestorManager(ctx, ownerOf(existing)); // status / sign-off
    }
    case 'delete': {
      if (admin) return true;
      // Only a plan nobody has agreed to yet can be thrown away; once ACTIVE it
      // is part of the competency record and is ARCHIVED, never deleted.
      if (!existing || existing.status !== 'DRAFT') return false;
      if (ownerOf(existing) === user.id) return true;
      return isAncestorManager(ctx, ownerOf(existing));
    }
  }
}

function notificationsPolicy(action: Action, ctx: PolicyCtx): boolean {
  const { user, existing, incoming } = ctx;
  switch (action) {
    case 'read':
      return !!existing && existing.userId === user.id; // owner-only
    case 'create':
      return !!incoming && typeof incoming.userId === 'string';
    case 'update':
    case 'delete':
      return !!existing && existing.userId === user.id;
  }
}

function activityLogsPolicy(action: Action, ctx: PolicyCtx, admin: boolean): boolean {
  const { user, existing, incoming } = ctx;
  switch (action) {
    case 'read':
      // The audit trail is not a public feed. Org-wide readers (admin/CEO) see
      // everything; everyone else sees only entries they authored. List reads are
      // held to the same boundary in `listScope` so a query can't over-return.
      return canReadAll(user) || (!!existing && existing.actorId === canonicalId(user));
    case 'create': {
      // Anyone may append to the log, but only under their OWN identity — an
      // entry can't be attributed to another user's id. System events carry no
      // actorId (pre-auth) and attribute to no one, so they're allowed.
      const actorId = incoming?.actorId;
      return admin || actorId == null || actorId === canonicalId(user);
    }
    default:
      return admin; // update / delete — admin only
  }
}

function nominationsPolicy(action: Action, ctx: PolicyCtx, admin: boolean): boolean {
  const { user, existing, incoming } = ctx;
  switch (action) {
    case 'read': {
      if (canReadAll(user)) return true;
      if (!existing) return false;
      const self = canonicalId(user);
      // Visible to the nominator, the subject, and the assigned rater.
      return existing.nominatorId === self || existing.subjectId === self || existing.raterId === self;
    }
    case 'create':
      return !!incoming && incoming.nominatorId === user.id && incoming.raterId != null;
    case 'update':
      return !!existing && (existing.raterId === user.id || admin);
    case 'delete':
      return admin;
  }
}

// ── List scoping ────────────────────────────────────────────────────────────
// A list read must never return a row the caller could not read one-by-one, so we
// push the same access boundary into SQL as a mandatory AND filter. Returning
// `null` means "no restriction" (privileged org-wide reader, or an open catalog /
// directory collection). The scope is intentionally a SUPERSET of what the SPA
// already asks for (own records for employees, own subtree for managers), so
// enforcing it here tightens security without changing any legitimate result set.
//
// `getSubordinateIds(rootId)` returns the caller's full management subtree
// (self + all transitive reports, by canonical id); it hits the DB, hence async.
export async function listScope(
  collection: CollectionName,
  user: AuthedUser,
  getSubordinateIds: (rootCanonicalId: string) => Promise<string[]>,
): Promise<ScopeFilter | null> {
  const self = canonicalId(user);

  // Notifications are private to their owner — even for admins/CEO.
  if (collection === 'notifications') {
    return { or: [{ field: 'userId', op: 'eq', value: user.id }] };
  }

  // Admin / CEO read every other collection org-wide.
  if (canReadAll(user)) return null;

  switch (collection) {
    case 'assessments': {
      const subtree = await getSubordinateIds(self);
      return {
        or: [
          { field: 'subjectId', op: 'in', value: subtree }, // own + subordinates as subject
          { field: 'raterId', op: 'eq', value: self }, // evaluations I authored
        ],
      };
    }
    case 'evidences': {
      const subtree = await getSubordinateIds(self);
      return { or: [{ field: 'userId', op: 'in', value: subtree }] }; // own + subordinates
    }
    case 'workExperiences': {
      // MANDATORY, not an optimization: runList applies listScope and never
      // calls can(), so without this case every authenticated user could list
      // the whole company's employment history. Mirrors evidences.
      const subtree = await getSubordinateIds(self);
      return { or: [{ field: 'userId', op: 'in', value: subtree }] }; // own + subordinates
    }
    case 'developmentPlans': {
      // MANDATORY for the same reason as workExperiences above: runList applies
      // listScope and never calls can(), so without this case any authenticated
      // user could list the whole company's training plans and gaps.
      const subtree = await getSubordinateIds(self);
      return { or: [{ field: 'userId', op: 'in', value: subtree }] }; // own + subordinates
    }
    case 'nominations': {
      const cond: Filter[] = [
        { field: 'nominatorId', op: 'eq', value: self },
        { field: 'subjectId', op: 'eq', value: self },
        { field: 'raterId', op: 'eq', value: self },
      ];
      return { or: cond };
    }
    case 'activityLogs':
      // A non-privileged reader only ever lists their OWN audit entries (admins /
      // CEO already returned null above). Mirrors activityLogsPolicy's read rule.
      return { or: [{ field: 'actorId', op: 'eq', value: self }] };
    // users and the catalog/config collections stay open-read.
    default:
      return null;
  }
}
