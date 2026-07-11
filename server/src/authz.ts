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

const ORG_MANAGER_LEVELS = ['CEO', 'GM', 'AGM', 'DM', 'SH', 'SP'];
const VALID_ORG_LEVELS = ['CEO', 'GM', 'AGM', 'DM', 'SH', 'SP', 'JP', 'FR'];

// ── Helper predicates (mirror the rules' helper functions) ──────────────────

export function isAdmin(user: AuthedUser): boolean {
  if (user.role === 'ADMIN') return true;
  return config.bootstrapAdminEmail !== '' && user.email.toLowerCase() === config.bootstrapAdminEmail;
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

function isManagerLevel(user: AuthedUser): boolean {
  return !!user.orgLevel && ORG_MANAGER_LEVELS.includes(user.orgLevel);
}

async function isManagerOf(ctx: PolicyCtx, targetUserId?: string): Promise<boolean> {
  if (!targetUserId) return false;
  const target = await ctx.getUserDoc(targetUserId);
  return !!target && target.managerId === ctx.user.id;
}

function isValidOrgLevel(doc?: Doc | null): boolean {
  if (!doc || !('orgLevel' in doc) || doc.orgLevel == null) return true;
  return VALID_ORG_LEVELS.includes(doc.orgLevel);
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
      // read + create: any authenticated; update/delete: admin.
      return action === 'read' || action === 'create' ? true : admin;
    case 'evidences':
      return evidencesPolicy(action, ctx, admin);
    case 'notifications':
      return notificationsPolicy(action, ctx);
    case 'nominations':
      return nominationsPolicy(action, ctx, admin);
    default:
      return false;
  }
}

// ── Per-collection policies ─────────────────────────────────────────────────

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
      const roleUnchanged = !!existing && !!incoming && incoming.role === existing.role;
      if (isOwner(user, docId) && roleUnchanged) return true;
      if (admin) return true;
      // manager updating a subordinate (may not change role)
      const managesTarget = !!existing && existing.managerId === user.id;
      return (managesTarget || isManagerLevel(user)) && roleUnchanged;
    }
    case 'delete': {
      if (admin) return true;
      // A user may delete their own profile (matched by email), used in migration.
      return (
        !!existing &&
        typeof existing.email === 'string' &&
        existing.email.toLowerCase() === user.email.toLowerCase()
      );
    }
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
      return !!incoming && (incoming.userId === user.id || admin);
    case 'update':
      if (admin) return true;
      if (existing && existing.userId === user.id && existing.status === 'PENDING') return true;
      return isManagerOf(ctx, existing?.userId);
    case 'delete':
      return admin;
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
    case 'nominations': {
      const cond: Filter[] = [
        { field: 'nominatorId', op: 'eq', value: self },
        { field: 'subjectId', op: 'eq', value: self },
        { field: 'raterId', op: 'eq', value: self },
      ];
      return { or: cond };
    }
    // users, activityLogs and the catalog/config collections stay open-read.
    default:
      return null;
  }
}
