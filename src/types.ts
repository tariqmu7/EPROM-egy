
export enum Role {
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
  CEO = 'CEO'
}

export type UserStatus = 'ACTIVE' | 'PENDING' | 'REJECTED';

// Skill.category is one of exactly these five buckets:
//  Technical   — everything tied to the core job / the actual work
//  Behavioral  — the human / personal-conduct dimension
//  Safety      — HSE / safety-critical competencies
//  Management  — leading, planning, supervising
//  Soft Skills — communication, interpersonal, etc.
export type SkillCategory = 'Technical' | 'Behavioral' | 'Safety' | 'Management' | 'Soft Skills';

export const SKILL_CATEGORIES: SkillCategory[] = ['Technical', 'Behavioral', 'Safety', 'Management', 'Soft Skills'];

// Normalize free-text / legacy category strings (Excel import, old seed values
// like 'Leadership' or 'Business / Commercial') to a canonical SkillCategory.
// Anything not recognised as behavioral/safety/management/soft is treated as
// Technical (core-job work, which includes business/commercial domain skills).
export function normalizeSkillCategory(raw?: string | null): SkillCategory {
  const v = (raw || '').trim().toLowerCase();
  if (v.startsWith('behav')) return 'Behavioral';
  if (v.startsWith('saf') || v.includes('hse')) return 'Safety';
  if (v.startsWith('manage') || v.startsWith('lead')) return 'Management';
  if (v.startsWith('soft')) return 'Soft Skills';
  return 'Technical';
}

// Org Hierarchy tiers
export type OrgLevel = 'CEO' | 'ACEO' | 'GM' | 'AGM' | 'DM' | 'SH' | 'SP' | 'JP' | 'FR';

export const ORG_LEVEL_LABELS: Record<OrgLevel, string> = {
  'CEO': 'Chief Executive Officer',
  'ACEO': 'Assistant to Company President',
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
  'ACEO': 1,
  'GM': 2,
  'AGM': 3,
  'DM': 4,
  'SH': 5,
  'SP': 6,
  'JP': 7,
  'FR': 8
};

// Strict Hierarchy Order (Top to Bottom)
export const ORG_HIERARCHY_ORDER: OrgLevel[] = ['CEO', 'ACEO', 'GM', 'AGM', 'DM', 'SH', 'SP', 'JP', 'FR'];

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
  category: SkillCategory;
  isArchived?: boolean;
  levels: Record<number, SkillLevel>;
  status?: 'APPROVED' | 'PENDING';
  // How AND when this skill is assessed lives inline on the skill. Each block
  // pairs an assessment method (with its prompt / link / question bank) with a
  // recurrence schedule and target audience. A skill may carry several blocks
  // (multi-method assessment). Configured from the Competency Standard form.
  assessmentMethods?: SkillAssessmentMethod[];
  // @deprecated Superseded by Skill.assessmentMethods. Kept optional so legacy
  // Firestore docs still parse and feed the one-time migration into
  // assessmentMethods; no longer written by the Skill form.
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

// --- Per-skill assessment method (inline on Skill.assessmentMethods) ---
// One assessment method for a skill: HOW it is assessed (method + prompt /
// link / question bank) plus WHEN (recurrence) and WHO (audience). Replaces the
// separate AssessmentInstruction (how) and AssessmentPlan (when) entities — a
// skill now owns its full assessment definition. A skill may carry several.
export interface SkillAssessmentMethod {
  id: string;
  method: AssessmentMethod;
  // --- HOW ---
  assessmentQuestion?: string;        // Observation / evaluation prompt
  assessmentLink?: string;            // External exam form OR interview meeting link
  questions?: EvaluationQuestion[];   // Question / checklist bank for this method
  // --- STANDARD (per-method controls; see ASSESSMENT_METHODOLOGY.md) ---
  // WRITTEN_EXAM: pass mark, duration and number of items drawn. The pass mark
  // here is the skill-wide default; a job profile may override it per skill via
  // JobProfileSkill.passingScorePercent. Target proficiency (pass level) is not
  // stored here — it is owned per profile by JobProfileSkill.requiredLevel.
  passingScorePercent?: number;       // 0-100
  timeLimitMinutes?: number;
  questionCount?: number;
  // OJT_OBSERVATION / THREE_SIXTY_EVALUATION: 360° rater blend (percentages
  // summing to 100). Drives the weighted average in getUserSkillScore; when
  // unset, DEFAULT_RATER_WEIGHTS is used (back-compat with the old hardcoding).
  raterWeights?: RaterWeights;
  // INTERVIEW / PRACTICAL_DEMO / THREE_SIXTY_EVALUATION: who conducts it.
  assessorRole?: AssessorRole;
  // WORK_RECORD_REVIEW: evidence validity window and minimum approved records.
  evidenceValidityMonths?: number;
  minEvidenceCount?: number;
  // --- WHEN (recurrence) ---
  frequency: AssessmentFrequency;
  fixedMonth?: number;                // 1-12, when frequency === 'ANNUAL_FIXED_DATE'
  fixedDay?: number;                  // 1-31, when frequency === 'ANNUAL_FIXED_DATE'
  // --- WHO (audience) ---
  audience: AssessmentAudience;
  audienceOrgLevels?: OrgLevel[];     // when audience === 'ORG_LEVELS'
  audienceDepartmentIds?: string[];   // when audience === 'DEPARTMENTS'
}

