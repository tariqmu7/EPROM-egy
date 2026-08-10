// ============================================================================
// The analytics MODEL — one load of the documents, indexed once, reused by
// every server-side aggregate.
//
// Finding 7 of the analytical-engine review: all analysis ran in the browser
// over the whole company. Every dashboard downloaded users + skills + job
// profiles + assessments + evidence + work experience and recomputed the lot.
// Fine for a pilot; at 4,000 employees × ~60 skills it is a page that never
// finishes loading.
//
// This module is the shared half of the fix: the loading + indexing that
// `jobs/snapshots.ts` already did privately, lifted so the live endpoints in
// `analytics/aggregate.ts` compute from exactly the same inputs, with exactly
// the same scoring brain (`jobs/scoring.ts`). A stored snapshot and a live
// figure must never be two different measures.
//
// It is deliberately a FULL load, not SQL aggregation: the scoring rules
// (rater blend, source precedence, capped provisional experience) are ported
// TypeScript, and expressing them in SQL would create the second brain this
// codebase keeps refusing to grow. The win is that it happens once, on the
// server, near the data — instead of once per browser per page view.
// ============================================================================
import { query } from '../db.js';
import { skillCriticalityOf, type SkillCriticality } from '../domain/enums.js';
import { safeJson, type MethodBlock, type SweepUser } from '../jobs/scheduling.js';
import {
  pairKey,
  DEFAULT_EXPERIENCE_POLICY,
  type AssessmentLike,
  type ScoringIndex,
} from '../jobs/scoring.js';

export interface CourseRef {
  id: string;
  title: string;
  provider: string;
  /** Price of one seat, when the catalogue carries one — what makes a gap
   *  costable. Absent (not 0) when nobody has priced the course. */
  costPerSeat?: number;
  durationHours?: number;
}

export interface Requirement {
  skillId: string;
  requiredLevel: number;
}

export interface AnalyticsModel {
  /** ACTIVE, non-archived people only — the same roster the sweep chases. */
  users: SweepUser[];
  usersById: Map<string, SweepUser>;
  skillNames: Map<string, string>;
  skillCategories: Map<string, string | undefined>;
  /** skillId → how much a gap on it matters. STANDARD for anything unset. */
  skillCriticalities: Map<string, SkillCriticality>;
  /** jobProfileId → its live requirements (dangling skill ids already dropped). */
  jobRequirements: Map<string, Requirement[]>;
  index: ScoringIndex;
  deptParents: Map<string, string | null>;
  deptNames: Map<string, string>;
  /** departmentId → the user id of whoever manages it (Department.managerId). */
  deptManagers: Map<string, string>;
  /** departmentId → structural type (COMPANY/GENERAL/DEPARTMENT/SECTION/…).
   *  Needed by the "who reports to me" rule, which counts a managed
   *  ASSISTANT_GENERAL / DEPARTMENT / SECTION but not a whole GENERAL branch. */
  deptTypes: Map<string, string>;
  /** skillId → non-archived courses linked to it (the "cure" for a gap). */
  coursesBySkill: Map<string, CourseRef[]>;
}

interface Row {
  id: string;
  data: Record<string, any>;
}

async function loadAll(table: string): Promise<Row[]> {
  const { rows } = await query(`SELECT id, data FROM ${table}`);
  return rows.map((r) => ({ id: String(r.id), data: (r.data ?? {}) as Record<string, any> }));
}

/**
 * Loads and indexes every table the aggregates need. One pass, ~9 queries.
 *
 * Callers that only need part of it still pay for all of it — that is
 * deliberate: the alternative is several partial loaders that drift apart.
 */
