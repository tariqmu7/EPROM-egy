
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
  assessmentQuestion?: string;
  levels: Record<number, SkillLevel>; 
  status?: 'APPROVED' | 'PENDING';
  assessmentMethod: 'OJT_OBSERVATION' | 'WRITTEN_EXAM' | 'PRACTICAL_DEMO' | 'INTERVIEW' | 'WORK_RECORD_REVIEW';
  assessmentLink?: string; // Used specifically for WRITTEN_EXAM to link to external forms
  description?: string; // Optional detailed description of the skill or assessment
  code?: string; // Automatically generated professional identifier
  requiresCertificate?: boolean; // True if the skill needs external validation
}

export type AssessmentMethod = 'WRITTEN_EXAM' | 'PRACTICAL_DEMO' | 'OJT_OBSERVATION' | 'INTERVIEW' | 'WORK_RECORD_REVIEW';

export interface ScheduledAssessment {
  id: string;
  userId: string;
  skillId: string;
  method: AssessmentMethod;
  scheduledDate: string;
  status: 'UPCOMING' | 'OVERDUE' | 'COMPLETED';
  assessorId?: string;
}

export interface JobProfileSkill {
  skillId: string;
  requiredLevel: number; // 1-5
}

export interface JobProfile {
  id: string;
  title: string;
  description: string;
  departmentId: string;
  // Requirements mapped by OrgLevel (e.g., 'FR' -> skills for freshers)
  requirements: Partial<Record<OrgLevel, JobProfileSkill[]>>;
  code?: string; // Automatically generated professional identifier
}

export type DepartmentType = 'GENERAL' | 'DEPARTMENT' | 'SECTION';

export interface Department {
  id: string;
  name: string;
  type?: DepartmentType; // New field for hierarchy level
  parentId?: string; // Support for hierarchical structure
  managerId?: string;
  behavioralSkillIds?: string[];
}

export interface Certificate {
  id: string;
  name: string;
  issuer: string;
  dateAchieved: string;
  expiryDate?: string;
  renewalStatus?: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED';
}

export interface TrainingCourse {
  id: string;
  title: string;
  provider: string;
  linkedSkillIds: string[];
  type: 'INTERNAL' | 'EXTERNAL' | 'OJT';
  link?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  role: Role;
  status: UserStatus; // New Field
  departmentId: string;
  generalDepartmentId?: string; // Top-level General Department
  orgLevel?: OrgLevel; // Position in the hierarchy
  jobProfileId?: string;
  managerId?: string; // Direct reporting line (can be inferred from structure or explicit)
  avatarUrl?: string;
  certificates?: Certificate[];
  location?: string;
  projectName?: string;
  employeeId?: number;
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
  type: 'SELF' | 'PEER' | 'MANAGER' | 'WRITTEN_EXAM' | 'PRACTICAL_DEMO' | 'INTERVIEW' | 'WORK_RECORD_REVIEW';
  cycleId?: string;
  isArchived?: boolean;
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
