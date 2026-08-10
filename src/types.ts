
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

// ─── Skill criticality — how much a gap on this skill MATTERS ───────────────
// Until this existed every gap weighed the same: a missing permit-to-work
// competence ranked beside a missing spreadsheet shortcut, purely on head
// count. Criticality is the business judgement the maths cannot derive — set
// once on the skill, applied everywhere a gap is ranked (TNA priority, the
// individual plan) so a training budget is spent worst-first, not first-first.
//
// The weight is a MULTIPLIER on the gap, not a score of its own. Keep this
// table in lockstep with server/src/domain/enums.ts — the server ranks the
// same rows and the two must never disagree.
export const SKILL_CRITICALITIES = ['SAFETY_CRITICAL', 'HIGH', 'STANDARD', 'LOW'] as const;
export type SkillCriticality = typeof SKILL_CRITICALITIES[number];

export const SKILL_CRITICALITY_LABELS: Record<SkillCriticality, string> = {
  SAFETY_CRITICAL: 'Safety critical',
  HIGH: 'Business critical',
  STANDARD: 'Standard',
  LOW: 'Nice to have',
};

export const SKILL_CRITICALITY_DESCRIPTIONS: Record<SkillCriticality, string> = {
  SAFETY_CRITICAL: 'A gap here can hurt somebody or breach a legal/HSE requirement. Always trained first.',
  HIGH: 'A gap here stops the work, damages plant or costs the company money.',
  STANDARD: 'Normal competence for the position — the default for every skill.',
  LOW: 'Useful but the job is done without it. Trained when there is budget left.',
};

export const SKILL_CRITICALITY_WEIGHTS: Record<SkillCriticality, number> = {
  SAFETY_CRITICAL: 3,
  HIGH: 2,
  STANDARD: 1,
  LOW: 0.5,
};

/** Every skill written before criticality existed reads as STANDARD — a legacy
 *  skill must never silently rank above or below one an admin has judged. */
export const DEFAULT_SKILL_CRITICALITY: SkillCriticality = 'STANDARD';

export const skillCriticalityOf = (value?: string | null): SkillCriticality =>
  (SKILL_CRITICALITIES as readonly string[]).includes(value ?? '')
    ? (value as SkillCriticality)
    : DEFAULT_SKILL_CRITICALITY;

export const skillCriticalityWeight = (value?: string | null): number =>
  SKILL_CRITICALITY_WEIGHTS[skillCriticalityOf(value)];

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  isArchived?: boolean;
  // How much a gap on this skill matters. Absent ⇒ STANDARD (see
  // DEFAULT_SKILL_CRITICALITY) — it weights every gap ranking, it is not a
  // filter, and it never changes a score.
  criticality?: SkillCriticality;
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

