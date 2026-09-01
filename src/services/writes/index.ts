/**
 * The WRITE half of the store, one module per feature.
 *
 * Task 9a took the pure MATHS out of `store.ts` into `../competency`, where it
 * reads a `CompetencyContext` and writes nothing. These modules are the other
 * half: they change data, so they need the service — persistence, the audit
 * log, the notification path and the score cache. They get exactly that and no
 * more, through the explicit `WriteHost` interface in `./host.ts`.
 *
 * Rules this leaves behind:
 *
 * - **A new feature write goes in its own file here**, takes `host: WriteHost`
 *   as its first argument, and gets a thin delegating method on `DataService`
 *   so callers never change.
 * - **Anything that can move a score must call `host.clearScoreCache()`** —
 *   the listener clears it too, but a poll later, and a same-tick re-render
 *   would otherwise show the old number.
 * - **Reads stay on `DataService`.** These modules exist to hold the writes;
 *   pulling the matching getters in would just rebuild the god object one
 *   feature at a time.
 * - **A module never imports another module's file** — only `./host`, the
 *   types, and the wire (`../firestore-compat`). `developmentPlans.ts` calling
 *   its own `proposeDevelopmentPlanItems` is inside one feature, not across two.
 */

export type { WriteHost } from './host';

export {
  addEvidence,
  updateEvidence,
  deleteEvidence,
  updateEvidenceStatus,
} from './evidence';

export {
  updateWorkExperiencePolicy,
  addWorkExperience,
  updateWorkExperience,
  deleteWorkExperience,
  verifyWorkExperience,
} from './workExperience';

export {
  proposeDevelopmentPlanItems,
  createDevelopmentPlan,
  setDevelopmentPlanStatus,
  deleteDevelopmentPlan,
  updateDevelopmentPlanItem,
  setDevelopmentPlanItemStatus,
  signOffDevelopmentPlanItem,
  addDevelopmentPlanItems,
} from './developmentPlans';

export {
  generateTrainingCourseCode,
  addTrainingCourse,
  updateTrainingCourse,
  removeTrainingCourse,
  restoreTrainingCourse,
} from './trainingCourses';

export {
  markNotificationAsRead,
  markAllNotificationsAsRead,
  addNotification,
} from './notifications';

export {
  assessmentCycleBucket,
  addAssessment,
  updateAssessment,
} from './assessments';
