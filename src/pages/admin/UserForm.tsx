import React, { useState, useEffect, useMemo } from 'react';
import { Avatar } from '../../components/Avatar';
import { dataService } from '../../services/store';
import { User, Role, OrgLevel, ORG_LEVEL_LABELS, ORG_HIERARCHY_ORDER } from '../../types';
import { Users, Briefcase, Shield, Save, UserCheck, AlertTriangle, Lock } from 'lucide-react';
import { SearchableSelect, Option } from '../../components/SearchableSelect';

// --- User Form (Unchanged Logic, styling preserved) ---
export const UserForm: React.FC<{ initialData?: User | null, currentUser: User, onSave: (u: User) => void, onCancel: () => void, isSubmitting?: boolean }> = ({ initialData, currentUser, onSave, onCancel, isSubmitting }) => {
  const departments = dataService.getAllDepartments();
  const jobProfiles = dataService.getAllJobs();
  const potentialManagers = dataService.getAllUsers(); 
  const projects = dataService.getAllProjects();

  const hqProjectId = projects.find(p => p.name.toUpperCase() === 'HQ')?.id;

  // Admin-issued temporary password (shown once, never re-retrievable).
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [resetError, setResetError] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleResetPassword = async () => {
    if (!initialData) return;
    setResetError('');
    setResettingPassword(true);
    const result = await dataService.adminResetPassword(initialData.id);
    setResettingPassword(false);
    if ('error' in result) {
      setResetError(result.error);
      return;
    }
    setTempPassword(result.tempPassword);
  };

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
                                <Avatar src={formData.avatarUrl} name={formData.name || "User"} />
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

            {/* Admin-issued temporary password — the only reset path until an SMTP
                relay exists for self-service email resets. Shown once; the plaintext
                is never stored, so a lost one just means issuing another. */}
            {initialData && (
                <div className="p-6 bg-slate-50 rounded-sm border border-slate-100 space-y-4">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2 border-b border-slate-300 pb-2">
                        <Lock size={16} className="text-slate-900" />
                        Password
                    </h4>
                    {tempPassword ? (
                        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-sm">
                            <p className="text-xs font-bold uppercase tracking-wide text-emerald-800 mb-2">
                                Temporary password — copy it now
                            </p>
                            <code className="block bg-white border border-emerald-200 px-3 py-2 font-mono text-lg tracking-widest text-slate-900 select-all">
                                {tempPassword}
                            </code>
                            <p className="text-xs text-slate-600 mt-2">
                                Give this to {initialData.name} directly. It will not be shown again, and they must
                                choose a new password the first time they sign in with it.
                            </p>
                        </div>
                    ) : (
                        <>
                            <p className="text-xs text-slate-600">
                                Issues a temporary password for this employee. They will be forced to set their own
                                password at their next sign-in.
                            </p>
                            {resetError && (
                                <p className="text-[11px] font-bold text-red-600 flex items-center gap-1">
                                    <AlertTriangle size={12} /> {resetError}
                                </p>
                            )}
                            <button
                                type="button"
                                onClick={handleResetPassword}
                                disabled={resettingPassword}
                                className="px-4 py-2 bg-white border border-slate-300 text-slate-800 rounded-sm hover:bg-slate-100 transition-colors font-bold uppercase tracking-wide text-xs disabled:opacity-50"
                            >
                                {resettingPassword ? 'Resetting...' : 'Reset Password'}
                            </button>
                        </>
                    )}
                </div>
            )}

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
