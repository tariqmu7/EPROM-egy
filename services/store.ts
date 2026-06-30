import { User, Role, JobProfile, Skill, Project, Department, Assessment, ActivityLog, ORG_HIERARCHY_ORDER, ORG_LEVEL_NUMBERS, Notification, AssessmentCycle, Nomination, IndividualTrainingPlan, TrainingRecommendation, OrgLevel, Evidence, PromotionRequirement, CareerProgressionPlan, CareerLevelProgress, TrainingCourse, ScheduledAssessment, AssessmentMethod, UserStatus, Certificate, CareerHistoryEntry, SkillLevel, EvaluationQuestion, AssessmentPlan, AssessmentInstruction, SkillAssessmentMethod, AssessmentFrequency, AssessmentAudience, JobProfileSkill, DepartmentType, DEPT_TYPE_TO_ORG_LEVEL, RaterWeights, DEFAULT_RATER_WEIGHTS } from '../types';
import { db, auth } from '../firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  or,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  Unsubscribe,
  serverTimestamp,
  Timestamp,
  writeBatch,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth';

// ==========================================
// 🔧 APP CONFIGURATION
// ==========================================
export const CONFIG = {
  SOURCE: 'FIREBASE',
};

// 🛡️ Production safety guard.
// A 'MOCK' data source bypasses Firebase Auth entirely and exposes the dev
// login buttons. If a production build ever ships with SOURCE === 'MOCK',
// any company user could sign in as anyone — a complete auth bypass.
// Fail loudly at module load instead of silently serving an insecure app.
if (import.meta.env.PROD && CONFIG.SOURCE === 'MOCK') {
  throw new Error(
    "FATAL: CONFIG.SOURCE is 'MOCK' in a production build. This is a complete " +
    "authentication bypass. Set CONFIG.SOURCE to 'FIREBASE' before deploying."
  );
}

// ==========================================
// 🔑 BOOTSTRAP ADMIN
// ==========================================
// Email that is granted admin access before any user holds the ADMIN role.
// Set via the VITE_BOOTSTRAP_ADMIN_EMAIL env var (.env.local / .env.production).
// If unset, no email is treated as bootstrap admin — role-based admin still works.
export const BOOTSTRAP_ADMIN_EMAIL = (import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAIL || '')
  .trim()
  .toLowerCase();

export const isBootstrapAdminEmail = (email?: string | null): boolean =>
  BOOTSTRAP_ADMIN_EMAIL !== '' &&
  (email ?? '').trim().toLowerCase() === BOOTSTRAP_ADMIN_EMAIL;

// ==========================================
// 📉 LISTENER SAFETY CAP
// ==========================================
// Defensive runaway guard for every real-time listener. This is a
// circuit-breaker, NOT a functional page size: it must sit well above
// realistic org volume so it never silently truncates legitimate
// admin/CEO org-wide data (a too-low cap corrupts skill scores by
// dropping assessment/evidence docs). Non-privileged viewers are scoped
// by Direct Department / Section before this cap is ever reached, so for
// them this only ever trips on a misconfigured or abusively large
// collection. Tune if EPROM headcount/assessment volume approaches it.
// HARD LIMIT: Firestore rejects any structured query whose limit()
// exceeds 10000 ("Limit value ... is over the maximum value of 10000"),
// which fails the listener entirely. Do not raise this above 10000;
// scale past it via pagination/sharding, not a bigger cap.
const MAX_LISTENER_DOCS = 10000;

// ==========================================
// 🧯 SAFE JSON FIELD PARSING
// ==========================================
// Several Firestore fields (user certificates / careerHistory, skill
// levels & question banks) are persisted as JSON strings. These are read
// inside `snapshot.docs.map(...)` in real-time listeners — so a single
// malformed string would throw out of the map and take the ENTIRE
// collection offline, silently (the throw is swallowed by handleError).
// Parse defensively per-field: pass through already-parsed values, skip
// just the one bad field, log a scoped warning naming the document, and
// fall back to a safe default so the rest of the collection still loads.
function safeJsonField<T>(raw: unknown, fallback: T, context: string): T {
  if (raw === null || raw === undefined || raw === '') return fallback;
  // Already-parsed (object/array) value — pass through unchanged.
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(
      `[store] Malformed JSON in "${context}" — skipping this field for the ` +
      `affected document and using a safe default. Raw value:`,
      raw,
      e
    );
    return fallback;
  }
}

