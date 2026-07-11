import React, { useState } from 'react';
import {
  Plus, Trash2, Search, Calendar, Users, Link2, MessageSquare, ClipboardList,
  Scale, ShieldCheck
} from 'lucide-react';
import { dataService } from '../services/store';
import { SearchableSelect } from './SearchableSelect';
import {
  SkillAssessmentMethod, AssessmentMethod, AssessmentFrequency, AssessmentAudience,
  EvaluationQuestion, RaterWeights, AssessorRole, DEFAULT_RATER_WEIGHTS,
  ASSESSOR_ROLE_LABELS,
  ASSESSMENT_METHOD_LABELS, ASSESSMENT_FREQUENCY_LABELS,
  ASSESSMENT_AUDIENCE_LABELS, ORG_HIERARCHY_ORDER, ORG_LEVEL_LABELS
} from '../types';
import { METHOD_STANDARD_MAP, getStandard } from '../constants/standards';

// ANNUAL_APPRAISAL is a company-wide weighted checklist, not a per-skill method,
// so it is excluded from the skill-level method picker.
const METHOD_OPTIONS = (Object.keys(ASSESSMENT_METHOD_LABELS) as AssessmentMethod[])
  .filter(m => m !== 'ANNUAL_APPRAISAL')
  .map(v => ({ value: v, label: ASSESSMENT_METHOD_LABELS[v] }));

const FREQUENCY_OPTIONS = (Object.keys(ASSESSMENT_FREQUENCY_LABELS) as AssessmentFrequency[])
  .map(v => ({ value: v, label: ASSESSMENT_FREQUENCY_LABELS[v] }));

const AUDIENCE_OPTIONS = (Object.keys(ASSESSMENT_AUDIENCE_LABELS) as AssessmentAudience[])
  .map(v => ({ value: v, label: ASSESSMENT_AUDIENCE_LABELS[v] }));

const ASSESSOR_OPTIONS = (Object.keys(ASSESSOR_ROLE_LABELS) as AssessorRole[])
  .map(v => ({ value: v, label: ASSESSOR_ROLE_LABELS[v] }));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export const newAssessmentMethod = (): SkillAssessmentMethod => ({
  id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  method: 'OJT_OBSERVATION',
  assessmentQuestion: '',
  assessmentLink: '',
  questions: [],
  frequency: 'ONE_TIME',
  audience: 'ALL',
  audienceOrgLevels: [],
  audienceDepartmentIds: []
});

// Declarative capability registry: which standards-based controls each method
// type exposes in the editor. Single source of truth replacing the old
// NO_QUESTIONS / LINK_LABEL constants. ANNUAL_APPRAISAL is excluded from the
// picker (company-wide checklist) so it carries no caps here.
interface MethodCaps {
  link?: string;             // external-link field label (absent ⇒ no link field)
  questionBank?: boolean;    // question / checklist bank
  questionPlaceholder?: string;
  passingScore?: boolean;    // pass mark + time limit + question count
  raterWeights?: boolean;    // 360° self/peer/manager blend
  assessor?: boolean;        // assessor role
  evidence?: boolean;        // evidence validity window + minimum records
}

const METHOD_CAPS: Record<AssessmentMethod, MethodCaps> = {
  WRITTEN_EXAM: {
    link: 'Online Exam Link (Google / Microsoft Forms…)',
    questionBank: true, passingScore: true
  },
  INTERVIEW: {
    link: 'Meeting Link (Teams / Zoom / Meet…)',
    questionBank: true, assessor: true,
    questionPlaceholder: 'STAR behavioral question (Situation, Task, Action, Result)…'
  },
  PRACTICAL_DEMO: {
    link: 'Resource / Booking Link (optional)',
    questionBank: true, assessor: true,
    questionPlaceholder: 'Observable checklist item the assessor scores…'
  },
  OJT_OBSERVATION: {
    questionBank: true, raterWeights: true,
    questionPlaceholder: 'Behavioral anchor / observation prompt…'
  },
  THREE_SIXTY_EVALUATION: {
    questionBank: true, raterWeights: true, assessor: true,
    questionPlaceholder: 'Behavioral anchor rated by self / peers / manager…'
  },
  WORK_RECORD_REVIEW: { evidence: true },
  ANNUAL_APPRAISAL: {}
};

