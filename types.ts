export enum Role {
  ADMIN = 'ADMIN',
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER'
}

export type UserStatus = 'ACTIVE' | 'PENDING' | 'REJECTED';

// The 7 specific hierarchy levels requested
export type OrgLevel = 'GM' | 'GAM' | 'DM' | 'DH' | 'EX' | 'FP' | 'FR';

export const ORG_LEVEL_LABELS: Record<OrgLevel, string> = {
  'GM': 'General Manager',
  'GAM': 'General Assistant Manager',
  'DM': 'Department Manager',
  'DH': 'Department Head',
  'EX': 'Excellent Position',
  'FP': 'First Position',
  'FR': 'Fresh'
};

// Strict Hierarchy Order (Top to Bottom)
export const ORG_HIERARCHY_ORDER: OrgLevel[] = ['GM', 'GAM', 'DM', 'DH', 'EX', 'FP', 'FR'];

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
}

export interface Department {
  id: string;
  name: string;
  managerId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus; // New Field
  departmentId: string;
  orgLevel?: OrgLevel; // Position in the hierarchy
  jobProfileId?: string;
  managerId?: string; // Direct reporting line (can be inferred from structure or explicit)
  avatarUrl?: string;
}

export interface Assessment {
  id: string;
  raterId: string;
  subjectId: string;
  skillId: string;
  score: number; // 1-5
  comment: string;
  date: string;
  type: 'SELF' | 'PEER' | 'MANAGER';
}