import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { dataService } from '../services/store';
import { User, Role, JobProfile, Skill, JobProfileSkill, OrgLevel, ORG_LEVEL_LABELS, Department, DepartmentType, ORG_HIERARCHY_ORDER, PROFICIENCY_LABELS } from '../types';
import { PROFICIENCY_DEFINITIONS } from '../constants';
import { Plus, Users, Briefcase, ChevronRight, CheckCircle, Shield, ShieldCheck, X, Save, Trash2, ArrowLeft, UserPlus, Building2, Search, Edit2, UserCheck, AlertCircle, Layers, BookOpen, MoreHorizontal, LayoutGrid, Activity, Eye, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { SearchableSelect, Option } from '../components/SearchableSelect';
import { BulkUpload } from '../components/BulkUpload';
import { AdminAnalytics } from './AdminAnalytics';
import { AdminCycles } from './AdminCycles';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-none  w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-300 flex justify-between items-start bg-slate-100/50 shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-2">
                <h3 className="text-2xl font-bold text-slate-900">{skill.name}</h3>
                <span className="px-2 py-1 bg-slate-50 text-slate-900 text-[10px] font-bold uppercase tracking-wide rounded-none border border-slate-300">
                    {skill.category}
                </span>
            </div>
            <p className="text-slate-700 text-sm italic">"{skill.assessmentQuestion || 'No assessment question defined.'}"</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-none text-slate-600 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
            <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                    <Layers size={14} /> Proficiency Levels
                </h4>
                <div className="grid gap-4">
                    {[1, 2, 3, 4, 5].map((level) => {
                        const lvlData = skill.levels[level];
                        // @ts-ignore
                        const genericDef = PROFICIENCY_DEFINITIONS[level];
                        return (
                            <div key={level} className="relative pl-6 border-l-2 border-slate-300 hover:border-slate-900 transition-colors group">
                                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-none bg-white border-2 border-slate-300 group-hover:border-slate-900 flex items-center justify-center text-[8px] font-bold text-slate-700 group-hover:text-slate-900 transition-colors">
                                    {level}
                                </div>
                                <div className="mb-1">
                                    <span className="text-sm font-bold text-slate-900">Level {level}: {PROFICIENCY_LABELS[level]}</span>
                                </div>
                                <p className="text-xs text-slate-600 mb-2 italic border-l-2 border-slate-100 pl-2">
                                    {genericDef?.description}
                                </p>
                                <p className="text-sm text-slate-600 mb-2 leading-relaxed">
                                    {lvlData?.description || <span className="text-slate-600 italic">No specific description provided.</span>}
                                </p>
                                {lvlData?.requiredCertificates && lvlData.requiredCertificates.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {lvlData.requiredCertificates.map((cert, idx) => (
                                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 text-slate-700 border border-slate-100 text-[10px] font-bold uppercase tracking-wide rounded-none">
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
        </div>

        <div className="p-4 bg-slate-100 border-t border-slate-100 flex justify-end shrink-0">
            <button onClick={onClose} className="px-4 py-2 bg-white border border-slate-300 text-slate-600 font-bold text-xs uppercase tracking-wide rounded-none hover:bg-slate-50 hover:text-slate-800 transition-colors ">
                Close
            </button>
        </div>
      </div>
    </div>
  );
};

// --- Helper functions ---


// --- User Form (Unchanged Logic, styling preserved) ---
const UserForm: React.FC<{ initialData?: User | null, onSave: (u: User) => void, onCancel: () => void }> = ({ initialData, onSave, onCancel }) => {
  const departments = dataService.getAllDepartments();
  const jobProfiles = dataService.getAllJobs();
  const potentialManagers = dataService.getAllUsers(); 

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

  const isPending = initialData?.status === 'PENDING';
  const isNewUser = !initialData;

  const generalDepts = departments.filter(d => d.type === 'GENERAL' || !d.parentId);
  const generalDeptOptions: Option[] = generalDepts.map(d => ({ value: d.id, label: d.name }));
  
  const filteredDepts = departments.filter(d => {
    if (!formData.generalDepartmentId) return false; // Show nothing if no General Dept selected
    // Must be part of this General Dept tree AND not the General Dept itself (if that's what "sub" means)
    // Actually, usually you can be IN the general dept. But I'll stick to descendant check if they say "sub".
    // Let's keep the descendant check (getGeneralDeptId) but ensure it's indeed from that tree.
    return dataService.getGeneralDeptId(d.id) === formData.generalDepartmentId;
  });
  const deptOptions: Option[] = filteredDepts.map(d => ({ value: d.id, label: d.name }));
  
  const jobOptions: Option[] = jobProfiles.map(j => ({ value: j.id, label: j.title, subLabel: departments.find(d=>d.id===j.departmentId)?.name }));

  const selectedJobProfile = jobProfiles.find(j => j.id === formData.jobProfileId);
  const contextDepartmentId = selectedJobProfile ? selectedJobProfile.departmentId : formData.departmentId;

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
        label: u.name, 
        subLabel: `${u.role} • ${departments.find(d => d.id === u.departmentId)?.name || 'No Dept'} • ${u.orgLevel || ''}` 
    }));

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

          return {
              ...prev,
              jobProfileId: val,
              departmentId: newDeptId,
              generalDepartmentId: newGenDeptId,
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
      projectName: formData.projectName
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
                            { value: Role.ADMIN, label: 'Admin' }
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
                        label="Main Department (General)"
                        options={generalDeptOptions}
                        value={formData.generalDepartmentId || ''}
                        onChange={handleGeneralDeptChange}
                        placeholder="Select General Department..."
                    />
                    <SearchableSelect 
                        label="Direct Department / Section"
                        options={deptOptions}
                        value={formData.departmentId || ''}
                        onChange={handleDepartmentChange}
                        placeholder="Select Specific Department..."
                    />
                    <div className="md:col-span-2">
                        <SearchableSelect 
                            label="Hierarchy Level"
                            placeholder="Select Hierarchy Level..."
                            options={ORG_HIERARCHY_ORDER.map(level => ({ value: level, label: `${ORG_LEVEL_LABELS[level]} (${level})` }))}
                            value={formData.orgLevel || ''} 
                            onChange={handleOrgLevelChange}
                        />
                        <p className="text-[10px] text-slate-600 mt-1">Defines the employee's band/grade within the department structure.</p>
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
                <button type="submit" className={`px-6 py-2 text-white rounded-sm transition-all flex items-center gap-2 font-bold uppercase tracking-wide text-xs  hover: ${isPending ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-700 hover:bg-blue-800'}`}>
                    {isPending ? <UserCheck size={16} /> : <Save size={16} />} 
                    {isPending ? 'Approve & Activate' : 'Save Employee'}
                </button>
            </div>
        </form>
    </div>
  );
};

const SKILL_CATEGORIES = ['Technical', 'Behavioral', 'Safety', 'Management', 'Soft Skills'];

const JobForm: React.FC<{ initialData?: JobProfile | null, onSave: (j: JobProfile) => void, onCancel: () => void }> = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<JobProfile>>(initialData || { requirements: {} });
  const [activeLevel, setActiveLevel] = useState<OrgLevel>('JP');
  const [skillCategoryFilter, setSkillCategoryFilter] = useState<string>('ALL');

  const departments = dataService.getAllDepartments();
  const allSkills = dataService.getAllSkills();
  const deptOptions = departments.map(d => ({ value: d.id, label: d.name }));
  
  const skillOptions = useMemo(() => {
    let filtered = allSkills;
    if (skillCategoryFilter !== 'ALL') {
      filtered = filtered.filter(s => s.category === skillCategoryFilter);
    }
    return filtered.map(s => ({ value: s.id, label: s.name, subLabel: s.category }));
  }, [allSkills, skillCategoryFilter]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.departmentId) return;

    onSave({
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      title: formData.title,
      description: formData.description || '',
      departmentId: formData.departmentId,
      requirements: formData.requirements || {}
    });
  };

  const handleAddSkill = (skillId: string) => {
    if (!skillId) return;
    const currentLevelReqs = formData.requirements?.[activeLevel] || [];
    if (currentLevelReqs.find(r => r.skillId === skillId)) return; // Already exists

    const newReqs = {
      ...formData.requirements,
      [activeLevel]: [...currentLevelReqs, { skillId, requiredLevel: 1 }]
    };
    setFormData({ ...formData, requirements: newReqs });
  };

  const handleUpdateReq = (skillId: string, level: number) => {
    const currentLevelReqs = formData.requirements?.[activeLevel] || [];
    const newLevelReqs = currentLevelReqs.map(r => r.skillId === skillId ? { ...r, requiredLevel: level } : r);
    setFormData({
      ...formData,
      requirements: { ...formData.requirements, [activeLevel]: newLevelReqs }
    });
  };

  const handleRemoveReq = (skillId: string) => {
    const currentLevelReqs = formData.requirements?.[activeLevel] || [];
    const newLevelReqs = currentLevelReqs.filter(r => r.skillId !== skillId);
    setFormData({
      ...formData,
      requirements: { ...formData.requirements, [activeLevel]: newLevelReqs }
    });
  };

  const levelRequirements = formData.requirements?.[activeLevel] || [];

  return (
    <form onSubmit={handleSubmit} className="p-8 space-y-8 bg-white text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Job Title</label>
          <input required className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none" 
            value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} />
        </div>
        <SearchableSelect label="Department" options={deptOptions} value={formData.departmentId || ''} onChange={val => setFormData({...formData, departmentId: val})} />
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Description</label>
          <textarea className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none" rows={2}
            value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} />
        </div>
      </div>

      <div className="border-t border-slate-300 pt-6">
        <h4 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Layers size={18} className="text-slate-900"/> 
            Competency Matrix Configuration
        </h4>
        
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-1/3">
             <label className="block text-xs font-bold text-slate-600 uppercase tracking-widest mb-2">Hierarchy Level</label>
             <div className="space-y-1">
               {ORG_HIERARCHY_ORDER.map(level => {
                 const reqsCount = (formData.requirements?.[level] || []).length;
                 return (
                   <button type="button" key={level} onClick={() => setActiveLevel(level)}
                     className={`w-full flex justify-between items-center px-4 py-3 rounded-sm text-xs font-bold transition-all border ${activeLevel === level ? 'bg-blue-700 text-white border-blue-800 ' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-300'}`}>
                      <div className="flex flex-col items-start">
                        <span>{ORG_LEVEL_LABELS[level]}</span>
                        <span className={`text-[9px] mt-0.5 ${activeLevel === level ? 'text-white/60' : 'text-slate-500'}`}>{reqsCount} Skills Assigned</span>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-none ${activeLevel === level ? 'bg-white/20' : 'bg-slate-100'}`}>{level}</span>
                   </button>
                 );
               })}
             </div>
          </div>
          
          <div className="flex-1 bg-slate-50 rounded-sm border border-slate-300 p-6">
             <div className="flex justify-between items-center mb-6">
               <div>
                  <h5 className="font-bold text-slate-900">Requirements: {ORG_LEVEL_LABELS[activeLevel]}</h5>
                  <p className="text-xs text-slate-700">Define mandatory skills for this position level across all categories.</p>
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
          <button type="submit" className="px-6 py-2 bg-blue-700 text-white rounded-sm font-bold uppercase tracking-wide text-xs  hover:bg-blue-800 flex items-center gap-2 transition-all">
             <Save size={16} /> Save Profile
          </button>
      </div>
    </form>
  );
};

// --- Skill Form (Unchanged) ---
const SkillForm: React.FC<{ initialData?: Skill | null, onSave: (s: Skill) => void, onCancel: () => void }> = ({ initialData, onSave, onCancel }) => {
  const defaultLevels = {
    1: { level: 1, description: '', requiredCertificates: [] },
    2: { level: 2, description: '', requiredCertificates: [] },
    3: { level: 3, description: '', requiredCertificates: [] },
    4: { level: 4, description: '', requiredCertificates: [] },
    5: { level: 5, description: '', requiredCertificates: [] },
  };

  const [formData, setFormData] = useState<Partial<Skill>>(initialData || { levels: defaultLevels });
  const [activeTab, setActiveTab] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.category) return;
    onSave({
       id: initialData?.id || Math.random().toString(36).substr(2, 9),
       name: formData.name,
       category: formData.category,
       assessmentQuestion: formData.assessmentQuestion,
       levels: formData.levels as any,
       status: 'APPROVED',
       assessmentMethod: formData.assessmentMethod || '360_EVALUATION',
       assessmentLink: formData.assessmentMethod === 'ONLINE_ASSESSMENT' ? formData.assessmentLink : undefined
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
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Skill Name</label>
            <input required className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
               value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
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
              onChange={val => setFormData({...formData, category: val})}
              placeholder="Select Category..."
            />
         </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Assessment Question</label>
            <input className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
               placeholder="e.g. How effectively does the employee..."
               value={formData.assessmentQuestion || ''} onChange={e => setFormData({...formData, assessmentQuestion: e.target.value})} />
         </div>
         
         <div className="md:col-span-1">
            <SearchableSelect 
              label="Assessment Method"
              options={[
                { value: '360_EVALUATION', label: '360° Evaluation (Self/Peer/Manager)' },
                { value: 'DOCUMENT_UPLOAD', label: 'Evidence Upload (Certificates/Proof)' },
                { value: 'ONLINE_ASSESSMENT', label: 'Online Assessment' },
                { value: 'INTERVIEW', label: 'Managerial Interview' }
              ]}
              value={formData.assessmentMethod || '360_EVALUATION'}
              onChange={val => setFormData({...formData, assessmentMethod: val as any})}
            />
         </div>

         {formData.assessmentMethod === 'ONLINE_ASSESSMENT' && (
           <div className="md:col-span-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex justify-between items-center">
                <span>Assessment Link</span>
                <span className="text-slate-400 text-[10px] lowercase">Google Form, etc.</span>
              </label>
              <input type="url" className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
                 placeholder="https://docs.google.com/forms/..."
                 value={formData.assessmentLink || ''} onChange={e => setFormData({...formData, assessmentLink: e.target.value})} />
           </div>
         )}
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
                   // @ts-ignore
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

       <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-sm font-bold uppercase tracking-wide text-xs transition-colors">Cancel</button>
          <button type="submit" className="px-6 py-2 bg-blue-700 text-white rounded-sm font-bold uppercase tracking-wide text-xs  hover:bg-blue-800 flex items-center gap-2 transition-all">
             <Save size={16} /> Save Definition
          </button>
      </div>
    </form>
  );
};

// --- Department Form ---
const DepartmentForm: React.FC<{ initialData?: Department | null, onSave: (d: Department) => void, onCancel: () => void }> = ({ initialData, onSave, onCancel }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [type, setType] = useState<DepartmentType>(initialData?.type || 'DEPARTMENT');
    const [parentId, setParentId] = useState(initialData?.parentId || '');
    const [managerId, setManagerId] = useState(initialData?.managerId || '');
    const [behavioralSkillIds, setBehavioralSkillIds] = useState<string[]>(initialData?.behavioralSkillIds || []);
    
    const users = dataService.getAllUsers();
    const depts = dataService.getAllDepartments();
    
    const managerOptions = users.map(u => ({ value: u.id, label: u.name, subLabel: u.email }));
    
    const typeOptions = [
        { value: 'GENERAL', label: 'General Department' },
        { value: 'DEPARTMENT', label: 'Department' },
        { value: 'SECTION', label: 'Section' }
    ];

    // Parent options excluding self
    const parentOptions = [
        { value: 'EPROM', label: 'EPROM (Root Organization)' },
        ...depts.filter(d => d.id !== initialData?.id).map(d => ({ value: d.id, label: d.name }))
    ];
    
    const behavioralSkills = dataService.getAllSkills().filter(s => s.category === 'Behavioral');

    const handleToggleSkill = (skillId: string) => {
        setBehavioralSkillIds(prev => 
            prev.includes(skillId) ? prev.filter(id => id !== skillId) : [...prev, skillId]
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ 
            id: initialData?.id || Math.random().toString(36).substr(2, 9), 
            name, 
            type,
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
                
                <SearchableSelect 
                    label="Hierarchy Level / Type" 
                    options={typeOptions} 
                    value={type} 
                    onChange={(v) => setType(v as DepartmentType)} 
                    placeholder="Select Type..." 
                />
            </div>
            
            <SearchableSelect 
                label="Parent Unit / Organization" 
                options={parentOptions} 
                value={parentId || 'EPROM'} 
                onChange={setParentId} 
                placeholder="Select Parent..." 
            />

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
                                <div className="text-xs text-slate-500 mt-1 line-clamp-2">{skill.assessmentQuestion}</div>
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
                <button type="submit" className="px-6 py-2 bg-blue-700 text-white rounded-sm font-bold uppercase tracking-wide text-xs  hover:bg-blue-800 flex items-center gap-2 transition-all">
                    <Save size={16} /> Save Dept
                </button>
            </div>
        </form>
    );
};

// --- Hierarchical Structure Components ---
const EmployeeNode: React.FC<{
    user: User;
    allUsers: User[];
    allDepts: Department[];
    allJobs: JobProfile[];
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onEditUser: (u: User) => void;
    level: number;
    path: string[];
}> = ({ user, allUsers, allDepts, allJobs, onEdit, onDelete, onAddChild, onEditUser, level, path }) => {
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
                                <span className="font-bold text-slate-900">{user.name}</span>
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
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onAddChild={onAddChild}
                                onEditUser={onEditUser}
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
                                onEdit={onEdit}
                                onDelete={onDelete}
                                onAddChild={onAddChild}
                                onEditUser={onEditUser}
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
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onEditUser: (u: User) => void;
    level: number;
    path: string[];
}> = ({ dept, allDepts, allJobs, allUsers, onEdit, onDelete, onAddChild, onEditUser, level, path }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    
    // Find departments that are children via parentId
    const childrenByParent = allDepts.filter(d => d.parentId === dept.id || (!d.parentId && (dept as any).isRoot));
    
    // Find users directly in this department
    const deptUsers = allUsers.filter(u => u.departmentId === dept.id);
    const deptJobs = allJobs.filter(j => j.departmentId === dept.id);

    // To prevent duplicate rendering, only show departments here if:
    // 1. They have no manager assigned.
    // 2. OR their manager is NOT in this department's personnel structure (i.e. we aren't rendering that manager right now)
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
                             (dept as Department).type === 'GENERAL' ? <Layers className="text-indigo-700" size={18} /> :
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
                                        onEdit={onEdit}
                                        onDelete={onDelete}
                                        onAddChild={onAddChild}
                                        onEditUser={onEditUser}
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
                                        onEdit={onEdit} 
                                        onDelete={onDelete}
                                        onAddChild={onAddChild}
                                        onEditUser={onEditUser}
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
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onEditUser: (u: User) => void;
}> = ({ depts, jobs, users, onEdit, onDelete, onAddChild, onEditUser }) => {
    const rootDept = { id: 'ROOT', name: 'EPROM', isRoot: true };

    return (
        <div className="p-6 bg-slate-50 min-h-[500px] overflow-x-auto">
            <div className="inline-block min-w-full">
                <DepartmentNode 
                    dept={rootDept} 
                    allDepts={depts} 
                    allJobs={jobs} 
                    allUsers={users} 
                    onEdit={onEdit} 
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                    onEditUser={onEditUser}
                    level={0}
                    path={[]}
                />
            </div>
        </div>
    );
};

const GeneralDeptList: React.FC<{
    depts: Department[];
    users: User[];
    onSelect: (id: string) => void;
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
}> = ({ depts, users, onSelect, onEdit, onDelete }) => {
    const generalDepts = depts.filter(d => d.type === 'GENERAL' || !d.parentId);

    return (
        <div className="p-8 bg-slate-50 min-h-[500px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {generalDepts.map(dept => {
                    const deptManager = users.find(u => u.id === dept.managerId);
                    const subUnits = depts.filter(d => d.parentId === dept.id);
                    const allDescendantIds = depts.filter(d => {
                        let current = d;
                        while(current.parentId) {
                            if (current.parentId === dept.id) return true;
                            current = depts.find(pd => pd.id === current.parentId) || { id: '', name: '', parentId: '' } as any;
                        }
                        return false;
                    }).map(d => d.id);
                    
                    const totalStaff = users.filter(u => u.departmentId === dept.id || allDescendantIds.includes(u.departmentId)).length;

                    return (
                        <div 
                            key={dept.id} 
                            onClick={() => onSelect(dept.id)}
                            className="bg-white rounded-none border border-slate-300 hover: transition-all group cursor-pointer overflow-hidden flex flex-col"
                        >
                            <div className="p-6 flex-1">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="w-14 h-14 bg-blue-50 text-blue-700 rounded-sm flex items-center justify-center group-hover:bg-blue-700 group-hover:text-white transition-all shadow-sm">
                                        <Layers size={28} />
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); onEdit(dept); }} className="p-1.5 text-slate-400 hover:text-slate-900 transition-colors"><Edit2 size={16}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); onDelete(dept.id); }} className="p-1.5 text-slate-400 hover:text-red-700 transition-colors"><Trash2 size={16}/></button>
                                    </div>
                                </div>
                                
                                <h3 className="text-xl font-bold text-slate-900 mb-1">{dept.name}</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-4">General Department</p>
                                
                                <div className="space-y-3 mt-6">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-none bg-slate-50 flex items-center justify-center text-slate-400">
                                            <UserCheck size={16} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department Manager</p>
                                            <p className="text-sm font-bold text-slate-800 truncate">{deptManager?.name || 'Unassigned'}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 mt-6">
                                        <div className="bg-slate-50 p-3 rounded-none border border-slate-100">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Sub-Units</p>
                                            <p className="text-lg font-bold text-slate-900">{subUnits.length}</p>
                                        </div>
                                        <div className="bg-slate-50 p-3 rounded-none border border-slate-100">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Workforce</p>
                                            <p className="text-lg font-bold text-slate-900">{totalStaff}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between group-hover:bg-blue-700/5 transition-colors">
                                <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">Explore Structure</span>
                                <ChevronRight size={16} className="text-blue-700 group-hover:translate-x-1 transition-transform" />
                            </div>
                            <div className="h-1 w-full bg-blue-700 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const DepartmentProfileView: React.FC<{
    deptId: string;
    depts: Department[];
    jobProfiles: JobProfile[];
    users: User[];
    onBack: (parentId: string | null) => void;
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onEditUser: (u: User) => void;
    onSelectDept: (id: string) => void;
}> = ({ deptId, depts, jobProfiles, users, onBack, onEdit, onDelete, onAddChild, onEditUser, onSelectDept }) => {
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
        let visited = new Set();
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
                                <span className="flex items-center gap-1.5 font-medium"><UserCheck size={16} className="text-slate-400" /> {deptManager?.name || 'No Manager Assigned'}</span>
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

            <div className="p-8 space-y-12">
                {/* 1. DIRECT PERSONNEL GRID (Priority #1) */}
                <div className="space-y-8">
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
                                                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <div className="p-1 bg-blue-50 text-blue-700 rounded-sm"><Edit2 size={12}/></div>
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

                {/* 2. SUB-UNITS GRID (Priority #2) */}
                <div className="space-y-6">
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
                                                        <p className="text-xs font-bold text-slate-800 truncate">{unitManager?.name || 'Unassigned'}</p>
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
            </div>
        </div>
    );
};

export const AdminPanel: React.FC<{ view: string; onNavigate: (tab: string) => void }> = React.memo(({ view, onNavigate }) => {
  const [refreshKey, setRefreshKey] = useState(0); 
  const [formMode, setFormMode] = useState(false);
  const [formType, setFormType] = useState<'USER' | 'JOB' | 'SKILL' | 'DEPT' | null>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [viewSkill, setViewSkill] = useState<Skill | null>(null);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [selectedDeptProfileId, setSelectedDeptProfileId] = useState<string | null>(null);
  
  // Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [bulkType, setBulkType] = useState<'USER' | 'JOB' | 'SKILL' | 'DEPT'>('USER');

  // Reset search when view changes
  useEffect(() => {
    setSearchTerm('');
    setSelectedDeptProfileId(null);
  }, [view]);

  const users = useMemo(() => dataService.getAllUsers(), [refreshKey]);
  const jobs = useMemo(() => dataService.getAllJobs(), [refreshKey]);
  const skills = useMemo(() => dataService.getAllSkills(), [refreshKey]);
  const depts = useMemo(() => dataService.getAllDepartments(), [refreshKey]);
  const logs = useMemo(() => dataService.getSystemLogs(), [refreshKey]);

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
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (depts.find(d => d.id === user.departmentId)?.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesTab = activeTab === 'ALL' || user.status === activeTab;
      
      return matchesSearch && matchesTab;
    });
  }, [sortedUsers, searchTerm, depts, activeTab]);

  const filteredJobs = useMemo(() => {
    return jobs.filter(job => 
      searchTerm === '' ||
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (depts.find(d => d.id === job.departmentId)?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [jobs, searchTerm, depts]);

  const filteredSkills = useMemo(() => {
    return skills.filter(skill => {
      const matchesSearch = searchTerm === '' ||
        skill.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        skill.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (skill.assessmentQuestion || '').toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesTab = activeTab === 'ALL' || skill.category.toUpperCase() === activeTab;
      
      return matchesSearch && matchesTab;
    });
  }, [skills, searchTerm, activeTab]);

  const filteredDepts = useMemo(() => {
    return depts.filter(dept => 
      searchTerm === '' ||
      dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
      setTimeout(() => setErrorMessage(''), 5000);
      return;
    }
    handleEdit('SKILL', skill);
  }, []);

  const handleReject = useCallback(async (user: User) => {
    await dataService.updateUser({ ...user, status: 'REJECTED' });
    await dataService.logActivity('Rejected User', user.name);
    setRefreshKey(k => k + 1);
  }, []);

  const handleEdit = useCallback((type: 'USER' | 'JOB' | 'SKILL' | 'DEPT', item: any) => {
      if (type === 'SKILL' && item.status === 'PENDING') {
        const approvedEvidences = dataService.getEvidences({ skillId: item.id, status: 'APPROVED' });
        if (approvedEvidences.length === 0) {
          setErrorMessage("Cannot edit/approve: A manager must approve an employee's evidence for this skill first.");
          setTimeout(() => setErrorMessage(''), 5000);
          return;
        }
      }
      setFormType(type);
      setEditItem(item);
      setFormMode(true);
  }, []);

  const handleAdd = useCallback((type: 'USER' | 'JOB' | 'SKILL' | 'DEPT') => {
      setFormType(type);
      setEditItem(null);
      setFormMode(true);
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
      setFormType('DEPT');
      setEditItem({ parentId: parentId === 'ROOT' ? undefined : parentId });
      setFormMode(true);
  }, []);

  const handleBulkUpload = useCallback((type: 'USER' | 'JOB' | 'SKILL' | 'DEPT') => {
    setBulkType(type);
    setShowBulkUpload(true);
  }, []);

  const handleDelete = useCallback(async (type: 'USER' | 'JOB' | 'SKILL' | 'DEPT', id: string) => {
      if (window.confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
          if (type === 'USER') await dataService.removeUser(id);
          if (type === 'JOB') await dataService.removeJobProfile(id);
          if (type === 'SKILL') await dataService.removeSkill(id);
          if (type === 'DEPT') await dataService.removeDepartment(id);
          setRefreshKey(k => k + 1);
      }
  }, []);

  const handleSave = useCallback(async (item: any) => {
      if (formType === 'USER') {
          const exists = users.find(u => u.id === item.id);
          if (exists) await dataService.updateUser(item);
          else await dataService.addUser(item);
      }
      if (formType === 'JOB') editItem ? await dataService.updateJobProfile(item) : await dataService.addJobProfile(item);
      if (formType === 'SKILL') editItem ? await dataService.updateSkill(item) : await dataService.addSkill(item);
      if (formType === 'DEPT') editItem ? await dataService.updateDepartment(item) : await dataService.addDepartment(item);

      setFormMode(false);
      setRefreshKey(k => k + 1);
  }, [formType, editItem, users]);

  const renderFormContent = () => {
      const titlePrefix = editItem ? 'Edit ' : 'New ';
      
      if (formType === 'USER') return (
        <FormPage title={`${titlePrefix}Employee Profile`} onBack={() => setFormMode(false)}>
            <UserForm initialData={editItem} onSave={handleSave} onCancel={() => setFormMode(false)} />
        </FormPage>
      );
      if (formType === 'JOB') return (
        <FormPage title={`${titlePrefix}Job Profile`} onBack={() => setFormMode(false)}>
            <JobForm initialData={editItem} onSave={handleSave} onCancel={() => setFormMode(false)} />
        </FormPage>
      );
      if (formType === 'SKILL') return (
        <FormPage title={`${titlePrefix}Competency Standard`} onBack={() => setFormMode(false)}>
            <SkillForm initialData={editItem} onSave={handleSave} onCancel={() => setFormMode(false)} />
        </FormPage>
      );
      if (formType === 'DEPT') return (
        <FormPage title={`${titlePrefix}Department`} onBack={() => setFormMode(false)}>
            <DepartmentForm initialData={editItem} onSave={handleSave} onCancel={() => setFormMode(false)} />
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

                <div onClick={() => onNavigate('admin-jobs')} className="bg-white rounded-none cursor-pointer border border-slate-300 hover: transition-all group overflow-hidden text-left">
                     <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-slate-50 text-slate-600 rounded-sm flex items-center justify-center group-hover:bg-slate-600 group-hover:text-white transition-colors">
                                <Briefcase size={24} />
                            </div>
                             <span className="text-xs font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded-none uppercase">Defined</span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg">Job Profiles</h3>
                        <p className="text-sm text-slate-700 mt-1">Competency requirements</p>
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                            <span className="text-2xl font-bold text-slate-900">{jobs.length}</span>
                            <div className="flex gap-2">
                                <button 
                                    onClick={(e) => { e.stopPropagation(); setBulkType('JOB'); setShowBulkUpload(true); }}
                                    className="p-2 bg-slate-50 hover:bg-slate-100 text-blue-700 rounded-sm border border-slate-200 transition-colors"
                                    title="Bulk Upload Job Profiles"
                                >
                                    <FileSpreadsheet size={16} />
                                </button>
                                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                    Configure <ChevronRight size={14} />
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-slate-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
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

  // --- CYCLES VIEW ---
  if (view === 'CYCLES') {
      return <AdminCycles />;
  }

  // --- TABLE VIEW (Data View) ---
  return (
    <div className="space-y-6">
       {errorMessage && (
         <div className="bg-slate-50 border border-slate-200 text-slate-700 px-4 py-3 rounded-none relative animate-in fade-in" role="alert">
           <strong className="font-bold">Error: </strong>
           <span className="block sm:inline">{errorMessage}</span>
         </div>
       )}
       <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-slate-300">
           <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
                {view === 'USERS' ? 'Workforce Management' : 
                 view === 'JOBS' ? 'Job Profiles' :
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
                            onClick={() => handleBulkUpload(view === 'USERS' ? 'USER' : view === 'JOBS' ? 'JOB' : view === 'SKILLS' ? 'SKILL' : 'DEPT')}
                            className="bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all flex-1 md:flex-none justify-center"
                        >
                            <FileSpreadsheet size={16} className="text-blue-700" /> Bulk Upload
                        </button>
                        <button onClick={() => handleAdd(view === 'USERS' ? 'USER' : view === 'JOBS' ? 'JOB' : view === 'SKILLS' ? 'SKILL' : 'DEPT')}
                            className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded-sm text-xs font-bold uppercase tracking-wide  flex items-center gap-2 transition-all flex-1 md:flex-none justify-center">
                            <Plus size={16} /> Add {view === 'USERS' ? 'Employee' : view === 'JOBS' ? 'Profile' : view === 'SKILLS' ? 'Skill' : 'Department'}
                        </button>
                    </div>
                </div>
            )}

           {/* Table or Tree View */}
           <div className="overflow-x-auto">
               {view === 'DEPTS' ? (
                   selectedDeptProfileId ? (
                       <DepartmentProfileView 
                           deptId={selectedDeptProfileId}
                           depts={depts}
                           jobProfiles={jobs}
                           users={users}
                           onBack={setSelectedDeptProfileId}
                           onEdit={(d) => handleEdit('DEPT', d)}
                           onDelete={(id) => handleDelete('DEPT', id)}
                           onAddChild={handleAddChild}
                           onEditUser={(u) => handleEdit('USER', u)}
                           onSelectDept={setSelectedDeptProfileId}
                       />
                   ) : (
                       <GeneralDeptList 
                           depts={depts}
                           users={users}
                           onSelect={setSelectedDeptProfileId}
                           onEdit={(d) => handleEdit('DEPT', d)}
                           onDelete={(id) => handleDelete('DEPT', id)}
                       />
                   )
               ) : (
                   <table className="w-full text-left">
                       <thead className="bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider border-b border-slate-300">
                           <tr>
                               {view === 'USERS' && <><th className="p-4 pl-6">Employee</th><th className="p-4">Role & Dept</th><th className="p-4">Level</th><th className="p-4">Status</th></>}
                               {view === 'JOBS' && <><th className="p-4 pl-6">Job Title</th><th className="p-4">Department</th><th className="p-4">Complexity</th></>}
                               {view === 'SKILLS' && <><th className="p-4 pl-6">Skill Name</th><th className="p-4">Category</th><th className="p-4">Definition</th><th className="p-4">Status</th></>}
                               <th className="p-4 text-right pr-6">Actions</th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-slate-100 text-sm">
                           {view === 'USERS' && filteredUsers.map(user => (
                               <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                                   <td className="p-4 pl-6">
                                       <div className="flex items-center gap-3">
                                           <div className="w-9 h-9 rounded-none bg-slate-50 flex items-center justify-center text-slate-900 font-bold ">
                                               {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover rounded-none"/> : user.name[0]}
                                           </div>
                                           <div>
                                               <div className="font-bold text-slate-900 group-hover:text-slate-900 transition-colors">{user.name}</div>
                                               <div className="text-slate-600 text-xs">{user.email}</div>
                                           </div>
                                       </div>
                                   </td>
                                   <td className="p-4">
                                       <span className="font-semibold text-slate-700 block">{user.role}</span>
                                       <span className="text-slate-600 text-xs">{depts.find(d => d.id === user.departmentId)?.name || 'Unassigned'}</span>
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
                                           <button onClick={() => handleEdit('USER', user)} className="text-slate-600 hover:text-slate-900 p-2 transition-colors" title="Edit"><Edit2 size={16}/></button>
                                           <button onClick={() => handleDelete('USER', user.id)} className="text-slate-600 hover:text-slate-700 p-2 transition-colors" title="Delete"><Trash2 size={16}/></button>
                                       </div>
                                   </td>
                               </tr>
                           ))}{view === 'JOBS' && filteredJobs.map(job => (
                               <tr key={job.id} className="hover:bg-slate-50 transition-colors group">
                                   <td className="p-4 pl-6 font-bold text-slate-900 group-hover:text-slate-900">{job.title}</td>
                                   <td className="p-4 text-slate-600">{depts.find(d => d.id === job.departmentId)?.name}</td>
                                   <td className="p-4">
                                       <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-none text-[10px] font-bold uppercase tracking-wide">{Object.keys(job.requirements).length} Levels Configured</span>
                                   </td>
                                   <td className="p-4 text-right pr-6">
                                       <div className="flex items-center justify-end gap-2">
                                           <button onClick={() => handleEdit('JOB', job)} className="text-slate-600 hover:text-slate-900 p-2" title="Edit"><Edit2 size={16}/></button>
                                           <button onClick={() => handleDelete('JOB', job.id)} className="text-slate-600 hover:text-slate-700 p-2" title="Delete"><Trash2 size={16}/></button>
                                       </div>
                                   </td>
                               </tr>
                           ))}{view === 'SKILLS' && filteredSkills.map(skill => (
                               <tr key={skill.id} className="hover:bg-slate-50 transition-colors group">
                                   <td className="p-4 pl-6 font-bold text-slate-900 group-hover:text-slate-900">{skill.name}</td>
                                   <td className="p-4">
                                       <span className="px-2 py-1 bg-slate-50 text-slate-900 border border-slate-300 rounded-none text-[10px] font-bold uppercase tracking-wide">{skill.category}</span>
                                   </td>
                                   <td className="p-4 text-slate-700 truncate max-w-xs text-xs">{skill.assessmentQuestion || '-'}</td>
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
       </div>
       {viewSkill && <SkillDetailsModal skill={viewSkill} onClose={() => setViewSkill(null)} />}
       {showBulkUpload && (
         <BulkUpload 
           type={bulkType} 
           onComplete={() => {
             setShowBulkUpload(false);
             setRefreshKey(k => k + 1);
           }}
           onCancel={() => setShowBulkUpload(false)}
         />
       )}
    </div>
  );
});