import React, { useState, useMemo } from 'react';
import {
  Plus, Edit2, Trash2, X, Save, ClipboardList, ShieldAlert, CheckCircle,
  Calendar, Layers, Users, Search, AlertTriangle, GripVertical
} from 'lucide-react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  AssessmentPlan, AssessmentMethod, AssessmentFrequency, AssessmentAudience,
  EvaluationQuestion,
  ASSESSMENT_FREQUENCY_LABELS, ASSESSMENT_AUDIENCE_LABELS,
  ORG_HIERARCHY_ORDER, ORG_LEVEL_LABELS
} from '../types';

const METHOD_OPTIONS: { value: AssessmentMethod; label: string }[] = [
  { value: 'OJT_OBSERVATION', label: 'OJT Observation (On-the-Job)' },
  { value: 'WRITTEN_EXAM', label: 'Written Examination (External / Online)' },
  { value: 'PRACTICAL_DEMO', label: 'Practical Demonstration / Simulation' },
  { value: 'INTERVIEW', label: 'Interview & Technical Discussion' },
  { value: 'WORK_RECORD_REVIEW', label: 'Work Record / Case Study Review' },
  { value: 'THREE_SIXTY_EVALUATION', label: '360° Multi-Rater Evaluation' },
  { value: 'ANNUAL_APPRAISAL', label: 'Annual Appraisal (Weighted Checklist)' }
];

const FREQUENCY_OPTIONS = (Object.keys(ASSESSMENT_FREQUENCY_LABELS) as AssessmentFrequency[])
  .map(v => ({ value: v, label: ASSESSMENT_FREQUENCY_LABELS[v] }));

const AUDIENCE_OPTIONS = (Object.keys(ASSESSMENT_AUDIENCE_LABELS) as AssessmentAudience[])
  .map(v => ({ value: v, label: ASSESSMENT_AUDIENCE_LABELS[v] }));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

type PlanDraft = Omit<AssessmentPlan, 'id' | 'createdAt' | 'updatedAt'>;

const emptyDraft = (): PlanDraft => ({
  name: '',
  description: '',
  skillIds: [],
  method: 'OJT_OBSERVATION',
  frequency: 'ANNUAL_FIXED_DATE',
  fixedMonth: 1,
  fixedDay: 1,
  audience: 'ALL',
  audienceOrgLevels: [],
  audienceDepartmentIds: [],
  annualAppraisalQuestions: [],
  status: 'ACTIVE'
});

const newAppraisalQuestion = (): EvaluationQuestion => ({
  id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  title: '',
  text: '',
  weight: 10
});

