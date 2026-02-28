import { User, Role, JobProfile, Skill, Department, Assessment, ActivityLog, ORG_HIERARCHY_ORDER } from '../types';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ==========================================
// 🔧 APP CONFIGURATION
// ==========================================
export const CONFIG = {
  // 1. CHOOSE YOUR DATA SOURCE: 'MOCK' | 'SUPABASE'
  // Change this to 'SUPABASE' to use the real backend.
  SOURCE: 'MOCK', 

  // 2. SUPABASE CONFIGURATION
  // Get these from your Supabase Project Settings -> API
  SUPABASE: {
    url: "https://your-project.supabase.co", // Replace with your actual Supabase URL
    key: "your-public-anon-key" // Replace with your actual Supabase Key
  }
};

// ==========================================
// 📦 MOCK DATA (Egypt Oil & Gas Context)
// ==========================================

const MOCK_SKILLS: Skill[] = [
  {
    id: 's_hse_01',
    name: 'Permit to Work (PTW) - ISSOW',
    category: 'Safety',
    assessmentQuestion: 'Does the employee correctly apply the Integrated Safe System of Work (ISSOW) standards for Cold, Hot, and Confined Space permits?',
    levels: {
      1: { level: 1, description: 'Can identify permit types but requires supervision to complete forms.', requiredCertificates: ['HSE Induction'] },
      2: { level: 2, description: 'Prepares permits correctly for standard low-risk activities.', requiredCertificates: ['PTW Level 1'] },
      3: { level: 3, description: 'Authorized Permit Applicant; identifies isolations and gas test requirements.', requiredCertificates: ['PTW Applicant License'] },
      4: { level: 4, description: 'Permit Holder/Issuer; authorizes work and audits compliance.', requiredCertificates: ['Authorized Gas Tester (AGT)'] },
      5: { level: 5, description: 'Site Authority; manages simultaneous operations (SIMOPS) and emergency suspensions.', requiredCertificates: ['Site Controller Cert'] },
    }
  },
  {
    id: 's_tech_01',
    name: 'Gas Dehydration (TEG Unit)',
    category: 'Technical',
    assessmentQuestion: 'Can the employee operate and troubleshoot the Tri-Ethylene Glycol (TEG) dehydration unit to meet dew point specs?',
    levels: {
      1: { level: 1, description: 'Identifies main components (Contactor, Reboiler, Flash Tank).', requiredCertificates: [] },
      2: { level: 2, description: 'Monitors key parameters (Temp, Pressure, Glycol Level) and logs data.', requiredCertificates: ['Field Operator I'] },
      3: { level: 3, description: 'Adjusts circulation rates and reboiler temperature to maintain spec.', requiredCertificates: ['Gas Processing Basics'] },
      4: { level: 4, description: 'Troubleshoots foaming, glycol losses, and pump failures.', requiredCertificates: ['Advanced Gas Conditioning'] },
      5: { level: 5, description: 'Optimizes unit efficiency and leads turnaround maintenance planning.', requiredCertificates: ['Process Specialist'] },
    }
  },
  {
    id: 's_maint_01',
    name: 'Centrifugal Compressor Maintenance',
    category: 'Technical',
    assessmentQuestion: 'Demonstrates proficiency in maintaining and overhauling centrifugal compressors (e.g., Nuovo Pignone, Siemens).',
    levels: {
      1: { level: 1, description: 'Assists in basic preventive maintenance (lube oil checks, filter changes).', requiredCertificates: [] },
      2: { level: 2, description: 'Performs seal gas panel inspections and vibration readings.', requiredCertificates: ['Level 1 Vibration'] },
      3: { level: 3, description: 'Executes dry gas seal replacement and coupling alignment.', requiredCertificates: ['Rotating Eq. Specialist'] },
      4: { level: 4, description: 'Leads major overhaul; diagnoses complex surge/stonewall issues.', requiredCertificates: ['OEM Certified Expert'] },
      5: { level: 5, description: 'Develops reliability strategies and RCM studies for critical compressors.', requiredCertificates: ['CMRP'] },
    }
  },
  {
    id: 's_mgt_01',
    name: 'Emergency Crisis Management',
    category: 'Management',
    assessmentQuestion: 'Ability to lead and coordinate response during major incidents (Fire, Gas Leak, Medical Evac).',
    levels: {
      1: { level: 1, description: 'Follows muster procedures and reports status.', requiredCertificates: [] },
      2: { level: 2, description: 'Acts as Fire Warden or First Aider for the area.', requiredCertificates: ['First Aid', 'Fire Warden'] },
      3: { level: 3, description: 'On-Scene Commander; directs local response team.', requiredCertificates: ['Incident Command System (ICS-100)'] },
      4: { level: 4, description: 'Emergency Manager; coordinates with external authorities and HQ.', requiredCertificates: ['Major Emergency Management (MEM)'] },
      5: { level: 5, description: 'Crisis Director; manages reputation, legal, and business continuity.', requiredCertificates: ['Crisis Leadership'] },
    }
  },
  {
    id: 's_tech_02',
    name: 'DCS Operation (Honeywell/Yokogawa)',
    category: 'Technical',
    assessmentQuestion: 'Proficiency in operating the Distributed Control System for plant stability and alarm management.',
    levels: {
      1: { level: 1, description: 'Navigates HMI screens and identifies tag locations.', requiredCertificates: [] },
      2: { level: 2, description: 'Makes basic setpoint changes and acknowledges alarms.', requiredCertificates: ['DCS Basics'] },
      3: { level: 3, description: 'Manages unit startup/shutdown and PID loop tuning.', requiredCertificates: ['Advanced Process Control'] },
      4: { level: 4, description: 'Handles plant upsets and performs rationalization of alarm floods.', requiredCertificates: ['Alarm Management'] },
      5: { level: 5, description: 'Configures logic changes and optimizes control strategies.', requiredCertificates: ['DCS Engineering'] },
    }
  },
  {
    id: 's_mech_01',
    name: 'Centrifugal Pump Maintenance',
    category: 'Technical',
    assessmentQuestion: 'Can the employee perform alignment, seal replacement, and troubleshooting on centrifugal pumps?',
    levels: {
      1: { level: 1, description: 'Identifies pump components and checks oil levels.', requiredCertificates: [] },
      2: { level: 2, description: 'Performs basic PMs and assists in seal changes.', requiredCertificates: ['Basic Mechanical Skills'] },
      3: { level: 3, description: 'Independently changes mechanical seals and bearings.', requiredCertificates: ['Pump Maintenance Level 2'] },
      4: { level: 4, description: 'Troubleshoots cavitation and vibration issues; performs laser alignment.', requiredCertificates: ['Laser Alignment Cert'] },
      5: { level: 5, description: 'Analyzes pump performance curves and re-rates pumps for new conditions.', requiredCertificates: ['Rotating Eq. Specialist'] },
    }
  },
  {
    id: 's_inst_01',
    name: 'Control Valve Calibration',
    category: 'Technical',
    assessmentQuestion: 'Demonstrates ability to calibrate, stroke test, and troubleshoot pneumatic and digital control valves.',
    levels: {
      1: { level: 1, description: 'Identifies valve types and basic accessories (positioner, regulator).', requiredCertificates: [] },
      2: { level: 2, description: 'Performs stroke checks and zero/span adjustments.', requiredCertificates: ['Instrumentation Basics'] },
      3: { level: 3, description: 'Calibrates smart positioners (Fisher/Samson) using HART communicators.', requiredCertificates: ['Control Valve Technician'] },
      4: { level: 4, description: 'Diagnoses stick-slip, hysteresis, and sizing issues.', requiredCertificates: ['Valve Diagnostics'] },
      5: { level: 5, description: 'Selects and sizes valves for severe service applications.', requiredCertificates: ['ISA Control Systems'] },
    }
  },
  {
    id: 's_proc_01',
    name: 'Process Simulation (HYSYS)',
    category: 'Technical',
    assessmentQuestion: 'Proficiency in using Aspen HYSYS for steady-state and dynamic process modeling.',
    levels: {
      1: { level: 1, description: 'Can open and view existing simulation files.', requiredCertificates: [] },
      2: { level: 2, description: 'Updates stream data and runs basic heat & material balance.', requiredCertificates: ['HYSYS Fundamentals'] },
      3: { level: 3, description: 'Builds unit operation models (Columns, Exchangers) from scratch.', requiredCertificates: ['Advanced HYSYS'] },
      4: { level: 4, description: 'Performs dynamic simulation for relief load and control studies.', requiredCertificates: ['Dynamic Simulation'] },
      5: { level: 5, description: 'Optimizes entire plant wide models for energy and yield.', requiredCertificates: ['Process Optimization Expert'] },
    }
  },
  {
    id: 's_gen_01',
    name: 'Root Cause Analysis (RCA)',
    category: 'Management',
    assessmentQuestion: 'Ability to lead investigations into failures using standard RCA methodologies (5 Whys, Fishbone, TapRooT).',
    levels: {
      1: { level: 1, description: 'Participates in RCA meetings as a team member.', requiredCertificates: [] },
      2: { level: 2, description: 'Collects data and evidence for investigations.', requiredCertificates: ['RCA Basics'] },
      3: { level: 3, description: 'Facilitates 5-Whys and Fishbone sessions for minor incidents.', requiredCertificates: ['RCA Facilitator'] },
      4: { level: 4, description: 'Leads complex investigations using TapRooT or Logic Tree.', requiredCertificates: ['Lead Investigator'] },
      5: { level: 5, description: 'Manages the defect elimination program and tracks systemic issues.', requiredCertificates: ['Reliability Leader'] },
    }
  }
];

