import type { WorkExperience, WorkExperiencePolicy } from '../../types';
import { collection, doc, writeBatch, compatDb as db } from '../firestore-compat';
import type { WriteHost } from './host';

// WORK EXPERIENCE — employment OUTSIDE the company: employee-submitted, manager
// verified. A VERIFIED entry's per-skill verifiedLevel becomes a capped
// PROVISIONAL baseline in getUserSkillScore, so every path here that can change
// a verdict must clear the score cache.

/** The admin-set band table + provisional cap (appSettings/work-experience). */
export async function updateWorkExperiencePolicy(host: WriteHost, policy: WorkExperiencePolicy): Promise<void> {
  await host.persist('appSettings', { id: 'work-experience', ...policy });
  host.clearScoreCache();
  await host.logActivity('Updated Work Experience Policy', `Cap: Level ${policy.maxProvisionalLevel}, ${policy.enabled ? 'enabled' : 'disabled'}`);
}

export async function addWorkExperience(
  host: WriteHost,
  entry: Omit<WorkExperience, 'id' | 'status' | 'submittedAt' | 'reviewedAt' | 'reviewedBy'>,
): Promise<WorkExperience> {
  const id = doc(collection(db, 'workExperiences')).id;
  const newEntry: WorkExperience = {
    ...entry,
    id,
    // Stamp the band-table suggestion at submit time so the verifier sees what
    // was proposed, and so a later policy change doesn't silently rewrite the
    // basis of an existing verdict.
    skills: (entry.skills || []).map(s => ({
      ...s,
      suggestedLevel: host.suggestExperienceLevel(s.yearsApplied),
    })),
    status: 'PENDING',
    submittedAt: new Date().toISOString(),
  };

  // Batch the entry + manager notification so neither is orphaned on failure
  // (same reasoning as addEvidence).
  const batch = writeBatch(db);
  batch.set(doc(db, 'workExperiences', id), host.preparePayload('workExperiences', newEntry));

  const user = host.users.find(u => u.id === entry.userId);
  if (user && user.managerId) {
    const notifId = doc(collection(db, 'notifications')).id;
    batch.set(doc(db, 'notifications', notifId), {
      id: notifId,
      userId: user.managerId,
      title: 'Work Experience Submitted',
      message: `${user.name} submitted work experience at ${newEntry.employer} for verification.`,
      type: 'INFO',
      createdAt: new Date().toISOString(),
      isRead: false,
      actionLink: 'manager-approvals',
    });
  }

  try {
    await batch.commit();
  } catch (e) {
    host.reportWriteError(e, `workExperiences/${id}`);
    throw e;
  }
  await host.logActivity('Submitted Work Experience', `${newEntry.employer} — ${newEntry.jobTitle}`);
  return newEntry;
}

/**
 * Owner edit. Any change re-opens verification and drops the previous verdict:
 * a verified level must always trace back to the record the verifier actually
 * saw.
 */
export async function updateWorkExperience(
  host: WriteHost,
  id: string,
  updates: Partial<Omit<WorkExperience, 'id' | 'userId' | 'status' | 'submittedAt' | 'reviewedAt' | 'reviewedBy'>>,
): Promise<void> {
  const existing = host.workExperiences.find(w => w.id === id);
  if (!existing) return;
  const wasActedOn = existing.status === 'VERIFIED' || existing.status === 'REJECTED';

  const skills = (updates.skills ?? existing.skills ?? []).map(s => ({
    ...s,
    suggestedLevel: host.suggestExperienceLevel(s.yearsApplied),
    verifiedLevel: undefined,
  }));

  const updated: WorkExperience = {
    ...existing,
    ...updates,
    skills,
    status: 'PENDING',
    submittedAt: new Date().toISOString(),
    reviewedAt: undefined,
    reviewedBy: undefined,
    reviewerComment: undefined,
  };
  await host.update('workExperiences', updated);
  host.clearScoreCache();

  const user = host.users.find(u => u.id === existing.userId);
  if (user && user.managerId) {
    await host.notify({
      userId: user.managerId,
      title: 'Work Experience Re-Submitted',
      message: `${user.name} edited their ${existing.employer} experience${wasActedOn ? ` (previously ${existing.status.toLowerCase()})` : ''} and it requires re-verification.`,
      type: 'WARNING',
      actionLink: 'manager-approvals',
    });
  }
}

export async function deleteWorkExperience(host: WriteHost, id: string): Promise<void> {
  const existing = host.workExperiences.find(w => w.id === id);
  if (!existing) return;
  const wasActedOn = existing.status === 'VERIFIED' || existing.status === 'REJECTED';
  await host.remove('workExperiences', id);
  host.clearScoreCache();

  const user = host.users.find(u => u.id === existing.userId);
  if (wasActedOn && user && user.managerId) {
    await host.notify({
      userId: user.managerId,
      title: 'Work Experience Withdrawn',
      message: `${user.name} deleted their ${existing.employer} experience that was previously ${existing.status.toLowerCase()}. No further action is needed.`,
      type: 'INFO',
      actionLink: 'manager-approvals',
    });
  }
}

/**
 * Record a verdict. `finalLevels` maps skillId → the level the verifier
 * confirmed; anything absent falls back to the stamped suggestion. Rejecting
 * clears every level so the record can never contribute a score.
 */
export async function verifyWorkExperience(
  host: WriteHost,
  id: string,
  decision: 'VERIFIED' | 'REJECTED',
  reviewerId: string,
  finalLevels?: Record<string, number>,
  comment?: string,
): Promise<void> {
  const existing = host.workExperiences.find(w => w.id === id);
  if (!existing) return;

  const skills = (existing.skills || []).map(s => {
    if (decision === 'REJECTED') return { ...s, verifiedLevel: undefined };
    const raw = finalLevels?.[s.skillId] ?? s.suggestedLevel ?? host.suggestExperienceLevel(s.yearsApplied);
    return { ...s, verifiedLevel: Math.min(Math.max(Math.round(raw), 1), 5) };
  });

  const updated: WorkExperience = {
    ...existing,
    skills,
    status: decision,
    reviewedAt: new Date().toISOString(),
    reviewedBy: reviewerId,
    reviewerComment: comment || undefined,
  };
  await host.update('workExperiences', updated);
  // The listener also clears this, but that is a poll away — clear now so a
  // same-tick re-render shows the new score.
  host.clearScoreCache();

  await host.notify({
    userId: existing.userId,
    title: `Work Experience ${decision === 'VERIFIED' ? 'Verified' : 'Rejected'}`,
    message: `Your work experience at ${existing.employer} was ${decision.toLowerCase()}.${comment ? ` Reviewer note: ${comment}` : ''}`,
    type: decision === 'VERIFIED' ? 'SUCCESS' : 'ERROR',
    actionLink: 'emp-dashboard',
  });
  await host.logActivity(
    decision === 'VERIFIED' ? 'Verified Work Experience' : 'Rejected Work Experience',
    `${existing.employer} — ${existing.jobTitle}`,
  );
}