// --- Multi-select checkbox list with search ---
const MultiCheckList: React.FC<{
  options: { value: string; label: string; sub?: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  emptyText?: string;
}> = ({ options, selected, onToggle, emptyText }) => {
  const [search, setSearch] = useState('');
  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sub && o.sub.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="border border-slate-300 rounded-none bg-white">
      <div className="p-2 border-b border-slate-200 bg-slate-50 relative">
        <Search size={14} className="absolute left-4 top-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full pl-7 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-none focus:outline-none focus:border-slate-900"
        />
      </div>
      <div className="max-h-56 overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">{emptyText || 'No results'}</div>
        ) : filtered.map(o => {
          const checked = selected.includes(o.value);
          return (
            <label
              key={o.value}
              className={`flex items-center gap-3 px-4 py-2 text-sm cursor-pointer border-l-2 transition-colors ${
                checked ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-slate-50'
              }`}
            >
              <input type="checkbox" checked={checked} onChange={() => onToggle(o.value)} className="accent-blue-700" />
              <span className="text-slate-800 font-medium">{o.label}</span>
              {o.sub && <span className="text-xs text-slate-500">({o.sub})</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
};

export const AssessmentManagement: React.FC = () => {
  const storeVersion = useStoreData();
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft());
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');

  const plans = useMemo(() => dataService.getAllAssessmentPlans(), [storeVersion]);
  const skills = useMemo(() => dataService.getAllSkills(), [storeVersion]);
  const departments = useMemo(() => dataService.getAllDepartments(), [storeVersion]);

  const skillName = (id: string) => skills.find(s => s.id === id)?.name || '(deleted skill)';

  const flash = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const startCreate = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setFormError('');
    setIsEditing(true);
  };

  const startEdit = (plan: AssessmentPlan) => {
    const { id, createdAt, updatedAt, ...rest } = plan;
    setDraft({
      ...emptyDraft(),
      ...rest,
      audienceOrgLevels: rest.audienceOrgLevels || [],
      audienceDepartmentIds: rest.audienceDepartmentIds || [],
      annualAppraisalQuestions: rest.annualAppraisalQuestions || []
    });
    setEditingId(id);
    setFormError('');
    setIsEditing(true);
  };

  const toggleInArray = (key: 'skillIds' | 'audienceOrgLevels' | 'audienceDepartmentIds', value: string) => {
    setDraft(prev => {
      const arr = (prev[key] as string[]) || [];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
      };
    });
  };

  const handleSave = async () => {
    if (!draft.name.trim()) { setFormError('Plan name is required.'); return; }
    if (draft.method !== 'ANNUAL_APPRAISAL' && draft.skillIds.length === 0) {
      setFormError('Select at least one skill for this plan.'); return;
    }
    if (draft.method === 'ANNUAL_APPRAISAL' && (draft.annualAppraisalQuestions || []).length === 0) {
      setFormError('Add at least one question to the appraisal checklist.'); return;
    }
    if (draft.audience === 'ORG_LEVELS' && (draft.audienceOrgLevels || []).length === 0) {
      setFormError('Select at least one org level for the audience.'); return;
    }
    if (draft.audience === 'DEPARTMENTS' && (draft.audienceDepartmentIds || []).length === 0) {
      setFormError('Select at least one department for the audience.'); return;
    }

    // Normalise: only keep audience sub-fields relevant to the chosen audience.
    const payload: PlanDraft = {
      ...draft,
      name: draft.name.trim(),
      // Annual appraisal plans use a synthetic skill ID; regular plans need skillIds
      skillIds: draft.method === 'ANNUAL_APPRAISAL' ? ['annual-appraisal'] : draft.skillIds,
      fixedMonth: draft.frequency === 'ANNUAL_FIXED_DATE' ? draft.fixedMonth || 1 : undefined,
      fixedDay: draft.frequency === 'ANNUAL_FIXED_DATE' ? draft.fixedDay || 1 : undefined,
      audienceOrgLevels: draft.audience === 'ORG_LEVELS' ? draft.audienceOrgLevels : [],
      audienceDepartmentIds: draft.audience === 'DEPARTMENTS' ? draft.audienceDepartmentIds : [],
      annualAppraisalQuestions: draft.method === 'ANNUAL_APPRAISAL' ? draft.annualAppraisalQuestions : undefined
    };

    setIsProcessing(true);
    try {
      if (editingId) {
        const existing = dataService.getAssessmentPlan(editingId);
        if (!existing) throw new Error('Plan no longer exists');
        await dataService.updateAssessmentPlan({ ...existing, ...payload });
        flash('Assessment plan updated successfully.');
      } else {
        await dataService.addAssessmentPlan(payload);
        flash('Assessment plan created successfully.');
      }
      setIsEditing(false);
      setEditingId(null);
    } catch (e) {
      console.error(e);
      setFormError('Failed to save the plan. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (plan: AssessmentPlan) => {
    if (!window.confirm(`Delete the assessment plan "${plan.name}"? Skills it scheduled will revert to one-time (no recurrence).`)) return;
    setIsProcessing(true);
    try {
      await dataService.deleteAssessmentPlan(plan.id);
      flash('Assessment plan deleted.');
    } catch (e) {
      console.error(e);
      alert('Failed to delete the plan.');
    } finally {
      setIsProcessing(false);
    }
  };

  const audienceSummary = (plan: AssessmentPlan): string => {
    switch (plan.audience) {
      case 'ORG_LEVELS':
        return (plan.audienceOrgLevels || []).map(l => ORG_LEVEL_LABELS[l]).join(', ') || 'No levels';
      case 'DEPARTMENTS':
        return (plan.audienceDepartmentIds || [])
          .map(d => departments.find(dep => dep.id === d)?.name || '?').join(', ') || 'No departments';
      default:
        return ASSESSMENT_AUDIENCE_LABELS[plan.audience];
    }
  };

  const frequencySummary = (plan: AssessmentPlan): string => {
    if (plan.frequency === 'ANNUAL_FIXED_DATE') {
      return `Annually on ${MONTHS[(plan.fixedMonth || 1) - 1]} ${plan.fixedDay || 1}`;
    }
    return ASSESSMENT_FREQUENCY_LABELS[plan.frequency];
  };

  // ---------------- FORM VIEW ----------------
  if (isEditing) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300">
        <div className="flex items-center justify-between pb-6 border-b border-slate-300">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsEditing(false)} className="p-2 rounded-none hover:bg-slate-200 text-slate-600">
              <X size={20} />
            </button>
            <div>
              <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
                {editingId ? 'Edit Assessment Plan' : 'New Assessment Plan'}
              </h2>
              <p className="text-slate-700 text-sm mt-1">Define a method, recurrence and audience, then attach skills.</p>
            </div>
          </div>
        </div>

        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-none flex items-center gap-3">
            <AlertTriangle size={18} /> <p className="font-medium text-sm">{formError}</p>
          </div>
        )}

        <div className="bg-white border border-slate-300 rounded-none p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Plan Name</label>
              <input
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Annual Safety Recertification"
                className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-none focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Status</label>
              <SearchableSelect
                options={[{ value: 'ACTIVE', label: 'Active (drives scheduling)' }, { value: 'INACTIVE', label: 'Inactive (paused)' }]}
                value={draft.status}
                onChange={val => setDraft({ ...draft, status: val as 'ACTIVE' | 'INACTIVE' })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Description (Optional)</label>
              <input
                value={draft.description || ''}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
                placeholder="Purpose / notes for this plan"
                className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-none focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>

            <div>
              <SearchableSelect
                label="Assessment Method"
                options={METHOD_OPTIONS}
                value={draft.method}
                onChange={val => setDraft({ ...draft, method: val as AssessmentMethod })}
              />
            </div>
            <div>
              <SearchableSelect
                label="Assessment Frequency"
                options={FREQUENCY_OPTIONS}
                value={draft.frequency}
                onChange={val => setDraft({ ...draft, frequency: val as AssessmentFrequency })}
              />
            </div>

            {draft.frequency === 'ANNUAL_FIXED_DATE' && (
              <>
                <div>
                  <SearchableSelect
                    label="Fixed Month"
                    options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                    value={String(draft.fixedMonth || 1)}
                    onChange={val => setDraft({ ...draft, fixedMonth: Number(val) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fixed Day</label>
                  <input
                    type="number" min={1} max={31}
                    value={draft.fixedDay || 1}
                    onChange={e => setDraft({ ...draft, fixedDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                    className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
                  />
                </div>
              </>
            )}

            <div className={draft.audience === 'ORG_LEVELS' || draft.audience === 'DEPARTMENTS' ? '' : 'md:col-span-2'}>
              <SearchableSelect
                label="Target Audience"
                options={AUDIENCE_OPTIONS}
                value={draft.audience}
                onChange={val => setDraft({ ...draft, audience: val as AssessmentAudience })}
              />
            </div>

            {draft.audience === 'ORG_LEVELS' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Org Levels</label>
                <MultiCheckList
                  options={ORG_HIERARCHY_ORDER.map(l => ({ value: l, label: ORG_LEVEL_LABELS[l], sub: l }))}
                  selected={draft.audienceOrgLevels || []}
                  onToggle={v => toggleInArray('audienceOrgLevels', v)}
                />
              </div>
            )}

            {draft.audience === 'DEPARTMENTS' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Departments</label>
                <MultiCheckList
                  options={departments.map(d => ({ value: d.id, label: d.name, sub: d.type }))}
                  selected={draft.audienceDepartmentIds || []}
                  onToggle={v => toggleInArray('audienceDepartmentIds', v)}
                  emptyText="No departments defined"
                />
              </div>
            )}
          </div>

          {draft.method === 'ANNUAL_APPRAISAL' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <ClipboardList size={14} /> Appraisal Questions
                  <span className="text-slate-400 font-medium normal-case">({(draft.annualAppraisalQuestions || []).length} questions)</span>
                </label>
                <div className="flex items-center gap-3">
                  {(() => {
                    const qs = draft.annualAppraisalQuestions || [];
                    const total = qs.reduce((s, q) => s + (q.weight ?? 0), 0);
                    return (
                      <span className={`text-xs font-bold px-2 py-1 border rounded-none ${
                        total === 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        Total weight: {total}% {total !== 100 && '(should be 100%)'}
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => setDraft(prev => ({
                      ...prev,
                      annualAppraisalQuestions: [...(prev.annualAppraisalQuestions || []), newAppraisalQuestion()]
                    }))}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 rounded-none"
                  >
                    <Plus size={12} /> Add Question
                  </button>
                </div>
              </div>

              {(draft.annualAppraisalQuestions || []).length === 0 ? (
                <div className="border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
                  No questions yet. Click "Add Question" to begin.
                </div>
              ) : (
                <div className="space-y-3">
                  {(draft.annualAppraisalQuestions || []).map((q, idx) => (
                    <div key={q.id} className="border border-slate-200 bg-white p-4 rounded-none">
                      <div className="flex items-start gap-3">
                        <GripVertical size={16} className="text-slate-300 mt-2 shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <input
                              value={q.title || ''}
                              onChange={e => setDraft(prev => ({
                                ...prev,
                                annualAppraisalQuestions: (prev.annualAppraisalQuestions || []).map((x, i) =>
                                  i === idx ? { ...x, title: e.target.value } : x
                                )
                              }))}
                              placeholder={`Question ${idx + 1} title`}
                              className="px-3 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-none focus:outline-none focus:border-slate-900 font-medium"
                            />
                            <input
                              value={q.text}
                              onChange={e => setDraft(prev => ({
                                ...prev,
                                annualAppraisalQuestions: (prev.annualAppraisalQuestions || []).map((x, i) =>
                                  i === idx ? { ...x, text: e.target.value } : x
                                )
                              }))}
                              placeholder="Full question text (shown to evaluator)"
                              className="md:col-span-1 px-3 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-none focus:outline-none focus:border-slate-900"
                            />
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">Weight %</label>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                value={q.weight ?? 10}
                                onChange={e => setDraft(prev => ({
                                  ...prev,
                                  annualAppraisalQuestions: (prev.annualAppraisalQuestions || []).map((x, i) =>
                                    i === idx ? { ...x, weight: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } : x
                                  )
                                }))}
                                className="w-20 px-3 py-1.5 text-sm bg-slate-50 border border-slate-300 rounded-none focus:outline-none focus:border-slate-900 font-bold text-blue-700"
                              />
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDraft(prev => ({
                            ...prev,
                            annualAppraisalQuestions: (prev.annualAppraisalQuestions || []).filter((_, i) => i !== idx)
                          }))}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-none border border-transparent hover:border-red-200"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Layers size={14} /> Skills Covered by This Plan
                <span className="text-slate-400 font-medium normal-case">({draft.skillIds.length} selected)</span>
              </label>
              <MultiCheckList
                options={skills.map(s => ({ value: s.id, label: s.name, sub: s.category }))}
                selected={draft.skillIds}
                onToggle={v => toggleInArray('skillIds', v)}
                emptyText="No skills defined yet"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={() => setIsEditing(false)}
            className="px-5 py-3 rounded-none text-sm font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isProcessing}
            className="flex items-center gap-2 px-5 py-3 rounded-none text-sm font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 border border-blue-700 disabled:opacity-60"
          >
            <Save size={16} /> {isProcessing ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
      </div>
    );
  }

  // ---------------- LIST VIEW ----------------
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="pb-6 border-b border-slate-300 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Assessment Management</h2>
          <p className="text-slate-700 text-sm mt-1">
            Define how and when each skill is assessed. Plans drive employee assessment scheduling.
          </p>
        </div>
        <div className="bg-slate-100 p-2 rounded-sm border border-slate-300 flex items-center gap-2 text-sm text-slate-600 font-medium">
          <ShieldAlert size={16} />
          <span>Admin Controls</span>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-sm flex items-center gap-3 animate-fade-in shadow-sm">
          <CheckCircle size={20} className="text-emerald-500" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={startCreate}
          className="flex items-center gap-2 px-4 py-3 rounded-none text-sm font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 border border-blue-700"
        >
          <Plus size={16} /> New Assessment Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="bg-white border border-slate-300 rounded-none p-16 text-center">
          <ClipboardList size={40} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">No assessment plans yet</h3>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            Skills without a plan are treated as one-time and never become due again.
          </p>
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-none text-sm font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus size={16} /> Create the first plan
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-300 rounded-none overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-4">Plan</th>
                <th className="p-4">Method</th>
                <th className="p-4">Frequency</th>
                <th className="p-4">Audience</th>
                <th className="p-4">Skills</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map(plan => (
                <tr key={plan.id} className="hover:bg-slate-50/60">
                  <td className="p-4">
                    <div className="font-bold text-slate-900">{plan.name}</div>
                    {plan.description && <div className="text-xs text-slate-500 mt-0.5">{plan.description}</div>}
                  </td>
                  <td className="p-4 text-slate-700">{plan.method.replace(/_/g, ' ')}</td>
                  <td className="p-4 text-slate-700">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar size={13} className="text-slate-400" />
                      {frequencySummary(plan)}
                    </span>
                  </td>
                  <td className="p-4 text-slate-700">
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={13} className="text-slate-400" />
                      {audienceSummary(plan)}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-slate-700" title={plan.skillIds.map(skillName).join(', ')}>
                      {plan.skillIds.length} skill{plan.skillIds.length === 1 ? '' : 's'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-none border ${
                      plan.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {plan.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(plan)}
                        className="p-2 rounded-none border border-slate-200 text-slate-600 hover:bg-slate-900 hover:text-white transition-colors"
                        title="Edit plan"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(plan)}
                        disabled={isProcessing}
                        className="p-2 rounded-none border border-red-200 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                        title="Delete plan"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
