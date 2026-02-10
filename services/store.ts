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
// 📦 MOCK DATA (Default)
// ==========================================

const MOCK_SKILLS: Skill[] = [
  {
    id: 's1',
    name: 'HSE Risk Assessment',
    category: 'Safety',
    assessmentQuestion: 'How effectively does the employee identify, evaluate, and mitigate safety risks in their daily work?',
    levels: {
      1: { level: 1, description: 'Has basic awareness of safety protocols but requires guidance.', requiredCertificates: ['HSE Intro'] },
      2: { level: 2, description: 'Can perform standard risk assessments with supervision.', requiredCertificates: ['Risk Level 1'] },
      3: { level: 3, description: 'Independently executes risk assessments and identifies hazards.', requiredCertificates: ['NEBOSH IGC'] },
      4: { level: 4, description: 'Acts as a safety trainer/expert; leads safety audits.', requiredCertificates: ['Advanced Safety Audit'] },
      5: { level: 5, description: 'Develops strategic safety policies and industry-wide standards.', requiredCertificates: ['Master Safety Director'] },
    }
  },
  {
    id: 's2',
    name: 'Process Engineering',
    category: 'Technical',
    assessmentQuestion: 'What is the employee\'s capability regarding chemical process design, simulation, and optimization?',
    levels: {
      1: { level: 1, description: 'Understands basic concepts but cannot apply them independently.', requiredCertificates: [] },
      2: { level: 2, description: 'Performs basic calculations and follows established procedures.', requiredCertificates: ['ChemEng 101'] },
      3: { level: 3, description: 'Designs systems and runs simulations for standard projects.', requiredCertificates: ['Process Simulation Cert'] },
      4: { level: 4, description: 'Troubleshoots complex system failures and optimizes plant performance.', requiredCertificates: ['Senior Process Eng License'] },
      5: { level: 5, description: 'Innovates new processing technologies for the industry.', requiredCertificates: ['PhD or Equivalent'] },
    }
  },
  {
    id: 's3',
    name: 'Project Management',
    category: 'Management',
    assessmentQuestion: 'How does the employee demonstrate ability in managing project scope, timelines, and resources?',
    levels: {
      1: { level: 1, description: 'Tracks personal tasks and reports progress accurately.', requiredCertificates: [] },
      2: { level: 2, description: 'Leads small projects or workstreams with defined scope.', requiredCertificates: ['CAPM'] },
      3: { level: 3, description: 'Manages large projects involving cross-functional teams.', requiredCertificates: ['PMP'] },
      4: { level: 4, description: 'Oversees multiple related projects (Program Management).', requiredCertificates: ['PgMP'] },
      5: { level: 5, description: 'Defines portfolio strategy aligned with organizational goals.', requiredCertificates: ['PfMP'] },
    }
  }
];

const MOCK_DEPTS: Department[] = [
  { id: 'd1', name: 'Operations' },
  { id: 'd2', name: 'Engineering' },
  { id: 'd3', name: 'HR' }
];

const MOCK_JOBS: JobProfile[] = [
  {
    id: 'j1',
    title: 'Process Engineer Track',
    description: 'Career path for process engineering from Fresh to Manager.',
    departmentId: 'd2',
    requirements: {
      'DM': [ // Department Manager
        { skillId: 's1', requiredLevel: 4 },
        { skillId: 's2', requiredLevel: 5 },
        { skillId: 's3', requiredLevel: 4 },
      ],
      'FP': [ // First Position
        { skillId: 's1', requiredLevel: 3 },
        { skillId: 's2', requiredLevel: 4 },
        { skillId: 's3', requiredLevel: 2 },
      ],
      'FR': [ // Fresh
        { skillId: 's1', requiredLevel: 2 },
        { skillId: 's2', requiredLevel: 2 },
        { skillId: 's3', requiredLevel: 1 },
      ]
    }
  },
  {
    id: 'j2',
    title: 'Safety Specialist Track',
    description: 'Ensures workplace safety compliance.',
    departmentId: 'd1',
    requirements: {
      'DH': [
         { skillId: 's1', requiredLevel: 5 },
         { skillId: 's3', requiredLevel: 3 },
      ],
      'FR': [
         { skillId: 's1', requiredLevel: 2 },
      ]
    }
  }
];

const MOCK_USERS: User[] = [
  {
    id: 'u1',
    name: 'Admin User',
    email: 'admin@erpom.com',
    role: Role.ADMIN,
    status: 'ACTIVE',
    departmentId: 'd3',
    orgLevel: 'GM'
  },
  {
    id: 'u2',
    name: 'Ahmed Manager',
    email: 'ahmed@erpom.com',
    role: Role.MANAGER,
    status: 'ACTIVE',
    departmentId: 'd2',
    jobProfileId: 'j1',
    orgLevel: 'DM', // Department Manager
    avatarUrl: 'https://picsum.photos/200/200?random=1'
  },
  {
    id: 'u3',
    name: 'Sara Engineer',
    email: 'sara@erpom.com',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd2',
    managerId: 'u2',
    jobProfileId: 'j1',
    orgLevel: 'FP', // First Position
    avatarUrl: 'https://picsum.photos/200/200?random=2'
  },
  {
    id: 'u4',
    name: 'Khaled Technician',
    email: 'khaled@erpom.com',
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: 'd1',
    managerId: 'u2',
    jobProfileId: 'j2',
    orgLevel: 'FR', // Fresh
    avatarUrl: 'https://picsum.photos/200/200?random=3'
  },
  {
    id: 'u5',
    name: 'New Pending User',
    email: 'new@erpom.com',
    role: Role.EMPLOYEE,
    status: 'PENDING',
    departmentId: '',
    avatarUrl: 'https://picsum.photos/200/200?random=4'
  }
];

const MOCK_ASSESSMENTS: Assessment[] = [
  { id: 'a1', raterId: 'u3', subjectId: 'u3', skillId: 's1', score: 2, comment: 'Need more training', date: '2023-10-01', type: 'SELF' },
  { id: 'a2', raterId: 'u2', subjectId: 'u3', skillId: 's1', score: 3, comment: 'Good progress', date: '2023-10-05', type: 'MANAGER' },
  { id: 'a3', raterId: 'u3', subjectId: 'u3', skillId: 's2', score: 3, comment: 'Solid understanding', date: '2023-10-01', type: 'SELF' },
];

const MOCK_LOGS: ActivityLog[] = [
    { id: 'l1', action: 'Modified Skill Requirements', target: 'Process Engineer Track', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
    { id: 'l2', action: 'Onboarded Employee', target: 'Sarah Connor', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() },
    { id: 'l3', action: 'System Initialization', target: 'Core Modules', timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() }
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