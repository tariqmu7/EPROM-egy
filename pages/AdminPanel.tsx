import React, { useState } from 'react';
import { dataService } from '../services/store';
import { User, Role, JobProfile, Skill, JobProfileSkill, OrgLevel, ORG_LEVEL_LABELS, Department, ORG_HIERARCHY_ORDER } from '../types';
import { Plus, Users, Briefcase, ChevronRight, CheckCircle, Shield, ShieldCheck, X, Save, Trash2, ArrowLeft, UserPlus, Building2, Search, Edit2, UserCheck, AlertCircle, Layers, BookOpen } from 'lucide-react';
import { SearchableSelect, Option } from '../components/SearchableSelect';

// --- Modal Component ---
const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode }> = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50">
          <h3 className="text-xl font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="p-0 overflow-y-auto custom-scrollbar bg-white">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- User Form ---

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
    <div className="bg-white">
        <form onSubmit={handleSubmit} className="p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                    <input required type="text" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" 
                        value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. John Doe"/>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                    <input 
                        required 
                        type="email" 
                        className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none ${!isNewUser ? 'bg-slate-100 text-slate-500 border-slate-300' : 'bg-white border-slate-300'}`} 
                        value={formData.email || ''} 
                        onChange={e => isNewUser && setFormData({...formData, email: e.target.value})}
                        readOnly={!isNewUser} 
                        placeholder="john@company.com"
                    />
                </div>
            </div>
            
            <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 space-y-6">
                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <Shield size={18} className="text-teal-600"/>
                    Organizational Role & Hierarchy
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">System Role</label>
                        <select className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
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
                        <label className="block text-sm font-medium text-slate-700 mb-1">Hierarchy Level (Important for Org Structure)</label>
                        <select 
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
                            value={formData.orgLevel || ''} 
                            onChange={e => setFormData({...formData, orgLevel: e.target.value as OrgLevel})}
                        >
                            <option value="" disabled>Select Hierarchy Level...</option>
                            {ORG_HIERARCHY_ORDER.map(level => (
                                <option key={level} value={level}>{ORG_LEVEL_LABELS[level]} ({level})</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-500 mt-1">This defines the employee's band/grade within the department.</p>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 space-y-6">
                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                    <Briefcase size={18} className="text-teal-600"/>
                    Job & Reporting Line
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

            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium">Cancel</button>
                <button type="submit" className={`px-8 py-2 text-white rounded-lg transition-colors flex items-center gap-2 font-bold shadow-lg ${isPending ? 'bg-teal-600 hover:bg-teal-700 shadow-teal-200' : 'bg-slate-900 hover:bg-slate-800 shadow-slate-200'}`}>
                    {isPending ? <UserCheck size={18} /> : <Save size={18} />} 
                    {isPending ? 'Approve & Activate' : 'Save Employee'}
                </button>
            </div>
        </form>
    </div>
  );
};

// --- Job Form ---

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
    <form onSubmit={handleSubmit} className="p-8 space-y-8 bg-white">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Job Title</label>
          <input required className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" 
            value={formData.title || ''} onChange={e => setFormData({...formData, title: e.target.value})} />
        </div>
        <SearchableSelect label="Department" options={deptOptions} value={formData.departmentId || ''} onChange={val => setFormData({...formData, departmentId: val})} />
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" rows={2}
            value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} />
        </div>
      </div>

      <div className="border-t border-slate-200 pt-6">
        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Layers size={18} className="text-teal-600"/> 
            Competency Requirements by Level
        </h4>
        
        <div className="flex flex-col md:flex-row gap-6">
          <div className="w-full md:w-1/3">
             <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Select Org Level</label>
             <div className="space-y-1">
               {ORG_HIERARCHY_ORDER.map(level => (
                 <button type="button" key={level} onClick={() => setActiveLevel(level)}
                   className={`w-full flex justify-between items-center px-4 py-3 rounded-lg text-sm font-medium transition-all ${activeLevel === level ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                    <span>{ORG_LEVEL_LABELS[level]}</span>
                    <span className="text-xs opacity-70 bg-black/20 px-1.5 py-0.5 rounded">{level}</span>
                 </button>
               ))}
             </div>
          </div>
          
          <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 p-6">
             <div className="flex justify-between items-center mb-4">
               <div>
                  <h5 className="font-bold text-slate-900">Requirements for {ORG_LEVEL_LABELS[activeLevel]}</h5>
                  <p className="text-xs text-slate-500">Define skills required for this hierarchy level</p>
               </div>
             </div>
             
             <div className="mb-4">
               <SearchableSelect label="Add Required Skill" options={skillOptions} value="" onChange={handleAddSkill} placeholder="Search skill library..." />
             </div>

             <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {(formData.requirements?.[activeLevel] || []).length === 0 && (
                    <div className="text-center py-8 text-slate-400 border border-dashed border-slate-300 rounded-lg">No skills assigned to this level yet.</div>
                )}
                {(formData.requirements?.[activeLevel] || []).map(req => {
                   const skill = allSkills.find(s => s.id === req.skillId);
                   return (
                     <div key={req.skillId} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="flex-1">
                           <p className="font-bold text-slate-800 text-sm">{skill?.name}</p>
                           <p className="text-xs text-slate-500">{skill?.category}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-600">Level:</span>
                            <select className="px-2 py-1 bg-slate-100 border border-slate-200 rounded text-sm font-bold text-teal-700 outline-none focus:ring-2 focus:ring-teal-500"
                              value={req.requiredLevel} onChange={(e) => handleUpdateReq(req.skillId, parseInt(e.target.value))}>
                               {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <button type="button" onClick={() => handleRemoveReq(req.skillId)} className="text-slate-400 hover:text-red-500 p-1"><X size={16} /></button>
                     </div>
                   );
                })}
             </div>
          </div>
        </div>
      </div>

      <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
          <button type="submit" className="px-8 py-2 bg-slate-900 text-white rounded-lg font-bold shadow-lg hover:bg-slate-800 flex items-center gap-2">
             <Save size={18} /> Save Profile
          </button>
      </div>
    </form>
  );
};

