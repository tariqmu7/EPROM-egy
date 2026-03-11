import { User, Role, JobProfile, Skill, Department, Assessment, ActivityLog, ORG_HIERARCHY_ORDER, Notification, AssessmentCycle } from '../types';
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
    id: 's_eng_01',
    name: 'Process Engineering Design',
    category: 'Technical',
    assessmentQuestion: 'Can the employee perform process simulations and equipment sizing for oil and gas facilities?',
    levels: {
      1: { level: 1, description: 'Understands basic process flow diagrams and P&IDs.', requiredCertificates: [] },
      2: { level: 2, description: 'Performs simple hydraulic calculations and equipment sizing under supervision.', requiredCertificates: ['Process Engineering Basics'] },
      3: { level: 3, description: 'Independently develops process simulations (e.g., HYSYS) and prepares equipment data sheets.', requiredCertificates: ['Advanced Process Simulation'] },
      4: { level: 4, description: 'Leads process design for complex projects and optimizes existing facilities.', requiredCertificates: ['Senior Process Engineer Cert'] },
      5: { level: 5, description: 'Subject Matter Expert; provides technical governance and reviews critical designs.', requiredCertificates: ['Process Engineering SME'] },
    }
  },
  {
    id: 's_maint_02',
    name: 'Predictive Maintenance (Vibration Analysis)',
    category: 'Technical',
    assessmentQuestion: 'Demonstrates proficiency in vibration analysis and condition monitoring of rotating equipment.',
    levels: {
      1: { level: 1, description: 'Collects vibration data using portable analyzers.', requiredCertificates: [] },
      2: { level: 2, description: 'Identifies common faults (unbalance, misalignment) from vibration spectra.', requiredCertificates: ['Vibration Analysis Level I'] },
      3: { level: 3, description: 'Diagnoses complex machinery faults and recommends corrective actions.', requiredCertificates: ['Vibration Analysis Level II'] },
      4: { level: 4, description: 'Manages condition monitoring programs and performs advanced diagnostics (e.g., ODS, Modal Analysis).', requiredCertificates: ['Vibration Analysis Level III'] },
      5: { level: 5, description: 'Develops corporate reliability strategies and mentors junior analysts.', requiredCertificates: ['Vibration Analysis Level IV'] },
    }
  },
  {
    id: 's_mgt_02',
    name: 'Maintenance Planning & Scheduling',
    category: 'Management',
    assessmentQuestion: 'Ability to plan, schedule, and coordinate maintenance activities to minimize downtime.',
    levels: {
      1: { level: 1, description: 'Assists in creating work orders and gathering materials.', requiredCertificates: [] },
      2: { level: 2, description: 'Develops detailed job plans and estimates resources for routine maintenance.', requiredCertificates: ['Maintenance Planning Basics'] },
      3: { level: 3, description: 'Schedules complex maintenance activities and manages backlog.', requiredCertificates: ['Certified Maintenance Planner'] },
      4: { level: 4, description: 'Leads turnaround/shutdown planning and optimizes resource allocation.', requiredCertificates: ['Turnaround Management Cert'] },
      5: { level: 5, description: 'Develops strategic maintenance plans and integrates with production schedules.', requiredCertificates: ['CMRP'] },
    }
  },
  {
    id: 's_hse_02',
    name: 'Process Safety Management (PSM)',
    category: 'Safety',
    assessmentQuestion: 'Understands and applies Process Safety Management principles to prevent major accidents.',
    levels: {
      1: { level: 1, description: 'Aware of basic process safety concepts and major accident hazards.', requiredCertificates: ['HSE Induction'] },
      2: { level: 2, description: 'Participates in HAZOP/LOPA studies and understands safety critical elements.', requiredCertificates: ['Process Safety Awareness'] },
      3: { level: 3, description: 'Facilitates risk assessments and manages Management of Change (MOC) processes.', requiredCertificates: ['HAZOP Leader'] },
      4: { level: 4, description: 'Audits PSM compliance and investigates high-potential process safety incidents.', requiredCertificates: ['Process Safety Auditor'] },
      5: { level: 5, description: 'Develops corporate PSM frameworks and drives process safety culture.', requiredCertificates: ['Certified Process Safety Professional'] },
    }
  },
  {
    id: 's_eng_02',
    name: 'Pipeline Integrity Management',
    category: 'Technical',
    assessmentQuestion: 'Proficiency in assessing and managing the integrity of oil and gas pipelines.',
    levels: {
      1: { level: 1, description: 'Understands basic pipeline components and corrosion mechanisms.', requiredCertificates: [] },
      2: { level: 2, description: 'Assists in analyzing inline inspection (ILI) data and cathodic protection surveys.', requiredCertificates: ['Pipeline Integrity Basics'] },
      3: { level: 3, description: 'Develops integrity management plans and calculates fitness-for-service.', requiredCertificates: ['API 1160'] },
      4: { level: 4, description: 'Manages complex repair projects and optimizes inspection intervals.', requiredCertificates: ['Senior Pipeline Engineer'] },
      5: { level: 5, description: 'Subject Matter Expert; develops corporate pipeline integrity standards.', requiredCertificates: ['Pipeline Integrity SME'] },
    }
  },
  {
    id: 's_mgt_03',
    name: 'Project Management (Engineering)',
    category: 'Management',
    assessmentQuestion: 'Ability to manage engineering projects from concept to commissioning.',
    levels: {
      1: { level: 1, description: 'Assists in project tracking and document control.', requiredCertificates: [] },
      2: { level: 2, description: 'Manages small engineering modifications and coordinates with contractors.', requiredCertificates: ['Project Management Fundamentals'] },
      3: { level: 3, description: 'Leads multi-disciplinary engineering projects and manages budgets/schedules.', requiredCertificates: ['PMP'] },
      4: { level: 4, description: 'Directs major capital projects and negotiates complex contracts.', requiredCertificates: ['Advanced Project Management'] },
      5: { level: 5, description: 'Portfolio Manager; aligns engineering projects with strategic business goals.', requiredCertificates: ['PgMP'] },
    }
  }
];

