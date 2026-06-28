import React, { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect } from 'react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { User, Role, JobProfile, Skill, JobProfileSkill, OrgLevel, ORG_LEVEL_LABELS, Department, DepartmentType, DEPT_TYPE_TO_ORG_LEVEL, ORG_HIERARCHY_ORDER, PROFICIENCY_LABELS, Project, EvaluationQuestion, SkillAssessmentMethod, DEFAULT_RATER_WEIGHTS, ASSESSMENT_METHOD_LABELS, ASSESSMENT_FREQUENCY_LABELS } from '../types';
import { PROFICIENCY_DEFINITIONS } from '../constants';
import { Plus, Users, Briefcase, ChevronRight, CheckCircle, Shield, ShieldCheck, X, Save, Trash2, ArrowLeft, UserPlus, Building2, Search, Edit2, UserCheck, AlertCircle, Layers, BookOpen, MoreHorizontal, LayoutGrid, Activity, Eye, AlertTriangle, FileSpreadsheet, MapPin, TrendingUp, Calendar, Link2 } from 'lucide-react';
import { SearchableSelect, Option } from '../components/SearchableSelect';
import { BulkUpload } from '../components/BulkUpload';
import { AdminAnalytics } from './AdminAnalytics';
import { AnnualAppraisalAdmin } from './AnnualAppraisalAdmin';
import { AssessmentMethodEditor } from '../components/AssessmentMethodEditor';
import { AuditTrail } from './AuditTrail';

// --- Reusable Form Wrapper ---
const FormPage: React.FC<{ title: string; onBack: () => void; children: React.ReactNode }> = ({ title, onBack, children }) => {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 rounded-none hover:bg-slate-200 text-slate-600 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      </div>
      <div className="bg-white rounded-sm border border-slate-300">
         {children}
      </div>
    </div>
  );
};

