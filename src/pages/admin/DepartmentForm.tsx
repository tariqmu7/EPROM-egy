import React, { useState } from 'react';
import { dataService } from '../../services/store';
import { ORG_LEVEL_LABELS, Department, DepartmentType, DEPT_TYPE_TO_ORG_LEVEL } from '../../types';
import { Save, AlertTriangle } from 'lucide-react';
import { SearchableSelect } from '../../components/SearchableSelect';

// --- Department Form ---
export const DepartmentForm: React.FC<{ initialData?: Department | null, onSave: (d: Department) => void, onCancel: () => void, isSubmitting?: boolean }> = ({ initialData, onSave, onCancel, isSubmitting }) => {
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
