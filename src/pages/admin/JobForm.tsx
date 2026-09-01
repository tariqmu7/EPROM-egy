import React, { useState, useMemo } from 'react';
import { dataService } from '../../services/store';
import { JobProfile, OrgLevel, ORG_LEVEL_LABELS, ORG_HIERARCHY_ORDER } from '../../types';
import { X, Save, Layers, AlertTriangle } from 'lucide-react';
import { SearchableSelect } from '../../components/SearchableSelect';

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

export const JobForm: React.FC<{ initialData?: JobProfile | null, onSave: (j: JobProfile) => void, onCancel: () => void, isSubmitting?: boolean }> = ({ initialData, onSave, onCancel, isSubmitting }) => {
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
