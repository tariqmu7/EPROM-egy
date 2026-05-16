import { User, Role, JobProfile, Skill, Project, Department, Assessment, ActivityLog, ORG_HIERARCHY_ORDER, ORG_LEVEL_NUMBERS, Notification, AssessmentCycle, Nomination, IndividualTrainingPlan, TrainingRecommendation, OrgLevel, Evidence, PromotionRequirement, CareerProgressionPlan, CareerLevelProgress, TrainingCourse, ScheduledAssessment, AssessmentMethod, UserStatus } from '../types';
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
  onSnapshot,
  Unsubscribe,
  serverTimestamp,
  Timestamp
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

class DataService {
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
  private projects: Project[] = [];

  
  public isInitialized = false;
  private unsubscribers: Unsubscribe[] = [];

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
  private userDocPathById = new Map<string, string>();

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
    this.projects = [];
    this.usersLoaded = false;
    this.scheduleNotify();
  }

  private clearListeners() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
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
      let timer: ReturnType<typeof setTimeout>;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      timer = setTimeout(done, timeoutMs);
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
      certificates: data.certificates ? (typeof data.certificates === 'string' ? JSON.parse(data.certificates) : data.certificates) : [],
      careerHistory: data.careerHistory ? (typeof data.careerHistory === 'string' ? JSON.parse(data.careerHistory) : data.careerHistory) : []
    } as User;
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
    // Fire-and-forget: rebuildUsers() is a synchronous onSnapshot fan-in, so
    // we can't await here — but the promise must not float unhandled.
    void this.checkCertificationExpiries().catch(err =>
      console.error('rebuildUsers: certification expiry check failed', err)
    );
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
    if (!isPrivileged && profile) {
      const managerialLevels: OrgLevel[] = ['CEO', 'GM', 'AGM', 'DM', 'SH'];
      const isManagerialLevel = profile.orgLevel ? managerialLevels.includes(profile.orgLevel) : false;
      let hasSubordinates = false;
      try {
        const subSnap = await getDocs(
          query(collection(db, 'users'), where('managerId', '==', profile.id), limit(1))
        );
        if (auth.currentUser?.uid !== userId) return;
        hasSubordinates = !subSnap.empty;
      } catch (err) {
        // On a scoped-probe failure, keep the safer (broader) behaviour.
        console.error('setupListeners: subordinate probe failed', err);
        hasSubordinates = true;
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
          let requirements = {};
          
          if (data.requirements) {
            try {
              const rawReqs = typeof data.requirements === 'string' ? JSON.parse(data.requirements) : data.requirements;
              // Ensure every level's requirement is an array
              requirements = Object.entries(rawReqs).reduce((acc: any, [level, reqs]: [string, any]) => {
                acc[level] = Array.isArray(reqs) ? reqs : Object.values(reqs || {});
                return acc;
              }, {});
            } catch (e) {
              console.error('Error parsing requirements for job', doc.id, e);
            }
          }

          const job = {
            id: doc.id,
            ...data,
            requirements
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
            levels: data.levels ? JSON.parse(data.levels) : {},
            evaluationQuestions: data.evaluationQuestions ? JSON.parse(data.evaluationQuestions) : [],
            interviewQuestions: data.interviewQuestions ? JSON.parse(data.interviewQuestions) : [],
            threeSixtyQuestions: data.threeSixtyQuestions ? JSON.parse(data.threeSixtyQuestions) : []
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
        this.departments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
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

    // Assessments — a pure employee only needs records where they are the
    // subject (their scores) or the rater (self/peer ratings they gave).
    // A native `or()` query returns that union deduped in a single listener;
    // privileged users / managers keep the full collection.
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
            this.scheduleNotify();
      }, this.handleError('assessments'))
      );
    } else {
      this.unsubscribers.push(
        onSnapshot(query(collection(db, 'assessments'), limit(MAX_LISTENER_DOCS)), (snapshot) => {
          this.assessments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
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

    // Evidences — pure employees only need their own submissions; managers
    // and admins keep the full collection (rule-permitted, needed for review).
    this.unsubscribers.push(
      onSnapshot(
        scopeToSelf && selfId
          ? query(collection(db, 'evidences'), where('userId', '==', selfId), limit(MAX_LISTENER_DOCS))
          : query(collection(db, 'evidences'), limit(MAX_LISTENER_DOCS)),
        (snapshot) => {
          this.evidences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Evidence));
          this.scheduleNotify();
      }, this.handleError('evidences'))
    );

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
    await this.persistItem('evidences', newEvidence);
    
    // Notify manager
    const user = this.users.find(u => u.id === evidence.userId);
    if (user && user.managerId) {
      await this.addNotification({
        userId: user.managerId,
        title: 'New Evidence Submitted',
        message: `${user.name} submitted evidence for review.`,
        type: 'INFO'
      });
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
        type: 'WARNING'
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
        type: 'INFO'
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
        type: status === 'APPROVED' ? 'SUCCESS' : 'ERROR'
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
      type: 'INFO'
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
          certificates: data.certificates ? JSON.parse(data.certificates) : [],
          careerHistory: data.careerHistory ? JSON.parse(data.careerHistory) : []
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
             certificates: data.certificates ? JSON.parse(data.certificates) : [],
             careerHistory: data.careerHistory ? JSON.parse(data.careerHistory) : []
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
              certificates: data.certificates ? JSON.parse(data.certificates) : [],
              careerHistory: data.careerHistory ? JSON.parse(data.careerHistory) : []
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
    let payload = { ...item };
    
    // Serialize complex objects
    if (collectionName === 'users') {
      if (item.certificates) payload.certificates = JSON.stringify(item.certificates);
      if (item.careerHistory) payload.careerHistory = JSON.stringify(item.careerHistory);
    }
    if (collectionName === 'jobProfiles' && item.requirements) {
      payload.requirements = JSON.stringify(item.requirements);
    }
    if (collectionName === 'skills') {
      if (item.levels) payload.levels = JSON.stringify(item.levels);
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

  private async persistItem(collectionName: string, item: any) {
    try {
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
          let width = img.width;
          let height = img.height;

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
    const managerialLevels: OrgLevel[] = ['CEO', 'GM', 'AGM', 'DM', 'SH'];
    return user.orgLevel ? managerialLevels.includes(user.orgLevel) : false;
  }

  getVisibleUsers(currentUser: User): User[] {
    if (currentUser.role === Role.ADMIN || currentUser.role === Role.CEO) {
      return this.users;
    }
    
    // Managers can see their subordinates and indirect subordinates
    const subordinates = this.getSubordinatesRecursive(currentUser.id);
    return [currentUser, ...subordinates];
  }

  private getSubordinatesRecursive(managerId: string): User[] {
    const direct = this.users.filter(u => u.managerId === managerId);
    let all: User[] = [...direct];
    for (const d of direct) {
      all = [...all, ...this.getSubordinatesRecursive(d.id)];
    }
    return all;
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
            type: diffDays <= 0 ? 'ERROR' : 'WARNING'
          });

          if (self.managerId) {
            await this.addNotification({
              userId: self.managerId,
              title: `Compliance Alert: ${self.name}`,
              message: `Subordinate ${self.name} has a certification requirement: ${message}`,
              type: 'INFO'
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

    const requirements = job.requirements[user.orgLevel] || [];
    const recommendations: TrainingRecommendation[] = [];

    requirements.forEach(req => {
      const currentScore = this.getUserSkillScore(userId, req.skillId);
      const gap = req.requiredLevel - currentScore;

      if (gap > 0) {
        const skill = this.getSkill(req.skillId);
        const skillName = skill?.name || 'Unknown Skill';
        
        const matchingCourse = this.trainingCourses.find(c => c.linkedSkillIds.includes(req.skillId));
        
        let recommendationText = '';
        if (matchingCourse) {
          recommendationText = `Enroll in "${matchingCourse.title}" (${matchingCourse.provider}) to bridge the gap.`;
        } else if (gap >= 2) {
          recommendationText = `Intensive training and external certification required for ${skillName}.`;
        } else {
          recommendationText = `On-the-job training and mentorship recommended to reach proficiency level ${req.requiredLevel}.`;
        }

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

    const requirements = job.requirements[user.orgLevel] || [];
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
          switch (skill.assessmentMethod) {
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

  getNextAssessmentDate(userId: string, skillId: string): Date | null {
    const skill = this.getSkill(skillId);
    if (!skill) return null;

    if (skill.assessmentFrequency === 'PERIODIC' && skill.periodicInterval) {
      const userAssessments = this.assessments.filter(a => a.subjectId === userId && a.skillId === skillId && !a.isArchived);
      if (userAssessments.length > 0) {
        const latest = userAssessments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        const nextDate = new Date(latest.date);
        if (skill.periodicInterval === 'MONTHLY') nextDate.setMonth(nextDate.getMonth() + 1);
        else if (skill.periodicInterval === 'QUARTERLY') nextDate.setMonth(nextDate.getMonth() + 3);
        else if (skill.periodicInterval === 'ANNUALLY') nextDate.setFullYear(nextDate.getFullYear() + 1);
        return nextDate;
      }
      return new Date(); // Overdue if never assessed but periodic
    } else if (skill.assessmentFrequency === 'CERTIFICATE_BASED') {
      const userEvidences = this.evidences.filter(e => e.userId === userId && e.skillId === skillId && e.status === 'APPROVED' && e.expiryDate);
      if (userEvidences.length > 0) {
        const latest = userEvidences.sort((a, b) => new Date(b.expiryDate!).getTime() - new Date(a.expiryDate!).getTime())[0];
        return new Date(latest.expiryDate!);
      }
    }
    
    return null;
  }

  generateCareerPath(userId: string): CareerProgressionPlan | null {
    const user = this.getUserById(userId);
    if (!user || !user.jobProfileId || !user.orgLevel) return null;

    const currentJob = this.getJobProfile(user.jobProfileId);
    if (!currentJob) return null;

    // Succession Logic: Find all jobs in the same General Department to bridge gap requirements
    const generalDeptId = this.getGeneralDeptId(user.departmentId);
    const deptJobs = this.getAllJobs().filter(j => this.getGeneralDeptId(j.departmentId) === generalDeptId);

    const currentIndex = ORG_HIERARCHY_ORDER.indexOf(user.orgLevel);
    if (currentIndex === -1) return null;

    const roadmap: CareerLevelProgress[] = [];

    // Loop from current position up to GM (index 0)
    for (let i = currentIndex - 1; i >= 0; i--) {
      const level = ORG_HIERARCHY_ORDER[i];
      
      // Smart Lookup: Try current job profile first, then search general department for that level's standards
      let requirements = currentJob.requirements[level] || [];
      if (requirements.length === 0) {
        const fallbackJob = deptJobs.find(j => (j.requirements[level]?.length || 0) > 0);
        if (fallbackJob) {
          requirements = fallbackJob.requirements[level] || [];
        }
      }

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

  getUserById(id: string) { return this.users.find(u => u.id === id); }
  getJobProfile(id: string) { return this.jobs.find(j => j.id === id); }
  getAllSkills() { return this.skills; }
  getAllJobs() { return this.jobs; }
  getAllUsers() { return this.users; }
  getPublicUsers() { 
    return this.users.filter(u => u.role !== Role.CEO && u.orgLevel !== 'CEO'); 
  }
  getAllDepartments() { return this.departments; }
  getSkill(id: string) { return this.skills.find(s => s.id === id); }
  getSystemLogs() { return this.logs; }
  getAllProjects() { return this.projects; }
  getProjectById(id: string) { return this.projects.find(p => p.id === id); }


  getGeneralDeptId(deptId: string | undefined): string | undefined {
    if (!deptId) return undefined;
    const dept = this.departments.find(d => d.id === deptId);
    if (!dept) return undefined;
    if (dept.type === 'GENERAL' || !dept.parentId) return dept.id;
    return this.getGeneralDeptId(dept.parentId);
  }

  getSubordinates(managerId: string) {
    // A user reports to this person if EITHER their explicit Direct Manager
    // (User.managerId) is set to them, OR they belong to a Direct Department /
    // Section this person manages (Department.managerId). Restricted to
    // DEPARTMENT / SECTION so a GENERAL-dept owner (e.g. a GM) does not pull a
    // whole org branch in as direct reports.
    const managedDeptIds = new Set(
      this.departments
        .filter(d => d.managerId === managerId && (d.type === 'DEPARTMENT' || d.type === 'SECTION'))
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
    const skill = this.getSkill(skillId);
    if (!skill) return 0;

    // Behavioral (360) Logic
    if (skill.assessmentMethod === 'OJT_OBSERVATION' || !skill.assessmentMethod) {
      let userAssessments = this.assessments.filter(a => a.subjectId === userId && a.skillId === skillId);
      if (!includeArchived) {
        userAssessments = userAssessments.filter(a => !a.isArchived);
      }
      if (userAssessments.length === 0) return 0;
      
      const selfA = userAssessments.filter(a => a.type === 'SELF');
      const peerA = userAssessments.filter(a => a.type === 'PEER');
      const mgrA = userAssessments.filter(a => a.type === 'MANAGER');

      const avgSelf = selfA.length > 0 ? selfA.reduce((s, a) => s + a.score, 0) / selfA.length : null;
      const avgPeer = peerA.length > 0 ? peerA.reduce((s, a) => s + a.score, 0) / peerA.length : null;
      const avgMgr = mgrA.length > 0 ? mgrA.reduce((s, a) => s + a.score, 0) / mgrA.length : null;

      let totalWeight = 0;
      let weightedScore = 0;

      if (avgSelf !== null) { weightedScore += avgSelf * 0.10; totalWeight += 0.10; } // 10% weight
      if (avgPeer !== null) { weightedScore += avgPeer * 0.30; totalWeight += 0.30; } // 30% weight
      if (avgMgr  !== null) { weightedScore += avgMgr  * 0.60; totalWeight += 0.60; } // 60% weight

      if (totalWeight === 0) return 0;
      
      // Normalize to 100% based on available weights
      return Math.round(weightedScore / totalWeight);
    } 
    // Evidence, Online Assessment, or Interview Logic
    else {
      // Check for direct Assessment results first (Online/Interview)
      let directAssessments = this.assessments.filter(a => a.subjectId === userId && a.skillId === skillId && (a.type === 'WRITTEN_EXAM' || a.type === 'INTERVIEW' || a.type === 'PRACTICAL_DEMO'));
      if (!includeArchived) {
        directAssessments = directAssessments.filter(a => !a.isArchived);
      }
      
      if (directAssessments.length > 0) {
        // Return the latest assessment score
        return directAssessments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].score;
      }

      // Fallback: Find the highest assignedScore from approved evidence submissions for this skill.
      const relevantEvidence = this.evidences.filter(e => e.userId === userId && e.skillId === skillId && e.status === 'APPROVED' && e.assignedScore);
      if (relevantEvidence.length === 0) return 0;

      const maxScore = Math.max(...relevantEvidence.map(e => e.assignedScore || 0));
      return Math.min(Math.max(Math.round(maxScore), 1), 5); // Ensure it's between 1 and 5
    }
  }

  getAssessments(filters: { raterId?: string, subjectId?: string, cycleId?: string, skillId?: string }) {
    return this.assessments.filter(a => {
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

  async addCycle(cycle: Omit<AssessmentCycle, 'id'>) {
    const id = doc(collection(db, 'assessmentCycles')).id;
    const newCycle: AssessmentCycle = {
      ...cycle,
      id
    };
    await this.persistItem('assessmentCycles', newCycle);
    await this.logActivity('Created Assessment Cycle', newCycle.name);

    // Notify all users about the new cycle
    for (const u of this.users) {
      await this.addNotification({
        userId: u.id,
        title: 'New Assessment Cycle',
        message: `The ${newCycle.name} assessment cycle is now active. Due date: ${new Date(newCycle.dueDate).toLocaleDateString()}`,
        type: 'INFO',
        actionLink: 'emp-assessment'
      });
    }
  }

  async updateCycle(cycle: AssessmentCycle) {
    await this.updateItem('assessmentCycles', cycle);
    await this.logActivity('Updated Assessment Cycle', cycle.name);
  }

  async archiveAssessments(filters: { departmentId?: string, jobProfileId?: string, skillId?: string }) {
    let affectedCount = 0;
    
    // Find all users that match the profile filters
    const matchedUsers = this.users.filter(u => {
      if (filters.departmentId && u.departmentId !== filters.departmentId) return false;
      if (filters.jobProfileId && u.jobProfileId !== filters.jobProfileId) return false;
      return true;
    });

    const matchedUserIds = matchedUsers.map(u => u.id);

    // Find all active assessments that belong to these users and match the skill filter
    const activeAssessments = this.assessments.filter(a => 
      !a.isArchived && 
      matchedUserIds.includes(a.subjectId) &&
      (filters.skillId ? a.skillId === filters.skillId : true)
    );

    // Archive them
    for (const assessment of activeAssessments) {
      const archived = { ...assessment, isArchived: true };
      await this.persistItem('assessments', archived);
      affectedCount++;
    }

    // Send notification to affected users
    if (affectedCount > 0) {
      const uniqueAffectedUserIds = Array.from(new Set(activeAssessments.map(a => a.subjectId)));
      for (const uid of uniqueAffectedUserIds) {
        await this.addNotification({
          userId: uid,
          title: 'Skill Matrix Reset',
          message: 'Your previous assessments for certain skills have been archived. A new evaluation is required to ensure compliance.',
          type: 'WARNING',
          actionLink: 'emp-assessment'
        });
      }
      await this.logActivity('Archived Assessments', `Archived ${affectedCount} assessments due to admin reset.`);
    }

    return affectedCount;
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

  async addNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) {
    const id = doc(collection(db, 'notifications')).id;
    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    await this.persistItem('notifications', newNotification);
  }

  // --- ACTIONS (Async Write-Behind) ---

  public async logActivity(action: string, target: string) {
    const id = doc(collection(db, 'activityLogs')).id;
    const newLog: ActivityLog = {
        id,
        action,
        target,
        timestamp: new Date().toISOString()
    };
    await this.persistItem('activityLogs', newLog);
  }

  async addAssessment(assessment: Omit<Assessment, 'id' | 'date'>) {
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
      type: 'INFO'
    });

    const subject = this.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
    await this.logActivity('Submitted Assessment', `For ${subject}`);

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
    await this.updateItem('assessments', assessment);
    const subject = this.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
    await this.logActivity('Updated Assessment', `For ${subject}`);
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
    await this.persistItem('users', user);
    await this.logActivity('Onboarded Employee', user.name);
  }

  async addDepartment(dept: Department) {
    await this.persistItem('departments', dept);
    await this.logActivity('Created Department', dept.name);
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
    if (user) {
        await this.deleteItem('users', id);
        await this.logActivity('Removed Employee', user.name);
    }
  }

  async removeJobProfile(id: string) {
    const job = this.jobs.find(j => j.id === id);
    if (job) {
        await this.deleteItem('jobProfiles', id);
        await this.logActivity('Removed Job Profile', job.title);
    }
  }

  async removeSkill(id: string) {
    const skill = this.skills.find(s => s.id === id);
    if (skill) {
        await this.deleteItem('skills', id);
        await this.logActivity('Removed Skill', skill.name);
    }
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
      .filter(a => a.subjectId === finalSubjectId)
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
}

export const dataService = new DataService();