// --- Skill Details Modal ---
const SkillDetailsModal: React.FC<{ skill: Skill; onClose: () => void }> = ({ skill, onClose }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-none shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{skill.name}</h3>
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-none border border-slate-200">
                                {skill.category}
                            </span>
                        </div>
                        <p className="text-slate-500 text-sm font-medium tracking-tight italic">
                            {skill.subcategory || 'General Competency'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                    <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Layers size={14} /> Proficiency Levels
                        </h4>
                        <div className="grid gap-4">
                            {[1, 2, 3, 4, 5].map((level) => {
                                const lvlData = skill.levels[level];
                                // @ts-expect-error numeric index not in type
                                const genericDef = PROFICIENCY_DEFINITIONS[level];
                                return (
                                    <div key={level} className="relative pl-6 border-l-2 border-slate-200 hover:border-slate-900 transition-colors group">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 bg-white border-2 border-slate-200 group-hover:border-slate-900 flex items-center justify-center text-[8px] font-black text-slate-400 group-hover:text-slate-900 transition-colors">
                                            {level}
                                        </div>
                                        <div className="mb-2">
                                            <span className="text-sm font-black text-slate-900 uppercase tracking-tight">Level {level}: {PROFICIENCY_LABELS[level]}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                                            {genericDef?.description}
                                        </p>
                                        <div className="text-sm text-slate-700 font-medium leading-relaxed bg-slate-50 p-3 border border-slate-100">
                                            {lvlData?.description || <span className="text-slate-400 italic">No specific description provided for this skill level.</span>}
                                        </div>
                                        {lvlData?.requiredCertificates && lvlData.requiredCertificates.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {lvlData.requiredCertificates.map((cert, idx) => (
                                                    <span key={idx} className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                                                        <ShieldCheck size={10} /> {cert}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 space-y-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Activity size={14} /> Assessment Methodology
                        </h4>
                        {(() => {
                          const methods = dataService.getSkillAssessmentMethods(skill.id);
                          if (methods.length === 0) {
                            return (
                              <div className="bg-slate-50 p-6 border border-slate-200 text-sm text-slate-500 italic">
                                No assessment method defined — scored as 360° / OJT by default.
                              </div>
                            );
                          }
                          return methods.map((m, mi) => (
                            <div key={m.id || mi} className="bg-slate-50 p-6 border border-slate-200 space-y-6">
                                <div className="flex justify-between items-start gap-4 pb-4 border-b border-slate-200/60">
                                    <div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Method {mi + 1}</span>
                                        {m.assessmentQuestion && <span className="text-xs text-slate-600 italic">{m.assessmentQuestion}</span>}
                                    </div>
                                    <span className="text-xs font-black text-blue-700 uppercase tracking-widest bg-blue-50 px-2 py-1 border border-blue-100 whitespace-nowrap">{ASSESSMENT_METHOD_LABELS[m.method]}</span>
                                </div>

                                <div className="flex flex-wrap gap-4 pb-4 border-b border-slate-200/60 text-[11px]">
                                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                                        <Calendar size={12} className="text-slate-400" />
                                        <span className="font-bold text-slate-500 uppercase tracking-widest">When:</span> {ASSESSMENT_FREQUENCY_LABELS[m.frequency]}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                                        <Users size={12} className="text-slate-400" />
                                        <span className="font-bold text-slate-500 uppercase tracking-widest">Who:</span> {m.audience.replace(/_/g, ' ')}
                                    </span>
                                </div>

                                {m.assessmentLink && (
                                    <div className="flex justify-between items-center pb-4 border-b border-slate-200/60">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Link2 size={12} /> Link</span>
                                        <a href={m.assessmentLink} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1">
                                            Open Resource <ChevronRight size={12} />
                                        </a>
                                    </div>
                                )}

                                {m.questions && m.questions.length > 0 && (
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Question Bank</p>
                                        <div className="space-y-3">
                                            {m.questions.map((q, i) => (
                                                <div key={q.id} className="text-sm bg-white p-4 border border-slate-200">
                                                    <p className="font-bold text-slate-900 mb-2">{i+1}. {q.text}</p>
                                                    {q.expectedCriteria && <p className="text-[10px] text-slate-500 uppercase font-bold bg-slate-50 p-2 border-l-2 border-slate-300">Guide: {q.expectedCriteria}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                          ));
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
};

const PromotionModal: React.FC<{ 
    user: User; 
    onClose: () => void;
    onSave: (updatedUser: User) => void;
}> = ({ user, onClose, onSave }) => {
    const departments = dataService.getAllDepartments();
    const jobProfiles = dataService.getAllJobs();
    const [formData, setFormData] = useState({
        jobProfileId: user.jobProfileId || '',
        departmentId: user.departmentId || '',
        orgLevel: user.orgLevel || 'FR',
        reason: 'PROMOTION',
        startDate: new Date().toISOString().split('T')[0]
    });

    const handleSave = () => {
        const job = jobProfiles.find(j => j.id === formData.jobProfileId);
        if (!job) return;

        const updatedUser: User = {
            ...user,
            jobProfileId: formData.jobProfileId,
            departmentId: job.departmentId, 
            orgLevel: formData.orgLevel as OrgLevel,
            careerHistory: [
                {
                    id: Math.random().toString(36).substr(2, 9),
                    jobProfileId: formData.jobProfileId,
                    jobTitle: job.title,
                    orgLevel: formData.orgLevel as OrgLevel,
                    departmentId: job.departmentId,
                    startDate: formData.startDate,
                    reason: formData.reason
                },
                ...(user.careerHistory || [])
            ]
        };

        onSave(updatedUser);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-none w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">Promote / Transfer Employee</h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-none transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 mb-4">
                        <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center font-black text-xl">
                            {user.name[0]}
                        </div>
                        <div>
                            <p className="text-xs font-black text-blue-900 uppercase">{user.name}</p>
                            <p className="text-[10px] text-blue-700 font-bold uppercase">{jobProfiles.find(j => j.id === user.jobProfileId)?.title || 'Current Position'}</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Target Position Profile</label>
                        <SearchableSelect 
                            options={jobProfiles.map(j => ({ value: j.id, label: j.title, subLabel: departments.find(d => d.id === j.departmentId)?.name }))}
                            value={formData.jobProfileId}
                            onChange={(val) => setFormData({...formData, jobProfileId: val})}
                            placeholder="Select new role..."
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Hierarchy Level</label>
                        <select 
                            value={formData.orgLevel} 
                            onChange={e => setFormData({...formData, orgLevel: e.target.value as OrgLevel})} 
                            className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500 font-bold"
                        >
                            {ORG_HIERARCHY_ORDER.map(level => (
                                <option key={level} value={level}>{level} - {ORG_LEVEL_LABELS[level]}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Effective Date</label>
                        <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Transition Reason</label>
                        <select value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500">
                            <option value="PROMOTION">PROMOTION</option>
                            <option value="TRANSFER">TRANSFER / ROTATION</option>
                            <option value="RE-DESIGNATION">RE-DESIGNATION</option>
                        </select>
                    </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-black uppercase text-slate-600 hover:bg-slate-100 rounded-none transition-colors">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-700 rounded-none transition-colors">Apply Changes</button>
                </div>
            </div>
        </div>
    );
};

// --- Helper functions ---


// --- User Form (Unchanged Logic, styling preserved) ---
const UserForm: React.FC<{ initialData?: User | null, currentUser: User, onSave: (u: User) => void, onCancel: () => void, isSubmitting?: boolean }> = ({ initialData, currentUser, onSave, onCancel, isSubmitting }) => {
  const departments = dataService.getAllDepartments();
  const jobProfiles = dataService.getAllJobs();
  const potentialManagers = dataService.getAllUsers(); 
  const projects = dataService.getAllProjects();

  const hqProjectId = projects.find(p => p.name.toUpperCase() === 'HQ')?.id;

  const [formData, setFormData] = useState<Partial<User>>(() => {
    if (initialData) return { ...initialData };
    
    const firstDept = departments[0];
    const genDeptId = dataService.getGeneralDeptId(firstDept?.id);
    
    return {
        role: Role.EMPLOYEE,
        status: 'ACTIVE',
        departmentId: firstDept?.id || '',
        generalDepartmentId: genDeptId
    };
  });
  const [managerPrompt, setManagerPrompt] = useState(false);
  const [employeeIdError, setEmployeeIdError] = useState('');

  const isPending = initialData?.status === 'PENDING';
  const isNewUser = !initialData;
  const projectOptions: Option[] = projects.map(p => ({ value: p.id, label: p.name }));

  const generalDepts = departments.filter(d => {
    // Basic type check
    if (d.type !== 'GENERAL' && d.parentId) return false;
    
    // Filter by project
    if (!formData.projectId) return true; // Show all if no project selected? Or none? 
    // Usually better to show all if no project, but user wants filtering.
    
    return d.projectId === formData.projectId || (formData.projectId === hqProjectId && !d.projectId);
  });

  const generalDeptOptions: Option[] = generalDepts.map(d => ({ value: d.id, label: d.name, subLabel: d.code }));
  
  const filteredDepts = departments.filter(d => {
    if (!formData.generalDepartmentId) return false; // Show nothing if no General Dept selected
    // Must be part of this General Dept tree AND not the General Dept itself (if that's what "sub" means)
    // Actually, usually you can be IN the general dept. But I'll stick to descendant check if they say "sub".
    // Let's keep the descendant check (getGeneralDeptId) but ensure it's indeed from that tree.
    return dataService.getGeneralDeptId(d.id) === formData.generalDepartmentId;
  });
  const deptOptions: Option[] = filteredDepts.map(d => ({ value: d.id, label: d.name, subLabel: d.code }));
  
  // Job profiles are scoped to the employee's chosen unit (positions live inside
  // departments). The dropdown only offers profiles belonging to that unit.
  const unitJobProfiles = useMemo(
    () => jobProfiles.filter(j => j.departmentId === formData.departmentId && !j.isArchived),
    [jobProfiles, formData.departmentId]
  );
  const jobOptions: Option[] = unitJobProfiles.map(j => ({ value: j.id, label: j.title, subLabel: `${j.code || ''} · ${j.orgLevel || ''}` }));

  // Auto-assign when a unit has exactly one profile; clear when none or ambiguous
  // (multiple) so the admin makes an explicit choice. Skipped for the initial
  // load of an existing user that already has a profile in this unit.
  useEffect(() => {
    if (!formData.departmentId) return;
    const single = unitJobProfiles.length === 1 ? unitJobProfiles[0].id : null;
    const currentValid = formData.jobProfileId && unitJobProfiles.some(j => j.id === formData.jobProfileId);
    if (single) {
      if (formData.jobProfileId !== single) setFormData(prev => ({ ...prev, jobProfileId: single }));
    } else if (!currentValid && formData.jobProfileId) {
      setFormData(prev => ({ ...prev, jobProfileId: '' }));
    }
  }, [formData.departmentId, unitJobProfiles]);

  const selectedJobProfile = jobProfiles.find(j => j.id === formData.jobProfileId);
  const contextDepartmentId = selectedJobProfile ? selectedJobProfile.departmentId : formData.departmentId;

  // One position = one profile = one org level. The Hierarchy Level stays
  // editable, but if the admin sets it to something that disagrees with the
  // assigned job profile, we surface an error and block the save (no silent
  // mis-assignment). Empty until a profile is chosen and a level is set.
  const orgLevelMismatch = !!(selectedJobProfile?.orgLevel && formData.orgLevel && selectedJobProfile.orgLevel !== formData.orgLevel);

  const managerOptions: Option[] = potentialManagers
    .filter(u => {
        if (u.id === initialData?.id) return false; 
        if (u.status !== 'ACTIVE') return false; 
        
        // Rule 1: Same General Department
        const currentGenDeptId = formData.generalDepartmentId || (contextDepartmentId ? dataService.getGeneralDeptId(contextDepartmentId) : undefined);
        if (currentGenDeptId) {
            const managerGenDeptId = dataService.getGeneralDeptId(u.departmentId);
            if (managerGenDeptId !== currentGenDeptId) return false;
        }

        // Rule 2: Higher Hierarchy Level
        if (formData.orgLevel) {
            const userLevelIdx = ORG_HIERARCHY_ORDER.indexOf(formData.orgLevel);
            const managerLevelIdx = ORG_HIERARCHY_ORDER.indexOf(u.orgLevel as OrgLevel);
            
            // Index 0 (GM) is higher than Index 6 (FR)
            // So manager index must be LESS THAN user index
            if (managerLevelIdx === -1 || managerLevelIdx >= userLevelIdx) return false;
        }

        return true;
    })
    .map(u => ({ 
        value: u.id, 
        label: u.employeeId ? `${u.name} (ID: ${u.employeeId})` : u.name, 
        subLabel: `${u.role} • ${departments.find(d => d.id === u.departmentId)?.name || 'No Dept'} • ${u.orgLevel || ''}` 
    }));

  const handleProjectChange = (val: string) => {
      const project = projects.find(p => p.id === val);
      setFormData(prev => ({
          ...prev,
          projectId: val,
          projectName: project?.name || '',
          location: project?.location || '',
          generalDepartmentId: undefined, // Reset dept selection when project changes
          departmentId: '',
          managerId: undefined
      }));
  };

  const handleJobProfileChange = (val: string) => {
      const job = jobProfiles.find(j => j.id === val);
      setFormData(prev => {
          let newManagerId = prev.managerId;
          const newDeptId = job ? job.departmentId : prev.departmentId;
          const newGenDeptId = dataService.getGeneralDeptId(newDeptId);

          if (prev.managerId) {
              const currentManager = potentialManagers.find(m => m.id === prev.managerId);
              const mGenDeptId = currentManager ? dataService.getGeneralDeptId(currentManager.departmentId) : undefined;
              if (mGenDeptId !== newGenDeptId) {
                  newManagerId = undefined;
                  setManagerPrompt(true);
              }
          }

          // One position = one profile = one org level. Selecting a profile
          // derives the employee's hierarchy level from it so the two can never
          // be mis-assigned. (The store enforces this on save too.)
          const newOrgLevel = job?.orgLevel || prev.orgLevel;

          return {
              ...prev,
              jobProfileId: val,
              departmentId: newDeptId,
              generalDepartmentId: newGenDeptId,
              orgLevel: newOrgLevel,
              managerId: newManagerId
          };
      });
  };

  const handleGeneralDeptChange = (val: string) => {
      setFormData(prev => {
          const isStillValid = val && prev.departmentId && dataService.getGeneralDeptId(prev.departmentId) === val;
          return {
              ...prev,
              generalDepartmentId: val,
              departmentId: isStillValid ? prev.departmentId : val, // If not valid, default to the General Dept itself
              managerId: undefined // Reset manager as they must be in the new Gen Dept
          };
      });
  };

  const handleDepartmentChange = (val: string) => {
      const genDeptId = dataService.getGeneralDeptId(val);
      setFormData(prev => ({
          ...prev,
          departmentId: val,
          generalDepartmentId: genDeptId,
          managerId: prev.managerId // Keep manager, logic in managerOptions will filter if invalid
      }));
  };

  const handleOrgLevelChange = (val: string) => {
      const newLevel = val as OrgLevel;
      setFormData(prev => {
          let newManagerId = prev.managerId;
          if (prev.managerId) {
              const currentManager = potentialManagers.find(m => m.id === prev.managerId);
              if (currentManager) {
                  const mLevelIdx = ORG_HIERARCHY_ORDER.indexOf(currentManager.orgLevel as OrgLevel);
                  const uLevelIdx = ORG_HIERARCHY_ORDER.indexOf(newLevel);
                  if (mLevelIdx >= uLevelIdx) {
                      newManagerId = undefined;
                      setManagerPrompt(true);
                  }
              }
          }
          return { ...prev, orgLevel: newLevel, managerId: newManagerId };
      });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    // Company ID (employeeId) is required and must be unique across all users.
    const empId = formData.employeeId;
    if (empId === undefined || empId === null || Number.isNaN(empId)) {
      setEmployeeIdError('Company ID is required.');
      return;
    }
    const duplicate = potentialManagers.find(u => u.employeeId === empId && u.id !== initialData?.id);
    if (duplicate) {
      setEmployeeIdError(`Company ID ${empId} is already used by ${duplicate.name}.`);
      return;
    }
    setEmployeeIdError('');

    // Guard against a Hierarchy Level that conflicts with the assigned job
    // profile's org level — the position defines the level.
    if (orgLevelMismatch) return;

    const user: User = {
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      whatsapp: formData.whatsapp,
      role: formData.role || Role.EMPLOYEE,
      status: formData.status || 'ACTIVE', 
      departmentId: formData.departmentId || '',
      generalDepartmentId: formData.generalDepartmentId,
      jobProfileId: formData.jobProfileId,
      managerId: formData.managerId,
      avatarUrl: formData.avatarUrl,
      orgLevel: formData.orgLevel,
      location: formData.location,
      projectName: formData.projectName,
      projectId: formData.projectId,
      employeeId: formData.employeeId
    };
    onSave(user);
  };

  return (
    <div className="bg-white text-sm">
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Full Name</label>
                    <input required type="text" className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all placeholder:text-slate-600" 
                        value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. John Doe"/>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Company ID <span className="text-red-600">*</span></label>
                    <input
                        type="number"
                        required={currentUser.role === Role.ADMIN}
                        className={`w-full px-3 py-2 border rounded-sm focus:ring-2 focus:ring-slate-900 outline-none transition-all placeholder:text-slate-600 ${currentUser.role !== Role.ADMIN ? 'bg-slate-100 text-slate-600 cursor-not-allowed border-slate-300' : employeeIdError ? 'bg-white text-slate-900 border-red-400 focus:ring-red-500' : 'bg-white text-slate-900 border-slate-300'}`}
                        value={formData.employeeId ?? ''}
                        onChange={e => {
                            const v = e.target.value === '' ? undefined : parseInt(e.target.value);
                            setFormData({...formData, employeeId: v});
                            if (employeeIdError) setEmployeeIdError('');
                        }}
                        readOnly={currentUser.role !== Role.ADMIN}
                        placeholder="e.g. 10482"
                    />
                    {employeeIdError && <p className="text-[11px] font-bold text-red-600 mt-1">{employeeIdError}</p>}
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Email Address</label>
                    <input 
                        required 
                        type="email" 
                        className={`w-full px-3 py-2 border rounded-sm focus:ring-2 focus:ring-slate-900 outline-none transition-all placeholder:text-slate-600 ${!isNewUser ? 'bg-slate-50 text-slate-700 border-slate-300' : 'bg-white text-slate-900 border-slate-300'}`} 
                        value={formData.email || ''} 
                        onChange={e => isNewUser && setFormData({...formData, email: e.target.value})}
                        readOnly={!isNewUser} 
                        placeholder="john@company.com"
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Phone Number</label>
                    <input type="tel" className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all placeholder:text-slate-600" 
                        value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+20..."/>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">WhatsApp</label>
                    <input type="tel" className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all placeholder:text-slate-600" 
                        value={formData.whatsapp || ''} onChange={e => setFormData({...formData, whatsapp: e.target.value})} placeholder="+20..."/>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Project Name</label>
                    <input type="text" className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all placeholder:text-slate-600" 
                        value={formData.projectName || ''} onChange={e => setFormData({...formData, projectName: e.target.value})} placeholder="e.g. Expansion Phase II"/>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Project Location</label>
                    <input type="text" className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all placeholder:text-slate-600" 
                        value={formData.location || ''} onChange={e => setFormData({...formData, location: e.target.value})} placeholder="e.g. MIDOR, APC, AMO"/>
                </div>
                <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Avatar URL</label>
                    <div className="flex items-center gap-4">
                        {formData.avatarUrl ? (
                            <div className="relative w-12 h-12 rounded-none overflow-hidden border border-slate-300 shrink-0">
                                <img src={formData.avatarUrl} alt="Avatar Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </div>
                        ) : (
                            <div className="w-12 h-12 rounded-none bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0 text-slate-400">
                                <Users size={20} />
                            </div>
                        )}
                        <div className="flex-1 flex items-center gap-2">
                            <input 
                                type="url" 
                                className="flex-1 px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all placeholder:text-slate-600" 
                                value={formData.avatarUrl || ''} 
                                onChange={e => setFormData({...formData, avatarUrl: e.target.value})} 
                                placeholder="https://example.com/avatar.png"
                            />
                            {formData.avatarUrl && (
                                <button 
                                    type="button" 
                                    onClick={() => setFormData({...formData, avatarUrl: undefined})}
                                    className="px-3 py-2 text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-sm border border-slate-200 transition-colors font-medium text-xs whitespace-nowrap"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            <div className="p-6 bg-slate-50 rounded-sm border border-slate-100 space-y-6">
                <h4 className="font-bold text-slate-900 flex items-center gap-2 border-b border-slate-300 pb-2">
                    <Shield size={16} className="text-slate-900"/>
                    Organizational Role
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SearchableSelect 
                        label="System Role"
                        options={[
                            { value: Role.EMPLOYEE, label: 'Employee' },
                            { value: Role.ADMIN, label: 'Admin' },
                            { value: Role.CEO, label: 'CEO' }
                        ]}
                        value={formData.role || Role.EMPLOYEE} 
                        onChange={val => setFormData({...formData, role: val as Role})}
                    />
                    <SearchableSelect 
                        label="Account Status"
                        options={[
                            { value: 'ACTIVE', label: 'Active' },
                            { value: 'PENDING', label: 'Pending Approval' },
                            { value: 'REJECTED', label: 'Rejected' }
                        ]}
                        value={formData.status || 'ACTIVE'} 
                        onChange={val => setFormData({...formData, status: val as any})}
                    />
                    <SearchableSelect 
                        label="Assigned Project"
                        options={projectOptions}
                        value={formData.projectId || ''} 
                        onChange={handleProjectChange}
                        placeholder="Select Project..."
                    />
                    <SearchableSelect 
                        label="Assigned Location"
                        options={projects.map(p => ({ value: p.location || 'Remote', label: p.location || 'Remote' }))}
                        value={formData.location || ''} 
                        onChange={val => setFormData({...formData, location: val})}
                        placeholder="Select Location..."
                    />
                    <SearchableSelect 
                        label="Main Department (General)"
                        options={generalDeptOptions}
                        value={formData.generalDepartmentId || ''}
                        onChange={handleGeneralDeptChange}
                        placeholder={formData.role === Role.CEO ? "Optional for CEO..." : "Select General Department..."}
                        disabled={formData.role === Role.CEO}
                    />
                    <SearchableSelect 
                        label="Direct Department / Section"
                        options={deptOptions}
                        value={formData.departmentId || ''}
                        onChange={handleDepartmentChange}
                        placeholder={formData.role === Role.CEO ? "Optional for CEO..." : "Select Specific Department..."}
                        disabled={formData.role === Role.CEO}
                    />
                    <div className="md:col-span-2">
                        <SearchableSelect
                            label="Hierarchy Level"
                            placeholder="Select Hierarchy Level..."
                            options={ORG_HIERARCHY_ORDER.map(level => ({ value: level, label: `${ORG_LEVEL_LABELS[level]} (${level})` }))}
                            value={formData.orgLevel || ''}
                            onChange={handleOrgLevelChange}
                        />
                        {orgLevelMismatch ? (
                            <p className="text-[11px] font-bold text-red-600 mt-1 flex items-center gap-1">
                                <AlertTriangle size={12} />
                                Must match the job profile "{selectedJobProfile?.title}" ({selectedJobProfile?.orgLevel}). Set it to {selectedJobProfile?.orgLevel} or change the job profile.
                            </p>
                        ) : (
                            <p className="text-[10px] text-slate-600 mt-1">Defines the employee's band/grade within the department structure. Must match the assigned job profile's level.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="p-6 bg-slate-50 rounded-sm border border-slate-100 space-y-6">
                <h4 className="font-bold text-slate-900 flex items-center gap-2 border-b border-slate-300 pb-2">
                    <Briefcase size={16} className="text-slate-900"/>
                    Job & Reporting
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <SearchableSelect 
                        label="Job Profile"
                        options={jobOptions}
                        value={formData.jobProfileId || ''}
                        onChange={handleJobProfileChange}
                        placeholder="Assign Job Profile..."
                    />
                    <div className="flex flex-col">
                        <SearchableSelect 
                            label="Direct Manager"
                            options={managerOptions}
                            value={formData.managerId || ''}
                            onChange={(val) => { setFormData({...formData, managerId: val}); setManagerPrompt(false); }}
                            placeholder={contextDepartmentId ? "Select Manager from Dept..." : "Select Manager..."}
                        />
                        {managerPrompt && (
                            <p className="text-xs text-slate-600 font-medium mt-2 animate-pulse flex items-center gap-1">
                                <AlertTriangle size={12} />
                                The previous manager is not in the new department. Please re-select a manager.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-sm transition-colors font-bold uppercase tracking-wide text-xs">Cancel</button>
                <button type="submit" disabled={isSubmitting || orgLevelMismatch} className={`px-6 py-2 text-white rounded-sm transition-all flex items-center gap-2 font-bold uppercase tracking-wide text-xs hover: disabled:opacity-50 disabled:cursor-not-allowed ${isPending ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-700 hover:bg-blue-800'}`}>
                    {isPending ? <UserCheck size={16} /> : <Save size={16} />}
                    {isSubmitting ? 'Saving...' : isPending ? 'Approve & Activate' : 'Save Employee'}
                </button>
            </div>
        </form>
    </div>
  );
};

const SKILL_CATEGORIES = ['Technical', 'Behavioral', 'Safety', 'Management', 'Soft Skills'];

// Per-profile exam pass-mark override for one required skill. Placeholder shows
// the skill's own default passing score (from its WRITTEN_EXAM method) so the
// admin sees what applies when this field is left blank.
const PassingScoreInput: React.FC<{
  skillId: string;
  value?: number;
  onChange: (skillId: string, raw: string) => void;
}> = ({ skillId, value, onChange }) => {
  const examDefault = dataService.getSkillAssessmentMethods(skillId)
    .find(m => m.method === 'WRITTEN_EXAM' && typeof m.passingScorePercent === 'number')?.passingScorePercent;
  const placeholder = typeof examDefault === 'number' ? `${examDefault} (default)` : 'e.g. 70';
  return (
    <div className="flex flex-col min-w-[110px]">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Passing %</label>
      <input
        type="number"
        min={0}
        max={100}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(skillId, e.target.value)}
        className="border border-slate-300 rounded-none px-2 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
    </div>
  );
};

const JobForm: React.FC<{ initialData?: JobProfile | null, onSave: (j: JobProfile) => void, onCancel: () => void, isSubmitting?: boolean }> = ({ initialData, onSave, onCancel, isSubmitting }) => {
  const [formData, setFormData] = useState<Partial<JobProfile>>(initialData || { orgLevel: 'JP', requiredSkills: [] });
  const [skillCategoryFilter, setSkillCategoryFilter] = useState<string>('ALL');

  const departments = dataService.getAllDepartments();
  const allSkills = dataService.getAllSkills();
  const deptOptions = departments.map(d => ({ value: d.id, label: d.name, subLabel: d.code }));

  const skillOptions = useMemo(() => {
    let filtered = allSkills;
    if (skillCategoryFilter !== 'ALL') {
      filtered = filtered.filter(s => s.category === skillCategoryFilter);
    }
    return filtered.map(s => ({ value: s.id, label: s.name, subLabel: s.category }));
  }, [allSkills, skillCategoryFilter]);

  // A position can't sit above the unit it belongs to (org-hierarchy ordering).
  const placement = dataService.validateJobProfilePlacement(formData.orgLevel, formData.departmentId);

  // The Department / Position implies an org level (from its structural type or
  // title). Admins may override the Org Level, but we warn when it doesn't match.
  const selectedDept = departments.find(d => d.id === formData.departmentId);
  const impliedLevel = dataService.getDepartmentOrgLevel(selectedDept);
  const orgLevelMismatch = !!(placement.ok && formData.orgLevel && impliedLevel && formData.orgLevel !== impliedLevel);

  // Selecting a Department/Position derives the Org Level from the node's
  // structural type (the level is a property of the org-chart box, never guessed
  // from the title). The admin can still override it afterwards — for a unit that
  // holds several position bands (a Section head + its SP/JP/FR staff) they pick
  // the band below. Picking the dept gives the correct default with one action.
  const handleDepartmentChange = (val: string) => {
    const dept = departments.find(d => d.id === val);
    const derived = dataService.getDepartmentOrgLevel(dept);
    setFormData(prev => ({
      ...prev,
      departmentId: val,
      orgLevel: derived || prev.orgLevel,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.departmentId || !formData.orgLevel) return;
    if (!placement.ok) return;

    onSave({
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      title: formData.title,
      description: formData.description || '',
      departmentId: formData.departmentId,
      orgLevel: formData.orgLevel,
      requiredSkills: formData.requiredSkills || []
    });
  };

  const handleAddSkill = (skillId: string) => {
    if (!skillId) return;
    const current = formData.requiredSkills || [];
    if (current.find(r => r.skillId === skillId)) return; // Already exists
    setFormData({ ...formData, requiredSkills: [...current, { skillId, requiredLevel: 1 }] });
  };

  const handleUpdateReq = (skillId: string, level: number) => {
    const current = formData.requiredSkills || [];
    setFormData({ ...formData, requiredSkills: current.map(r => r.skillId === skillId ? { ...r, requiredLevel: level } : r) });
  };

  // Per-profile exam pass-mark override for a skill. Empty clears the override
  // (the skill's own default passing score then applies).
  const handleUpdatePassingScore = (skillId: string, raw: string) => {
    const current = formData.requiredSkills || [];
    const trimmed = raw.trim();
    const pct = trimmed === '' ? undefined : Math.min(100, Math.max(0, Math.round(Number(trimmed))));
    setFormData({
      ...formData,
      requiredSkills: current.map(r => {
        if (r.skillId !== skillId) return r;
        const { passingScorePercent, ...rest } = r;
        return pct === undefined || Number.isNaN(pct) ? rest : { ...rest, passingScorePercent: pct };
      })
    });
  };

  const handleRemoveReq = (skillId: string) => {
    const current = formData.requiredSkills || [];
    setFormData({ ...formData, requiredSkills: current.filter(r => r.skillId !== skillId) });
  };

  const levelRequirements = formData.requiredSkills || [];

  return (
    <form onSubmit={handleSubmit} className="p-8 space-y-8 bg-white text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2 bg-slate-50 p-4 border border-slate-200 rounded-none mb-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Auto-Generated Identifier</p>
            <div className="flex items-center gap-2">
                <span className="text-xl font-black text-blue-700 tracking-tight">
                    {dataService.generateJobProfileCode({
                        title: formData.title || 'Untitled',
                        departmentId: formData.departmentId || '',
                        description: '',
                        orgLevel: formData.orgLevel || 'JP',
                        requiredSkills: [],
                        id: ''
                    })}
                </span>
                <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-none font-bold uppercase">System Reference</span>
            </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Job Title</label>
          <input required className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none transition-all" 
            value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="e.g. Mechanical Engineer"/>
        </div>
        <SearchableSelect label="Department / Position" options={deptOptions} value={formData.departmentId || ''} onChange={handleDepartmentChange} />
        <div>
          <SearchableSelect
            label="Org Level"
            options={ORG_HIERARCHY_ORDER.map(level => ({ value: level, label: `${ORG_LEVEL_LABELS[level]} (${level})` }))}
            value={formData.orgLevel || ''}
            onChange={val => setFormData({...formData, orgLevel: val as OrgLevel})}
          />
          {impliedLevel && !orgLevelMismatch && (
            <p className="mt-1 text-[11px] text-slate-500">
              Auto-set from "{selectedDept?.name}" ({ORG_LEVEL_LABELS[impliedLevel]} / {impliedLevel}). Change it only for a lower band (e.g. SP/JP/FR) inside the same unit.
            </p>
          )}
        </div>
        {!placement.ok && (
          <div className="md:col-span-2 flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-sm text-red-700 text-xs font-medium">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{placement.error}</span>
          </div>
        )}
        {orgLevelMismatch && (
          <div className="md:col-span-2 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-sm text-amber-800 text-xs font-medium">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              The selected Org Level ({ORG_LEVEL_LABELS[formData.orgLevel!]} / {formData.orgLevel}) doesn't match the
              {' '}level implied by "{selectedDept?.name}" ({ORG_LEVEL_LABELS[impliedLevel!]} / {impliedLevel}).
              You can still save, but consider setting the Org Level to {impliedLevel} to keep it consistent with the org chart.
            </span>
          </div>
        )}
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Description</label>
          <textarea className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none" rows={2}
            value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} />
        </div>
      </div>

      <div className="border-t border-slate-300 pt-6">
        <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Layers size={18} className="text-slate-900"/>
            Required Skills for this Position
        </h4>

        <div className="flex flex-col gap-6">
          <div className="flex-1 bg-slate-50 rounded-sm border border-slate-300 p-6">
             <div className="flex justify-between items-center mb-6">
               <div>
                  <h5 className="font-bold text-slate-900">Required Skills — {formData.orgLevel ? ORG_LEVEL_LABELS[formData.orgLevel] : 'Select Org Level'}</h5>
                  <p className="text-xs text-slate-700">Define the mandatory skills and target levels for this specific position.</p>
               </div>
             </div>

             <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="md:col-span-1">
                  <SearchableSelect
                    label="Filter by Category"
                    options={[
                      { value: 'ALL', label: 'All Categories' },
                      ...SKILL_CATEGORIES.map(cat => ({ value: cat, label: cat }))
                    ]}
                    value={skillCategoryFilter}
                    onChange={setSkillCategoryFilter}
                  />
                </div>
                <div className="md:col-span-2">
                  <SearchableSelect label="Add Required Skill" options={skillOptions} value="" onChange={handleAddSkill} placeholder={skillCategoryFilter === 'ALL' ? "Search all skills..." : `Search ${skillCategoryFilter} skills...`} />
                </div>
             </div>

             <div className="space-y-8 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {SKILL_CATEGORIES.map(category => {
                  const categorySkills = levelRequirements.filter(req => {
                    const skill = allSkills.find(s => s.id === req.skillId);
                    return skill?.category === category;
                  });

                  return (
                    <div key={category} className="space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                        <h6 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
                          {category}
                          {categorySkills.length > 0 ? (
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-none text-[9px]">{categorySkills.length}</span>
                          ) : (
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-none text-[9px]">Missing</span>
                          )}
                        </h6>
                      </div>

                      <div className="space-y-2">
                        {categorySkills.length === 0 ? (
                          <div className="text-[11px] text-slate-500 italic py-2 px-3 bg-white/50 border border-dashed border-slate-300 rounded-none">
                            No {category} skills assigned.
                          </div>
                        ) : (
                          categorySkills.map(req => {
                            const skill = allSkills.find(s => s.id === req.skillId);
                            return (
                              <div key={req.skillId} className="bg-white p-3 rounded-none border border-slate-300  flex items-center gap-4">
                                 <div className="flex-1">
                                    <p className="font-bold text-slate-900 text-sm">{skill?.name}</p>
                                 </div>
                                 <div className="flex items-center gap-2 min-w-[120px]">
                                     <SearchableSelect
                                        label="Target Level"
                                        options={[1,2,3,4,5].map(v => ({ value: v.toString(), label: v.toString() }))}
                                        value={req.requiredLevel.toString()}
                                        onChange={(val) => handleUpdateReq(req.skillId, parseInt(val))}
                                     />
                                 </div>
                                 {dataService.skillHasMethod(req.skillId, 'WRITTEN_EXAM') && (
                                   <PassingScoreInput skillId={req.skillId} value={req.passingScorePercent} onChange={handleUpdatePassingScore} />
                                 )}
                                 <button type="button" onClick={() => handleRemoveReq(req.skillId)} className="text-slate-500 hover:text-slate-600 p-1 transition-colors"><X size={16} /></button>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Other categories if any */}
                {levelRequirements.some(req => !SKILL_CATEGORIES.includes(allSkills.find(s => s.id === req.skillId)?.category || '')) && (
                   <div className="space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-300 pb-2">
                        <h6 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Other</h6>
                      </div>
                      <div className="space-y-2">
                        {levelRequirements.filter(req => !SKILL_CATEGORIES.includes(allSkills.find(s => s.id === req.skillId)?.category || '')).map(req => {
                          const skill = allSkills.find(s => s.id === req.skillId);
                          return (
                            <div key={req.skillId} className="bg-white p-3 rounded-none border border-slate-300  flex items-center gap-4">
                               <div className="flex-1">
                                  <p className="font-bold text-slate-900 text-sm">{skill?.name}</p>
                                  <p className="text-[10px] text-slate-500 uppercase">{skill?.category}</p>
                               </div>
                               <div className="flex items-center gap-2 min-w-[120px]">
                                   <SearchableSelect
                                      label="Target Level"
                                      options={[1,2,3,4,5].map(v => ({ value: v.toString(), label: v.toString() }))}
                                      value={req.requiredLevel.toString()}
                                      onChange={(val) => handleUpdateReq(req.skillId, parseInt(val))}
                                   />
                               </div>
                               {dataService.skillHasMethod(req.skillId, 'WRITTEN_EXAM') && (
                                 <PassingScoreInput skillId={req.skillId} value={req.passingScorePercent} onChange={handleUpdatePassingScore} />
                               )}
                               <button type="button" onClick={() => handleRemoveReq(req.skillId)} className="text-slate-500 hover:text-slate-600 p-1 transition-colors"><X size={16} /></button>
                            </div>
                          );
                        })}
                      </div>
                   </div>
                )}
             </div>
          </div>
        </div>
      </div>

      <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-sm font-bold uppercase tracking-wide text-xs transition-colors">Cancel</button>
          <button type="submit" disabled={isSubmitting || !placement.ok} className="px-6 py-2 bg-blue-700 text-white rounded-sm font-bold uppercase tracking-wide text-xs hover:bg-blue-800 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
             <Save size={16} /> {isSubmitting ? 'Saving...' : 'Save Profile'}
          </button>
      </div>
    </form>
  );
};

// --- Question Manager Helper ---
const QuestionManager: React.FC<{
  title: string;
  questions: EvaluationQuestion[];
  onChange: (questions: EvaluationQuestion[]) => void;
  placeholder?: string;
}> = ({ title, questions, onChange, placeholder }) => {
  const addQuestion = () => {
    const newQuestion: EvaluationQuestion = {
      id: Math.random().toString(36).substr(2, 9),
      text: '',
      expectedCriteria: '',
      weight: 10,
    };
    onChange([...questions, newQuestion]);
  };

  const removeQuestion = (id: string) => {
    onChange(questions.filter(q => q.id !== id));
  };

  const updateQuestion = (id: string, field: keyof EvaluationQuestion, value: any) => {
    onChange(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
  };

  const totalWeight = questions.reduce((s, q) => s + (q.weight ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{title}</h5>
        <div className="flex items-center gap-3">
          {questions.length > 0 && (
            <span className={`text-xs font-bold px-2 py-1 rounded-sm border ${totalWeight === 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              Total weight: {totalWeight}%
            </span>
          )}
          <button type="button" onClick={addQuestion} className="flex items-center gap-1 text-blue-700 hover:text-blue-800 text-xs font-bold uppercase tracking-wide">
            <Plus size={14} /> Add Question
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {questions.length === 0 ? (
          <div className="text-xs text-slate-500 italic p-4 border border-dashed border-slate-300 rounded-sm bg-slate-50/50 text-center">
            No questions added yet. Click "Add Question" to start.
          </div>
        ) : (
          questions.map((q, idx) => (
            <div key={q.id} className="p-4 bg-white border border-slate-300 rounded-sm space-y-3 relative group">
              <button type="button" onClick={() => removeQuestion(q.id)} className="absolute top-2 right-2 text-slate-400 hover:text-red-600 transition-colors">
                <Trash2 size={14} />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Question {idx + 1}</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all"
                    value={q.text}
                    onChange={e => updateQuestion(q.id, 'text', e.target.value)}
                    placeholder={placeholder || "Enter question text..."}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Weight (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all"
                    value={q.weight ?? 10}
                    onChange={e => updateQuestion(q.id, 'weight', Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Expected Criteria / Answer Key</label>
                <textarea
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all"
                  rows={1}
                  value={q.expectedCriteria}
                  onChange={e => updateQuestion(q.id, 'expectedCriteria', e.target.value)}
                  placeholder="What defines a successful answer?"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// --- Skill Form (Competency Standard) ---
// Two top-level sections: the competency standard (identity + proficiency
// levels) and the inline assessment methods (how & when the skill is assessed).
const SkillForm: React.FC<{ initialData?: Skill | null, onSave: (s: Skill) => void, onCancel: () => void, isSubmitting?: boolean }> = ({ initialData, onSave, onCancel, isSubmitting }) => {
  const defaultLevels = {
    1: { level: 1, description: '', requiredCertificates: [] },
    2: { level: 2, description: '', requiredCertificates: [] },
    3: { level: 3, description: '', requiredCertificates: [] },
    4: { level: 4, description: '', requiredCertificates: [] },
    5: { level: 5, description: '', requiredCertificates: [] },
  };

  const [formData, setFormData] = useState<Partial<Skill>>(initialData || { levels: defaultLevels });
  const [activeTab, setActiveTab] = useState(1);
  const [section, setSection] = useState<'STANDARD' | 'METHODS'>('STANDARD');

  // Resolve the methods to edit: stored inline blocks, or a one-time synthesis
  // from any legacy linked instructions so existing config is editable inline.
  const [assessmentMethods, setAssessmentMethods] = useState<SkillAssessmentMethod[]>(
    () => initialData ? dataService.getSkillAssessmentMethods(initialData.id) : []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.category) return;

    // Normalise each block: keep only the schedule/audience sub-fields relevant
    // to its choices, and drop the question bank for evidence-based methods.
    const cleanMethods: SkillAssessmentMethod[] = assessmentMethods.map(m => {
      const isExam = m.method === 'WRITTEN_EXAM';
      const isRater = m.method === 'OJT_OBSERVATION' || m.method === 'THREE_SIXTY_EVALUATION';
      const hasAssessor = m.method === 'INTERVIEW' || m.method === 'PRACTICAL_DEMO' || m.method === 'THREE_SIXTY_EVALUATION';
      const isEvidence = m.method === 'WORK_RECORD_REVIEW';
      // Normalize rater weights (default when blank); 0..100 each.
      const rw = m.raterWeights || DEFAULT_RATER_WEIGHTS;
      const clampW = (n: number) => Math.min(100, Math.max(0, Math.round(n || 0)));

      return {
        id: m.id,
        method: m.method,
        assessmentQuestion: m.assessmentQuestion?.trim() || '',
        assessmentLink: isExam || m.method === 'INTERVIEW' || m.method === 'PRACTICAL_DEMO'
          ? (m.assessmentLink || '') : '',
        questions: isEvidence ? [] : (m.questions || []),
        // --- standards-based per-method controls (pruned by method type) ---
        ...(isExam ? {
          passingScorePercent: Math.min(100, Math.max(0, Math.round(m.passingScorePercent ?? 0))),
          timeLimitMinutes: Math.max(0, Math.round(m.timeLimitMinutes ?? 0)),
          questionCount: Math.max(0, Math.round(m.questionCount ?? 0))
        } : {}),
        ...(isRater ? {
          raterWeights: { self: clampW(rw.self), peer: clampW(rw.peer), manager: clampW(rw.manager) }
        } : {}),
        ...(hasAssessor ? { assessorRole: m.assessorRole || 'DIRECT_MANAGER' } : {}),
        ...(isEvidence ? {
          evidenceValidityMonths: Math.max(0, Math.round(m.evidenceValidityMonths ?? 0)),
          minEvidenceCount: Math.max(0, Math.round(m.minEvidenceCount ?? 0))
        } : {}),
        frequency: m.frequency,
        ...(m.frequency === 'ANNUAL_FIXED_DATE' ? { fixedMonth: m.fixedMonth || 1, fixedDay: m.fixedDay || 1 } : {}),
        audience: m.audience,
        audienceOrgLevels: m.audience === 'ORG_LEVELS' ? (m.audienceOrgLevels || []) : [],
        audienceDepartmentIds: m.audience === 'DEPARTMENTS' ? (m.audienceDepartmentIds || []) : []
      };
    });

    onSave({
       ...(initialData || {}),
       id: initialData?.id || Math.random().toString(36).substr(2, 9),
       name: formData.name,
       category: formData.category,
       subcategory: formData.subcategory,
       levels: formData.levels as any,
       status: 'APPROVED',
       // How AND when this skill is assessed now lives inline on the skill.
       assessmentMethods: cleanMethods,
       // Drop the deprecated reusable-instruction link.
       assessmentInstructionIds: []
    } as Skill);
  };

  const updateLevel = (lvl: number, field: string, value: any) => {
    setFormData(prev => ({
        ...prev,
        levels: {
            ...prev.levels,
            [lvl]: { ...prev.levels![lvl as any], [field]: value }
        } as any
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="p-8 space-y-8 bg-white text-sm">
       {/* Section tabs: Competency Standard vs Assessment Methods */}
       <div className="bg-slate-100 p-1 rounded-sm flex gap-1">
          <button type="button" onClick={() => setSection('STANDARD')}
             className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center justify-center gap-2 ${section === 'STANDARD' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
             <BookOpen size={14} /> Competency Standard
          </button>
          <button type="button" onClick={() => setSection('METHODS')}
             className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider rounded-sm transition-all flex items-center justify-center gap-2 ${section === 'METHODS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
             <Activity size={14} /> Assessment Methods
             {assessmentMethods.length > 0 && (
               <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full">{assessmentMethods.length}</span>
             )}
          </button>
       </div>

       <div className={section === 'STANDARD' ? '' : 'hidden'}>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 bg-slate-50 p-4 border border-slate-200 rounded-none mb-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">Auto-Generated Identifier</p>
              <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-blue-700 tracking-tight">
                      {dataService.generateSkillCode({ 
                          name: formData.name || 'Untitled', 
                          category: formData.category || 'Technical',
                          subcategory: formData.subcategory || '',
                          id: '',
                          levels: {},
                          assessmentMethod: 'OJT_OBSERVATION'
                      })}
                  </span>
                  <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-none font-bold uppercase">System Reference</span>
              </div>
          </div>
         <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Skill Name</label>
            <input required className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none transition-all"
               value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Project Management"/>
         </div>
         <div>
            <SearchableSelect 
              label="Category"
              options={[
                { value: 'Technical', label: 'Technical' },
                { value: 'Safety', label: 'Safety' },
                { value: 'Management', label: 'Management' },
                { value: 'Soft Skills', label: 'Soft Skills' },
                { value: 'Behavioral', label: 'Behavioral' }
              ]}
              value={formData.category || ''}
              onChange={val => setFormData({...formData, category: val as Skill['category']})}
              placeholder="Select Category..."
            />
         </div>
         <div>
            <SearchableSelect 
              label="Subcategory (Optional)"
              options={[
                { value: 'Maintenance', label: 'Maintenance' },
                { value: 'Operation', label: 'Operation' },
                { value: 'Inspection', label: 'Inspection' },
                { value: 'IT', label: 'IT' },
                { value: 'HR', label: 'HR' },
                { value: 'Tech', label: 'Tech' },
                { value: 'Managers', label: 'Managers' }
              ]}
              value={formData.subcategory || ''}
              onChange={val => setFormData({...formData, subcategory: val})}
              placeholder="Select Subcategory..."
            />
         </div>
       </div>

       <div className="border-t border-slate-300 pt-6">
          <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
             <BookOpen size={18} className="text-slate-900"/> Proficiency Definition
          </h4>

          <div className="bg-slate-100 p-1 rounded-none flex mb-6">
             {[1,2,3,4,5].map(lvl => (
                <button key={lvl} type="button" onClick={() => setActiveTab(lvl)}
                   className={`flex-1 py-2 text-xs font-bold rounded-none  transition-all ${activeTab === lvl ? 'bg-white text-slate-900' : 'text-slate-700 hover:text-slate-700'}`}>
                   Level {lvl}: {PROFICIENCY_LABELS[lvl]}
                </button>
             ))}
          </div>

          <div className="bg-slate-50 p-6 rounded-sm border border-slate-300">
             <div className="mb-4">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Description ({PROFICIENCY_LABELS[activeTab]})</label>
                <textarea className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none" rows={3}
                   value={formData.levels?.[activeTab as any]?.description || ''}
                   onChange={e => updateLevel(activeTab, 'description', e.target.value)}
                   // @ts-expect-error numeric index not in type
                   placeholder={PROFICIENCY_DEFINITIONS[activeTab]?.description || `Describe what a Level ${activeTab} (${PROFICIENCY_LABELS[activeTab]}) employee can do...`}
                />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Required Certificates (Comma Separated)</label>
                <input className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
                   placeholder="e.g. PMP, NEBOSH"
                   value={formData.levels?.[activeTab as any]?.requiredCertificates?.join(', ') || ''}
                   onChange={e => updateLevel(activeTab, 'requiredCertificates', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                />
             </div>
          </div>
       </div>
       </div>

       {/* Assessment Methods section */}
       <div className={section === 'METHODS' ? '' : 'hidden'}>
          <AssessmentMethodEditor methods={assessmentMethods} onChange={setAssessmentMethods} />
       </div>

       <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-sm font-bold uppercase tracking-wide text-xs transition-colors">Cancel</button>
          <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-700 text-white rounded-sm font-bold uppercase tracking-wide text-xs hover:bg-blue-800 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
             <Save size={16} /> {isSubmitting ? 'Saving...' : 'Save Definition'}
          </button>
      </div>
    </form>
  );
};

// --- Department Form ---
const DepartmentForm: React.FC<{ initialData?: Department | null, onSave: (d: Department) => void, onCancel: () => void, isSubmitting?: boolean }> = ({ initialData, onSave, onCancel, isSubmitting }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [code, setCode] = useState(initialData?.code || '');
    const [nameAr, setNameAr] = useState(initialData?.nameAr || '');
    const [type, setType] = useState<DepartmentType>(initialData?.type || 'DEPARTMENT');
    const [parentId, setParentId] = useState(initialData?.parentId || '');
    const [managerId, setManagerId] = useState(initialData?.managerId || '');
    const [projectId, setProjectId] = useState(initialData?.projectId || '');
    const [behavioralSkillIds, setBehavioralSkillIds] = useState<string[]>(initialData?.behavioralSkillIds || []);

    
    const users = dataService.getAllUsers();
    const depts = dataService.getAllDepartments();
    const projects = dataService.getAllProjects();
    
    const managerOptions = users.map(u => ({ value: u.id, label: u.name, subLabel: u.email }));
    const projectOptions = projects.map(p => ({ value: p.id, label: p.name }));

    
    const typeOptions = [
        { value: 'GENERAL', label: 'General Department' },
        { value: 'ASSISTANT_GENERAL', label: 'Assistant General Manager' },
        { value: 'DEPARTMENT', label: 'Department' },
        { value: 'SECTION', label: 'Section' }
    ];

    // Parent options excluding self
    const parentOptions = [
        { value: 'EPROM', label: 'EPROM (Root Organization)' },
        ...depts.filter(d => d.id !== initialData?.id).map(d => ({ value: d.id, label: d.name, subLabel: d.code }))
    ];
    
    const behavioralSkills = dataService.getAllSkills().filter(s => s.category === 'Behavioral');

    // Enforce org-hierarchy ordering: a child unit must sit below its parent.
    const resolvedParentId = parentId === 'EPROM' ? undefined : (parentId || undefined);
    const placement = dataService.validateUnitPlacement(type, resolvedParentId);

    const handleToggleSkill = (skillId: string) => {
        setBehavioralSkillIds(prev => 
            prev.includes(skillId) ? prev.filter(id => id !== skillId) : [...prev, skillId]
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!placement.ok) return;
        onSave({
            id: initialData?.id || Math.random().toString(36).substr(2, 9),
            name,
            code: code.trim().toUpperCase().replace(/\s+/g, '-') || undefined,
            nameAr: nameAr.trim() || undefined,
            type,
            projectId: projectId || undefined,
            parentId: parentId === 'EPROM' ? undefined : parentId,
            managerId: managerId || undefined,
            behavioralSkillIds
        });

    };

    return (
        <form onSubmit={handleSubmit} className="p-8 space-y-6 bg-white text-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Department Name</label>
                    <input required className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
                        value={name} onChange={e => setName(e.target.value)} />
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Code</label>
                    <input className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none font-mono uppercase"
                        value={code} onChange={e => setCode(e.target.value)} placeholder="Auto-generated if blank (e.g. HR-PERS)" />
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">الاسم بالعربية (Arabic Name)</label>
                    <input dir="rtl" className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
                        value={nameAr} onChange={e => setNameAr(e.target.value)} placeholder="اختياري" />
                </div>

                <div>
                    <SearchableSelect
                        label="Hierarchy Level / Type"
                        options={typeOptions}
                        value={type}
                        onChange={(v) => setType(v as DepartmentType)}
                        placeholder="Select Type..."
                    />
                    {type && DEPT_TYPE_TO_ORG_LEVEL[type] && (
                        <p className="mt-1 text-[11px] text-slate-500">
                            Positions in this unit are <span className="font-bold">{ORG_LEVEL_LABELS[DEPT_TYPE_TO_ORG_LEVEL[type]!]} ({DEPT_TYPE_TO_ORG_LEVEL[type]})</span> and below — order: CEO › ACEO › GM › AGM › DM › SH › SP › JP › FR.
                        </p>
                    )}
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SearchableSelect 
                    label="Assigned Project" 
                    options={projectOptions} 
                    value={projectId} 
                    onChange={setProjectId} 
                    placeholder="Select Project..." 
                />

                <SearchableSelect
                    label="Parent Unit / Organization"
                    options={parentOptions}
                    value={parentId || 'EPROM'}
                    onChange={setParentId}
                    placeholder="Select Parent..."
                />
            </div>

            {!placement.ok && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-sm text-red-700 text-xs font-medium">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>{placement.error}</span>
                </div>
            )}


            <SearchableSelect label="Parent Manager (Direct Dept. Manager)" options={managerOptions} value={managerId} onChange={setManagerId} placeholder="Select Manager..." />
            
            <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Behavioral Competencies</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-1">
                    {behavioralSkills.map(skill => (
                        <label key={skill.id} className={`flex items-start gap-3 p-3 rounded-sm border cursor-pointer transition-colors ${behavioralSkillIds.includes(skill.id) ? 'bg-slate-50 border-slate-300' : 'bg-white border-slate-300 hover:bg-slate-50'}`}>
                            <input 
                                type="checkbox" 
                                className="mt-1 w-4 h-4 text-slate-800 rounded-none border-slate-300 focus:ring-slate-900"
                                checked={behavioralSkillIds.includes(skill.id)}
                                onChange={() => handleToggleSkill(skill.id)}
                            />
                            <div>
                                <div className="font-bold text-slate-900 text-sm">{skill.name}</div>
                                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{dataService.getSkillAssessmentQuestion(skill.id)}</div>
                            </div>
                        </label>
                    ))}
                    {behavioralSkills.length === 0 && (
                        <div className="col-span-2 text-slate-500 italic text-sm p-4 bg-slate-50 rounded-sm text-center">
                            No behavioral competencies found in the system.
                        </div>
                    )}
                </div>
            </div>

            <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-sm font-bold uppercase tracking-wide text-xs transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting || !placement.ok} className="px-6 py-2 bg-blue-700 text-white rounded-sm font-bold uppercase tracking-wide text-xs hover:bg-blue-800 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    <Save size={16} /> {isSubmitting ? 'Saving...' : 'Save Dept'}
                </button>
            </div>
        </form>
    );
};

const ProjectForm: React.FC<{ initialData?: Project | null, onSave: (p: Project) => void, onCancel: () => void, isSubmitting?: boolean }> = ({ initialData, onSave, onCancel, isSubmitting }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [location, setLocation] = useState(initialData?.location || '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            id: initialData?.id || Math.random().toString(36).substr(2, 9),
            name,
            description,
            location
        });
    };

    return (
        <form onSubmit={handleSubmit} className="p-8 space-y-6 bg-white text-sm">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Project Name</label>
                    <input required className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
                        value={name} onChange={e => setName(e.target.value)} placeholder="e.g. MIDOR Expansion" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Location</label>
                    <input className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
                        value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Alexandria" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Description</label>
                    <textarea className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none" rows={3}
                        value={description} onChange={e => setDescription(e.target.value)} placeholder="Project details..." />
                </div>
            </div>
            <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-sm font-bold uppercase tracking-wide text-xs transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-700 text-white rounded-sm font-bold uppercase tracking-wide text-xs hover:bg-blue-800 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    <Save size={16} /> {isSubmitting ? 'Saving...' : 'Save Project'}
                </button>
            </div>
        </form>
    );
};

const ProjectList: React.FC<{
    projects: Project[];
    onSelect: (id: string) => void;
    onEdit: (p: Project) => void;
    onDelete: (id: string) => void;
    onAdd: () => void;
}> = ({ projects, onSelect, onEdit, onDelete, onAdd }) => {
    return (
        <div className="p-8 bg-slate-50 min-h-[500px]">
             <div className="flex justify-between items-center mb-8 border-b border-slate-200 pb-6">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 tracking-tight">Active Projects</h2>
                    <p className="text-sm text-slate-500">Select a project to manage its organizational structure.</p>
                </div>
                <button onClick={onAdd} className="bg-blue-700 hover:bg-blue-800 text-white px-6 py-2.5 rounded-sm text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all shadow-md">
                    <Plus size={18} /> New Project
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(project => {
                    const projectDepts = dataService.getAllDepartments().filter(d =>
                        d.projectId === project.id || (project.name.toUpperCase() === 'HQ' && !d.projectId)
                    );
                    // Count only top-level units (general departments / true roots /
                    // orphans whose parent isn't in this project) so the figure matches
                    // what the hierarchy view shows at its first level — not every
                    // nested sub-department and section.
                    const projectDeptIds = new Set(projectDepts.map(d => d.id));
                    const topLevelDeptCount = projectDepts.filter(d =>
                        d.type === 'GENERAL' || !d.parentId || !projectDeptIds.has(d.parentId)
                    ).length;
                    const totalStaff = dataService.getAllUsers().filter(u => {
                        const dept = dataService.getAllDepartments().find(d => d.id === u.departmentId);
                        return dept?.projectId === project.id || (project.name.toUpperCase() === 'HQ' && (!dept || !dept.projectId));
                    }).length;

                    return (
                        <div 
                            key={project.id} 
                            onClick={() => onSelect(project.id)}
                            className="bg-white rounded-none border border-slate-300 hover: transition-all group cursor-pointer overflow-hidden flex flex-col relative"
                        >
                            <div className="p-6 flex-1">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-sm flex items-center justify-center group-hover:bg-emerald-700 group-hover:text-white transition-all shadow-sm border border-emerald-100 relative">
                                        <Briefcase size={28} />
                                        {project.name.toUpperCase() === 'HQ' && (
                                            <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-none uppercase tracking-tighter">Default</span>
                                        )}
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); onEdit(project); }} className="p-1.5 text-slate-400 hover:text-slate-900 transition-colors"><Edit2 size={16}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); onDelete(project.id); }} className="p-1.5 text-slate-400 hover:text-red-700 transition-colors"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                                
                                <h3 className="text-xl font-bold text-slate-900 mb-1 group-hover:text-emerald-700 transition-colors">{project.name}</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-4 flex items-center gap-1.5">
                                    <MapPin size={12} className="text-slate-400"/> {project.location || 'Remote'}
                                </p>
                                
                                <div className="space-y-3 mt-6">
                                    <div className="grid grid-cols-2 gap-4 mt-6">
                                        <div className="bg-slate-50 p-3 rounded-none border border-slate-100">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Departments</p>
                                            <p className="text-lg font-bold text-slate-900">{topLevelDeptCount}</p>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-none border border-slate-100">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Workforce</p>
                                            <p className="text-lg font-bold text-slate-900">{totalStaff}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between group-hover:bg-emerald-700/5 transition-colors">
                                <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Select Project</span>
                                <ChevronRight size={16} className="text-emerald-700 group-hover:translate-x-1 transition-transform" />
                            </div>
                            <div className="h-1 w-full bg-emerald-700 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                        </div>
                    );
                })}
                {projects.length === 0 && (
                    <div className="col-span-full py-20 text-center bg-white border border-dashed border-slate-300 rounded-none">
                        <Briefcase size={48} className="mx-auto text-slate-200 mb-4" />
                        <h4 className="text-lg font-bold text-slate-400">No Projects Defined</h4>
                        <p className="text-slate-500 max-w-xs mx-auto text-sm mt-1">Start by creating your first project to organize departments.</p>
                        <button onClick={onAdd} className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-blue-700 text-white font-bold uppercase text-xs tracking-widest rounded-sm hover:bg-blue-800 transition-all shadow-md">
                            <Plus size={16} /> Create Project
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- Hierarchical Structure Components ---
const EmployeeNode: React.FC<{
    user: User;
    allUsers: User[];
    allDepts: Department[];
    allJobs: JobProfile[];
    currentUser: User | null;
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onEditUser: (u: User) => void;
    onPromoteUser: (u: User) => void;
    level: number;
    path: string[];
}> = ({ user, allUsers, allDepts, allJobs, currentUser, onEdit, onDelete, onAddChild, onEditUser, onPromoteUser, level, path }) => {
    // Reports logic: ONLY same-department employees should be nested here
    const reports = allUsers.filter(u => u.managerId === user.id && u.departmentId === user.departmentId);
    
    // Departments where this user is the specific manager, but NOT if they are already in the ancestry (synchronization)
    const managedDepts = allDepts.filter(d => d.managerId === user.id && !path.includes(d.id));
    
    // Dept-specific context for this user's internal unit
    const userDeptId = user.departmentId;
    const deptJobs = allJobs.filter(j => j.departmentId === userDeptId);
    const job = deptJobs.find(j => j.id === user.jobProfileId);

    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = reports.length > 0 || managedDepts.length > 0;

    return (
        <div className={`ml-${level > 0 ? 6 : 0} border-l border-slate-200 pl-4 py-1 mt-1`}>
            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between group/user bg-slate-50/70 p-2.5 border border-slate-200 rounded-sm text-xs transition-colors hover:border-indigo-400 shadow-sm/50">
                    <div className="flex items-center gap-3">
                        {hasChildren ? (
                            <button 
                                onClick={() => setIsExpanded(!isExpanded)}
                                className={`p-0.5 hover:bg-white rounded-sm transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            >
                                <ChevronRight size={12} className="text-slate-400" />
                            </button>
                        ) : (
                            <div className="w-4" />
                        )}
                        <div className="w-8 h-8 rounded-none bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">
                            {user.name[0]}
                        </div>
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">
                                    {user.name} {user.employeeId && <span className="text-slate-400 font-medium text-[10px] ml-1">ID: {user.employeeId}</span>}
                                </span>
                                <span className="text-indigo-700 font-bold uppercase text-[8px] bg-indigo-50 px-1.5 py-0.5 rounded-none border border-indigo-100">{user.orgLevel || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                                {job ? <span>{job.title}</span> : <span className="italic">No Profile Assigned</span>}
                                {user.role === 'ADMIN' && <Shield size={10} className="text-slate-400" />}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover/user:opacity-100 transition-opacity">
                        <button 
                            onClick={() => onPromoteUser(user)} 
                            className="p-1.5 text-blue-600 hover:bg-white rounded-sm border border-transparent hover:border-blue-200 transition-all" 
                            title="Promote / Transfer"
                        >
                            <TrendingUp size={12}/>
                        </button>
                        <button 
                            onClick={() => onEditUser(user)} 
                            className="p-1.5 text-slate-600 hover:bg-white rounded-sm border border-transparent hover:border-slate-200 transition-all" 
                            title="Edit Employee Profile"
                        >
                            <Edit2 size={12}/>
                        </button>
                    </div>
                </div>

                {isExpanded && hasChildren && (
                    <div className="space-y-1">
                        {reports.map(report => (
                            <EmployeeNode 
                                key={report.id} 
                                user={report} 
                                allUsers={allUsers}
                                allDepts={allDepts} 
                                allJobs={allJobs} 
                                currentUser={currentUser}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onAddChild={onAddChild}
                                onEditUser={onEditUser}
                                onPromoteUser={onPromoteUser}
                                level={level + 1}
                                path={path}
                            />
                        ))}
                        {/* Render managed departments next, providing the link the user requested (Synchronization) */}
                        {managedDepts.map(d => (
                            <DepartmentNode 
                                key={d.id}
                                dept={d}
                                allDepts={allDepts}
                                allJobs={allJobs}
                                allUsers={allUsers}
                                currentUser={currentUser}
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onAddChild={onAddChild}
                                onEditUser={onEditUser}
                                onPromoteUser={onPromoteUser}
                                level={level + 1}
                                path={[...path, d.id]}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const DepartmentNode: React.FC<{ 
    dept: Department | { id: string; name: string; isRoot: boolean }; 
    allDepts: Department[]; 
    allJobs: JobProfile[]; 
    allUsers: User[];
    currentUser: User | null;
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onEditUser: (u: User) => void;
    onPromoteUser: (u: User) => void;
    level: number;
    path: string[];
}> = ({ dept, allDepts, allJobs, allUsers, currentUser, onEdit, onDelete, onAddChild, onEditUser, onPromoteUser, level, path }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    
    // Find departments that are children via parentId
    const childrenByParent = allDepts.filter(d => d.parentId === dept.id || (!d.parentId && (dept as any).isRoot));
    
    // Find users directly in this department
    // SPECIAL CASE: CEO-role users appear at the ROOT of the company tree
    const deptUsers = (dept as any).isRoot 
        ? allUsers.filter(u => u.role === Role.CEO || u.orgLevel === 'CEO')
        : allUsers.filter(u => u.departmentId === dept.id && ((currentUser?.role === Role.CEO || currentUser?.role === Role.ADMIN) ? true : (u.role !== Role.CEO && u.orgLevel !== 'CEO')));
        
    const deptJobs = allJobs.filter(j => j.departmentId === dept.id);

    // To prevent duplicate rendering, only show departments here if:
    // 1. They have no manager assigned.
    // 2. OR their manager is NOT in this department's personnel structure
    const unmanagedUnits = childrenByParent.filter(d => 
        !d.managerId || !deptUsers.some(u => u.id === d.managerId)
    );

    return (
        <div className="ml-4 md:ml-8 border-l-2 border-slate-200 pl-4 py-2 my-1 transition-all">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between group bg-white p-3 border border-slate-200 rounded-sm hover:border-blue-500 transition-colors shadow-sm">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsExpanded(!isExpanded)}
                            className={`p-1 hover:bg-slate-100 rounded-sm transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        >
                            <ChevronRight size={16} className="text-slate-400" />
                        </button>
                        <div className="flex items-center gap-2">
                            {(dept as any).isRoot ? <Shield className="text-blue-700" size={18} /> : 
                             (dept as Department).type === 'GENERAL' || (dept as Department).type === 'ASSISTANT_GENERAL' ? <Layers className="text-indigo-700" size={18} /> :
                             (dept as Department).type === 'SECTION' ? <LayoutGrid className="text-slate-500" size={18} /> :
                             <Building2 className="text-slate-600" size={18} />}
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-900">{(dept as any).name}</span>
                                {!(dept as any).isRoot && (
                                    <span className="text-[9px] uppercase tracking-tighter text-slate-500 font-bold">
                                        {(dept as Department).type?.replace('_', ' ') || 'DEPARTMENT'}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-none font-bold uppercase">{deptJobs.length} Jobs</span>
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-none font-bold uppercase">{deptUsers.length} Employees</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onAddChild(dept.id)} className="p-1.5 text-blue-700 hover:bg-blue-50 rounded-sm" title="Add Sub-department"><Plus size={16}/></button>
                        {!(dept as any).isRoot && (
                            <>
                                <button onClick={() => onEdit(dept as Department)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-sm" title="Edit"><Edit2 size={16}/></button>
                                <button onClick={() => onDelete(dept.id)} className="p-1.5 text-slate-600 hover:bg-red-50 rounded-sm" title="Delete"><Trash2 size={16}/></button>
                            </>
                        )}
                    </div>
                </div>

                {isExpanded && (
                    <div className="space-y-2 mt-1">
                        {/* Recursive Employee Hierarchy in this Dept */}
                        {deptUsers.length > 0 && (
                            <div className="ml-8 space-y-1 mb-6 pr-4">
                                <div className="flex items-center gap-2 mb-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                    <Users size={12} /> Personnel Structure
                                </div>
                                {deptUsers.filter(u => {
                                    // Root employees for THIS department are those whose manager is:
                                    // 1. Not in this department at all (cross-department reporting)
                                    // 2. Or they have no manager assigned
                                    const manager = allUsers.find(m => m.id === u.managerId);
                                    return !manager || manager.departmentId !== dept.id;
                                }).map(rootUser => (
                                    <EmployeeNode 
                                        key={rootUser.id}
                                        user={rootUser}
                                        allUsers={allUsers}
                                        allDepts={allDepts}
                                        allJobs={allJobs}
                                        currentUser={currentUser}
                                        onEdit={onEdit}
                                        onDelete={onDelete}
                                        onAddChild={onAddChild}
                                        onEditUser={onEditUser}
                                        onPromoteUser={onPromoteUser}
                                        level={0}
                                        path={[...path, (dept as any).id || (dept as any).name]}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Unmanaged units or units managed by someone outside this dept's direct personnel */}
                        {unmanagedUnits.length > 0 && (
                            <div className="ml-0 md:ml-4 space-y-1">
                                {unmanagedUnits.map(child => (
                                    <DepartmentNode 
                                        key={child.id} 
                                        dept={child} 
                                        allDepts={allDepts} 
                                        allJobs={allJobs} 
                                        allUsers={allUsers} 
                                        currentUser={currentUser}
                                        onEdit={onEdit} 
                                        onDelete={onDelete}
                                        onAddChild={onAddChild}
                                        onEditUser={onEditUser}
                                        onPromoteUser={onPromoteUser}
                                        level={level + 1}
                                        path={[...path, dept.id]}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const OrgStructureView: React.FC<{
    depts: Department[];
    jobs: JobProfile[];
    users: User[];
    currentUser: User | null;
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onEditUser: (u: User) => void;
    onPromoteUser: (u: User) => void;
}> = ({ depts, jobs, users, currentUser, onEdit, onDelete, onAddChild, onEditUser, onPromoteUser }) => {
    const rootDept = { id: 'ROOT', name: 'EPROM', isRoot: true };

    return (
        <div className="p-6 bg-slate-50 min-h-[500px] overflow-x-auto">
            <div className="inline-block min-w-full">
                <DepartmentNode 
                    dept={rootDept} 
                    allDepts={depts} 
                    allJobs={jobs} 
                    allUsers={users} 
                    currentUser={currentUser}
                    onEdit={onEdit} 
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                    onEditUser={onEditUser}
                    onPromoteUser={onPromoteUser}
                    level={0}
                    path={[]}
                />
            </div>
        </div>
    );
};



interface DepartmentProfileViewProps {
  deptId: string;
  depts: Department[];
  jobProfiles: JobProfile[];
  users: User[];
  currentUser: User | null;
  onBack: (id: string | null) => void;
  onEdit: (d: Department) => void;
  onDelete: (id: string) => void;
  onAddChild: (id: string) => void;
  onEditUser: (u: User) => void;
  onPromoteUser: (u: User) => void;
  onSelectDept: (id: string) => void;
}

const DepartmentProfileView: React.FC<DepartmentProfileViewProps> = ({ 
  deptId, 
  depts, 
  jobProfiles, 
  users, 
  currentUser,
  onBack, 
  onEdit, 
  onDelete, 
  onAddChild, 
  onEditUser,
  onPromoteUser,
  onSelectDept
}) => {
    const [activeTab, setActiveTab] = useState<'PERSONNEL' | 'SUBUNITS'>('PERSONNEL');
    const dept = depts.find(d => d.id === deptId);
    if (!dept) return null;

    const deptManager = users.find(u => u.id === dept.managerId);
    
    // Direct personnel in THIS specific level
    const directPersonnel = users.filter(u => u.departmentId === dept.id);
    
    // Direct sub-units (children of this unit)
    const subUnits = depts.filter(d => d.parentId === deptId);
    
    // Total workforce in this branch (for stats)
    const allDescendantIds = depts.filter(d => {
        let current = d;
        const visited = new Set();
        while(current.parentId) {
            if (visited.has(current.id)) break;
            visited.add(current.id);
            if (current.parentId === dept.id) return true;
            const parent = depts.find(pd => pd.id === current.parentId);
            if (!parent) break;
            current = parent;
        }
        return false;
    }).map(d => d.id);
    const totalWorkforce = users.filter(u => u.departmentId === dept.id || allDescendantIds.includes(u.departmentId));

    // Group direct personnel by hierarchy level
    const personnelByLevel = useMemo(() => {
        const groups: Record<string, User[]> = {};
        directPersonnel.forEach(p => {
            const level = p.orgLevel || 'FR';
            if (!groups[level]) groups[level] = [];
            groups[level].push(p);
        });
        return groups;
    }, [directPersonnel]);

    // Hierarchy sort order (Highest first)
    const LEVEL_ORDER = ['GM', 'AGM', 'DM', 'SH', 'SP', 'JP', 'FR']; // Define based on company standards
    const sortedLevelKeys = Object.keys(personnelByLevel).sort((a, b) => {
        const idxA = LEVEL_ORDER.indexOf(a);
        const idxB = LEVEL_ORDER.indexOf(b);
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
    });

    return (
        <div className="bg-slate-50 min-h-[600px] animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Header / Banner */}
            <div className="bg-white border-b border-slate-300 p-8 sticky top-0 z-20 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => onBack(dept.parentId || null)} 
                            className="p-3 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-sm border border-slate-200 transition-all group"
                            title={dept.parentId ? "Back to Parent" : "Back to Main List"}
                        >
                            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                        </button>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{dept.name}</h2>
                                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-widest border border-blue-100">
                                    {dept.type?.replace('_', ' ') || 'DEPARTMENT'}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-slate-600">
                                <span className="flex items-center gap-1.5 font-medium"><UserCheck size={16} className="text-slate-400" /> {(deptManager && (deptManager.role !== Role.CEO && deptManager.orgLevel !== 'CEO' || currentUser?.role === Role.CEO || currentUser?.role === Role.ADMIN)) ? deptManager.name : 'No Manager Assigned'}</span>
                                <span className="w-1.5 h-1.5 rounded-none bg-slate-300"></span>
                                <span className="flex items-center gap-1.5 font-medium"><Users size={16} className="text-slate-400" /> {totalWorkforce.length} Total Workforce</span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex gap-2">
                        <button onClick={() => onAddChild(dept.id)} className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-blue-800 transition-all shadow-sm">
                            <Plus size={16} /> New Sub-Unit
                        </button>
                        <button onClick={() => onEdit(dept)} className="p-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-sm transition-all shadow-sm">
                            <Edit2 size={18} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-8 space-y-8">
                <div className="flex border-b border-slate-200 gap-8">
                    <button 
                        onClick={() => setActiveTab('PERSONNEL')} 
                        className={`pb-4 text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2 flex items-center gap-2 ${activeTab === 'PERSONNEL' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        <Users size={16} /> Direct Personnel ({directPersonnel.length})
                    </button>
                    <button 
                        onClick={() => setActiveTab('SUBUNITS')} 
                        className={`pb-4 text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2 flex items-center gap-2 ${activeTab === 'SUBUNITS' ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        <Building2 size={16} /> Nested Units ({subUnits.length})
                    </button>
                </div>

                {/* 1. DIRECT PERSONNEL GRID (Priority #1) */}
                {activeTab === 'PERSONNEL' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                        <div className="w-8 h-8 bg-blue-700 text-white rounded-sm flex items-center justify-center">
                            <Users size={18} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight uppercase tracking-tight">Direct Personnel</h3>
                        <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-none uppercase">{directPersonnel.length} Employees</span>
                    </div>

                    {sortedLevelKeys.length > 0 ? (
                        <div className="space-y-12">
                            {sortedLevelKeys.map(level => (
                                <div key={level} className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-0.5 flex-1 bg-slate-200"></div>
                                        <div className="px-4 py-1.5 bg-white border border-slate-300 rounded-none shadow-sm flex items-center gap-2">
                                            <span className="text-[10px] font-black text-blue-700 uppercase tracking-[0.2em]">Hierarchy Level</span>
                                            <span className="text-sm font-black text-slate-900">{level}</span>
                                        </div>
                                        <div className="h-0.5 flex-1 bg-slate-200"></div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                        {personnelByLevel[level].map(person => (
                                            <div 
                                                key={person.id} 
                                                onClick={() => onEditUser(person)} 
                                                className="bg-white p-5 border border-slate-200 rounded-none hover:border-blue-700 hover:shadow-lg transition-all cursor-pointer group relative overflow-hidden"
                                            >
                                                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); onPromoteUser(person); }} 
                                                        className="p-1 bg-blue-50 text-blue-700 rounded-sm hover:bg-blue-600 hover:text-white transition-all"
                                                        title="Promote / Transfer"
                                                    >
                                                        <TrendingUp size={12}/>
                                                    </button>
                                                    <div className="p-1 bg-slate-50 text-slate-600 rounded-sm hover:bg-slate-900 hover:text-white transition-all"><Edit2 size={12}/></div>
                                                </div>
                                                <div className="flex items-center gap-4 mb-4">
                                                    <div className="w-12 h-12 rounded-none bg-slate-100 flex items-center justify-center text-slate-900 font-bold text-lg border border-slate-200 group-hover:bg-blue-700 group-hover:text-white transition-colors flex-shrink-0">
                                                        {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="w-full h-full object-cover rounded-none"/> : person.name[0]}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors uppercase tracking-tight leading-tight break-words">{person.name}</h4>
                                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{person.role}</p>
                                                    </div>
                                                </div>
                                                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Unit Role</span>
                                                        <span className="font-bold text-slate-700 uppercase tracking-widest text-[10px] leading-relaxed break-words">
                                                            {jobProfiles.find(j => j.id === person.jobProfileId)?.title || person.role}
                                                        </span>
                                                    </div>
                                                    <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-700 group-hover:translate-x-1 transition-all flex-shrink-0" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-12 bg-white border border-dashed border-slate-300 text-center rounded-none group hover:border-blue-300 transition-colors">
                            <Users size={32} className="mx-auto text-slate-200 mb-3 group-hover:text-blue-200 transition-colors" />
                            <p className="text-sm text-slate-500 font-medium">No personnel assigned directly to this level.</p>
                            <button onClick={() => onEditUser({} as any)} className="text-blue-700 hover:underline text-xs font-bold uppercase tracking-widest mt-2">Assign First Employee</button>
                        </div>
                    )}
                </div>
                )}

                {/* 2. SUB-UNITS GRID (Priority #2) */}
                {activeTab === 'SUBUNITS' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                        <div className="w-8 h-8 bg-indigo-700 text-white rounded-sm flex items-center justify-center">
                            <Building2 size={18} />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight">Organizational Units</h3>
                        <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-none uppercase">{subUnits.length} Units</span>
                    </div>

                    {subUnits.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {subUnits.map(unit => {
                                const unitManager = users.find(u => u.id === unit.managerId);
                                const unitSubUnits = depts.filter(d => d.parentId === unit.id);
                                
                                // Direct personnel in this unit
                                const unitPersonnel = users.filter(u => u.departmentId === unit.id);
                                
                                return (
                                    <div 
                                        key={unit.id} 
                                        onClick={() => onSelectDept(unit.id)}
                                        className="bg-white border border-slate-300 rounded-none group hover: active:scale-[0.99] transition-all cursor-pointer overflow-hidden flex flex-col"
                                    >
                                        <div className="p-6 flex-1">
                                            <div className="flex justify-between items-start mb-6">
                                                <div className="w-12 h-12 bg-indigo-50 text-indigo-700 rounded-sm flex items-center justify-center group-hover:bg-indigo-700 group-hover:text-white transition-all border border-indigo-100">
                                                    <Building2 size={24} />
                                                </div>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={(e) => { e.stopPropagation(); onEdit(unit); }} className="p-1.5 text-slate-400 hover:text-slate-900 transition-colors"><Edit2 size={16}/></button>
                                                    <button onClick={(e) => { e.stopPropagation(); onDelete(unit.id); }} className="p-1.5 text-slate-400 hover:text-red-700 transition-colors"><Trash2 size={16}/></button>
                                                </div>
                                            </div>

                                            <h4 className="text-lg font-bold text-slate-900 mb-1 tracking-tight group-hover:text-indigo-700 transition-colors uppercase">{unit.name}</h4>
                                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-6">{unit.type?.replace('_', ' ') || 'UNIT'}</p>

                                            <div className="space-y-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-7 h-7 bg-slate-50 rounded-none flex items-center justify-center text-slate-400">
                                                        <UserCheck size={14} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Unit Manager</p>
                                                        <p className="text-xs font-bold text-slate-800 truncate">{(unitManager && (unitManager.role !== Role.CEO && unitManager.orgLevel !== 'CEO' || currentUser?.role === Role.CEO || currentUser?.role === Role.ADMIN)) ? unitManager.name : 'Unassigned'}</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 mt-4">
                                                    <div className="bg-slate-50 p-2.5 rounded-none border border-slate-100">
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Personnel</p>
                                                        <p className="text-sm font-black text-slate-900">{unitPersonnel.length}</p>
                                                    </div>
                                                    <div className="bg-slate-50 p-2.5 rounded-none border border-slate-100">
                                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mb-1">Sub-Units</p>
                                                        <p className="text-sm font-black text-slate-900">{unitSubUnits.length}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between group-hover:bg-indigo-700/5 transition-colors">
                                            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">Explore Unit</span>
                                            <ChevronRight size={14} className="text-indigo-700 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-16 bg-white border border-dashed border-slate-300 rounded-none">
                            <Building2 size={48} className="mx-auto text-slate-200 mb-4" />
                            <h4 className="text-lg font-bold text-slate-400">Terminal Node</h4>
                            <p className="text-slate-500 max-w-xs mx-auto text-sm mt-1">This organizational unit has no sub-divisions defined.</p>
                            <button onClick={() => onAddChild(dept.id)} className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-blue-700 text-white font-bold uppercase text-xs tracking-widest rounded-sm hover:bg-blue-800 transition-all shadow-md">
                                <Plus size={16} /> Create Sub-Unit
                            </button>
                        </div>
                    )}
                </div>
                )}
            </div>
        </div>
    );
};

// --- Org Hierarchy: tree-list + detail panel ---

const deptTypeIcon = (type?: DepartmentType) =>
    type === 'GENERAL' || type === 'ASSISTANT_GENERAL' ? Layers : type === 'SECTION' ? LayoutGrid : Building2;

// Per-type accent palette for unit cards (tile / left bar / type chip).
const deptTypeStyle = (type?: DepartmentType) => {
    switch (type) {
        case 'COMPANY':
        case 'EXECUTIVE':
        case 'SECTOR':     return { tile: 'bg-purple-50 text-purple-700 group-hover:bg-purple-700 group-hover:text-white', bar: 'bg-purple-400', chip: 'bg-purple-50 text-purple-600' };
        case 'GENERAL':    return { tile: 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-700 group-hover:text-white', bar: 'bg-indigo-400', chip: 'bg-indigo-50 text-indigo-600' };
        case 'ASSISTANT_GENERAL': return { tile: 'bg-sky-50 text-sky-700 group-hover:bg-sky-700 group-hover:text-white', bar: 'bg-sky-400', chip: 'bg-sky-50 text-sky-600' };
        case 'DEPARTMENT': return { tile: 'bg-blue-50 text-blue-700 group-hover:bg-blue-700 group-hover:text-white',   bar: 'bg-blue-400',   chip: 'bg-blue-50 text-blue-600' };
        case 'SECTION':    return { tile: 'bg-teal-50 text-teal-700 group-hover:bg-teal-700 group-hover:text-white',   bar: 'bg-teal-400',   chip: 'bg-teal-50 text-teal-600' };
        default:           return { tile: 'bg-slate-100 text-slate-600 group-hover:bg-slate-700 group-hover:text-white', bar: 'bg-slate-300', chip: 'bg-slate-100 text-slate-600' };
    }
};

// Shared card for a child organizational unit (used in the detail panel's
// Sub-Units and project Top-Level Units lists). Bilingual, drill-in on click.
const UnitCard: React.FC<{
    unit: Department;
    staff: number;
    childCount: number;
    onSelect: (id: string) => void;
}> = ({ unit, staff, childCount, onSelect }) => {
    const UnitIcon = deptTypeIcon(unit.type);
    const c = deptTypeStyle(unit.type);
    return (
        <div
            onClick={() => onSelect(unit.id)}
            className="group flex items-stretch bg-white border border-slate-200 rounded-none cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all overflow-hidden"
        >
            <div className={`w-1 shrink-0 ${c.bar}`} />
            <div className="flex items-start gap-3 px-4 py-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-sm flex items-center justify-center shrink-0 transition-colors ${c.tile}`}>
                    <UnitIcon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                    <span dir="rtl" title={unit.nameAr || unit.name} className="font-bold text-slate-800 block leading-snug break-words group-hover:text-blue-700 transition-colors">{unit.nameAr || unit.name}</span>
                    {unit.nameAr && <span title={unit.name} className="text-[11px] text-slate-500 block leading-snug break-words">{unit.name}</span>}
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-none ${c.chip}`}>{unit.type?.replace('_', ' ') || 'DEPARTMENT'}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500" title="Direct personnel"><Users size={11} className="text-slate-400" /> {staff}</span>
                        {childCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500" title="Sub-units"><Building2 size={11} className="text-slate-400" /> {childCount}</span>
                        )}
                    </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-700 group-hover:translate-x-1 transition-all shrink-0 self-center" />
            </div>
        </div>
    );
};

// A single expandable row in the org tree. Defined at module scope (not nested
// inside OrgTreeView) so its identity is stable and per-row expand state
// survives parent re-renders.
const OrgTreeRow: React.FC<{
    dept: Department;
    depth: number;
    allDepts: Department[];
    users: User[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}> = ({ dept, depth, allDepts, users, selectedId, onSelect }) => {
    const children = allDepts
        .filter(d => d.parentId === dept.id)
        .sort((a, b) => a.name.localeCompare(b.name));
    const [open, setOpen] = useState(dept.type === 'GENERAL' || depth === 0);
    const directCount = users.filter(u => u.departmentId === dept.id).length;
    const isSelected = dept.id === selectedId;
    const Icon = deptTypeIcon(dept.type);

    return (
        <div>
            <div
                onClick={() => onSelect(dept.id)}
                style={{ paddingLeft: depth * 18 + 8 }}
                className={`flex items-center gap-2 pr-3 py-2 cursor-pointer border-l-2 transition-colors ${
                    isSelected ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-slate-50'
                }`}
            >
                {children.length > 0 ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                        className={`p-0.5 rounded-sm hover:bg-slate-200 transition-transform ${open ? 'rotate-90' : ''}`}
                    >
                        <ChevronRight size={14} className="text-slate-400" />
                    </button>
                ) : (
                    <span className="w-[22px] shrink-0" />
                )}
                <Icon size={15} className={isSelected ? 'text-blue-700 shrink-0' : 'text-slate-400 shrink-0'} />
                <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-mono font-bold tracking-tight truncate ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
                        {dept.code || dept.name}
                    </span>
                </span>
                {directCount > 0 && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-none shrink-0">
                        {directCount}
                    </span>
                )}
            </div>
            {open && children.map(child => (
                <OrgTreeRow
                    key={child.id}
                    dept={child}
                    depth={depth + 1}
                    allDepts={allDepts}
                    users={users}
                    selectedId={selectedId}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
};

// --- Whole-company org chart: EPROM → projects → departments → sections ---

const projectDeptsOf = (depts: Department[], projectId: string, isHq: boolean) =>
    depts.filter(d => d.projectId === projectId || (isHq && !d.projectId));

const DEPT_RANK: Record<string, number> = {
    COMPANY: 0, EXECUTIVE: 1, SECTOR: 2, GENERAL: 3, ASSISTANT_GENERAL: 4, DEPARTMENT: 5, SECTION: 6, POSITION: 7,
};

// Roots of a scoped set = nodes whose parent is outside the set (or absent).
// The tree's own parentId links drive nesting; we no longer treat GENERAL as a
// top-level type (it is the GM level, nested under SECTOR → Chairman → company).
const deptRootsOf = (scoped: Department[]) => {
    const ids = new Set(scoped.map(d => d.id));
    return scoped
        .filter(d => !d.parentId || !ids.has(d.parentId))
        .sort((a, b) =>
            ((DEPT_RANK[a.type ?? 'DEPARTMENT'] ?? 99) - (DEPT_RANK[b.type ?? 'DEPARTMENT'] ?? 99)) ||
            a.name.localeCompare(b.name)
        );
};

// A collapsible project group in the company tree: holds that project's
// top-level departments, rendered with the shared OrgTreeRow.
const OrgProjectGroup: React.FC<{
    project: Project;
    isHq: boolean;
    allDepts: Department[];
    users: User[];
    selectedDeptId: string | null;
    selectedProjectId: string | null;
    onSelectProject: (id: string) => void;
    onSelectDept: (id: string) => void;
}> = ({ project, isHq, allDepts, users, selectedDeptId, selectedProjectId, onSelectProject, onSelectDept }) => {
    const scoped = projectDeptsOf(allDepts, project.id, isHq);
    const roots = deptRootsOf(scoped);
    const [open, setOpen] = useState(isHq);
    const isSelected = selectedProjectId === project.id;
    const staff = users.filter(u => scoped.some(d => d.id === u.departmentId)).length;

    return (
        <div>
            <div
                onClick={() => onSelectProject(project.id)}
                style={{ paddingLeft: 26 }}
                className={`flex items-center gap-2 pr-3 py-2 cursor-pointer border-l-2 transition-colors ${
                    isSelected ? 'bg-emerald-50 border-emerald-600' : 'border-transparent hover:bg-slate-50'
                }`}
            >
                {roots.length > 0 ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                        className={`p-0.5 rounded-sm hover:bg-slate-200 transition-transform ${open ? 'rotate-90' : ''}`}
                    >
                        <ChevronRight size={14} className="text-slate-400" />
                    </button>
                ) : (
                    <span className="w-[22px] shrink-0" />
                )}
                <Briefcase size={15} className={isSelected ? 'text-emerald-700 shrink-0' : 'text-slate-400 shrink-0'} />
                <span className="flex flex-col min-w-0 flex-1">
                    <span className={`text-sm truncate ${isSelected ? 'font-bold text-emerald-900' : 'font-bold text-slate-700'}`}>
                        {isHq ? 'Head Office' : project.name}
                    </span>
                    {isHq && <span dir="rtl" className={`text-[11px] truncate ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`}>المركز الرئيسي</span>}
                </span>
                {staff > 0 && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-none shrink-0">{staff}</span>
                )}
            </div>
            {open && roots.map(dept => (
                <OrgTreeRow
                    key={dept.id}
                    dept={dept}
                    depth={1}
                    allDepts={allDepts}
                    users={users}
                    selectedId={selectedDeptId}
                    onSelect={onSelectDept}
                />
            ))}
        </div>
    );
};

type OrgSelection = { kind: 'root' } | { kind: 'project'; id: string } | { kind: 'dept'; id: string };

const CompanyOrgView: React.FC<{
    depts: Department[];
    projects: Project[];
    users: User[];
    jobs: JobProfile[];
    hqProjectId?: string;
    currentUser: User | null;
    searchTerm?: string;
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onAddDeptToProject: (projectId: string) => void;
    onEditUser: (u: User) => void;
    onPromoteUser: (u: User) => void;
    onAddProject: () => void;
    onEditProject: (p: Project) => void;
    onDeleteProject: (id: string) => void;
    onAddJobToUnit: (deptId: string) => void;
    onAssignPersonnel: (userId: string, deptId: string) => void;
    onEditJob: (job: JobProfile) => void;
    onDeleteJob: (id: string) => void;
    selected: OrgSelection;
    setSelected: React.Dispatch<React.SetStateAction<OrgSelection>>;
}> = ({ depts, projects, users, jobs, hqProjectId, currentUser, searchTerm = '', onEdit, onDelete, onAddChild, onAddDeptToProject, onEditUser, onPromoteUser, onAddProject, onEditProject, onDeleteProject, onAddJobToUnit, onAssignPersonnel, onEditJob, onDeleteJob, selected, setSelected }) => {
    const canSeeCeo = currentUser?.role === Role.CEO || currentUser?.role === Role.ADMIN;
    const isHqProject = (p?: Project | null) => !!p && (p.id === hqProjectId || p.name.toUpperCase() === 'HQ');

    // "Add Personnel" picker: assign an existing approved employee to a unit.
    const [assignPickerDeptId, setAssignPickerDeptId] = useState<string | null>(null);
    const [assignUserId, setAssignUserId] = useState('');

    // Projects ordered with the Head Office (HQ) first, then alphabetically.
    const orderedProjects = useMemo(() =>
        [...projects].sort((a, b) =>
            (isHqProject(b) ? 1 : 0) - (isHqProject(a) ? 1 : 0) || a.name.localeCompare(b.name)
        ), [projects, hqProjectId]);

    const selectDept = (id: string) => setSelected({ kind: 'dept', id });
    const selectProject = (id: string) => setSelected({ kind: 'project', id });

    // Recover selection if the underlying record disappears.
    useEffect(() => {
        if (selected.kind === 'dept' && !depts.some(d => d.id === selected.id)) setSelected({ kind: 'root' });
        if (selected.kind === 'project' && !projects.some(p => p.id === selected.id)) setSelected({ kind: 'root' });
    }, [depts, projects, selected]);

    const selectedDept = selected.kind === 'dept' ? depts.find(d => d.id === selected.id) || null : null;
    const selectedProject = selected.kind === 'project' ? projects.find(p => p.id === selected.id) || null : null;

    const descendantIds = (rootId: string): string[] => {
        const out: string[] = [];
        const stack = depts.filter(d => d.parentId === rootId).map(d => d.id);
        const seen = new Set<string>();
        while (stack.length) {
            const cur = stack.pop()!;
            if (seen.has(cur)) continue;
            seen.add(cur);
            out.push(cur);
            depts.filter(d => d.parentId === cur).forEach(c => stack.push(c.id));
        }
        return out;
    };

    const manager = selectedDept ? users.find(u => u.id === selectedDept.managerId) : undefined;
    const managerName = (manager && (canSeeCeo || (manager.role !== Role.CEO && manager.orgLevel !== 'CEO')))
        ? manager.name : 'Unassigned';
    const directPersonnel = selectedDept ? users.filter(u => u.departmentId === selectedDept.id) : [];
    const unitJobs = selectedDept ? jobs.filter(j => j.departmentId === selectedDept.id && !j.isArchived) : [];
    const subUnits = selectedDept ? depts.filter(d => d.parentId === selectedDept.id) : [];
    const totalWorkforce = selectedDept
        ? users.filter(u => u.departmentId === selectedDept.id || descendantIds(selectedDept.id).includes(u.departmentId)).length
        : 0;
    const SelectedIcon = deptTypeIcon(selectedDept?.type);

    const projectScoped = selectedProject ? projectDeptsOf(depts, selectedProject.id, isHqProject(selectedProject)) : [];
    const projectRoots = deptRootsOf(projectScoped);
    const projectStaff = users.filter(u => projectScoped.some(d => d.id === u.departmentId)).length;

    // When the toolbar search is active, the left panel shows a flat list of
    // matching units (by code, English/Arabic name) instead of the project tree.
    const search = searchTerm.trim().toLowerCase();
    const searchMatches = useMemo(() => {
        if (!search) return [];
        return depts
            .filter(d =>
                (d.code || '').toLowerCase().includes(search) ||
                d.name.toLowerCase().includes(search) ||
                (d.nameAr || '').includes(searchTerm.trim())
            )
            .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
    }, [depts, search, searchTerm]);

    return (
        <div className="bg-slate-50 min-h-[600px]">
            {/* Header */}
            <div className="flex items-center justify-between gap-6 px-8 py-6 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-sm flex items-center justify-center border border-blue-100 shrink-0">
                        <Shield size={26} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Organization Chart</h2>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-widest border border-emerald-100">EPROM</span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1" dir="rtl">الهيكل التنظيمي — من رئيس مجلس الإدارة حتى أدنى مستوى</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr]">
                {/* LEFT: tree */}
                <div className="border-r border-slate-200 bg-white lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Structure</span>
                        <button
                            onClick={onAddProject}
                            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-blue-700 hover:text-blue-900 transition-colors"
                            title="Add Project / Site"
                        >
                            <Plus size={14} /> Project
                        </button>
                    </div>
                    {search ? (
                        /* SEARCH RESULTS: flat list of units matching code / name */
                        <div className="py-2">
                            <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                {searchMatches.length} match{searchMatches.length === 1 ? '' : 'es'} for “{searchTerm.trim()}”
                            </div>
                            {searchMatches.map(d => {
                                const Icon = deptTypeIcon(d.type);
                                const isSel = selected.kind === 'dept' && selected.id === d.id;
                                return (
                                    <div
                                        key={d.id}
                                        onClick={() => selectDept(d.id)}
                                        style={{ paddingLeft: 8 }}
                                        className={`flex items-center gap-2 pr-3 py-2 cursor-pointer border-l-2 transition-colors ${
                                            isSel ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-slate-50'
                                        }`}
                                    >
                                        <Icon size={15} className={isSel ? 'text-blue-700 shrink-0' : 'text-slate-400 shrink-0'} />
                                        <span className="flex flex-col min-w-0 flex-1">
                                            <span dir="rtl" className={`text-sm truncate ${isSel ? 'font-bold text-blue-900' : 'font-medium text-slate-700'}`}>{d.nameAr || d.name}</span>
                                            <span className={`text-[11px] truncate flex items-center gap-1.5 ${isSel ? 'text-blue-700' : 'text-slate-400'}`}>
                                                {d.code && <span className="font-mono font-bold tracking-tight">{d.code}</span>}
                                                {d.nameAr && <span className="truncate">{d.name}</span>}
                                            </span>
                                        </span>
                                    </div>
                                );
                            })}
                            {searchMatches.length === 0 && (
                                <div className="p-8 text-center text-sm text-slate-500">No units match this search.</div>
                            )}
                        </div>
                    ) : (
                    <div className="py-2">
                        {/* ROOT: the company / Chairman */}
                        <div
                            onClick={() => setSelected({ kind: 'root' })}
                            style={{ paddingLeft: 8 }}
                            className={`flex items-center gap-2 pr-3 py-2 cursor-pointer border-l-2 transition-colors ${
                                selected.kind === 'root' ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-slate-50'
                            }`}
                        >
                            <Shield size={16} className={selected.kind === 'root' ? 'text-blue-700 shrink-0' : 'text-slate-400 shrink-0'} />
                            <span className="flex flex-col min-w-0 flex-1">
                                <span dir="rtl" className={`text-sm truncate ${selected.kind === 'root' ? 'font-black text-blue-900' : 'font-black text-slate-800'}`}>المصرية لتشغيل وصيانة المشروعات</span>
                                <span className="text-[11px] truncate text-slate-400">EPROM</span>
                            </span>
                        </div>
                        {orderedProjects.map(p => (
                            <OrgProjectGroup
                                key={p.id}
                                project={p}
                                isHq={isHqProject(p)}
                                allDepts={depts}
                                users={users}
                                selectedDeptId={selected.kind === 'dept' ? selected.id : null}
                                selectedProjectId={selected.kind === 'project' ? selected.id : null}
                                onSelectProject={selectProject}
                                onSelectDept={selectDept}
                            />
                        ))}
                        {orderedProjects.length === 0 && (
                            <div className="p-8 text-center">
                                <Briefcase size={36} className="mx-auto text-slate-200 mb-3" />
                                <p className="text-sm text-slate-500">No projects defined yet.</p>
                                <button onClick={onAddProject} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white font-bold uppercase text-[10px] tracking-widest rounded-sm hover:bg-blue-800 transition-all">
                                    <Plus size={14} /> Create First Project
                                </button>
                            </div>
                        )}
                    </div>
                    )}
                </div>

                {/* RIGHT: detail panel */}
                <div className="p-8">
                    {selected.kind === 'dept' && selectedDept ? (
                        <div className="space-y-8 animate-in fade-in duration-200">
                            {/* Back button */}
                            <button
                                onClick={() => selectedDept.parentId ? selectDept(selectedDept.parentId) : setSelected({ kind: 'root' })}
                                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-700 uppercase tracking-wider transition-colors group"
                            >
                                <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                                {selectedDept.parentId ? 'Parent Unit' : 'All Units'}
                            </button>

                            {/* Unit header */}
                            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm">
                                {/* accent bar */}
                                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-indigo-500" />
                                <div className="p-6">
                                    {/* Top row: identity + actions */}
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4 min-w-0">
                                            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-lg flex items-center justify-center shadow-sm shrink-0">
                                                <SelectedIcon size={26} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {selectedDept.code && (
                                                        <span className="px-2 py-0.5 bg-slate-900 text-white text-[11px] font-mono font-bold tracking-tight rounded shrink-0">
                                                            {selectedDept.code}
                                                        </span>
                                                    )}
                                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-widest border border-blue-100 rounded shrink-0">
                                                        {selectedDept.type?.replace('_', ' ') || 'DEPARTMENT'}
                                                    </span>
                                                </div>
                                                <h3 dir="rtl" className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5 leading-snug">{selectedDept.nameAr || selectedDept.name}</h3>
                                                {selectedDept.nameAr && (
                                                    <p className="text-sm font-semibold text-slate-500 mt-0.5">{selectedDept.name}</p>
                                                )}
                                            </div>
                                        </div>
                                        {/* Actions */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button onClick={() => onEdit(selectedDept)} className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-blue-700 hover:border-blue-200 rounded-md transition-all" title="Edit Unit"><Edit2 size={16} /></button>
                                            <button onClick={() => onDelete(selectedDept.id)} className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-red-700 hover:border-red-200 rounded-md transition-all" title="Delete Unit"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                    {/* Bottom row: manager + primary CTA */}
                                    <div className="flex items-center justify-between gap-4 mt-5 pt-4 border-t border-slate-200/70">
                                        <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
                                            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-400 shrink-0">
                                                <UserCheck size={15} />
                                            </span>
                                            <span className="truncate">
                                                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block leading-none mb-0.5">Unit Lead</span>
                                                <span className="font-semibold text-slate-800">{managerName}</span>
                                            </span>
                                        </div>
                                        <button onClick={() => onAddChild(selectedDept.id)} className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-bold uppercase tracking-widest rounded-md hover:bg-blue-800 transition-all shadow-sm shrink-0">
                                            <Plus size={16} /> Sub-Unit
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Direct Personnel', value: directPersonnel.length },
                                    { label: 'Sub-Units', value: subUnits.length },
                                    { label: 'Total Workforce', value: totalWorkforce },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-white p-4 rounded-none border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                                        <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Personnel roster (list) */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                        <Users size={14} /> Personnel ({directPersonnel.length})
                                    </div>
                                    <button
                                        onClick={() => { setAssignUserId(''); setAssignPickerDeptId(selectedDept.id); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white text-[10px] font-bold uppercase tracking-widest rounded-md hover:bg-blue-800 transition-all shadow-sm"
                                    >
                                        <Plus size={14} /> Add Personnel
                                    </button>
                                </div>
                                {directPersonnel.length > 0 ? (
                                    <div className="bg-white border border-slate-200 rounded-none divide-y divide-slate-100">
                                        {directPersonnel.map(person => {
                                            const job = jobs.find(j => j.id === person.jobProfileId);
                                            return (
                                                <div key={person.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors group">
                                                    <div className="w-9 h-9 rounded-none bg-slate-100 flex items-center justify-center text-slate-900 font-bold border border-slate-200 shrink-0">
                                                        {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="w-full h-full object-cover" /> : person.name[0]}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-slate-900 truncate">{person.name}</span>
                                                            <span className="text-indigo-700 font-bold uppercase text-[8px] bg-indigo-50 px-1.5 py-0.5 rounded-none border border-indigo-100 shrink-0">{person.orgLevel || 'N/A'}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 truncate">{job?.title || person.role}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                        <button onClick={() => onPromoteUser(person)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm transition-all" title="Promote / Transfer"><TrendingUp size={14} /></button>
                                                        <button onClick={() => onEditUser(person)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-sm transition-all" title="Edit Employee"><Edit2 size={14} /></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-8 bg-white border border-dashed border-slate-300 text-center rounded-none">
                                        <Users size={28} className="mx-auto text-slate-200 mb-2" />
                                        <p className="text-sm text-slate-500 mb-4">No personnel assigned to this unit.</p>
                                        <button onClick={() => { setAssignUserId(''); setAssignPickerDeptId(selectedDept.id); }} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white font-bold uppercase text-[10px] tracking-widest rounded-sm hover:bg-blue-800 transition-all">
                                            <Plus size={14} /> Add Personnel
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Job Profiles (positions) attached to this unit */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                        <Briefcase size={14} /> Job Profiles ({unitJobs.length})
                                    </div>
                                    <button
                                        onClick={() => onAddJobToUnit(selectedDept.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-md hover:bg-slate-800 transition-all shadow-sm"
                                    >
                                        <Plus size={14} /> Job Profile
                                    </button>
                                </div>
                                {unitJobs.length > 0 ? (
                                    <div className="bg-white border border-slate-200 rounded-none divide-y divide-slate-100">
                                        {unitJobs.map(job => (
                                            <div key={job.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors group">
                                                <div className="w-9 h-9 rounded-none bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100 shrink-0">
                                                    <Briefcase size={16} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-900 truncate">{job.title}</span>
                                                        <span className="text-blue-700 font-bold uppercase text-[8px] bg-blue-50 px-1.5 py-0.5 rounded-none border border-blue-100 shrink-0">{job.orgLevel || 'N/A'}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 truncate">
                                                        <span className="font-mono">{job.code || '—'}</span> · {(job.requiredSkills || []).length} skills
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                    <button onClick={() => onEditJob(job)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-sm transition-all" title="Edit Job Profile"><Edit2 size={14} /></button>
                                                    <button onClick={() => onDeleteJob(job.id)} className="p-1.5 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-sm transition-all" title="Delete Job Profile"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 bg-white border border-dashed border-slate-300 text-center rounded-none">
                                        <Briefcase size={28} className="mx-auto text-slate-200 mb-2" />
                                        <p className="text-sm text-slate-500 mb-4">No job profiles defined for this unit yet.</p>
                                        <button onClick={() => onAddJobToUnit(selectedDept.id)} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-bold uppercase text-[10px] tracking-widest rounded-sm hover:bg-slate-800 transition-all">
                                            <Plus size={14} /> Add Job Profile
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Sub-units (list, clickable to drill in the tree) */}
                            {subUnits.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                        <Building2 size={14} /> Sub-Units ({subUnits.length})
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {subUnits.map(unit => (
                                            <UnitCard
                                                key={unit.id}
                                                unit={unit}
                                                staff={users.filter(u => u.departmentId === unit.id).length}
                                                childCount={depts.filter(d => d.parentId === unit.id).length}
                                                onSelect={selectDept}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : selected.kind === 'project' && selectedProject ? (
                        <div className="space-y-8 animate-in fade-in duration-200">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-slate-200 pb-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-sm flex items-center justify-center border border-emerald-100 shrink-0">
                                        <Briefcase size={28} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{isHqProject(selectedProject) ? 'Head Office' : selectedProject.name}</h3>
                                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-widest border border-emerald-100">
                                                {isHqProject(selectedProject) ? 'المركز الرئيسي' : 'PROJECT'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-600 flex items-center gap-1.5">
                                            <MapPin size={14} className="text-slate-400" /> {selectedProject.location || 'General Headquarters'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => onAddDeptToProject(selectedProject.id)} className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-blue-800 transition-all shadow-sm">
                                        <Plus size={16} /> Department
                                    </button>
                                    <button onClick={() => onEditProject(selectedProject)} className="p-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-sm transition-all" title="Edit Project"><Edit2 size={18} /></button>
                                    {!isHqProject(selectedProject) && (
                                        <button onClick={() => onDeleteProject(selectedProject.id)} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-red-700 hover:border-red-200 rounded-sm transition-all" title="Delete Project"><Trash2 size={18} /></button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Top-Level Units', value: projectRoots.length },
                                    { label: 'Total Units', value: projectScoped.length },
                                    { label: 'Workforce', value: projectStaff },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-white p-4 rounded-none border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                                        <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-3 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                    <Building2 size={14} /> Top-Level Units ({projectRoots.length})
                                </div>
                                {projectRoots.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {projectRoots.map(unit => (
                                            <UnitCard
                                                key={unit.id}
                                                unit={unit}
                                                staff={users.filter(u => u.departmentId === unit.id).length}
                                                childCount={depts.filter(d => d.parentId === unit.id).length}
                                                onSelect={selectDept}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 bg-white border border-dashed border-slate-300 text-center rounded-none">
                                        <Building2 size={28} className="mx-auto text-slate-200 mb-2" />
                                        <p className="text-sm text-slate-500 mb-4">No departments under this project yet.</p>
                                        <button onClick={() => onAddDeptToProject(selectedProject.id)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white font-bold uppercase text-[10px] tracking-widest rounded-sm hover:bg-blue-800 transition-all">
                                            <Plus size={14} /> Add Department
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : selected.kind === 'root' ? (
                        <div className="space-y-8 animate-in fade-in duration-200">
                            <div className="flex items-start gap-4 border-b border-slate-200 pb-6">
                                <div className="w-14 h-14 bg-blue-50 text-blue-700 rounded-sm flex items-center justify-center border border-blue-100 shrink-0">
                                    <Shield size={28} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">EPROM</h3>
                                    <p dir="rtl" className="text-base font-bold text-slate-700">المصرية لتشغيل وصيانة المشروعات</p>
                                    <p className="text-sm text-slate-500 mt-1">Egyptian Maintenance Company — Operation & Maintenance of Projects</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Projects / Sites', value: projects.length },
                                    { label: 'Total Units', value: depts.length },
                                    { label: 'Workforce', value: users.length },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-white p-4 rounded-none border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                                        <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-3 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                    <Briefcase size={14} /> Projects & Sites ({orderedProjects.length})
                                </div>
                                <div className="bg-white border border-slate-200 rounded-none divide-y divide-slate-100">
                                    {orderedProjects.map(p => {
                                        const scoped = projectDeptsOf(depts, p.id, isHqProject(p));
                                        const staff = users.filter(u => scoped.some(d => d.id === u.departmentId)).length;
                                        return (
                                            <div key={p.id} onClick={() => selectProject(p.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors group">
                                                <Briefcase size={16} className="text-slate-400 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <span className="font-bold text-slate-800 truncate block group-hover:text-emerald-700 transition-colors">{isHqProject(p) ? 'Head Office' : p.name}</span>
                                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{deptRootsOf(scoped).length} units</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-none shrink-0">{staff}</span>
                                                <ChevronRight size={16} className="text-slate-300 group-hover:text-emerald-700 group-hover:translate-x-1 transition-all shrink-0" />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-20">
                            <LayoutGrid size={48} className="text-slate-200 mb-4" />
                            <p className="text-slate-500">Select a unit from the structure to view its details.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Personnel: pick an existing approved employee and re-home them
                to this unit, searchable by name or company ID. */}
            {assignPickerDeptId && (() => {
                const targetDept = depts.find(d => d.id === assignPickerDeptId);
                const candidates = users
                    .filter(u => u.status === 'ACTIVE' && u.departmentId !== assignPickerDeptId)
                    .sort((a, b) => a.name.localeCompare(b.name));
                const options: Option[] = candidates.map(u => {
                    const homeDept = depts.find(d => d.id === u.departmentId);
                    return {
                        value: u.id,
                        label: u.name,
                        subLabel: [u.employeeId != null ? `ID ${u.employeeId}` : null, homeDept?.name || 'Unassigned']
                            .filter(Boolean).join(' · '),
                    };
                });
                const close = () => { setAssignPickerDeptId(null); setAssignUserId(''); };
                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 animate-in fade-in duration-150" onClick={close}>
                        <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-200">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Add Personnel</h3>
                                    <p className="text-sm text-slate-500 mt-0.5">
                                        Assign an existing employee to <span dir="rtl" className="font-semibold text-slate-700">{targetDept?.nameAr || targetDept?.name}</span>.
                                    </p>
                                </div>
                                <button onClick={close} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-all"><X size={18} /></button>
                            </div>
                            <div className="p-6 space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Employee</label>
                                <SearchableSelect
                                    options={options}
                                    value={assignUserId}
                                    onChange={setAssignUserId}
                                    placeholder="Search by name or ID…"
                                />
                                <p className="text-xs text-slate-400">{candidates.length} approved employee{candidates.length === 1 ? '' : 's'} available.</p>
                            </div>
                            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-lg">
                                <button onClick={close} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-600 hover:text-slate-900 transition-colors">Cancel</button>
                                <button
                                    disabled={!assignUserId}
                                    onClick={() => { onAssignPersonnel(assignUserId, assignPickerDeptId); close(); }}
                                    className="flex items-center gap-2 px-5 py-2 bg-blue-700 text-white text-xs font-bold uppercase tracking-widest rounded-md hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                                >
                                    <Plus size={14} /> Assign to Unit
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export const AdminPanel: React.FC<{ view: string; onNavigate: (tab: string) => void }> = React.memo(({ view, onNavigate }) => {
  const [refreshKey, setRefreshKey] = useState(0); 
  const [formMode, setFormMode] = useState(false);
  const [formType, setFormType] = useState<'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT' | null>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [viewSkill, setViewSkill] = useState<Skill | null>(null);
  const [activeTab, setActiveTab] = useState<string>('ALL');
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
  const [bulkType, setBulkType] = useState<'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT'>('USER');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Reset search when view changes
  useEffect(() => {
    setSearchTerm('');
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

  const filteredDepts = useMemo(() => {
    return depts.filter(dept =>
      searchTerm === '' ||
      dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dept.code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (dept.nameAr || '').includes(searchTerm) ||
      (users.find(u => u.id === dept.managerId)?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [depts, searchTerm, users]);


  const handleApprove = useCallback(async (user: User) => {
    await dataService.updateUser({ ...user, status: 'ACTIVE' });
    await dataService.logActivity('Approved User', user.name);
    setRefreshKey(k => k + 1);
  }, []);

  const handleApproveSkill = useCallback((skill: Skill) => {
    const approvedEvidences = dataService.getEvidences({ skillId: skill.id, status: 'APPROVED' });
    if (approvedEvidences.length === 0) {
      setErrorMessage("Cannot approve: A manager must approve an employee's evidence for this skill first.");
      return;
    }
    handleEdit('SKILL', skill);
  }, []);

  const handleReject = useCallback(async (user: User) => {
    await dataService.updateUser({ ...user, status: 'REJECTED' });
    await dataService.logActivity('Rejected User', user.name);
    setRefreshKey(k => k + 1);
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

  const handleBulkUpload = useCallback((type: 'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT') => {
    setBulkType(type);
    setShowBulkUpload(true);
  }, []);

  const handleDelete = useCallback(async (type: 'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT', id: string) => {
      if (window.confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
          if (type === 'USER') await dataService.removeUser(id);
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
            <div className="relative overflow-hidden rounded-none bg-blue-900 p-8 ">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-none bg-blue-800/10 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-64 w-64 rounded-none bg-blue-800/10 blur-3xl"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">System Command Center</h2>
                        <p className="text-slate-600 mt-2 max-w-xl">
                            Real-time overview of workforce competency, operational readiness, and organizational structure configuration.
                        </p>
                    </div>
                    <div className="flex gap-3">
                         <div className="px-4 py-2 bg-white/5 backdrop-blur rounded-sm border border-white/10">
                            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">System Status</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-slate-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-none h-2 w-2 bg-slate-500"></span>
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
      return <AdminAnalytics />;
  }

  // --- ANNUAL APPRAISAL VIEW ---
  if (view === 'APPRAISAL') {
      return <AnnualAppraisalAdmin />;
  }

  // --- AUDIT TRAIL VIEW (ISO.1) ---
  if (view === 'AUDIT') {
      return <AuditTrail />;
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
                        <button
                            onClick={() => handleBulkUpload(view === 'USERS' ? 'USER' : view === 'SKILLS' ? 'SKILL' : 'DEPT')}
                            className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all flex-1 md:flex-none justify-center"
                        >
                            <FileSpreadsheet size={16} className="text-blue-700" /> Bulk Upload
                        </button>
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
                               {view === 'SKILLS' && <><th className="p-4 pl-6">Identifier</th><th className="p-4">Skill Name</th><th className="p-4">Category</th><th className="p-4">Definition</th><th className="p-4">Status</th></>}
                               <th className="p-4 text-right pr-6">Actions</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100 text-sm">
                           {view === 'USERS' && paginatedUsers.map(user => (
                               <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                                   <td className="p-4 pl-6">
                                       <div className="flex items-center gap-3">
                                           <div className="w-9 h-9 rounded-none bg-slate-50 flex items-center justify-center text-slate-900 font-bold ">
                                               {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover rounded-none"/> : user.name[0]}
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