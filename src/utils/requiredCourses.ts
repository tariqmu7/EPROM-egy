import { Skill, SkillLevel, TrainingCourse } from '../types';

// --- Typed certificate names -> Training Catalogue courses -----------------
// Before the pick-list, a skill level's required certificates were free text
// ("NEBOSH IGC", "H2S awareness"). These helpers link such a name to the
// catalogue course it means, so the bulk upload, the skill details view and a
// one-off clean-up of old skills all agree on what "the same course" is.

/** Case, spacing and punctuation never make two names different courses:
 *  "H2S Awareness", "h2s-awareness" and "H2S  awareness." are one course. */
export const normalizeCourseName = (s: string): string =>
  s.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The catalogue course a typed name refers to — by title, or by its code
 *  (TRN-SAF-01). Archived and rejected courses never match; an approved
 *  course wins over a pending request of the same title. */
export const findCourseForName = (name: string, courses: TrainingCourse[]): TrainingCourse | undefined => {
  const key = normalizeCourseName(name);
  if (!key) return undefined;
  const hits = courses.filter(c =>
    !c.isArchived && c.status !== 'REJECTED' &&
    (normalizeCourseName(c.title) === key || (!!c.code && normalizeCourseName(c.code) === key)),
  );
  return hits.find(c => !c.status || c.status === 'APPROVED') ?? hits[0];
};

export interface ResolvedCourses {
  courseIds: string[];
  /** Display names, kept in step: linked course titles, then unmatched names. */
  names: string[];
  /** Typed names with no catalogue course — still shown, flagged "not in catalogue". */
  unmatched: string[];
}

/** Links each typed name to a course where one exists. Ids already on the
 *  level are kept first; nothing is ever dropped — an unknown name stays. */
export const resolveRequiredCourses = (
  names: string[],
  courses: TrainingCourse[],
  existingIds: string[] = [],
): ResolvedCourses => {
  const byId = new Map(courses.map(c => [c.id, c]));
  const courseIds = [...new Set(existingIds)];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    const key = normalizeCourseName(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const course = findCourseForName(name, courses);
    if (course) {
      if (!courseIds.includes(course.id)) courseIds.push(course.id);
    } else if (!courseIds.some(id => normalizeCourseName(byId.get(id)?.title ?? '') === key)) {
      unmatched.push(name);
    }
  }
  const titles = courseIds.map(id => byId.get(id)?.title).filter((t): t is string => !!t);
  return { courseIds, names: [...titles, ...unmatched], unmatched };
};

/** One level with its typed names linked. */
export const linkLevelCertificates = (level: SkillLevel, courses: TrainingCourse[]): SkillLevel => {
  const r = resolveRequiredCourses(level.requiredCertificates || [], courses, level.requiredCourseIds || []);
  return { ...level, requiredCourseIds: r.courseIds, requiredCertificates: r.names };
};

export interface SkillLinkResult {
  skill: Skill;
  /** True when at least one name became a course link. */
  changed: boolean;
  linked: number;
  unmatched: string[];
}

/** Every level of a skill with its typed names linked. */
export const linkSkillCertificates = (skill: Skill, courses: TrainingCourse[]): SkillLinkResult => {
  const levels = { ...skill.levels };
  let linked = 0;
  const unmatched: string[] = [];
  for (const key of Object.keys(levels)) {
    const lvl = levels[key as unknown as number];
    if (!lvl) continue;
    const before = lvl.requiredCourseIds?.length ?? 0;
    const next = linkLevelCertificates(lvl, courses);
    const gained = (next.requiredCourseIds?.length ?? 0) - before;
    linked += gained;
    unmatched.push(...resolveRequiredCourses(lvl.requiredCertificates || [], courses, lvl.requiredCourseIds || []).unmatched);
    if (gained > 0) levels[key as unknown as number] = next;
  }
  return { skill: { ...skill, levels }, changed: linked > 0, linked, unmatched: [...new Set(unmatched)] };
};
