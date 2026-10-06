import React, { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { safeExportRow } from '../utils/fileUpload';
import {
  BookOpen, Plus, Search, Download, Pencil, Archive, RotateCcw, X, Save, Link2,
  AlertTriangle, FileSpreadsheet, Loader2, Inbox, Check, Ban, Clock,
  ClipboardList, CalendarDays, Trash2,
} from 'lucide-react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { useSessionState } from '../hooks/useSessionState';
import { BulkUpload } from '../components/BulkUpload';
import { newId } from '../utils/uuid';
import {
  User, Skill, TrainingCourse, TRAINING_COURSE_TYPES, TRAINING_COURSE_TYPE_LABELS,
  PROFICIENCY_LABELS, isCourseApproved, isCourseToPrepare,
  CourseMaterialStatus, CoursePreparation, CourseSession,
  COURSE_MATERIAL_STATUSES, COURSE_MATERIAL_STATUS_LABELS,
} from '../types';

// Every exported cell goes through `safeExportCell`: a value that begins with
// = + - @ is executed as a FORMULA when the file is opened in Excel or Sheets,
// on the recipient's machine. Skill names, course titles and notes are all free
// text somebody typed into this app, so the export is the injection point.
const addSafeRow = (ws: ExcelJS.Worksheet, values: unknown[]) => ws.addRow(safeExportRow(values));


/**
 * TRAINING CATALOGUE — the "cure" half of the analytical engine.
 *
 * A gap names a skill; without a catalogue the ITP could only say "intensive
 * training required". Every course here is linked to one or more skills, which
 * is what lets the ITP and the Training Needs Analysis name a real course.
 *
 * The counterpart figure to watch is "skills with no course": a required skill
 * that nobody can be sent anywhere for is a hole in the plan, not a solved gap.
 */

const TYPE_PILL: Record<TrainingCourse['type'], string> = {
  INTERNAL: 'bg-blue-50 text-blue-700 border-blue-200',
  EXTERNAL: 'bg-violet-50 text-violet-700 border-violet-200',
  OJT: 'bg-amber-50 text-amber-700 border-amber-200',
};

const emptyCourse = (): TrainingCourse => ({
  id: '',
  title: '',
  provider: '',
  type: 'INTERNAL',
  linkedSkillIds: [],
});

const userName = (id?: string) => (id && dataService.getAllUsers(true).find(u => u.id === id)?.name) || 'Unknown user';
const shortDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '—');

// ── The add/edit form ───────────────────────────────────────────────────────
// With `onDecide` it is the review screen for a course request: the admin can
// correct the content, then approve or reject it in the same step.

