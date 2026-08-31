// BD / External-Contracts import, step 7 support — DUMP the LIVE gap picture.
//
//   npx tsx scripts/etl/bd-ec/dump_gaps.mts
//
// Writes data/bd-ec/liveGaps.json: for every ACTIVE, non-archived, PROFILED
// person, one row per requirement of their job profile carrying the score and
// score SOURCE as it stood at each of three dates:
//
//   planning  2026-07-05  — after the June wave, before July/August
//   signOff   2026-08-18  — after the August wave (the "after" half)
//   now       today       — what the app shows when the plan is opened
//
// Why three dates: a development plan FREEZES `levelAtPlanning` and stores
// `levelAtSignOff` re-read at sign-off. Generating both from today's score
// would produce a plan whose before and after are identical — a plan that
// demonstrably did nothing. Scoring at a cut-off is the only honest way to make
// the demo's before/after real.
//
// The maths is NOT re-implemented here: `skillScore` is imported from
// server/src/jobs/scoring.ts, the one scoring port. Only the INPUTS are
// filtered by date (assessments by `date`, approved evidence by `reviewedAt`).
import 'dotenv/config';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  skillScore,
  pairKey,
  DEFAULT_EXPERIENCE_POLICY,
  type AssessmentLike,
  type ScoringIndex,
} from '../../../src/jobs/scoring.js';
import type { MethodBlock, SweepUser } from '../../../src/jobs/scheduling.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'data', 'bd-ec', 'liveGaps.json');

const CUTOFFS = {
  planning: '2026-07-05T00:00:00.000Z',
  signOff: '2026-08-18T00:00:00.000Z',
  now: new Date().toISOString(),
};

// Mirrors SKILL_CRITICALITY_WEIGHTS in src/types.ts — absent ⇒ STANDARD (×1).
const WEIGHTS: Record<string, number> = {
  SAFETY_CRITICAL: 3,
  HIGH: 2,
  STANDARD: 1,
  LOW: 0.5,
};

function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value ?? fallback) as T;
}

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});
await client.connect();

const rows = async (table: string) =>
  (await client.query(`select id, data from ${table}`)).rows as { id: string; data: any }[];

const [userRows, skillRows, jobRows, assessmentRows, evidenceRows, experienceRows, settingRows, courseRows] =
  await Promise.all([
    rows('users'),
    rows('skills'),
    rows('"jobProfiles"'),
    rows('assessments'),
    rows('evidences'),
    rows('"workExperiences"'),
    rows('"appSettings"'),
    rows('"trainingCourses"'),
  ]);

// ── Roster ──────────────────────────────────────────────────────────────────
const managerCounts = new Map<string, number>();
for (const r of userRows) {
  if (r.data.managerId) {
    managerCounts.set(String(r.data.managerId), (managerCounts.get(String(r.data.managerId)) ?? 0) + 1);
  }
}
const users: SweepUser[] = userRows
  .map((r) => {
    const id = String(r.data.id ?? r.id);
    return {
      id,
      rowId: r.id,
      name: String(r.data.name ?? id),
      email: r.data.email ? String(r.data.email) : undefined,
      role: r.data.role ? String(r.data.role) : undefined,
      status: r.data.status ? String(r.data.status) : undefined,
      orgLevel: r.data.orgLevel ? String(r.data.orgLevel) : undefined,
      departmentId: r.data.departmentId ? String(r.data.departmentId) : undefined,
      managerId: r.data.managerId ? String(r.data.managerId) : undefined,
      jobProfileId: r.data.jobProfileId ? String(r.data.jobProfileId) : undefined,
      isArchived: r.data.isArchived === true,
      certificates: [],
      hasSubordinates: (managerCounts.get(id) ?? 0) > 0,
    } satisfies SweepUser;
  })
  .filter((u) => u.status === 'ACTIVE' && !u.isArchived);

// ── Skills ──────────────────────────────────────────────────────────────────
const skillMethods = new Map<string, MethodBlock[]>();
const skillNames = new Map<string, string>();
const skillCriticalities = new Map<string, string>();
for (const r of skillRows) {
  if (r.data.isArchived === true) continue;
  const id = String(r.data.id ?? r.id);
  skillNames.set(id, String(r.data.name ?? id));
  skillCriticalities.set(id, r.data.criticality ? String(r.data.criticality) : 'STANDARD');
  const blocks = safeJson<MethodBlock[]>(r.data.assessmentMethods, []);
  skillMethods.set(id, Array.isArray(blocks) ? blocks : []);
}

