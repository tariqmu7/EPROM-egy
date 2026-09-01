import type {
  DevelopmentItemStatus,
  DevelopmentPlan,
  DevelopmentPlanItem,
  DevelopmentPlanStatus,
} from '../../types';
import { collection, doc, compatDb as db } from '../firestore-compat';
import { newId } from '../../utils/uuid';
import type { WriteHost } from './host';

// ─── DEVELOPMENT PLANS (the SAVED training plan) ───────────────────────────
//
// `generateIndividualTrainingPlan` is a PROPOSAL: recomputed on every render,
// never stored. Everything here turns a proposal into a record — agreed, owned,
// tracked to completion, signed off by a manager, and re-measured so the effect
// on the score is visible. Every write is of the WHOLE plan document (one row
// per plan, items nested), which is why the server's developmentPlansPolicy
// lets both the owner and their management chain PATCH the same doc.
//
// The readers (getDevelopmentPlans / getDevelopmentPlanProgress /
// getPendingDevelopmentSignOffs / canSupervise) stay on DataService.

/**
 * Turn today's live gap analysis into plan items WITHOUT saving anything —
 * the "propose" step of propose → save → assign → track. Each item freezes
 * the level and its source at planning time, which is what later makes
 * "did the training work" answerable.
 *
 * A never-assessed skill is deliberately EXCLUDED: it is an assessment need,
 * not a training gap (see the TNA engine and CLAUDE.md's coverage rule).
 */
export function proposeDevelopmentPlanItems(host: WriteHost, userId: string): DevelopmentPlanItem[] {
  const proposal = host.generateIndividualTrainingPlan(userId);
  if (!proposal) return [];

  return proposal.recommendations
    .map(rec => {
      const detail = host.getUserSkillScoreDetail(userId, rec.skillId);
      if (detail.source === 'NONE') return null; // unknown ≠ gap
      const course = rec.courseId ? host.getTrainingCourse(rec.courseId) : undefined;
      const item: DevelopmentPlanItem = {
        id: newId(),
        skillId: rec.skillId,
        skillName: rec.skillName,
        requiredLevel: detail.score + rec.gap,
        levelAtPlanning: detail.score,
        gapAtPlanning: rec.gap,
        sourceAtPlanning: detail.source,
        recommendation: rec.recommendation,
        priority: rec.priority,
        status: 'NOT_STARTED',
        targetDate: rec.targetDate,
        supervisorSignOff: false,
      };
      if (course) {
        item.courseId = course.id;
        item.courseTitle = course.title;
      }
      return item;
    })
    .filter((i): i is DevelopmentPlanItem => i !== null);
}

/**
 * Save a plan. `createdBy` is the acting user — an employee writing their own
 * plan (DRAFT by default) or a manager/admin assigning one, which starts
 * ACTIVE and notifies the employee that work has been assigned to them.
 */
export async function createDevelopmentPlan(
  host: WriteHost,
  userId: string,
  options: {
    createdBy: string;
    items?: DevelopmentPlanItem[];
    title?: string;
    status?: Extract<DevelopmentPlanStatus, 'DRAFT' | 'ACTIVE'>;
    notes?: string;
  },
): Promise<DevelopmentPlan> {
  const user = host.getUserById(userId);
  const now = new Date().toISOString();
  const items = options.items ?? proposeDevelopmentPlanItems(host, userId);
  const coverage = host.getUserCoverage(userId);
  const status: DevelopmentPlanStatus = options.status ?? 'DRAFT';

  const plan: DevelopmentPlan = {
    id: doc(collection(db, 'developmentPlans')).id,
    userId,
    title: options.title?.trim() || `Development Plan ${new Date().getFullYear()}`,
    status,
    items,
    createdAt: now,
    createdBy: options.createdBy,
    updatedAt: now,
    // The base behind every figure this plan will later be read against.
    coverageAtPlanning: {
      required: coverage.required,
      measured: coverage.measured,
      provisional: coverage.provisional,
      unknown: coverage.unknown,
    },
  };
  if (user?.jobProfileId) plan.jobProfileId = user.jobProfileId;
  if (status === 'ACTIVE') plan.activatedAt = now;
  if (options.notes?.trim()) plan.notes = options.notes.trim();

  await host.persist('developmentPlans', plan);

  // Only tell the employee when somebody ELSE assigned it — a draft you wrote
  // yourself does not need an alert about itself.
  if (options.createdBy !== userId && status === 'ACTIVE') {
    await host.notify({
      userId,
      title: 'Development Plan Assigned',
      message: `A development plan with ${items.length} item${items.length === 1 ? '' : 's'} has been assigned to you.`,
      type: 'INFO',
      actionLink: 'emp-dashboard',
    });
  }
  await host.logActivity('Created Development Plan', `${user?.name || userId} — ${items.length} items`, {
    entity: 'developmentPlan',
    entityId: plan.id,
  });
  return plan;
}