const MOCK_DEPTS: Department[] = [
  { id: 'd_zohr', name: 'Zohr Field Operations (Port Said)' },
  { id: 'd_midor', name: 'MIDOR Refinery Maintenance (Alexandria)' },
  { id: 'd_hq_tech', name: 'Technical Support (Cairo HQ)' },
  { id: 'd_hse', name: 'QHSE Corporate' }
];

const MOCK_JOBS: JobProfile[] = [
  {
    id: 'j_dcs_op',
    title: 'Senior DCS Operator',
    description: 'Responsible for monitoring and controlling plant process parameters via DCS in Zohr Central Control Room.',
    departmentId: 'd_zohr',
    requirements: {
      'FP': [ // First Position (Senior Operator)
        { skillId: 's_tech_02', requiredLevel: 4 },
        { skillId: 's_tech_01', requiredLevel: 3 },
        { skillId: 's_hse_01', requiredLevel: 3 },
        { skillId: 's_gen_01', requiredLevel: 2 }, // RCA
      ],
      'FR': [ // Fresh (Junior Operator)
        { skillId: 's_tech_02', requiredLevel: 2 },
        { skillId: 's_tech_01', requiredLevel: 1 },
        { skillId: 's_hse_01', requiredLevel: 2 },
      ]
    }
  },
  {
    id: 'j_rot_eng',
    title: 'Rotating Equipment Engineer',
    description: 'Ensures reliability of pumps, compressors, and turbines at MIDOR Refinery.',
    departmentId: 'd_midor',
    requirements: {
      'DM': [ // Dept Manager
        { skillId: 's_maint_01', requiredLevel: 5 },
        { skillId: 's_mech_01', requiredLevel: 5 },
        { skillId: 's_mgt_01', requiredLevel: 4 },
        { skillId: 's_gen_01', requiredLevel: 5 },
      ],
      'EX': [ // Excellent Position (Senior Eng)
        { skillId: 's_maint_01', requiredLevel: 4 },
        { skillId: 's_mech_01', requiredLevel: 4 },
        { skillId: 's_hse_01', requiredLevel: 3 },
        { skillId: 's_gen_01', requiredLevel: 3 },
      ]
    }
  },
  {
    id: 'j_hse_sup',
    title: 'Site HSE Supervisor',
    description: 'Oversees field safety compliance and permit issuance.',
    departmentId: 'd_hse',
    requirements: {
      'DH': [ // Dept Head
        { skillId: 's_hse_01', requiredLevel: 5 },
        { skillId: 's_mgt_01', requiredLevel: 4 },
        { skillId: 's_gen_01', requiredLevel: 4 },
      ]
    }
  },
  {
    id: 'j_prod_eng',
    title: 'Production Engineer',
    description: 'Optimizes daily production targets and monitors well performance at Zohr.',
    departmentId: 'd_zohr',
    requirements: {
      'FP': [
        { skillId: 's_tech_01', requiredLevel: 4 },
        { skillId: 's_proc_01', requiredLevel: 3 }, // HYSYS
        { skillId: 's_hse_01', requiredLevel: 3 },
      ],
      'FR': [
        { skillId: 's_tech_01', requiredLevel: 2 },
        { skillId: 's_proc_01', requiredLevel: 1 },
      ]
    }
  },
  {
    id: 'j_inst_tech',
    title: 'Instrument Technician',
    description: 'Maintains field instrumentation and control valves.',
    departmentId: 'd_zohr',
    requirements: {
      'FP': [
        { skillId: 's_inst_01', requiredLevel: 4 }, // Valves
        { skillId: 's_hse_01', requiredLevel: 3 },
      ],
      'FR': [
        { skillId: 's_inst_01', requiredLevel: 2 },
        { skillId: 's_hse_01', requiredLevel: 2 },
      ]
    }
  }
];

