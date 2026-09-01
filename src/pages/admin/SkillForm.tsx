import React, { useState } from 'react';
import { dataService } from '../../services/store';
import { Skill, PROFICIENCY_LABELS, SkillAssessmentMethod, DEFAULT_RATER_WEIGHTS, SKILL_CRITICALITIES, SKILL_CRITICALITY_LABELS, SKILL_CRITICALITY_DESCRIPTIONS, SKILL_CRITICALITY_WEIGHTS, skillCriticalityOf } from '../../types';
import { PROFICIENCY_DEFINITIONS } from '../../constants';
import { Save, BookOpen, Activity } from 'lucide-react';
import { SearchableSelect } from '../../components/SearchableSelect';
import { AssessmentMethodEditor } from '../../components/AssessmentMethodEditor';

// --- Skill Form (Competency Standard) ---
// Two top-level sections: the competency standard (identity + proficiency
// levels) and the inline assessment methods (how & when the skill is assessed).
export const SkillForm: React.FC<{ initialData?: Skill | null, onSave: (s: Skill) => void, onCancel: () => void, isSubmitting?: boolean }> = ({ initialData, onSave, onCancel, isSubmitting }) => {
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
       // Always written explicitly: a skill saved without a choice is STANDARD,
       // never "unset", so nothing ranks on an absent field.
       criticality: skillCriticalityOf(formData.criticality),
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
         {/* Criticality — the one judgement the maths cannot make. It never
             changes a score; it decides which gap is trained first. */}
         <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
               Criticality — how much a gap on this skill matters
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
               {SKILL_CRITICALITIES.map(level => {
                  const selected = skillCriticalityOf(formData.criticality) === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setFormData({ ...formData, criticality: level })}
                      className={`text-left p-3 border transition-all ${selected
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`}
                    >
                      <span className="block text-[11px] font-black uppercase tracking-wider">
                        {SKILL_CRITICALITY_LABELS[level]}
                      </span>
                      <span className={`block text-[10px] mt-1 leading-snug ${selected ? 'text-slate-200' : 'text-slate-500'}`}>
                        {SKILL_CRITICALITY_DESCRIPTIONS[level]}
                      </span>
                      <span className={`block text-[9px] mt-1 font-bold ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
                        Gap weight ×{SKILL_CRITICALITY_WEIGHTS[level]}
                      </span>
                    </button>
                  );
               })}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
               Used to rank training needs and individual plans worst-first. It never changes anyone's score.
            </p>
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