const CourseForm: React.FC<{
  initial: TrainingCourse;
  skills: Skill[];
  onSave: (c: TrainingCourse) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  onDecide?: (c: TrainingCourse, decision: 'APPROVED' | 'REJECTED', note: string) => void;
}> = ({ initial, skills, onSave, onCancel, isSubmitting, onDecide }) => {
  const [form, setForm] = useState<TrainingCourse>(initial);
  const [skillSearch, setSkillSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [decisionNote, setDecisionNote] = useState('');

  useEffect(() => { setForm(initial); }, [initial]);

  const patch = (p: Partial<TrainingCourse>) => setForm(prev => ({ ...prev, ...p }));

  const toggleSkill = (skillId: string) => patch({
    linkedSkillIds: form.linkedSkillIds.includes(skillId)
      ? form.linkedSkillIds.filter(id => id !== skillId)
      : [...form.linkedSkillIds, skillId],
  });

  const visibleSkills = useMemo(() => {
    const term = skillSearch.trim().toLowerCase();
    const list = [...skills].sort((a, b) => a.name.localeCompare(b.name));
    if (!term) return list;
    return list.filter(s =>
      s.name.toLowerCase().includes(term) ||
      (s.category || '').toLowerCase().includes(term) ||
      (s.code || '').toLowerCase().includes(term));
  }, [skills, skillSearch]);

  // Checks the content and returns the cleaned course, or null (error shown).
  const validated = (): TrainingCourse | null => {
    if (!form.title.trim()) { setError('A course needs a title.'); return null; }
    if (!form.provider.trim()) { setError('Name the provider — internal courses can use the department name.'); return null; }
    if (form.linkedSkillIds.length === 0) {
      setError('Link at least one skill, otherwise the course can never be recommended for a gap.');
      return null;
    }
    setError(null);
    return {
      ...form,
      title: form.title.trim(),
      provider: form.provider.trim(),
      code: form.code?.trim() || undefined,
      link: form.link?.trim() || undefined,
      description: form.description?.trim() || undefined,
      syllabus: form.syllabus?.trim() || undefined,
      learningObjectives: form.learningObjectives?.trim() || undefined,
    };
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const course = validated();
    if (course) onSave(course);
  };

  const decide = (decision: 'APPROVED' | 'REJECTED') => {
    if (!onDecide) return;
    if (decision === 'REJECTED') {
      if (!decisionNote.trim()) { setError('Write the reason for rejecting — the requester will read it.'); return; }
      setError(null);
      onDecide(form, decision, decisionNote.trim());
      return;
    }
    const course = validated();
    if (course) onDecide(course, decision, decisionNote.trim());
  };

  const isReview = !!onDecide;

  const numberOrUndefined = (raw: string) => {
    if (raw.trim() === '') return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="font-black text-slate-900 text-sm uppercase tracking-widest flex items-center gap-2">
            <BookOpen size={16} className="text-slate-500" />
            {isReview ? 'Review course request' : initial.id ? 'Edit course' : 'New course'}
          </h2>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {isReview && (
            <div className="bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900 space-y-1">
              <p className="font-black uppercase tracking-widest text-[10px] flex items-center gap-1.5">
                <Clock size={12} /> Requested by {userName(initial.requestedBy)} on {shortDate(initial.requestedAt)}
              </p>
              {initial.requestedForSkillId && (
                <p>For the skill <span className="font-bold">{skills.find(s => s.id === initial.requestedForSkillId)?.name || 'Deleted skill'}</span></p>
              )}
              {initial.requestNote && <p>Why it is needed: <span className="italic">{initial.requestNote}</span></p>}
              <p className="text-amber-800">
                Check and correct the content below, then approve it into the catalogue or reject it with a reason.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="tc-title" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Course title *</label>
              <input
                id="tc-title" value={form.title} onChange={e => patch({ title: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Basic Offshore Safety Induction (BOSIET)"
              />
            </div>

            <div>
              <label htmlFor="tc-provider" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Provider *</label>
              <input
                id="tc-provider" value={form.provider} onChange={e => patch({ provider: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. EPROM Training Centre"
              />
            </div>

            <div>
              <label htmlFor="tc-type" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Delivery</label>
              <select
                id="tc-type" value={form.type} onChange={e => patch({ type: e.target.value as TrainingCourse['type'] })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TRAINING_COURSE_TYPES.map(t => (
                  <option key={t} value={t}>{TRAINING_COURSE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tc-code" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Reference code</label>
              <input
                id="tc-code" value={form.code || ''} onChange={e => patch({ code: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Left blank → generated"
              />
            </div>

            <div>
              <label htmlFor="tc-target" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Takes a delegate to</label>
              <select
                id="tc-target" value={form.targetLevel ?? ''} onChange={e => patch({ targetLevel: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Not specified</option>
                {[1, 2, 3, 4, 5].map(l => (
                  <option key={l} value={l}>L{l} — {PROFICIENCY_LABELS[l as 1 | 2 | 3 | 4 | 5]}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tc-hours" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Duration (hours)</label>
              <input
                id="tc-hours" type="number" min={0} step={0.5} value={form.durationHours ?? ''}
                onChange={e => patch({ durationHours: numberOrUndefined(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="tc-cost" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Cost per seat (EGP)</label>
              <input
                id="tc-cost" type="number" min={0} step={100} value={form.costPerSeat ?? ''}
                onChange={e => patch({ costPerSeat: numberOrUndefined(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="tc-link" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Link</label>
              <input
                id="tc-link" value={form.link || ''} onChange={e => patch({ link: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://…  (course page, booking form, or the internal syllabus)"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="tc-desc" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">What it covers</label>
              <textarea
                id="tc-desc" rows={2} value={form.description || ''} onChange={e => patch({ description: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="tc-syllabus" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Syllabus — one topic per line</label>
              <textarea
                id="tc-syllabus" rows={4} value={form.syllabus || ''} onChange={e => patch({ syllabus: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="tc-objectives" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Learning objectives</label>
              <textarea
                id="tc-objectives" rows={4} value={form.learningObjectives || ''} onChange={e => patch({ learningObjectives: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Skill links — the whole point of the record */}
          <div className="border border-slate-200">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link2 size={14} className="text-slate-500" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                  Skills this course builds *
                </span>
                <span className="text-[10px] font-bold text-slate-400">{form.linkedSkillIds.length} selected</span>
              </div>
              <div className="flex items-center gap-2">
                <Search size={13} className="text-slate-400" />
                <input
                  value={skillSearch} onChange={e => setSkillSearch(e.target.value)}
                  placeholder="Find a skill…"
                  className="px-2 py-1.5 border border-slate-300 text-xs w-52 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
              {visibleSkills.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-500">
                  {skills.length === 0
                    ? 'No skills defined yet — create competency standards first.'
                    : 'No skill matches that search.'}
                </p>
              ) : visibleSkills.map(s => (
                <label key={s.id} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.linkedSkillIds.includes(s.id)}
                    onChange={() => toggleSkill(s.id)}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <span className="text-sm text-slate-800 flex-1">{s.name}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {s.code || s.category}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 p-3 flex items-start gap-2 text-rose-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          )}

          {isReview && (
            <div>
              <label htmlFor="tc-decision" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">
                Note to the requester (required when rejecting)
              </label>
              <textarea
                id="tc-decision" rows={2} value={decisionNote} onChange={e => setDecisionNote(e.target.value)}
                placeholder="e.g. Already covered by TRN-PTW-01 — use that course instead."
                className="w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3 pt-1">
            <button type="button" onClick={onCancel}
              className="px-4 py-2 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100">
              Cancel
            </button>
            {isReview && (
              <>
                <button type="button" disabled={isSubmitting} onClick={() => decide('REJECTED')}
                  className="px-5 py-2 border border-rose-300 text-rose-700 font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 disabled:opacity-40 flex items-center gap-2">
                  <Ban size={14} /> Reject
                </button>
                <button type="button" disabled={isSubmitting} onClick={() => decide('APPROVED')}
                  className="px-5 py-2 bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 disabled:opacity-40 flex items-center gap-2">
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve into catalogue
                </button>
              </>
            )}
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 disabled:opacity-40 flex items-center gap-2">
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {isReview ? 'Save, decide later' : initial.id ? 'Save changes' : 'Add course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Course requests — the admin's inbox ─────────────────────────────────────
// Courses asked for from the skill form. Pending ones wait here (oldest first)
// until an admin approves or rejects them; decided ones stay listed below as a
// record, and a rejected one can be reviewed again if the decision changes.

const RequestsList: React.FC<{
  pending: TrainingCourse[];
  decided: TrainingCourse[];
  skillName: (id: string) => string;
  onReview: (c: TrainingCourse) => void;
}> = ({ pending, decided, skillName, onReview }) => {
  const row = (c: TrainingCourse) => (
    <tr key={c.id} className="hover:bg-slate-50 transition-colors align-top">
      <td className="px-6 py-3">
        <p className="font-bold text-slate-900">{c.title}</p>
        <p className="text-[10px] text-slate-400 uppercase tracking-wide">
          {TRAINING_COURSE_TYPE_LABELS[c.type]}
          {c.targetLevel ? ` · to L${c.targetLevel}` : ''}
          {c.durationHours != null ? ` · ${c.durationHours} h` : ''}
        </p>
        {c.syllabus && (
          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">
            {c.syllabus.split('\n').filter(Boolean).join(' · ')}
          </p>
        )}
      </td>
      <td className="px-3 py-3 text-slate-700">
        {c.requestedForSkillId ? skillName(c.requestedForSkillId) : c.linkedSkillIds.map(skillName).join(', ') || '—'}
      </td>
      <td className="px-3 py-3 text-slate-700">
        <p>{userName(c.requestedBy)}</p>
        <p className="text-[10px] text-slate-400">{shortDate(c.requestedAt)}</p>
      </td>
      <td className="px-3 py-3">
        {c.status === 'PENDING' ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-amber-300 bg-amber-50 text-amber-800">
            <Clock size={10} /> Awaiting decision
          </span>
        ) : (
          <>
            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border ${
              c.status === 'REJECTED' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}>
              {c.status === 'REJECTED' ? 'Rejected' : 'Approved'}
            </span>
            <p className="text-[10px] text-slate-400 mt-1">{userName(c.reviewedBy)} · {shortDate(c.reviewedAt)}</p>
            {c.reviewNote && <p className="text-[11px] text-slate-600 mt-1 italic">{c.reviewNote}</p>}
          </>
        )}
      </td>
      <td className="px-6 py-3 text-right">
        {c.status !== 'APPROVED' && (
          <button
            onClick={() => onReview(c)}
            className="px-3 py-1.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-700"
          >
            {c.status === 'PENDING' ? 'Review' : 'Review again'}
          </button>
        )}
      </td>
    </tr>
  );

  const table = (rows: TrainingCourse[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
            <th className="text-left px-6 py-3">Requested course</th>
            <th className="text-left px-3 py-3">For skill</th>
            <th className="text-left px-3 py-3">Requested by</th>
            <th className="text-left px-3 py-3">Decision</th>
            <th className="text-right px-6 py-3">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{rows.map(row)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 shadow-sm">
        <div className="px-6 py-3 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600">
          Waiting for a decision ({pending.length})
        </div>
        {pending.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              No course requests waiting. New requests arrive from the skill form
              (Required Certificates → “Request new course”).
            </p>
          </div>
        ) : table(pending)}
      </div>

      {decided.length > 0 && (
        <div className="bg-white border border-slate-200 shadow-sm">
          <div className="px-6 py-3 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600">
            Decided requests ({decided.length})
          </div>
          {table(decided)}
        </div>
      )}
    </div>
  );
};

// ── Courses to prepare — the training department's follow-up ────────────────
// An approved request is a course that does not exist yet: somebody has to
// write the material and put sessions in the calendar. This list tracks that
// until the material is ready and a session is booked.

const MATERIAL_PILL: Record<CourseMaterialStatus, string> = {
  NOT_STARTED: 'border-slate-300 bg-slate-50 text-slate-600',
  IN_PREPARATION: 'border-blue-200 bg-blue-50 text-blue-700',
  READY: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const prepOf = (c: TrainingCourse): CoursePreparation =>
  c.preparation ?? { materialStatus: 'NOT_STARTED', sessions: [] };
const upcomingSessions = (c: TrainingCourse) =>
  (prepOf(c).sessions || []).filter(s => s.date >= todayIso());

const PreparationForm: React.FC<{
  course: TrainingCourse;
  skillName: (id: string) => string;
  onSave: (prep: CoursePreparation) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}> = ({ course, skillName, onSave, onCancel, isSubmitting }) => {
  const [prep, setPrep] = useState<CoursePreparation>(() => {
    const p = prepOf(course);
    return { ...p, sessions: [...(p.sessions || [])] };
  });
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<CoursePreparation>) => setPrep(prev => ({ ...prev, ...p }));
  const patchSession = (id: string, p: Partial<CourseSession>) =>
    patch({ sessions: prep.sessions.map(s => (s.id === id ? { ...s, ...p } : s)) });
  const addSession = () => patch({ sessions: [...prep.sessions, { id: newId(), date: '' }] });
  const removeSession = (id: string) => patch({ sessions: prep.sessions.filter(s => s.id !== id) });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prep.sessions.some(s => !s.date)) {
      setError('Every session needs a date — fill it in or remove the row.');
      return;
    }
    setError(null);
    onSave(prep);
  };

  const topics = (course.syllabus || '').split('\n').map(t => t.trim()).filter(Boolean);
  const field = 'w-full px-3 py-2 border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const label = 'block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="font-black text-slate-900 text-sm uppercase tracking-widest flex items-center gap-2">
            <ClipboardList size={16} className="text-slate-500" /> Prepare course
          </h2>
          <button onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* What has to be prepared — read-only, settled at approval */}
          <div className="bg-slate-50 border border-slate-200 p-4 text-xs text-slate-700 space-y-2">
            <p className="font-black text-sm text-slate-900">{course.title}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              {course.code || '—'} · {TRAINING_COURSE_TYPE_LABELS[course.type]} · {course.provider}
              {course.durationHours != null ? ` · ${course.durationHours} h` : ''}
              {course.targetLevel ? ` · to L${course.targetLevel}` : ''}
            </p>
            <p>For: <span className="font-bold">{course.linkedSkillIds.map(skillName).join(', ') || '—'}</span></p>
            {topics.length > 0 && (
              <div>
                <p className="font-bold mb-1">Syllabus</p>
                <ul className="list-disc pl-5 space-y-0.5">{topics.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            )}
            {course.learningObjectives && <p><span className="font-bold">Objectives:</span> {course.learningObjectives}</p>}
          </div>

          <div>
            <span className={label}>Material</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Material status">
              {COURSE_MATERIAL_STATUSES.map(s => (
                <button
                  key={s} type="button" role="radio" aria-checked={prep.materialStatus === s}
                  onClick={() => patch({ materialStatus: s })}
                  className={`px-4 py-2 border text-[10px] font-black uppercase tracking-widest transition-colors ${
                    prep.materialStatus === s ? MATERIAL_PILL[s] + ' ring-2 ring-offset-1 ring-slate-400' : 'border-slate-200 text-slate-400 hover:text-slate-700'
                  }`}
                >
                  {COURSE_MATERIAL_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prep-owner" className={label}>Prepared by</label>
              <input id="prep-owner" value={prep.owner || ''} onChange={e => patch({ owner: e.target.value })}
                className={field} placeholder="e.g. Eng. Ahmed — Training Dept." />
            </div>
            <div>
              <label htmlFor="prep-target" className={label}>Material ready by</label>
              <input id="prep-target" type="date" value={prep.targetDate || ''} onChange={e => patch({ targetDate: e.target.value || undefined })}
                className={field} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="prep-notes" className={label}>Notes</label>
              <textarea id="prep-notes" rows={2} value={prep.notes || ''} onChange={e => patch({ notes: e.target.value })}
                className={field} placeholder="e.g. Waiting for the vendor's slides; practical part needs the workshop." />
            </div>
          </div>

          {/* Sessions */}
          <div className="border border-slate-200">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-2">
                <CalendarDays size={14} className="text-slate-500" /> Sessions ({prep.sessions.length})
              </span>
              <button type="button" onClick={addSession}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 bg-white text-slate-700 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100">
                <Plus size={12} /> Add session
              </button>
            </div>
            {prep.sessions.length === 0 ? (
              <p className="p-6 text-center text-xs text-slate-500">No session scheduled yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {prep.sessions.map((s, i) => (
                  <div key={s.id} className="grid grid-cols-2 md:grid-cols-[9rem_1fr_1fr_5rem_auto] gap-2 p-3 items-end">
                    <div>
                      <label htmlFor={`ses-date-${s.id}`} className={label}>Date *</label>
                      <input id={`ses-date-${s.id}`} type="date" value={s.date} onChange={e => patchSession(s.id, { date: e.target.value })} className={field} />
                    </div>
                    <div>
                      <label htmlFor={`ses-venue-${s.id}`} className={label}>Venue</label>
                      <input id={`ses-venue-${s.id}`} value={s.venue || ''} onChange={e => patchSession(s.id, { venue: e.target.value })} className={field} />
                    </div>
                    <div>
                      <label htmlFor={`ses-trainer-${s.id}`} className={label}>Trainer</label>
                      <input id={`ses-trainer-${s.id}`} value={s.trainer || ''} onChange={e => patchSession(s.id, { trainer: e.target.value })} className={field} />
                    </div>
                    <div>
                      <label htmlFor={`ses-seats-${s.id}`} className={label}>Seats</label>
                      <input id={`ses-seats-${s.id}`} type="number" min={1} step={1} value={s.seats ?? ''}
                        onChange={e => patchSession(s.id, { seats: e.target.value === '' ? undefined : Number(e.target.value) })} className={field} />
                    </div>
                    <button type="button" onClick={() => removeSession(s.id)} title={`Remove session ${i + 1}`}
                      className="p-2 mb-0.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 justify-self-start">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 p-3 flex items-start gap-2 text-rose-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onCancel}
              className="px-4 py-2 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting}
              className="px-6 py-2 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 disabled:opacity-40 flex items-center gap-2">
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PreparationList: React.FC<{
  courses: TrainingCourse[];
  skillName: (id: string) => string;
  onOpen: (c: TrainingCourse) => void;
}> = ({ courses, skillName, onOpen }) => {
  const today = todayIso();
  const counts = COURSE_MATERIAL_STATUSES.map(s => [s, courses.filter(c => prepOf(c).materialStatus === s).length] as const);

  if (courses.length === 0) {
    return (
      <div className="bg-white border border-slate-200 shadow-sm p-12 text-center">
        <ClipboardList size={28} className="text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500">
          Nothing to prepare. A course appears here once a course request is approved.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {counts.map(([s, n]) => (
          <div key={s} className="bg-white border border-slate-200 shadow-sm p-4">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{COURSE_MATERIAL_STATUS_LABELS[s]}</div>
            <p className="text-3xl font-black text-slate-900 mt-2">{n}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
              <th className="text-left px-6 py-3">Course</th>
              <th className="text-left px-3 py-3">Material</th>
              <th className="text-left px-3 py-3">Prepared by</th>
              <th className="text-left px-3 py-3">Next session</th>
              <th className="text-right px-6 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map(c => {
              const p = prepOf(c);
              const upcoming = upcomingSessions(c);
              const next = upcoming[0];
              const late = p.materialStatus !== 'READY' && !!p.targetDate && p.targetDate < today;
              return (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors align-top">
                  <td className="px-6 py-3">
                    <p className="font-bold text-slate-900">{c.title}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                      {c.code || '—'} · {c.requestedForSkillId ? skillName(c.requestedForSkillId) : c.linkedSkillIds.map(skillName).join(', ')}
                    </p>
                    <p className="text-[10px] text-slate-400">Approved {shortDate(c.reviewedAt)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border ${MATERIAL_PILL[p.materialStatus]}`}>
                      {COURSE_MATERIAL_STATUS_LABELS[p.materialStatus]}
                    </span>
                    {p.targetDate && p.materialStatus !== 'READY' && (
                      <p className={`text-[10px] mt-1 ${late ? 'text-rose-700 font-bold' : 'text-slate-500'}`}>
                        {late ? 'Overdue — was due ' : 'Due '}{shortDate(p.targetDate)}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{p.owner || <span className="text-amber-700 italic text-xs">Nobody assigned</span>}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {next ? (
                      <>
                        <p className="font-bold">{shortDate(next.date)}</p>
                        <p className="text-[10px] text-slate-500">
                          {[next.venue, next.trainer, next.seats ? `${next.seats} seats` : ''].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {upcoming.length > 1 && <p className="text-[10px] text-slate-400">+{upcoming.length - 1} more</p>}
                      </>
                    ) : (
                      <span className="text-xs text-slate-400 italic">None scheduled</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => onOpen(c)}
                      className="px-3 py-1.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-700">
                      Follow up
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── The page ────────────────────────────────────────────────────────────────

export const TrainingCatalogue: React.FC<{ user: User }> = ({ user }) => {
  const storeVersion = useStoreData();
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useSessionState<string>('catalogue-type', 'ALL');
  const [showArchived, setShowArchived] = useSessionState<boolean>('catalogue-archived', false);
  const [view, setView] = useSessionState<'catalogue' | 'requests' | 'prepare'>('catalogue-view', 'catalogue');
  const [editing, setEditing] = useState<TrainingCourse | null>(null);
  const [reviewing, setReviewing] = useState<TrainingCourse | null>(null);
  const [preparing, setPreparing] = useState<TrainingCourse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [exporting, setExporting] = useState(false);

  const skills = useMemo(() => dataService.getAllSkills(), [storeVersion, refreshKey]);
  const allCourses = useMemo(
    () => dataService.getAllTrainingCourses(true),
    [storeVersion, refreshKey],
  );
  // The catalogue proper is approved courses only; requests (pending, or
  // rejected) live on their own tab until an admin decides.
  const courses = useMemo(() => allCourses.filter(isCourseApproved), [allCourses]);
  const pendingRequests = useMemo(
    () => allCourses
      .filter(c => c.status === 'PENDING' && !c.isArchived)
      .sort((a, b) => (a.requestedAt || '').localeCompare(b.requestedAt || '')),
    [allCourses],
  );
  const decidedRequests = useMemo(
    () => allCourses
      .filter(c => c.requestedAt && c.reviewedAt && c.status !== 'PENDING')
      .sort((a, b) => (b.reviewedAt || '').localeCompare(a.reviewedAt || '')),
    [allCourses],
  );
  // Not-ready first (not started, then in preparation), oldest approval first.
  const toPrepare = useMemo(() => {
    const rank = (c: TrainingCourse) => COURSE_MATERIAL_STATUSES.indexOf(c.preparation?.materialStatus ?? 'NOT_STARTED');
    return allCourses
      .filter(isCourseToPrepare)
      .sort((a, b) => rank(a) - rank(b) || (a.reviewedAt || '').localeCompare(b.reviewedAt || ''));
  }, [allCourses]);
  const notReadyCount = toPrepare.filter(c => c.preparation?.materialStatus !== 'READY').length;

  const skillName = (id: string) => skills.find(s => s.id === id)?.name || 'Deleted skill';

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return courses
      .filter(c => (showArchived ? true : !c.isArchived))
      .filter(c => (typeFilter === 'ALL' ? true : c.type === typeFilter))
      .filter(c => {
        if (!term) return true;
        return [c.title, c.provider, c.code, c.description].some(v => (v || '').toLowerCase().includes(term))
          || c.linkedSkillIds.some(id => skillName(id).toLowerCase().includes(term));
      })
      .sort((a, b) => Number(!!a.isArchived) - Number(!!b.isArchived) || a.title.localeCompare(b.title));
  }, [courses, search, typeFilter, showArchived, skills]);

  // How much of the competency library the catalogue actually covers. A skill
  // with no course is a gap nobody can be sent anywhere for.
  const coverage = useMemo(() => {
    const covered = new Set<string>();
    for (const c of courses) {
      if (c.isArchived) continue;
      for (const id of c.linkedSkillIds) covered.add(id);
    }
    const live = skills.filter(s => covered.has(s.id)).length;
    return {
      covered: live,
      total: skills.length,
      uncovered: skills.filter(s => !covered.has(s.id)),
      pct: skills.length > 0 ? Math.round((live / skills.length) * 100) : 0,
    };
  }, [courses, skills]);

  const handleSave = async (course: TrainingCourse) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (course.id) await dataService.updateTrainingCourse(course);
      else await dataService.addTrainingCourse(course);
      setEditing(null);
      setRefreshKey(k => k + 1);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecide = async (course: TrainingCourse, decision: 'APPROVED' | 'REJECTED', note: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await dataService.reviewTrainingCourseRequest(course, decision, note);
      setReviewing(null);
      setRefreshKey(k => k + 1);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'The decision could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSavePreparation = async (prep: CoursePreparation) => {
    if (isSubmitting || !preparing) return;
    setIsSubmitting(true);
    try {
      await dataService.updateCoursePreparation(preparing.id, prep);
      setPreparing(null);
      setRefreshKey(k => k + 1);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'The follow-up could not be saved.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRequest = async (course: TrainingCourse) => {
    await handleSave(course);
    setReviewing(null);
  };

  const handleArchive = async (course: TrainingCourse) => {
    const msg = `Archive "${course.title}"?\n\nIt stops being recommended for skill gaps. Past training plans that already reference it keep working, and you can restore it later.`;
    if (!window.confirm(msg)) return;
    await dataService.removeTrainingCourse(course.id);
    setRefreshKey(k => k + 1);
  };

  const handleRestore = async (course: TrainingCourse) => {
    await dataService.restoreTrainingCourse(course.id);
    setRefreshKey(k => k + 1);
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Training Catalogue');
      addSafeRow(ws, ['Training Catalogue']);
      addSafeRow(ws, ['Generated', new Date().toLocaleString()]);
      addSafeRow(ws, ['Courses', courses.filter(c => !c.isArchived).length]);
      addSafeRow(ws, ['Skills with at least one course', `${coverage.covered} of ${coverage.total}`]);
      addSafeRow(ws, []);
      addSafeRow(ws, [
        'Code', 'Title', 'Provider', 'Delivery', 'Target level', 'Duration (hours)',
        'Cost per seat (EGP)', 'Link', 'Skills', 'Status',
      ]);
      ws.getRow(1).font = { bold: true, size: 14 };
      ws.getRow(6).font = { bold: true };
      for (const c of visible) {
        addSafeRow(ws, [
          c.code || '', c.title, c.provider, TRAINING_COURSE_TYPE_LABELS[c.type],
          c.targetLevel ?? '', c.durationHours ?? '', c.costPerSeat ?? '', c.link || '',
          c.linkedSkillIds.map(skillName).join('; '),
          c.isArchived ? 'Archived' : 'Active',
        ]);
      }
      ws.columns.forEach(col => { col.width = 24; });
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `training_catalogue_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Catalogue export failed', err);
    } finally {
      setExporting(false);
    }
  };

  const activeCount = courses.filter(c => !c.isArchived).length;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <div className="bg-white border border-slate-200 shadow-sm p-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-slate-900 text-white flex items-center justify-center shrink-0">
            <BookOpen size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Training Catalogue</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              The courses the system may recommend. Each one is linked to the skills it builds — that
              link is what lets a training plan name a real course instead of “training required”.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
          >
            <FileSpreadsheet size={14} /> Bulk import
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting || visible.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 disabled:opacity-40 transition-all"
          >
            <Download size={14} /> {exporting ? 'Preparing…' : 'Export'}
          </button>
          <button
            onClick={() => setEditing(emptyCourse())}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all"
          >
            <Plus size={14} /> New course
          </button>
        </div>
      </div>

      {/* Catalogue / Requests switch */}
      <div className="flex border-b border-slate-200" role="tablist">
        {([
          ['catalogue', 'Catalogue', courses.filter(c => !c.isArchived).length],
          ['requests', 'Course requests', pendingRequests.length],
          ['prepare', 'To prepare', notReadyCount],
        ] as const).map(([id, label, count]) => (
          <button
            key={id}
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={`flex items-center gap-2 px-5 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 -mb-px transition-colors ${
              view === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {id === 'requests' && <Inbox size={14} />}
            {id === 'prepare' && <ClipboardList size={14} />}
            {label}
            <span className={`px-1.5 py-0.5 text-[10px] ${
              id === 'requests' && count > 0 ? 'bg-amber-500 text-white'
                : id === 'prepare' && count > 0 ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-500'
            }`}>{count}</span>
          </button>
        ))}
      </div>

      {view === 'prepare' ? (
        <PreparationList courses={toPrepare} skillName={skillName} onOpen={setPreparing} />
      ) : view === 'requests' ? (
        <RequestsList
          pending={pendingRequests}
          decided={decidedRequests}
          skillName={skillName}
          onReview={setReviewing}
        />
      ) : (<>
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Courses</div>
          <p className="text-3xl font-black text-slate-900 mt-2">{activeCount}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            {courses.length - activeCount} archived
          </p>
        </div>
        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Skills with a course</div>
          <p className="text-3xl font-black text-slate-900 mt-2">{coverage.pct}%</p>
          <div className="h-1.5 bg-slate-100 mt-2 overflow-hidden">
            <div className="h-full bg-blue-600" style={{ width: `${coverage.pct}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{coverage.covered} of {coverage.total} skills</p>
        </div>
        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <AlertTriangle size={12} className={coverage.uncovered.length > 0 ? 'text-amber-500' : ''} />
            No course yet
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{coverage.uncovered.length}</p>
          <p className="text-[10px] text-slate-500 mt-1">skills nobody can be sent on</p>
        </div>
        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Delivery mix</div>
          <div className="mt-2 space-y-1">
            {TRAINING_COURSE_TYPES.map(t => (
              <div key={t} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600">{TRAINING_COURSE_TYPE_LABELS[t]}</span>
                <span className="font-black text-slate-900">
                  {courses.filter(c => !c.isArchived && c.type === t).length}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Skills with no course — the hole in the plan */}
      {coverage.uncovered.length > 0 && skills.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <p className="font-bold uppercase tracking-wide text-[10px] mb-1">
              {coverage.uncovered.length} skill{coverage.uncovered.length === 1 ? '' : 's'} have no course
            </p>
            <p>
              A gap on these skills can be reported but not answered — the plan will fall back to a
              generic sentence. Missing:{' '}
              <span className="font-bold">
                {coverage.uncovered.slice(0, 8).map(s => s.name).join(', ')}
                {coverage.uncovered.length > 8 && ` … +${coverage.uncovered.length - 8} more`}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-4">
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          aria-label="Filter by delivery"
          className="px-3 py-2 border border-slate-300 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">All delivery types</option>
          {TRAINING_COURSE_TYPES.map(t => (
            <option key={t} value={t}>{TRAINING_COURSE_TYPE_LABELS[t]}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
          <input
            type="checkbox" checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
            className="w-4 h-4 accent-slate-900"
          />
          Show archived
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <Search size={14} className="text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title, provider or skill…"
            className="px-3 py-2 border border-slate-300 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* The table */}
      <div className="bg-white border border-slate-200 shadow-sm">
        {visible.length === 0 ? (
          <div className="p-12 text-center">
            <BookOpen size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">
              {courses.length === 0
                ? 'The catalogue is empty. Add a course, or import a list from Excel.'
                : 'No course matches these filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <th className="text-left px-6 py-3">Course</th>
                  <th className="text-left px-3 py-3">Provider</th>
                  <th className="text-center px-3 py-3">Delivery</th>
                  <th className="text-left px-3 py-3">Skills it builds</th>
                  <th className="text-right px-3 py-3">Hours</th>
                  <th className="text-right px-3 py-3">Cost / seat</th>
                  <th className="text-right px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(c => (
                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${c.isArchived ? 'opacity-60' : ''}`}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{c.title}</p>
                        {c.isArchived && (
                          <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border border-slate-300 text-slate-500">
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                        {c.code || '—'}
                        {c.targetLevel ? ` · to L${c.targetLevel}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{c.provider}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-block px-2 py-1 border text-[9px] font-black uppercase tracking-widest ${TYPE_PILL[c.type]}`}>
                        {TRAINING_COURSE_TYPE_LABELS[c.type]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {c.linkedSkillIds.length === 0 ? (
                        <span className="text-[10px] italic text-amber-600">No skill linked</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {c.linkedSkillIds.slice(0, 3).map(id => (
                            <span key={id} className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 border border-slate-200">
                              {skillName(id)}
                            </span>
                          ))}
                          {c.linkedSkillIds.length > 3 && (
                            <span className="text-[10px] text-slate-400">+{c.linkedSkillIds.length - 3}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">{c.durationHours ?? '—'}</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">
                      {c.costPerSeat != null ? c.costPerSeat.toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditing(c)}
                          title="Edit course"
                          className="p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        {c.isArchived ? (
                          <button
                            onClick={() => handleRestore(c)}
                            title="Restore course"
                            className="p-2 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          >
                            <RotateCcw size={14} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleArchive(c)}
                            title="Archive course"
                            className="p-2 text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                          >
                            <Archive size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {reviewing && (
        <CourseForm
          initial={reviewing}
          skills={skills}
          onSave={handleSaveRequest}
          onDecide={handleDecide}
          onCancel={() => setReviewing(null)}
          isSubmitting={isSubmitting}
        />
      )}

      {preparing && (
        <PreparationForm
          course={preparing}
          skillName={skillName}
          onSave={handleSavePreparation}
          onCancel={() => setPreparing(null)}
          isSubmitting={isSubmitting}
        />
      )}

      {editing && (
        <CourseForm
          initial={editing}
          skills={skills}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          isSubmitting={isSubmitting}
        />
      )}

      {showBulk && (
        <BulkUpload
          type="COURSE"
          user={user}
          onComplete={() => { setShowBulk(false); setRefreshKey(k => k + 1); }}
          onCancel={() => setShowBulk(false)}
        />
      )}
    </div>
  );
};