export async function loadAnalyticsModel(): Promise<AnalyticsModel> {
  const [
    userRows, skillRows, jobRows, assessmentRows, evidenceRows,
    experienceRows, deptRows, settingsRows, courseRows,
  ] = await Promise.all([
    loadAll('users'),
    loadAll('skills'),
    loadAll('"jobProfiles"'),
    loadAll('assessments'),
    loadAll('evidences'),
    loadAll('"workExperiences"'),
    loadAll('departments'),
    loadAll('"appSettings"'),
    loadAll('"trainingCourses"'),
  ]);

  // ── Roster ────────────────────────────────────────────────────────────────
  const managerCounts = new Map<string, number>();
  for (const r of userRows) {
    const mgr = r.data.managerId;
    if (mgr) managerCounts.set(String(mgr), (managerCounts.get(String(mgr)) ?? 0) + 1);
  }
  const users: SweepUser[] = userRows
    .map((r) => {
      const canonical = String(r.data.id ?? r.id);
      return {
        id: canonical,
        rowId: r.id,
        name: String(r.data.name ?? canonical),
        email: r.data.email ? String(r.data.email) : undefined,
        role: r.data.role ? String(r.data.role) : undefined,
        status: r.data.status ? String(r.data.status) : undefined,
        orgLevel: r.data.orgLevel ? String(r.data.orgLevel) : undefined,
        departmentId: r.data.departmentId ? String(r.data.departmentId) : undefined,
        managerId: r.data.managerId ? String(r.data.managerId) : undefined,
        jobProfileId: r.data.jobProfileId ? String(r.data.jobProfileId) : undefined,
        isArchived: r.data.isArchived === true,
        certificates: [],
        hasSubordinates: (managerCounts.get(canonical) ?? 0) > 0,
      } satisfies SweepUser;
    })
    .filter((u) => u.status === 'ACTIVE' && !u.isArchived);

  const usersById = new Map(users.map((u) => [u.id, u]));

  // ── Skills ────────────────────────────────────────────────────────────────
  const skillMethods = new Map<string, MethodBlock[]>();
  const skillNames = new Map<string, string>();
  const skillCategories = new Map<string, string | undefined>();
  const skillCriticalities = new Map<string, SkillCriticality>();
  for (const r of skillRows) {
    const id = String(r.data.id ?? r.id);
    skillNames.set(id, String(r.data.name ?? id));
    skillCategories.set(id, r.data.category ? String(r.data.category) : undefined);
    skillCriticalities.set(id, skillCriticalityOf(r.data.criticality));
    const blocks = safeJson<MethodBlock[]>(r.data.assessmentMethods, []);
    skillMethods.set(id, Array.isArray(blocks) ? blocks : []);
  }

  // ── Requirements (port of getEffectiveRequirements) ───────────────────────
  const jobRequirements = new Map<string, Requirement[]>();
  for (const r of jobRows) {
    const id = String(r.data.id ?? r.id);
    const reqs = safeJson<{ skillId?: string; requiredLevel?: number }[]>(r.data.requiredSkills, []);
    jobRequirements.set(
      id,
      (Array.isArray(reqs) ? reqs : [])
        .filter((x) => x && typeof x.skillId === 'string' && x.skillId !== '')
        // A requirement pointing at a deleted skill is dropped at read time
        // everywhere else too.
        .filter((x) => skillMethods.has(String(x.skillId)))
        .map((x) => ({ skillId: String(x.skillId), requiredLevel: Number(x.requiredLevel ?? 0) })),
    );
  }

  // ── Scoring inputs ────────────────────────────────────────────────────────
  const assessments = new Map<string, AssessmentLike[]>();
  for (const r of assessmentRows) {
    if (r.data.isArchived) continue;
    const subject = r.data.subjectId ? String(r.data.subjectId) : '';
    const skillId = r.data.skillId ? String(r.data.skillId) : '';
    if (!subject || !skillId) continue;
    const key = pairKey(subject, skillId);
    const list = assessments.get(key) ?? [];
    list.push({
      type: r.data.type ? String(r.data.type) : undefined,
      raterId: r.data.raterId ? String(r.data.raterId) : '',
      score: Number(r.data.score ?? 0),
      date: r.data.date ? String(r.data.date) : undefined,
    });
    assessments.set(key, list);
  }

  const evidenceScores = new Map<string, number[]>();
  for (const r of evidenceRows) {
    if (r.data.status !== 'APPROVED') continue;
    const userId = r.data.userId ? String(r.data.userId) : '';
    const skillId = r.data.skillId ? String(r.data.skillId) : '';
    const score = Number(r.data.assignedScore ?? 0);
    if (!userId || !skillId || !score) continue;
    const key = pairKey(userId, skillId);
    const list = evidenceScores.get(key) ?? [];
    list.push(score);
    evidenceScores.set(key, list);
  }

  const experienceLevels = new Map<string, number>();
  for (const r of experienceRows) {
    if (r.data.status !== 'VERIFIED') continue;
    const userId = r.data.userId ? String(r.data.userId) : '';
    if (!userId) continue;
    // `workExperiences.skills` is one of the fields the frontend stringifies on
    // the way out (preparePayload) — it can arrive as a JSON string.
    const skills = safeJson<{ skillId?: string; verifiedLevel?: number }[]>(r.data.skills, []);
    for (const s of Array.isArray(skills) ? skills : []) {
      if (!s || !s.skillId) continue;
      const level = Number(s.verifiedLevel ?? 0);
      const key = pairKey(userId, String(s.skillId));
      if (level > (experienceLevels.get(key) ?? 0)) experienceLevels.set(key, level);
    }
  }

  const policyDoc = settingsRows.find((r) => String(r.data.id ?? r.id) === 'work-experience')?.data;
  const experiencePolicy = {
    enabled: typeof policyDoc?.enabled === 'boolean' ? policyDoc.enabled : DEFAULT_EXPERIENCE_POLICY.enabled,
    maxProvisionalLevel:
      Number(policyDoc?.maxProvisionalLevel) || DEFAULT_EXPERIENCE_POLICY.maxProvisionalLevel,
  };

  // ── Org chart ─────────────────────────────────────────────────────────────
  const deptParents = new Map<string, string | null>();
  const deptNames = new Map<string, string>();
  const deptManagers = new Map<string, string>();
  const deptTypes = new Map<string, string>();
  for (const r of deptRows) {
    const id = String(r.data.id ?? r.id);
    deptParents.set(id, r.data.parentId ? String(r.data.parentId) : null);
    deptNames.set(id, String(r.data.name ?? id));
    if (r.data.managerId) deptManagers.set(id, String(r.data.managerId));
    if (r.data.type) deptTypes.set(id, String(r.data.type));
  }

  // ── Catalogue (archived courses can never be recommended — task 3's rule) ──
  const coursesBySkill = new Map<string, CourseRef[]>();
  for (const r of courseRows) {
    if (r.data.isArchived) continue;
    const cost = Number(r.data.costPerSeat);
    const hours = Number(r.data.durationHours);
    const ref: CourseRef = {
      id: String(r.data.id ?? r.id),
      title: String(r.data.title ?? ''),
      provider: String(r.data.provider ?? ''),
      // A missing or zero price is "unpriced", never "free" — a zero would
      // silently make an unpriced skill look budgeted.
      ...(Number.isFinite(cost) && cost > 0 ? { costPerSeat: cost } : {}),
      ...(Number.isFinite(hours) && hours > 0 ? { durationHours: hours } : {}),
    };
    const linked = safeJson<string[]>(r.data.linkedSkillIds, []);
    for (const skillId of Array.isArray(linked) ? linked : []) {
      if (!skillId) continue;
      const list = coursesBySkill.get(String(skillId)) ?? [];
      list.push(ref);
      coursesBySkill.set(String(skillId), list);
    }
  }

  return {
    users,
    usersById,
    skillNames,
    skillCategories,
    skillCriticalities,
    jobRequirements,
    index: { skillMethods, assessments, evidenceScores, experienceLevels, experiencePolicy },
    deptParents,
    deptNames,
    deptManagers,
    deptTypes,
    coursesBySkill,
  };
}

