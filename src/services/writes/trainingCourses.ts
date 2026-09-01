import type { TrainingCourse } from '../../types';
import { newId } from '../../utils/uuid';
import type { WriteHost } from './host';

// --- TRAINING CATALOGUE ---------------------------------------------------
// The cure side of the engine: a course linked to a skill is what turns a gap
// into a named recommendation (see generateIndividualTrainingPlan / TNA).
// The readers (getAllTrainingCourses / getCoursesForSkill, both of which drop
// archived courses) stay on DataService.

/** Sequential reference like TRN-WELD-01, unique across the catalogue. */
export function generateTrainingCourseCode(host: WriteHost, course: Pick<TrainingCourse, 'title'>): string {
  const base = (course.title || 'COURSE')
    .replace(/[^A-Za-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .map(w => w.toUpperCase())
    .join('')
    .substring(0, 5) || 'CRS';
  const used = new Set(host.trainingCourses.map(c => c.code).filter(Boolean));
  let n = 1;
  let code = `TRN-${base}-01`;
  while (used.has(code)) code = `TRN-${base}-${String(++n).padStart(2, '0')}`;
  return code;
}

export async function addTrainingCourse(
  host: WriteHost,
  course: Omit<TrainingCourse, 'id'> & { id?: string },
): Promise<TrainingCourse> {
  const id = course.id || newId();
  const newCourse: TrainingCourse = {
    ...course,
    id,
    linkedSkillIds: course.linkedSkillIds || [],
    code: course.code || generateTrainingCourseCode(host, course),
    createdAt: course.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await host.persist('trainingCourses', newCourse);
  await host.logActivity('Added Training Course', newCourse.title);
  return newCourse;
}

export async function updateTrainingCourse(host: WriteHost, course: TrainingCourse): Promise<TrainingCourse> {
  const updated: TrainingCourse = {
    ...course,
    linkedSkillIds: course.linkedSkillIds || [],
    updatedAt: new Date().toISOString(),
  };
  await host.update('trainingCourses', updated);
  await host.logActivity('Updated Training Course', updated.title);
  return updated;
}

/**
 * Soft-delete, like skills: an ITP generated last year may still reference the
 * course by id, so the record stays and is only hidden from recommendations.
 */
export async function removeTrainingCourse(host: WriteHost, id: string): Promise<void> {
  const course = host.trainingCourses.find(c => c.id === id);
  if (!course) return;
  await host.update('trainingCourses', { ...course, isArchived: true, updatedAt: new Date().toISOString() });
  await host.logActivity('Archived Training Course', course.title);
}

export async function restoreTrainingCourse(host: WriteHost, id: string): Promise<void> {
  const course = host.trainingCourses.find(c => c.id === id);
  if (!course) return;
  await host.update('trainingCourses', { ...course, isArchived: false, updatedAt: new Date().toISOString() });
  await host.logActivity('Restored Training Course', course.title);
}
