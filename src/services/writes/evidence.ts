import type { Evidence } from '../../types';
import { collection, doc, writeBatch, compatDb as db } from '../firestore-compat';
import type { WriteHost } from './host';

// Evidence — a work record the employee submits and a manager grades. The
// verdict fields (status / assignedScore / reviewedBy / reviewerComment) are
// the manager's alone; the server enforces that (authz hole H4), and these
// paths must never send a verdict on the employee's behalf.

export async function addEvidence(
  host: WriteHost,
  evidence: Omit<Evidence, 'id' | 'status' | 'submittedAt'>,
): Promise<Evidence> {
  const id = doc(collection(db, 'evidences')).id;
  const newEvidence: Evidence = {
    ...evidence,
    id,
    status: 'PENDING',
    submittedAt: new Date().toISOString()
  };

  // A2.1: Batch evidence + manager notification so neither is orphaned on failure.
  const batch = writeBatch(db);
  batch.set(doc(db, 'evidences', id), host.preparePayload('evidences', newEvidence));

  const user = host.users.find(u => u.id === evidence.userId);
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
    host.reportWriteError(e, `evidences/${id}`);
    throw e;
  }
  return newEvidence;
}

/** Owner edit — re-opens review and drops the previous verdict. */
export async function updateEvidence(
  host: WriteHost,
  id: string,
  updates: { notes?: string; fileUrl?: string; fileName?: string; expiryDate?: string },
): Promise<void> {
  const evidence = host.evidences.find(e => e.id === id);
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
  await host.update('evidences', updatedEvidence);
  const user = host.users.find(u => u.id === evidence.userId);
  if (user && user.managerId) {
    await host.notify({
      userId: user.managerId,
      title: 'Evidence Re-Submitted for Review',
      message: `${user.name} edited their evidence${wasActedOn ? ` (previously ${evidence.status.toLowerCase()})` : ''} and it requires re-approval.`,
      type: 'WARNING',
      actionLink: 'manager-approvals'
    });
  }
}

export async function deleteEvidence(host: WriteHost, id: string): Promise<void> {
  const evidence = host.evidences.find(e => e.id === id);
  if (!evidence) return;
  const wasActedOn = evidence.status === 'APPROVED' || evidence.status === 'REJECTED';
  await host.remove('evidences', id);
  const user = host.users.find(u => u.id === evidence.userId);
  if (wasActedOn && user && user.managerId) {
    await host.notify({
      userId: user.managerId,
      title: 'Evidence Withdrawn',
      message: `${user.name} deleted their evidence that was previously ${evidence.status.toLowerCase()}. No further action is needed.`,
      type: 'INFO',
      actionLink: 'manager-approvals'
    });
  }
}

/** The reviewer's verdict. An APPROVED record's score feeds the evidence tier. */
export async function updateEvidenceStatus(
  host: WriteHost,
  id: string,
  status: 'APPROVED' | 'REJECTED',
  reviewerId: string,
  level?: number,
  comment?: string,
): Promise<void> {
  const evidence = host.evidences.find(e => e.id === id);
  if (evidence) {
    const updatedEvidence = {
      ...evidence,
      status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: reviewerId,
      assignedScore: status === 'APPROVED' ? (level || 3) : undefined,
      reviewerComment: comment || undefined
    };
    await host.update('evidences', updatedEvidence);

    // Notify user
    await host.notify({
      userId: evidence.userId,
      title: `Evidence ${status}`,
      message: `Your evidence submission was ${status.toLowerCase()}.${comment ? ` Reviewer note: ${comment}` : ''}`,
      type: status === 'APPROVED' ? 'SUCCESS' : 'ERROR',
      actionLink: 'evidence-portal'
    });
  }
}
