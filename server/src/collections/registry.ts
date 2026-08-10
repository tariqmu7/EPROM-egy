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
  // NOTE: a new collection needs BOTH a `can()` case and a `listScope()` case in
  // authz.ts. runList applies only listScope (it never calls can()), so a
  // registry entry without a listScope case is readable org-wide by any
  // authenticated user — see authz.ts and __tests__/api.test.ts.
  workExperiences: '"workExperiences"',
  developmentPlans: '"developmentPlans"',
  appSettings: '"appSettings"',
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export function isCollection(name: string): name is CollectionName {
  return Object.prototype.hasOwnProperty.call(COLLECTIONS, name);
}

export function tableFor(name: CollectionName): string {
  return COLLECTIONS[name];
}