async function saveDevelopmentPlan(host: WriteHost, plan: DevelopmentPlan): Promise<DevelopmentPlan> {
  const updated = { ...plan, updatedAt: new Date().toISOString() };
  await host.update('developmentPlans', updated);
  return updated;
}

const findPlan = (host: WriteHost, planId: string): DevelopmentPlan | undefined =>
  host.developmentPlans.find(p => p.id === planId);

/** Move the whole plan through its lifecycle (draft → active → completed/archived). */
export async function setDevelopmentPlanStatus(
  host: WriteHost,
  planId: string,
  status: DevelopmentPlanStatus,
): Promise<void> {
  const plan = findPlan(host, planId);
  if (!plan || plan.status === status) return;
  const now = new Date().toISOString();

  const updated: DevelopmentPlan = { ...plan, status };
  if (status === 'ACTIVE' && !plan.activatedAt) updated.activatedAt = now;
  if (status === 'COMPLETED') updated.completedAt = now;
  if (status === 'ARCHIVED') updated.archivedAt = now;
  await saveDevelopmentPlan(host, updated);

  if (status === 'ACTIVE') {
    await host.notify({
      userId: plan.userId,
      title: 'Development Plan Activated',
      message: `Your development plan "${plan.title}" is now active.`,
      type: 'INFO',
      actionLink: 'emp-dashboard',
    });
  }
  await host.logActivity(`Development Plan ${status}`, plan.title, {
    entity: 'developmentPlan',
    entityId: plan.id,
    before: plan.status,
    after: status,
  });
}

/** Delete — only ever a DRAFT; an agreed plan is archived, not erased. */
export async function deleteDevelopmentPlan(host: WriteHost, planId: string): Promise<void> {
  const plan = findPlan(host, planId);
  if (!plan) return;
  if (plan.status !== 'DRAFT') {
    throw new Error('Only a draft plan can be deleted. Archive the plan instead.');
  }
  await host.remove('developmentPlans', planId);
  await host.logActivity('Deleted Development Plan', plan.title, {
    entity: 'developmentPlan',
    entityId: planId,
  });
}

function replaceItem(
  plan: DevelopmentPlan,
  itemId: string,
  change: (item: DevelopmentPlanItem) => DevelopmentPlanItem,
): DevelopmentPlan | null {
  const idx = plan.items.findIndex(i => i.id === itemId);
  if (idx === -1) return null;
  const items = [...plan.items];
  items[idx] = change(items[idx]);
  return { ...plan, items };
}

/** Edit an item's plan-side fields (target date, course, recommendation, priority). */
export async function updateDevelopmentPlanItem(
  host: WriteHost,
  planId: string,
  itemId: string,
  updates: Partial<Pick<DevelopmentPlanItem, 'targetDate' | 'recommendation' | 'priority' | 'courseId' | 'courseTitle'>>,
): Promise<void> {
  const plan = findPlan(host, planId);
  if (!plan) return;
  const next = replaceItem(plan, itemId, item => ({ ...item, ...updates }));
  if (!next) return;
  await saveDevelopmentPlan(host, next);
}

/**
 * Progress an item. Completing it notifies the employee's manager that a
 * sign-off is waiting — the plan is what makes that chase possible at all.
 */