// --- Question / checklist bank editor ---
const QuestionManager: React.FC<{
  questions: EvaluationQuestion[];
  onChange: (questions: EvaluationQuestion[]) => void;
  placeholder?: string;
}> = ({ questions, onChange, placeholder }) => {
  const addQuestion = () =>
    onChange([...questions, { id: Math.random().toString(36).substr(2, 9), text: '', expectedCriteria: '', weight: 10 }]);
  const removeQuestion = (id: string) => onChange(questions.filter(q => q.id !== id));
  const updateQuestion = (id: string, field: keyof EvaluationQuestion, value: any) =>
    onChange(questions.map(q => q.id === id ? { ...q, [field]: value } : q));

  const totalWeight = questions.reduce((s, q) => s + (q.weight ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <ClipboardList size={12} /> Question Bank
        </h5>
        <div className="flex items-center gap-3">
          {questions.length > 0 && (
            <span className={`text-[10px] font-bold px-2 py-1 rounded-sm border ${totalWeight === 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              Weight: {totalWeight}%
            </span>
          )}
          <button type="button" onClick={addQuestion} className="flex items-center gap-1 text-blue-700 hover:text-blue-800 text-[11px] font-bold uppercase tracking-wide">
            <Plus size={12} /> Add Question
          </button>
        </div>
      </div>
      {questions.length === 0 ? (
        <div className="text-[11px] text-slate-500 italic p-3 border border-dashed border-slate-300 rounded-sm bg-white text-center">
          No questions yet.
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q, idx) => (
            <div key={q.id} className="p-3 bg-white border border-slate-200 rounded-sm space-y-2 relative">
              <button type="button" onClick={() => removeQuestion(q.id)} className="absolute top-2 right-2 text-slate-400 hover:text-red-600">
                <Trash2 size={13} />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Question {idx + 1}</label>
                  <input
                    type="text"
                    className="w-full px-3 py-1.5 text-sm bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none"
                    value={q.text}
                    onChange={e => updateQuestion(q.id, 'text', e.target.value)}
                    placeholder={placeholder || 'Enter question text...'}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Weight (%)</label>
                  <input
                    type="number" min={0} max={100}
                    className="w-full px-3 py-1.5 text-sm bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none"
                    value={q.weight ?? 10}
                    onChange={e => updateQuestion(q.id, 'weight', Number(e.target.value))}
                  />
                </div>
              </div>
              <input
                type="text"
                className="w-full px-3 py-1.5 text-xs bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none"
                value={q.expectedCriteria || ''}
                onChange={e => updateQuestion(q.id, 'expectedCriteria', e.target.value)}
                placeholder="Expected criteria / answer key (optional)"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Multi-select checkbox list with search (audience targeting) ---
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
    <div className="border border-slate-300 rounded-sm bg-white">
      <div className="p-2 border-b border-slate-200 bg-slate-50 relative">
        <Search size={13} className="absolute left-4 top-[14px] text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full pl-7 pr-3 py-1.5 text-sm bg-white border border-slate-300 rounded-sm focus:outline-none focus:border-slate-900"
        />
      </div>
      <div className="max-h-48 overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <div className="p-5 text-center text-sm text-slate-500">{emptyText || 'No results'}</div>
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

// --- Small labelled number input ---
const NumberField: React.FC<{
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  suffix?: string;
  placeholder?: string;
}> = ({ label, value, onChange, min, max, suffix, placeholder }) => (
  <div>
    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
    <div className="relative">
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          let n = Number(raw);
          if (min !== undefined) n = Math.max(min, n);
          if (max !== undefined) n = Math.min(max, n);
          onChange(n);
        }}
        className="w-full px-3 py-1.5 text-sm bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none"
      />
      {suffix && <span className="absolute right-3 top-1.5 text-xs text-slate-400">{suffix}</span>}
    </div>
  </div>
);

// --- 360° rater-weight editor (self / peer / manager, sum should be 100) ---
const RaterWeightsEditor: React.FC<{
  value?: RaterWeights;
  onChange: (w: RaterWeights) => void;
}> = ({ value, onChange }) => {
  const w = value || DEFAULT_RATER_WEIGHTS;
  const total = w.self + w.peer + w.manager;
  const set = (key: keyof RaterWeights, n: number | undefined) =>
    onChange({ ...w, [key]: Math.max(0, Math.min(100, n ?? 0)) });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          <Scale size={12} /> 360° Rater Weights
        </h5>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-sm border ${total === 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
          Total: {total}%
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Self" value={w.self} onChange={v => set('self', v)} min={0} max={100} suffix="%" />
        <NumberField label="Peer" value={w.peer} onChange={v => set('peer', v)} min={0} max={100} suffix="%" />
        <NumberField label="Manager" value={w.manager} onChange={v => set('manager', v)} min={0} max={100} suffix="%" />
      </div>
      {total !== 100 && (
        <p className="text-[10px] text-amber-700">Weights should sum to 100%. Scoring re-normalizes automatically if they don't.</p>
      )}
    </div>
  );
};

// --- Standards conformance chips for a method type ---
const StandardChips: React.FC<{ method: AssessmentMethod }> = ({ method }) => {
  const ids = METHOD_STANDARD_MAP[method] || [];
  if (ids.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
        <ShieldCheck size={11} /> Conforms to
      </span>
      {ids.map(id => {
        const s = getStandard(id);
        return (
          <span key={id} title={s?.name} className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-sm">
            {s?.code || id}
          </span>
        );
      })}
    </div>
  );
};

// --- One method block ---
const MethodBlock: React.FC<{
  index: number;
  method: SkillAssessmentMethod;
  onChange: (m: SkillAssessmentMethod) => void;
  onRemove: () => void;
}> = ({ index, method, onChange, onRemove }) => {
  const departments = dataService.getAllDepartments();
  const set = (patch: Partial<SkillAssessmentMethod>) => onChange({ ...method, ...patch });

  const toggleArray = (key: 'audienceOrgLevels' | 'audienceDepartmentIds', value: string) => {
    const arr = (method[key] as string[]) || [];
    set({ [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] } as any);
  };

  const caps = METHOD_CAPS[method.method] || {};

  return (
    <div className="border border-slate-300 rounded-sm bg-slate-50">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-white">
        <span className="text-xs font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Method {index + 1}</span>
        <StandardChips method={method.method} />
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-sm border border-transparent hover:border-red-200"
          title="Remove method"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* HOW */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SearchableSelect
            label="Assessment Type"
            options={METHOD_OPTIONS}
            value={method.method}
            onChange={val => set({ method: val as AssessmentMethod })}
          />
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Prompt / Statement</label>
            <input
              value={method.assessmentQuestion || ''}
              onChange={e => set({ assessmentQuestion: e.target.value })}
              placeholder="e.g. How effectively does the employee…"
              className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
            />
          </div>
        </div>

        {caps.link && (
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Link2 size={12} /> {caps.link}
            </label>
            <input
              type="url"
              value={method.assessmentLink || ''}
              onChange={e => set({ assessmentLink: e.target.value })}
              placeholder="https://…"
              className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
            />
          </div>
        )}

        {caps.questionBank && (
          <div className="bg-white border border-slate-200 rounded-sm p-4">
            <QuestionManager
              questions={method.questions || []}
              onChange={qs => set({ questions: qs })}
              placeholder={caps.questionPlaceholder}
            />
          </div>
        )}

        {/* STANDARD — per-method-type controls */}
        <div className="bg-white border border-slate-200 rounded-sm p-4 space-y-4">
          <h5 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
            <ShieldCheck size={12} /> Assessment Standard
          </h5>

          {caps.passingScore && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberField label="Default Passing Score" suffix="%" min={0} max={100}
                value={method.passingScorePercent} onChange={v => set({ passingScorePercent: v })} placeholder="e.g. 70" />
              <NumberField label="Time Limit" suffix="min" min={0}
                value={method.timeLimitMinutes} onChange={v => set({ timeLimitMinutes: v })} placeholder="e.g. 45" />
              <NumberField label="Question Count" min={0}
                value={method.questionCount} onChange={v => set({ questionCount: v })} placeholder="e.g. 30" />
            </div>
          )}

          {caps.raterWeights && (
            <RaterWeightsEditor value={method.raterWeights} onChange={w => set({ raterWeights: w })} />
          )}

          {caps.assessor && (
            <div className="md:max-w-xs">
              <SearchableSelect
                label="Conducted By (Assessor)"
                options={ASSESSOR_OPTIONS}
                value={method.assessorRole || 'DIRECT_MANAGER'}
                onChange={val => set({ assessorRole: val as AssessorRole })}
              />
            </div>
          )}

          {caps.evidence && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <NumberField label="Evidence Validity" suffix="months" min={0}
                value={method.evidenceValidityMonths} onChange={v => set({ evidenceValidityMonths: v })} placeholder="e.g. 24" />
              <NumberField label="Min. Approved Records" min={0}
                value={method.minEvidenceCount} onChange={v => set({ minEvidenceCount: v })} placeholder="e.g. 1" />
            </div>
          )}
        </div>

        {/* WHEN + WHO */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Calendar size={12} /> Frequency
            </label>
            <SearchableSelect
              options={FREQUENCY_OPTIONS}
              value={method.frequency}
              onChange={val => set({ frequency: val as AssessmentFrequency })}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Users size={12} /> Audience
            </label>
            <SearchableSelect
              options={AUDIENCE_OPTIONS}
              value={method.audience}
              onChange={val => set({ audience: val as AssessmentAudience })}
            />
          </div>

          {method.frequency === 'ANNUAL_FIXED_DATE' && (
            <>
              <SearchableSelect
                label="Fixed Month"
                options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
                value={String(method.fixedMonth || 1)}
                onChange={val => set({ fixedMonth: Number(val) })}
              />
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Fixed Day</label>
                <input
                  type="number" min={1} max={31}
                  value={method.fixedDay || 1}
                  onChange={e => set({ fixedDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                  className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
                />
              </div>
            </>
          )}
        </div>

        {method.audience === 'ORG_LEVELS' && (
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Org Levels</label>
            <MultiCheckList
              options={ORG_HIERARCHY_ORDER.map(l => ({ value: l, label: ORG_LEVEL_LABELS[l], sub: l }))}
              selected={method.audienceOrgLevels || []}
              onToggle={v => toggleArray('audienceOrgLevels', v)}
            />
          </div>
        )}

        {method.audience === 'DEPARTMENTS' && (
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Departments</label>
            <MultiCheckList
              options={departments.map(d => ({ value: d.id, label: d.name, sub: d.type }))}
              selected={method.audienceDepartmentIds || []}
              onToggle={v => toggleArray('audienceDepartmentIds', v)}
              emptyText="No departments defined"
            />
          </div>
        )}
      </div>
    </div>
  );
};

// --- Editor: list of method blocks ---
export const AssessmentMethodEditor: React.FC<{
  methods: SkillAssessmentMethod[];
  onChange: (methods: SkillAssessmentMethod[]) => void;
}> = ({ methods, onChange }) => {
  const updateAt = (idx: number, m: SkillAssessmentMethod) =>
    onChange(methods.map((x, i) => i === idx ? m : x));
  const removeAt = (idx: number) => onChange(methods.filter((_, i) => i !== idx));
  const add = () => onChange([...methods, newAssessmentMethod()]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare size={18} className="text-slate-900" /> Assessment Methods
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Define how <span className="font-semibold text-slate-700">and</span> when this skill is assessed.
            A skill can use several methods; each carries its own questions/link, recurrence and audience.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 rounded-sm whitespace-nowrap"
        >
          <Plus size={14} /> Add Method
        </button>
      </div>

      {methods.length === 0 ? (
        <div className="border border-dashed border-slate-300 p-10 text-center bg-slate-50 rounded-sm">
          <MessageSquare size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">
            No assessment method defined — this skill is scored as 360° / OJT by default.
          </p>
          <button
            type="button"
            onClick={add}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase tracking-wider bg-blue-600 text-white border border-blue-700 hover:bg-blue-700 rounded-sm"
          >
            <Plus size={14} /> Add the first method
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {methods.map((m, idx) => (
            <MethodBlock
              key={m.id}
              index={idx}
              method={m}
              onChange={mm => updateAt(idx, mm)}
              onRemove={() => removeAt(idx)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
