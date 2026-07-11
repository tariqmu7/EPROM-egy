import React, { useState, useMemo, useEffect } from 'react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { AssessmentPlan, EvaluationQuestion } from '../types';
import { Plus, Save, Trash2, ArrowUp, ArrowDown, CheckCircle, AlertTriangle, ClipboardCheck, RotateCcw } from 'lucide-react';

const newQuestionId = () => `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const DEFAULT_QUESTIONS: EvaluationQuestion[] = [
  { id: 'q1', title: "Health, Safety, and Environment (HSE) Compliance", text: "Did the employee consistently adhere to, and actively promote, all safety protocols and HSE guidelines without any recorded compliance violations this year?", weight: 10 },
  { id: 'q2', title: "Technical Execution and Quality", text: "Did the employee successfully execute their assigned technical tasks, field operations, or project deliverables to the required quality standards?", weight: 10 },
  { id: 'q3', title: "Problem Solving and Troubleshooting", text: "Did the employee demonstrate the ability to independently and safely resolve unexpected technical, mechanical, or operational challenges on-site or during project design?", weight: 10 },
  { id: 'q4', title: "Multidisciplinary Collaboration", text: "Did the employee collaborate effectively across different roles (e.g., engineers working well with technicians and management) to keep projects moving smoothly?", weight: 10 },
  { id: 'q5', title: "Operational Efficiency and Resource Management", text: "Did the employee manage company resources—such as time, field equipment, materials, or budget—efficiently and responsibly?", weight: 10 },
  { id: 'q6', title: "Adaptability Under Pressure", text: "Did the employee adapt successfully to sudden changes in project scope, shifting site conditions, or emergency operational demands?", weight: 10 },
  { id: 'q7', title: "Clear Technical Communication", text: "Did the employee consistently communicate critical project updates, technical data, and potential operational risks clearly to their supervisors and team members?", weight: 10 },
  { id: 'q8', title: "Continuous Improvement and Innovation", text: "Did the employee suggest or implement any process optimizations, cost-saving measures, or new technical approaches that benefited the team or project?", weight: 10 },
  { id: 'q9', title: "Knowledge Sharing and Mentorship", text: "Did the employee actively share their technical expertise, assist peers with complex tasks, or help guide junior staff/technicians?", weight: 10 },
  { id: 'q10', title: "Professional Development", text: "Did the employee complete required industry training and actively work to update their technical skills or certifications relevant to the energy sector?", weight: 10 }
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const AnnualAppraisalAdmin: React.FC = () => {
  const storeVersion = useStoreData();

  // The single company-wide ANNUAL_APPRAISAL plan (active preferred).
  const existingPlan = useMemo<AssessmentPlan | null>(() => {
    const plans = dataService.getAllAssessmentPlans().filter(p => p.method === 'ANNUAL_APPRAISAL');
    return plans.find(p => p.status === 'ACTIVE') ?? plans[0] ?? null;
  }, [storeVersion]);

  const [name, setName] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [fixedMonth, setFixedMonth] = useState(1);
  const [fixedDay, setFixedDay] = useState(1);
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');

  // Hydrate the draft from the stored plan (or sensible defaults if none exists yet).
  useEffect(() => {
    if (existingPlan) {
      setName(existingPlan.name || 'Annual Appraisal');
      setStatus(existingPlan.status);
      setFixedMonth(existingPlan.fixedMonth || 1);
      setFixedDay(existingPlan.fixedDay || 1);
      setQuestions(
        existingPlan.annualAppraisalQuestions?.length
          ? existingPlan.annualAppraisalQuestions.map(q => ({ ...q }))
          : DEFAULT_QUESTIONS.map(q => ({ ...q }))
      );
    } else {
      setName('Annual Appraisal');
      setStatus('ACTIVE');
      setFixedMonth(1);
      setFixedDay(1);
      setQuestions(DEFAULT_QUESTIONS.map(q => ({ ...q })));
    }
  }, [existingPlan]);

  const totalWeight = useMemo(
    () => questions.reduce((s, q) => s + (Number(q.weight) || 0), 0),
    [questions]
  );

  const updateQuestion = (idx: number, patch: Partial<EvaluationQuestion>) => {
    setQuestions(qs => qs.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    setQuestions(qs => {
      const next = [...qs];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return qs;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const addQuestion = () => {
    setQuestions(qs => [...qs, { id: newQuestionId(), title: '', text: '', weight: 10 }]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions(qs => qs.filter((_, i) => i !== idx));
  };

  const distributeWeights = () => {
    if (questions.length === 0) return;
    const base = Math.floor(100 / questions.length);
    let remainder = 100 - base * questions.length;
    setQuestions(qs => qs.map(q => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      return { ...q, weight: base + extra };
    }));
  };

  const resetToDefaults = () => {
    setQuestions(DEFAULT_QUESTIONS.map(q => ({ ...q, id: newQuestionId() })));
  };

  const handleSave = async () => {
    setFormError('');
    if (!name.trim()) {
      setFormError('Give the appraisal a name.');
      return;
    }
    if (questions.length === 0) {
      setFormError('Add at least one appraisal question.');
      return;
    }
    if (questions.some(q => !q.text.trim())) {
      setFormError('Every question needs question text.');
      return;
    }
    if (isSaving) return;

    setIsSaving(true);
    try {
      const cleanedQuestions: EvaluationQuestion[] = questions.map((q, i) => ({
        id: q.id || newQuestionId(),
        title: (q.title || '').trim() || `Question ${i + 1}`,
        text: q.text.trim(),
        weight: Number(q.weight) || 0,
      }));

      const payload = {
        name: name.trim(),
        skillIds: ['annual-appraisal'],
        method: 'ANNUAL_APPRAISAL' as const,
        frequency: 'ANNUAL_FIXED_DATE' as const,
        fixedMonth,
        fixedDay,
        audience: 'ALL' as const,
        annualAppraisalQuestions: cleanedQuestions,
        status,
      };

      if (existingPlan) {
        await dataService.updateAssessmentPlan({ ...existingPlan, ...payload });
      } else {
        await dataService.addAssessmentPlan(payload);
      }

      setSuccessMessage('Annual appraisal saved.');
      setTimeout(() => setSuccessMessage(''), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const weightOk = totalWeight === 100;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="pb-6 border-b border-slate-300 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-sm flex items-center justify-center shrink-0">
            <ClipboardCheck size={24} />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Annual Appraisal</h2>
            <p className="text-slate-700 text-sm mt-1">Configure the company-wide yearly performance checklist used in the employee Appraisal page.</p>
          </div>
        </div>
      </div>

      {successMessage && (
        <div role="status" aria-live="polite" className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-sm flex items-center gap-3">
          <CheckCircle size={20} className="text-emerald-500" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      {formError && (
        <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-sm flex items-center gap-3">
          <AlertTriangle size={20} className="text-rose-500" />
          <p className="font-medium">{formError}</p>
        </div>
      )}

      {/* Plan settings */}
      <div className="bg-white border border-slate-300 p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Appraisal Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. 2026 Annual Performance Appraisal"
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-3"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Status</label>
            <div className="flex bg-slate-100 border border-slate-300 rounded-sm overflow-hidden p-1">
              {(['ACTIVE', 'INACTIVE'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`flex-1 py-2 px-4 text-sm font-bold transition-colors rounded-sm ${
                    status === s ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {s === 'ACTIVE' ? 'Active' : 'Inactive'}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">Only the active appraisal is shown to employees.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Due Month</label>
            <select
              value={fixedMonth}
              onChange={e => setFixedMonth(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-3"
            >
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Due Day</label>
            <input
              type="number"
              min={1}
              max={31}
              value={fixedDay}
              onChange={e => setFixedDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-3"
            />
          </div>
        </div>
      </div>

      {/* Questions */}
      <div className="bg-white border border-slate-300">
        <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Checklist Questions</h3>
            <p className="text-slate-500 text-xs font-medium mt-1">Each question is answered Yes / No and scored by its weight.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-sm border ${
              weightOk ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-700 bg-amber-50 border-amber-200'
            }`}>
              Total weight: {totalWeight}%{weightOk ? '' : ' (should be 100%)'}
            </span>
          </div>
        </div>

        <div className="p-6 space-y-3">
          {questions.length === 0 && (
            <p className="text-center text-slate-500 italic py-8">No questions yet — add one to get started.</p>
          )}
          {questions.map((q, idx) => (
            <div key={q.id} className="border border-slate-200 rounded-sm p-4 bg-white space-y-3">
              <div className="flex items-start gap-3">
                <span className="mt-2 text-sm font-black text-slate-400 w-6 shrink-0">{idx + 1}.</span>
                <div className="flex-1 space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={q.title || ''}
                      onChange={e => updateQuestion(idx, { title: e.target.value })}
                      placeholder="Short title (e.g. HSE Compliance)"
                      className="flex-1 bg-slate-50 border border-slate-300 text-slate-900 text-sm font-bold rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-2.5"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={q.weight ?? 0}
                        onChange={e => updateQuestion(idx, { weight: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                        className="w-20 bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-2.5 text-center"
                        aria-label={`Weight for question ${idx + 1}`}
                      />
                      <span className="text-sm font-bold text-slate-500">%</span>
                    </div>
                  </div>
                  <textarea
                    rows={2}
                    value={q.text}
                    onChange={e => updateQuestion(idx, { text: e.target.value })}
                    placeholder="Full question text shown to the evaluator..."
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-2.5"
                  />
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, -1)}
                    disabled={idx === 0}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move up"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, 1)}
                    disabled={idx === questions.length - 1}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Move down"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(idx)}
                    className="p-1.5 text-rose-400 hover:text-rose-700 hover:bg-rose-50 rounded-sm"
                    aria-label="Remove question"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button
              type="button"
              onClick={addQuestion}
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold py-2.5 px-4 rounded-sm transition-colors"
            >
              <Plus size={16} /> Add Question
            </button>
            <button
              type="button"
              onClick={distributeWeights}
              className="inline-flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold py-2.5 px-4 rounded-sm border border-slate-300 transition-colors"
            >
              Distribute weights evenly
            </button>
            <button
              type="button"
              onClick={resetToDefaults}
              className="inline-flex items-center gap-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-sm font-bold py-2.5 px-4 rounded-sm border border-slate-300 transition-colors"
            >
              <RotateCcw size={14} /> Reset to defaults
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2 pb-8">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-medium py-3 px-8 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save size={18} />
          {isSaving ? 'Saving...' : 'Save Appraisal'}
        </button>
      </div>
    </div>
  );
};
