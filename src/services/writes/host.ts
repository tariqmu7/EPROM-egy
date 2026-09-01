import type {
  Assessment,
  CompetencyCoverage,
  DevelopmentPlan,
  Evidence,
  IndividualTrainingPlan,
  Notification,
  Skill,
  SkillScoreSource,
  TrainingCourse,
  User,
  WorkExperience,
} from '../../types';

/**
 * WriteHost — the named set of capabilities a feature write module may use.
 *
 * The competency engine (`../competency`) takes a read-only `CompetencyContext`
 * because it only computes. These modules WRITE, so they need the service: the
 * persistence plumbing, the audit log, the notification path and the score
 * cache. Handing them this explicit interface rather than the `DataService`
 * instance keeps the same discipline — a write module can reach exactly what is
 * listed here and nothing else (no listeners, no auth session, no other
 * feature's writes) — and lets each module be driven by a hand-built host in a
 * test without booting the store.
 *
 * `DataService` implements it in its constructor (`writeCtx`) with bound
 * arrows, and keeps thin delegating methods, so every caller of
 * `dataService.addEvidence(...)` and friends is unchanged.
 *
 * The collection fields are GETTERS for the same reason they are on
 * `CompetencyContext`: every listener REPLACES its array rather than mutating
 * it, so a captured array would silently freeze on stale data.
 */
export interface WriteHost {
  // ── Persistence plumbing (DataService privates, handed over bound) ────────
  /** Full write of a document (create or replace). */
  persist(collectionName: string, item: any): Promise<void>;
  /** Merge write of a document. */
  update(collectionName: string, item: any): Promise<void>;
  /** Hard delete of a document. */
  remove(collectionName: string, id: string): Promise<void>;
  /** Wire-shape a document (JSON-stringified fields, undefined stripped) — for batched writes. */
  preparePayload(collectionName: string, item: any): any;
  /** Surface a failed write the way the service does (permission banner + telemetry). */
  reportWriteError(error: unknown, path: string): void;
  /** Retry a fire-and-forget write, 3× with exponential backoff. */
  withRetry<T>(fn: () => Promise<T>): Promise<T>;

  // ── The side effects every write shares ──────────────────────────────────
  logActivity(
    action: string,
    target: string,
    details?: { entity?: string; entityId?: string; before?: string; after?: string },
  ): Promise<void>;
  /** The attributed notification path (`DataService.addNotification`). */
  notify(notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>): Promise<void>;
  /**
   * Drop the memoised skill scores. MANDATORY after anything that can change a
   * score (a verdict, a policy change) — the listener also clears it, but that
   * is a poll away and a same-tick re-render would show the old number.
   */
  clearScoreCache(): void;
  /** The acting user for audit attribution; empty when it cannot be matched. */
  currentActor(): { actorId?: string; actorName?: string };
  /** The raw auth uid — the fallback attribution before the roster has loaded. */
  authUid(): string | undefined;

  // ── The reads a write path needs ─────────────────────────────────────────
  readonly users: User[];
  readonly evidences: Evidence[];
  readonly workExperiences: WorkExperience[];
  readonly developmentPlans: DevelopmentPlan[];
  readonly trainingCourses: TrainingCourse[];
  readonly notifications: Notification[];
  readonly assessments: Assessment[];
  readonly skills: Skill[];
  getUserById(id: string): User | undefined;
  getUserSkillScore(userId: string, skillId: string): number;
  getUserSkillScoreDetail(userId: string, skillId: string): { score: number; source: SkillScoreSource };
  getUserCoverage(userId: string): CompetencyCoverage;
  getTrainingCourse(id: string): TrainingCourse | undefined;
  generateIndividualTrainingPlan(userId: string): IndividualTrainingPlan | null;
  /** What the band table proposes for N years of applied experience. */
  suggestExperienceLevel(yearsApplied: number): number;
}