const MOCK_USERS: User[] = [
  {
    id: 'u_admin',
    name: 'Eng. Tarek El-Molla',
    email: 'admin@egpc.com.eg',
    role: Role.ADMIN,
    status: 'ACTIVE',
    departmentId: 'd_hq_tech',
    orgLevel: 'GM',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Tarek'
  },
  {
    id: 'u_mgr_zohr',
    name: 'Eng. Khaled Mowafy',
    email: 'khaled.m@zohr.com.eg',
    role: Role.MANAGER,
    status: 'ACTIVE',
    departmentId: 'd_zohr',
    jobProfileId: 'j_dcs_op', // Technically manages them
    orgLevel: 'DM',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Khaled'
  },
  {
    id: 'u_emp_sarah',
    name: 'Eng. Sarah Ahmed',
    email: 'sarah.ahmed@midor.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_midor',
    managerId: 'u_mgr_zohr', // For demo purposes
    jobProfileId: 'j_rot_eng',
    orgLevel: 'EX',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Sarah'
  },
  {
    id: 'u_emp_ali',
    name: 'Tech. Ali Hassan',
    email: 'ali.hassan@zohr.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_zohr',
    managerId: 'u_mgr_zohr',
    jobProfileId: 'j_dcs_op',
    orgLevel: 'FP',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Ali'
  },
  {
    id: 'u_emp_ahmed',
    name: 'Eng. Ahmed Hassan',
    email: 'ahmed.h@zohr.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_zohr',
    managerId: 'u_mgr_zohr',
    jobProfileId: 'j_prod_eng',
    orgLevel: 'FP',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Ahmed'
  },
  {
    id: 'u_emp_mahmoud',
    name: 'Tech. Mahmoud Ibrahim',
    email: 'm.ibrahim@zohr.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_zohr',
    managerId: 'u_mgr_zohr',
    jobProfileId: 'j_inst_tech',
    orgLevel: 'FR',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Mahmoud'
  },
  {
    id: 'u_pending',
    name: 'Eng. Omar Youssef',
    email: 'omar.y@petrobel.com.eg',
    role: Role.EMPLOYEE,
    status: 'PENDING',
    departmentId: '',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Omar'
  }
];