// ── Short-lived cache ───────────────────────────────────────────────────────
// The SPA polls, and several people watch the same dashboard, so the same full
// load would otherwise repeat every few seconds. A few seconds of staleness on
// an aggregate that changes when somebody records an assessment is a fair
// trade; anything longer would make the page feel broken after a write.
//
// Disabled under test so a suite that seeds rows and immediately reads them
// back is never served a pre-seed model.
const CACHE_MS = 15_000;
let cached: { at: number; model: AnalyticsModel } | null = null;
let inFlight: Promise<AnalyticsModel> | null = null;

/** The model, reused for a few seconds. Concurrent callers share one load. */
export async function getAnalyticsModel(): Promise<AnalyticsModel> {
  if (process.env.NODE_ENV === 'test') return loadAnalyticsModel();
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.model;
  if (!inFlight) {
    inFlight = loadAnalyticsModel()
      .then((model) => {
        cached = { at: Date.now(), model };
        return model;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Drops the cache — used by tests and anything that must read its own write. */
export function clearAnalyticsModelCache(): void {
  cached = null;
}

/**
 * Every department id from `departmentId` up to the root — one employee's
 * numbers roll into their section, their department and their general
 * department in a single pass. Cycle-safe (a bad parent chain must not hang).
 */
export function ancestorChain(departmentId: string, parents: Map<string, string | null>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: string | null = departmentId;
  while (current && !seen.has(current)) {
    seen.add(current);
    chain.push(current);
    current = parents.get(current) ?? null;
  }
  return chain;
}

/** A department plus every unit nested beneath it. Port of
 *  `getDepartmentSubtreeIds`; cycle-safe. */
export function subtreeIds(departmentId: string, parents: Map<string, string | null>): Set<string> {
  const seen = new Set<string>([departmentId]);
  const queue = [departmentId];
  while (queue.length) {
    const parent = queue.shift() as string;
    for (const [id, parentId] of parents) {
      if (parentId === parent && !seen.has(id)) {
        seen.add(id);
        queue.push(id);
      }
    }
  }
  return seen;
}
