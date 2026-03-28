import { User, Role, JobProfile, Skill, Department, Assessment, ActivityLog, ORG_HIERARCHY_ORDER, Notification, AssessmentCycle, Nomination, IndividualTrainingPlan, TrainingRecommendation, OrgLevel, Evidence, PromotionRequirement, CareerProgressionPlan } from '../types';
import { db, auth } from '../firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  Unsubscribe,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from 'firebase/auth';

// ==========================================
// 🔧 APP CONFIGURATION
// ==========================================
export const CONFIG = {
  SOURCE: 'FIREBASE', 
};

// ==========================================
// 🚀 DATA SERVICE
// ==========================================

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

class DataService {
  private users: User[] = [];
  private jobs: JobProfile[] = [];
  private skills: Skill[] = [];
  private assessments: Assessment[] = [];
  private departments: Department[] = [];
  private logs: ActivityLog[] = [];
  private notifications: Notification[] = [];
  private cycles: AssessmentCycle[] = [];
  private nominations: Nomination[] = [];
  private evidences: Evidence[] = [];
  
  public isInitialized = false;
  private unsubscribers: Unsubscribe[] = [];
  private authReadyResolver: () => void = () => {};
  public authReady = new Promise<void>((resolve) => {
    this.authReadyResolver = resolve;
  });

