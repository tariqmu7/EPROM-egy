
export enum Role {
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
  CEO = 'CEO'
}

export type UserStatus = 'ACTIVE' | 'PENDING' | 'REJECTED';

// Org Hierarchy tiers
export type OrgLevel = 'CEO' | 'GM' | 'AGM' | 'DM' | 'SH' | 'SP' | 'JP' | 'FR';

export const ORG_LEVEL_LABELS: Record<OrgLevel, string> = {
  'CEO': 'Chief Executive Officer',
  'GM': 'General Manager',
  'AGM': 'Assistant General Manager',
  'DM': 'Department Manager',
  'SH': 'Section Head',
  'SP': 'Senior Position',
  'JP': 'Junior Position',
  'FR': 'Fresh'
};

export const ORG_LEVEL_NUMBERS: Record<OrgLevel, number> = {
  'CEO': 0,
  'GM': 1,
  'AGM': 2,
  'DM': 3,
  'SH': 4,
  'SP': 5,
  'JP': 6,
  'FR': 7
};

// Strict Hierarchy Order (Top to Bottom)
export const ORG_HIERARCHY_ORDER: OrgLevel[] = ['CEO', 'GM', 'AGM', 'DM', 'SH', 'SP', 'JP', 'FR'];

export const PROFICIENCY_LABELS: Record<number, string> = {
  1: 'Awareness',
  2: 'Knowledge',
  3: 'Skill',
  4: 'Advanced',
  5: 'Expert'
};

export interface SkillLevel {
  level: number;
  description: string;
  requiredCertificates: string[];
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  isArchived?: boolean;
  levels: Record<number, SkillLevel>;
  status?: 'APPROVED' | 'PENDING';
  // How this skill is assessed now lives on reusable AssessmentInstruction
  // entities. A skill may carry several (multi-method assessment).
  assessmentInstructionIds?: string[];
  // @deprecated Moved to AssessmentInstruction. Kept optional so legacy
  // Firestore docs still parse and feed the one-time auto-migration; no
  // longer written by the Skill form.
  assessmentQuestion?: string;
  // @deprecated superseded by AssessmentInstruction.method
  assessmentMethod?: 'OJT_OBSERVATION' | 'WRITTEN_EXAM' | 'PRACTICAL_DEMO' | 'INTERVIEW' | 'WORK_RECORD_REVIEW' | 'THREE_SIXTY_EVALUATION';
  // @deprecated superseded by AssessmentInstruction.assessmentLink
  assessmentLink?: string; // Used specifically for WRITTEN_EXAM to link to external forms
  // @deprecated superseded by AssessmentInstruction.evaluationQuestions
  evaluationQuestions?: EvaluationQuestion[]; // For written exams/online tests
  // @deprecated superseded by AssessmentInstruction.interviewQuestions
  interviewQuestions?: EvaluationQuestion[]; // For interviews
  // @deprecated superseded by AssessmentInstruction.threeSixtyQuestions
  threeSixtyQuestions?: EvaluationQuestion[]; // For 360 evaluations
  description?: string; // Optional detailed description of the skill or assessment
  code?: string; // Automatically generated professional identifier
  subcategory?: string; // Related field e.g., Maintenance, Operation, IT
  requiresCertificate?: boolean; // True if the skill needs external validation
  // @deprecated Scheduling now lives on AssessmentPlan (see AssessmentPlan).
  // Kept optional so legacy Firestore docs still parse; no longer written or read.
  assessmentFrequency?: 'ONE_TIME' | 'PERIODIC' | 'CERTIFICATE_BASED';
  // @deprecated superseded by AssessmentPlan.frequency
  periodicInterval?: 'MONTHLY' | 'QUARTERLY' | 'ANNUALLY';
}

export type AssessmentMethod = 'WRITTEN_EXAM' | 'PRACTICAL_DEMO' | 'OJT_OBSERVATION' | 'INTERVIEW' | 'WORK_RECORD_REVIEW' | 'THREE_SIXTY_EVALUATION' | 'ANNUAL_APPRAISAL';

export interface EvaluationQuestion {
  id: string;
  title?: string;          // Short label (used as heading in annual appraisal)
  text: string;
  expectedCriteria?: string;
  minRating?: number;
  maxRating?: number;
  weight?: number;         // Scoring weight (percentage points); weights should sum to 100
}

export interface ScheduledAssessment {
  id: string;
  userId: string;
  skillId: string;
  method: AssessmentMethod;
  scheduledDate: string;
  status: 'UPCOMING' | 'OVERDUE' | 'COMPLETED';
  assessorId?: string;
}

// --- Assessment Management (Assessment Plans) ---
// Recurrence rule for an AssessmentPlan. Replaces the per-skill
// assessmentFrequency/periodicInterval fields as the single source of truth.
export type AssessmentFrequency =
  | 'ONE_TIME'           // Assess once; never becomes due again
  | 'ANNUAL_FIXED_DATE'  // Every year on a specific month/day (fixedMonth/fixedDay)
  | 'ANYTIME_ANNUAL'     // Due once per calendar year, any time within the year
  | 'QUARTERLY'          // Every 3 months
  | 'MONTHLY'            // Every month
  | 'WEEKLY'             // Every 7 days
  | 'CERTIFICATE_BASED'; // Next due = expiry date of the latest approved evidence