const MOCK_ASSESSMENTS: Assessment[] = [
  { id: 'a1', raterId: 'u_emp_ali', subjectId: 'u_emp_ali', skillId: 's_tech_02', score: 3, comment: 'Completed advanced Yokogawa training course.', date: '2024-02-10', type: 'SELF' },
  { id: 'a2', raterId: 'u_mgr_zohr', subjectId: 'u_emp_ali', skillId: 's_tech_02', score: 4, comment: 'Demonstrated excellent handling of the slug catcher upset last week.', date: '2024-02-12', type: 'MANAGER' },
  { id: 'a3', raterId: 'u_emp_sarah', subjectId: 'u_emp_sarah', skillId: 's_maint_01', score: 4, comment: 'Successfully led the compressor K-101 overhaul.', date: '2024-01-20', type: 'SELF' },
];

const MOCK_LOGS: ActivityLog[] = [
    { id: 'l1', action: 'Updated Competency Matrix', target: 'Rotating Equipment Engineer', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
    { id: 'l2', action: 'Approved Permit to Work Cert', target: 'Ali Hassan', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    { id: 'l3', action: 'System Audit', target: 'Zohr Field Operations', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
    { id: 'l4', action: 'New Employee Registration', target: 'Omar Youssef', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() }
];

// ==========================================
// 🚀 DATA SERVICE
// ==========================================

class DataService {
  private users: User[] = [];
  private jobs: JobProfile[] = [];
  private skills: Skill[] = [];
  private assessments: Assessment[] = [];
  private departments: Department[] = [];
  private logs: ActivityLog[] = [];
  
  private supabase: SupabaseClient | null = null;
  public isInitialized = false;

  constructor() {
    // We load mock data by default so the app doesn't crash before init
    this.resetToMock();
  }

  private resetToMock() {
    this.users = [...MOCK_USERS];
    this.jobs = [...MOCK_JOBS];
    this.skills = [...MOCK_SKILLS];
    this.assessments = [...MOCK_ASSESSMENTS];
    this.departments = [...MOCK_DEPTS];
    this.logs = [...MOCK_LOGS];
  }

  // --- INITIALIZATION ---
  
  async initialize() {
    console.log(`Initializing DataService with SOURCE: ${CONFIG.SOURCE}`);
    
    if (CONFIG.SOURCE === 'SUPABASE') {
      // Basic validation to prevent "Invalid URL" crash if credentials are missing
      if (!CONFIG.SUPABASE.url || CONFIG.SUPABASE.url.includes('your-project.supabase.co')) {
        console.warn("Supabase credentials not set. Falling back to MOCK data.");
        this.resetToMock();
        this.isInitialized = true;
        return;
      }

      try {
        this.supabase = createClient(CONFIG.SUPABASE.url, CONFIG.SUPABASE.key);
        await this.loadFromSupabase();
      } catch (e) {
        console.error("Supabase Connection Failed. Falling back to Mock data.", e);
        this.resetToMock();
      }
    } else {
      // MOCK
      this.resetToMock();
    }
    
    this.isInitialized = true;
  }

  // --- SUPABASE LOADERS ---

  private async loadFromSupabase() {
    if (!this.supabase) return;

    try {
      const { data: users } = await this.supabase.from('user_profiles').select('*');
      const { data: jobs } = await this.supabase.from('job_profiles').select('*');
      const { data: skills } = await this.supabase.from('skills').select('*');
      const { data: depts } = await this.supabase.from('departments').select('*');
      const { data: assessments } = await this.supabase.from('assessments').select('*');
      const { data: logs } = await this.supabase.from('system_logs').select('*').order('timestamp', { ascending: false }).limit(20);

      // Map snake_case from DB to camelCase for UI if necessary, or just cast
      // Assuming DB columns match Typescript interface largely or we map them:
      if (users) this.users = users.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        // FIX: Normalize status to uppercase (handles 'pending' from db vs 'PENDING' in app)
        status: (u.status ? u.status.toUpperCase() : 'ACTIVE') as any,
        departmentId: u.department_id,
        jobProfileId: u.job_profile_id,
        managerId: u.manager_id,
        orgLevel: u.org_level,
        avatarUrl: u.avatar_url
      }));

      if (jobs) this.jobs = jobs.map(j => ({
        id: j.id,
        title: j.title,
        description: j.description,
        departmentId: j.department_id,
        requirements: j.requirements // JSONB auto-parsed
      }));

      if (skills) this.skills = skills.map(s => ({
        id: s.id,
        name: s.name,
        category: s.category,
        assessmentQuestion: s.assessment_question,
        levels: s.levels // JSONB auto-parsed
      }));

      if (depts) this.departments = depts.map(d => ({
        id: d.id,
        name: d.name,
        managerId: d.manager_id
      }));

      if (assessments) this.assessments = assessments.map(a => ({
        id: a.id,
        raterId: a.rater_id,
        subjectId: a.subject_id,
        skillId: a.skill_id,
        score: a.score,
        comment: a.comment,
        date: a.date,
        type: a.type
      }));

      if (logs) this.logs = logs.map(l => ({
        id: l.id,
        action: l.action,
        target: l.target,
        timestamp: l.timestamp
      }));

    } catch (error) {
      console.error("Error loading data from Supabase:", error);
    }
  }

  // --- AUTHENTICATION ---

  async signUp(email: string, password: string, userData: Partial<User>) {
    if (CONFIG.SOURCE === 'MOCK') return { error: 'Auth disabled in Mock mode' };
    if (!this.supabase) return { error: 'Supabase not initialized' };

    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
    });

    if (error) return { error: error.message };
    if (data.user) {
      // Create user profile with PENDING status
      const newUserProfile = {
        id: data.user.id,
        email: email,
        name: userData.name || 'New User',
        role: Role.EMPLOYEE, // Default
        // status: 'PENDING', // REMOVED: Rely on DB default to avoid 'Column not found' error if migration pending
        department_id: null,
        org_level: null, 
        avatar_url: `https://ui-avatars.com/api/?name=${userData.name}`
      };

      const { error: profileError } = await this.supabase
        .from('user_profiles')
        .insert([newUserProfile]);

      if (profileError) {
        return { error: 'User created but profile failed: ' + profileError.message };
      }
      
      // Update local state immediately
      const localUser: User = {
          id: newUserProfile.id,
          email: newUserProfile.email,
          name: newUserProfile.name,
          role: newUserProfile.role as Role,
          status: 'PENDING', // We assume pending locally even if DB fallback is used
          departmentId: '',
          orgLevel: undefined,
          avatarUrl: newUserProfile.avatar_url
      };
      this.users.push(localUser);
      this.logActivity('Self-Registration', localUser.name);
      return { user: localUser };
    }
    return { error: 'Unknown error' };
  }

  async loginWithPassword(email: string, password: string) {
    if (CONFIG.SOURCE === 'MOCK') {
        const mockUser = this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (!mockUser) return { error: 'User not found in Mock Data' };
        
        // Mock Status Check
        if (mockUser.status === 'PENDING') {
            return { error: 'Account is pending administrator approval. Please wait.' };
        }
        if (mockUser.status === 'REJECTED') {
             return { error: 'Account has been deactivated.' };
        }

        return { user: mockUser };
    }
    
    if (!this.supabase) return { error: 'Supabase not initialized' };

    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return { error: error.message };
    
    // Auth successful, retrieve profile details
    if (data.user) {
        // Ensure local data is fresh
        await this.loadFromSupabase();
        const userProfile = this.users.find(u => u.id === data.user?.id);
        
        if (!userProfile) return { error: 'Profile not found for this user' };
        
        // CHECK STATUS
        if (userProfile.status === 'PENDING') {
            // Optional: Sign them out so session doesn't persist
            await this.supabase.auth.signOut();
            return { error: 'Account is pending administrator approval. Please wait.' };
        }
        if (userProfile.status === 'REJECTED') {
            await this.supabase.auth.signOut();
            return { error: 'Account has been deactivated by the administrator.' };
        }

        return { user: userProfile };
    }
    return { error: 'Login failed' };
  }

  async signOut() {
      if (this.supabase) {
          await this.supabase.auth.signOut();
      }
  }

  // --- PERSISTENCE HELPERS ---

  private async persistItem(collectionName: string, item: any) {
    if (CONFIG.SOURCE === 'SUPABASE' && this.supabase) {
      try {
        // Map collection names to table names and camelCase to snake_case
        let tableName = '';
        let payload = {};

        switch(collectionName) {
            case 'assessments': 
                tableName = 'assessments';
                payload = {
                    id: item.id,
                    rater_id: item.raterId,
                    subject_id: item.subjectId,
                    skill_id: item.skillId,
                    score: item.score,
                    comment: item.comment,
                    date: item.date,
                    type: item.type
                };
                break;
            case 'skills':
                tableName = 'skills';
                payload = {
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    assessment_question: item.assessmentQuestion,
                    levels: item.levels
                };
                break;
            case 'jobs':
                tableName = 'job_profiles';
                payload = {
                    id: item.id,
                    title: item.title,
                    description: item.description,
                    department_id: item.departmentId,
                    requirements: item.requirements
                };
                break;
            case 'departments':
                tableName = 'departments';
                payload = {
                    id: item.id,
                    name: item.name,
                    manager_id: item.managerId
                };
                break;
            case 'users':
                // Creating users directly via persistItem is only for Admin creating mock users or bypassing auth flow
                tableName = 'user_profiles';
                payload = {
                    id: item.id,
                    email: item.email,
                    name: item.name,
                    role: item.role,
                    status: item.status, // Add status
                    department_id: item.departmentId,
                    job_profile_id: item.jobProfileId,
                    manager_id: item.managerId,
                    org_level: item.orgLevel,
                    avatar_url: item.avatarUrl
                };
                break;
            case 'logs':
                tableName = 'system_logs';
                payload = {
                    id: item.id,
                    action: item.action,
                    target: item.target,
                    timestamp: item.timestamp
                };
                break;
        }

        if(tableName) {
            const { error } = await this.supabase.from(tableName).upsert([payload]);
            if (error) console.error(`Supabase Insert Error [${tableName}]:`, error);
        }

      } catch (e) {
        console.error(`Failed to save to Supabase [${collectionName}]`, e);
      }
    }
  }

  private async deleteItem(collectionName: string, id: string) {
    if (CONFIG.SOURCE === 'SUPABASE' && this.supabase) {
        try {
            let tableName = '';
            switch(collectionName) {
                case 'assessments': tableName = 'assessments'; break;
                case 'skills': tableName = 'skills'; break;
                case 'jobs': tableName = 'job_profiles'; break;
                case 'departments': tableName = 'departments'; break;
                case 'users': tableName = 'user_profiles'; break;
            }
            if (tableName) {
                const { error } = await this.supabase.from(tableName).delete().eq('id', id);
                if (error) console.error(`Supabase Delete Error [${tableName}]:`, error);
            }
        } catch (e) {
            console.error(`Failed to delete from Supabase [${collectionName}]`, e);
        }
    }
  }

  private async updateItem(collectionName: string, item: any) {
     // Re-use persistItem as upsert handles updates based on ID
     await this.persistItem(collectionName, item);
  }

  // --- PUBLIC METHODS (GETTERS - Synchronous for UI Performance) ---

  // NOTE: In a real app, 'login' is async. We kept the synchronous signature for Mock compatibility in types
  // but the UI calls 'loginWithPassword' now.
  login(email: string): User | undefined {
    // Legacy fallback
    return this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  getCurrentUser(id: string) { return this.users.find(u => u.id === id); }
  getJobProfile(id: string) { return this.jobs.find(j => j.id === id); }
  getAllSkills() { return this.skills; }
  getAllJobs() { return this.jobs; }
  getAllUsers() { return this.users; }
  getAllDepartments() { return this.departments; }
  getSkill(id: string) { return this.skills.find(s => s.id === id); }
  getSystemLogs() { return this.logs; }

  getSubordinates(managerId: string) {
    return this.users.filter(u => u.managerId === managerId);
  }

  getPeers(userId: string) {
    const user = this.getCurrentUser(userId);
    if (!user) return [];
    
    if (user.managerId) {
       return this.users.filter(u => u.managerId === user.managerId && u.id !== userId);
    }

    return this.users.filter(u => 
        u.id !== userId && 
        u.departmentId === user.departmentId &&
        u.orgLevel === user.orgLevel
    );
  }

  getUserSkillScore(userId: string, skillId: string): number {
    const userAssessments = this.assessments.filter(a => a.subjectId === userId && a.skillId === skillId);
    if (userAssessments.length === 0) return 0;
    const sum = userAssessments.reduce((acc, curr) => acc + curr.score, 0);
    return Math.round(sum / userAssessments.length);
  }

  getAssessments(filters: { raterId?: string, subjectId?: string }) {
    return this.assessments.filter(a => {
      const matchRater = filters.raterId ? a.raterId === filters.raterId : true;
      const matchSubject = filters.subjectId ? a.subjectId === filters.subjectId : true;
      return matchRater && matchSubject;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // --- ACTIONS (Async Write-Behind) ---

  public logActivity(action: string, target: string) {
    const newLog: ActivityLog = {
        id: Math.random().toString(36).substr(2, 9),
        action,
        target,
        timestamp: new Date().toISOString()
    };
    this.logs.unshift(newLog); // Add to top
    if (this.logs.length > 50) this.logs.pop(); // Keep list small locally
    this.persistItem('logs', newLog);
  }

  addAssessment(assessment: Omit<Assessment, 'id' | 'date'>) {
    const newAssessment: Assessment = {
      ...assessment,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString(),
    };
    this.assessments.push(newAssessment);
    this.persistItem('assessments', newAssessment);
    
    // Log Activity
    const subject = this.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
    this.logActivity('Submitted Assessment', `For ${subject}`);
  }

  addSkill(skill: Skill) { 
    this.skills.push(skill); 
    this.persistItem('skills', skill);
    this.logActivity('Defined New Skill', skill.name);
  }
  
  addJobProfile(job: JobProfile) { 
    this.jobs.push(job); 
    this.persistItem('jobs', job);
    this.logActivity('Created Job Profile', job.title);
  }
  
  addUser(user: User) { 
    this.users.push(user); 
    this.persistItem('users', user);
    this.logActivity('Onboarded Employee', user.name);
  }

  addDepartment(dept: Department) {
    this.departments.push(dept);
    this.persistItem('departments', dept);
    this.logActivity('Created Department', dept.name);
  }

  updateDepartment(dept: Department) {
    const idx = this.departments.findIndex(d => d.id === dept.id);
    if (idx >= 0) {
      this.departments[idx] = dept;
      this.updateItem('departments', dept);
      this.logActivity('Updated Department', dept.name);
    }
  }

  updateUser(user: User) {
    const idx = this.users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      this.users[idx] = user;
      this.updateItem('users', user);
      this.logActivity('Updated Profile', user.name);
    }
  }
  
  updateJobProfile(job: JobProfile) {
    const idx = this.jobs.findIndex(j => j.id === job.id);
    if (idx >= 0) {
      this.jobs[idx] = job;
      this.updateItem('jobs', job);
      this.logActivity('Modified Job Profile', job.title);
    }
  }
  
  updateSkill(skill: Skill) {
    const idx = this.skills.findIndex(s => s.id === skill.id);
    if (idx >= 0) {
      this.skills[idx] = skill;
      this.updateItem('skills', skill);
      this.logActivity('Updated Skill Standard', skill.name);
    }
  }

  // --- REMOVE METHODS ---

  removeUser(id: string) {
    const user = this.users.find(u => u.id === id);
    if (user) {
        this.users = this.users.filter(u => u.id !== id);
        this.deleteItem('users', id);
        this.logActivity('Removed Employee', user.name);
    }
  }

  removeJobProfile(id: string) {
    const job = this.jobs.find(j => j.id === id);
    if (job) {
        this.jobs = this.jobs.filter(j => j.id !== id);
        this.deleteItem('jobs', id);
        this.logActivity('Removed Job Profile', job.title);
    }
  }

  removeSkill(id: string) {
    const skill = this.skills.find(s => s.id === id);
    if (skill) {
        this.skills = this.skills.filter(s => s.id !== id);
        this.deleteItem('skills', id);
        this.logActivity('Removed Skill', skill.name);
    }
  }

  removeDepartment(id: string) {
    const dept = this.departments.find(d => d.id === id);
    if (dept) {
        this.departments = this.departments.filter(d => d.id !== id);
        this.deleteItem('departments', id);
        this.logActivity('Removed Department', dept.name);
    }
  }
}

export const dataService = new DataService();