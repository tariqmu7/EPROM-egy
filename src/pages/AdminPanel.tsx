import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect, lazy, Suspense } from 'react';
import { Avatar } from '../components/Avatar';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { useSessionState } from '../hooks/useSessionState';
import { User, Role, Skill } from '../types';
import { Plus, Users, ChevronRight, CheckCircle, ShieldCheck, Trash2, ArrowLeft, UserPlus, Building2, Search, Edit2, AlertCircle, BookOpen, Activity, Eye, FileSpreadsheet, TrendingUp, ChevronDown } from 'lucide-react';
import { BulkUpload } from '../components/BulkUpload';
import { CriticalityBadge } from '../components/CriticalityBadge';
import { FormPage } from './admin/FormPage';
import { SkillDetailsModal } from './admin/SkillDetailsModal';
import { PromotionModal } from './admin/PromotionModal';
import { UserForm } from './admin/UserForm';
import { JobForm } from './admin/JobForm';
import { SkillForm } from './admin/SkillForm';
import { DepartmentForm } from './admin/DepartmentForm';
import { ProjectForm } from './admin/ProjectForm';
import { CompanyOrgView, OrgSelection } from './admin/CompanyOrgView';

// The three self-contained admin screens are loaded ON DEMAND. Each is a whole
// page of its own (Analytics drags the entire charting library in with it), and
// none of them is on the path an admin takes to manage users, skills or the org
// chart — so they are split out of the admin bundle rather than shipped with it.
const AdminAnalytics = lazy(() => import('./AdminAnalytics').then(m => ({ default: m.AdminAnalytics })));
const AnnualAppraisalAdmin = lazy(() => import('./AnnualAppraisalAdmin').then(m => ({ default: m.AnnualAppraisalAdmin })));
const AuditTrail = lazy(() => import('./AuditTrail').then(m => ({ default: m.AuditTrail })));

// Never a zeroed figure while a screen is in flight — the same rule the coverage
// tiles follow: say "loading", never print a number nobody measured.
const ScreenLoading: React.FC = () => (
  <div className="p-12 text-center text-sm font-bold uppercase tracking-wider text-slate-400">Loading…</div>
);

