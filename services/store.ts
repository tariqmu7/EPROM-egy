import { User, Role, JobProfile, Skill, Project, Department, Assessment, ActivityLog, ORG_HIERARCHY_ORDER, ORG_LEVEL_NUMBERS, Notification, AssessmentCycle, Nomination, IndividualTrainingPlan, TrainingRecommendation, OrgLevel, Evidence, PromotionRequirement, CareerProgressionPlan, CareerLevelProgress, TrainingCourse, ScheduledAssessment, AssessmentMethod, UserStatus } from '../types';
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
  private trainingCourses: TrainingCourse[] = [];
  private scheduledAssessments: ScheduledAssessment[] = [];
  private projects: Project[] = [];

  
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
    this.trainingCourses = [];
    this.scheduledAssessments = [];
    this.projects = [];
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
            certificates: data.certificates ? (typeof data.certificates === 'string' ? JSON.parse(data.certificates) : data.certificates) : []
          } as User;
        });
        this.checkCertificationExpiries();
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

          const job = {
            id: doc.id,
            ...data,
            requirements
          } as JobProfile;

          if (!job.code) {
            job.code = this.generateJobProfileCode(job);
          }
          return job;
        });
      }, this.handleError('jobProfiles'))
    );

    // Skills
    this.unsubscribers.push(
      onSnapshot(collection(db, 'skills'), (snapshot) => {
        this.skills = snapshot.docs.map(doc => {
          const data = doc.data();
          const skill = {
            id: doc.id,
            ...data,
            levels: data.levels ? JSON.parse(data.levels) : {}
          } as Skill;

          if (!skill.code) {
            skill.code = this.generateSkillCode(skill);
          }
          return skill;
        });
      }, this.handleError('skills'))
    );

    // Departments
    this.unsubscribers.push(
      onSnapshot(collection(db, 'departments'), (snapshot) => {
        this.departments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
      }, this.handleError('departments'))
    );

    // Projects
    this.unsubscribers.push(
      onSnapshot(collection(db, 'projects'), (snapshot) => {
        this.projects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      }, this.handleError('projects'))
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

    // Training Courses
    this.unsubscribers.push(
      onSnapshot(collection(db, 'trainingCourses'), (snapshot) => {
        this.trainingCourses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TrainingCourse));
      }, this.handleError('trainingCourses'))
    );

    // Scheduled Assessments
    this.unsubscribers.push(
      onSnapshot(collection(db, 'scheduledAssessments'), (snapshot) => {
        this.scheduledAssessments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ScheduledAssessment));
      }, this.handleError('scheduledAssessments'))
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
      
      // Destroy the automatic Firebase session for pending users
      if (!isBootstrapAdmin) {
        await signOut(auth);
      }
      
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
    
    const user = auth.currentUser;
    const isBootstrapAdmin = user.email?.toLowerCase() === 'tarekmoh123@gmail.com';
    
    let profile = this.users.find(u => u.id === user.uid);
    
    if (!profile) {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists()) {
         const data = docSnap.data();
         profile = {
           id: docSnap.id,
           ...data,
           certificates: data.certificates ? JSON.parse(data.certificates) : []
         } as User;
      }
    }

    if (profile) {
      // Enforce approval status check
      if (!isBootstrapAdmin && (profile.status === 'PENDING' || profile.status === 'REJECTED')) {
        await signOut(auth);
        return null;
      }
      return profile;
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
    if (user.role === Role.ADMIN || user.role === Role.CEO) return true;
    
    // If the employee officially has subordinates they are automatically a manager
    const hasSubordinates = this.users.some(u => u.managerId === user.id);
    if (hasSubordinates) return true;

    // Default fallback to hierarchy level
    const managerialLevels: OrgLevel[] = ['CEO', 'GM', 'AGM', 'DM', 'SH'];
    return user.orgLevel ? managerialLevels.includes(user.orgLevel) : false;
  }

  getVisibleUsers(currentUser: User): User[] {
    if (currentUser.role === Role.ADMIN || currentUser.role === Role.CEO) {
      return this.users;
    }
    
    // Managers can see their subordinates and indirect subordinates
    const subordinates = this.getSubordinatesRecursive(currentUser.id);
    return [currentUser, ...subordinates];
  }

  private getSubordinatesRecursive(managerId: string): User[] {
    const direct = this.users.filter(u => u.managerId === managerId);
    let all: User[] = [...direct];
    for (const d of direct) {
      all = [...all, ...this.getSubordinatesRecursive(d.id)];
    }
    return all;
  }

  // Objective 1: Certification Expiry & Compliance Workflows
  async checkCertificationExpiries() {
    const today = new Date();
    
    for (const user of this.users) {
      if (!user.certificates || user.certificates.length === 0) continue;
      
      let userUpdated = false;
      const updatedCerts = [...user.certificates];

      for (let i = 0; i < updatedCerts.length; i++) {
        const cert = updatedCerts[i];
        if (!cert.expiryDate) continue;
        
        const expiry = new Date(cert.expiryDate);
        const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        let newStatus: 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' = 'VALID';
        if (diffDays <= 0) newStatus = 'EXPIRED';
        else if (diffDays <= 90) newStatus = 'EXPIRING_SOON';

        if (cert.renewalStatus !== newStatus) {
          updatedCerts[i] = { ...cert, renewalStatus: newStatus };
          userUpdated = true;

          if ([90, 60, 30].includes(diffDays) || diffDays <= 0) {
            const message = diffDays <= 0 
              ? `CRITICAL: Your certification "${cert.name}" has EXPIRED.` 
              : `Warning: Your certification "${cert.name}" expires in ${diffDays} days.`;

            await this.addNotification({
              userId: user.id,
              title: 'Certification Renewal Alert',
              message,
              type: diffDays <= 0 ? 'ERROR' : 'WARNING'
            });

            if (user.managerId) {
              await this.addNotification({
                userId: user.managerId,
                title: `Compliance Alert: ${user.name}`,
                message: `Subordinate ${user.name} has a certification requirement: ${message}`,
                type: 'INFO'
              });
            }
          }
        }
      }

      if (userUpdated) {
        const userRef = doc(db, 'users', user.id);
        await updateDoc(userRef, { certificates: JSON.stringify(updatedCerts) });
      }
    }
  }

  generateDepartmentalTNA(departmentId: string) {
    const deptUsers = this.users.filter(u => u.departmentId === departmentId);
    const skillGaps: Record<string, { skillId: string, skillName: string, gapCount: number, totalGap: number }> = {};
    
    deptUsers.forEach(user => {
      const itp = this.generateIndividualTrainingPlan(user.id);
      if (itp) {
        itp.recommendations.forEach(rec => {
          if (!skillGaps[rec.skillId]) {
            skillGaps[rec.skillId] = { skillId: rec.skillId, skillName: rec.skillName, gapCount: 0, totalGap: 0 };
          }
          skillGaps[rec.skillId].gapCount++;
          skillGaps[rec.skillId].totalGap += rec.gap;
        });
      }
    });
    
    return Object.values(skillGaps)
      .map(gap => ({
        ...gap,
        averageGap: gap.totalGap / gap.gapCount,
        priority: gap.gapCount > (deptUsers.length * 0.5) ? 'HIGH' : (gap.gapCount > (deptUsers.length * 0.2) ? 'MEDIUM' : 'LOW')
      }))
      .sort((a, b) => b.gapCount - a.gapCount);
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
        
        const matchingCourse = this.trainingCourses.find(c => c.linkedSkillIds.includes(req.skillId));
        
        let recommendationText = '';
        if (matchingCourse) {
          recommendationText = `Enroll in "${matchingCourse.title}" (${matchingCourse.provider}) to bridge the gap.`;
        } else if (gap >= 2) {
          recommendationText = `Intensive training and external certification required for ${skillName}.`;
        } else {
          recommendationText = `On-the-job training and mentorship recommended to reach proficiency level ${req.requiredLevel}.`;
        }

        const targetDate = new Date();
        targetDate.setMonth(targetDate.getMonth() + (gap >= 2 ? 6 : 3));

        recommendations.push({
          skillId: req.skillId,
          skillName,
          gap,
          recommendation: recommendationText,
          priority: gap >= 2 ? 'HIGH' : 'MEDIUM',
          status: 'NOT_STARTED',
          targetDate: targetDate.toISOString(),
          supervisorSignOff: false,
          courseId: matchingCourse?.id
        });
      }
    });

    return {
      id: `itp_${userId}_${Date.now()}`,
      userId,
      recommendations: recommendations.sort((a, b) => b.gap - a.gap),
      generatedAt: new Date().toISOString(),
      status: 'ACTIVE'
    };
  }

  getEmployeeAssessmentQueue(userId: string) {
    const user = this.getUserById(userId);
    if (!user || !user.jobProfileId || !user.orgLevel) return null;

    const job = this.getJobProfile(user.jobProfileId);
    if (!job) return null;

    const requirements = job.requirements[user.orgLevel] || [];
    const scheduled = this.scheduledAssessments.filter(a => a.userId === userId);

    const writtenExams: any[] = [];
    const managerialInterviews: any[] = [];
    const evaluations360: any[] = [];
    const workRecords: any[] = [];

    requirements.forEach(req => {
      const currentScore = this.getUserSkillScore(userId, req.skillId);
      if (currentScore < req.requiredLevel) {
        const skill = this.getSkill(req.skillId);
        if (!skill) return;

        const assessment = scheduled.find(s => s.skillId === req.skillId);
        
        // Find the actual assessment record for this skill if it was completed
        const result = assessment?.status === 'COMPLETED' 
            ? this.assessments.find(a => a.subjectId === userId && a.skillId === req.skillId && !a.isArchived)
            : null;

        const item = {
          skill,
          requiredLevel: req.requiredLevel,
          currentLevel: currentScore,
          scheduledDate: assessment?.scheduledDate,
          status: assessment?.status || 'PENDING_SCHEDULE',
          assessorId: assessment?.assessorId,
          assessmentId: assessment?.id,
          achievedScore: result?.score,
          comment: result?.comment
        };

        if (skill.requiresCertificate) {
          workRecords.push(item);
        } else {
          switch (skill.assessmentMethod) {
            case 'WRITTEN_EXAM':
              writtenExams.push(item);
              break;
            case 'INTERVIEW':
            case 'PRACTICAL_DEMO':
              managerialInterviews.push(item);
              break;
            case 'OJT_OBSERVATION':
              evaluations360.push(item);
              break;
            case 'WORK_RECORD_REVIEW':
              workRecords.push(item);
              break;
          }
        }
      }
    });

    return { writtenExams, managerialInterviews, evaluations360, workRecords };
  }

  generateCareerPath(userId: string): CareerProgressionPlan | null {
    const user = this.getUserById(userId);
    if (!user || !user.jobProfileId || !user.orgLevel) return null;

    const currentJob = this.getJobProfile(user.jobProfileId);
    if (!currentJob) return null;

    // Succession Logic: Find all jobs in the same General Department to bridge gap requirements
    const generalDeptId = this.getGeneralDeptId(user.departmentId);
    const deptJobs = this.getAllJobs().filter(j => this.getGeneralDeptId(j.departmentId) === generalDeptId);

    const currentIndex = ORG_HIERARCHY_ORDER.indexOf(user.orgLevel);
    if (currentIndex === -1) return null;

    const roadmap: CareerLevelProgress[] = [];

    // Loop from current position up to GM (index 0)
    for (let i = currentIndex - 1; i >= 0; i--) {
      const level = ORG_HIERARCHY_ORDER[i];
      
      // Smart Lookup: Try current job profile first, then search general department for that level's standards
      let requirements = currentJob.requirements[level] || [];
      if (requirements.length === 0) {
        const fallbackJob = deptJobs.find(j => (j.requirements[level]?.length || 0) > 0);
        if (fallbackJob) {
          requirements = fallbackJob.requirements[level] || [];
        }
      }

      const promReqs: PromotionRequirement[] = [];
      let totalGapPoints = 0;
      
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

        totalGapPoints += gap;
      });

      let readinessStatus: 'READY_NOW' | 'READY_1_2_YEARS' | 'READY_3_5_YEARS' | 'DEVELOPMENT_NEEDED' = 'DEVELOPMENT_NEEDED';
      if (totalGapPoints === 0 && requirements.length > 0) readinessStatus = 'READY_NOW';
      else if (totalGapPoints <= 2) readinessStatus = 'READY_1_2_YEARS';
      else if (totalGapPoints <= 5) readinessStatus = 'READY_3_5_YEARS';

      roadmap.push({
        level,
        requirements: promReqs,
        readinessStatus,
        isDefined: requirements.length > 0
      });
    }

    return {
      userId,
      currentLevel: user.orgLevel,
      roadmap
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
  getPublicUsers() { 
    return this.users.filter(u => u.role !== Role.CEO && u.orgLevel !== 'CEO'); 
  }
  getAllDepartments() { return this.departments; }
  getSkill(id: string) { return this.skills.find(s => s.id === id); }
  getSystemLogs() { return this.logs; }
  getAllProjects() { return this.projects; }
  getProjectById(id: string) { return this.projects.find(p => p.id === id); }


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
    if (skill.assessmentMethod === 'OJT_OBSERVATION' || !skill.assessmentMethod) {
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
      // Check for direct Assessment results first (Online/Interview)
      let directAssessments = this.assessments.filter(a => a.subjectId === userId && a.skillId === skillId && (a.type === 'WRITTEN_EXAM' || a.type === 'INTERVIEW' || a.type === 'PRACTICAL_DEMO'));
      if (!includeArchived) {
        directAssessments = directAssessments.filter(a => !a.isArchived);
      }
      
      if (directAssessments.length > 0) {
        // Return the latest assessment score
        return directAssessments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].score;
      }

      // Fallback: Find the highest assignedScore from approved evidence submissions for this skill.
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
    
    // Auto-update notification for the subject
    await this.addNotification({
      userId: assessment.subjectId,
      title: 'New Evaluation Result',
      message: `A new ${assessment.method} evaluation has been registered for your profile.`,
      type: 'INFO'
    });

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
    if (!skill.code) {
        skill.code = this.generateSkillCode(skill);
    }
    await this.persistItem('skills', skill);
    await this.logActivity('Defined New Skill', skill.name);
  }
  
  public generateSkillCode(skill: Skill): string {
    const catPrefix = (skill.category || 'GEN').substring(0, 3).toUpperCase();
    const namePrefix = (skill.name || 'SKL').replace(/\s+/g, '').substring(0, 3).toUpperCase();
    
    // Count existing skills with this prefix to get a sequential index
    const existingCount = this.skills.filter(s => s.code?.startsWith(`${catPrefix}-${namePrefix}`)).length;
    const index = (existingCount + 1).toString().padStart(2, '0');
    
    return `${catPrefix}-${namePrefix}-${index}`;
  }

  async addJobProfile(job: JobProfile) { 
    if (!job.code) {
        job.code = this.generateJobProfileCode(job);
    }
    await this.persistItem('jobProfiles', job);
    await this.logActivity('Created Job Profile', job.title);
  }

  public generateJobProfileCode(job: JobProfile): string {
    const dept = this.departments.find(d => d.id === job.departmentId);
    const deptPrefix = (dept?.name || 'GEN').substring(0, 3).toUpperCase();
    
    // Title Initials (e.g., "Department Manager" -> "DM")
    const titleInitials = job.title
        .split(/\s+/)
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 4); // Keep it reasonable
        
    return `${deptPrefix}-${titleInitials}`;
  }
  
  async addUser(user: User) { 
    await this.persistItem('users', user);
    await this.logActivity('Onboarded Employee', user.name);
  }

  async addDepartment(dept: Department) {
    await this.persistItem('departments', dept);
    await this.logActivity('Created Department', dept.name);
  }

  async addProject(project: Omit<Project, 'id'>) {
    const id = doc(collection(db, 'projects')).id;
    const newProject = { ...project, id };
    await this.persistItem('projects', newProject);
    await this.logActivity('Create Project', newProject.name);
    return newProject;
  }

  async updateProject(project: Project) {
    await this.updateItem('projects', project);
    await this.logActivity('Update Project', project.name);
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

  async removeProject(id: string) {
    const project = this.getProjectById(id);
    if (project) {
      await this.deleteItem('projects', id);
      await this.logActivity('Delete Project', project.name);
    }
  }


  getAssessmentHistory(viewer: User, targetSubjectId?: string) {
    const effectiveTargetId = (viewer.role === Role.ADMIN || viewer.role === Role.CEO) 
      ? (targetSubjectId || viewer.id)
      : (this.isManager(viewer) ? (targetSubjectId || viewer.id) : viewer.id);

    // If viewer is manager but target is not in their visible tree, restrict to self
    const visibleUsers = this.getVisibleUsers(viewer);
    const isTargetVisible = visibleUsers.some(u => u.id === effectiveTargetId);
    const finalSubjectId = isTargetVisible ? effectiveTargetId : viewer.id;

    const pastAssessments = this.assessments
      .filter(a => a.subjectId === finalSubjectId)
      .map(a => ({
        id: a.id,
        date: a.date,
        method: a.method,
        raterId: a.raterId,
        skillId: a.skillId,
        score: a.score,
        comment: a.comment,
        status: 'COMPLETED' as const,
        source: 'ASSESSMENT' as const
      }));

    const pastEvidences = this.evidences
      .filter(e => e.userId === finalSubjectId && (e.status === 'APPROVED' || e.status === 'REJECTED'))
      .map(e => ({
        id: e.id,
        date: e.reviewedAt || e.submittedAt,
        method: 'WORK_RECORD_REVIEW' as const,
        raterId: e.reviewedBy || '',
        skillId: e.skillId,
        score: e.assignedScore || 0,
        comment: e.reviewerComment || '',
        status: e.status as 'COMPLETED' | 'REJECTED' | 'APPROVED',
        source: 'EVIDENCE' as const
      }));

    return [...pastAssessments, ...pastEvidences].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }
}

export const dataService = new DataService();