// ── Requirements (port of getEffectiveRequirements) ─────────────────────────
const jobRequirements = new Map<string, { skillId: string; requiredLevel: number }[]>();
const jobTitles = new Map<string, string>();
for (const r of jobRows) {
  const id = String(r.data.id ?? r.id);
  jobTitles.set(id, String(r.data.title ?? id));
  const reqs = safeJson<{ skillId?: string; requiredLevel?: number }[]>(r.data.requiredSkills, []);
  jobRequirements.set(
    id,
    (Array.isArray(reqs) ? reqs : [])
      .filter((x) => x && typeof x.skillId === 'string' && x.skillId !== '')
      .filter((x) => skillMethods.has(String(x.skillId)))
      .map((x) => ({ skillId: String(x.skillId), requiredLevel: Number(x.requiredLevel ?? 0) })),
  );
}

// ── Courses (the "cure" a plan item can name) ───────────────────────────────
// The app's ITP takes getCoursesForSkill(skillId)[0], whose order is whatever
// the listener happened to load. A frozen plan item must be reproducible, so
// the cheapest PRICED course wins here, ties broken by id. An unpriced course
// is still eligible when nothing linked to the skill has a price — unpriced is
// not free, but it is a real course somebody can be sent on.
interface CourseRef {
  id: string;
  title: string;
  provider: string;
  costPerSeat?: number;
}
const coursesBySkill = new Map<string, CourseRef[]>();
for (const r of courseRows) {
  if (r.data.isArchived === true) continue;
  const cost = Number(r.data.costPerSeat);
  const ref: CourseRef = {
    id: String(r.data.id ?? r.id),
    title: String(r.data.title ?? ''),
    provider: String(r.data.provider ?? ''),
    ...(Number.isFinite(cost) && cost > 0 ? { costPerSeat: cost } : {}),
  };
  for (const skillId of safeJson<string[]>(r.data.linkedSkillIds, [])) {
    if (!skillId) continue;
    const list = coursesBySkill.get(String(skillId)) ?? [];
    list.push(ref);
    coursesBySkill.set(String(skillId), list);
  }
}
for (const [skillId, list] of coursesBySkill) {
  list.sort(
    (a, b) =>
      (a.costPerSeat ?? Number.MAX_SAFE_INTEGER) - (b.costPerSeat ?? Number.MAX_SAFE_INTEGER) ||
      a.id.localeCompare(b.id),
  );
  coursesBySkill.set(skillId, list);
}

// ── Scoring inputs, filtered to a cut-off ───────────────────────────────────
const experienceLevels = new Map<string, number>();
for (const r of experienceRows) {
  if (r.data.status !== 'VERIFIED') continue;
  const userId = r.data.userId ? String(r.data.userId) : '';
  if (!userId) continue;
  for (const s of safeJson<{ skillId?: string; verifiedLevel?: number }[]>(r.data.skills, [])) {
    if (!s?.skillId) continue;
    const key = pairKey(userId, String(s.skillId));
    const level = Number(s.verifiedLevel ?? 0);
    if (level > (experienceLevels.get(key) ?? 0)) experienceLevels.set(key, level);
  }
}
const policyDoc = settingRows.find((r) => String(r.data.id ?? r.id) === 'work-experience')?.data;
const experiencePolicy = {
  enabled: typeof policyDoc?.enabled === 'boolean' ? policyDoc.enabled : DEFAULT_EXPERIENCE_POLICY.enabled,
  maxProvisionalLevel: Number(policyDoc?.maxProvisionalLevel) || DEFAULT_EXPERIENCE_POLICY.maxProvisionalLevel,
};