// ==========================================
// 🚀 DATA SERVICE
// ==========================================

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export class DataService {
  private users: User[] = [];
  private jobs: JobProfile[] = [];
  private skills: Skill[] = [];
  private assessments: Assessment[] = [];
  private departments: Department[] = [];
  private logs: ActivityLog[] = [];
  private notifications: Notification[] = [];
  private cycles: AssessmentCycle[] = [];
  private nominations: Nomination[] = [];
  private evidences: Evidence[] = [];
  private trainingCourses: TrainingCourse[] = [];
  private scheduledAssessments: ScheduledAssessment[] = [];
  private assessmentPlans: AssessmentPlan[] = [];
  private assessmentInstructions: AssessmentInstruction[] = [];
  private projects: Project[] = [];

  // A3.2: Per-pair cache for getUserSkillScore(). Keyed by "userId:skillId".
  // Cleared whenever assessments or evidences snapshots arrive so stale scores
  // are never served. Avoids rescanning the full arrays on every skill-gap/ITP
  // call while remaining conservative about staleness.
  private skillScoreCache = new Map<string, number>();

  
  public isInitialized = false;
  private unsubscribers: Unsubscribe[] = [];
  private _certExpiriesChecked = false;

  // True for the brief window of a non-bootstrap sign-up.
  // `createUserWithEmailAndPassword` auto-signs the new user in, which would
  // normally trigger the full listener fleet — but a pending user is
  // immediately signed out again, so those streams would just get torn down
  // by the rules engine ("Missing or insufficient permissions"). This guard
  // keeps the throwaway auto-session from ever opening them.
  private signUpInProgress = false;
  public isSignUpInProgress = () => this.signUpInProgress;
  private authReadyResolver: () => void = () => {};
  public authReady = new Promise<void>((resolve) => {
    this.authReadyResolver = resolve;
  });

  // True once the `users` real-time listener has delivered at least one
  // snapshot for the current session. Reset on sign-out / listener re-setup
  // so a re-login waits for the new session's data instead of stale rows.
  private usersLoaded = false;
  private usersSnapshotWaiters: Array<() => void> = [];

  // The `users` directory is assembled from up to two scoped listeners so a
  // dept/section manager also sees explicit direct reports who sit in a
  // different Direct Department / Section (see setupListeners). Each listener
  // writes its own buffer; `this.users` is their de-duped union.
  private usersScopedDocs: User[] = [];
  private usersDirectReportDocs: User[] = [];
  private usersManagerDocs: User[] = [];
  // Canonical `id` field → real Firestore doc-path id (they diverge for
  // users who re-signed up post-migration). Used to target user writes.
  // A3.3: Seeded from sessionStorage on class construction; entries written
  // through are also persisted so page refreshes within the same browser
  // session avoid redundant N+1 Firestore reads during bulk operations.
  private userDocPathById = new Map<string, string>(
    (() => {
      try {
        const raw = sessionStorage.getItem('userDocPathById');
        if (!raw) return [];
        const { ts, entries } = JSON.parse(raw) as { ts: number; entries: [string, string][] };
        // 30-minute TTL — stale enough that a UID remap would be live by then.
        if (Date.now() - ts > 30 * 60 * 1000) return [];
        return entries;
      } catch { return []; }
    })()
  );

  // --- Reactive subscription (consumed by hooks/useStoreData) ---
  // Firestore onSnapshot listeners mutate the in-memory arrays above
  // silently; React has no way to know data arrived. Components subscribe
  // here and re-render when a snapshot lands, instead of only on an
  // unrelated re-render (a tab switch or a manual edit). Without this,
  // late-arriving data (e.g. the viewer's Direct Manager) stays invisible
  // until something else forces the component to recompute.
  private subscribers = new Set<() => void>();
  private snapshotVersion = 0;
  private notifyScheduled = false;

  // Arrow-bound so the identities stay constant across renders —
  // useSyncExternalStore requires a stable subscribe and getSnapshot.
  subscribe = (cb: () => void): (() => void) => {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  };

  // useSyncExternalStore's getSnapshot must return a value that is
  // referentially stable between real changes — a primitive counter, not
  // one of the arrays (returning a fresh array there loops forever).
  getSnapshotVersion = (): number => this.snapshotVersion;

  // Snapshot callbacks fire in bursts (one per collection on login, plus
  // rebuildUsers' three-way fan-in). Coalesce into a single notify per
  // microtask so every subscriber re-renders once, not a dozen times.
  private scheduleNotify = (): void => {
    if (this.notifyScheduled) return;
    this.notifyScheduled = true;
    queueMicrotask(() => {
      this.notifyScheduled = false;
      this.snapshotVersion++;
      this.subscribers.forEach(cb => {
        try {
          cb();
        } catch (err) {
          console.error('store subscriber threw', err);
        }
      });
    });
  };

  constructor() {
    // Listen to auth state changes
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // Skip the throwaway auto-session created by a pending sign-up — it
        // is signed out again within the same call, so opening listeners
        // here only produces benign permission-denied teardown noise.
        if (this.signUpInProgress) return;
        // User is signed in, setup listeners
        this.setupListeners();
      } else {
        // User is signed out, clear listeners and data
        this.clearListeners();
        this.clearData();
      }
      this.authReadyResolver();
    });
  }

  // A5.5: True once the users snapshot has arrived for the current session.
  // Components use this to show loading skeletons vs. empty state.
  isDataLoaded = (): boolean => this.usersLoaded;

  // A5.3: Last permission-denied error surfaced while a user is signed in.
  // Cleared on sign-out/re-initialize so stale banners don't linger.
  private _permissionError: string | null = null;
  getPermissionError = (): string | null => this._permissionError;
  clearPermissionError = (): void => {
    if (this._permissionError !== null) {
      this._permissionError = null;
      this.scheduleNotify();
    }
  };

  // A5.4: Retry helper for fire-and-forget writes (e.g. addNotification).
  // Max 3 attempts with exponential backoff starting at 500 ms.
  private async withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (err) {
        attempt++;
        if (attempt >= maxAttempts) throw err;
        await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
      }
    }
  }

  private handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    // A permission error while no user is signed in (or mid sign-up
    // teardown) is the expected result of the rules engine tearing down a
    // listener after sign-out — not a bug. Keep it out of the error stream.
    if (!auth.currentUser || this.signUpInProgress) {
      console.debug('Firestore listener torn down after sign-out: ', JSON.stringify(errInfo));
    } else {
      console.error('Firestore Error: ', JSON.stringify(errInfo));
      // A5.3: Surface permission-denied errors to the UI.
      const isPermission = errInfo.error.toLowerCase().includes('permission') ||
                           errInfo.error.toLowerCase().includes('insufficient');
      if (isPermission) {
        this._permissionError = 'Permission denied. You may not have access to this resource. Please contact your administrator.';
        this.scheduleNotify();
      }
    }
    return errInfo;
  }

  private handleError(collectionName: string) {
    return (error: any) => {
      this.handleFirestoreError(error, OperationType.LIST, collectionName);
    };
  }

  private clearData() {
    this.users = [];
    this.usersScopedDocs = [];
    this.usersDirectReportDocs = [];
    this.usersManagerDocs = [];
    this.userDocPathById.clear();
    try { sessionStorage.removeItem('userDocPathById'); } catch { /* non-fatal */ }
    this.jobs = [];
    this.skills = [];
    this.assessments = [];
    this.departments = [];
    this.logs = [];
    this.notifications = [];
    this.cycles = [];
    this.nominations = [];
    this.evidences = [];
    this.trainingCourses = [];
    this.scheduledAssessments = [];
    this.assessmentPlans = [];
    this.assessmentInstructions = [];
    this.projects = [];
    this.usersLoaded = false;
    this._permissionError = null;
    this.skillScoreCache.clear();
    this.scheduleNotify();
  }

  // A5.6: Timeout guard — a hanging listener unsub never stalls sign-out.
  private clearListeners() {
    const UNSUB_TIMEOUT_MS = 3000;
    this.unsubscribers.forEach(unsub => {
      const t = setTimeout(() => {
        console.warn('store: listener unsub timed out, continuing cleanup');
      }, UNSUB_TIMEOUT_MS);
      try { unsub(); } catch { /* ignore */ } finally { clearTimeout(t); }
    });
    this.unsubscribers = [];
    this._certExpiriesChecked = false;
  }

  // Resolves once the `users` listener has delivered its first snapshot for
  // the current session, so callers (e.g. login) can read `this.users`
  // without racing the listener. Falls back after `timeoutMs` so a slow or
  // unreachable Firestore never hangs the UI — the caller then handles a
  // missing profile via its own direct getDoc fallback.
  private waitForUsersSnapshot(timeoutMs = 8000): Promise<void> {
    if (this.usersLoaded) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.usersSnapshotWaiters.push(done);
    });
  }

  private resolveUsersSnapshot() {
    this.usersLoaded = true;
    if (this.usersSnapshotWaiters.length === 0) return;
    const waiters = this.usersSnapshotWaiters;
    this.usersSnapshotWaiters = [];
    waiters.forEach(w => w());
  }

  private mapUserDoc(d: any): User {
    const data = d.data();
    // Canonical identity is the `id` *field* (what `managerId`,
    // `getUserById` and the manager-picker key on). Post-migration it can
    // diverge from the Firestore doc-path id, so remember the mapping —
    // writes (updateItem/deleteItem) must target the real doc path.
    const canonicalId: string = data.id ?? d.id;
    this.userDocPathById.set(canonicalId, d.id);
    return {
      ...data,
      id: canonicalId,
      certificates: safeJsonField<Certificate[]>(data.certificates, [], `users.certificates (${canonicalId})`),
      careerHistory: safeJsonField<CareerHistoryEntry[]>(data.careerHistory, [], `users.careerHistory (${canonicalId})`)
    } as User;
  }

  // A3.3: Persist the in-memory userDocPathById map to sessionStorage so the
  // next page load within the same browser session avoids N+1 Firestore reads.
  // Called lazily after rebuildUsers (batch writes, not per-doc).
  private flushUserDocPathCache(): void {
    try {
      sessionStorage.setItem('userDocPathById', JSON.stringify({
        ts: Date.now(),
        entries: Array.from(this.userDocPathById.entries())
      }));
    } catch { /* sessionStorage quota exceeded — non-fatal */ }
  }

  // Resolve a user's canonical `id` field to its real Firestore doc-path id
  // for writes. Cache hit (any loaded user) → zero extra reads; miss → one
  // indexed lookup by the `id` field; last-resort → the id itself so
  // updateDoc surfaces a clear not-found instead of silently misbehaving.
  private async resolveUserDocPath(idField: string): Promise<string> {
    const cached = this.userDocPathById.get(idField);
    if (cached) return cached;
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('id', '==', idField), limit(1))
      );
      if (!snap.empty) {
        this.userDocPathById.set(idField, snap.docs[0].id);
        return snap.docs[0].id;
      }
    } catch (err) {
      console.error('resolveUserDocPath: lookup failed', err);
    }
    return idField;
  }

  // Recompute the visible roster as the de-duped union of the dept-scoped
  // listener, the viewer's own manager, and the viewer's explicit direct
  // reports (the latter two may live in a different Direct Department /
  // Section). Keyed by the canonical `id` field; scoped set wins on conflict.
  private rebuildUsers() {
    const byId = new Map<string, User>();
    for (const u of this.usersManagerDocs) byId.set(u.id, u);
    for (const u of this.usersDirectReportDocs) byId.set(u.id, u);
    for (const u of this.usersScopedDocs) byId.set(u.id, u);
    this.users = Array.from(byId.values());
    this.flushUserDocPathCache();
    // A2.5: Run cert-expiry check once per login session only — running on
    // every roster fan-in caused notification storms and redundant writes.
    if (!this._certExpiriesChecked) {
      this._certExpiriesChecked = true;
      void this.checkCertificationExpiries().catch(err =>
        console.error('rebuildUsers: certification expiry check failed', err)
      );
    }
    this.scheduleNotify();
  }

  // Resolves the signed-in user's profile (own uid first, e-mail fallback
  // for post-migration UID mismatches) so listeners can be scoped by role
  // before any collection-wide subscription is opened.
  private async resolveViewerProfile(userId: string): Promise<Pick<User, 'id' | 'role' | 'orgLevel' | 'departmentId' | 'managerId'> | null> {
    try {
      // Return the canonical `id` *field* (not the Firestore doc-path id):
      // post-migration these differ, and `id` is what `managerId`
      // references, `getUserById`, and the manager-picker all key on.
      const ownSnap = await getDoc(doc(db, 'users', userId));
      if (ownSnap.exists()) {
        const data = ownSnap.data();
        return { id: data.id ?? ownSnap.id, role: data.role, orgLevel: data.orgLevel, departmentId: data.departmentId, managerId: data.managerId };
      }
      const email = auth.currentUser?.email;
      if (email) {
        const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email.toLowerCase())));
        if (!emailSnap.empty) {
          const data = emailSnap.docs[0].data();
          return { id: data.id ?? emailSnap.docs[0].id, role: data.role, orgLevel: data.orgLevel, departmentId: data.departmentId, managerId: data.managerId };
        }
      }
    } catch (err) {
      console.error('setupListeners: viewer profile lookup failed', err);
    }
    return null;
  }

  private async setupListeners() {
    // Defense in depth: never attach listeners for a pending sign-up's
    // throwaway session (it is about to be signed out).
    if (this.signUpInProgress) return;
    this.clearListeners(); // Ensure no duplicate listeners
    // New session/listeners: make pending waiters block until this session's
    // first users snapshot lands rather than resolving on stale data.
    this.usersLoaded = false;

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Determine the viewer's privilege before opening sensitive listeners so
    // rank-and-file employees do not stream every user's assessments/evidence.
    const profile = await this.resolveViewerProfile(userId);
    // Auth state can change while the profile lookup is in flight (e.g. a
    // quick sign-out). Bail rather than attach listeners for a stale session.
    if (auth.currentUser?.uid !== userId) return;

    const isPrivileged =
      isBootstrapAdminEmail(auth.currentUser?.email) ||
      profile?.role === Role.ADMIN ||
      profile?.role === Role.CEO;

    // Non-privileged viewers (rank-and-file employees AND department /
    // section managers) only need their own Direct Department / Section
    // roster — not the whole-org directory. A blank/unresolved
    // departmentId means we cannot safely scope, so fall back to the
    // broad (still capped) listener rather than leave the viewer with an
    // empty directory during a transient sign-up / migration state.
    const rawDeptId = (profile?.departmentId ?? '').trim();
    const viewerDepartmentId = !isPrivileged && rawDeptId !== '' ? rawDeptId : null;

    // If the profile could not be resolved at all (transient sign-up /
    // migration state) fall back to broad listeners so a legitimate
    // admin/manager session is never broken — Firestore rules remain the
    // real security boundary. Otherwise classify non-privileged viewers.
    let scopeToSelf = false;
    // A3.7: IDs of direct reports (canonical `id` field) for scoping
    // assessments/evidences listeners. Populated only for non-privileged
    // managers with ≤30 direct reports (Firestore `in` limit). Managers with
    // >30 direct reports fall back to the broad listener; privileged viewers
    // always use the broad listener. Empty = no subtree scoping.
    let directReportIds: string[] = [];

    if (!isPrivileged && profile) {
      const managerialLevels: OrgLevel[] = ['CEO', 'ACEO', 'GM', 'AGM', 'DM', 'SH'];
      const isManagerialLevel = profile.orgLevel ? managerialLevels.includes(profile.orgLevel) : false;
      let hasSubordinates = false;
      try {
        // A3.7: Fetch up to 31 direct reports so we know both (a) whether any
        // exist and (b) whether we can scope with a single `in` query (≤30).
        const subSnap = await getDocs(
          query(collection(db, 'users'), where('managerId', '==', profile.id), limit(31))
        );
        if (auth.currentUser?.uid !== userId) return;
        hasSubordinates = !subSnap.empty;
        if (!subSnap.empty && subSnap.docs.length <= 30) {
          directReportIds = subSnap.docs.map(d => d.data().id ?? d.id);
        }
      } catch (err) {
        // On a scoped-probe failure, keep the safer (broader) behaviour.
        console.error('setupListeners: subordinate probe failed', err);
      }
      // TODO (V2.0): department-scope assessments/evidences/nominations.
      // QA #12 scoped the `users` directory by Direct Department /
      // Section (a single equality filter), but these activity
      // collections carry no `departmentId`, so they cannot be
      // department-scoped without denormalizing `departmentId` onto each
      // doc (write paths) plus a one-time backfill migration. Likewise a
      // manager's full RECURSIVE subtree needs a denormalized
      // ancestor-path field (e.g. 'managementChain: string[]', queried
      // via array-contains). Relates to QA #31 (deferred).
      //
      // Until then: pure employees (no reports) stay self-scoped on
      // assessments/evidences/nominations — tighter than department
      // scope and correct least-privilege. Managers keep the broad
      // (now MAX_LISTENER_DOCS-capped) collection so subordinate review
      // workflows are not broken.
      scopeToSelf = !hasSubordinates && !isManagerialLevel;
    } else if (!profile) {
      console.warn('setupListeners: viewer profile unresolved — using broad listeners as a fallback');
    }

    // Users — non-privileged viewers are scoped to their own Direct
    // Department / Section via a single equality filter (no composite
    // index required; Firestore rules already permit a filtered read).
    // Privileged viewers (admin / CEO) keep org-wide access. The cap is
    // a defensive runaway guard layered on top in every case.
    // NOTE: cross-department references will not be in the scoped set. Two
    // narrow exceptions are fetched by the extra listeners below and merged:
    // (1) the viewer's own explicit direct reports — so a manager sees
    // subordinates assigned via "Direct Manager" across sections; and
    // (2) the viewer's own Direct Manager — so the employee's "Direct
    // Manager" resolves even when the manager sits in a parent / different
    // Direct Department / Section. Both widen visibility by a bounded,
    // self-relevant set, so the dept-scoping invariant otherwise holds.
    this.usersScopedDocs = [];
    this.usersDirectReportDocs = [];
    this.usersManagerDocs = [];
    const usersQuery = viewerDepartmentId
      ? query(
          collection(db, 'users'),
          where('departmentId', '==', viewerDepartmentId),
          limit(MAX_LISTENER_DOCS)
        )
      : query(collection(db, 'users'), limit(MAX_LISTENER_DOCS));
    this.unsubscribers.push(
      onSnapshot(usersQuery, (snapshot) => {
        this.usersScopedDocs = snapshot.docs.map(d => this.mapUserDoc(d));
        this.rebuildUsers();
        this.resolveUsersSnapshot();
      }, this.handleError('users'))
    );

    // A dept/section manager's explicit direct reports (`User.managerId ==
    // viewer`) can sit in a *different* Direct Department / Section than the
    // manager — so the dept-scoped roster above would omit them and the
    // Manager Dashboard (getSubordinates) would never list them. Add a
    // narrow second listener for just those reports and merge. This widens
    // visibility by exactly the viewer's own direct reports (not the whole
    // org), so the Direct-Department/Section scoping invariant still holds.
    // `viewerId` is the canonical `id` *field* (what subordinates store in
    // `managerId`), not the doc-path id or auth uid — see
    // resolveViewerProfile. Skipped for privileged/broad viewers — their
    // roster already includes everyone.
    if (viewerDepartmentId && profile) {
      const viewerId = profile.id;
      this.unsubscribers.push(
        onSnapshot(
          query(
            collection(db, 'users'),
            where('managerId', '==', viewerId),
            limit(MAX_LISTENER_DOCS)
          ),
          (snapshot) => {
            this.usersDirectReportDocs = snapshot.docs.map(d => this.mapUserDoc(d));
            this.rebuildUsers();
          },
          this.handleError('users:directReports')
        )
      );

      // The viewer's own Direct Manager (`User.managerId` on the viewer's
      // profile) frequently sits in a parent / different Direct Department
      // / Section, so the dept-scoped roster omits them and the UI shows
      // "Direct Manager: N/A". Fetch exactly that one record by its
      // canonical `id` field (NOT the doc path — they differ post-migration,
      // and `managerId` stores the `id` field value) and merge it in.
      const viewerManagerId = (profile.managerId ?? '').trim();
      if (viewerManagerId !== '') {
        this.unsubscribers.push(
          onSnapshot(
            query(
              collection(db, 'users'),
              where('id', '==', viewerManagerId),
              limit(1)
            ),
            (snapshot) => {
              this.usersManagerDocs = snapshot.docs.map(d => this.mapUserDoc(d));
              this.rebuildUsers();
            },
            this.handleError('users:directManager')
          )
        );
      }
    }

    // Jobs
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'jobProfiles'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
        this.jobs = snapshot.docs.map(doc => {
          const data = doc.data();
          const requiredSkills = safeJsonField<JobProfileSkill[]>(
            data.requiredSkills, [], `jobProfiles.requiredSkills (${doc.id})`
          );

          const job = {
            id: doc.id,
            ...data,
            requiredSkills: Array.isArray(requiredSkills) ? requiredSkills : []
          } as JobProfile;

          if (!job.code) {
            job.code = this.generateJobProfileCode(job);
          }
          return job;
        });
        this.scheduleNotify();
      }, this.handleError('jobProfiles'))
    );

    // Skills
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'skills'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
        this.skills = snapshot.docs.map(doc => {
          const data = doc.data();
          const skill = {
            id: doc.id,
            ...data,
            levels: safeJsonField<Record<number, SkillLevel>>(data.levels, {}, `skills.levels (${doc.id})`),
            assessmentMethods: safeJsonField<SkillAssessmentMethod[]>(data.assessmentMethods, [], `skills.assessmentMethods (${doc.id})`),
            evaluationQuestions: safeJsonField<EvaluationQuestion[]>(data.evaluationQuestions, [], `skills.evaluationQuestions (${doc.id})`),
            interviewQuestions: safeJsonField<EvaluationQuestion[]>(data.interviewQuestions, [], `skills.interviewQuestions (${doc.id})`),
            threeSixtyQuestions: safeJsonField<EvaluationQuestion[]>(data.threeSixtyQuestions, [], `skills.threeSixtyQuestions (${doc.id})`)
          } as Skill;

          if (!skill.code) {
            skill.code = this.generateSkillCode(skill);
          }
          return skill;
        });
        this.scheduleNotify();
      }, this.handleError('skills'))
    );

    // Departments
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'departments'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
        const used = new Set<string>();
        const depts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
        // Reserve codes already stored so generated ones don't collide with them.
        for (const d of depts) if (d.code) used.add(d.code);
        // Backfill a code for any department missing one (legacy docs / UI-created).
        for (const d of depts) {
          if (!d.code) {
            d.code = this.generateDepartmentCode(d, used);
            used.add(d.code);
          }
        }
        this.departments = depts;
        this.scheduleNotify();
      }, this.handleError('departments'))
    );

    // Projects
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'projects'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
        this.projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        this.scheduleNotify();
      }, this.handleError('projects'))
    );


    // `userId` is the Firebase Auth uid. Activity docs (assessments,
    // evidences, notifications, nominations) key their owner/subject/rater
    // fields by the viewer's canonical `id` *field*, which differs from the
    // auth uid post-migration — exactly as `managerId` does (see the
    // direct-report / direct-manager listeners above). Scope these by that
    // canonical id; an unresolved profile (`selfId` undefined) falls back to
    // the broad (capped) collection, mirroring the users fallback above.
    const selfId = profile?.id;

    // Assessments — pure employee: only own subject/rater records.
    // A3.7 manager with ≤30 direct reports: scope to subtree (self + reports).
    // Broader managers / privileged: full collection.
    if (scopeToSelf && selfId) {
      this.unsubscribers.push(
        onSnapshot(
          query(
            collection(db, 'assessments'),
            or(where('subjectId', '==', selfId), where('raterId', '==', selfId)),
            limit(MAX_LISTENER_DOCS)
          ),
          (snapshot) => {
            this.assessments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
            this.skillScoreCache.clear();
            this.scheduleNotify();
          }, this.handleError('assessments'))
      );
    } else if (!isPrivileged && selfId && directReportIds.length > 0) {
      // A3.7: Manager with a bounded direct-report set — scope to subtree.
      // Include selfId so the manager's own assessments are not dropped.
      const subtreeIds = [...new Set([selfId, ...directReportIds])];
      this.unsubscribers.push(
        onSnapshot(
          query(
            collection(db, 'assessments'),
            where('subjectId', 'in', subtreeIds),
            limit(MAX_LISTENER_DOCS)
          ),
          (snapshot) => {
            this.assessments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
            this.skillScoreCache.clear();
            this.scheduleNotify();
          }, this.handleError('assessments'))
      );
    } else {
      this.unsubscribers.push(
        onSnapshot(query(collection(db, 'assessments'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
          this.assessments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
          this.skillScoreCache.clear();
          this.scheduleNotify();
        }, this.handleError('assessments'))
      );
    }

    // Logs
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(50)), (snapshot) => {
        this.logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
        this.scheduleNotify();
      }, this.handleError('activityLogs'))
    );

    // Evidences — pure employee: own submissions only.
    // A3.7 manager with ≤30 direct reports: scope to subtree (self + reports).
    // Broader managers / privileged: full collection.
    {
      let evidencesQuery;
      if (scopeToSelf && selfId) {
        evidencesQuery = query(collection(db, 'evidences'), where('userId', '==', selfId), limit(MAX_LISTENER_DOCS));
      } else if (!isPrivileged && selfId && directReportIds.length > 0) {
        const subtreeIds = [...new Set([selfId, ...directReportIds])];
        evidencesQuery = query(collection(db, 'evidences'), where('userId', 'in', subtreeIds), limit(MAX_LISTENER_DOCS));
      } else {
        evidencesQuery = query(collection(db, 'evidences'), limit(MAX_LISTENER_DOCS));
      }
      this.unsubscribers.push(
        onSnapshot(evidencesQuery, (snapshot) => {
          this.evidences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Evidence));
          this.skillScoreCache.clear();
          this.scheduleNotify();
        }, this.handleError('evidences'))
      );
    }

    // Training Courses
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'trainingCourses'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
        this.trainingCourses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TrainingCourse));
        this.scheduleNotify();
      }, this.handleError('trainingCourses'))
    );

    // Scheduled Assessments
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'scheduledAssessments'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
        this.scheduledAssessments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduledAssessment));
        this.scheduleNotify();
      }, this.handleError('scheduledAssessments'))
    );

    // Assessment Plans (Assessment Management) — recurrence/audience rules
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'assessmentPlans'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
        this.assessmentPlans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssessmentPlan));
        this.scheduleNotify();
      }, this.handleError('assessmentPlans'))
    );

    // Assessment Instructions — reusable method + question banks per skill
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'assessmentInstructions'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
        this.assessmentInstructions = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            evaluationQuestions: safeJsonField<EvaluationQuestion[]>(data.evaluationQuestions, [], `assessmentInstructions.evaluationQuestions (${doc.id})`),
            interviewQuestions: safeJsonField<EvaluationQuestion[]>(data.interviewQuestions, [], `assessmentInstructions.interviewQuestions (${doc.id})`),
            threeSixtyQuestions: safeJsonField<EvaluationQuestion[]>(data.threeSixtyQuestions, [], `assessmentInstructions.threeSixtyQuestions (${doc.id})`)
          } as AssessmentInstruction;
        });
        this.scheduleNotify();
      }, this.handleError('assessmentInstructions'))
    );

    // Notifications — always self-scoped (even admins/managers only see
    // their own), keyed by the recipient's canonical `id` field (what
    // notification docs store in `userId`), not the auth uid. An unresolved
    // profile falls back to the broad (capped) listener so a transient
    // sign-up state still surfaces alerts; rules remain the real boundary.
    this.unsubscribers.push(
      onSnapshot(
        selfId
          ? query(collection(db, 'notifications'), where('userId', '==', selfId), limit(MAX_LISTENER_DOCS))
          : query(collection(db, 'notifications'), limit(MAX_LISTENER_DOCS)),
        (snapshot) => {
          this.notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
          this.scheduleNotify();
        }, this.handleError('notifications'))
    );

    // Cycles
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'assessmentCycles'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
        this.cycles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssessmentCycle));
        this.scheduleNotify();
      }, this.handleError('assessmentCycles'))
    );

    // Nominations — a pure employee can be the nominator, the subject, or
    // the rater; a native `or()` query returns that union deduped in a
    // single listener. Managers/admins keep the full collection.
    if (scopeToSelf && selfId) {
      this.unsubscribers.push(
        onSnapshot(
          query(
            collection(db, 'nominations'),
            or(
              where('nominatorId', '==', selfId),
              where('subjectId', '==', selfId),
              where('raterId', '==', selfId)
            ),
            limit(MAX_LISTENER_DOCS)
          ),
          (snapshot) => {
            this.nominations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Nomination));
            this.scheduleNotify();
      }, this.handleError('nominations'))
      );
    } else {
      this.unsubscribers.push(
        onSnapshot(query(collection(db, 'nominations'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
          this.nominations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Nomination));
          this.scheduleNotify();
      }, this.handleError('nominations'))
      );
    }
  }

  // --- Evidences ---
  getEvidences(filters?: { userId?: string, skillId?: string, status?: string }) {
    let result = this.evidences;
    if (filters?.userId) result = result.filter(e => e.userId === filters.userId);
    if (filters?.skillId) result = result.filter(e => e.skillId === filters.skillId);
    if (filters?.status) result = result.filter(e => e.status === filters.status);
    return result;
  }

  async addEvidence(evidence: Omit<Evidence, 'id' | 'status' | 'submittedAt'>) {
    const id = doc(collection(db, 'evidences')).id;
    const newEvidence: Evidence = {
      ...evidence,
      id,
      status: 'PENDING',
      submittedAt: new Date().toISOString()
    };

    // A2.1: Batch evidence + manager notification so neither is orphaned on failure.
    const batch = writeBatch(db);
    batch.set(doc(db, 'evidences', id), this.preparePayload('evidences', newEvidence));

    const user = this.users.find(u => u.id === evidence.userId);
    if (user && user.managerId) {
      const notifId = doc(collection(db, 'notifications')).id;
      const notif = {
        id: notifId,
        userId: user.managerId,
        title: 'New Evidence Submitted',
        message: `${user.name} submitted evidence for review.`,
        type: 'INFO',
        createdAt: new Date().toISOString(),
        isRead: false
      };
      batch.set(doc(db, 'notifications', notifId), notif);
    }

    try {
      await batch.commit();
    } catch (e) {
      this.handleFirestoreError(e, OperationType.WRITE, `evidences/${id}`);
      throw e;
    }
    return newEvidence;
  }

  async updateEvidence(id: string, updates: { notes?: string; fileUrl?: string; fileName?: string; expiryDate?: string }) {
    const evidence = this.evidences.find(e => e.id === id);
    if (!evidence) return;
    const wasActedOn = evidence.status === 'APPROVED' || evidence.status === 'REJECTED';
    const updatedEvidence: Evidence = {
      ...evidence,
      ...updates,
      status: 'PENDING',
      submittedAt: new Date().toISOString(),
      reviewedAt: undefined,
      reviewedBy: undefined,
      assignedScore: undefined,
      reviewerComment: undefined
    };
    await this.updateItem('evidences', updatedEvidence);
    const user = this.users.find(u => u.id === evidence.userId);
    if (user && user.managerId) {
      await this.addNotification({
        userId: user.managerId,
        title: 'Evidence Re-Submitted for Review',
        message: `${user.name} edited their evidence${wasActedOn ? ` (previously ${evidence.status.toLowerCase()})` : ''} and it requires re-approval.`,
        type: 'WARNING',
        actionLink: 'manager-approvals'
      });
    }
  }

  async deleteEvidence(id: string) {
    const evidence = this.evidences.find(e => e.id === id);
    if (!evidence) return;
    const wasActedOn = evidence.status === 'APPROVED' || evidence.status === 'REJECTED';
    await this.deleteItem('evidences', id);
    const user = this.users.find(u => u.id === evidence.userId);
    if (wasActedOn && user && user.managerId) {
      await this.addNotification({
        userId: user.managerId,
        title: 'Evidence Withdrawn',
        message: `${user.name} deleted their evidence that was previously ${evidence.status.toLowerCase()}. No further action is needed.`,
        type: 'INFO',
        actionLink: 'manager-approvals'
      });
    }
  }

  async updateEvidenceStatus(id: string, status: 'APPROVED' | 'REJECTED', reviewerId: string, level?: number, comment?: string) {
    const evidence = this.evidences.find(e => e.id === id);
    if (evidence) {
      const updatedEvidence = {
        ...evidence,
        status,
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewerId,
        assignedScore: status === 'APPROVED' ? (level || 3) : undefined,
        reviewerComment: comment || undefined
      };
      await this.updateItem('evidences', updatedEvidence);

      // Notify user
      await this.addNotification({
        userId: evidence.userId,
        title: `Evidence ${status}`,
        message: `Your evidence submission was ${status.toLowerCase()}.${comment ? ` Reviewer note: ${comment}` : ''}`,
        type: status === 'APPROVED' ? 'SUCCESS' : 'ERROR',
        actionLink: 'evidence-portal'
      });
    }
  }

  // --- Nominations ---
  getNominations(filters?: { subjectId?: string, raterId?: string, nominatorId?: string }) {
    let result = this.nominations;
    if (filters?.subjectId) result = result.filter(n => n.subjectId === filters.subjectId);
    if (filters?.raterId) result = result.filter(n => n.raterId === filters.raterId);
    if (filters?.nominatorId) result = result.filter(n => n.nominatorId === filters.nominatorId);
    return result;
  }

  async addNomination(nomination: Omit<Nomination, 'id' | 'date' | 'status'>) {
    const id = doc(collection(db, 'nominations')).id;
    const newNomination: Nomination = {
      ...nomination,
      id,
      date: new Date().toISOString(),
      status: 'PENDING'
    };
    await this.persistItem('nominations', newNomination);
    
    // Add notification to the rater
    await this.addNotification({
      userId: nomination.raterId,
      title: 'New Assessment Request',
      message: `You have been requested to assess ${this.getUserById(nomination.subjectId)?.name}.`,
      type: 'INFO',
      actionLink: 'emp-assessment'
    });

    return newNomination;
  }

  async updateNominationStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    const nomination = this.nominations.find(n => n.id === id);
    if (nomination) {
      await this.updateItem('nominations', { ...nomination, status });
    }
  }

  // --- INITIALIZATION ---
  
  async initialize() {
    console.log(`Initializing DataService with SOURCE: ${CONFIG.SOURCE}`);
    await this.authReady; // Wait for initial auth state
    
    // If not authenticated, we can't load data yet, but we are initialized
    this.isInitialized = true;
  }

  // --- AUTHENTICATION ---

  async signUp(email: string, password: string, userData: Partial<User>) {
    const trimmedEmail = email.trim().toLowerCase();
    const isBootstrapAdmin = isBootstrapAdminEmail(trimmedEmail);
    // A non-bootstrap account is created PENDING and signed out again below,
    // so suppress the listener fleet for that throwaway auto-session. The
    // bootstrap admin stays signed in and needs listeners as usual.
    this.signUpInProgress = !isBootstrapAdmin;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const user = userCredential.user;
      
      // Check if a profile already exists for this email (e.g. from bulk upload)
      const existingProfile = this.users.find(u => u.email.toLowerCase() === trimmedEmail.toLowerCase());
      
      const newUserProfile: User = existingProfile ? {
        ...existingProfile,
        id: user.uid,
        name: userData.name || existingProfile.name,
      } : {
        id: user.uid,
        email: trimmedEmail,
        name: userData.name || 'New User',
        role: isBootstrapAdmin ? Role.ADMIN : Role.EMPLOYEE,
        status: isBootstrapAdmin ? 'ACTIVE' : 'PENDING',
        departmentId: '',
        orgLevel: undefined,
        avatarUrl: `https://ui-avatars.com/api/?name=${userData.name}`
      };

      try {
        await this.persistItem('users', newUserProfile);
        // If we migrated from an existing profile, delete the old one
        if (existingProfile && existingProfile.id !== user.uid) {
          await this.deleteItem('users', existingProfile.id);
        }
      } catch (error) {
        // Error already handled in persistItem
      }
      
      await this.logActivity('Self-Registration', newUserProfile.name);
      
      // Destroy the automatic Firebase session for pending users
      if (!isBootstrapAdmin) {
        await signOut(auth);
      }
      
      return { user: newUserProfile };
    } catch (error: any) {
      return { error: error.message };
    } finally {
      this.signUpInProgress = false;
    }
  }

  async loginWithPassword(email: string, password: string) {
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const user = userCredential.user;

      // Wait for the users listener's first snapshot rather than a fixed
      // delay: login proceeds as soon as the data is actually available
      // (usually well under a second) and never races a slow network.
      await this.waitForUsersSnapshot();

      const userProfile = this.users.find(u => u.id === user.uid);
      
      // Check for other profiles with the same email (duplicates from bulk upload)
      const duplicates = this.users.filter(u => u.email.toLowerCase() === trimmedEmail.toLowerCase() && u.id !== user.uid);
      for (const dup of duplicates) {
        try {
          await this.deleteItem('users', dup.id);
        } catch (e) {
          // Ignore if delete fails
        }
      }

      if (!userProfile) {
        // Try fetching directly if not in cache yet
        let docSnap;
        try {
          docSnap = await getDoc(doc(db, 'users', user.uid));
        } catch (error) {
          this.handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          throw error;
        }
        
        if (!docSnap.exists()) {
           // Check if there's a profile with this email but a different ID (bulk uploaded)
           const bulkProfile = this.users.find(u => u.email.toLowerCase() === trimmedEmail.toLowerCase());
           if (bulkProfile) {
              // Migrate bulk profile to this UID
              const migratedProfile = { ...bulkProfile, id: user.uid };
              try {
                await this.persistItem('users', migratedProfile);
                await this.deleteItem('users', bulkProfile.id);
                return { user: migratedProfile };
              } catch (error) {
                // Fallback if migration fails
              }
           }

           const isBootstrapAdmin = isBootstrapAdminEmail(trimmedEmail);
           if (isBootstrapAdmin) {
              // Auto-create profile for bootstrap admin if missing
              const adminProfile: User = {
                id: user.uid,
                email: trimmedEmail,
                name: 'System Admin',
                role: Role.ADMIN,
                status: 'ACTIVE',
                departmentId: '',
                avatarUrl: `https://ui-avatars.com/api/?name=Admin`
              };
              try {
                await this.persistItem('users', adminProfile);
              } catch (error) {
                // Error already handled in persistItem
              }
              return { user: adminProfile };
           }
           return { error: 'Profile not found for this user. Please sign up first.' };
        }

        const data = docSnap.data();
        const profile = {
          id: docSnap.id,
          ...data,
          certificates: safeJsonField<Certificate[]>(data.certificates, [], `users.certificates (${docSnap.id})`),
          careerHistory: safeJsonField<CareerHistoryEntry[]>(data.careerHistory, [], `users.careerHistory (${docSnap.id})`)
        } as User;
        
        const isBootstrapAdmin = isBootstrapAdminEmail(trimmedEmail);
        if (profile.status === 'PENDING' && !isBootstrapAdmin) {
           // Still drop the session (pending users get no live Firestore
           // access), but signal PENDING distinctly so the UI can route to a
           // dedicated "Waiting for Approval" screen instead of flashing a
           // dashboard then bouncing back to login with a terse error.
           await signOut(auth);
           return { pending: true as const };
        }
        if (profile.status === 'REJECTED' && !isBootstrapAdmin) {
           await signOut(auth);
           return { error: 'Account has been deactivated by the administrator.' };
        }
        return { user: profile };
      }
      
      if (userProfile.status === 'PENDING') {
          await signOut(auth);
          return { pending: true as const };
      }
      if (userProfile.status === 'REJECTED') {
          await signOut(auth);
          return { error: 'Account has been deactivated by the administrator.' };
      }

      return { user: userProfile };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  async resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  async signOut() {
    await signOut(auth);
  }

  async getCurrentUser() {
    if (!auth.currentUser) return null;

    const user = auth.currentUser;
    const isBootstrapAdmin = isBootstrapAdminEmail(user.email);

    let profile = this.users.find(u => u.id === user.uid);

    if (!profile) {
      try {
        const docSnap = await getDoc(doc(db, 'users', user.uid));
        if (docSnap.exists()) {
           const data = docSnap.data();
           profile = {
             id: docSnap.id,
             ...data,
             certificates: safeJsonField<Certificate[]>(data.certificates, [], `users.certificates (${docSnap.id})`),
             careerHistory: safeJsonField<CareerHistoryEntry[]>(data.careerHistory, [], `users.careerHistory (${docSnap.id})`)
           } as User;
        } else if (user.email) {
          // UID mismatch (post-migration): fall back to email query
          const emailQuery = query(collection(db, 'users'), where('email', '==', user.email.toLowerCase()));
          const emailSnap = await getDocs(emailQuery);
          if (!emailSnap.empty) {
            const data = emailSnap.docs[0].data();
            profile = {
              id: emailSnap.docs[0].id,
              ...data,
              certificates: safeJsonField<Certificate[]>(data.certificates, [], `users.certificates (${emailSnap.docs[0].id})`),
              careerHistory: safeJsonField<CareerHistoryEntry[]>(data.careerHistory, [], `users.careerHistory (${emailSnap.docs[0].id})`)
            } as User;
          }
        }
      } catch (err) {
        console.error('getCurrentUser: profile lookup failed', err);
      }
    }

    // Also check in-memory cache by email as a last resort
    if (!profile && user.email) {
      profile = this.users.find(u => u.email?.toLowerCase() === user.email!.toLowerCase());
    }

    if (profile) {
      // Enforce approval status check
      if (!isBootstrapAdmin && (profile.status === 'PENDING' || profile.status === 'REJECTED')) {
        await signOut(auth);
        return null;
      }
      return profile;
    }

    return null;
  }

  // --- PERSISTENCE HELPERS ---

  private preparePayload(collectionName: string, item: any) {
    const payload = { ...item };
    
    // Serialize complex objects
    if (collectionName === 'users') {
      if (item.certificates) payload.certificates = JSON.stringify(item.certificates);
      if (item.careerHistory) payload.careerHistory = JSON.stringify(item.careerHistory);
    }
    if (collectionName === 'jobProfiles' && item.requiredSkills) {
      payload.requiredSkills = JSON.stringify(item.requiredSkills);
    }
    if (collectionName === 'skills') {
      if (item.levels) payload.levels = JSON.stringify(item.levels);
      if (item.assessmentMethods) payload.assessmentMethods = JSON.stringify(item.assessmentMethods);
      if (item.evaluationQuestions) payload.evaluationQuestions = JSON.stringify(item.evaluationQuestions);
      if (item.interviewQuestions) payload.interviewQuestions = JSON.stringify(item.interviewQuestions);
      if (item.threeSixtyQuestions) payload.threeSixtyQuestions = JSON.stringify(item.threeSixtyQuestions);
    }
    if (collectionName === 'assessmentInstructions') {
      if (item.evaluationQuestions) payload.evaluationQuestions = JSON.stringify(item.evaluationQuestions);
      if (item.interviewQuestions) payload.interviewQuestions = JSON.stringify(item.interviewQuestions);
      if (item.threeSixtyQuestions) payload.threeSixtyQuestions = JSON.stringify(item.threeSixtyQuestions);
    }

    // Remove undefined values for Firestore
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    return payload;
  }

  private validateEnums(collectionName: string, item: any) {
    const VALID_ROLES: Role[] = [Role.ADMIN, Role.EMPLOYEE, Role.CEO];
    const VALID_ORG_LEVELS: OrgLevel[] = ['CEO', 'ACEO', 'GM', 'AGM', 'DM', 'SH', 'SP', 'JP', 'FR'];
    const VALID_ASSESSMENT_METHODS: AssessmentMethod[] = ['WRITTEN_EXAM', 'PRACTICAL_DEMO', 'OJT_OBSERVATION', 'INTERVIEW', 'WORK_RECORD_REVIEW', 'THREE_SIXTY_EVALUATION'];
    const VALID_ASSESSMENT_TYPES = ['SELF', 'PEER', 'MANAGER', 'UPWARD', 'WRITTEN_EXAM', 'PRACTICAL_DEMO', 'INTERVIEW', 'WORK_RECORD_REVIEW'];

    if (collectionName === 'users') {
      if (item.role !== undefined && !VALID_ROLES.includes(item.role)) {
        throw new Error(`Invalid role value: "${item.role}"`);
      }
      if (item.orgLevel !== undefined && !VALID_ORG_LEVELS.includes(item.orgLevel)) {
        throw new Error(`Invalid orgLevel value: "${item.orgLevel}"`);
      }
    }
    if (collectionName === 'assessments') {
      if (item.type !== undefined && !VALID_ASSESSMENT_TYPES.includes(item.type)) {
        throw new Error(`Invalid assessment type value: "${item.type}"`);
      }
      if (item.method !== undefined && !VALID_ASSESSMENT_METHODS.includes(item.method)) {
        throw new Error(`Invalid assessment method value: "${item.method}"`);
      }
    }
  }

  private async persistItem(collectionName: string, item: any) {
    try {
      this.validateEnums(collectionName, item);
      const payload = this.preparePayload(collectionName, item);
      await setDoc(doc(db, collectionName, item.id), payload);
    } catch (e) {
      this.handleFirestoreError(e, OperationType.WRITE, `${collectionName}/${item.id}`);
      throw e;
    }
  }

  private async deleteItem(collectionName: string, id: string) {
    try {
      const docId = collectionName === 'users' ? await this.resolveUserDocPath(id) : id;
      await deleteDoc(doc(db, collectionName, docId));
    } catch (e) {
      this.handleFirestoreError(e, OperationType.DELETE, `${collectionName}/${id}`);
      throw e;
    }
  }

  private async updateItem(collectionName: string, item: any) {
    try {
      const payload = this.preparePayload(collectionName, item);
      const { id, ...data } = payload;
      const docId = collectionName === 'users' ? await this.resolveUserDocPath(id) : id;
      await updateDoc(doc(db, collectionName, docId), data);
    } catch (e) {
      this.handleFirestoreError(e, OperationType.WRITE, `${collectionName}/${item.id}`);
      throw e;
    }
  }

  async uploadAvatar(userId: string, file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 200;
          const width = img.width;
          const height = img.height;

          // Square crop and resize
          const size = Math.min(width, height);
          const startX = (width - size) / 2;
          const startY = (height - size) / 2;

          canvas.width = MAX_SIZE;
          canvas.height = MAX_SIZE;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(img, startX, startY, size, size, 0, 0, MAX_SIZE, MAX_SIZE);
            // WebP, 80% quality 
            const dataUrl = canvas.toDataURL('image/webp', 0.8);

            const user = this.getUserById(userId);
            if (user) {
              user.avatarUrl = dataUrl;
              try {
                await this.updateItem('users', user);
                resolve(dataUrl);
              } catch (err) {
                reject(err);
              }
            } else {
              reject(new Error('User not found'));
            }
          } else {
            reject(new Error('Canvas context not available'));
          }
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- HIERARCHY & ROLES ---
  isManager(user: User): boolean {
    if (user.role === Role.ADMIN || user.role === Role.CEO) return true;
    
    // If the employee officially has subordinates they are automatically a manager
    const hasSubordinates = this.users.some(u => u.managerId === user.id);
    if (hasSubordinates) return true;

    // Default fallback to hierarchy level
    const managerialLevels: OrgLevel[] = ['CEO', 'ACEO', 'GM', 'AGM', 'DM', 'SH'];
    return user.orgLevel ? managerialLevels.includes(user.orgLevel) : false;
  }

  getVisibleUsers(currentUser: User): User[] {
    if (currentUser.role === Role.ADMIN || currentUser.role === Role.CEO) {
      return this.users;
    }

    // Managers can see their subordinates and indirect subordinates.
    // De-dupe defensively: the dept-managed edge can pull the same user in
    // via multiple paths, and a malformed cycle could re-list currentUser.
    const subordinates = this.getSubordinatesRecursive(currentUser.id)
      .filter(u => u.id !== currentUser.id);
    return [currentUser, ...subordinates];
  }

  private getSubordinatesRecursive(managerId: string, visited: Set<string> = new Set()): User[] {
    // Guard against cycles. Pure managerId chains were acyclic by data shape,
    // but resolving reports through Department.managerId (see getSubordinates)
    // can introduce cycles, so a visited set is now required.
    if (visited.has(managerId)) return [];
    visited.add(managerId);

    // Single source of truth for "who reports to this person": explicit
    // Direct Manager OR membership in a Direct Department / Section they
    // manage. Reusing getSubordinates() keeps subordinate resolution
    // consistent with the Manager Dashboard everywhere.
    const direct = this.getSubordinates(managerId);

    const byId = new Map<string, User>();
    for (const d of direct) {
      if (!byId.has(d.id)) byId.set(d.id, d);
      for (const sub of this.getSubordinatesRecursive(d.id, visited)) {
        if (!byId.has(sub.id)) byId.set(sub.id, sub);
      }
    }
    return [...byId.values()];
  }

  // Objective 1: Certification Expiry & Compliance Workflows
  // Scoped to the signed-in user's OWN certificates only. A non-privileged
  // viewer can only write their own `users` doc (Firestore rules), and this
  // runs on every rebuildUsers() roster fan-in — iterating the whole roster
  // produced permission-denied write storms and clobbered other users' docs.
  async checkCertificationExpiries() {
    const authUser = auth.currentUser;
    if (!authUser) return;

    // Resolve the viewer's own roster entry the same way getCurrentUser does:
    // canonical `id` field first, e-mail fallback for post-migration UID drift.
    const email = authUser.email?.toLowerCase();
    const self = this.users.find(
      u => u.id === authUser.uid || (!!email && u.email?.toLowerCase() === email)
    );
    if (!self || !self.certificates || self.certificates.length === 0) return;

    const today = new Date();
    let userUpdated = false;
    const updatedCerts = [...self.certificates];

    for (let i = 0; i < updatedCerts.length; i++) {
      const cert = updatedCerts[i];
      if (!cert.expiryDate) continue;

      const expiry = new Date(cert.expiryDate);
      const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      let newStatus: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' = 'VALID';
      if (diffDays <= 0) newStatus = 'EXPIRED';
      else if (diffDays <= 90) newStatus = 'EXPIRING_SOON';

      if (cert.renewalStatus !== newStatus) {
        updatedCerts[i] = { ...cert, renewalStatus: newStatus };
        userUpdated = true;

        if ([90, 60, 30].includes(diffDays) || diffDays <= 0) {
          const message = diffDays <= 0
            ? `CRITICAL: Your certification "${cert.name}" has EXPIRED.`
            : `Warning: Your certification "${cert.name}" expires in ${diffDays} days.`;

          await this.addNotification({
            userId: self.id,
            title: 'Certification Renewal Alert',
            message,
            type: diffDays <= 0 ? 'ERROR' : 'WARNING',
            actionLink: 'evidence-portal'
          });

          if (self.managerId) {
            await this.addNotification({
              userId: self.managerId,
              title: `Compliance Alert: ${self.name}`,
              message: `Subordinate ${self.name} has a certification requirement: ${message}`,
              type: 'INFO',
              actionLink: 'manager-approvals'
            });
          }
        }
      }
    }

    if (userUpdated) {
      // Route through updateItem so the write resolves the real Firestore
      // doc-path id via resolveUserDocPath() (canonical `id` != doc id
      // post-migration) and certificates get serialized by preparePayload.
      await this.updateItem('users', { ...self, certificates: updatedCerts });
    }
  }

  generateDepartmentalTNA(departmentId: string) {
    const deptUsers = this.users.filter(u => u.departmentId === departmentId);
    const skillGaps: Record<string, { skillId: string, skillName: string, gapCount: number, totalGap: number }> = {};
    
    deptUsers.forEach(user => {
      const itp = this.generateIndividualTrainingPlan(user.id);
      if (itp) {
        itp.recommendations.forEach(rec => {
          if (!skillGaps[rec.skillId]) {
            skillGaps[rec.skillId] = { skillId: rec.skillId, skillName: rec.skillName, gapCount: 0, totalGap: 0 };
          }
          skillGaps[rec.skillId].gapCount++;
          skillGaps[rec.skillId].totalGap += rec.gap;
        });
      }
    });
    
    return Object.values(skillGaps)
      .map(gap => ({
        ...gap,
        averageGap: gap.totalGap / gap.gapCount,
        priority: gap.gapCount > (deptUsers.length * 0.5) ? 'HIGH' : (gap.gapCount > (deptUsers.length * 0.2) ? 'MEDIUM' : 'LOW')
      }))
      .sort((a, b) => b.gapCount - a.gapCount);
  }

  generateIndividualTrainingPlan(userId: string): IndividualTrainingPlan | null {
    const user = this.getUserById(userId);
    if (!user || !user.jobProfileId || !user.orgLevel) return null;

    const job = this.getJobProfile(user.jobProfileId);
    if (!job) return null;

    const requirements = this.getEffectiveRequirements(job);
    const recommendations: TrainingRecommendation[] = [];

    requirements.forEach(req => {
      const currentScore = this.getUserSkillScore(userId, req.skillId);
      const gap = req.requiredLevel - currentScore;

      if (gap > 0) {
        const skill = this.getSkill(req.skillId);
        const skillName = skill?.name || 'Unknown Skill';
        
        const matchingCourse = this.trainingCourses.find(c => c.linkedSkillIds.includes(req.skillId));
        
        const recommendationText = matchingCourse
          ? `Enroll in "${matchingCourse.title}" (${matchingCourse.provider}) to bridge the gap.`
          : gap >= 2
          ? `Intensive training and external certification required for ${skillName}.`
          : `On-the-job training and mentorship recommended to reach proficiency level ${req.requiredLevel}.`;

        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + (gap >= 2 ? 6 : 3));

        recommendations.push({
          skillId: req.skillId,
          skillName,
          gap,
          recommendation: recommendationText,
          priority: gap >= 2 ? 'HIGH' : 'MEDIUM',
          status: 'NOT_STARTED',
          targetDate: targetDate.toISOString(),
          supervisorSignOff: false,
          courseId: matchingCourse?.id
        });
      }
    });

    return {
      id: `itp_${userId}_${Date.now()}`,
      userId,
      recommendations: recommendations.sort((a, b) => b.gap - a.gap),
      generatedAt: new Date().toISOString(),
      status: 'ACTIVE'
    };
  }

  getEmployeeAssessmentQueue(userId: string) {
    const user = this.getUserById(userId);
    if (!user || !user.jobProfileId || !user.orgLevel) return null;

    const job = this.getJobProfile(user.jobProfileId);
    if (!job) return null;

    const requirements = this.getEffectiveRequirements(job);
    const scheduled = this.scheduledAssessments.filter(a => a.userId === userId);

    const writtenExams: any[] = [];
    const managerialInterviews: any[] = [];
    const evaluations360: any[] = [];
    const workRecords: any[] = [];

    requirements.forEach(req => {
      const currentScore = this.getUserSkillScore(userId, req.skillId);
      const skill = this.getSkill(req.skillId);
      if (!skill) return;

      let needsAssessment = false;

      if (currentScore < req.requiredLevel) {
        needsAssessment = true;
      } else {
        const nextDate = this.getNextAssessmentDate(userId, req.skillId);
        if (nextDate && new Date() >= nextDate) {
          needsAssessment = true;
        }
      }

      if (needsAssessment) {
        const assessment = scheduled.find(s => s.skillId === req.skillId);
        
        // Find the actual assessment record for this skill if it was completed
        const result = assessment?.status === 'COMPLETED' 
            ? this.assessments.find(a => a.subjectId === userId && a.skillId === req.skillId && !a.isArchived)
            : null;

        const item = {
          skill,
          requiredLevel: req.requiredLevel,
          currentLevel: currentScore,
          scheduledDate: assessment?.scheduledDate,
          status: assessment?.status || 'PENDING_SCHEDULE',
          assessorId: assessment?.assessorId,
          assessmentId: assessment?.id,
          achievedScore: result?.score,
          comment: result?.comment
        };

        if (skill.requiresCertificate) {
          workRecords.push(item);
        } else {
          switch (this.getSkillPrimaryMethod(skill.id)) {
            case 'WRITTEN_EXAM':
              writtenExams.push(item);
              break;
            case 'INTERVIEW':
            case 'PRACTICAL_DEMO':
              managerialInterviews.push(item);
              break;
            case 'OJT_OBSERVATION':
              evaluations360.push(item);
              break;
            case 'WORK_RECORD_REVIEW':
              workRecords.push(item);
              break;
          }
        }
      }
    });

    return { writtenExams, managerialInterviews, evaluations360, workRecords };
  }

  // Does a method block's audience include this user?
  isUserInAudience(
    userId: string,
    m: { audience: AssessmentAudience; audienceOrgLevels?: OrgLevel[]; audienceDepartmentIds?: string[] }
  ): boolean {
    const user = this.getUserById(userId);
    if (!user) return false;
    switch (m.audience) {
      case 'ALL':
        return true;
      case 'FRESH_ONLY':
        return user.orgLevel === 'FR';
      case 'MANAGERS_ONLY':
        return this.isManager(user);
      case 'ORG_LEVELS':
        return !!user.orgLevel && (m.audienceOrgLevels || []).includes(user.orgLevel);
      case 'DEPARTMENTS':
        return (m.audienceDepartmentIds || []).includes(user.departmentId);
      default:
        return false;
    }
  }

  // Per-skill assessment method blocks whose audience applies to the user.
  getApplicableMethodsForUserSkill(userId: string, skillId: string): SkillAssessmentMethod[] {
    return this.getSkillAssessmentMethods(skillId)
      .filter(m => this.isUserInAudience(userId, m));
  }

  // The 360°/OJT rater blend (self/peer/manager) to apply for this user+skill.
  // Reads the first applicable OJT/360 method block that carries raterWeights;
  // falls back to DEFAULT_RATER_WEIGHTS so behavior is unchanged when unset.
  getRaterWeightsForUserSkill(userId: string, skillId: string): RaterWeights {
    const block = this.getApplicableMethodsForUserSkill(userId, skillId).find(m =>
      (m.method === 'OJT_OBSERVATION' || m.method === 'THREE_SIXTY_EVALUATION') && m.raterWeights);
    return block?.raterWeights || DEFAULT_RATER_WEIGHTS;
  }

  // The exam pass mark (0-100) for a user+skill: the job profile's per-skill
  // override (JobProfileSkill.passingScorePercent) when set, otherwise the
  // skill's own WRITTEN_EXAM default. null when neither is configured.
  getPassingScoreForUserSkill(userId: string, skillId: string): number | null {
    const user = this.getUserById(userId);
    const job = user?.jobProfileId ? this.getJobProfile(user.jobProfileId) : undefined;
    const profileReq = job
      ? this.getEffectiveRequirements(job).find(r => r.skillId === skillId)
      : undefined;
    if (typeof profileReq?.passingScorePercent === 'number') return profileReq.passingScorePercent;
    const examDefault = this.getSkillAssessmentMethods(skillId)
      .find(m => m.method === 'WRITTEN_EXAM' && typeof m.passingScorePercent === 'number');
    return typeof examDefault?.passingScorePercent === 'number' ? examDefault.passingScorePercent : null;
  }

  // True when an applicable method block schedules the skill as
  // certificate-based (evidence carries an expiry date).
  isSkillCertificateBasedForUser(userId: string, skillId: string): boolean {
    return this.getApplicableMethodsForUserSkill(userId, skillId)
      .some(m => m.frequency === 'CERTIFICATE_BASED');
  }

  // Next due date for one method block/user/skill, or null if it never recurs.
  private computeMethodNextDueDate(m: SkillAssessmentMethod, userId: string, skillId: string): Date | null {
    if (m.frequency === 'ONE_TIME') return null;

    const now = new Date();

    if (m.frequency === 'CERTIFICATE_BASED') {
      const userEvidences = this.evidences.filter(e =>
        e.userId === userId && e.skillId === skillId && e.status === 'APPROVED' && e.expiryDate);
      if (userEvidences.length === 0) return now; // due until a valid certificate exists
      const latest = userEvidences.sort((a, b) =>
        new Date(b.expiryDate!).getTime() - new Date(a.expiryDate!).getTime())[0];
      return new Date(latest.expiryDate!);
    }

    const userAssessments = this.assessments
      .filter(a => a.subjectId === userId && a.skillId === skillId && !a.isArchived)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const lastDate = userAssessments.length > 0 ? new Date(userAssessments[0].date) : null;

    if (m.frequency === 'ANNUAL_FIXED_DATE') {
      const month = (m.fixedMonth ?? 1) - 1; // JS months are 0-based
      const day = m.fixedDay ?? 1;
      // Most recent occurrence of the fixed date on/before today.
      let lastDue = new Date(now.getFullYear(), month, day);
      if (lastDue > now) lastDue = new Date(now.getFullYear() - 1, month, day);
      // Overdue if it has never been assessed since the latest fixed date.
      if (!lastDate || lastDate < lastDue) return now;
      // Otherwise the next occurrence after today.
      const next = new Date(now.getFullYear(), month, day);
      if (next <= now) next.setFullYear(next.getFullYear() + 1);
      return next;
    }

    if (m.frequency === 'ANYTIME_ANNUAL') {
      if (!lastDate || lastDate.getFullYear() < now.getFullYear()) return now;
      return new Date(now.getFullYear() + 1, 0, 1); // due again at the start of next year
    }

    // Rolling intervals: WEEKLY / MONTHLY / QUARTERLY
    if (!lastDate) return now; // never assessed → due now
    const next = new Date(lastDate);
    if (m.frequency === 'WEEKLY') next.setDate(next.getDate() + 7);
    else if (m.frequency === 'MONTHLY') next.setMonth(next.getMonth() + 1);
    else if (m.frequency === 'QUARTERLY') next.setMonth(next.getMonth() + 3);
    return next;
  }

  // Earliest (most urgent) next-due date across every method block that applies
  // to this user+skill. Returns null when no block schedules the skill — a skill
  // with no recurring method is treated as one-time and never becomes due again.
  getNextAssessmentDate(userId: string, skillId: string): Date | null {
    const methods = this.getApplicableMethodsForUserSkill(userId, skillId);
    if (methods.length === 0) return null;

    let earliest: Date | null = null;
    for (const m of methods) {
      const due = this.computeMethodNextDueDate(m, userId, skillId);
      if (!due) continue;
      if (!earliest || due < earliest) earliest = due;
    }
    return earliest;
  }

  generateCareerPath(userId: string): CareerProgressionPlan | null {
    const user = this.getUserById(userId);
    if (!user || !user.jobProfileId || !user.orgLevel) return null;

    const currentJob = this.getJobProfile(user.jobProfileId);
    if (!currentJob) return null;

    // Succession Logic: Find all jobs in the same General Department to bridge gap requirements.
    // Prefer the user's explicit generalDepartmentId (the canonical grouping that
    // survives org-chart rebuilds); fall back to walking departmentId up the tree.
    // Jobs are matched either by direct departmentId equality (career-ladder
    // profiles are keyed straight to the general department) or by their own
    // tree walk — robust to orphaned departmentId references.
    const generalDeptId = user.generalDepartmentId || this.getGeneralDeptId(user.departmentId);
    const deptJobs = this.getAllJobs().filter(j =>
      j.departmentId === generalDeptId || this.getGeneralDeptId(j.departmentId) === generalDeptId
    );

    const currentIndex = ORG_HIERARCHY_ORDER.indexOf(user.orgLevel);
    if (currentIndex === -1) return null;

    const roadmap: CareerLevelProgress[] = [];

    // Loop from current position up to GM (index 0)
    for (let i = currentIndex - 1; i >= 0; i--) {
      const level = ORG_HIERARCHY_ORDER[i];

      // Each position is its own profile at a single org level. Find the
      // department's position profile for this higher level and use its
      // required skills as the promotion target.
      const targetJob = deptJobs.find(j => j.orgLevel === level && this.getEffectiveRequirements(j).length > 0)
        || deptJobs.find(j => j.orgLevel === level);
      const requirements = this.getEffectiveRequirements(targetJob);

      const promReqs: PromotionRequirement[] = [];
      let totalGapPoints = 0;
      
      requirements.forEach(req => {
        const currentScore = this.getUserSkillScore(userId, req.skillId);
        const gap = Math.max(0, req.requiredLevel - currentScore);
        const skill = this.getSkill(req.skillId);
        
        promReqs.push({
          skillId: req.skillId,
          skillName: skill?.name || 'Unknown Skill',
          currentScore,
          requiredScore: req.requiredLevel,
          gap
        });

        totalGapPoints += gap;
      });

      let readinessStatus: 'READY_NOW' | 'READY_1_2_YEARS' | 'READY_3_5_YEARS' | 'DEVELOPMENT_NEEDED' = 'DEVELOPMENT_NEEDED';
      if (totalGapPoints === 0 && requirements.length > 0) readinessStatus = 'READY_NOW';
      else if (totalGapPoints <= 2) readinessStatus = 'READY_1_2_YEARS';
      else if (totalGapPoints <= 5) readinessStatus = 'READY_3_5_YEARS';

      roadmap.push({
        level,
        requirements: promReqs,
        readinessStatus,
        isDefined: requirements.length > 0
      });
    }

    return {
      userId,
      currentLevel: user.orgLevel,
      roadmap
    };
  }

  // --- PUBLIC METHODS (GETTERS - Synchronous for UI Performance) ---

  login(email: string): User | undefined {
    return this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  getUserById(id: string) { return this.users.find(u => u.id === id && !u.isArchived); }
  getJobProfile(id: string) { return this.jobs.find(j => j.id === id && !j.isArchived); }
  // Active job profiles (positions) attached to a specific department/unit.
  getJobProfilesByDepartment(departmentId: string) {
    return this.jobs.filter(j => j.departmentId === departmentId && !j.isArchived);
  }
  // When a user is attached to a unit but has no job profile, and that unit has
  // exactly one profile, adopt it. Multi-profile units stay manual (ambiguous).
  // Then reconcile the user's hierarchy level with the assigned profile:
  // one position = one profile = one orgLevel, so the employee's orgLevel is
  // *derived* from the profile and can never drift out of sync. This is the
  // authoritative guard against mis-assignments — every write path (Admin form,
  // bulk import, seed scripts) routes through add/updateUser, hence through here.
  private autoAssignJobProfile(user: User) {
    if (user.departmentId && !user.jobProfileId) {
      const deptJobs = this.getJobProfilesByDepartment(user.departmentId);
      if (deptJobs.length === 1) user.jobProfileId = deptJobs[0].id;
    }
    if (user.jobProfileId) {
      const profile = this.getJobProfile(user.jobProfileId);
      if (profile?.orgLevel) user.orgLevel = profile.orgLevel;
    }
  }

  // UI helper: does this user's stored orgLevel disagree with the org level of
  // their assigned job profile? Returns the profile's expected level when there
  // is a mismatch (so callers can warn / auto-correct), otherwise null.
  getUserOrgLevelMismatch(user: Pick<User, 'jobProfileId' | 'orgLevel'>): OrgLevel | null {
    if (!user.jobProfileId) return null;
    const profile = this.getJobProfile(user.jobProfileId);
    if (!profile?.orgLevel) return null;
    return profile.orgLevel !== user.orgLevel ? profile.orgLevel : null;
  }

  // Returns the required skills for a job profile (position). Each position is
  // its own profile with a single flat skill list, so this just returns the
  // profile's requiredSkills, dropping any that reference deleted skills.
  getEffectiveRequirements(profile: JobProfile | undefined | null): JobProfileSkill[] {
    if (!profile) return [];
    return (profile.requiredSkills || []).filter(req => !!this.getSkill(req.skillId));
  }
  // A2.4: Archived items are excluded from active queries; pass includeArchived for admin audit views.
  getAllSkills(includeArchived = false) { return includeArchived ? this.skills : this.skills.filter(s => !s.isArchived); }
  getAllJobs(includeArchived = false) { return includeArchived ? this.jobs : this.jobs.filter(j => !j.isArchived); }
  getAllUsers(includeArchived = false) { return includeArchived ? this.users : this.users.filter(u => !u.isArchived); }
  getPublicUsers() {
    return this.users.filter(u => !u.isArchived && u.role !== Role.CEO && u.orgLevel !== 'CEO');
  }
  getAllDepartments() { return this.departments; }
  getSkill(id: string) { return this.skills.find(s => s.id === id && !s.isArchived); }
  getAllTrainingCourses() { return this.trainingCourses; }
  getCoursesForSkill(skillId: string) { return this.trainingCourses.filter(c => c.linkedSkillIds.includes(skillId)); }
  getSystemLogs() { return this.logs; }

  // On-demand fetch of the full audit trail (ISO.1). The live listener keeps
  // only the latest 50 in memory; the admin Audit Trail view pulls a deeper
  // history when opened.
  async fetchAuditLogs(max = 500): Promise<ActivityLog[]> {
    try {
      const snap = await getDocs(
        query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(max))
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLog));
    } catch (err) {
      console.error('fetchAuditLogs failed', err);
      return this.logs;
    }
  }
  getAllProjects() { return this.projects; }
  getProjectById(id: string) { return this.projects.find(p => p.id === id); }


  getGeneralDeptId(deptId: string | undefined, _visited: Set<string> = new Set()): string | undefined {
    if (!deptId) return undefined;
    // A2.3: Guard against circular parentId references causing infinite recursion.
    if (_visited.has(deptId)) return undefined;
    _visited.add(deptId);
    const dept = this.departments.find(d => d.id === deptId);
    if (!dept) return undefined;
    if (dept.type === 'GENERAL' || !dept.parentId) return dept.id;
    return this.getGeneralDeptId(dept.parentId, _visited);
  }

  // --- Org-hierarchy placement rules ---------------------------------------
  // The org chart must stay strictly ordered (CEO → ACEO → GM → AGM → DM → SH →
  // SP → JP → FR). A child unit must sit *below* its parent, and a position's
  // job-profile org level must not sit *above* the unit it belongs to. SECTION
  // (Section Head) is the deepest unit level; SP/JP/FR are individual positions
  // attached to a unit. These resolvers are the single source for that check;
  // the Admin forms call them to block invalid placements before saving.

  // The org level a department node implies. Unit types come from
  // DEPT_TYPE_TO_ORG_LEVEL; POSITION nodes are resolved from their title.
  getDepartmentOrgLevel(dept: Department | undefined | null): OrgLevel | null {
    if (!dept) return null;
    if (dept.type === 'POSITION') return this.parsePositionOrgLevel(dept);
    return dept.type ? (DEPT_TYPE_TO_ORG_LEVEL[dept.type] ?? null) : null;
  }

  // Resolve a titled (POSITION) node's org level from its name. Order matters:
  // "assistant general manager" (مدير عام مساعد) must be tested before the
  // plain "general manager" (مدير عام) substring.
  private parsePositionOrgLevel(dept: Department): OrgLevel | null {
    const t = `${dept.name || ''} ${dept.nameAr || ''}`.toLowerCase();
    if (/assistant general manager/.test(t) || t.includes('مدير عام مساعد')) return 'AGM';
    if (/general manager/.test(t) || t.includes('مدير عام')) return 'GM';
    if (/\bmanager\b/.test(t) || t.includes('مدير')) return 'DM';
    return null;
  }

  // Validate that a unit of `childType` may be nested under `parentId`.
  // Rule: the child's implied level must be strictly below the parent's. A unit
  // cannot be created under a Section Head (SH) — that is the deepest unit level.
  // Unknown parent level (POSITION/COMPANY/missing) ⇒ allowed (cannot determine).
  validateUnitPlacement(childType: DepartmentType | undefined, parentId: string | undefined): { ok: boolean; error?: string } {
    if (!parentId) return { ok: true }; // top-level unit under the root org
    const childLevel = childType ? DEPT_TYPE_TO_ORG_LEVEL[childType] : null;
    if (!childLevel) return { ok: true }; // can't constrain a level-less type
    const parent = this.departments.find(d => d.id === parentId);
    const parentLevel = this.getDepartmentOrgLevel(parent);
    if (!parent || !parentLevel) return { ok: true };
    const childIdx = ORG_LEVEL_NUMBERS[childLevel];
    const parentIdx = ORG_LEVEL_NUMBERS[parentLevel];
    if (childIdx <= parentIdx) {
      const reason = childIdx === parentIdx
        ? `same level as its parent (${parentLevel})`
        : `above its parent (${childLevel} sits above ${parentLevel})`;
      return {
        ok: false,
        error: `A ${childType} unit (${childLevel}) can't be placed under "${parent.name}" (${parentLevel}) — it would be ${reason}. A child unit must sit below its parent in the hierarchy.`,
      };
    }
    return { ok: true };
  }

  // Validate that a job profile at `orgLevel` may belong to `departmentId`.
  // Rule: the profile must not sit above the unit it is attached to. The unit's
  // head occupies the unit level; people in it are at or below it (SP/JP/FR).
  validateJobProfilePlacement(orgLevel: OrgLevel | undefined, departmentId: string | undefined): { ok: boolean; error?: string } {
    if (!orgLevel || !departmentId) return { ok: true };
    const dept = this.departments.find(d => d.id === departmentId);
    const unitLevel = this.getDepartmentOrgLevel(dept);
    if (!dept || !unitLevel) return { ok: true };
    if (ORG_LEVEL_NUMBERS[orgLevel] < ORG_LEVEL_NUMBERS[unitLevel]) {
      return {
        ok: false,
        error: `A ${orgLevel} profile can't belong to "${dept.name}" (${unitLevel}) — a position can't sit above its own unit. Use ${unitLevel} or a lower level (e.g. SP/JP/FR).`,
      };
    }
    return { ok: true };
  }

  getSubordinates(managerId: string) {
    // A user reports to this person if EITHER their explicit Direct Manager
    // (User.managerId) is set to them, OR they belong to a Direct Department /
    // Section this person manages (Department.managerId). Restricted to
    // ASSISTANT_GENERAL / DEPARTMENT / SECTION so a GENERAL-dept owner (e.g. a
    // GM) does not pull a whole org branch in as direct reports.
    const managedDeptIds = new Set(
      this.departments
        .filter(d => d.managerId === managerId && (d.type === 'ASSISTANT_GENERAL' || d.type === 'DEPARTMENT' || d.type === 'SECTION'))
        .map(d => d.id)
    );

    return this.users.filter(u =>
      u.id !== managerId && (
        u.managerId === managerId ||
        managedDeptIds.has(u.departmentId)
      )
    );
  }

  getPeers(userId: string) {
    const user = this.getUserById(userId);
    if (!user) return [];
    
    if (user.managerId) {
       return this.users.filter(u => u.managerId === user.managerId && u.id !== userId);
    }

    return this.users.filter(u => 
        u.id !== userId && 
        u.departmentId === user.departmentId &&
        u.orgLevel === user.orgLevel
    );
  }

  getUserSkillScore(userId: string, skillId: string, includeArchived: boolean = false): number {
    // A3.2: Cache by userId:skillId (non-archived path only; archived is a rare
    // historical query so we don't pollute the hot cache with it).
    if (!includeArchived) {
      const cacheKey = `${userId}:${skillId}`;
      const cached = this.skillScoreCache.get(cacheKey);
      if (cached !== undefined) return cached;
    }

    const skill = this.getSkill(skillId);
    if (!skill) return 0;

    let result: number;

    // Behavioral (360) Logic
    if (this.getSkillPrimaryMethod(skillId) === 'OJT_OBSERVATION') {
      let userAssessments = this.assessments.filter(a => a.subjectId === userId && a.skillId === skillId);
      if (!includeArchived) {
        userAssessments = userAssessments.filter(a => !a.isArchived);
      }
      if (userAssessments.length === 0) { result = 0; }
      else {
        // Average across *distinct raters*, counting each rater only once at
        // their most recent rating. The 360 average is meant to blend multiple
        // people's views (esp. peers), not multiple time points from the same
        // person — so a rater who re-rates across cycles must not be
        // double-counted, and the current score reflects their latest input.
        const latestPerRater = (arr: Assessment[]) => {
          const byRater = new Map<string, Assessment>();
          for (const a of arr) {
            const prev = byRater.get(a.raterId);
            if (!prev || new Date(a.date).getTime() > new Date(prev.date).getTime()) byRater.set(a.raterId, a);
          }
          return [...byRater.values()];
        };
        const selfA = latestPerRater(userAssessments.filter(a => a.type === 'SELF'));
        const peerA = latestPerRater(userAssessments.filter(a => a.type === 'PEER'));
        const mgrA = latestPerRater(userAssessments.filter(a => a.type === 'MANAGER'));

        const avgSelf = selfA.length > 0 ? selfA.reduce((s, a) => s + a.score, 0) / selfA.length : null;
        const avgPeer = peerA.length > 0 ? peerA.reduce((s, a) => s + a.score, 0) / peerA.length : null;
        const avgMgr = mgrA.length > 0 ? mgrA.reduce((s, a) => s + a.score, 0) / mgrA.length : null;

        // 360° blend is admin-configurable per skill (see SkillAssessmentMethod
        // .raterWeights); defaults to Self 10 / Peer 30 / Mgr 60. Weights are
        // re-normalized over the rater types that actually submitted.
        const rw = this.getRaterWeightsForUserSkill(userId, skillId);
        let totalWeight = 0;
        let weightedScore = 0;

        if (avgSelf !== null) { weightedScore += avgSelf * rw.self; totalWeight += rw.self; }
        if (avgPeer !== null) { weightedScore += avgPeer * rw.peer; totalWeight += rw.peer; }
        if (avgMgr  !== null) { weightedScore += avgMgr  * rw.manager; totalWeight += rw.manager; }

        result = totalWeight === 0 ? 0 : Math.round(weightedScore / totalWeight);
      }
    } else {
      // Evidence, Online Assessment, or Interview Logic
      let directAssessments = this.assessments.filter(a => a.subjectId === userId && a.skillId === skillId && (a.type === 'WRITTEN_EXAM' || a.type === 'INTERVIEW' || a.type === 'PRACTICAL_DEMO'));
      if (!includeArchived) {
        directAssessments = directAssessments.filter(a => !a.isArchived);
      }

      if (directAssessments.length > 0) {
        result = directAssessments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].score;
      } else {
        const relevantEvidence = this.evidences.filter(e => e.userId === userId && e.skillId === skillId && e.status === 'APPROVED' && e.assignedScore);
        if (relevantEvidence.length === 0) { result = 0; }
        else {
          const maxScore = Math.max(...relevantEvidence.map(e => e.assignedScore || 0));
          result = Math.min(Math.max(Math.round(maxScore), 1), 5);
        }
      }
    }

    if (!includeArchived) {
      this.skillScoreCache.set(`${userId}:${skillId}`, result);
    }
    return result;
  }

  getAssessments(filters: { raterId?: string, subjectId?: string, cycleId?: string, skillId?: string, includeArchived?: boolean }) {
    return this.assessments.filter(a => {
      // Archived records are superseded duplicates (see dedup-assessments.mjs)
      // — excluded by default so the Historical Record and every other reader
      // shows one live evaluation per rater+subject+skill, matching
      // getUserSkillScore / getAssessmentHistory. Opt in with includeArchived.
      if (!filters.includeArchived && a.isArchived) return false;
      const matchRater = filters.raterId ? a.raterId === filters.raterId : true;
      const matchSubject = filters.subjectId ? a.subjectId === filters.subjectId : true;
      const matchCycle = filters.cycleId ? a.cycleId === filters.cycleId : true;
      const matchSkill = filters.skillId ? a.skillId === filters.skillId : true;
      return matchRater && matchSubject && matchCycle && matchSkill;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // --- CYCLES ---
  getAllCycles() {
    return [...this.cycles].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }

  getActiveCycle() {
    return this.cycles.find(c => c.status === 'ACTIVE');
  }

  // NOTE: The legacy "Assessment Engine" write logic (addCycle / updateCycle /
  // archiveAssessments) was removed when the Cycles admin page was replaced by
  // Assessment Management. Cycle reads (getAllCycles/getActiveCycle) remain for
  // historical appraisal display. Scheduling now lives in Assessment Plans.

  // --- ASSESSMENT PLANS (Assessment Management) ---
  getAllAssessmentPlans() {
    return [...this.assessmentPlans].sort((a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime());
  }

  getAssessmentPlan(id: string) {
    return this.assessmentPlans.find(p => p.id === id);
  }

  async addAssessmentPlan(plan: Omit<AssessmentPlan, 'id' | 'createdAt' | 'updatedAt'>) {
    const id = doc(collection(db, 'assessmentPlans')).id;
    const now = new Date().toISOString();
    const newPlan: AssessmentPlan = { ...plan, id, createdAt: now, updatedAt: now };
    await this.persistItem('assessmentPlans', newPlan);
    await this.logActivity('Created Assessment Plan', newPlan.name);
    return newPlan;
  }

  async updateAssessmentPlan(plan: AssessmentPlan) {
    const updated: AssessmentPlan = { ...plan, updatedAt: new Date().toISOString() };
    await this.updateItem('assessmentPlans', updated);
    await this.logActivity('Updated Assessment Plan', updated.name);
  }

  async deleteAssessmentPlan(id: string) {
    const plan = this.getAssessmentPlan(id);
    await this.deleteItem('assessmentPlans', id);
    await this.logActivity('Deleted Assessment Plan', plan?.name || id);
  }

  // --- ASSESSMENT INSTRUCTIONS ---
  // Reusable "how to assess" definitions. Skills reference them via
  // Skill.assessmentInstructionIds; a skill may reference several.

  getAllAssessmentInstructions() {
    return [...this.assessmentInstructions].sort((a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime());
  }

  getAssessmentInstruction(id: string) {
    return this.assessmentInstructions.find(i => i.id === id);
  }

  async addAssessmentInstruction(instruction: Omit<AssessmentInstruction, 'id' | 'createdAt' | 'updatedAt'>) {
    const id = doc(collection(db, 'assessmentInstructions')).id;
    const now = new Date().toISOString();
    const newInstruction: AssessmentInstruction = { ...instruction, id, createdAt: now, updatedAt: now };
    await this.persistItem('assessmentInstructions', newInstruction);
    await this.logActivity('Created Assessment Instruction', newInstruction.name);
    return newInstruction;
  }

  async updateAssessmentInstruction(instruction: AssessmentInstruction) {
    const updated: AssessmentInstruction = { ...instruction, updatedAt: new Date().toISOString() };
    await this.updateItem('assessmentInstructions', updated);
    await this.logActivity('Updated Assessment Instruction', updated.name);
  }

  async deleteAssessmentInstruction(id: string) {
    const instruction = this.getAssessmentInstruction(id);
    // Detach from any skills that referenced it so nothing dangles.
    const affected = this.skills.filter(s => (s.assessmentInstructionIds || []).includes(id));
    await this.deleteItem('assessmentInstructions', id);
    for (const skill of affected) {
      await this.updateItem('skills', {
        ...skill,
        assessmentInstructionIds: (skill.assessmentInstructionIds || []).filter(x => x !== id)
      });
    }
    await this.logActivity('Deleted Assessment Instruction', instruction?.name || id);
  }

  // --- ASSESSMENT RESOLUTION (per-skill, legacy-safe) ---

  // The assessment method blocks defined inline on a skill. Falls back to a
  // synthesized block from the deprecated linked-instruction / per-skill fields
  // when none are set (covers any not-yet-migrated docs).
  getSkillAssessmentMethods(skillId: string): SkillAssessmentMethod[] {
    const skill = this.getSkill(skillId);
    if (!skill) return [];
    if ((skill.assessmentMethods || []).length > 0) return skill.assessmentMethods!;
    return this.synthesizeLegacyMethods(skill);
  }

  // Build per-skill method blocks from the deprecated linked AssessmentInstruction
  // docs or the old per-skill fields, so resolution keeps working before the
  // one-time migration runs. Defaults frequency/audience (scheduling lived on
  // separate plans, so legacy blocks recur only if a matching plan still does).
  private synthesizeLegacyMethods(skill: Skill): SkillAssessmentMethod[] {
    const fromInstruction = (i: AssessmentInstruction): SkillAssessmentMethod => ({
      id: `legacy-instr:${i.id}`,
      method: i.method,
      assessmentQuestion: i.assessmentQuestion,
      assessmentLink: i.assessmentLink,
      questions: [
        ...(i.evaluationQuestions || []),
        ...(i.interviewQuestions || []),
        ...(i.threeSixtyQuestions || []),
        ...(i.annualAppraisalQuestions || [])
      ],
      frequency: 'ONE_TIME',
      audience: 'ALL'
    });

    const linked = (skill.assessmentInstructionIds || [])
      .map(id => this.assessmentInstructions.find(i => i.id === id))
      .filter((i): i is AssessmentInstruction => !!i && i.status === 'ACTIVE');
    if (linked.length > 0) return linked.map(fromInstruction);

    if (skill.assessmentMethod || skill.assessmentQuestion || skill.assessmentLink) {
      return [{
        id: `legacy:${skill.id}`,
        method: skill.assessmentMethod || 'OJT_OBSERVATION',
        assessmentQuestion: skill.assessmentQuestion,
        assessmentLink: skill.assessmentLink,
        questions: [
          ...(skill.evaluationQuestions || []),
          ...(skill.interviewQuestions || []),
          ...(skill.threeSixtyQuestions || [])
        ],
        frequency: 'ONE_TIME',
        audience: 'ALL'
      }];
    }
    return [];
  }

  getSkillMethods(skillId: string): AssessmentMethod[] {
    return Array.from(new Set(this.getSkillAssessmentMethods(skillId).map(m => m.method)));
  }

  skillHasMethod(skillId: string, method: AssessmentMethod): boolean {
    return this.getSkillMethods(skillId).includes(method);
  }

  // The method that drives single-method consumers (scoring, queue bucket).
  // Defaults to OJT_OBSERVATION so an unconfigured skill still routes to 360.
  getSkillPrimaryMethod(skillId: string): AssessmentMethod {
    return this.getSkillAssessmentMethods(skillId)[0]?.method || 'OJT_OBSERVATION';
  }

  getSkillAssessmentLink(skillId: string): string | undefined {
    const methods = this.getSkillAssessmentMethods(skillId);
    const exam = methods.find(m => m.method === 'WRITTEN_EXAM' && m.assessmentLink);
    return exam?.assessmentLink || methods.find(m => m.assessmentLink)?.assessmentLink;
  }

  getSkillAssessmentQuestion(skillId: string): string | undefined {
    return this.getSkillAssessmentMethods(skillId).find(m => m.assessmentQuestion)?.assessmentQuestion;
  }

  // One-time, idempotent migration of the deprecated assessment model
  // (AssessmentInstruction "how" + AssessmentPlan "when" + legacy per-skill
  // fields) into inline Skill.assessmentMethods blocks. Admin-only screens call
  // this (skills are admin-write); safe to invoke repeatedly. Company-wide
  // ANNUAL_APPRAISAL plans are intentionally left as plans (the Behavioral
  // Assessment page still reads them) and are not folded into any skill.
  private assessmentMigrationRan = false;
  async migrateAssessmentConfigToSkills(): Promise<void> {
    if (this.assessmentMigrationRan) return;
    this.assessmentMigrationRan = true;

    // Skills that have no inline blocks yet but carry some legacy config.
    const pending = this.skills.filter(s =>
      (s.assessmentMethods || []).length === 0 &&
      ((s.assessmentInstructionIds || []).length > 0 ||
       s.assessmentMethod || s.assessmentQuestion || s.assessmentLink ||
       (s.evaluationQuestions || []).length || (s.interviewQuestions || []).length ||
       (s.threeSixtyQuestions || []).length));

    if (pending.length === 0) return;

    try {
      for (const skill of pending) {
        // "How" blocks from linked instructions / legacy fields.
        const blocks = this.synthesizeLegacyMethods(skill);
        if (blocks.length === 0) continue;

        // Overlay "when"/"who" from any active plan covering this skill, matched
        // by method. Plans without a matching block still seed a block so the
        // schedule is preserved.
        const plans = this.assessmentPlans.filter(p =>
          p.status === 'ACTIVE' && p.method !== 'ANNUAL_APPRAISAL' && p.skillIds.includes(skill.id));

        for (const plan of plans) {
          const match = blocks.find(b => b.method === plan.method);
          const schedule = {
            frequency: plan.frequency,
            fixedMonth: plan.fixedMonth,
            fixedDay: plan.fixedDay,
            audience: plan.audience,
            audienceOrgLevels: plan.audienceOrgLevels,
            audienceDepartmentIds: plan.audienceDepartmentIds
          };
          if (match) {
            Object.assign(match, schedule);
          } else {
            blocks.push({
              id: `mig:${plan.id}`,
              method: plan.method,
              questions: [],
              ...schedule
            });
          }
        }

        // Strip undefined so Firestore accepts the payload.
        const clean = blocks.map(b => JSON.parse(JSON.stringify(b)) as SkillAssessmentMethod);
        await this.updateItem('skills', { ...skill, assessmentMethods: clean });
      }
      await this.logActivity('Migrated assessment config to skills', `${pending.length} skill(s)`);
    } catch (e) {
      // Non-admin or transient failure — allow a later admin session to retry.
      this.assessmentMigrationRan = false;
      console.error('migrateAssessmentConfigToSkills failed', e);
    }
  }

  // --- NOTIFICATIONS ---
  
  getNotifications(userId: string): Notification[] {
    const user = this.users.find(u => u.id === userId);
    if (!user) return [];

    const dynamicNotifications: Notification[] = [];

    if (user.role === Role.ADMIN) {
      const pendingUsers = this.users.filter(u => u.status === 'PENDING');
      if (pendingUsers.length > 0) {
        dynamicNotifications.push({
          id: 'dyn-admin-pending',
          userId: user.id,
          title: 'Pending Approvals',
          message: `There are ${pendingUsers.length} user(s) waiting for approval.`,
          type: 'WARNING',
          isRead: false,
          createdAt: new Date().toISOString(),
          actionLink: 'admin-users'
        });
      }
    }

    if (this.isManager(user) && user.role !== Role.ADMIN) {
      const teamMembers = this.users.filter(u => u.managerId === user.id);
      const teamMemberIds = new Set(teamMembers.map(u => u.id));
      
      const recentAssessments = this.assessments.filter(a => 
        teamMemberIds.has(a.subjectId) && 
        a.raterId !== user.id && 
        new Date(a.date).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
      );

      if (recentAssessments.length > 0) {
        dynamicNotifications.push({
          id: 'dyn-mgr-assessments',
          userId: user.id,
          title: 'Recent Team Assessments',
          message: `${recentAssessments.length} new assessment(s) submitted for your team members recently.`,
          type: 'INFO',
          isRead: false,
          createdAt: new Date().toISOString(),
          actionLink: 'manager-dashboard'
        });
      }
    }

    return [...dynamicNotifications, ...this.notifications.filter(n => n.userId === userId)]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async markNotificationAsRead(notificationId: string) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      await this.updateItem('notifications', { ...notification, isRead: true });
    }
  }

  async markAllNotificationsAsRead(userId: string) {
    const unread = this.notifications.filter(n => n.userId === userId && !n.isRead);
    for (const n of unread) {
      await this.updateItem('notifications', { ...n, isRead: true });
    }
  }

  // A5.4: Retried up to 3× with exponential backoff so transient Firestore
  // hiccups don't silently drop notification writes.
  async addNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) {
    const id = doc(collection(db, 'notifications')).id;
    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    await this.withRetry(() => this.persistItem('notifications', newNotification));
  }

  // --- ACTIONS (Async Write-Behind) ---

  // Resolve the acting user from the live auth session for audit attribution
  // (ISO.1). Best-effort: returns empty when the actor can't be matched (e.g.
  // a pre-auth system event) so the log still writes.
  private resolveActor(): { actorId?: string; actorName?: string } {
    const uid = auth.currentUser?.uid;
    const email = auth.currentUser?.email?.toLowerCase();
    const profile =
      (uid && this.users.find(u => u.id === uid)) ||
      (email && this.users.find(u => u.email?.toLowerCase() === email)) ||
      null;
    if (profile) return { actorId: profile.id, actorName: profile.name };
    if (email) return { actorName: email };
    return {};
  }

  public async logActivity(
    action: string,
    target: string,
    details?: { entity?: string; entityId?: string; before?: string; after?: string }
  ) {
    const id = doc(collection(db, 'activityLogs')).id;
    // Build without undefined fields — Firestore rejects them.
    const newLog: ActivityLog = {
        id,
        action,
        target,
        timestamp: new Date().toISOString(),
        ...this.resolveActor(),
    };
    if (details?.entity !== undefined) newLog.entity = details.entity;
    if (details?.entityId !== undefined) newLog.entityId = details.entityId;
    if (details?.before !== undefined) newLog.before = details.before;
    if (details?.after !== undefined) newLog.after = details.after;
    await this.persistItem('activityLogs', newLog);
  }

  // The evaluation "period" an assessment belongs to, used to dedupe a rater's
  // re-submissions: the explicit cycleId when present, otherwise the calendar
  // year of the record's date (or the current year for an unsaved record).
  // Same bucket ⇒ an update-in-place; a new bucket ⇒ a new historical record.
  private assessmentCycleBucket(a: { cycleId?: string; date?: string }): string {
    if (a.cycleId) return `cycle:${a.cycleId}`;
    const year = a.date ? new Date(a.date).getFullYear() : new Date().getFullYear();
    return `year:${year}`;
  }

  async addAssessment(assessment: Omit<Assessment, 'id' | 'date'>) {
    const subject = this.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
    const skillName = assessment.skillId === 'annual-appraisal'
      ? 'Annual Appraisal'
      : (this.skills.find(s => s.id === assessment.skillId)?.name || assessment.skillId);

    // Upsert: a rater holds at most one live evaluation per subject+skill
    // *within a cycle*. Re-submitting in the same period UPDATES that record in
    // place rather than appending a duplicate — otherwise the History Ledger
    // fills with duplicate rows and the score double-counts the same rater.
    // The period is the explicit cycleId when set, else the calendar year, so a
    // fresh evaluation in a new year keeps the prior year as its own historical
    // record (e.g. the Annual Appraisal Historical Record grows one row/year)
    // instead of overwriting it. Mirrors the `existingAssessment` form lookup.
    const incomingBucket = this.assessmentCycleBucket(assessment);
    const existing = this.assessments.find(a =>
      !a.isArchived &&
      a.raterId === assessment.raterId &&
      a.subjectId === assessment.subjectId &&
      a.skillId === assessment.skillId &&
      this.assessmentCycleBucket(a) === incomingBucket
    );

    if (existing) {
      const updated: Assessment = {
        ...existing,
        ...assessment,
        id: existing.id,
        date: new Date().toISOString(),
      };
      await this.updateItem('assessments', updated);

      await this.logActivity('Updated Assessment', `For ${subject}`, {
        entity: 'assessment',
        entityId: existing.id,
        before: `${skillName} (${existing.type}) → ${existing.score}`,
        after: `${skillName} (${updated.type}) → ${updated.score}`,
      });

      if (assessment.raterId !== assessment.subjectId) {
        await this.addNotification({
          userId: assessment.subjectId,
          title: 'Evaluation Updated',
          message: `An existing ${assessment.method} evaluation on your profile was updated.`,
          type: 'INFO',
          actionLink: 'emp-dashboard'
        });
      }
      return;
    }

    const id = doc(collection(db, 'assessments')).id;
    const newAssessment: Assessment = {
      ...assessment,
      id,
      date: new Date().toISOString(),
    };
    await this.persistItem('assessments', newAssessment);

    // Auto-update notification for the subject
    await this.addNotification({
      userId: assessment.subjectId,
      title: 'New Evaluation Result',
      message: `A new ${assessment.method} evaluation has been registered for your profile.`,
      type: 'INFO',
      actionLink: 'emp-dashboard'
    });

    await this.logActivity('Submitted Assessment', `For ${subject}`, {
      entity: 'assessment',
      entityId: id,
      after: `${skillName} (${assessment.type}) → ${assessment.score}`,
    });

    if (assessment.raterId !== assessment.subjectId) {
      await this.addNotification({
        userId: assessment.subjectId,
        title: 'New Assessment Received',
        message: `You received a new assessment.`,
        type: 'INFO',
        actionLink: 'emp-dashboard'
      });
    }
  }

  async updateAssessment(assessment: Assessment) {
    const prior = this.assessments.find(a => a.id === assessment.id);
    await this.updateItem('assessments', assessment);
    const subject = this.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
    await this.logActivity('Updated Assessment', `For ${subject}`, {
      entity: 'assessment',
      entityId: assessment.id,
      before: prior ? `score ${prior.score}` : undefined,
      after: `score ${assessment.score}`,
    });
  }

  async addSkill(skill: Skill) { 
    if (!skill.code) {
        skill.code = this.generateSkillCode(skill);
    }
    await this.persistItem('skills', skill);
    await this.logActivity('Defined New Skill', skill.name);
  }
  
  public generateSkillCode(skill: Skill): string {
    const catPrefix = (skill.category || 'GEN').substring(0, 3).toUpperCase();
    const subPrefix = skill.subcategory ? skill.subcategory.replace(/\s+/g, '').substring(0, 3).toUpperCase() : (skill.name || 'SKL').replace(/\s+/g, '').substring(0, 3).toUpperCase();
    
    // Count existing skills with this prefix to get a sequential index
    const existingCount = this.skills.filter(s => s.code?.startsWith(`${catPrefix}-${subPrefix}`)).length;
    const index = (existingCount + 1).toString().padStart(2, '0');
    
    return `${catPrefix}-${subPrefix}-${index}`;
  }

  async addJobProfile(job: JobProfile) { 
    if (!job.code) {
        job.code = this.generateJobProfileCode(job);
    }
    await this.persistItem('jobProfiles', job);
    await this.logActivity('Created Job Profile', job.title);
  }

  public generateJobProfileCode(job: JobProfile): string {
    const dept = this.departments.find(d => d.id === job.departmentId);
    const deptPrefix = (dept?.name || 'GEN').substring(0, 3).toUpperCase();
    
    // Title Initials (e.g., "Department Manager" -> "DM")
    const titleInitials = job.title
        .split(/\s+/)
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 4); // Keep it reasonable
        
    return `${deptPrefix}-${titleInitials}`;
  }
  
  async addUser(user: User) {
    this.autoAssignJobProfile(user);
    await this.persistItem('users', user);
    await this.logActivity('Onboarded Employee', user.name);
  }

  async addDepartment(dept: Department) {
    if (!dept.code) {
      const used = new Set(this.departments.map(d => d.code).filter(Boolean) as string[]);
      dept.code = this.generateDepartmentCode(dept, used);
    }
    await this.persistItem('departments', dept);
    await this.logActivity('Created Department', dept.name);
  }

  // Short, searchable mnemonic identifier for a department (e.g. HR-PERS,
  // FIN-ACCT). Derived from the curated doc id when it follows the org-chart
  // convention (type prefix + slug, e.g. `d-hr-pers`), otherwise abbreviated
  // from the English name. `used` guarantees uniqueness across departments.
  public generateDepartmentCode(dept: Department, used: Set<string> = new Set()): string {
    const CURATED = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/; // org-chart ids: chairman, g-hr, d-hr-pers, sec-admin
    const TYPE_PREFIXES = ['sec-', 'g-', 'd-', 'p-'];
    const STOP = new Set(['of', 'and', 'the', 'for', 'to', 'a', 'an', 'within', 'with', 'general', 'manager']);

    let base: string;
    const id = dept.id || '';
    if (CURATED.test(id) && id.length <= 40) {
      // Strip the org-level type prefix, uppercase the remaining slug.
      let slug = id;
      for (const p of TYPE_PREFIXES) {
        if (id.startsWith(p)) { slug = id.slice(p.length); break; }
      }
      base = slug.toUpperCase();
    } else {
      // UI-created dept with a random Firestore id — abbreviate the name.
      const words = (dept.name || 'DEPT')
        .replace(/[^A-Za-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter(w => w && !STOP.has(w.toLowerCase()));
      if (words.length === 0) base = 'DEPT';
      else if (words.length === 1) base = words[0].substring(0, 4).toUpperCase();
      else base = words.map(w => w[0]).join('').toUpperCase().substring(0, 5);
    }

    // Ensure uniqueness with a numeric suffix when needed.
    let code = base;
    let n = 2;
    while (used.has(code)) code = `${base}-${n++}`;
    return code;
  }

  async addProject(project: Omit<Project, 'id'>) {
    const id = doc(collection(db, 'projects')).id;
    const newProject = { ...project, id };
    await this.persistItem('projects', newProject);
    await this.logActivity('Create Project', newProject.name);
    return newProject;
  }

  async updateProject(project: Project) {
    await this.updateItem('projects', project);
    await this.logActivity('Update Project', project.name);
  }


  async updateDepartment(dept: Department) {
    await this.updateItem('departments', dept);
    await this.logActivity('Updated Department', dept.name);
  }

  async updateUser(user: User) {
    this.autoAssignJobProfile(user);
    await this.updateItem('users', user);
    await this.logActivity('Updated Profile', user.name);
  }
  
  async updateJobProfile(job: JobProfile) {
    await this.updateItem('jobProfiles', job);
    await this.logActivity('Modified Job Profile', job.title);
  }
  
  async updateSkill(skill: Skill) {
    await this.updateItem('skills', skill);
    await this.logActivity('Updated Skill Standard', skill.name);
  }

  async approveSkill(id: string) {
    const skill = this.skills.find(s => s.id === id);
    if (skill) {
      await this.updateItem('skills', { ...skill, status: 'APPROVED' });
      await this.logActivity('Approved New Skill', skill.name);
    }
  }

  // --- REMOVE METHODS ---

  async removeUser(id: string) {
    const user = this.users.find(u => u.id === id);
    if (!user) return;

    // A2.2: Soft-delete the user and reassign all direct reports in a single
    // batch so partial failures cannot leave orphaned subordinates.
    const batch = writeBatch(db);
    const userDocId = await this.resolveUserDocPath(id);
    batch.update(doc(db, 'users', userDocId), { isArchived: true });

    const subordinates = this.users.filter(u => u.managerId === id && !u.isArchived);
    for (const sub of subordinates) {
      const subDocId = await this.resolveUserDocPath(sub.id);
      batch.update(doc(db, 'users', subDocId), { managerId: user.managerId ?? null });
    }

    try {
      await batch.commit();
    } catch (e) {
      this.handleFirestoreError(e, OperationType.DELETE, `users/${id}`);
      throw e;
    }
    await this.logActivity('Removed Employee', user.name);
  }

  async removeJobProfile(id: string) {
    const job = this.jobs.find(j => j.id === id);
    if (job) {
      // A2.4: Soft-delete — preserve historical references in closed assessments.
      await this.updateItem('jobProfiles', { ...job, isArchived: true });
      await this.logActivity('Removed Job Profile', job.title);
    }
  }

  async removeSkill(id: string) {
    const skill = this.skills.find(s => s.id === id);
    if (!skill) return;
    // A2.4: Soft-delete — preserve historical assessment records.
    await this.updateItem('skills', { ...skill, isArchived: true });

    // A2.7: Remove this skill from all assessment plans that reference it.
    const affectedPlans = this.assessmentPlans.filter(p => p.skillIds.includes(id));
    for (const plan of affectedPlans) {
      const updatedSkillIds = plan.skillIds.filter(sid => sid !== id);
      if (updatedSkillIds.length === 0) {
        await this.deleteItem('assessmentPlans', plan.id);
      } else {
        await this.updateItem('assessmentPlans', { ...plan, skillIds: updatedSkillIds });
      }
    }

    await this.logActivity('Removed Skill', skill.name);
  }

  async removeDepartment(id: string) {
    const dept = this.departments.find(d => d.id === id);
    if (dept) {
        await this.deleteItem('departments', id);
        await this.logActivity('Removed Department', dept.name);
    }
  }

  async removeProject(id: string) {
    const project = this.getProjectById(id);
    if (project) {
      await this.deleteItem('projects', id);
      await this.logActivity('Delete Project', project.name);
    }
  }


  getAssessmentHistory(viewer: User, targetSubjectId?: string) {
    const effectiveTargetId = (viewer.role === Role.ADMIN || viewer.role === Role.CEO) 
      ? (targetSubjectId || viewer.id)
      : (this.isManager(viewer) ? (targetSubjectId || viewer.id) : viewer.id);

    // If viewer is manager but target is not in their visible tree, restrict to self
    const visibleUsers = this.getVisibleUsers(viewer);
    const isTargetVisible = visibleUsers.some(u => u.id === effectiveTargetId);
    const finalSubjectId = isTargetVisible ? effectiveTargetId : viewer.id;

    const pastAssessments = this.assessments
      .filter(a => a.subjectId === finalSubjectId && !a.isArchived)
      .map(a => ({
        id: a.id,
        date: a.date,
        method: a.method,
        raterId: a.raterId,
        skillId: a.skillId,
        score: a.score,
        comment: a.comment,
        status: 'COMPLETED' as const,
        source: 'ASSESSMENT' as const
      }));

    const pastEvidences = this.evidences
      .filter(e => e.userId === finalSubjectId && (e.status === 'APPROVED' || e.status === 'REJECTED'))
      .map(e => ({
        id: e.id,
        date: e.reviewedAt || e.submittedAt,
        method: 'WORK_RECORD_REVIEW' as const,
        raterId: e.reviewedBy || '',
        skillId: e.skillId,
        score: e.assignedScore || 0,
        comment: e.reviewerComment || '',
        status: e.status as 'COMPLETED' | 'REJECTED' | 'APPROVED',
        source: 'EVIDENCE' as const
      }));

    return [...pastAssessments, ...pastEvidences].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  // A3.1: Cursor-based paginator for admin collection reads. Returns the
  // current page of docs plus a cursor for the next page. Use this instead of
  // the real-time listeners when you need to page through large admin
  // collections (e.g. all users, all assessments) without holding 10K docs in
  // memory. The live listeners remain authoritative for the active session;
  // this is a supplementary read path for bulk admin views.
  //
  // Usage:
  //   const page1 = await dataService.getPaginatedCollection('users', 50);
  //   const page2 = await dataService.getPaginatedCollection('users', 50, page1.cursor);
  async getPaginatedCollection<T>(
    collectionName: string,
    pageSize: number = 50,
    cursor?: QueryDocumentSnapshot<DocumentData> | null,
    orderField: string = 'id'
  ): Promise<{ items: T[]; cursor: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
    const constraints = cursor
      ? [orderBy(orderField), startAfter(cursor), limit(pageSize + 1)]
      : [orderBy(orderField), limit(pageSize + 1)];

    const snap = await getDocs(query(collection(db, collectionName), ...constraints));
    const hasMore = snap.docs.length > pageSize;
    const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    const items = docs.map(d => ({ id: d.id, ...d.data() } as T));
    const nextCursor = docs.length > 0 ? docs[docs.length - 1] : null;
    return { items, cursor: nextCursor, hasMore };
  }
}

export const dataService = new DataService();
