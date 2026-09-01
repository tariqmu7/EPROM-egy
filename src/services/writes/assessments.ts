import type { Assessment } from '../../types';
import { collection, doc, compatDb as db } from '../firestore-compat';
import type { WriteHost } from './host';

// ASSESSMENTS — the write half. A score record is what the whole engine is
// built on, so the `type` on it is a claim about who scored whom: the server
// re-derives it from the real rater relationship (hole H6), and nothing here
// may assume the client's word for it.

// The evaluation "period" an assessment belongs to, used to dedupe a rater's
// re-submissions: the explicit cycleId when present, otherwise the calendar
// year of the record's date (or the current year for an unsaved record).
// Same bucket ⇒ an update-in-place; a new bucket ⇒ a new historical record.
export function assessmentCycleBucket(a: { cycleId?: string; date?: string }): string {
  if (a.cycleId) return `cycle:${a.cycleId}`;
  const year = a.date ? new Date(a.date).getFullYear() : new Date().getFullYear();
  return `year:${year}`;
}

export async function addAssessment(host: WriteHost, assessment: Omit<Assessment, 'id' | 'date'>): Promise<void> {
  const subject = host.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
  const skillName = assessment.skillId === 'annual-appraisal'
    ? 'Annual Appraisal'
    : (host.skills.find(s => s.id === assessment.skillId)?.name || assessment.skillId);

  // Upsert: a rater holds at most one live evaluation per subject+skill
  // *within a cycle*. Re-submitting in the same period UPDATES that record in
  // place rather than appending a duplicate — otherwise the History Ledger
  // fills with duplicate rows and the score double-counts the same rater.
  // The period is the explicit cycleId when set, else the calendar year, so a
  // fresh evaluation in a new year keeps the prior year as its own historical
  // record (e.g. the Annual Appraisal Historical Record grows one row/year)
  // instead of overwriting it. Mirrors the `existingAssessment` form lookup.
  const incomingBucket = assessmentCycleBucket(assessment);
  const existing = host.assessments.find(a =>
    !a.isArchived &&
    a.raterId === assessment.raterId &&
    a.subjectId === assessment.subjectId &&
    a.skillId === assessment.skillId &&
    assessmentCycleBucket(a) === incomingBucket
  );

  if (existing) {
    const updated: Assessment = {
      ...existing,
      ...assessment,
      id: existing.id,
      date: new Date().toISOString(),
    };
    await host.update('assessments', updated);

    await host.logActivity('Updated Assessment', `For ${subject}`, {
      entity: 'assessment',
      entityId: existing.id,
      before: `${skillName} (${existing.type}) → ${existing.score}`,
      after: `${skillName} (${updated.type}) → ${updated.score}`,
    });

    if (assessment.raterId !== assessment.subjectId) {
      await host.notify({
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
  await host.persist('assessments', newAssessment);

  // Auto-update notification for the subject
  await host.notify({
    userId: assessment.subjectId,
    title: 'New Evaluation Result',
    message: `A new ${assessment.method} evaluation has been registered for your profile.`,
    type: 'INFO',
    actionLink: 'emp-dashboard'
  });

  await host.logActivity('Submitted Assessment', `For ${subject}`, {
    entity: 'assessment',
    entityId: id,
    after: `${skillName} (${assessment.type}) → ${assessment.score}`,
  });

  if (assessment.raterId !== assessment.subjectId) {
    await host.notify({
      userId: assessment.subjectId,
      title: 'New Assessment Received',
      message: `You received a new assessment.`,
      type: 'INFO',
      actionLink: 'emp-dashboard'
    });
  }
}

export async function updateAssessment(host: WriteHost, assessment: Assessment): Promise<void> {
  const prior = host.assessments.find(a => a.id === assessment.id);
  await host.update('assessments', assessment);
  const subject = host.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
  await host.logActivity('Updated Assessment', `For ${subject}`, {
    entity: 'assessment',
    entityId: assessment.id,
    before: prior ? `score ${prior.score}` : undefined,
    after: `score ${assessment.score}`,
  });
}