// --- Skill Form ---

const SkillForm: React.FC<{ initialData?: Skill | null, onSave: (s: Skill) => void, onCancel: () => void }> = ({ initialData, onSave, onCancel }) => {
  // Initialize full structure for levels 1-5
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
    <form onSubmit={handleSubmit} className="p-8 space-y-8 bg-white">
       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Skill Name</label>
            <input required className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
               value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} />
         </div>
         <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none bg-white"
               value={formData.category || ''} onChange={e => setFormData({...formData, category: e.target.value})}>
                <option value="">Select...</option>
                <option value="Technical">Technical</option>
                <option value="Safety">Safety</option>
                <option value="Management">Management</option>
                <option value="Soft Skills">Soft Skills</option>
            </select>
         </div>
         <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Assessment Question</label>
            <input className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
               placeholder="e.g. How effectively does the employee..."
               value={formData.assessmentQuestion || ''} onChange={e => setFormData({...formData, assessmentQuestion: e.target.value})} />
         </div>
       </div>

       <div className="border-t border-slate-200 pt-6">
          <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
             <BookOpen size={18} className="text-teal-600"/> Proficiency Levels
          </h4>
          
          <div className="bg-slate-50 p-1 rounded-lg flex mb-6">
             {[1,2,3,4,5].map(lvl => (
                <button key={lvl} type="button" onClick={() => setActiveTab(lvl)}
                   className={`flex-1 py-2 text-sm font-bold rounded-md transition-all ${activeTab === lvl ? 'bg-white shadow text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>
                   Level {lvl}
                </button>
             ))}
          </div>

          <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
             <div className="mb-4">
                <label className="block text-sm font-bold text-slate-700 mb-1">Description for Level {activeTab}</label>
                <textarea className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none" rows={3}
                   value={formData.levels?.[activeTab as any]?.description || ''}
                   onChange={e => updateLevel(activeTab, 'description', e.target.value)}
                   placeholder={`Describe what a Level ${activeTab} employee can do...`}
                />
             </div>
             <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">Required Certificates</label>
                <input className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                   placeholder="e.g. PMP, NEBOSH (Comma separated)"
                   value={formData.levels?.[activeTab as any]?.requiredCertificates?.join(', ') || ''}
                   onChange={e => updateLevel(activeTab, 'requiredCertificates', e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean))}
                />
             </div>
          </div>
       </div>

       <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
          <button type="submit" className="px-8 py-2 bg-slate-900 text-white rounded-lg font-bold shadow-lg hover:bg-slate-800 flex items-center gap-2">
             <Save size={18} /> Save Skill
          </button>
      </div>
    </form>
  );
};

// --- Department Form ---

const DepartmentForm: React.FC<{ initialData?: Department | null, onSave: (d: Department) => void, onCancel: () => void }> = ({ initialData, onSave, onCancel }) => {
    const [name, setName] = useState(initialData?.name || '');
    const [managerId, setManagerId] = useState(initialData?.managerId || '');
    
    // Potential managers are anyone for now, or filter by role if needed
    const users = dataService.getAllUsers();
    const managerOptions = users.map(u => ({ value: u.id, label: u.name, subLabel: u.email }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            id: initialData?.id || Math.random().toString(36).substr(2, 9),
            name,
            managerId: managerId || undefined
        });
    };

    return (
        <form onSubmit={handleSubmit} className="p-8 space-y-6 bg-white">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Department Name</label>
                <input required className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
                    value={name} onChange={e => setName(e.target.value)} />
            </div>
            <SearchableSelect label="Department Head (Optional)" options={managerOptions} value={managerId} onChange={setManagerId} placeholder="Select Manager..." />
            
            <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button type="button" onClick={onCancel} className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                <button type="submit" className="px-8 py-2 bg-slate-900 text-white rounded-lg font-bold shadow-lg hover:bg-slate-800 flex items-center gap-2">
                    <Save size={18} /> Save Department
                </button>
            </div>
        </form>
    );
};


// --- Main Admin Panel ---

export const AdminPanel: React.FC<{ defaultTab?: string }> = ({ defaultTab = 'USERS' }) => {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [refreshKey, setRefreshKey] = useState(0); // Force re-render on data change
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'USER' | 'JOB' | 'SKILL' | 'DEPT' | null>(null);
  const [editItem, setEditItem] = useState<any>(null);

  const users = dataService.getAllUsers();
  const jobs = dataService.getAllJobs();
  const skills = dataService.getAllSkills();
  const depts = dataService.getAllDepartments();

  // Filter out pending users for the main list, show them separately if needed? 
  // For now, let's sort users so pending are at top
  const sortedUsers = [...users].sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
      return 0;
  });

  const handleEdit = (type: 'USER' | 'JOB' | 'SKILL' | 'DEPT', item: any) => {
      setModalType(type);
      setEditItem(item);
      setModalOpen(true);
  };

  const handleAdd = (type: 'USER' | 'JOB' | 'SKILL' | 'DEPT') => {
      setModalType(type);
      setEditItem(null);
      setModalOpen(true);
  };

  const handleSave = (item: any) => {
      if (modalType === 'USER') dataService.updateUser(item); // updateUser handles both add/update logic inside store usually, or we split
      if (modalType === 'JOB') editItem ? dataService.updateJobProfile(item) : dataService.addJobProfile(item);
      if (modalType === 'SKILL') editItem ? dataService.updateSkill(item) : dataService.addSkill(item);
      if (modalType === 'DEPT') editItem ? dataService.updateDepartment(item) : dataService.addDepartment(item);
      
      // Specifically for users, the store distinction might be subtle
      if (modalType === 'USER') {
          // If ID exists in list, update, else add. Store handles upsert.
          const exists = users.find(u => u.id === item.id);
          if (exists) dataService.updateUser(item);
          else dataService.addUser(item);
      }

      setModalOpen(false);
      setRefreshKey(k => k + 1);
  };

  const renderModalContent = () => {
      if (modalType === 'USER') return <UserForm initialData={editItem} onSave={handleSave} onCancel={() => setModalOpen(false)} />;
      if (modalType === 'JOB') return <JobForm initialData={editItem} onSave={handleSave} onCancel={() => setModalOpen(false)} />;
      if (modalType === 'SKILL') return <SkillForm initialData={editItem} onSave={handleSave} onCancel={() => setModalOpen(false)} />;
      if (modalType === 'DEPT') return <DepartmentForm initialData={editItem} onSave={handleSave} onCancel={() => setModalOpen(false)} />;
      return null;
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
           <h2 className="text-3xl font-bold text-slate-900">Administration</h2>
           <div className="flex bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
               {['USERS', 'JOBS', 'SKILLS', 'DEPTS'].map(tab => (
                   <button key={tab} onClick={() => setActiveTab(tab)} 
                     className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${activeTab === tab ? 'bg-slate-900 text-white shadow' : 'text-slate-500 hover:text-slate-900'}`}>
                       {tab === 'USERS' ? 'Employees' : tab === 'JOBS' ? 'Profiles' : tab === 'SKILLS' ? 'Skills' : 'Departments'}
                   </button>
               ))}
           </div>
       </div>

       {/* Content Area */}
       <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px]">
           {/* Toolbar */}
           <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
               <div className="relative max-w-sm w-full">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                   <input type="text" placeholder="Search..." className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white" />
               </div>
               <button onClick={() => handleAdd(activeTab === 'USERS' ? 'USER' : activeTab === 'JOBS' ? 'JOB' : activeTab === 'SKILLS' ? 'SKILL' : 'DEPT')}
                   className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm flex items-center gap-2">
                   <Plus size={18} /> Add New
               </button>
           </div>

           {/* Table */}
           <div className="overflow-x-auto">
               <table className="w-full text-left">
                   <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                       <tr>
                           {activeTab === 'USERS' && <> <th className="p-4 pl-6">Employee</th> <th className="p-4">Role & Dept</th> <th className="p-4">Position</th> <th className="p-4">Status</th> </>}
                           {activeTab === 'JOBS' && <> <th className="p-4 pl-6">Job Title</th> <th className="p-4">Department</th> <th className="p-4">Requirements</th> </>}
                           {activeTab === 'SKILLS' && <> <th className="p-4 pl-6">Skill Name</th> <th className="p-4">Category</th> <th className="p-4">Questions</th> </>}
                           {activeTab === 'DEPTS' && <> <th className="p-4 pl-6">Department Name</th> <th className="p-4">Manager</th> </>}
                           <th className="p-4 text-right pr-6">Actions</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 text-sm">
                       {activeTab === 'USERS' && sortedUsers.map(user => (
                           <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                               <td className="p-4 pl-6">
                                   <div className="flex items-center gap-3">
                                       <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden">
                                           {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="w-full h-full object-cover"/> : <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold">{user.name[0]}</div>}
                                       </div>
                                       <div>
                                           <div className="font-bold text-slate-900">{user.name}</div>
                                           <div className="text-slate-500 text-xs">{user.email}</div>
                                       </div>
                                   </div>
                               </td>
                               <td className="p-4">
                                   <span className="font-medium text-slate-700">{user.role}</span>
                                   <p className="text-slate-500 text-xs">{depts.find(d => d.id === user.departmentId)?.name || 'Unassigned'}</p>
                               </td>
                               <td className="p-4">
                                   <span className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded">{user.orgLevel || 'N/A'}</span>
                               </td>
                               <td className="p-4">
                                   {user.status === 'PENDING' ? (
                                       <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">
                                           <AlertCircle size={12}/> Review Needed
                                       </span>
                                   ) : (
                                       <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                                           <CheckCircle size={12}/> Active
                                       </span>
                                   )}
                               </td>
                               <td className="p-4 text-right pr-6">
                                   <button onClick={() => handleEdit('USER', user)} className="text-slate-400 hover:text-teal-600 p-2"><Edit2 size={18}/></button>
                               </td>
                           </tr>
                       ))}

                       {activeTab === 'JOBS' && jobs.map(job => (
                           <tr key={job.id} className="hover:bg-slate-50">
                               <td className="p-4 pl-6 font-bold text-slate-800">{job.title}</td>
                               <td className="p-4 text-slate-600">{depts.find(d => d.id === job.departmentId)?.name}</td>
                               <td className="p-4">
                                   <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold">{Object.keys(job.requirements).length} Levels Configured</span>
                               </td>
                               <td className="p-4 text-right pr-6">
                                   <button onClick={() => handleEdit('JOB', job)} className="text-slate-400 hover:text-teal-600 p-2"><Edit2 size={18}/></button>
                               </td>
                           </tr>
                       ))}

                       {activeTab === 'SKILLS' && skills.map(skill => (
                           <tr key={skill.id} className="hover:bg-slate-50">
                               <td className="p-4 pl-6 font-bold text-slate-800">{skill.name}</td>
                               <td className="p-4">
                                   <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-bold uppercase">{skill.category}</span>
                               </td>
                               <td className="p-4 text-slate-500 truncate max-w-xs">{skill.assessmentQuestion || '-'}</td>
                               <td className="p-4 text-right pr-6">
                                   <button onClick={() => handleEdit('SKILL', skill)} className="text-slate-400 hover:text-teal-600 p-2"><Edit2 size={18}/></button>
                               </td>
                           </tr>
                       ))}

                        {activeTab === 'DEPTS' && depts.map(d => (
                           <tr key={d.id} className="hover:bg-slate-50">
                               <td className="p-4 pl-6 font-bold text-slate-800">{d.name}</td>
                               <td className="p-4 text-slate-600">
                                   {users.find(u => u.id === d.managerId)?.name || <span className="text-slate-400 italic">No Manager</span>}
                               </td>
                               <td className="p-4 text-right pr-6">
                                   <button onClick={() => handleEdit('DEPT', d)} className="text-slate-400 hover:text-teal-600 p-2"><Edit2 size={18}/></button>
                               </td>
                           </tr>
                       ))}
                   </tbody>
               </table>
           </div>
       </div>

       <Modal 
         isOpen={modalOpen} 
         onClose={() => setModalOpen(false)} 
         title={
             modalType === 'USER' ? (editItem ? 'Edit Employee' : 'New Employee') :
             modalType === 'JOB' ? 'Configure Job Profile' :
             modalType === 'SKILL' ? 'Skill Definition' : 'Department Details'
         }
       >
           {renderModalContent()}
       </Modal>
    </div>
  );
};