// 360° multi-rater blend (percentages; should sum to 100). Per BARS / 360°
// methodology the weighting is a configurable policy choice, not a constant.
export interface RaterWeights {
  self: number;
  peer: number;
  manager: number;
}

export const DEFAULT_RATER_WEIGHTS: RaterWeights = { self: 10, peer: 30, manager: 60 };

// Who is accountable for conducting a method (ISO 10667 traceability of assessor).
export type AssessorRole =
  | 'DIRECT_MANAGER'
  | 'SECTION_HEAD'
  | 'DEPARTMENT_MANAGER'
  | 'EXTERNAL'
  | 'COMMITTEE';

export const ASSESSOR_ROLE_LABELS: Record<AssessorRole, string> = {
  DIRECT_MANAGER: 'Direct Manager',
  SECTION_HEAD: 'Section Head',
  DEPARTMENT_MANAGER: 'Department Manager',
  EXTERNAL: 'External Assessor',
  COMMITTEE: 'Assessment Committee'
};

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

// @deprecated Scheduling is now inline on Skill.assessmentMethods. Retained for
// legacy Firestore parsing + the one-time migration, and for the company-wide
// ANNUAL_APPRAISAL config still read by the Behavioral Assessment page.
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
// @deprecated The "how to assess" definition is now inline on
// Skill.assessmentMethods. Retained only for legacy Firestore parsing + the
// one-time migration into assessmentMethods.
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
  requiredLevel: number; // 1-5 — the Target Proficiency / Pass Level for this skill in this profile
  // Optional exam pass-mark (0-100) for this skill in this profile. When unset,
  // falls back to the skill's own WRITTEN_EXAM passingScorePercent default.
  passingScorePercent?: number;
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


export type DepartmentType = 'COMPANY' | 'EXECUTIVE' | 'SECTOR' | 'GENERAL' | 'ASSISTANT_GENERAL' | 'DEPARTMENT' | 'SECTION' | 'POSITION';

// Structural node type → org level. The single source for the org level a unit
// box implies (a profile's orgLevel is validated against this, never inferred
// from the node's name or who it reports to). `null` = no fixed level:
//   COMPANY = root wrapper; POSITION = personal-capacity/titled post resolved
//   from its title (مدير عام→GM, مدير عام مساعد→AGM, project/dept manager→DM).
// SECTION (Section Head) is the deepest *unit* level; below it are individual
// positions (SP/JP/FR) attached to a unit, not their own org-chart boxes.
export const DEPT_TYPE_TO_ORG_LEVEL: Record<DepartmentType, OrgLevel | null> = {
  'COMPANY': null,
  'EXECUTIVE': 'CEO',
  'SECTOR': 'ACEO',
  'GENERAL': 'GM',
  'ASSISTANT_GENERAL': 'AGM',
  'DEPARTMENT': 'DM',
  'SECTION': 'SH',
  'POSITION': null,
};

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
  // Per-question interview ratings. When an INTERVIEW / PRACTICAL_DEMO skill has
  // predefined Evaluation Guide questions, the interviewer rates each one (1-5)
  // and the record's `score` is the (weight-aware) average of these. Present
  // only on interview records that were scored question-by-question.
  questionScores?: { questionId: string; score: number }[];
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