const MOCK_DEPTS: Department[] = [
  { id: 'd_eng_design', name: 'Engineering Design & Projects' },
  { id: 'd_maint_exec', name: 'Maintenance Execution' },
  { id: 'd_reliability', name: 'Reliability & Integrity' },
  { id: 'd_tech_services', name: 'Technical Services' }
];

const MOCK_JOBS: JobProfile[] = [
  {
    id: 'j_proc_eng',
    title: 'Senior Process Engineer',
    description: 'Leads process design and optimization for oil and gas facilities.',
    departmentId: 'd_eng_design',
    requirements: {
      'FP': [
        { skillId: 's_eng_01', requiredLevel: 4 },
        { skillId: 's_hse_02', requiredLevel: 3 },
        { skillId: 's_mgt_03', requiredLevel: 2 },
      ],
      'FR': [
        { skillId: 's_eng_01', requiredLevel: 2 },
        { skillId: 's_hse_02', requiredLevel: 1 },
      ]
    }
  },
  {
    id: 'j_rel_eng',
    title: 'Reliability Engineer',
    description: 'Implements predictive maintenance and condition monitoring programs.',
    departmentId: 'd_reliability',
    requirements: {
      'FP': [
        { skillId: 's_maint_02', requiredLevel: 3 },
        { skillId: 's_mgt_02', requiredLevel: 2 },
      ],
      'FR': [
        { skillId: 's_maint_02', requiredLevel: 1 },
      ]
    }
  },
  {
    id: 'j_maint_mgr',
    title: 'Maintenance Manager',
    description: 'Oversees all maintenance activities and turnaround planning.',
    departmentId: 'd_maint_exec',
    requirements: {
      'DM': [
        { skillId: 's_mgt_02', requiredLevel: 5 },
        { skillId: 's_maint_02', requiredLevel: 3 },
        { skillId: 's_hse_02', requiredLevel: 4 },
        { skillId: 's_mgt_03', requiredLevel: 4 },
      ]
    }
  },
  {
    id: 'j_pipe_eng',
    title: 'Pipeline Integrity Engineer',
    description: 'Manages the integrity and inspection of pipeline networks.',
    departmentId: 'd_reliability',
    requirements: {
      'FP': [
        { skillId: 's_eng_02', requiredLevel: 3 },
        { skillId: 's_hse_02', requiredLevel: 2 },
      ],
      'FR': [
        { skillId: 's_eng_02', requiredLevel: 1 },
      ]
    }
  },
  {
    id: 'j_eng_mgr',
    title: 'Engineering Manager',
    description: 'Directs the engineering department and major capital projects.',
    departmentId: 'd_eng_design',
    requirements: {
      'DM': [
        { skillId: 's_mgt_03', requiredLevel: 5 },
        { skillId: 's_eng_01', requiredLevel: 4 },
        { skillId: 's_hse_02', requiredLevel: 4 },
      ]
    }
  }
];

