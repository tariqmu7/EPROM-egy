import { Role, type CoursePreparation, type CourseSession, type TrainingCourse } from '../../types';
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

/**
 * A course asked for from the skill form because the catalogue does not have
 * it yet. It is stored as a normal course in PENDING state — so no new table —
 * and stays out of every recommendation until an admin approves it. Every
 * other active admin is told, so the request does not sit unseen.
 */
export async function requestTrainingCourse(
  host: WriteHost,
  draft: Omit<TrainingCourse, 'id'>,
): Promise<TrainingCourse> {
  const { actorId, actorName } = host.currentActor();
  const course = await addTrainingCourse(host, {
    ...draft,
    status: 'PENDING',
    requestedBy: actorId ?? host.authUid(),
    requestedAt: new Date().toISOString(),
  });
  const admins = host.users.filter(u => u.role === Role.ADMIN && u.status === 'ACTIVE' && !u.isArchived && u.id !== actorId);
  for (const admin of admins) {
    await host.notify({
      userId: admin.id,
      title: 'New course request',
      message: `${actorName || 'An administrator'} asked for a new course: "${course.title}". Review its content and approve or reject it.`,
      type: 'INFO',
      actionLink: 'admin-courses',
    });
  }
  return course;
}

/**
 * An admin's decision on a course request. The reviewer may have edited the
 * content first (title, syllabus, provider…), so the whole course is saved,
 * not just the status. A rejection must say why — the requester only sees the
 * note. Approving makes the course a normal catalogue entry: from then on it
 * is recommended, priced and budgeted like any other.
 */
export async function reviewTrainingCourseRequest(
  host: WriteHost,
  course: TrainingCourse,
  decision: 'APPROVED' | 'REJECTED',
  note?: string,
): Promise<TrainingCourse> {
  const reviewNote = note?.trim() || undefined;
  if (decision === 'REJECTED' && !reviewNote) {
    throw new Error('A rejected request needs a reason for the requester.');
  }
  const { actorId, actorName } = host.currentActor();
  const reviewed: TrainingCourse = {
    ...course,
    status: decision,
    reviewNote,
    reviewedBy: actorId ?? host.authUid(),
    reviewedAt: new Date().toISOString(),
    linkedSkillIds: course.linkedSkillIds || [],
    updatedAt: new Date().toISOString(),
  };
  await host.update('trainingCourses', reviewed);
  await host.logActivity(
    decision === 'APPROVED' ? 'Approved Course Request' : 'Rejected Course Request',
    reviewed.title,
  );
  if (reviewed.requestedBy && reviewed.requestedBy !== actorId) {
    const by = actorName || 'An administrator';
    await host.notify({
      userId: reviewed.requestedBy,
      title: decision === 'APPROVED' ? 'Course request approved' : 'Course request rejected',
      message: decision === 'APPROVED'
        ? `${by} approved your request "${reviewed.title}". It is now in the Training Catalogue.${reviewNote ? ` Note: ${reviewNote}` : ''}`
        : `${by} rejected your request "${reviewed.title}". Reason: ${reviewNote}`,
      type: decision === 'APPROVED' ? 'SUCCESS' : 'WARNING',
      actionLink: 'admin-courses',
    });
  }
  return reviewed;
}

/**
 * The training department's follow-up on an approved new course: material
 * status, owner, target date and the sessions it will run. Only the
 * `preparation` block changes — the course content was settled at approval.
 * Sessions without a day are dropped, the rest are kept in date order. When
 * the material first becomes READY, whoever asked for the course is told.
 */
export async function updateCoursePreparation(
  host: WriteHost,
  courseId: string,
  prep: CoursePreparation,
): Promise<TrainingCourse> {
  const course = host.trainingCourses.find(c => c.id === courseId);
  if (!course) throw new Error('That course no longer exists.');

  const sessions: CourseSession[] = (prep.sessions || [])
    .filter(s => s.date && /^\d{4}-\d{2}-\d{2}$/.test(s.date))
    .map(s => ({
      id: s.id || newId(),
      date: s.date,
      venue: s.venue?.trim() || undefined,
      trainer: s.trainer?.trim() || undefined,
      seats: s.seats != null && Number.isFinite(s.seats) && s.seats > 0 ? Math.floor(s.seats) : undefined,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const { actorId, actorName } = host.currentActor();
  const now = new Date().toISOString();
  const preparation: CoursePreparation = {
    materialStatus: prep.materialStatus || 'NOT_STARTED',
    owner: prep.owner?.trim() || undefined,
    targetDate: prep.targetDate || undefined,
    notes: prep.notes?.trim() || undefined,
    sessions,
    updatedBy: actorId ?? host.authUid(),
    updatedAt: now,
  };
  const updated: TrainingCourse = { ...course, preparation, updatedAt: now };
  await host.update('trainingCourses', updated);
  await host.logActivity('Updated Course Preparation', updated.title);

  const becameReady = preparation.materialStatus === 'READY' && course.preparation?.materialStatus !== 'READY';
  if (becameReady && course.requestedBy && course.requestedBy !== actorId) {
    const first = sessions.find(s => s.date >= now.slice(0, 10));
    await host.notify({
      userId: course.requestedBy,
      title: 'Requested course is ready',
      message: `${actorName || 'The training department'} marked the material for "${updated.title}" as ready.${
        first ? ` First session: ${first.date}${first.venue ? ` at ${first.venue}` : ''}.` : ' No session scheduled yet.'}`,
      type: 'SUCCESS',
      actionLink: 'admin-courses',
    });
  }
  return updated;
}
