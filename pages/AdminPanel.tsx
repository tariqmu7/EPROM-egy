import React, { useState } from 'react';
import { dataService } from '../services/store';
import { User, Role, JobProfile, Skill, JobProfileSkill, OrgLevel, ORG_LEVEL_LABELS, Department, ORG_HIERARCHY_ORDER } from '../types';
import { Plus, Users, Briefcase, ChevronRight, CheckCircle, Shield, ShieldCheck, X, Save, Trash2, ArrowLeft, UserPlus, Building2, Search, Edit2, UserCheck, AlertCircle, Layers, BookOpen, MoreHorizontal, LayoutGrid, Activity } from 'lucide-react';
import { SearchableSelect, Option } from '../components/SearchableSelect';

// --- Reusable Form Wrapper ---
const FormPage: React.FC<{ title: string; onBack: () => void; children: React.ReactNode }> = ({ title, onBack, children }) => {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-200 text-slate-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold text-brand-900">{title}</h2>
      </div>
      <div className="bg-white rounded-lg shadow-panel border border-slate-200 overflow-hidden">
         {children}
      </div>
    </div>
  );
};

// --- User Form (Unchanged Logic, styling preserved) ---
const UserForm: React.FC<{ initialData?: User | null, onSave: (u: User) => void, onCancel: () => void }> = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<User>>(initialData || {
    role: Role.EMPLOYEE,
    status: 'ACTIVE',
    departmentId: dataService.getAllDepartments()[0]?.id || ''
  });

  const isPending = initialData?.status === 'PENDING';
  const isNewUser = !initialData;

  const departments = dataService.getAllDepartments();
  const jobProfiles = dataService.getAllJobs();
  const potentialManagers = dataService.getAllUsers(); 

  const deptOptions: Option[] = departments.map(d => ({ value: d.id, label: d.name }));
  const jobOptions: Option[] = jobProfiles.map(j => ({ value: j.id, label: j.title, subLabel: departments.find(d=>d.id===j.departmentId)?.name }));

  const selectedJobProfile = jobProfiles.find(j => j.id === formData.jobProfileId);
  const contextDepartmentId = selectedJobProfile ? selectedJobProfile.departmentId : formData.departmentId;

  const managerOptions: Option[] = potentialManagers
    .filter(u => {
        if (u.id === initialData?.id) return false; 
        if (u.status !== 'ACTIVE') return false; 
        if (contextDepartmentId) {
            return u.departmentId === contextDepartmentId;
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
      setFormData(prev => ({
          ...prev,
          jobProfileId: val,
          departmentId: job ? job.departmentId : prev.departmentId,
          managerId: (prev.managerId && job && potentialManagers.find(m => m.id === prev.managerId)?.departmentId !== job.departmentId) 
            ? undefined 
            : prev.managerId
      }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;
    
    const user: User = {
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      name: formData.name,
      email: formData.email,
      role: formData.role || Role.EMPLOYEE,
      status: 'ACTIVE', 
      departmentId: formData.departmentId || '',
      jobProfileId: formData.jobProfileId,
      managerId: formData.managerId,
      avatarUrl: formData.avatarUrl,
      orgLevel: formData.orgLevel
    };
    onSave(user);
  };

  return (
    <div className="bg-white text-sm">
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Full Name</label>
                    <input required type="text" className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal focus:border-transparent outline-none transition-all placeholder:text-slate-400" 
                        value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. John Doe"/>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email Address</label>
                    <input 
                        required 
                        type="email" 
                        className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-energy-teal outline-none transition-all placeholder:text-slate-400 ${!isNewUser ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-white text-slate-900 border-slate-200'}`} 
                        value={formData.email || ''} 
                        onChange={e => isNewUser && setFormData({...formData, email: e.target.value})}
                        readOnly={!isNewUser} 
                        placeholder="john@company.com"
                    />
                </div>
            </div>
            
            <div className="p-6 bg-slate-50 rounded-lg border border-slate-100 space-y-6">
                <h4 className="font-bold text-brand-900 flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Shield size={16} className="text-energy-teal"/>
                    Organizational Role
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">System Role</label>
                        <select className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none bg-white text-slate-900"
                            value={formData.role} onChange={e => setFormData({...formData, role: e.target.value as Role})}>
                            <option value={Role.EMPLOYEE}>Employee</option>
                            <option value={Role.MANAGER}>Manager</option>
                            <option value={Role.ADMIN}>Admin</option>
                        </select>
                    </div>
                    <SearchableSelect 
                        label="Department"
                        options={deptOptions}
                        value={formData.departmentId || ''}
                        onChange={(val) => setFormData({...formData, departmentId: val})}
                        placeholder="Search Department..."
                    />
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Hierarchy Level</label>
                        <select 
                            required
                            className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none bg-white text-slate-900"
                            value={formData.orgLevel || ''} 
                            onChange={e => setFormData({...formData, orgLevel: e.target.value as OrgLevel})}
                        >
                            <option value="" disabled>Select Hierarchy Level...</option>
                            {ORG_HIERARCHY_ORDER.map(level => (
                                <option key={level} value={level}>{ORG_LEVEL_LABELS[level]} ({level})</option>
                            ))}
                        </select>
                        <p className="text-[10px] text-slate-400 mt-1">Defines the employee's band/grade within the department structure.</p>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-slate-50 rounded-lg border border-slate-100 space-y-6">
                <h4 className="font-bold text-brand-900 flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Briefcase size={16} className="text-energy-teal"/>
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
                    <SearchableSelect 
                        label="Direct Manager"
                        options={managerOptions}
                        value={formData.managerId || ''}
                        onChange={(val) => setFormData({...formData, managerId: val})}
                        placeholder={contextDepartmentId ? "Select Manager from Dept..." : "Select Manager..."}
                    />
                </div>
            </div>

            <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors font-bold uppercase tracking-wide text-xs">Cancel</button>
                <button type="submit" className={`px-6 py-2 text-white rounded-md transition-all flex items-center gap-2 font-bold uppercase tracking-wide text-xs shadow-md hover:shadow-lg ${isPending ? 'bg-energy-teal hover:bg-teal-700' : 'bg-brand-900 hover:bg-brand-800'}`}>
                    {isPending ? <UserCheck size={16} /> : <Save size={16} />} 
                    {isPending ? 'Approve & Activate' : 'Save Employee'}
                </button>
            </div>
        </form>
    </div>
  );
};

// --- Job Form (Unchanged) ---
const JobForm: React.FC<{ initialData?: JobProfile | null, onSave: (j: JobProfile) => void, onCancel: () => void }> = ({ initialData, onSave, onCancel }) => {
  const [formData, setFormData] = useState<Partial<JobProfile>>(initialData || { requirements: {} });
  const [activeLevel, setActiveLevel] = useState<OrgLevel>('FP');

  const departments = dataService.getAllDepartments();
  const allSkills = dataService.getAllSkills();
  const deptOptions = departments.map(d => ({ value: d.id, label: d.name }));
  const skillOptions = allSkills.map(s => ({ value: s.id, label: s.name, subLabel: s.category }));

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

  return (
    <form onSubmit={handleSubmit} className="p-8 space-y-8 bg-white text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Job Title</label>
          <input required className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none" 
            value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} />
        </div>
        <SearchableSelect label="Department" options={deptOptions} value={formData.departmentId || ''} onChange={val => setFormData({...formData, departmentId: val})} />
        <div className="md:col-span-2">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Description</label>
          <textarea className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none" rows={2}
            value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} />
        </div>
      </div>

      <div className="border-t border-slate-200 pt-6">
        <h4 className="font-bold text-brand-900 mb-4 flex items-center gap-2">
            <Layers size={18} className="text-energy-teal"/> 
            Competency Matrix Configuration
        </h4>
        
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-1/3">
             <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Hierarchy Level</label>
             <div className="space-y-1">
               {ORG_HIERARCHY_ORDER.map(level => (
                 <button type="button" key={level} onClick={() => setActiveLevel(level)}
                   className={`w-full flex justify-between items-center px-4 py-3 rounded-md text-xs font-bold transition-all border ${activeLevel === level ? 'bg-brand-900 text-white border-brand-900 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                    <span>{ORG_LEVEL_LABELS[level]}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${activeLevel === level ? 'bg-white/20' : 'bg-slate-100'}`}>{level}</span>
                 </button>
               ))}
             </div>
          </div>
          
          <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 p-6">
             <div className="flex justify-between items-center mb-4">
               <div>
                  <h5 className="font-bold text-brand-900">Requirements: {ORG_LEVEL_LABELS[activeLevel]}</h5>
                  <p className="text-xs text-slate-500">Define mandatory skills for this position level.</p>
               </div>
             </div>
             
             <div className="mb-4">
               <SearchableSelect label="Add Required Skill" options={skillOptions} value="" onChange={handleAddSkill} placeholder="Search skill library..." />
             </div>

             <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {(formData.requirements?.[activeLevel] || []).length === 0 && (
                    <div className="text-center py-8 text-slate-400 border border-dashed border-slate-300 rounded-lg text-xs">No skills assigned to this level yet.</div>
                )}
                {(formData.requirements?.[activeLevel] || []).map(req => {
                   const skill = allSkills.find(s => s.id === req.skillId);
                   return (
                     <div key={req.skillId} className="bg-white p-3 rounded border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="flex-1">
                           <p className="font-bold text-brand-900 text-sm">{skill?.name}</p>
                           <p className="text-[10px] text-slate-500 uppercase tracking-wide">{skill?.category}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Target Level</span>
                            <select className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-sm font-bold text-brand-900 outline-none focus:ring-2 focus:ring-energy-teal"
                              value={req.requiredLevel} onChange={(e) => handleUpdateReq(req.skillId, parseInt(e.target.value))}>
                               {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <button type="button" onClick={() => handleRemoveReq(req.skillId)} className="text-slate-300 hover:text-red-500 p-1 transition-colors"><X size={16} /></button>
                     </div>
                   );
                })}
             </div>
          </div>
        </div>
      </div>

      <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-md font-bold uppercase tracking-wide text-xs transition-colors">Cancel</button>
          <button type="submit" className="px-6 py-2 bg-brand-900 text-white rounded-md font-bold uppercase tracking-wide text-xs shadow-md hover:bg-brand-800 flex items-center gap-2 transition-all">
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
       levels: formData.levels as any
    });
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
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Skill Name</label>
            <input required className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none"
               value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
         </div>
         <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Category</label>
            <select className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none"
               value={formData.category || ''} onChange={e => setFormData({...formData, category: e.target.value})}>
                <option value="">Select...</option>
                <option value="Technical">Technical</option>
                <option value="Safety">Safety</option>
                <option value="Management">Management</option>
                <option value="Soft Skills">Soft Skills</option>
            </select>
         </div>
         <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Assessment Question</label>
            <input className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none"
               placeholder="e.g. How effectively does the employee..."
               value={formData.assessmentQuestion || ''} onChange={e => setFormData({...formData, assessmentQuestion: e.target.value})} />
         </div>
       </div>

       <div className="border-t border-slate-200 pt-6">
          <h4 className="font-bold text-brand-900 mb-4 flex items-center gap-2">
             <BookOpen size={18} className="text-energy-teal"/> Proficiency Definition
          </h4>
          
          <div className="bg-slate-100 p-1 rounded flex mb-6">
             {[1,2,3,4,5].map(lvl => (
                <button key={lvl} type="button" onClick={() => setActiveTab(lvl)}
                   className={`flex-1 py-2 text-xs font-bold rounded shadow-sm transition-all ${activeTab === lvl ? 'bg-white text-brand-900' : 'text-slate-500 hover:text-slate-700'}`}>
                   Level {lvl}
                </button>
             ))}
          </div>

          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
             <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Description</label>
                <textarea className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none" rows={3}
                   value={formData.levels?.[activeTab as any]?.description || ''}
                   onChange={e => updateLevel(activeTab, 'description', e.target.value)}
                   placeholder={`Describe what a Level ${activeTab} employee can do...`}
                />
             </div>
             <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Required Certificates (Comma Separated)</label>
                <input className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none"
                   placeholder="e.g. PMP, NEBOSH"
                   value={formData.levels?.[activeTab as any]?.requiredCertificates?.join(', ') || ''}
                   onChange={e => updateLevel(activeTab, 'requiredCertificates', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                />
             </div>
          </div>
       </div>

       <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-md font-bold uppercase tracking-wide text-xs transition-colors">Cancel</button>
          <button type="submit" className="px-6 py-2 bg-brand-900 text-white rounded-md font-bold uppercase tracking-wide text-xs shadow-md hover:bg-brand-800 flex items-center gap-2 transition-all">
             <Save size={16} /> Save Definition
          </button>
      </div>
    </form>
  );
};

// --- Department Form (Unchanged) ---
const DepartmentForm: React.FC<{ initialData?: Department | null, onSave: (d: Department) => void, onCancel: () => void }> = ({ initialData, onSave, onCancel }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [managerId, setManagerId] = useState(initialData?.managerId || '');
    const users = dataService.getAllUsers();
    const managerOptions = users.map(u => ({ value: u.id, label: u.name, subLabel: u.email }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({ id: initialData?.id || Math.random().toString(36).substr(2, 9), name, managerId: managerId || undefined });
    };

    return (
        <form onSubmit={handleSubmit} className="p-8 space-y-6 bg-white text-sm">
            <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Department Name</label>
                <input required className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-200 rounded-md focus:ring-2 focus:ring-energy-teal outline-none"
                    value={name} onChange={e => setName(e.target.value)} />
            </div>
            <SearchableSelect label="Department Head (Optional)" options={managerOptions} value={managerId} onChange={setManagerId} placeholder="Select Manager..." />
            
            <div className="pt-6 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-md font-bold uppercase tracking-wide text-xs transition-colors">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-brand-900 text-white rounded-md font-bold uppercase tracking-wide text-xs shadow-md hover:bg-brand-800 flex items-center gap-2 transition-all">
                    <Save size={16} /> Save Dept
                </button>
            </div>
        </form>
    );
};

// --- Main Admin Panel ---
export const AdminPanel: React.FC<{ view: string; onNavigate: (tab: string) => void }> = ({ view, onNavigate }) => {
  const [refreshKey, setRefreshKey] = useState(0); 
  const [formMode, setFormMode] = useState(false);
  const [formType, setFormType] = useState<'USER' | 'JOB' | 'SKILL' | 'DEPT' | null>(null);
  const [editItem, setEditItem] = useState<any>(null);

  const users = dataService.getAllUsers();
  const jobs = dataService.getAllJobs();
  const skills = dataService.getAllSkills();
  const depts = dataService.getAllDepartments();
  const logs = dataService.getSystemLogs();

  const sortedUsers = [...users].sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
      return 0;
  });

  const handleEdit = (type: 'USER' | 'JOB' | 'SKILL' | 'DEPT', item: any) => {
      setFormType(type);
      setEditItem(item);
      setFormMode(true);
  };

  const handleAdd = (type: 'USER' | 'JOB' | 'SKILL' | 'DEPT') => {
      setFormType(type);
      setEditItem(null);
      setFormMode(true);
  };

  const handleDelete = (type: 'USER' | 'JOB' | 'SKILL' | 'DEPT', id: string) => {
      if (window.confirm("Are you sure you want to delete this record? This action cannot be undone.")) {
          if (type === 'USER') dataService.removeUser(id);
          if (type === 'JOB') dataService.removeJobProfile(id);
          if (type === 'SKILL') dataService.removeSkill(id);
          if (type === 'DEPT') dataService.removeDepartment(id);
          setRefreshKey(k => k + 1);
      }
  };

  const handleSave = (item: any) => {
      if (formType === 'USER') {
          const exists = users.find(u => u.id === item.id);
          if (exists) dataService.updateUser(item);
          else dataService.addUser(item);
      }
      if (formType === 'JOB') editItem ? dataService.updateJobProfile(item) : dataService.addJobProfile(item);
      if (formType === 'SKILL') editItem ? dataService.updateSkill(item) : dataService.addSkill(item);
      if (formType === 'DEPT') editItem ? dataService.updateDepartment(item) : dataService.addDepartment(item);

      setFormMode(false);
      setRefreshKey(k => k + 1);
  };

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
            <div className="relative overflow-hidden rounded-2xl bg-brand-900 p-8 shadow-2xl">
                <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-energy-teal/10 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl"></div>
                
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                    <div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">System Command Center</h2>
                        <p className="text-slate-400 mt-2 max-w-xl">
                            Real-time overview of workforce competency, operational readiness, and organizational structure configuration.
                        </p>
                    </div>
                    <div className="flex gap-3">
                         <div className="px-4 py-2 bg-white/5 backdrop-blur rounded-lg border border-white/10">
                            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">System Status</p>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                </span>
                                <span className="text-white font-bold text-sm">Operational</span>
                            </div>
                         </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <button onClick={() => onNavigate('admin-users')} className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-lg transition-all group overflow-hidden text-left">
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <Users size={24} />
                            </div>
                            <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded uppercase">Active</span>
                        </div>
                        <h3 className="font-bold text-brand-900 text-lg">Workforce Directory</h3>
                        <p className="text-sm text-slate-500 mt-1">Manage employees & hierarchy</p>
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-2xl font-bold text-brand-900">{users.length}</span>
                            <span className="text-xs font-semibold text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                View Records <ChevronRight size={14} />
                            </span>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                </button>

                <button onClick={() => onNavigate('admin-jobs')} className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-lg transition-all group overflow-hidden text-left">
                     <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                                <Briefcase size={24} />
                            </div>
                             <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded uppercase">Defined</span>
                        </div>
                        <h3 className="font-bold text-brand-900 text-lg">Job Profiles</h3>
                        <p className="text-sm text-slate-500 mt-1">Competency requirements</p>
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-2xl font-bold text-brand-900">{jobs.length}</span>
                            <span className="text-xs font-semibold text-purple-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                Configure <ChevronRight size={14} />
                            </span>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-purple-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                </button>

                <button onClick={() => onNavigate('admin-skills')} className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-lg transition-all group overflow-hidden text-left">
                     <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                <ShieldCheck size={24} />
                            </div>
                             <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded uppercase">Library</span>
                        </div>
                        <h3 className="font-bold text-brand-900 text-lg">Skill Standards</h3>
                        <p className="text-sm text-slate-500 mt-1">Proficiency levels & certs</p>
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-2xl font-bold text-brand-900">{skills.length}</span>
                            <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                Manage <ChevronRight size={14} />
                            </span>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-emerald-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                </button>

                 <button onClick={() => onNavigate('admin-depts')} className="bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-lg transition-all group overflow-hidden text-left">
                     <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                             <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-lg flex items-center justify-center group-hover:bg-orange-600 group-hover:text-white transition-colors">
                                <Building2 size={24} />
                            </div>
                             <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded uppercase">Units</span>
                        </div>
                        <h3 className="font-bold text-brand-900 text-lg">Departments</h3>
                        <p className="text-sm text-slate-500 mt-1">Org structure</p>
                        
                        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className="text-2xl font-bold text-brand-900">{depts.length}</span>
                            <span className="text-xs font-semibold text-orange-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                Edit Structure <ChevronRight size={14} />
                            </span>
                        </div>
                    </div>
                    <div className="h-1 w-full bg-orange-600 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                </button>
            </div>
            
            {/* Quick Actions or Analytics Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="font-bold text-brand-900 mb-4 flex items-center gap-2">
                        <Activity size={18} className="text-energy-teal"/> System Activity Log
                    </h3>
                    <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar">
                        {logs.length > 0 ? logs.map(log => (
                             <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-slate-50 last:border-0 last:pb-0">
                                <div className="w-2 h-2 rounded-full bg-slate-300 mt-2"></div>
                                <div>
                                    <p className="text-sm text-slate-700">{log.action}: <span className="font-semibold">{log.target}</span></p>
                                    <p className="text-xs text-slate-400 mt-1">{new Date(log.timestamp).toLocaleString()}</p>
                                </div>
                            </div>
                        )) : (
                            <div className="text-center py-8 text-slate-400 text-sm">No recent activity detected.</div>
                        )}
                    </div>
                </div>
                
                <div className="bg-brand-900 rounded-xl shadow-sm border border-brand-800 p-6 text-white relative overflow-hidden">
                     <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-energy-gold/20 blur-2xl"></div>
                     <h3 className="font-bold text-white mb-2 relative z-10">Pending Actions</h3>
                     <p className="text-brand-200 text-sm mb-6 relative z-10">There are pending user registrations requiring approval.</p>
                     
                     <div className="flex items-center justify-between bg-white/10 rounded-lg p-4 backdrop-blur relative z-10">
                        <div className="flex items-center gap-3">
                            <UserPlus size={20} className="text-energy-gold" />
                            <span className="font-bold text-xl">
                                {users.filter(u => u.status === 'PENDING').length}
                            </span>
                        </div>
                        <button onClick={() => onNavigate('admin-users')} className="text-xs font-bold uppercase tracking-wider bg-white text-brand-900 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors">
                            Review
                        </button>
                     </div>
                </div>
            </div>
        </div>
      );
  }

  // --- TABLE VIEW (Data View) ---
  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center pb-6 border-b border-slate-200">
           <div>
              <h2 className="text-3xl font-bold text-brand-900 tracking-tight">
                {view === 'USERS' ? 'Workforce Management' : 
                 view === 'JOBS' ? 'Job Profiles' :
                 view === 'SKILLS' ? 'Skill Library' : 'Departments'}
              </h2>
              <p className="text-slate-500 text-sm mt-1">Administration Module</p>
           </div>
       </div>

       {/* Content Area */}
       <div className="bg-white rounded-lg shadow-panel border border-slate-200 overflow-hidden min-h-[600px]">
           {/* Toolbar */}
           <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
               <div className="relative max-w-sm w-full">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                   <input type="text" placeholder="Search records..." className="w-full pl-9 pr-4 py-2 text-sm bg-white text-slate-900 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-energy-teal transition-all" />
               </div>
               <button onClick={() => handleAdd(view === 'USERS' ? 'USER' : view === 'JOBS' ? 'JOB' : view === 'SKILLS' ? 'SKILL' : 'DEPT')}
                   className="bg-brand-900 hover:bg-brand-800 text-white px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wide shadow-sm flex items-center gap-2 transition-all">
                   <Plus size={16} /> Add {view === 'USERS' ? 'Employee' : view === 'JOBS' ? 'Profile' : view === 'SKILLS' ? 'Skill' : 'Department'}
               </button>
           </div>

           {/* Table */}
           <div className="overflow-x-auto">
               <table className="w-full text-left">
                   <thead className="bg-slate-50 text-slate-500 font-bold text-xs uppercase tracking-wider border-b border-slate-200">
                       <tr>
                           {view === 'USERS' && <> <th className="p-4 pl-6">Employee</th> <th className="p-4">Role & Dept</th> <th className="p-4">Level</th> <th className="p-4">Status</th> </>}
                           {view === 'JOBS' && <> <th className="p-4 pl-6">Job Title</th> <th className="p-4">Department</th> <th className="p-4">Complexity</th> </>}
                           {view === 'SKILLS' && <> <th className="p-4 pl-6">Skill Name</th> <th className="p-4">Category</th> <th className="p-4">Definition</th> </>}
                           {view === 'DEPTS' && <> <th className="p-4 pl-6">Department Name</th> <th className="p-4">Head of Dept</th> </>}
                           <th className="p-4 text-right pr-6">Actions</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 text-sm">
                       {view === 'USERS' && sortedUsers.map(user => (
                           <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
                               <td className="p-4 pl-6">
                                   <div className="flex items-center gap-3">
                                       <div className="w-9 h-9 rounded bg-brand-100 flex items-center justify-center text-brand-700 font-bold shadow-sm">
                                           {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover rounded"/> : user.name[0]}
                                       </div>
                                       <div>
                                           <div className="font-bold text-brand-900 group-hover:text-energy-teal transition-colors">{user.name}</div>
                                           <div className="text-slate-400 text-xs">{user.email}</div>
                                       </div>
                                   </div>
                               </td>
                               <td className="p-4">
                                   <span className="font-semibold text-slate-700 block">{user.role}</span>
                                   <span className="text-slate-400 text-xs">{depts.find(d => d.id === user.departmentId)?.name || 'Unassigned'}</span>
                               </td>
                               <td className="p-4">
                                   <span className="inline-block px-2 py-0.5 bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wide rounded">{user.orgLevel || 'N/A'}</span>
                               </td>
                               <td className="p-4">
                                   {user.status === 'PENDING' ? (
                                       <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold uppercase tracking-wide rounded">
                                           <AlertCircle size={10}/> Pending
                                       </span>
                                   ) : (
                                       <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 border border-green-100 text-[10px] font-bold uppercase tracking-wide rounded">
                                           <CheckCircle size={10}/> Active
                                       </span>
                                   )}
                               </td>
                               <td className="p-4 text-right pr-6">
                                   <div className="flex items-center justify-end gap-2">
                                       <button onClick={() => handleEdit('USER', user)} className="text-slate-400 hover:text-blue-600 p-2 transition-colors" title="Edit"><Edit2 size={16}/></button>
                                       <button onClick={() => handleDelete('USER', user.id)} className="text-slate-400 hover:text-red-600 p-2 transition-colors" title="Delete"><Trash2 size={16}/></button>
                                   </div>
                               </td>
                           </tr>
                       ))}

                       {view === 'JOBS' && jobs.map(job => (
                           <tr key={job.id} className="hover:bg-slate-50 transition-colors group">
                               <td className="p-4 pl-6 font-bold text-brand-900 group-hover:text-energy-teal">{job.title}</td>
                               <td className="p-4 text-slate-600">{depts.find(d => d.id === job.departmentId)?.name}</td>
                               <td className="p-4">
                                   <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase tracking-wide">{Object.keys(job.requirements).length} Levels Configured</span>
                               </td>
                               <td className="p-4 text-right pr-6">
                                   <div className="flex items-center justify-end gap-2">
                                       <button onClick={() => handleEdit('JOB', job)} className="text-slate-400 hover:text-blue-600 p-2" title="Edit"><Edit2 size={16}/></button>
                                       <button onClick={() => handleDelete('JOB', job.id)} className="text-slate-400 hover:text-red-600 p-2" title="Delete"><Trash2 size={16}/></button>
                                   </div>
                               </td>
                           </tr>
                       ))}

                       {view === 'SKILLS' && skills.map(skill => (
                           <tr key={skill.id} className="hover:bg-slate-50 transition-colors group">
                               <td className="p-4 pl-6 font-bold text-brand-900 group-hover:text-energy-teal">{skill.name}</td>
                               <td className="p-4">
                                   <span className="px-2 py-1 bg-brand-50 text-brand-700 border border-brand-100 rounded text-[10px] font-bold uppercase tracking-wide">{skill.category}</span>
                               </td>
                               <td className="p-4 text-slate-500 truncate max-w-xs text-xs">{skill.assessmentQuestion || '-'}</td>
                               <td className="p-4 text-right pr-6">
                                   <div className="flex items-center justify-end gap-2">
                                       <button onClick={() => handleEdit('SKILL', skill)} className="text-slate-400 hover:text-blue-600 p-2" title="Edit"><Edit2 size={16}/></button>
                                       <button onClick={() => handleDelete('SKILL', skill.id)} className="text-slate-400 hover:text-red-600 p-2" title="Delete"><Trash2 size={16}/></button>
                                   </div>
                               </td>
                           </tr>
                       ))}

                        {view === 'DEPTS' && depts.map(d => (
                           <tr key={d.id} className="hover:bg-slate-50 transition-colors group">
                               <td className="p-4 pl-6 font-bold text-brand-900 group-hover:text-energy-teal">{d.name}</td>
                               <td className="p-4 text-slate-600">
                                   {users.find(u => u.id === d.managerId)?.name || <span className="text-slate-400 italic text-xs">Vacant Position</span>}
                               </td>
                               <td className="p-4 text-right pr-6">
                                   <div className="flex items-center justify-end gap-2">
                                       <button onClick={() => handleEdit('DEPT', d)} className="text-slate-400 hover:text-blue-600 p-2" title="Edit"><Edit2 size={16}/></button>
                                       <button onClick={() => handleDelete('DEPT', d.id)} className="text-slate-400 hover:text-red-600 p-2" title="Delete"><Trash2 size={16}/></button>
                                   </div>
                               </td>
                           </tr>
                       ))}
                   </tbody>
               </table>
           </div>
       </div>
    </div>
  );
};