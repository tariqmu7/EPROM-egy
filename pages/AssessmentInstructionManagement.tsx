import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus, Edit2, Trash2, X, Save, ClipboardCheck, ShieldAlert, CheckCircle,
  AlertTriangle, Link2, MessageSquare
} from 'lucide-react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { SearchableSelect } from '../components/SearchableSelect';
import {
  AssessmentInstruction, AssessmentMethod, EvaluationQuestion,
  ASSESSMENT_METHOD_LABELS
} from '../types';

const METHOD_OPTIONS = (Object.keys(ASSESSMENT_METHOD_LABELS) as AssessmentMethod[])
  .map(v => ({ value: v, label: ASSESSMENT_METHOD_LABELS[v] }));

type InstructionDraft = Omit<AssessmentInstruction, 'id' | 'createdAt' | 'updatedAt'>;

const emptyDraft = (): InstructionDraft => ({
  name: '',
  description: '',
  method: 'OJT_OBSERVATION',
  assessmentQuestion: '',
  assessmentLink: '',
  evaluationQuestions: [],
  interviewQuestions: [],
  threeSixtyQuestions: [],
  annualAppraisalQuestions: [],
  status: 'ACTIVE'
});

// --- Reusable question-bank editor (same shape as the old Skill form) ---
const QuestionManager: React.FC<{
  title: string;
  questions: EvaluationQuestion[];
  onChange: (questions: EvaluationQuestion[]) => void;
  placeholder?: string;
}> = ({ title, questions, onChange, placeholder }) => {
  const addQuestion = () =>
    onChange([...questions, { id: Math.random().toString(36).substr(2, 9), text: '', expectedCriteria: '', weight: 10 }]);
  const removeQuestion = (id: string) => onChange(questions.filter(q => q.id !== id));
  const updateQuestion = (id: string, field: keyof EvaluationQuestion, value: any) =>
    onChange(questions.map(q => q.id === id ? { ...q, [field]: value } : q));

  const totalWeight = questions.reduce((s, q) => s + (q.weight ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{title}</h5>
        <div className="flex items-center gap-3">
          {questions.length > 0 && (
            <span className={`text-xs font-bold px-2 py-1 rounded-sm border ${totalWeight === 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              Total weight: {totalWeight}%
            </span>
          )}
          <button type="button" onClick={addQuestion} className="flex items-center gap-1 text-blue-700 hover:text-blue-800 text-xs font-bold uppercase tracking-wide">
            <Plus size={14} /> Add Question
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {questions.length === 0 ? (
          <div className="text-xs text-slate-500 italic p-4 border border-dashed border-slate-300 rounded-sm bg-slate-50/50 text-center">
            No questions added yet. Click "Add Question" to start.
          </div>
        ) : (
          questions.map((q, idx) => (
            <div key={q.id} className="p-4 bg-white border border-slate-300 rounded-sm space-y-3 relative group">
              <button type="button" onClick={() => removeQuestion(q.id)} className="absolute top-2 right-2 text-slate-400 hover:text-red-600 transition-colors">
                <Trash2 size={14} />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-3">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Question {idx + 1}</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all"
                    value={q.text}
                    onChange={e => updateQuestion(q.id, 'text', e.target.value)}
                    placeholder={placeholder || 'Enter question text...'}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Weight (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all"
                    value={q.weight ?? 10}
                    onChange={e => updateQuestion(q.id, 'weight', Number(e.target.value))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Expected Criteria / Answer Key</label>
                <textarea
                  className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none transition-all"
                  rows={1}
                  value={q.expectedCriteria}
                  onChange={e => updateQuestion(q.id, 'expectedCriteria', e.target.value)}
                  placeholder="What defines a successful answer?"
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export const AssessmentInstructionManagement: React.FC = () => {
  const storeVersion = useStoreData();
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InstructionDraft>(emptyDraft());
  const [isProcessing, setIsProcessing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');

  // Admin-only screen → safe place to run the one-time legacy migration.
  useEffect(() => { dataService.migrateSkillsToInstructions(); }, []);

  const instructions = useMemo(() => dataService.getAllAssessmentInstructions(), [storeVersion]);
  const skills = useMemo(() => dataService.getAllSkills(), [storeVersion]);

  const skillsUsing = (id: string) =>
    skills.filter(s => (s.assessmentInstructionIds || []).includes(id));

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

  const startEdit = (instruction: AssessmentInstruction) => {
    const { id, createdAt, updatedAt, ...rest } = instruction;
    setDraft({
      ...emptyDraft(),
      ...rest,
      evaluationQuestions: rest.evaluationQuestions || [],
      interviewQuestions: rest.interviewQuestions || [],
      threeSixtyQuestions: rest.threeSixtyQuestions || [],
      annualAppraisalQuestions: rest.annualAppraisalQuestions || []
    });
    setEditingId(id);
    setFormError('');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) { setFormError('Instruction name is required.'); return; }

    // Only keep the question bank / link relevant to the chosen method.
    const payload: InstructionDraft = {
      ...draft,
      name: draft.name.trim(),
      assessmentQuestion: draft.assessmentQuestion?.trim() || '',
      assessmentLink: draft.method === 'WRITTEN_EXAM' ? (draft.assessmentLink || '') : '',
      evaluationQuestions: draft.method === 'WRITTEN_EXAM' ? (draft.evaluationQuestions || []) : [],
      interviewQuestions: draft.method === 'INTERVIEW' ? (draft.interviewQuestions || []) : [],
      threeSixtyQuestions: draft.method === 'THREE_SIXTY_EVALUATION' ? (draft.threeSixtyQuestions || []) : [],
      annualAppraisalQuestions: draft.method === 'ANNUAL_APPRAISAL' ? (draft.annualAppraisalQuestions || []) : []
    };

    setIsProcessing(true);
    try {
      if (editingId) {
        const existing = dataService.getAssessmentInstruction(editingId);
        if (!existing) throw new Error('Instruction no longer exists');
        await dataService.updateAssessmentInstruction({ ...existing, ...payload });
        flash('Assessment instruction updated successfully.');
      } else {
        await dataService.addAssessmentInstruction(payload);
        flash('Assessment instruction created successfully.');
      }
      setIsEditing(false);
      setEditingId(null);
    } catch (e) {
      console.error(e);
      setFormError('Failed to save the instruction. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (instruction: AssessmentInstruction) => {
    const using = skillsUsing(instruction.id);
    const warn = using.length > 0
      ? `\n\n${using.length} skill(s) currently use it and will be detached (revert to default OJT/360 scoring).`
      : '';
    if (!window.confirm(`Delete the assessment instruction "${instruction.name}"?${warn}`)) return;
    setIsProcessing(true);
    try {
      await dataService.deleteAssessmentInstruction(instruction.id);
      flash('Assessment instruction deleted.');
    } catch (e) {
      console.error(e);
      alert('Failed to delete the instruction.');
    } finally {
      setIsProcessing(false);
    }
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
                {editingId ? 'Edit Assessment Instruction' : 'New Assessment Instruction'}
              </h2>
              <p className="text-slate-700 text-sm mt-1">Define a method and its questions, then assign it to skills from the Skill form.</p>
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
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Instruction Name</label>
              <input
                value={draft.name}
                onChange={e => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Safety 360° Evaluation"
                className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-none focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Status</label>
              <SearchableSelect
                options={[{ value: 'ACTIVE', label: 'Active (usable by skills)' }, { value: 'INACTIVE', label: 'Inactive (hidden / paused)' }]}
                value={draft.status}
                onChange={val => setDraft({ ...draft, status: val as 'ACTIVE' | 'INACTIVE' })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Description (Optional)</label>
              <input
                value={draft.description || ''}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
                placeholder="Purpose / notes for this instruction"
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
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Assessment Question / Prompt</label>
              <input
                value={draft.assessmentQuestion || ''}
                onChange={e => setDraft({ ...draft, assessmentQuestion: e.target.value })}
                placeholder="e.g. How effectively does the employee..."
                className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-none focus:ring-2 focus:ring-slate-900 outline-none"
              />
            </div>
          </div>

          {draft.method === 'WRITTEN_EXAM' && (
            <div className="space-y-6 bg-slate-50 p-6 border border-slate-200 rounded-sm">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex justify-between items-center">
                  <span>Online Assessment Link (Optional)</span>
                  <span className="text-slate-400 text-[10px] lowercase">Google Form, Microsoft Forms, etc.</span>
                </label>
                <input
                  type="url"
                  className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm focus:ring-2 focus:ring-slate-900 outline-none"
                  placeholder="https://docs.google.com/forms/..."
                  value={draft.assessmentLink || ''}
                  onChange={e => setDraft({ ...draft, assessmentLink: e.target.value })}
                />
              </div>
              <QuestionManager
                title="Internal Online Test Questions"
                questions={draft.evaluationQuestions || []}
                onChange={qs => setDraft({ ...draft, evaluationQuestions: qs })}
                placeholder="Enter test question..."
              />
            </div>
          )}

          {draft.method === 'INTERVIEW' && (
            <div className="bg-slate-50 p-6 border border-slate-200 rounded-sm">
              <QuestionManager
                title="Standardized Interview Questions"
                questions={draft.interviewQuestions || []}
                onChange={qs => setDraft({ ...draft, interviewQuestions: qs })}
                placeholder="Enter technical interview question..."
              />
            </div>
          )}

          {draft.method === 'THREE_SIXTY_EVALUATION' && (
            <div className="bg-slate-50 p-6 border border-slate-200 rounded-sm">
              <QuestionManager
                title="360° Feedback Questions"
                questions={draft.threeSixtyQuestions || []}
                onChange={qs => setDraft({ ...draft, threeSixtyQuestions: qs })}
                placeholder="Enter feedback question for colleagues..."
              />
            </div>
          )}

          {draft.method === 'ANNUAL_APPRAISAL' && (
            <div className="space-y-4 bg-slate-50 p-6 border border-slate-200 rounded-sm">
              <div className="flex justify-between items-center">
                <div>
                  <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Annual Appraisal Checklist Items</h5>
                  <p className="text-[11px] text-slate-500 mt-0.5">Weights should sum to 100. Each item is a yes/no checkbox during appraisal.</p>
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const total = (draft.annualAppraisalQuestions || []).reduce((s, q) => s + (q.weight ?? 10), 0);
                    return (
                      <span className={`text-xs font-bold px-2 py-1 rounded-sm border ${total === 100 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                        Total weight: {total}%
                      </span>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, annualAppraisalQuestions: [...(draft.annualAppraisalQuestions || []), { id: Math.random().toString(36).substr(2, 9), title: '', text: '', weight: 10 }] })}
                    className="flex items-center gap-1 text-blue-700 hover:text-blue-800 text-xs font-bold uppercase tracking-wide"
                  >
                    <Plus size={14} /> Add Item
                  </button>
                </div>
              </div>
              {(draft.annualAppraisalQuestions || []).length === 0 ? (
                <div className="text-xs text-slate-500 italic p-4 border border-dashed border-slate-300 rounded-sm bg-white text-center">
                  No checklist items yet. Click "Add Item" to start.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {(draft.annualAppraisalQuestions || []).map((q, idx) => (
                    <div key={q.id} className="p-4 bg-white border border-slate-300 rounded-sm space-y-3 relative group">
                      <button
                        type="button"
                        onClick={() => setDraft({ ...draft, annualAppraisalQuestions: (draft.annualAppraisalQuestions || []).filter(x => x.id !== q.id) })}
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Label / Title</label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none"
                            value={q.title || ''}
                            onChange={e => setDraft({ ...draft, annualAppraisalQuestions: (draft.annualAppraisalQuestions || []).map(x => x.id === q.id ? { ...x, title: e.target.value } : x) })}
                            placeholder={`Item ${idx + 1}`}
                          />
                        </div>
                        <div className="md:col-span-1">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Checklist Statement</label>
                          <input
                            type="text"
                            className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none"
                            value={q.text}
                            onChange={e => setDraft({ ...draft, annualAppraisalQuestions: (draft.annualAppraisalQuestions || []).map(x => x.id === q.id ? { ...x, text: e.target.value } : x) })}
                            placeholder="Employee demonstrates..."
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Weight (%)</label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            className="w-full px-3 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-sm focus:ring-1 focus:ring-slate-900 outline-none"
                            value={q.weight ?? 10}
                            onChange={e => setDraft({ ...draft, annualAppraisalQuestions: (draft.annualAppraisalQuestions || []).map(x => x.id === q.id ? { ...x, weight: Number(e.target.value) } : x) })}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
            <Save size={16} /> {isProcessing ? 'Saving...' : 'Save Instruction'}
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
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Assessment Instructions</h2>
          <p className="text-slate-700 text-sm mt-1">
            Reusable assessment methods &amp; question banks. Assign them to skills from the Skill form.
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
          <Plus size={16} /> New Assessment Instruction
        </button>
      </div>

      {instructions.length === 0 ? (
        <div className="bg-white border border-slate-300 rounded-none p-16 text-center">
          <ClipboardCheck size={40} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-800">No assessment instructions yet</h3>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            Skills without an instruction are scored as 360° / OJT by default.
          </p>
          <button
            onClick={startCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-none text-sm font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus size={16} /> Create the first instruction
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-300 rounded-none overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="p-4">Instruction</th>
                <th className="p-4">Method</th>
                <th className="p-4">Question / Prompt</th>
                <th className="p-4">Skills</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {instructions.map(instruction => {
                const using = skillsUsing(instruction.id);
                return (
                  <tr key={instruction.id} className="hover:bg-slate-50/60">
                    <td className="p-4">
                      <div className="font-bold text-slate-900">{instruction.name}</div>
                      {instruction.description && <div className="text-xs text-slate-500 mt-0.5">{instruction.description}</div>}
                    </td>
                    <td className="p-4 text-slate-700">{ASSESSMENT_METHOD_LABELS[instruction.method]}</td>
                    <td className="p-4 text-slate-700">
                      {instruction.assessmentQuestion ? (
                        <span className="inline-flex items-center gap-1.5">
                          <MessageSquare size={13} className="text-slate-400" />
                          <span className="truncate max-w-xs inline-block align-bottom">{instruction.assessmentQuestion}</span>
                        </span>
                      ) : instruction.assessmentLink ? (
                        <span className="inline-flex items-center gap-1.5 text-blue-700">
                          <Link2 size={13} /> External link
                        </span>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="p-4">
                      <span className="text-slate-700" title={using.map(s => s.name).join(', ')}>
                        {using.length} skill{using.length === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-none border ${
                        instruction.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {instruction.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(instruction)}
                          className="p-2 rounded-none border border-slate-200 text-slate-600 hover:bg-slate-900 hover:text-white transition-colors"
                          title="Edit instruction"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(instruction)}
                          disabled={isProcessing}
                          className="p-2 rounded-none border border-red-200 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
                          title="Delete instruction"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