// The training catalogue: the "cure" side of the engine. A gap names a skill;
// a course linked to that skill is what the ITP/TNA can actually recommend.
// Managed by admins at /admin/courses (see pages/TrainingCatalogue.tsx).
export interface TrainingCourse {
  id: string;
  title: string;
  provider: string;
  linkedSkillIds: string[];
  type: 'INTERNAL' | 'EXTERNAL' | 'OJT';
  link?: string;
  /** Short human reference, e.g. TRN-SAF-01. Auto-generated when left blank. */
  code?: string;
  description?: string;
  /** Classroom/contact hours — feeds effort estimates on a training plan. */
  durationHours?: number;
  /** Cost of ONE seat, in EGP. `gapCount × cost` is the budget line. */
  costPerSeat?: number;
  /** Proficiency level (1-5) a delegate is expected to reach on completion. */
  targetLevel?: number;
  /** Soft delete — an archived course is hidden from recommendations. */
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const TRAINING_COURSE_TYPES = ['INTERNAL', 'EXTERNAL', 'OJT'] as const;

export const TRAINING_COURSE_TYPE_LABELS: Record<TrainingCourse['type'], string> = {
  INTERNAL: 'Internal',
  EXTERNAL: 'External',
  OJT: 'On-the-Job',
};

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

// ─── Work Experience (employment OUTSIDE the company) ───────────────────────
// Employee-submitted, manager-verified. Distinct from CareerHistoryEntry above,
// which records INTERNAL movement only (it is keyed to a real jobProfileId +
// departmentId and so cannot represent a prior employer).
//
// Only a VERIFIED record influences competency, and then only as a capped
// PROVISIONAL baseline — see getUserSkillScore in services/store.ts. It never
// outranks a real assessment or scored evidence.
//
// Deliberately NOT a field on User: verifying an embedded array would mean
// writing the user document, and the server's usersPolicy lets any SH-or-above
// update any user — far too broad for a scoring input. It lives in its own
// `workExperiences` collection with owner/manager scoping, like `evidences`.
export type WorkExperienceStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export const WORK_EXPERIENCE_STATUS_LABELS: Record<WorkExperienceStatus, string> = {
  PENDING: 'Awaiting Verification',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export type EmploymentType =
  | 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'SECONDMENT' | 'CONSULTANT' | 'INTERNSHIP';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  SECONDMENT: 'Secondment',
  CONSULTANT: 'Consultant',
  INTERNSHIP: 'Internship',
};

/** One skill tagged on a work-experience entry. */
export interface WorkExperienceSkill {
  skillId: string;
  claimedLevel: number;      // 1-5, the employee's own claim
  yearsApplied: number;      // years this skill was applied in THIS role
  suggestedLevel?: number;   // stamped from the band table at submit time (audit trail)
  verifiedLevel?: number;    // 1-5, the verifier's final call. Set only when VERIFIED.
}

export interface WorkExperience {
  id: string;
  userId: string;            // canonical User.id (owner)
  employer: string;
  jobTitle: string;
  employmentType?: EmploymentType;
  location?: string;
  startDate: string;         // ISO yyyy-mm-dd
  endDate?: string;          // absent => still there (see isCurrent)
  isCurrent?: boolean;
  responsibilities?: string;
  skills: WorkExperienceSkill[];
  status: WorkExperienceStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewerComment?: string;
  fileUrl?: string;          // optional supporting document (base64 data URL, as Evidence)
  fileName?: string;
}

/** One years→level band. `maxYears` is omitted on the open-ended top band. */
export interface ExperienceLevelBand {
  minYears: number;          // inclusive
  maxYears?: number;         // exclusive
  level: number;             // 1-5
}

/** Admin-configurable policy governing the experience→competency translation. */
export interface WorkExperiencePolicy {
  bands: ExperienceLevelBand[];  // ascending, non-overlapping
  maxProvisionalLevel: number;   // hard ceiling on any experience-derived score
  enabled: boolean;              // master switch
}

/**
 * Where a user's skill score came from. Drives the "Provisional" badge and lets
 * callers treat an unverified experience-derived score differently from a
 * measured one (the assessment queue does exactly that).
 */
export type SkillScoreSource = 'ASSESSMENT' | 'EVIDENCE' | 'EXPERIENCE' | 'NONE';

export const SKILL_SCORE_SOURCE_LABELS: Record<SkillScoreSource, string> = {
  ASSESSMENT: 'Assessed',
  EVIDENCE: 'Evidence-based',
  EXPERIENCE: 'Provisional — from experience',
  NONE: 'Not yet assessed',
};

/**
 * MEASURED vs UNKNOWN.
 *
 * A skill that was never assessed scores 0, which on its own is
 * indistinguishable from "measured and failed". Coverage separates the two so
 * no percentage in the app can silently pass off silence as failure:
 *
 *   required = measured + provisional + unknown
 *
 *  - `measured`    — a real record exists (ASSESSMENT or EVIDENCE)
 *  - `provisional` — credited from VERIFIED work experience only (EXPERIENCE);
 *                    counts as a score everywhere, but is NOT a measurement
 *  - `unknown`     — nothing at all (NONE); the score of 0 means nothing
 *
 * Compliance/gap figures are computed over the KNOWN skills only
 * (`measured + provisional`); `compliancePct` is **null** when nothing is
 * known, which every caller must render as "—" rather than 0%.
 */
export interface CompetencyCoverage {
  required: number;
  measured: number;
  provisional: number;
  unknown: number;
  known: number;                 // measured + provisional
  measuredPct: number;           // measured / required (0 when nothing required)
  knownPct: number;              // known / required
  compliantKnown: number;        // known skills at or above the required level
  gapsKnown: number;             // known skills below the required level
  compliancePct: number | null;  // over KNOWN only; null ⇒ nothing measured yet
  totalGap: number;              // summed gap over known skills only
  avgGap: number | null;
}

/**
 * One stored monthly reading of a scope's competency position — the system's
 * only memory of its own numbers (server table `competency_snapshots`, written
 * by the nightly job, migration 008).
 *
 * The coverage fields are the SAME split as CompetencyCoverage above, computed
 * server-side by the port of computeSkillScore, so a point on the trend chart
 * and the live figure on any page are the same measure. `compliancePct` and
 * `avgGap` stay NULLABLE end to end — a month in which nothing was measured has
 * no percentage, and must never be plotted as 0.
 */
export interface CompetencySnapshot {
  period: string;                // 'YYYY-MM'
  scopeType: 'COMPANY' | 'DEPARTMENT';
  scopeId: string;               // '*' for the whole company
  scopeName: string | null;      // the unit's name AS AT that month
  takenAt: string;
  headcount: number;
  withRequirements: number;
  required: number;
  measured: number;
  provisional: number;
  unknown: number;
  compliantKnown: number;
  gapsKnown: number;
  totalGap: number;
  measuredPct: number;
  compliancePct: number | null;
  avgGap: number | null;
  detail?: { topSkillGaps?: SnapshotSkillGap[] } | null;
}

export interface SnapshotSkillGap {
  skillId: string;
  skillName: string;
  gapCount: number;   // people below the required level (measured only)
  totalGap: number;
  unknown: number;    // people the skill was never measured on
}

/**
 * LIVE server-side aggregates (`/analytics/overview`, `/analytics/training-needs`).
 *
 * These carry the same coverage split as everything else, but they are computed
 * on the SERVER: the CEO dashboard and the TNA screen used to download the whole
 * company and recompute it in the browser, which does not survive 4,000
 * employees × ~60 skills. The maths is the port in `server/src/jobs/scoring.ts`
 * — the same one the monthly snapshot uses, so a live tile and a stored point
 * are the same measure.
 */
export interface OrgScopeRef {
  kind: 'COMPANY' | 'DEPARTMENT' | 'TEAM';
  id: string;       // '*' for the company, a department id, or a manager's id
  label: string;
}

export interface PersonCoverageRow {
  userId: string;
  name: string;
  departmentId?: string;
  orgLevel?: string;
  coverage: CompetencyCoverage;
}

export interface DepartmentCoverageRow {
  departmentId: string;
  name: string;
  parentId: string | null;
  headcount: number;      // rolled UP: the unit plus everything beneath it
  withRequirements: number;
  coverage: CompetencyCoverage;
}

/**
 * One skill's position across a whole scope — the "hotspot" row the analytics
 * screen ranks worst-first. Same judgement as a TrainingNeed row minus the
 * money, and ranked by the SAME key (`weightedGap` = summed gap × the skill's
 * criticality weight), so the worst skill on the analytics page and the top of
 * the training-needs table are always the same skill.
 *
 * `affectedPct` is null when nothing is known about the skill — a shortfall
 * nobody measured is assessment work, never a percentage.
 */
export interface OrgSkillGapRow {
  skillId: string;
  skillName: string;
  skillCategory?: string;
  employeesRequiring: number;
  measured: number;
  provisional: number;
  known: number;
  gapCount: number;
  totalGap: number;
  averageGap: number;
  unknown: number;
  affectedPct: number | null;
  criticality: SkillCriticality;
  criticalityWeight: number;
  weightedGap: number;
}

export interface OrgOverview {
  scope: OrgScopeRef;
  headcount: number;
  withRequirements: number;
  withoutProfile: number;
  coverage: CompetencyCoverage;
  departments: DepartmentCoverageRow[];
  people: PersonCoverageRow[];
  topSkillGaps: OrgSkillGapRow[];
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

// ─── Training Needs Analysis (group level) ──────────────────────────────────
// One row per skill, aggregated over a set of employees (a department and its
// sub-units, a manager's team, the whole company). Obeys the "no percentage
// without its base" rule: a never-assessed requirement is counted as UNKNOWN —
// it is an assessment need, never a training gap.
export interface TrainingNeed {
  skillId: string;
  skillName: string;
  skillCategory?: string;
  /** Head count whose position requires this skill. */
  employeesRequiring: number;
  /** Of those, how many have a real measurement (assessment/evidence). */
  measured: number;
  /** Credited provisionally from verified work experience. */
  provisional: number;
  /** Never assessed at all — needs measuring before it can be budgeted. */
  unknown: number;
  /** measured + provisional. Gap figures below are over these people only. */
  known: number;
  /** Known people scoring below the required level — the trainable head count. */
  gapCount: number;
  /** Summed gap (levels) over the known people. */
  totalGap: number;
  /** totalGap / gapCount — how deep the gap is for those who have one. */
  averageGap: number;
  /** totalGap / known — the unit's average shortfall on this skill. */
  averageGapKnown: number;
  /** Highest required level asked of anyone in scope (drives course level). */
  maxRequiredLevel: number;
  /** Share of the KNOWN people who have a gap; null when nothing is known. */
  affectedPct: number | null;
  /** The skill's business criticality (STANDARD when the admin never set one). */
  criticality: SkillCriticality;
  /** The multiplier that criticality applies — see SKILL_CRITICALITY_WEIGHTS. */
  criticalityWeight: number;
  /** totalGap × criticalityWeight. The ranking number: head count × depth ×
   *  how much it matters. This is what the list is sorted by. */
  weightedGap: number;
  /** 0-300ish urgency = how many of the measured fall short × how deep ×
   *  criticality. NULL when nothing is known — silence never ranks. */
  priorityScore: number | null;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  /** Cheapest priced course linked to this skill; null when none is priced. */
  seatCost: number | null;
  /** seatCost × gapCount — the line item. Null when the skill is not costed. */
  estimatedCost: number | null;
  /** Training hours implied by that same course × gapCount; null if unknown. */
  estimatedHours: number | null;
  /** Courses in the catalogue linked to this skill (may be empty — task 3). */
  courses: { id: string; title: string; provider: string; costPerSeat?: number; durationHours?: number }[];
}

/**
 * What the rows add up to in money. Obeys the same rule as every percentage in
 * this system: a total is never presented as complete when part of its base is
 * missing — `skillsUncosted` / `seatsUncosted` say how much of the bill nobody
 * can price yet because no linked course carries a cost.
 */
export interface TrainingBudgetEstimate {
  /** Skills with a gap AND a priced course behind them. */
  skillsCosted: number;
  /** Skills with a gap and no priced course — the bill is incomplete by these. */
  skillsUncosted: number;
  seatsCosted: number;
  seatsUncosted: number;
  /** Sum of the costed line items; null when nothing at all could be priced. */
  estimatedCost: number | null;
  estimatedHours: number | null;
}

export interface TrainingNeedsAnalysis {
  /** Which unit these figures are for (set by the server endpoint). */
  scope?: OrgScopeRef;
  /** Employees in scope (active, non-archived). */
  headcount: number;
  /** Of those, how many have a job profile with requirements to measure. */
  withRequirements: number;
  /** Pooled measured/unknown split across the whole scope. */
  coverage: CompetencyCoverage;
  /** What the gaps cost, as far as the catalogue can price them. */
  budget: TrainingBudgetEstimate;
  /** Skills that need action, worst first (by weighted gap). */
  needs: TrainingNeed[];
}

export interface IndividualTrainingPlan {
  id: string;
  userId: string;
  recommendations: TrainingRecommendation[];
  generatedAt: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

// ─── Development plan (the SAVED individual training plan) ──────────────────
// `IndividualTrainingPlan` above is a live PROPOSAL: it is recomputed on every
// page load and never stored, so it can answer "what should this person do"
// but never "what did we agree, did it happen, and did it move the score".
// A `DevelopmentPlan` is that agreement written down — the gap FROZEN as it was
// at planning time, a status and target date per item, a manager sign-off, and
// the level measured again at sign-off so the effect of the training is
// provable rather than asserted.
export const DEVELOPMENT_PLAN_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;
export type DevelopmentPlanStatus = typeof DEVELOPMENT_PLAN_STATUSES[number];

export const DEVELOPMENT_ITEM_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type DevelopmentItemStatus = typeof DEVELOPMENT_ITEM_STATUSES[number];

export const DEVELOPMENT_PLAN_STATUS_LABELS: Record<DevelopmentPlanStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const DEVELOPMENT_ITEM_STATUS_LABELS: Record<DevelopmentItemStatus, string> = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export interface DevelopmentPlanItem {
  id: string;
  skillId: string;
  /** Denormalised so a closed plan still reads correctly if the skill is renamed/deleted. */
  skillName: string;
  requiredLevel: number;
  /** The score when the plan was written. FROZEN — the "before" half. */
  levelAtPlanning: number;
  /** requiredLevel − levelAtPlanning, as it stood at planning time. */
  gapAtPlanning: number;
  /** How that level was known. 'EXPERIENCE' = provisional, 'NONE' = never assessed. */
  sourceAtPlanning?: SkillScoreSource;
  recommendation: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  courseId?: string;
  courseTitle?: string;
  status: DevelopmentItemStatus;
  targetDate: string;
  startedAt?: string;
  completedAt?: string;
  /** What the employee actually did, in their words. */
  completionNote?: string;
  supervisorSignOff: boolean;
  signedOffBy?: string;
  signedOffAt?: string;
  signOffComment?: string;
  /** The score re-read at sign-off — the "after" half of before/after. */
  levelAtSignOff?: number;
}

export interface DevelopmentPlan {
  id: string;
  userId: string;
  title: string;
  status: DevelopmentPlanStatus;
  items: DevelopmentPlanItem[];
  /** The position the plan was written against — requirements can change later. */
  jobProfileId?: string;
  createdAt: string;
  /** User id of whoever created it (the employee, their manager, or an admin). */
  createdBy: string;
  updatedAt: string;
  activatedAt?: string;
  completedAt?: string;
  archivedAt?: string;
  /**
   * Coverage at planning time. Recorded so a plan built from a half-assessed
   * profile can never be read later as if it covered the whole position —
   * "no percentage without its base" applies to history too.
   */
  coverageAtPlanning?: {
    required: number;
    measured: number;
    provisional: number;
    unknown: number;
  };
  notes?: string;
}

/** A plan item with today's score joined back on — computed, never stored. */
export interface DevelopmentPlanItemProgress extends DevelopmentPlanItem {
  currentLevel: number;
  currentSource: SkillScoreSource;
  /** currentLevel − levelAtPlanning. Can be negative (a later re-assessment fell). */
  improvement: number;
  /** True once the current level reaches the level the plan targeted. */
  metRequirement: boolean;
  /** Past its target date and still open. */
  isOverdue: boolean;
}

export interface DevelopmentPlanProgress {
  plan: DevelopmentPlan;
  items: DevelopmentPlanItemProgress[];
  total: number;
  notStarted: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  signedOff: number;
  overdue: number;
  /** Completed share of the items still in play; null when there are none. */
  completedPct: number | null;
  /** Items whose level rose since planning — the visible effect of the plan. */
  improved: number;
  /** Levels gained in total across the plan's skills. */
  levelsGained: number;
  /** Items now at or above the level the plan targeted. */
  requirementsMet: number;
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
  /**
   * Set only by the server's nightly sweep (server/src/jobs/nightly.ts). It
   * embeds the subject AND the period — `assess:<userId>:2026-08`,
   * `cert:<userId>:<certId>:30`, `team:<managerId>:2026-W32` — and the job
   * refuses to write a key it has already used. That is what stops a job which
   * runs every night from saying the same thing every night. Nothing in the UI
   * reads it.
   */
  sourceKey?: string;
}

export interface PromotionRequirement {
  skillId: string;
  skillName: string;
  currentScore: number;
  requiredScore: number;
  gap: number;
  /** false ⇒ never assessed: `currentScore` is a placeholder 0, not a result. */
  isMeasured: boolean;
}

export interface CareerLevelProgress {
  level: OrgLevel;
  requirements: PromotionRequirement[];
  readinessStatus: 'READY_NOW' | 'READY_1_2_YEARS' | 'READY_3_5_YEARS' | 'DEVELOPMENT_NEEDED';
  isDefined: boolean; // True if the job profile has requirements for this level
  /**
   * Requirements never assessed. Readiness is judged on the measured ones only,
   * and READY_NOW is withheld while any of these remain — you cannot be proven
   * ready on a skill nobody has looked at.
   */
  unmeasuredCount: number;
}

export interface CareerProgressionPlan {
  userId: string;
  currentLevel: OrgLevel;
  roadmap: CareerLevelProgress[];
}
