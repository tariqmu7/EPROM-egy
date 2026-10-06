import React, { useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Plus, Clock, Ban, BookOpen, Send } from 'lucide-react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import {
  TrainingCourse, TRAINING_COURSE_TYPES, TRAINING_COURSE_TYPE_LABELS, PROFICIENCY_LABELS,
} from '../types';

// --- Required certificates, picked from the Training Catalogue ------------
// A skill level's required certificates used to be free text, so nothing tied
// "NEBOSH" on a skill to the NEBOSH course the training plans recommend. Now
// they are chosen from the catalogue. A course the catalogue does not have is
// REQUESTED from here with what it must cover; it goes to the admins as a
// PENDING course and is only recommended once approved.

interface Props {
  /** Course ids already required at this level. */
  courseIds: string[];
  /** Free-text names typed before the pick-list existed (no matching id). */
  legacyNames: string[];
  skillId: string;
  skillName: string;
  level: number;
  onChange: (courseIds: string[], names: string[]) => void;
}

const fieldClass = 'w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClass = 'block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1';

export const RequiredCoursePicker: React.FC<Props> = ({ courseIds, legacyNames, skillId, skillName, level, onChange }) => {
  const storeVersion = useStoreData();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [requestTitle, setRequestTitle] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // Everything not archived and not rejected can be picked — a pending request
  // can be required already; it just is not recommended until approved.
  const pickable = useMemo(
    () => dataService.getAllTrainingCourses(true).filter(c => !c.isArchived && c.status !== 'REJECTED'),
    [storeVersion],
  );
  const selected = courseIds
    .map(id => dataService.getTrainingCourse(id))
    .filter((c): c is TrainingCourse => !!c);

  const q = query.trim().toLowerCase();
  const matches = pickable
    .filter(c => !courseIds.includes(c.id))
    .filter(c => !q || [c.title, c.code, c.provider].some(v => v?.toLowerCase().includes(q)))
    .slice(0, 30);

  const emit = (ids: string[], names: string[]) => {
    const courseNames = ids.map(id => dataService.getTrainingCourse(id)?.title).filter(Boolean) as string[];
    onChange(ids, [...courseNames, ...names]);
  };

  const add = (course: TrainingCourse) => {
    // Picking a course for a typed name of the same title replaces the name.
    const rest = legacyNames.filter(n => n.toLowerCase() !== course.title.toLowerCase());
    emit([...courseIds, course.id], rest);
    setQuery('');
    setOpen(false);
  };
  const removeCourse = (id: string) => emit(courseIds.filter(x => x !== id), legacyNames);
  const removeName = (name: string) => emit(courseIds, legacyNames.filter(n => n !== name));

  return (
    <div ref={wrapperRef}>
      {(selected.length > 0 || legacyNames.length > 0) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selected.map(c => (
            <span key={c.id} className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs border ${c.status === 'PENDING' ? 'bg-amber-50 border-amber-300 text-amber-900' : c.status === 'REJECTED' ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-900'}`}
              title={c.status === 'REJECTED' && c.reviewNote ? `Request rejected: ${c.reviewNote}` : undefined}>
              <BookOpen size={12} />
              <span className="font-semibold">{c.title}</span>
              {c.code && <span className="text-[10px] opacity-70">{c.code}</span>}
              {c.status === 'PENDING' && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase"><Clock size={10} /> Awaiting approval</span>
              )}
              {c.status === 'REJECTED' && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase"><Ban size={10} /> Request rejected</span>
              )}
              <button type="button" aria-label={`Remove ${c.title}`} onClick={() => removeCourse(c.id)} className="ml-0.5 hover:text-red-600"><X size={12} /></button>
            </span>
          ))}
          {legacyNames.map(name => (
            <span key={name} className="inline-flex items-center gap-1.5 px-2 py-1 text-xs border border-slate-300 bg-slate-100 text-slate-700"
              title="Typed before the catalogue pick-list existed — not linked to any course">
              <Ban size={12} className="text-slate-400" />
              <span className="font-semibold">{name}</span>
              <span className="text-[10px] uppercase font-bold text-slate-500">Not in catalogue</span>
              <button type="button" onClick={() => setRequestTitle(name)} className="text-[10px] font-bold uppercase text-blue-700 hover:underline">Request it</button>
              <button type="button" aria-label={`Remove ${name}`} onClick={() => removeName(name)} className="hover:text-red-600"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className={`${fieldClass} pl-9`}
          placeholder="Search the training catalogue…"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          // Enter must pick, never submit the surrounding skill form.
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (matches[0]) add(matches[0]); }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        {open && (
          <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-300 shadow-lg max-h-72 overflow-y-auto">
            {matches.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">
                {q ? 'No course in the catalogue matches.' : 'Every catalogue course is already required here.'}
              </p>
            )}
            {matches.map(c => (
              <button key={c.id} type="button" onClick={() => add(c)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-900 truncate">{c.title}</span>
                  <span className="block text-[10px] text-slate-500">
                    {[c.code, c.provider, TRAINING_COURSE_TYPE_LABELS[c.type]].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {c.status === 'PENDING' && <span className="text-[10px] font-bold uppercase text-amber-700">Awaiting approval</span>}
              </button>
            ))}
            <button type="button" onClick={() => { setRequestTitle(query.trim()); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-2">
              <Plus size={14} /> Not found? Request a new course{q ? ` “${query.trim()}”` : ''}
            </button>
          </div>
        )}
      </div>

      {/* Portalled out of the skill <form>, so Enter in the request fields
          cannot submit the skill. */}
      {requestTitle !== null && createPortal(
        <CourseRequestModal
          initialTitle={requestTitle}
          skillId={skillId}
          skillName={skillName}
          level={level}
          onCancel={() => setRequestTitle(null)}
          onSent={course => {
            const rest = legacyNames.filter(n => n.toLowerCase() !== course.title.toLowerCase() && n !== requestTitle);
            emit([...courseIds, course.id], rest);
            setRequestTitle(null);
            setQuery('');
          }}
        />,
        document.body,
      )}
    </div>
  );
};

// --- The request form: what the course must cover, for the admin to approve
// and the training department to build the material from.
const CourseRequestModal: React.FC<{
  initialTitle: string; skillId: string; skillName: string; level: number;
  onCancel: () => void; onSent: (c: TrainingCourse) => void;
}> = ({ initialTitle, skillId, skillName, level, onCancel, onSent }) => {
  const [title, setTitle] = useState(initialTitle);
  const [type, setType] = useState<TrainingCourse['type']>('INTERNAL');
  const [provider, setProvider] = useState('');
  const [targetLevel, setTargetLevel] = useState<number>(level);
  const [hours, setHours] = useState('');
  const [syllabus, setSyllabus] = useState('');
  const [objectives, setObjectives] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const duplicate = dataService.getAllTrainingCourses(true)
    .find(c => !c.isArchived && c.title.trim().toLowerCase() === title.trim().toLowerCase());

  const send = async () => {
    if (!title.trim()) return setError('Give the course a title.');
    if (!syllabus.trim()) return setError('List what the course must cover — the training department builds the material from it.');
    if (duplicate) return setError(`"${duplicate.title}" is already in the catalogue — pick it from the list instead.`);
    const h = Number(hours);
    setSending(true);
    setError('');
    try {
      const course = await dataService.requestTrainingCourse({
        title: title.trim(),
        provider: provider.trim() || 'To be decided',
        type,
        linkedSkillIds: [skillId],
        targetLevel,
        ...(hours.trim() && Number.isFinite(h) && h > 0 ? { durationHours: h } : {}),
        syllabus: syllabus.trim(),
        ...(objectives.trim() ? { learningObjectives: objectives.trim() } : {}),
        ...(note.trim() ? { requestNote: note.trim() } : {}),
        requestedForSkillId: skillId,
      });
      onSent(course);
    } catch {
      setError('The request could not be sent. Check the connection and try again.');
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <h2 className="font-black text-slate-900 text-sm uppercase tracking-widest flex items-center gap-2">
            <Send size={16} className="text-slate-500" /> Request a new course
          </h2>
          <button type="button" onClick={onCancel} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-xs text-slate-600 bg-blue-50 border border-blue-100 px-3 py-2">
            For <strong>{skillName || 'this skill'}</strong>, Level {level}. The request goes to the administrators for approval.
            Until it is approved it is shown as <em>awaiting approval</em> and is not recommended in any training plan.
          </p>

          <div>
            <label className={labelClass}>Course title *</label>
            <input className={fieldClass} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. NEBOSH International General Certificate" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Delivery</label>
              <select className={fieldClass} value={type} onChange={e => setType(e.target.value as TrainingCourse['type'])}>
                {TRAINING_COURSE_TYPES.map(t => <option key={t} value={t}>{TRAINING_COURSE_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Provider (if known)</label>
              <input className={fieldClass} value={provider} onChange={e => setProvider(e.target.value)} placeholder="Left blank → To be decided" />
            </div>
            <div>
              <label className={labelClass}>Takes a delegate to</label>
              <select className={fieldClass} value={targetLevel} onChange={e => setTargetLevel(Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map(l => <option key={l} value={l}>L{l} — {PROFICIENCY_LABELS[l as 1 | 2 | 3 | 4 | 5]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Expected duration (hours)</label>
              <input className={fieldClass} type="number" min={0} step={0.5} value={hours} onChange={e => setHours(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>What it must cover (syllabus) *</label>
            <textarea className={fieldClass} rows={6} value={syllabus} onChange={e => setSyllabus(e.target.value)}
              placeholder={'One topic per line, e.g.\nHazard identification and risk assessment\nPermit-to-work system\nIncident reporting'} />
          </div>

          <div>
            <label className={labelClass}>Learning objectives</label>
            <textarea className={fieldClass} rows={3} value={objectives} onChange={e => setObjectives(e.target.value)}
              placeholder="What a delegate can do after the course" />
          </div>

          <div>
            <label className={labelClass}>Why it is needed</label>
            <textarea className={fieldClass} rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="Optional — e.g. required by the client contract, legal requirement" />
          </div>

          {duplicate && !error && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2">
              A course called “{duplicate.title}” already exists — pick it from the list instead of requesting it again.
            </p>
          )}
          {error && <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-5 py-2 text-slate-600 hover:bg-slate-100 font-bold uppercase tracking-wide text-xs">Cancel</button>
          <button type="button" onClick={send} disabled={sending}
            className="px-5 py-2 bg-blue-700 text-white font-bold uppercase tracking-wide text-xs hover:bg-blue-800 flex items-center gap-2 disabled:opacity-50">
            <Send size={14} /> {sending ? 'Sending…' : 'Send for approval'}
          </button>
        </div>
      </div>
    </div>
  );
};