const MOCK_USERS: User[] = [
  {
    id: 'u_admin',
    name: 'Eng. Mahmoud Fawzy',
    email: 'admin@egpc.com.eg',
    role: Role.ADMIN,
    status: 'ACTIVE',
    departmentId: 'd_tech_services',
    orgLevel: 'GM',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=MahmoudF'
  },
  {
    id: 'u_mgr_eng',
    name: 'Eng. Sameh Ibrahim',
    email: 'sameh.i@zohr.com.eg',
    role: Role.MANAGER,
    status: 'ACTIVE',
    departmentId: 'd_eng_design',
    jobProfileId: 'j_eng_mgr',
    orgLevel: 'DM',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Sameh'
  },
  {
    id: 'u_mgr_maint',
    name: 'Eng. Youssef Ali',
    email: 'youssef.a@midor.com.eg',
    role: Role.MANAGER,
    status: 'ACTIVE',
    departmentId: 'd_maint_exec',
    jobProfileId: 'j_maint_mgr',
    orgLevel: 'DM',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Youssef'
  },
  {
    id: 'u_emp_sarah',
    name: 'Eng. Sarah Ahmed',
    email: 'sarah.ahmed@midor.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_eng_design',
    managerId: 'u_mgr_eng',
    jobProfileId: 'j_proc_eng',
    orgLevel: 'FP',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Sarah'
  },
  {
    id: 'u_emp_ali',
    name: 'Eng. Ali Hassan',
    email: 'ali.hassan@zohr.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_reliability',
    managerId: 'u_mgr_maint',
    jobProfileId: 'j_rel_eng',
    orgLevel: 'FP',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Ali'
  },
  {
    id: 'u_emp_ahmed',
    name: 'Eng. Ahmed Hassan',
    email: 'ahmed.h@zohr.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_reliability',
    managerId: 'u_mgr_maint',
    jobProfileId: 'j_pipe_eng',
    orgLevel: 'FP',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Ahmed'
  },
  {
    id: 'u_emp_mahmoud',
    name: 'Eng. Mahmoud Ibrahim',
    email: 'm.ibrahim@zohr.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_eng_design',
    managerId: 'u_mgr_eng',
    jobProfileId: 'j_proc_eng',
    orgLevel: 'FR',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Mahmoud'
  },
  {
    id: 'u_emp_fatima',
    name: 'Eng. Fatima Zahra',
    email: 'f.zahra@midor.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_eng_design',
    managerId: 'u_mgr_eng',
    jobProfileId: 'j_proc_eng',
    orgLevel: 'FP',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Fatima'
  },
  {
    id: 'u_emp_hassan',
    name: 'Eng. Hassan Mostafa',
    email: 'h.mostafa@petrobel.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_reliability',
    managerId: 'u_mgr_maint',
    jobProfileId: 'j_rel_eng',
    orgLevel: 'FR',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Hassan'
  },
  {
    id: 'u_emp_nour',
    name: 'Eng. Nour El Din',
    email: 'n.eldin@zohr.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_reliability',
    managerId: 'u_mgr_maint',
    jobProfileId: 'j_pipe_eng',
    orgLevel: 'FP',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Nour'
  },
  {
    id: 'u_emp_mariam',
    name: 'Eng. Mariam Adel',
    email: 'm.adel@midor.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_eng_design',
    managerId: 'u_mgr_eng',
    jobProfileId: 'j_proc_eng',
    orgLevel: 'FR',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Mariam'
  },
  {
    id: 'u_emp_karim',
    name: 'Eng. Karim Samir',
    email: 'k.samir@petrobel.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_reliability',
    managerId: 'u_mgr_maint',
    jobProfileId: 'j_rel_eng',
    orgLevel: 'FP',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Karim'
  },
  {
    id: 'u_emp_yasmine',
    name: 'Eng. Yasmine Tarek',
    email: 'y.tarek@zohr.com.eg',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd_eng_design',
    managerId: 'u_mgr_eng',
    jobProfileId: 'j_proc_eng',
    orgLevel: 'FP',
    avatarUrl: 'https://api.dicebear.com/9.x/avataaars/svg?seed=Yasmine'
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
  { id: 'a1', raterId: 'u_emp_sarah', subjectId: 'u_emp_sarah', skillId: 's_eng_01', score: 4, comment: 'Successfully completed the HYSYS simulation for the new gas plant.', date: '2024-02-10', type: 'SELF' },
  { id: 'a2', raterId: 'u_mgr_eng', subjectId: 'u_emp_sarah', skillId: 's_eng_01', score: 4, comment: 'Excellent work on the process design package.', date: '2024-02-12', type: 'MANAGER' },
  { id: 'a3', raterId: 'u_emp_ali', subjectId: 'u_emp_ali', skillId: 's_maint_02', score: 3, comment: 'Completed Vibration Analysis Level II certification.', date: '2024-01-20', type: 'SELF' },
];

const MOCK_LOGS: ActivityLog[] = [
    { id: 'l1', action: 'Updated Competency Matrix', target: 'Senior Process Engineer', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
    { id: 'l2', action: 'Approved Training Request', target: 'Ali Hassan', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    { id: 'l3', action: 'System Audit', target: 'Engineering Design & Projects', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
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
  private notifications: Notification[] = [];
  private cycles: AssessmentCycle[] = [];
  
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
    this.notifications = [];
    this.cycles = [];
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

  getAssessments(filters: { raterId?: string, subjectId?: string, cycleId?: string }) {
    return this.assessments.filter(a => {
      const matchRater = filters.raterId ? a.raterId === filters.raterId : true;
      const matchSubject = filters.subjectId ? a.subjectId === filters.subjectId : true;
      const matchCycle = filters.cycleId ? a.cycleId === filters.cycleId : true;
      return matchRater && matchSubject && matchCycle;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // --- CYCLES ---
  getAllCycles() {
    return [...this.cycles].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }

  getActiveCycle() {
    return this.cycles.find(c => c.status === 'ACTIVE');
  }

  addCycle(cycle: Omit<AssessmentCycle, 'id'>) {
    const newCycle: AssessmentCycle = {
      ...cycle,
      id: Math.random().toString(36).substr(2, 9)
    };
    this.cycles.push(newCycle);
    this.persistItem('cycles', newCycle);
    this.logActivity('Created Assessment Cycle', newCycle.name);

    // Notify all users about the new cycle
    this.users.forEach(u => {
      this.addNotification({
        userId: u.id,
        title: 'New Assessment Cycle',
        message: `The ${newCycle.name} assessment cycle is now active. Due date: ${new Date(newCycle.dueDate).toLocaleDateString()}`,
        type: 'INFO',
        actionLink: 'emp-assessment'
      });
    });
  }

  updateCycle(cycle: AssessmentCycle) {
    const idx = this.cycles.findIndex(c => c.id === cycle.id);
    if (idx >= 0) {
      this.cycles[idx] = cycle;
      this.updateItem('cycles', cycle);
      this.logActivity('Updated Assessment Cycle', cycle.name);
    }
  }

  // --- NOTIFICATIONS ---
  
  getNotifications(userId: string): Notification[] {
    // Generate dynamic notifications based on role
    const user = this.users.find(u => u.id === userId);
    if (!user) return [];

    const dynamicNotifications: Notification[] = [];

    // Admin Notifications
    if (user.role === Role.ADMIN) {
      const pendingUsers = this.users.filter(u => u.status === 'PENDING');
      if (pendingUsers.length > 0) {
        dynamicNotifications.push({
          id: 'dyn-admin-pending',
          userId: user.id,
          title: 'Pending Approvals',
          message: `There are ${pendingUsers.length} user(s) waiting for approval.`,
          type: 'WARNING',
          isRead: false,
          createdAt: new Date().toISOString(),
          actionLink: 'admin-users'
        });
      }
    }

    // Manager Notifications
    if (user.role === Role.MANAGER) {
      const teamMembers = this.users.filter(u => u.managerId === user.id);
      const teamMemberIds = new Set(teamMembers.map(u => u.id));
      
      // Find recent assessments for team members
      const recentAssessments = this.assessments.filter(a => 
        teamMemberIds.has(a.subjectId) && 
        a.raterId !== user.id && // Not rated by this manager
        new Date(a.date).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000 // Last 7 days
      );

      if (recentAssessments.length > 0) {
        dynamicNotifications.push({
          id: 'dyn-mgr-assessments',
          userId: user.id,
          title: 'Recent Team Assessments',
          message: `${recentAssessments.length} new assessment(s) submitted for your team members recently.`,
          type: 'INFO',
          isRead: false,
          createdAt: new Date().toISOString(),
          actionLink: 'manager-dashboard'
        });
      }
    }

    // Combine dynamic and persistent notifications, sort by date desc
    return [...dynamicNotifications, ...this.notifications.filter(n => n.userId === userId)]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  markNotificationAsRead(notificationId: string) {
    const idx = this.notifications.findIndex(n => n.id === notificationId);
    if (idx >= 0) {
      this.notifications[idx].isRead = true;
      this.updateItem('notifications', this.notifications[idx]);
    }
  }

  markAllNotificationsAsRead(userId: string) {
    this.notifications.forEach(n => {
      if (n.userId === userId) {
        n.isRead = true;
        this.updateItem('notifications', n);
      }
    });
  }

  addNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) {
    const newNotification: Notification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      isRead: false
    };
    this.notifications.unshift(newNotification);
    this.persistItem('notifications', newNotification);
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

    // Notify the subject if it's not a self-assessment
    if (assessment.raterId !== assessment.subjectId) {
      this.addNotification({
        userId: assessment.subjectId,
        title: 'New Assessment Received',
        message: `You received a new assessment.`,
        type: 'INFO',
        actionLink: 'emp-dashboard'
      });
    }
  }

  updateAssessment(assessment: Assessment) {
    const idx = this.assessments.findIndex(a => a.id === assessment.id);
    if (idx >= 0) {
      this.assessments[idx] = assessment;
      this.updateItem('assessments', assessment);
      
      const subject = this.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
      this.logActivity('Updated Assessment', `For ${subject}`);
    }
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