  constructor() {
    // Listen to auth state changes
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is signed in, setup listeners
        this.setupListeners();
      } else {
        // User is signed out, clear listeners and data
        this.clearListeners();
        this.clearData();
      }
      this.authReadyResolver();
    });
  }

  private handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    return errInfo;
  }

  private handleError(collectionName: string) {
    return (error: any) => {
      this.handleFirestoreError(error, OperationType.LIST, collectionName);
    };
  }

  private clearData() {
    this.users = [];
    this.jobs = [];
    this.skills = [];
    this.assessments = [];
    this.departments = [];
    this.logs = [];
    this.notifications = [];
    this.cycles = [];
    this.nominations = [];
    this.evidences = [];
  }

  private clearListeners() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }

  private setupListeners() {
    this.clearListeners(); // Ensure no duplicate listeners

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Users
    this.unsubscribers.push(
      onSnapshot(collection(db, 'users'), (snapshot) => {
        this.users = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            certificates: data.certificates ? JSON.parse(data.certificates) : []
          } as User;
        });
      }, this.handleError('users'))
    );

    // Jobs
    this.unsubscribers.push(
      onSnapshot(collection(db, 'jobProfiles'), (snapshot) => {
        this.jobs = snapshot.docs.map(doc => {
          const data = doc.data();
          let requirements = {};
          
          if (data.requirements) {
            try {
              const rawReqs = typeof data.requirements === 'string' ? JSON.parse(data.requirements) : data.requirements;
              // Ensure every level's requirement is an array
              requirements = Object.entries(rawReqs).reduce((acc: any, [level, reqs]: [string, any]) => {
                acc[level] = Array.isArray(reqs) ? reqs : Object.values(reqs || {});
                return acc;
              }, {});
            } catch (e) {
              console.error('Error parsing requirements for job', doc.id, e);
            }
          }

          return {
            id: doc.id,
            ...data,
            requirements
          } as JobProfile;
        });
      }, this.handleError('jobProfiles'))
    );

    // Skills
    this.unsubscribers.push(
      onSnapshot(collection(db, 'skills'), (snapshot) => {
        this.skills = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            levels: data.levels ? JSON.parse(data.levels) : {}
          } as Skill;
        });
      }, this.handleError('skills'))
    );

    // Departments
    this.unsubscribers.push(
      onSnapshot(collection(db, 'departments'), (snapshot) => {
        this.departments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
      }, this.handleError('departments'))
    );

    // Assessments
    this.unsubscribers.push(
      onSnapshot(collection(db, 'assessments'), (snapshot) => {
        this.assessments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Assessment));
      }, this.handleError('assessments'))
    );

    // Logs
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(50)), (snapshot) => {
        this.logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
      }, this.handleError('activityLogs'))
    );

    // Evidences
    this.unsubscribers.push(
      onSnapshot(collection(db, 'evidences'), (snapshot) => {
        this.evidences = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Evidence));
      }, this.handleError('evidences'))
    );

    // Notifications
    this.unsubscribers.push(
      onSnapshot(query(collection(db, 'notifications'), where('userId', '==', userId)), (snapshot) => {
        this.notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      }, this.handleError('notifications'))
    );

    // Cycles
    this.unsubscribers.push(
      onSnapshot(collection(db, 'assessmentCycles'), (snapshot) => {
        this.cycles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AssessmentCycle));
      }, this.handleError('assessmentCycles'))
    );

    // Nominations
    this.unsubscribers.push(
      onSnapshot(collection(db, 'nominations'), (snapshot) => {
        this.nominations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Nomination));
      }, this.handleError('nominations'))
    );
  }

  // --- Evidences ---
  getEvidences(filters?: { userId?: string, skillId?: string, status?: string }) {
    let result = this.evidences;
    if (filters?.userId) result = result.filter(e => e.userId === filters.userId);
    if (filters?.skillId) result = result.filter(e => e.skillId === filters.skillId);
    if (filters?.status) result = result.filter(e => e.status === filters.status);
    return result;
  }

  async addEvidence(evidence: Omit<Evidence, 'id' | 'status' | 'submittedAt'>) {
    const id = doc(collection(db, 'evidences')).id;
    const newEvidence: Evidence = {
      ...evidence,
      id,
      status: 'PENDING',
      submittedAt: new Date().toISOString()
    };
    await this.persistItem('evidences', newEvidence);
    
    // Notify manager
    const user = this.users.find(u => u.id === evidence.userId);
    if (user && user.managerId) {
      await this.addNotification({
        userId: user.managerId,
        title: 'New Evidence Submitted',
        message: `${user.name} submitted evidence for review.`,
        type: 'INFO'
      });
    }
    return newEvidence;
  }

  async updateEvidenceStatus(id: string, status: 'APPROVED' | 'REJECTED', reviewerId: string, level?: number) {
    const evidence = this.evidences.find(e => e.id === id);
    if (evidence) {
      const updatedEvidence = {
        ...evidence,
        status,
        reviewedAt: new Date().toISOString(),
        reviewedBy: reviewerId,
        assignedScore: status === 'APPROVED' ? (level || 3) : undefined
      };
      await this.updateItem('evidences', updatedEvidence);

      // Notify user
      await this.addNotification({
        userId: evidence.userId,
        title: `Evidence ${status}`,
        message: `Your evidence submission was ${status.toLowerCase()}.`,
        type: status === 'APPROVED' ? 'SUCCESS' : 'ERROR'
      });
    }
  }

  // --- Nominations ---
  getNominations(filters?: { subjectId?: string, raterId?: string, nominatorId?: string }) {
    let result = this.nominations;
    if (filters?.subjectId) result = result.filter(n => n.subjectId === filters.subjectId);
    if (filters?.raterId) result = result.filter(n => n.raterId === filters.raterId);
    if (filters?.nominatorId) result = result.filter(n => n.nominatorId === filters.nominatorId);
    return result;
  }

  async addNomination(nomination: Omit<Nomination, 'id' | 'date' | 'status'>) {
    const id = doc(collection(db, 'nominations')).id;
    const newNomination: Nomination = {
      ...nomination,
      id,
      date: new Date().toISOString(),
      status: 'PENDING'
    };
    await this.persistItem('nominations', newNomination);
    
    // Add notification to the rater
    await this.addNotification({
      userId: nomination.raterId,
      title: 'New Assessment Request',
      message: `You have been requested to assess ${this.getUserById(nomination.subjectId)?.name}.`,
      type: 'INFO'
    });

    return newNomination;
  }

  async updateNominationStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    const nomination = this.nominations.find(n => n.id === id);
    if (nomination) {
      await this.updateItem('nominations', { ...nomination, status });
    }
  }

  // --- INITIALIZATION ---
  
  async initialize() {
    console.log(`Initializing DataService with SOURCE: ${CONFIG.SOURCE}`);
    await this.authReady; // Wait for initial auth state
    
    // If not authenticated, we can't load data yet, but we are initialized
    this.isInitialized = true;
  }

  // --- AUTHENTICATION ---

  async signUp(email: string, password: string, userData: Partial<User>) {
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
      const user = userCredential.user;

      const isBootstrapAdmin = trimmedEmail.toLowerCase() === 'tarekmoh123@gmail.com';
      
      // Check if a profile already exists for this email (e.g. from bulk upload)
      const existingProfile = this.users.find(u => u.email.toLowerCase() === trimmedEmail.toLowerCase());
      
      const newUserProfile: User = existingProfile ? {
        ...existingProfile,
        id: user.uid,
        name: userData.name || existingProfile.name,
      } : {
        id: user.uid,
        email: trimmedEmail,
        name: userData.name || 'New User',
        role: isBootstrapAdmin ? Role.ADMIN : Role.EMPLOYEE,
        status: isBootstrapAdmin ? 'ACTIVE' : 'PENDING',
        departmentId: '',
        orgLevel: undefined,
        avatarUrl: `https://ui-avatars.com/api/?name=${userData.name}`
      };

      try {
        await this.persistItem('users', newUserProfile);
        // If we migrated from an existing profile, delete the old one
        if (existingProfile && existingProfile.id !== user.uid) {
          await this.deleteItem('users', existingProfile.id);
        }
      } catch (error) {
        // Error already handled in persistItem
      }
      
      await this.logActivity('Self-Registration', newUserProfile.name);
      
      return { user: newUserProfile };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  async loginWithPassword(email: string, password: string) {
    try {
      const trimmedEmail = email.trim().toLowerCase();
      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
      const user = userCredential.user;

      // Wait a moment for the snapshot listener to populate data
      // In a real app, you might want a more robust way to wait for the specific user doc
      await new Promise(resolve => setTimeout(resolve, 1000));

      const userProfile = this.users.find(u => u.id === user.uid);
      
      // Check for other profiles with the same email (duplicates from bulk upload)
      const duplicates = this.users.filter(u => u.email.toLowerCase() === trimmedEmail.toLowerCase() && u.id !== user.uid);
      for (const dup of duplicates) {
        try {
          await this.deleteItem('users', dup.id);
        } catch (e) {
          // Ignore if delete fails
        }
      }

      if (!userProfile) {
        // Try fetching directly if not in cache yet
        let docSnap;
        try {
          docSnap = await getDoc(doc(db, 'users', user.uid));
        } catch (error) {
          this.handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
          throw error;
        }
        
        if (!docSnap.exists()) {
           // Check if there's a profile with this email but a different ID (bulk uploaded)
           const bulkProfile = this.users.find(u => u.email.toLowerCase() === trimmedEmail.toLowerCase());
           if (bulkProfile) {
              // Migrate bulk profile to this UID
              const migratedProfile = { ...bulkProfile, id: user.uid };
              try {
                await this.persistItem('users', migratedProfile);
                await this.deleteItem('users', bulkProfile.id);
                return { user: migratedProfile };
              } catch (error) {
                // Fallback if migration fails
              }
           }

           const isBootstrapAdmin = trimmedEmail.toLowerCase() === 'tarekmoh123@gmail.com';
           if (isBootstrapAdmin) {
              // Auto-create profile for bootstrap admin if missing
              const adminProfile: User = {
                id: user.uid,
                email: trimmedEmail,
                name: 'System Admin',
                role: Role.ADMIN,
                status: 'ACTIVE',
                departmentId: '',
                avatarUrl: `https://ui-avatars.com/api/?name=Admin`
              };
              try {
                await this.persistItem('users', adminProfile);
              } catch (error) {
                // Error already handled in persistItem
              }
              return { user: adminProfile };
           }
           return { error: 'Profile not found for this user. Please sign up first.' };
        }

        const data = docSnap.data();
        const profile = {
          id: docSnap.id,
          ...data,
          certificates: data.certificates ? JSON.parse(data.certificates) : []
        } as User;
        
        const isBootstrapAdmin = trimmedEmail.toLowerCase() === 'tarekmoh123@gmail.com';
        if (profile.status === 'PENDING' && !isBootstrapAdmin) {
           await signOut(auth);
           return { error: 'Account is pending administrator approval. Please wait.' };
        }
        if (profile.status === 'REJECTED' && !isBootstrapAdmin) {
           await signOut(auth);
           return { error: 'Account has been deactivated by the administrator.' };
        }
        return { user: profile };
      }
      
      if (userProfile.status === 'PENDING') {
          await signOut(auth);
          return { error: 'Account is pending administrator approval. Please wait.' };
      }
      if (userProfile.status === 'REJECTED') {
          await signOut(auth);
          return { error: 'Account has been deactivated by the administrator.' };
      }

      return { user: userProfile };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  async resetPassword(email: string) {
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      return { success: true };
    } catch (error: any) {
      return { error: error.message };
    }
  }

  async signOut() {
    await signOut(auth);
  }

  async getCurrentUser() {
    if (!auth.currentUser) return null;
    
    const profile = this.users.find(u => u.id === auth.currentUser?.uid);
    if (profile) return profile;
    
    const docSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    if (docSnap.exists()) {
       const data = docSnap.data();
       return {
         id: docSnap.id,
         ...data,
         certificates: data.certificates ? JSON.parse(data.certificates) : []
       } as User;
    }
    return null;
  }

  // --- PERSISTENCE HELPERS ---

  private async persistItem(collectionName: string, item: any) {
    try {
      let payload = { ...item };
      
      // Serialize complex objects
      if (collectionName === 'users' && item.certificates) {
        payload.certificates = JSON.stringify(item.certificates);
      }
      if (collectionName === 'jobProfiles' && item.requirements) {
        payload.requirements = JSON.stringify(item.requirements);
      }
      if (collectionName === 'skills' && item.levels) {
        payload.levels = JSON.stringify(item.levels);
      }

      // Remove undefined values for Firestore
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          delete payload[key];
        }
      });

      await setDoc(doc(db, collectionName, item.id), payload);
    } catch (e) {
      this.handleFirestoreError(e, OperationType.WRITE, `${collectionName}/${item.id}`);
      throw e;
    }
  }

  private async deleteItem(collectionName: string, id: string) {
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (e) {
      this.handleFirestoreError(e, OperationType.DELETE, `${collectionName}/${id}`);
      throw e;
    }
  }

  private async updateItem(collectionName: string, item: any) {
     await this.persistItem(collectionName, item);
  }

  async uploadAvatar(userId: string, file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 200;
          let width = img.width;
          let height = img.height;

          // Square crop and resize
          const size = Math.min(width, height);
          const startX = (width - size) / 2;
          const startY = (height - size) / 2;

          canvas.width = MAX_SIZE;
          canvas.height = MAX_SIZE;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(img, startX, startY, size, size, 0, 0, MAX_SIZE, MAX_SIZE);
            // WebP, 80% quality 
            const dataUrl = canvas.toDataURL('image/webp', 0.8);

            const user = this.getUserById(userId);
            if (user) {
              user.avatarUrl = dataUrl;
              try {
                await this.updateItem('users', user);
                resolve(dataUrl);
              } catch (err) {
                reject(err);
              }
            } else {
              reject(new Error('User not found'));
            }
          } else {
            reject(new Error('Canvas context not available'));
          }
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- HIERARCHY & ROLES ---
  isManager(user: User): boolean {
    if (user.role === Role.ADMIN) return true;
    
    // If the employee officially has subordinates they are automatically a manager
    const hasSubordinates = this.users.some(u => u.managerId === user.id);
    if (hasSubordinates) return true;

    // Default fallback to hierarchy level
    const managerialLevels: OrgLevel[] = ['GM', 'AGM', 'DM', 'SH'];
    return user.orgLevel ? managerialLevels.includes(user.orgLevel) : false;
  }

  generateIndividualTrainingPlan(userId: string): IndividualTrainingPlan | null {
    const user = this.getUserById(userId);
    if (!user || !user.jobProfileId || !user.orgLevel) return null;

    const job = this.getJobProfile(user.jobProfileId);
    if (!job) return null;

    const requirements = job.requirements[user.orgLevel] || [];
    const recommendations: TrainingRecommendation[] = [];

    requirements.forEach(req => {
      const currentScore = this.getUserSkillScore(userId, req.skillId);
      const gap = req.requiredLevel - currentScore;

      if (gap > 0) {
        const skill = this.getSkill(req.skillId);
        const skillName = skill?.name || 'Unknown Skill';
        
        let recommendation = '';
        if (gap >= 2) {
          recommendation = `Intensive training and external certification required for ${skillName}.`;
        } else {
          recommendation = `On-the-job training and mentorship recommended to reach proficiency level ${req.requiredLevel}.`;
        }

        recommendations.push({
          skillId: req.skillId,
          skillName,
          gap,
          recommendation,
          priority: gap >= 2 ? 'HIGH' : 'MEDIUM'
        });
      }
    });

    return {
      userId,
      recommendations: recommendations.sort((a, b) => b.gap - a.gap),
      generatedAt: new Date().toISOString()
    };
  }

  generateCareerPath(userId: string): CareerProgressionPlan | null {
    const user = this.getUserById(userId);
    if (!user || !user.jobProfileId || !user.orgLevel) return null;

    const job = this.getJobProfile(user.jobProfileId);
    if (!job) return null;

    const currentIndex = ORG_HIERARCHY_ORDER.indexOf(user.orgLevel);
    // Promotion moves "up" the hierarchy, which is index - 1 (Top is GM at index 0)
    if (currentIndex <= 0 || currentIndex === -1) return null;

    const nextLevel = ORG_HIERARCHY_ORDER[currentIndex - 1];
    const requirements = job.requirements[nextLevel] || [];
    const promReqs: PromotionRequirement[] = [];
    let isReady = requirements.length > 0;
    
    requirements.forEach(req => {
      const currentScore = this.getUserSkillScore(userId, req.skillId);
      const gap = Math.max(0, req.requiredLevel - currentScore);
      const skill = this.getSkill(req.skillId);
      
      promReqs.push({
        skillId: req.skillId,
        skillName: skill?.name || 'Unknown Skill',
        currentScore,
        requiredScore: req.requiredLevel,
        gap
      });

      if (gap > 0) isReady = false;
    });

    return {
      userId,
      currentLevel: user.orgLevel,
      nextLevel: requirements.length > 0 ? nextLevel : null,
      requirements: promReqs,
      isReadyForPromotion: isReady && requirements.length > 0
    };
  }

  // --- PUBLIC METHODS (GETTERS - Synchronous for UI Performance) ---

  login(email: string): User | undefined {
    return this.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  getUserById(id: string) { return this.users.find(u => u.id === id); }
  getJobProfile(id: string) { return this.jobs.find(j => j.id === id); }
  getAllSkills() { return this.skills; }
  getAllJobs() { return this.jobs; }
  getAllUsers() { return this.users; }
  getAllDepartments() { return this.departments; }
  getSkill(id: string) { return this.skills.find(s => s.id === id); }
  getSystemLogs() { return this.logs; }

  getGeneralDeptId(deptId: string | undefined): string | undefined {
    if (!deptId) return undefined;
    const dept = this.departments.find(d => d.id === deptId);
    if (!dept) return undefined;
    if (dept.type === 'GENERAL' || !dept.parentId) return dept.id;
    return this.getGeneralDeptId(dept.parentId);
  }

  getSubordinates(managerId: string) {
    return this.users.filter(u => u.managerId === managerId);
  }

  getPeers(userId: string) {
    const user = this.getUserById(userId);
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

  getUserSkillScore(userId: string, skillId: string, includeArchived: boolean = false): number {
    const skill = this.getSkill(skillId);
    if (!skill) return 0;

    // Behavioral (360) Logic
    if (skill.assessmentMethod === '360_EVALUATION' || !skill.assessmentMethod) {
      let userAssessments = this.assessments.filter(a => a.subjectId === userId && a.skillId === skillId);
      if (!includeArchived) {
        userAssessments = userAssessments.filter(a => !a.isArchived);
      }
      if (userAssessments.length === 0) return 0;
      
      const selfA = userAssessments.filter(a => a.type === 'SELF');
      const peerA = userAssessments.filter(a => a.type === 'PEER');
      const mgrA = userAssessments.filter(a => a.type === 'MANAGER');

      const avgSelf = selfA.length > 0 ? selfA.reduce((s, a) => s + a.score, 0) / selfA.length : null;
      const avgPeer = peerA.length > 0 ? peerA.reduce((s, a) => s + a.score, 0) / peerA.length : null;
      const avgMgr = mgrA.length > 0 ? mgrA.reduce((s, a) => s + a.score, 0) / mgrA.length : null;

      let totalWeight = 0;
      let weightedScore = 0;

      if (avgSelf !== null) { weightedScore += avgSelf * 0.10; totalWeight += 0.10; } // 10% weight
      if (avgPeer !== null) { weightedScore += avgPeer * 0.30; totalWeight += 0.30; } // 30% weight
      if (avgMgr  !== null) { weightedScore += avgMgr  * 0.60; totalWeight += 0.60; } // 60% weight

      if (totalWeight === 0) return 0;
      
      // Normalize to 100% based on available weights
      return Math.round(weightedScore / totalWeight);
    } 
    // Evidence, Online Assessment, or Interview Logic
    else {
      // Find the highest assignedScore from approved evidence submissions for this skill.
      const relevantEvidence = this.evidences.filter(e => e.userId === userId && e.skillId === skillId && e.status === 'APPROVED' && e.assignedScore);
      if (relevantEvidence.length === 0) return 0;

      const maxScore = Math.max(...relevantEvidence.map(e => e.assignedScore || 0));
      return Math.min(Math.max(Math.round(maxScore), 1), 5); // Ensure it's between 1 and 5
    }
  }

  getAssessments(filters: { raterId?: string, subjectId?: string, cycleId?: string, skillId?: string }) {
    return this.assessments.filter(a => {
      const matchRater = filters.raterId ? a.raterId === filters.raterId : true;
      const matchSubject = filters.subjectId ? a.subjectId === filters.subjectId : true;
      const matchCycle = filters.cycleId ? a.cycleId === filters.cycleId : true;
      const matchSkill = filters.skillId ? a.skillId === filters.skillId : true;
      return matchRater && matchSubject && matchCycle && matchSkill;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  // --- CYCLES ---
  getAllCycles() {
    return [...this.cycles].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }

  getActiveCycle() {
    return this.cycles.find(c => c.status === 'ACTIVE');
  }

  async addCycle(cycle: Omit<AssessmentCycle, 'id'>) {
    const id = doc(collection(db, 'assessmentCycles')).id;
    const newCycle: AssessmentCycle = {
      ...cycle,
      id
    };
    await this.persistItem('assessmentCycles', newCycle);
    await this.logActivity('Created Assessment Cycle', newCycle.name);

    // Notify all users about the new cycle
    for (const u of this.users) {
      await this.addNotification({
        userId: u.id,
        title: 'New Assessment Cycle',
        message: `The ${newCycle.name} assessment cycle is now active. Due date: ${new Date(newCycle.dueDate).toLocaleDateString()}`,
        type: 'INFO',
        actionLink: 'emp-assessment'
      });
    }
  }

  async updateCycle(cycle: AssessmentCycle) {
    await this.updateItem('assessmentCycles', cycle);
    await this.logActivity('Updated Assessment Cycle', cycle.name);
  }

  async archiveAssessments(filters: { departmentId?: string, jobProfileId?: string, skillId?: string }) {
    let affectedCount = 0;
    
    // Find all users that match the profile filters
    const matchedUsers = this.users.filter(u => {
      if (filters.departmentId && u.departmentId !== filters.departmentId) return false;
      if (filters.jobProfileId && u.jobProfileId !== filters.jobProfileId) return false;
      return true;
    });

    const matchedUserIds = matchedUsers.map(u => u.id);

    // Find all active assessments that belong to these users and match the skill filter
    const activeAssessments = this.assessments.filter(a => 
      !a.isArchived && 
      matchedUserIds.includes(a.subjectId) &&
      (filters.skillId ? a.skillId === filters.skillId : true)
    );

    // Archive them
    for (const assessment of activeAssessments) {
      const archived = { ...assessment, isArchived: true };
      await this.persistItem('assessments', archived);
      affectedCount++;
    }

    // Send notification to affected users
    if (affectedCount > 0) {
      const uniqueAffectedUserIds = Array.from(new Set(activeAssessments.map(a => a.subjectId)));
      for (const uid of uniqueAffectedUserIds) {
        await this.addNotification({
          userId: uid,
          title: 'Skill Matrix Reset',
          message: 'Your previous assessments for certain skills have been archived. A new evaluation is required to ensure compliance.',
          type: 'WARNING',
          actionLink: 'emp-assessment'
        });
      }
      await this.logActivity('Archived Assessments', `Archived ${affectedCount} assessments due to admin reset.`);
    }

    return affectedCount;
  }

  // --- NOTIFICATIONS ---
  
  getNotifications(userId: string): Notification[] {
    const user = this.users.find(u => u.id === userId);
    if (!user) return [];

    const dynamicNotifications: Notification[] = [];

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

    if (this.isManager(user) && user.role !== Role.ADMIN) {
      const teamMembers = this.users.filter(u => u.managerId === user.id);
      const teamMemberIds = new Set(teamMembers.map(u => u.id));
      
      const recentAssessments = this.assessments.filter(a => 
        teamMemberIds.has(a.subjectId) && 
        a.raterId !== user.id && 
        new Date(a.date).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
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

    return [...dynamicNotifications, ...this.notifications.filter(n => n.userId === userId)]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async markNotificationAsRead(notificationId: string) {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      await this.updateItem('notifications', { ...notification, isRead: true });
    }
  }

  async markAllNotificationsAsRead(userId: string) {
    const unread = this.notifications.filter(n => n.userId === userId && !n.isRead);
    for (const n of unread) {
      await this.updateItem('notifications', { ...n, isRead: true });
    }
  }

  async addNotification(notification: Omit<Notification, 'id' | 'createdAt' | 'isRead'>) {
    const id = doc(collection(db, 'notifications')).id;
    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: new Date().toISOString(),
      isRead: false
    };
    await this.persistItem('notifications', newNotification);
  }

  // --- ACTIONS (Async Write-Behind) ---

  public async logActivity(action: string, target: string) {
    const id = doc(collection(db, 'activityLogs')).id;
    const newLog: ActivityLog = {
        id,
        action,
        target,
        timestamp: new Date().toISOString()
    };
    await this.persistItem('activityLogs', newLog);
  }

  async addAssessment(assessment: Omit<Assessment, 'id' | 'date'>) {
    const id = doc(collection(db, 'assessments')).id;
    const newAssessment: Assessment = {
      ...assessment,
      id,
      date: new Date().toISOString(),
    };
    await this.persistItem('assessments', newAssessment);
    
    const subject = this.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
    await this.logActivity('Submitted Assessment', `For ${subject}`);

    if (assessment.raterId !== assessment.subjectId) {
      await this.addNotification({
        userId: assessment.subjectId,
        title: 'New Assessment Received',
        message: `You received a new assessment.`,
        type: 'INFO',
        actionLink: 'emp-dashboard'
      });
    }
  }

  async updateAssessment(assessment: Assessment) {
    await this.updateItem('assessments', assessment);
    const subject = this.users.find(u => u.id === assessment.subjectId)?.name || 'Employee';
    await this.logActivity('Updated Assessment', `For ${subject}`);
  }

  async addSkill(skill: Skill) { 
    await this.persistItem('skills', skill);
    await this.logActivity('Defined New Skill', skill.name);
  }
  
  async addJobProfile(job: JobProfile) { 
    await this.persistItem('jobProfiles', job);
    await this.logActivity('Created Job Profile', job.title);
  }
  
  async addUser(user: User) { 
    await this.persistItem('users', user);
    await this.logActivity('Onboarded Employee', user.name);
  }

  async addDepartment(dept: Department) {
    await this.persistItem('departments', dept);
    await this.logActivity('Created Department', dept.name);
  }

  async updateDepartment(dept: Department) {
    await this.updateItem('departments', dept);
    await this.logActivity('Updated Department', dept.name);
  }

  async updateUser(user: User) {
    await this.updateItem('users', user);
    await this.logActivity('Updated Profile', user.name);
  }
  
  async updateJobProfile(job: JobProfile) {
    await this.updateItem('jobProfiles', job);
    await this.logActivity('Modified Job Profile', job.title);
  }
  
  async updateSkill(skill: Skill) {
    await this.updateItem('skills', skill);
    await this.logActivity('Updated Skill Standard', skill.name);
  }

  async approveSkill(id: string) {
    const skill = this.skills.find(s => s.id === id);
    if (skill) {
      await this.updateItem('skills', { ...skill, status: 'APPROVED' });
      await this.logActivity('Approved New Skill', skill.name);
    }
  }

  // --- REMOVE METHODS ---

  async removeUser(id: string) {
    const user = this.users.find(u => u.id === id);
    if (user) {
        await this.deleteItem('users', id);
        await this.logActivity('Removed Employee', user.name);
    }
  }

  async removeJobProfile(id: string) {
    const job = this.jobs.find(j => j.id === id);
    if (job) {
        await this.deleteItem('jobProfiles', id);
        await this.logActivity('Removed Job Profile', job.title);
    }
  }

  async removeSkill(id: string) {
    const skill = this.skills.find(s => s.id === id);
    if (skill) {
        await this.deleteItem('skills', id);
        await this.logActivity('Removed Skill', skill.name);
    }
  }

  async removeDepartment(id: string) {
    const dept = this.departments.find(d => d.id === id);
    if (dept) {
        await this.deleteItem('departments', id);
        await this.logActivity('Removed Department', dept.name);
    }
  }
}

export const dataService = new DataService();