// The admin screen is a SHELL: it owns the shared state (which view, the search
// term, the filters, the form being edited) and the save/delete handlers, and
// hands each tab's real UI to a component in `./admin/`. The forms and the org
// chart used to live in this file — 3,286 lines of it — which is why the admin
// bundle was the biggest chunk in the app.
export const AdminPanel: React.FC<{ view: string; onNavigate: (tab: string) => void }> = React.memo(({ view, onNavigate }) => {
  const [refreshKey, setRefreshKey] = useState(0); 
  const [formMode, setFormMode] = useState(false);
  const [formType, setFormType] = useState<'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT' | null>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [viewSkill, setViewSkill] = useState<Skill | null>(null);
  // Per-view list filter (Users: status; Skills: category). Persisted per view so
  // a refresh keeps the filter the admin had selected (finer state → sessionStorage).
  const [activeTab, setActiveTab] = useSessionState<string>(`admin-filter-${view}`, 'ALL');
  const [selectedDeptProfileId, setSelectedDeptProfileId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  // Lifted out of CompanyOrgView so the org-chart selection survives the form
  // toggle (editing a unit unmounts the tree; without this the view reset to root).
  const [orgSelection, setOrgSelection] = useState<OrgSelection>({ kind: 'root' });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [promotedUser, setPromotedUser] = useState<User | null>(null);

  // Preserve the user's scroll position across opening/closing a form. Opening a
  // form replaces the list/tree view, so without this the window scrolls back to
  // the top and the user loses the spot they were editing from. We track the
  // last scroll position while the list is showing and restore it on return.
  const lastScrollY = useRef(0);

  useEffect(() => {
    if (formMode) return; // Only record position while the list/tree is visible.
    const onScroll = () => { lastScrollY.current = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [formMode]);

  useLayoutEffect(() => {
    if (!formMode) {
      window.scrollTo(0, lastScrollY.current);
    }
  }, [formMode]);

  useEffect(() => {
    dataService.getCurrentUser().then(setCurrentUser);
  }, []);

  const handlePromoteUser = (user: User) => {
    setPromotedUser(user);
  };
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  // COURSE has no form here — the catalogue is its own page (TrainingCatalogue);
  // the overview card only offers its bulk import.
  const [bulkType, setBulkType] = useState<'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT' | 'COURSE' | 'DEPT_TEMPLATE'>('USER');
  // The org-structure screen owns THREE importers (the org units themselves, the
  // department job-profile template, and the flat JOB sheet), so its Bulk Upload
  // control is a menu rather than a single button.
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Reset search when view changes
  useEffect(() => {
    setSearchTerm('');
    setBulkMenuOpen(false);
    setSelectedDeptProfileId(null);
    setSelectedProjectId(null);
    setCurrentPage(1);
  }, [view]);

  // Reset page when search or tab changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  // Admin-only screen → safe place to run the one-time migration of the legacy
  // assessment model (instructions + plans) into inline Skill.assessmentMethods.
  useEffect(() => { dataService.migrateAssessmentConfigToSkills(); }, []);



  // Recompute these lists both on manual edits (refreshKey) and whenever a
  // Firestore listener delivers fresh data (storeVersion) — without the
  // latter the roster froze at the empty first-render result until an edit
  // or tab switch happened to bump refreshKey.
  const storeVersion = useStoreData();

  const users = useMemo(() => {
    if (!currentUser) return [];
    // Admins manage the whole org (incl. CEO/Chairman-level users), so they must
    // see and resolve the full roster — otherwise CEO-level managers assigned to a
    // department render as "Unassigned" and never appear in the workforce list.
    return (currentUser.role === Role.CEO || currentUser.role === Role.ADMIN)
      ? dataService.getAllUsers()
      : dataService.getPublicUsers();
  }, [refreshKey, currentUser, storeVersion]);
  const jobs = useMemo(() => dataService.getAllJobs(), [refreshKey, storeVersion]);
  const skills = useMemo(() => dataService.getAllSkills(), [refreshKey, storeVersion]);
  const depts = useMemo(() => dataService.getAllDepartments(), [refreshKey, storeVersion]);
  const projects = useMemo(() => dataService.getAllProjects(), [refreshKey, storeVersion]);
  const courses = useMemo(() => dataService.getAllTrainingCourses(), [refreshKey, storeVersion]);
  const logs = useMemo(() => dataService.getSystemLogs(), [refreshKey, storeVersion]);

  const hqProjectId = useMemo(() => {
    return projects.find(p => p.name.toUpperCase() === 'HQ')?.id;
  }, [projects]);


  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
      return 0;
    });
  }, [users]);

  // Filtering Logic
  const filteredUsers = useMemo(() => {
    return sortedUsers.filter(user => {
      const matchesSearch = searchTerm === '' ||
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.employeeId?.toString().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (depts.find(d => d.id === user.departmentId)?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesTab = activeTab === 'ALL' || user.status === activeTab;
      
      return matchesSearch && matchesTab;
    });
  }, [sortedUsers, searchTerm, depts, activeTab]);

  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      const matchesSearch = searchTerm === '' ||
        skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (skill.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        skill.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (dataService.getSkillAssessmentQuestion(skill.id) || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesTab = activeTab === 'ALL' || skill.category.toUpperCase() === activeTab;
      
      return matchesSearch && matchesTab;
    });
  }, [skills, searchTerm, activeTab]);

  const paginatedSkills = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredSkills.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredSkills, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredSkills.length / itemsPerPage);

  // A3.4: Paginate users to cap rendered DOM rows at itemsPerPage,
  // preventing layout thrash with 500+ rows.
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, currentPage, itemsPerPage]);

  const totalUserPages = Math.ceil(filteredUsers.length / itemsPerPage);

  const handleApproveSkill = useCallback((skill: Skill) => {
    const approvedEvidences = dataService.getEvidences({ skillId: skill.id, status: 'APPROVED' });
    if (approvedEvidences.length === 0) {
      setErrorMessage("Cannot approve: A manager must approve an employee's evidence for this skill first.");
      return;
    }
    handleEdit('SKILL', skill);
  }, []);

  const handleEdit = useCallback((type: 'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT', item: any) => {
      if (type === 'SKILL' && item.status === 'PENDING') {
        const approvedEvidences = dataService.getEvidences({ skillId: item.id, status: 'APPROVED' });
        if (approvedEvidences.length === 0) {
          setErrorMessage("Cannot edit/approve: A manager must approve an employee's evidence for this skill first.");
          return;
        }
      }
      setFormType(type);
      setEditItem(item);
      setFormMode(true);
  }, []);

  const handlePromote = useCallback((u: User) => {
    setPromotedUser(u);
  }, []);

  const handleAdd = useCallback((type: 'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT') => {
      setFormType(type);
      setEditItem(type === 'DEPT' ? { projectId: selectedProjectId || undefined } : null);
      setFormMode(true);
  }, [selectedProjectId]);

  const handleAddChild = useCallback((parentId: string) => {
      const parentDept = depts.find(d => d.id === parentId);
      setFormType('DEPT');
      setEditItem({ 
        parentId: parentId === 'ROOT' ? undefined : parentId,
        projectId: parentDept?.projectId || selectedProjectId || undefined
      });
      setFormMode(true);
  }, [depts, selectedProjectId]);

  const handleAddDeptToProject = useCallback((projectId: string) => {
      setFormType('DEPT');
      setEditItem({ projectId: projectId || undefined, parentId: undefined, type: 'GENERAL' });
      setFormMode(true);
  }, []);

  // Create a job profile pre-scoped to a department/unit. The seed carries no
  // `id`, so handleSave routes it to addJobProfile (create), not update.
  const handleAddJobToUnit = useCallback((deptId: string) => {
      const dept = depts.find(d => d.id === deptId);
      const seedLevel = (dept?.type === 'SECTION') ? 'JP' : 'SP';
      setFormType('JOB');
      setEditItem({ departmentId: deptId, orgLevel: seedLevel, requiredSkills: [] });
      setFormMode(true);
  }, [depts]);

  // Assign an EXISTING approved employee to a unit straight from the org chart,
  // so admins don't have to open the Workforce tab and re-pick the unit by hand.
  // Re-homes the employee to the unit (dept / general dept / project) and clears
  // a job profile that no longer belongs to the new unit.
  const handleAssignUserToUnit = useCallback(async (userId: string, deptId: string) => {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      const dept = depts.find(d => d.id === deptId);
      const keepsProfile = !!user.jobProfileId && jobs.some(j => j.id === user.jobProfileId && j.departmentId === deptId);
      await dataService.updateUser({
        ...user,
        departmentId: deptId,
        generalDepartmentId: dataService.getGeneralDeptId(deptId),
        projectId: dept?.projectId || user.projectId,
        jobProfileId: keepsProfile ? user.jobProfileId : '',
      });
      setRefreshKey(k => k + 1);
  }, [users, depts, jobs]);

  const handleBulkUpload = useCallback((type: 'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT' | 'DEPT_TEMPLATE') => {
    setBulkType(type);
    setShowBulkUpload(true);
  }, []);

  const handleDelete = useCallback(async (type: 'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT', id: string) => {
      // Deleting an employee is spelled out separately: it also destroys their
      // sign-in and hands their email address back, which is not what "delete a
      // record" implies on its own.
      const message = type === 'USER'
        ? "Delete this employee?\n\nTheir past assessments, evidence and history are kept, but their sign-in is removed: the password is deleted and the email address is freed for someone else to use. They will not be able to log in again.\n\nThis cannot be undone."
        : "Are you sure you want to delete this record? This action cannot be undone.";
      if (window.confirm(message)) {
          if (type === 'USER') {
              const result = await dataService.removeUser(id);
              if (result && !result.loginReleased) {
                  window.alert(
                      `The employee was removed, but their sign-in could not be released — ${result.email ?? 'their email address'} is still in use and they can still log in.\n\nCheck your connection and tell your system administrator, who can release it on the server.`,
                  );
              }
          }
          if (type === 'JOB') await dataService.removeJobProfile(id);
          if (type === 'SKILL') await dataService.removeSkill(id);
          if (type === 'DEPT') await dataService.removeDepartment(id);
          if (type === 'PROJECT') await dataService.removeProject(id);
          setRefreshKey(k => k + 1);
      }
  }, []);

  const handleSave = useCallback(async (item: any) => {
      // A2.6: Guard against double-submit from rapid clicks.
      if (isSubmitting) return;
      setIsSubmitting(true);
      try {
        if (formType === 'USER') {
            const exists = users.find(u => u.id === item.id);
            if (exists) await dataService.updateUser(item);
            else await dataService.addUser(item);
        }
        if (formType === 'JOB') { if (editItem?.id) await dataService.updateJobProfile(item); else await dataService.addJobProfile(item); }
        if (formType === 'SKILL') { if (editItem?.id) await dataService.updateSkill(item); else await dataService.addSkill(item); }
        if (formType === 'DEPT') { if (editItem?.id) await dataService.updateDepartment(item); else await dataService.addDepartment(item); }
        if (formType === 'PROJECT') { if (editItem?.id) await dataService.updateProject(item); else await dataService.addProject(item); }
        setFormMode(false);
        setRefreshKey(k => k + 1);
      } finally {
        setIsSubmitting(false);
      }
  }, [formType, editItem, users, isSubmitting]);

  const renderFormContent = () => {
      const titlePrefix = editItem?.id ? 'Edit ' : 'New ';
      
      if (formType === 'USER') return (
        <FormPage title={`${titlePrefix}Employee Profile`} onBack={() => setFormMode(false)}>
            {currentUser && <UserForm initialData={editItem} currentUser={currentUser} onSave={handleSave} onCancel={() => setFormMode(false)} isSubmitting={isSubmitting} />}
        </FormPage>
      );
      if (formType === 'JOB') return (
        <FormPage title={`${titlePrefix}Job Profile`} onBack={() => setFormMode(false)}>
            <JobForm initialData={editItem} onSave={handleSave} onCancel={() => setFormMode(false)} isSubmitting={isSubmitting} />
        </FormPage>
      );
      if (formType === 'SKILL') return (
        <FormPage title={`${titlePrefix}Competency Standard`} onBack={() => setFormMode(false)}>
            <SkillForm initialData={editItem} onSave={handleSave} onCancel={() => setFormMode(false)} isSubmitting={isSubmitting} />
        </FormPage>
      );
      if (formType === 'DEPT') return (
        <FormPage title={`${titlePrefix}Department`} onBack={() => setFormMode(false)}>
            <DepartmentForm initialData={editItem} onSave={handleSave} onCancel={() => setFormMode(false)} isSubmitting={isSubmitting} />
        </FormPage>
      );
      if (formType === 'PROJECT') return (
        <FormPage title={`${titlePrefix}Project`} onBack={() => setFormMode(false)}>
            <ProjectForm initialData={editItem} onSave={handleSave} onCancel={() => setFormMode(false)} isSubmitting={isSubmitting} />
        </FormPage>
      );

      return null;
  };

  // --- RENDER FORM IF ACTIVE ---
  if (formMode) {
      return renderFormContent();
  }

  // --- OVERVIEW VIEW ---
  if (view === 'OVERVIEW') {
      return (
        <div className="space-y-8">
            <div className="relative overflow-hidden rounded-none bg-blue-900 px-6 py-4">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-none bg-blue-700/20 blur-3xl"></div>

                <div className="relative z-10 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">System Command Center</h2>
                        <p className="text-blue-200 text-sm mt-1 max-w-xl">
                            Real-time overview of workforce competency, operational readiness, and organizational structure configuration.
                        </p>
                    </div>
                    <div className="flex gap-3">
                         <div className="px-3 py-1.5 bg-white/10 backdrop-blur rounded-sm border border-white/20">
                            <p className="text-[10px] uppercase tracking-widest text-blue-200 font-bold">System Status</p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-emerald-300 opacity-75"></span>
                                  <span className="relative inline-flex rounded-none h-2 w-2 bg-emerald-400"></span>
                                </span>
                                <span className="text-white font-bold text-sm">Operational</span>
                            </div>
                         </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div onClick={() => onNavigate('admin-users')} className="bg-white rounded-none cursor-pointer border border-slate-300 hover: transition-all group overflow-hidden text-left">
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-sm flex items-center justify-center group-hover:bg-blue-700 group-hover:text-white transition-colors">
                                <Users size={24} />
                            </div>
                            <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-1 rounded-none uppercase">Active</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg">Workforce Directory</h3>
                        <p className="text-sm text-slate-700 mt-1">Manage employees & hierarchy</p>
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-2xl font-bold text-slate-900">{users.length}</span>
                            <div className="flex gap-2">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setBulkType('USER'); setShowBulkUpload(true); }}
                                    className="p-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-sm border border-blue-200 transition-colors"
                                    title="Bulk Upload Workforce"
                                >
                                    <FileSpreadsheet size={16} />
                                </button>
                                <span className="text-xs font-semibold text-slate-900 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                    View Records <ChevronRight size={14} />
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-blue-700 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                </div>

                <div onClick={() => onNavigate('admin-skills')} className="bg-white rounded-none cursor-pointer border border-slate-300 hover: transition-all group overflow-hidden text-left">
                     <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-slate-50 text-slate-700 rounded-sm flex items-center justify-center group-hover:bg-slate-600 group-hover:text-white transition-colors">
                                <ShieldCheck size={24} />
                            </div>
                             <span className="text-xs font-bold bg-emerald-100 text-emerald-800 px-2 py-1 rounded-none uppercase">Library</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg">Skill Standards</h3>
                        <p className="text-sm text-slate-700 mt-1">Proficiency levels & certs</p>
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-2xl font-bold text-slate-900">{skills.length}</span>
                            <div className="flex gap-2">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setBulkType('SKILL'); setShowBulkUpload(true); }}
                                    className="p-2 bg-slate-50 hover:bg-slate-100 text-blue-700 rounded-sm border border-slate-200 transition-colors"
                                    title="Bulk Upload Skills"
                                >
                                    <FileSpreadsheet size={16} />
                                </button>
                                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                    Manage <ChevronRight size={14} />
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-slate-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                </div>


                <div onClick={() => onNavigate('admin-depts')} className="bg-white rounded-none cursor-pointer border border-slate-300 hover: transition-all group overflow-hidden text-left">
                     <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-slate-50 text-slate-700 rounded-sm flex items-center justify-center group-hover:bg-slate-600 group-hover:text-white transition-colors">
                                <Building2 size={24} />
                            </div>
                             <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded-none uppercase">Units</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg">Departments</h3>
                        <p className="text-sm text-slate-700 mt-1">Org structure</p>
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-2xl font-bold text-slate-900">{depts.length}</span>
                            <div className="flex gap-2">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setBulkType('DEPT'); setShowBulkUpload(true); }}
                                    className="p-2 bg-slate-50 hover:bg-slate-100 text-blue-700 rounded-sm border border-slate-200 transition-colors"
                                    title="Bulk Upload Departments"
                                >
                                    <FileSpreadsheet size={16} />
                                </button>
                                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                    Edit Structure <ChevronRight size={14} />
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-slate-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                </div>

                <div onClick={() => onNavigate('admin-appraisal')} className="bg-white rounded-none cursor-pointer border border-slate-300 hover: transition-all group overflow-hidden text-left">
                     <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-sm flex items-center justify-center group-hover:bg-blue-700 group-hover:text-white transition-colors">
                                <CheckCircle size={24} />
                            </div>
                             <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded-none uppercase">Yearly</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg">Annual Appraisal</h3>
                        <p className="text-sm text-slate-700 mt-1">Performance checklist config</p>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                Configure <ChevronRight size={14} />
                            </span>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-blue-700 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                </div>

                {/* The catalogue is what turns a detected gap into a named course. */}
                <div onClick={() => onNavigate('admin-courses')} className="bg-white rounded-none cursor-pointer border border-slate-300 hover: transition-all group overflow-hidden text-left">
                     <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-slate-50 text-slate-700 rounded-sm flex items-center justify-center group-hover:bg-slate-600 group-hover:text-white transition-colors">
                                <BookOpen size={24} />
                            </div>
                             <span className="text-xs font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-none uppercase">Courses</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg">Training Catalogue</h3>
                        <p className="text-sm text-slate-700 mt-1">Courses linked to skills</p>

                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-2xl font-bold text-slate-900">{courses.length}</span>
                            <div className="flex gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setBulkType('COURSE'); setShowBulkUpload(true); }}
                                    className="p-2 bg-slate-50 hover:bg-slate-100 text-blue-700 rounded-sm border border-slate-200 transition-colors"
                                    title="Bulk Upload Training Courses"
                                >
                                    <FileSpreadsheet size={16} />
                                </button>
                                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                    Manage <ChevronRight size={14} />
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-slate-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                </div>

                <div className="lg:col-span-4 bg-gradient-to-br from-slate-900 to-slate-800 rounded-none  p-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-none bg-blue-800/10 blur-3xl"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-blue-800/20 rounded-sm">
                                <Activity size={24} className="text-slate-400" />
                            </div>
                            <h3 className="text-xl font-bold">Competency Model Engine</h3>
                        </div>
                        <p className="text-slate-300 mb-6 max-w-2xl">
                            The EPROM CMS core engine analyzes workforce capabilities against job profiles. 
                            It automatically identifies skill gaps and generates Individual Training Plans (ITP) 
                            to ensure operational excellence and safety compliance.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white/5 rounded-sm p-4 border border-white/10">
                                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Total Skills</p>
                                <p className="text-2xl font-bold">{skills.length}</p>
                            </div>
                            <div className="bg-white/5 rounded-sm p-4 border border-white/10">
                                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Job Profiles</p>
                                <p className="text-2xl font-bold">{jobs.length}</p>
                            </div>
                            <div className="bg-white/5 rounded-sm p-4 border border-white/10">
                                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Active ITPs</p>
                                <p className="text-2xl font-bold">{users.filter(u => u.status === 'ACTIVE').length}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* Quick Actions or Analytics Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-none  border border-slate-300 p-6">
                    <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <Activity size={18} className="text-slate-900"/> System Activity Log
                    </h3>
                    <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar">
                        {logs.length > 0 ? logs.map(log => (
                             <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-slate-50 last:border-0 last:pb-0">
                                <div className="w-2 h-2 rounded-none bg-slate-300 mt-2"></div>
                                <div>
                                    <p className="text-sm text-slate-700">{log.action}: <span className="font-semibold">{log.target}</span></p>
                                    <p className="text-xs text-slate-600 mt-1">{new Date(log.timestamp).toLocaleString()}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-8 text-slate-600 text-sm">No recent activity detected.</div>
                        )}
                    </div>
                </div>
                
                <div className="bg-blue-900 rounded-none border border-blue-800 p-6 text-white relative overflow-hidden">
                     <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-none bg-slate-500/20 blur-2xl"></div>
                     <h3 className="font-bold text-white mb-2 relative z-10">Pending Actions</h3>
                     <p className="text-slate-500 text-sm mb-6 relative z-10">There are pending user registrations requiring approval.</p>
                     
                     <div className="flex items-center justify-between bg-white/10 rounded-sm p-4 backdrop-blur relative z-10">
                        <div className="flex items-center gap-3">
                            <UserPlus size={20} className="text-slate-700" />
                            <span className="font-bold text-xl">
                                {users.filter(u => u.status === 'PENDING').length}
                            </span>
                        </div>
                        <button onClick={() => onNavigate('admin-users')} className="text-xs font-bold uppercase tracking-wider bg-white text-slate-900 px-3 py-1.5 rounded-none hover:bg-slate-100 transition-colors">
                            Review
                        </button>
                     </div>
                </div>
            </div>
        </div>
      );
  }

  // --- ANALYTICS VIEW ---
  if (view === 'ANALYTICS') {
      return <Suspense fallback={<ScreenLoading />}><AdminAnalytics /></Suspense>;
  }

  // --- ANNUAL APPRAISAL VIEW ---
  if (view === 'APPRAISAL') {
      return <Suspense fallback={<ScreenLoading />}><AnnualAppraisalAdmin /></Suspense>;
  }

  // --- AUDIT TRAIL VIEW (ISO.1) ---
  if (view === 'AUDIT') {
      return <Suspense fallback={<ScreenLoading />}><AuditTrail /></Suspense>;
  }

  // --- TABLE VIEW (Data View) ---
  // A5.5: Show loading skeleton while Firestore snapshots haven't arrived yet.
  if (!dataService.isDataLoaded()) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-slate-100 border border-slate-200 rounded-none" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-14 bg-slate-50 border border-slate-200 rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
       {errorMessage && (
         <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-none relative animate-in fade-in flex items-start justify-between gap-3" role="alert">
           <span><strong className="font-bold">Error: </strong>{errorMessage}</span>
           <button onClick={() => setErrorMessage('')} className="shrink-0 text-rose-600 hover:text-rose-900" aria-label="Dismiss error">✕</button>
         </div>
       )}
       <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-slate-300">
           <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
                {view === 'USERS' ? 'Workforce Management' :
                 view === 'SKILLS' ? 'Skill Library' : 'Departments'}
              </h2>
              <p className="text-slate-700 text-sm mt-1">Administration Module</p>
           </div>
           
           {view === 'SKILLS' && (
               <div className="flex bg-white border border-slate-300 rounded-sm p-1 overflow-x-auto  max-w-full">
                   {(['ALL', 'TECHNICAL', 'BEHAVIORAL', 'SAFETY', 'MANAGEMENT', 'SOFT SKILLS']).map(tab => (
                       <button
                           key={tab}
                           onClick={() => setActiveTab(tab)}
                           className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-none transition-all whitespace-nowrap ${activeTab === tab ? 'bg-blue-700 text-white ' : 'text-slate-600 hover:bg-slate-50'}`}
                       >
                           {tab}
                       </button>
                   ))}
               </div>
           )}
       </div>

       {/* Content Area */}
       <div className="bg-white rounded-sm  border border-slate-300 overflow-hidden min-h-[600px]">
            {/* Toolbar - Header only shown when not in a specific profile view */}
            {!selectedDeptProfileId && (
                <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="relative max-w-sm w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={16}/>
                            <input 
                                type="text" 
                                placeholder="Search records..." 
                                className="w-full pl-9 pr-4 py-2 text-sm bg-white text-slate-900 border border-slate-300 rounded-sm focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all" 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        {view === 'USERS' && (
                            <div className="flex bg-white border border-slate-300 rounded-sm p-1">
                                {(['ALL', 'PENDING', 'ACTIVE'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-none transition-all ${activeTab === tab ? 'bg-blue-700 text-white ' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {tab}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        {view === 'DEPTS' ? (
                            /* Org structure is where job profiles live, so this screen is the
                               home of all three structural importers. Until now the JOB and
                               DEPT_TEMPLATE readers existed in code but were reachable from
                               nowhere in the UI. */
                            <div className="relative flex-1 md:flex-none">
                                <button
                                    onClick={() => setBulkMenuOpen(o => !o)}
                                    className="w-full bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all justify-center"
                                >
                                    <FileSpreadsheet size={16} className="text-blue-700" /> Bulk Upload
                                    <ChevronDown size={14} className={`transition-transform ${bulkMenuOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {bulkMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setBulkMenuOpen(false)} />
                                        <div className="absolute right-0 mt-1 w-80 bg-white border border-slate-300 rounded-sm shadow-lg z-20 overflow-hidden">
                                            <button
                                                onClick={() => { setBulkMenuOpen(false); handleBulkUpload('DEPT_TEMPLATE'); }}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100"
                                            >
                                                <span className="block text-xs font-bold uppercase tracking-wide text-slate-900">Department Template</span>
                                                <span className="block text-[11px] text-slate-600 mt-0.5">The workbook a department fills in and returns — its positions and competency matrix become job profiles. Checked before anything is written.</span>
                                            </button>
                                            <button
                                                onClick={() => { setBulkMenuOpen(false); handleBulkUpload('JOB'); }}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100"
                                            >
                                                <span className="block text-xs font-bold uppercase tracking-wide text-slate-900">Job Profiles</span>
                                                <span className="block text-[11px] text-slate-600 mt-0.5">The flat sheet: one row per position and skill. Upload the skill library first — a skill this sheet cannot find is created blank.</span>
                                            </button>
                                            <button
                                                onClick={() => { setBulkMenuOpen(false); handleBulkUpload('DEPT'); }}
                                                className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
                                            >
                                                <span className="block text-xs font-bold uppercase tracking-wide text-slate-900">Departments</span>
                                                <span className="block text-[11px] text-slate-600 mt-0.5">The org units themselves — general departments, departments and sections.</span>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={() => handleBulkUpload(view === 'USERS' ? 'USER' : 'SKILL')}
                                className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all flex-1 md:flex-none justify-center"
                            >
                                <FileSpreadsheet size={16} className="text-blue-700" /> Bulk Upload
                            </button>
                        )}
                         <button onClick={() => handleAdd(view === 'USERS' ? 'USER' : view === 'SKILLS' ? 'SKILL' : 'DEPT')}
                             className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wide  flex items-center gap-2 transition-all flex-1 md:flex-none justify-center">
                             <Plus size={16} /> Add {
                                 view === 'USERS' ? 'Employee' :
                                 view === 'SKILLS' ? 'Skill' : 'Department'
                             }
                         </button>
                    </div>
                </div>
            )}

           {/* Table or Tree View */}
           <div className="overflow-x-auto">
               {view === 'DEPTS' ? (
                   <CompanyOrgView
                       depts={depts}
                       projects={projects}
                       users={users}
                       jobs={jobs}
                       hqProjectId={hqProjectId}
                       currentUser={currentUser}
                       searchTerm={searchTerm}
                       onEdit={(d) => handleEdit('DEPT', d)}
                       onDelete={(id) => handleDelete('DEPT', id)}
                       onAddChild={handleAddChild}
                       onAddDeptToProject={handleAddDeptToProject}
                       onEditUser={(u) => handleEdit('USER', u)}
                       onPromoteUser={handlePromoteUser}
                       onAddProject={() => handleAdd('PROJECT')}
                       onEditProject={(p) => handleEdit('PROJECT', p)}
                       onDeleteProject={(id) => handleDelete('PROJECT', id)}
                       onAddJobToUnit={handleAddJobToUnit}
                       onAssignPersonnel={handleAssignUserToUnit}
                       onEditJob={(j) => handleEdit('JOB', j)}
                       onDeleteJob={(id) => handleDelete('JOB', id)}
                       selected={orgSelection}
                       setSelected={setOrgSelection}
                   />
               ) : (
                   <table className="w-full text-left">
                       <thead className="bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider border-b border-slate-300">
                           <tr>
                               {view === 'USERS' && <><th className="p-4 pl-6">Employee</th><th className="p-4">Role & Dept</th><th className="p-4">Level</th><th className="p-4">Status</th></>}
                               {view === 'SKILLS' && <><th className="p-4 pl-6">Identifier</th><th className="p-4">Skill Name</th><th className="p-4">Category</th><th className="p-4">Criticality</th><th className="p-4">Definition</th><th className="p-4">Status</th></>}
                               <th className="p-4 text-right pr-6">Actions</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100 text-sm">
                           {view === 'USERS' && paginatedUsers.map(user => (
                               <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                                   <td className="p-4 pl-6">
                                       <div className="flex items-center gap-3">
                                           <div className="w-9 h-9 rounded-none bg-slate-50 flex items-center justify-center overflow-hidden text-slate-900 font-bold shrink-0">
                                               <Avatar src={user.avatarUrl} name={user.name} />
                                           </div>
                                           <div>
                                               <div className="font-bold text-slate-900 group-hover:text-slate-900 transition-colors flex items-center gap-2">
                                                    {user.name}
                                                    {user.employeeId
                                                        ? <span className="font-mono text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded-sm">#{user.employeeId}</span>
                                                        : <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-sm">NO ID</span>}
                                                </div>
                                               <div className="text-slate-600 text-xs">{user.email}</div>
                                           </div>
                                       </div>
                                   </td>
                                   <td className="p-4">
                                        <span className="font-semibold text-slate-700 block text-[10px] uppercase tracking-wider font-bold mb-0.5">{user.role}</span>
                                        <div className="flex flex-col gap-0.5">
                                            {(() => {
                                                const dept = depts.find(d => d.id === user.departmentId);
                                                if (!dept) return <span className="text-slate-400 text-[10px] font-bold italic lowercase">unassigned</span>;
                                                const parentDept = dept.parentId ? depts.find(d => d.id === dept.parentId) : null;
                                                return (
                                                    <div className="flex flex-col gap-0.5">
                                                        {parentDept && parentDept.id !== dept.id && (
                                                            <span className="text-slate-500 text-[10px] uppercase tracking-tight">{parentDept.name}</span>
                                                        )}
                                                        <span className="text-blue-700 font-black text-[11px] uppercase tracking-tight">{dept.name}</span>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </td>
                                   <td className="p-4">
                                       <span className="inline-block px-2 py-0.5 bg-slate-100 border border-slate-300 text-slate-600 text-[10px] font-bold uppercase tracking-wide rounded-none">{user.orgLevel || 'N/A'}</span>
                                   </td>
                                   <td className="p-4">
                                       {user.status === 'PENDING' ? (
                                           <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-50 text-slate-700 border border-slate-100 text-[10px] font-bold uppercase tracking-wide rounded-none">
                                               <AlertCircle size={10} className="text-amber-500"/> <span className="text-amber-600">Pending</span>
                                           </span>
                                       ) : (
                                           <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-50 text-slate-700 border border-slate-100 text-[10px] font-bold uppercase tracking-wide rounded-none">
                                               <CheckCircle size={10} className="text-emerald-600"/> <span className="text-emerald-700">Active</span>
                                           </span>
                                       )}
                                   </td>
                                   <td className="p-4 text-right pr-6">
                                       <div className="flex items-center justify-end gap-2">
                                           <button onClick={() => handlePromote(user)} className="text-blue-600 hover:text-blue-800 p-2 transition-colors" title="Promote / Transfer"><TrendingUp size={16}/></button>
                                           <button onClick={() => handleEdit('USER', user)} className="text-slate-600 hover:text-slate-900 p-2 transition-colors" title="Edit"><Edit2 size={16}/></button>
                                           <button onClick={() => handleDelete('USER', user.id)} className="text-slate-600 hover:text-slate-700 p-2 transition-colors" title="Delete"><Trash2 size={16}/></button>
                                       </div>
                                   </td>
                               </tr>
                           ))}{view === 'SKILLS' && paginatedSkills.map(skill => (
                               <tr key={skill.id} className="hover:bg-slate-50 transition-colors group">
                                   <td className="p-4 pl-6">
                                        <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-none text-[10px] font-black uppercase tracking-wide leading-none whitespace-nowrap">
                                            {skill.code || 'N/A'}
                                        </span>
                                   </td>
                                   <td className="p-4 font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{skill.name}</td>
                                   <td className="p-4">
                                       <span className="px-2 py-1 bg-slate-50 text-slate-900 border border-slate-300 rounded-none text-[10px] font-bold uppercase tracking-wide">{skill.category}</span>
                                   </td>
                                   <td className="p-4"><CriticalityBadge criticality={skill.criticality} /></td>
                                   <td className="p-4 text-slate-700 truncate max-w-xs text-xs">{dataService.getSkillAssessmentQuestion(skill.id) || '-'}</td>
                                   <td className="p-4">
                                       {skill.status === 'PENDING' ? (
                                           <span className="px-2 py-1 bg-slate-50 text-slate-700 border border-slate-100 rounded-none text-[10px] font-bold uppercase tracking-wide">Pending</span>
                                       ) : (
                                           <span className="px-2 py-1 bg-slate-50 text-slate-700 border border-slate-100 rounded-none text-[10px] font-bold uppercase tracking-wide">Approved</span>
                                       )}
                                   </td>
                                   <td className="p-4 text-right pr-6">
                                       <div className="flex items-center justify-end gap-2">
                                           {skill.status === 'PENDING' && (
                                               <button onClick={() => handleApproveSkill(skill)} className="text-slate-600 hover:text-slate-700 p-2 transition-colors flex items-center gap-1" title="Approve Skill">
                                                   <CheckCircle size={16}/> <span className="text-xs font-bold uppercase">Approve</span>
                                               </button>
                                           )}
                                           <button onClick={() => setViewSkill(skill)} className="text-slate-600 hover:text-slate-900 p-2 transition-colors flex items-center gap-1" title="View Details">
                                               <Eye size={16}/> <span className="text-xs font-bold uppercase">View</span>
                                           </button>
                                           <button onClick={() => handleEdit('SKILL', skill)} className="text-slate-600 hover:text-slate-900 p-2" title="Edit"><Edit2 size={16}/></button>
                                           <button onClick={() => handleDelete('SKILL', skill.id)} className="text-slate-600 hover:text-slate-700 p-2" title="Delete"><Trash2 size={16}/></button>
                                       </div>
                                   </td>
                               </tr>
                           ))}
                       </tbody>
                   </table>
               )}
           </div>
            {/* A3.4: Pagination bar for USERS / JOBS / SKILLS — caps rendered rows at
                itemsPerPage to prevent DOM freeze with 500+ entries. */}
            {(() => {
              // Only the table views (USERS / JOBS / SKILLS) are paginated. The DEPTS
              // view renders the org-chart tree (CompanyOrgView) and must not show a
              // pagination bar — otherwise it falls through to the skills counts and
              // appears as a non-functional control.
              if (view !== 'USERS' && view !== 'SKILLS') return null;
              if (selectedDeptProfileId) return null;
              const pageCount = view === 'USERS' ? totalUserPages : totalPages;
              const totalCount = view === 'USERS' ? filteredUsers.length : filteredSkills.length;
              if (pageCount <= 1) return null;
              return (
                <div className="p-4 border-t border-slate-300 bg-slate-50/50 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-[10px] text-slate-600 font-black uppercase tracking-widest">
                        Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} entries
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="p-2 border border-slate-300 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-all rounded-none"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div className="flex items-center gap-1 mx-1">
                            {Array.from({ length: pageCount }, (_, i) => i + 1).filter(page =>
                                page === 1 || page === pageCount || (page >= currentPage - 2 && page <= currentPage + 2)
                            ).map((page, idx, arr) => {
                                const prevPage = arr[idx - 1];
                                const showEllipsis = prevPage && page - prevPage > 1;
                                return (
                                    <React.Fragment key={page}>
                                        {showEllipsis && <span className="text-slate-400 px-1 text-xs">...</span>}
                                        <button
                                            onClick={() => setCurrentPage(page)}
                                            className={`w-8 h-8 text-[10px] font-black uppercase tracking-wider transition-all rounded-none border ${currentPage === page ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                                        >
                                            {page}
                                        </button>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
                            disabled={currentPage === pageCount}
                            className="p-2 border border-slate-300 bg-white text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-all rounded-none"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
              );
            })()}
       </div>
       {viewSkill && <SkillDetailsModal skill={viewSkill} onClose={() => setViewSkill(null)} />}
       {showBulkUpload && (
         <BulkUpload
           type={bulkType}
           user={currentUser}
           onComplete={() => {
             setShowBulkUpload(false);
             setRefreshKey(k => k + 1);
           }}
           onCancel={() => setShowBulkUpload(false)}
         />
       )}
        {promotedUser && (
            <PromotionModal 
                user={promotedUser} 
                onClose={() => setPromotedUser(null)} 
                onSave={async (updatedUser) => {
                    await dataService.updateUser(updatedUser);
                    await dataService.logActivity('Promotion/Transfer', `${updatedUser.name} to ${jobs.find(j => j.id === updatedUser.jobProfileId)?.title}`);
                    setPromotedUser(null);
                    setRefreshKey(k => k + 1);
                }} 
            />
        )}
    </div>
  );
});
