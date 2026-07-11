// Allowlist of collections the generic API will serve, mapped to their SQL
// table identifier (camelCase tables are quoted). Because this is a fixed
// allowlist, the identifier is safe to interpolate into SQL.
export const COLLECTIONS = {
  users: 'users',
  skills: 'skills',
  departments: 'departments',
  jobProfiles: '"jobProfiles"',
  assessments: 'assessments',
  activityLogs: '"activityLogs"',
  evidences: 'evidences',
  notifications: 'notifications',
  assessmentCycles: '"assessmentCycles"',
  nominations: 'nominations',
  scheduledAssessments: '"scheduledAssessments"',
  assessmentPlans: '"assessmentPlans"',
  assessmentInstructions: '"assessmentInstructions"',
  trainingCourses: '"trainingCourses"',
  projects: 'projects',
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export function isCollection(name: string): name is CollectionName {
  return Object.prototype.hasOwnProperty.call(COLLECTIONS, name);
}

export function tableFor(name: CollectionName): string {
  return COLLECTIONS[name];
}