function indexAsOf(cutoff: string): ScoringIndex {
  const assessments = new Map<string, AssessmentLike[]>();
  for (const r of assessmentRows) {
    if (r.data.isArchived) continue;
    const subject = r.data.subjectId ? String(r.data.subjectId) : '';
    const skillId = r.data.skillId ? String(r.data.skillId) : '';
    const date = r.data.date ? String(r.data.date) : '';
    if (!subject || !skillId) continue;
    // No date ⇒ cannot be placed in time; excluded from a dated view rather
    // than silently counted as if it happened before every cut-off.
    if (!date || date > cutoff) continue;
    const key = pairKey(subject, skillId);
    const list = assessments.get(key) ?? [];
    list.push({
      type: r.data.type ? String(r.data.type) : undefined,
      raterId: r.data.raterId ? String(r.data.raterId) : '',
      score: Number(r.data.score ?? 0),
      date,
    });
    assessments.set(key, list);
  }

  const evidenceScores = new Map<string, number[]>();
  for (const r of evidenceRows) {
    if (r.data.status !== 'APPROVED') continue;
    const userId = r.data.userId ? String(r.data.userId) : '';
    const skillId = r.data.skillId ? String(r.data.skillId) : '';
    const score = Number(r.data.assignedScore ?? 0);
    // An evidence scores from the moment it was APPROVED, not submitted.
    const at = r.data.reviewedAt ? String(r.data.reviewedAt) : '';
    if (!userId || !skillId || !score) continue;
    if (!at || at > cutoff) continue;
    const key = pairKey(userId, skillId);
    const list = evidenceScores.get(key) ?? [];
    list.push(score);
    evidenceScores.set(key, list);
  }

  return { skillMethods, assessments, evidenceScores, experienceLevels, experiencePolicy };
}

const indexes = {
  planning: indexAsOf(CUTOFFS.planning),
  signOff: indexAsOf(CUTOFFS.signOff),
  now: indexAsOf(CUTOFFS.now),
};

// ── The dump ────────────────────────────────────────────────────────────────
const people = users
  .filter((u) => u.jobProfileId && jobRequirements.has(u.jobProfileId))
  .map((u) => {
    const reqs = jobRequirements.get(u.jobProfileId!)!;
    const requirements = reqs.map((req) => {
      const criticality = skillCriticalities.get(req.skillId) ?? 'STANDARD';
      const at = (phase: keyof typeof indexes) => {
        const { score, source } = skillScore(u, req.skillId, indexes[phase]);
        return { score, source, gap: Math.max(0, req.requiredLevel - score) };
      };
      const courses = coursesBySkill.get(req.skillId) ?? [];
      return {
        skillId: req.skillId,
        skillName: skillNames.get(req.skillId) ?? req.skillId,
        requiredLevel: req.requiredLevel,
        criticality,
        weight: WEIGHTS[criticality] ?? 1,
        planning: at('planning'),
        signOff: at('signOff'),
        now: at('now'),
        course: courses[0] ?? null,
      };
    });

    const coverageAt = (phase: 'planning' | 'signOff' | 'now') => {
      const acc = { required: requirements.length, measured: 0, provisional: 0, unknown: 0 };
      for (const r of requirements) {
        const src = r[phase].source;
        if (src === 'ASSESSMENT' || src === 'EVIDENCE') acc.measured += 1;
        else if (src === 'EXPERIENCE') acc.provisional += 1;
        else acc.unknown += 1;
      }
      return acc;
    };

    return {
      userId: u.id,
      rowId: u.rowId,
      name: u.name,
      orgLevel: u.orgLevel ?? null,
      departmentId: u.departmentId ?? null,
      managerId: u.managerId ?? null,
      jobProfileId: u.jobProfileId!,
      jobTitle: jobTitles.get(u.jobProfileId!) ?? u.jobProfileId!,
      coverage: { planning: coverageAt('planning'), signOff: coverageAt('signOff'), now: coverageAt('now') },
      requirements,
    };
  })
  .sort((a, b) => a.userId.localeCompare(b.userId));

const unprofiled = users
  .filter((u) => !u.jobProfileId || !jobRequirements.has(u.jobProfileId))
  .map((u) => ({ userId: u.id, name: u.name, jobProfileId: u.jobProfileId ?? null }));

writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), cutoffs: CUTOFFS, people, unprofiled }, null, 2),
);
await client.end();

console.log(`Wrote ${OUT}`);
console.log(`  profiled people: ${people.length}   unprofiled (no plan possible): ${unprofiled.length}`);
for (const p of people) {
  const gaps = p.requirements.filter((r) => r.planning.source !== 'NONE' && r.planning.gap > 0).length;
  console.log(
    `  ${p.userId.padEnd(12)} ${p.name.padEnd(24)} req ${String(p.requirements.length).padStart(3)}  ` +
      `measured@planning ${String(p.coverage.planning.measured).padStart(3)}  plannable gaps ${String(gaps).padStart(3)}`,
  );
}
for (const u of unprofiled) console.log(`  (skipped, no profile) ${u.userId} ${u.name}`);