export async function setDevelopmentPlanItemStatus(
  host: WriteHost,
  planId: string,
  itemId: string,
  status: DevelopmentItemStatus,
  note?: string,
): Promise<void> {
  const plan = findPlan(host, planId);
  if (!plan) return;
  const now = new Date().toISOString();

  const next = replaceItem(plan, itemId, item => {
    const updated: DevelopmentPlanItem = { ...item, status };
    if (status === 'IN_PROGRESS' && !item.startedAt) updated.startedAt = now;
    if (status === 'COMPLETED') {
      updated.completedAt = now;
      if (!updated.startedAt) updated.startedAt = now;
    } else {
      // Re-opening drops the completion stamp and any sign-off with it: a
      // sign-off must always refer to work that is actually finished.
      updated.completedAt = undefined;
      updated.supervisorSignOff = false;
      updated.signedOffBy = undefined;
      updated.signedOffAt = undefined;
      updated.levelAtSignOff = undefined;
    }
    if (note !== undefined) updated.completionNote = note.trim() || undefined;
    return updated;
  });
  if (!next) return;
  await saveDevelopmentPlan(host, next);

  const item = next.items.find(i => i.id === itemId)!;
  const employee = host.getUserById(plan.userId);
  if (status === 'COMPLETED' && employee?.managerId) {
    await host.notify({
      userId: employee.managerId,
      title: 'Development Item Awaiting Sign-Off',
      message: `${employee.name} marked "${item.skillName}" complete on their development plan.`,
      type: 'INFO',
      actionLink: 'manager-approvals',
    });
  }
}

/**
 * Manager sign-off. This is where the loop closes: the current score is read
 * again and STORED as `levelAtSignOff`, so the plan itself carries the
 * before/after evidence instead of the UI having to guess later. When every
 * item that is still in play is signed off, the plan completes itself.
 */
export async function signOffDevelopmentPlanItem(
  host: WriteHost,
  planId: string,
  itemId: string,
  reviewerId: string,
  comment?: string,
): Promise<void> {
  const plan = findPlan(host, planId);
  if (!plan) return;
  const now = new Date().toISOString();

  const next = replaceItem(plan, itemId, item => {
    const level = host.getUserSkillScore(plan.userId, item.skillId);
    return {
      ...item,
      status: 'COMPLETED',
      completedAt: item.completedAt || now,
      supervisorSignOff: true,
      signedOffBy: reviewerId,
      signedOffAt: now,
      signOffComment: comment?.trim() || undefined,
      levelAtSignOff: level,
    };
  });
  if (!next) return;

  // A plan whose remaining items are all signed off is finished — recording
  // that here means "was it delivered" is answerable without re-deriving it.
  const live = next.items.filter(i => i.status !== 'CANCELLED');
  const allDone = live.length > 0 && live.every(i => i.supervisorSignOff);
  if (allDone) {
    next.status = 'COMPLETED';
    next.completedAt = now;
  }
  const saved = await saveDevelopmentPlan(host, next);

  const item = saved.items.find(i => i.id === itemId)!;
  const gained = (item.levelAtSignOff ?? 0) - item.levelAtPlanning;
  await host.notify({
    userId: plan.userId,
    title: 'Development Item Signed Off',
    message: `"${item.skillName}" was signed off${gained > 0 ? ` — your level moved from ${item.levelAtPlanning} to ${item.levelAtSignOff}.` : '.'}`,
    type: 'SUCCESS',
    actionLink: 'emp-dashboard',
  });
  await host.logActivity('Signed Off Development Item', `${item.skillName} — ${host.getUserById(plan.userId)?.name || plan.userId}`, {
    entity: 'developmentPlan',
    entityId: plan.id,
    before: `L${item.levelAtPlanning}`,
    after: `L${item.levelAtSignOff}`,
  });
}

/**
 * Append newly-appeared gaps to a live plan. The requirements or the scores
 * can move after a plan is agreed; without this the plan silently goes stale
 * and people re-generate instead of tracking. Items already on the plan (by
 * skill) are never duplicated.
 */
export async function addDevelopmentPlanItems(
  host: WriteHost,
  planId: string,
  items: DevelopmentPlanItem[],
): Promise<number> {
  const plan = findPlan(host, planId);
  if (!plan || items.length === 0) return 0;
  const present = new Set(plan.items.map(i => i.skillId));
  const additions = items.filter(i => !present.has(i.skillId));
  if (additions.length === 0) return 0;
  await saveDevelopmentPlan(host, { ...plan, items: [...plan.items, ...additions] });
  return additions.length;
}