export const ASSESSMENT_FREQUENCY_LABELS: Record<AssessmentFrequency, string> = {
  ONE_TIME: 'One Time (never recurs)',
  ANNUAL_FIXED_DATE: 'Annually on a fixed date',
  ANYTIME_ANNUAL: 'Any time within the year',
  QUARTERLY: 'Quarterly',
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  CERTIFICATE_BASED: 'Certificate-based (expires with certificate)'
};

// Which employees a plan applies to.
export type AssessmentAudience =
  | 'ALL'            // Every employee assigned the skill
  | 'FRESH_ONLY'     // Only OrgLevel === 'FR'
  | 'MANAGERS_ONLY'  // Only users flagged as managers
  | 'ORG_LEVELS'     // Specific org levels (audienceOrgLevels)
  | 'DEPARTMENTS';   // Specific departments (audienceDepartmentIds)

export const ASSESSMENT_AUDIENCE_LABELS: Record<AssessmentAudience, string> = {
  ALL: 'All employees',
  FRESH_ONLY: 'Fresh hires only',
  MANAGERS_ONLY: 'Managers only',
  ORG_LEVELS: 'Specific org levels',
  DEPARTMENTS: 'Specific departments'
};

export interface AssessmentPlan {
  id: string;
  name: string;
  description?: string;
  skillIds: string[];          // One or many skills covered by this plan
  method: AssessmentMethod;    // Assessment type used for these skills
  frequency: AssessmentFrequency;
  fixedMonth?: number;         // 1-12, when frequency === 'ANNUAL_FIXED_DATE'
  fixedDay?: number;           // 1-31, when frequency === 'ANNUAL_FIXED_DATE'
  audience: AssessmentAudience;
  audienceOrgLevels?: OrgLevel[];     // when audience === 'ORG_LEVELS'
  audienceDepartmentIds?: string[];   // when audience === 'DEPARTMENTS'
  annualAppraisalQuestions?: EvaluationQuestion[];  // when method === 'ANNUAL_APPRAISAL'
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

// --- Assessment Instruction ---
// Reusable "how to assess" definition: a single assessment method plus its
// prompt / external link / question banks. Skills reference one or many
// instructions via Skill.assessmentInstructionIds (a skill may be assessed by
// several methods). Replaces the per-skill assessmentMethod / assessmentQuestion
// / assessmentLink / *Questions fields.
export interface AssessmentInstruction {
  id: string;
  name: string;
  description?: string;
  method: AssessmentMethod;
  assessmentQuestion?: string;                  // Observation / evaluation prompt
  assessmentLink?: string;                      // External form link (WRITTEN_EXAM)
  evaluationQuestions?: EvaluationQuestion[];   // WRITTEN_EXAM internal test bank
  interviewQuestions?: EvaluationQuestion[];    // INTERVIEW question bank
  threeSixtyQuestions?: EvaluationQuestion[];   // 360° feedback bank
  annualAppraisalQuestions?: EvaluationQuestion[]; // ANNUAL_APPRAISAL checklist items
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export const ASSESSMENT_METHOD_LABELS: Record<AssessmentMethod, string> = {
  OJT_OBSERVATION: 'OJT Observation (On-the-Job)',
  WRITTEN_EXAM: 'Written Examination (External / Online)',
  PRACTICAL_DEMO: 'Practical Demonstration / Simulation',
  INTERVIEW: 'Interview & Technical Discussion',
  WORK_RECORD_REVIEW: 'Work Record / Case Study Review',
  THREE_SIXTY_EVALUATION: '360° Multi-Rater Evaluation',
  ANNUAL_APPRAISAL: 'Annual Appraisal (Weighted Checklist)'
};

export interface JobProfileSkill {
  skillId: string;
  requiredLevel: number; // 1-5
}

// --- Job Profile (one position = one profile) ---
// Each box/position in the org chart is its own job profile, scoped to a single
// org level and carrying one flat list of required skills for that position.
export interface JobProfile {
  id: string;
  title: string;
  description: string;
  isArchived?: boolean;
  departmentId: string;
  orgLevel: OrgLevel;                 // the position's single org level
  requiredSkills: JobProfileSkill[];  // flat list of skills required for this position
  code?: string; // Automatically generated professional identifier
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  location?: string;
}


export type DepartmentType = 'COMPANY' | 'EXECUTIVE' | 'SECTOR' | 'GENERAL' | 'DEPARTMENT' | 'SECTION' | 'POSITION';

export interface Department {
  id: string;
  name: string;
  code?: string; // Short searchable mnemonic identifier (e.g. HR-PERS, FIN-ACCT). Auto-generated.
  nameAr?: string; // Arabic name (shown under the English name in the org chart)
  projectId?: string; // Added link to project
  type?: DepartmentType; // New field for hierarchy level
  parentId?: string; // Support for hierarchical structure
  managerId?: string;
  behavioralSkillIds?: string[];
}

export interface Certificate {
  id: string;
  name: string;
  degree?: string;
  issuer: string;
  dateAchieved: string;
  expiryDate?: string;
  noExpiry?: boolean;
  renewalDate?: string;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
  renewalStatus?: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
  fileUrl?: string;
  fileName?: string;
  credentialId?: string;
  credentialUrl?: string;
  category?: 'PROFESSIONAL' | 'ACADEMIC' | 'TECHNICAL' | 'SAFETY' | 'LANGUAGE' | 'OTHER';
}

export interface TrainingCourse {
  id: string;
  title: string;
  provider: string;
  linkedSkillIds: string[];
  type: 'INTERNAL' | 'EXTERNAL' | 'OJT';
  link?: string;
}

export interface CareerHistoryEntry {
  id: string;
  jobProfileId: string;
  jobTitle: string;
  orgLevel: OrgLevel;
  departmentId: string;
  projectName?: string;
  startDate: string;
  endDate?: string;
  reason?: string; // e.g., 'PROMOTION', 'TRANSFER', 'NEW_HIRE'
}

export interface User {
  id: string;
  name: string;
  email: string;
  isArchived?: boolean;
  phone?: string;
  whatsapp?: string;
  role: Role;
  status: UserStatus; 
  departmentId: string;
  generalDepartmentId?: string;
  orgLevel?: OrgLevel; 
  jobProfileId?: string;
  managerId?: string; 
  avatarUrl?: string;
  certificates?: Certificate[];
  location?: string;
  projectName?: string;
  projectId?: string;
  employeeId?: number;
  careerHistory?: CareerHistoryEntry[];
}

export interface AssessmentCycle {
  id: string;
  name: string;
  startDate: string;
  dueDate: string;
  status: 'ACTIVE' | 'CLOSED';
}

export interface Assessment {
  id: string;
  raterId: string;
  subjectId: string;
  skillId: string;
  score: number; // 1-5
  comment: string;
  date: string;
  method: AssessmentMethod;
  // UPWARD = subordinate evaluating their own supervisor. Stored for the
  // record/display but intentionally excluded from the 360 weighted score
  // (getUserSkillScore counts only SELF/PEER/MANAGER); there is no defined
  // upward weight in the Self 10 / Peer 30 / Manager 60 model.
  type: 'SELF' | 'PEER' | 'MANAGER' | 'UPWARD' | 'WRITTEN_EXAM' | 'PRACTICAL_DEMO' | 'INTERVIEW' | 'WORK_RECORD_REVIEW';
  cycleId?: string;
  isArchived?: boolean;
  // Structured annual-appraisal answers (W1.2 / C.2). One boolean per checklist
  // question, in question order. Replaces the legacy `[APPRAISAL_DATA:...]`
  // string packed into `comment`; that format is still parsed at read-time for
  // legacy docs only. Present only on annual-appraisal records.
  appraisalAnswers?: boolean[];
}

export interface Nomination {
  id: string;
  nominatorId: string;
  subjectId: string;
  raterId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  date: string;
}

export interface TrainingRecommendation {
  skillId: string;
  skillName: string;
  gap: number;
  recommendation: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  targetDate: string;
  supervisorSignOff: boolean;
  courseId?: string;
}

export interface IndividualTrainingPlan {
  id: string;
  userId: string;
  recommendations: TrainingRecommendation[];
  generatedAt: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface ActivityLog {
  id: string;
  action: string;
  target: string;
  timestamp: string;
  // Audit-trail enrichment (ISO.1 — "who scored whom, when, before/after").
  // All optional so legacy logs and unattributed system events still parse.
  actorId?: string;
  actorName?: string;
  // Entity the action touched, e.g. 'assessment' | 'user' | 'jobProfile'.
  entity?: string;
  entityId?: string;
  // Human-readable before/after snapshot for tamper-evident competence records.
  before?: string;
  after?: string;
}

export interface Evidence {
  id: string;
  userId: string;
  skillId: string;
  fileUrl: string;
  fileName: string;
  notes: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  assignedScore?: number; // 1-5 grading assigned by Manager upon approval
  reviewerComment?: string;
  expiryDate?: string; // Used for CERTIFICATE_BASED frequency
}

export interface Notification {
  id: string;
  userId: string; // The user who receives the notification
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
  isRead: boolean;
  createdAt: string;
  actionLink?: string; // Optional link to navigate when clicked
}

export interface PromotionRequirement {
  skillId: string;
  skillName: string;
  currentScore: number;
  requiredScore: number;
  gap: number;
}

export interface CareerLevelProgress {
  level: OrgLevel;
  requirements: PromotionRequirement[];
  readinessStatus: 'READY_NOW' | 'READY_1_2_YEARS' | 'READY_3_5_YEARS' | 'DEVELOPMENT_NEEDED';
  isDefined: boolean; // True if the job profile has requirements for this level
}

export interface CareerProgressionPlan {
  userId: string;
  currentLevel: OrgLevel;
  roadmap: CareerLevelProgress[];
}
