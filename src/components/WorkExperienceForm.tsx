import React, { useMemo, useState } from 'react';
import { Plus, Trash2, X, Sparkles, Info } from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';
import { dataService } from '../services/store';
import {
  WorkExperience,
  WorkExperienceSkill,
  EmploymentType,
  EMPLOYMENT_TYPE_LABELS,
  PROFICIENCY_LABELS,
} from '../types';

/**
 * Add/edit an external work-experience record and tag the skills it exercised.
 *
 * The skill tagger is the whole point of the feature: for each skill the
 * employee says how long they applied it, the band table proposes a level, and
 * the employee records what they claim. The verifying manager sees both and sets
 * the final level — nothing here writes a score.
 */

interface Props {
  userId: string;
  initial?: WorkExperience | null;
  onSaved: () => void;
  onCancel: () => void;
}

type DraftSkill = WorkExperienceSkill & { _key: string };

// Square, slate-50 fields + uppercase micro-labels: the same form language as the
// Certificates tab, so the two employee-submitted flows look like one system.
const inputCls =
  'w-full border border-slate-300 p-2 text-sm bg-slate-50 outline-none focus:ring-0 focus:border-blue-500 disabled:opacity-40';
const labelCls = 'block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1';

export const WorkExperienceForm: React.FC<Props> = ({ userId, initial, onSaved, onCancel }) => {
  const [employer, setEmployer] = useState(initial?.employer || '');
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle || '');
  const [employmentType, setEmploymentType] = useState<EmploymentType | ''>(initial?.employmentType || '');
  const [location, setLocation] = useState(initial?.location || '');
  const [startDate, setStartDate] = useState(initial?.startDate || '');
  const [endDate, setEndDate] = useState(initial?.endDate || '');
  const [isCurrent, setIsCurrent] = useState(!!initial?.isCurrent);
  const [responsibilities, setResponsibilities] = useState(initial?.responsibilities || '');
  const [skills, setSkills] = useState<DraftSkill[]>(
    () => (initial?.skills || []).map((s, i) => ({ ...s, _key: `${s.skillId}-${i}` })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const policy = dataService.getWorkExperiencePolicy();
  const allSkills = useMemo(() => dataService.getAllSkills(), []);
  const skillOptions = useMemo(
    () => allSkills
      .filter(s => !skills.some(sel => sel.skillId === s.id))
      .map(s => ({ value: s.id, label: s.name, subLabel: s.category })),
    [allSkills, skills],
  );

  const addSkill = (skillId: string) => {
    if (!skillId || skills.some(s => s.skillId === skillId)) return;
    setSkills(prev => [
      ...prev,
      { _key: `${skillId}-${Date.now()}`, skillId, claimedLevel: 3, yearsApplied: 1 },
    ]);
  };

  const patchSkill = (key: string, patch: Partial<WorkExperienceSkill>) => {
    setSkills(prev => prev.map(s => (s._key === key ? { ...s, ...patch } : s)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!employer.trim()) return setError('Employer is required.');
    if (!jobTitle.trim()) return setError('Job title is required.');
    if (!startDate) return setError('Start date is required.');
    if (!isCurrent && !endDate) return setError('Add an end date, or tick "I still work here".');
    if (!isCurrent && endDate < startDate) return setError('End date cannot be before the start date.');
    if (skills.some(s => !Number.isFinite(s.yearsApplied) || s.yearsApplied <= 0)) {
      return setError('Each tagged skill needs a positive number of years.');
    }
    setError(null);
    setIsSaving(true);

    const payload = {
      userId,
      employer: employer.trim(),
      jobTitle: jobTitle.trim(),
      employmentType: employmentType || undefined,
      location: location.trim() || undefined,
      startDate,
      endDate: isCurrent ? undefined : endDate,
      isCurrent,
      responsibilities: responsibilities.trim() || undefined,
      skills: skills.map(({ _key, ...s }) => s),
    };

    try {
      if (initial) {
        await dataService.updateWorkExperience(initial.id, payload);
      } else {
        await dataService.addWorkExperience(payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {initial && initial.status !== 'PENDING' && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <Info className="w-4 h-4 shrink-0 mt-px" />
          <span>
            This record was already {initial.status.toLowerCase()}. Saving changes returns it to
            <strong> Awaiting Verification</strong> and clears the previous levels.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelCls} htmlFor="we-employer">Employer *</label>
          <input id="we-employer" className={inputCls} value={employer} onChange={e => setEmployer(e.target.value)} placeholder="e.g. Petrojet" />
        </div>
        <div>
          <label className={labelCls} htmlFor="we-title">Job Title *</label>
          <input id="we-title" className={inputCls} value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Senior Mechanical Technician" />
        </div>
        <div>
          <label className={labelCls} htmlFor="we-type">Employment Type</label>
          <select id="we-type" className={inputCls} value={employmentType} onChange={e => setEmploymentType(e.target.value as EmploymentType | '')}>
            <option value="">— Select —</option>
            {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map(t => (
              <option key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="we-location">Location</label>
          <input id="we-location" className={inputCls} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Cairo, Egypt" />
        </div>
        <div>
          <label className={labelCls} htmlFor="we-start">Start Date *</label>
          <input id="we-start" type="date" className={inputCls} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="we-end">End Date</label>
          <input id="we-end" type="date" className={inputCls} value={endDate} onChange={e => setEndDate(e.target.value)} disabled={isCurrent} />
          <label className="flex items-center gap-2 mt-2 text-xs text-slate-600">
            <input type="checkbox" checked={isCurrent} onChange={e => { setIsCurrent(e.target.checked); if (e.target.checked) setEndDate(''); }} />
            I still work here
          </label>
        </div>
      </div>

      <div>
        <label className={labelCls} htmlFor="we-resp">Key Responsibilities</label>
        <textarea id="we-resp" rows={3} className={inputCls} value={responsibilities} onChange={e => setResponsibilities(e.target.value)} placeholder="What you were accountable for in this role." />
      </div>

      {/* ── Skill tagging ─────────────────────────────────────────────────── */}
      <div className="pt-4 border-t border-slate-200">
        <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Skills Used in This Role</h4>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          Tag the competencies this role exercised. Your manager reviews each one and sets the final level.
          {policy.enabled
            ? ` Verified skills can count towards your profile up to Level ${policy.maxProvisionalLevel}, until a formal assessment replaces them.`
            : ' Experience-based levels are currently disabled by your administrator, so these are recorded for reference only.'}
        </p>

        <div className="mb-3">
          <SearchableSelect
            options={skillOptions}
            value=""
            onChange={addSkill}
            placeholder="Search the competency catalog to add a skill…"
          />
        </div>

        {skills.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-3">No skills tagged yet.</p>
        ) : (
          <div className="space-y-2">
            {skills.map(s => {
              const skill = allSkills.find(x => x.id === s.skillId);
              const suggested = dataService.suggestExperienceLevel(s.yearsApplied);
              return (
                <div key={s._key} className="p-3 bg-slate-50 border border-slate-200">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 break-words">{skill?.name || 'Unknown skill'}</p>
                      {skill?.category && <p className="text-[11px] text-slate-400">{skill.category}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSkills(prev => prev.filter(x => x._key !== s._key))}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                      aria-label={`Remove ${skill?.name || 'skill'}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className={labelCls}>Years applied</label>
                      <input
                        type="number" min={0} step={0.5}
                        className="w-full border border-slate-300 p-2 text-sm bg-white outline-none focus:ring-0 focus:border-blue-500"
                        value={s.yearsApplied}
                        onChange={e => patchSkill(s._key, { yearsApplied: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Your proficiency</label>
                      <select
                        className="w-full border border-slate-300 p-2 text-sm bg-white outline-none focus:ring-0 focus:border-blue-500"
                        value={s.claimedLevel}
                        onChange={e => patchSkill(s._key, { claimedLevel: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4, 5].map(l => (
                          <option key={l} value={l}>L{l} — {PROFICIENCY_LABELS[l]}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {suggested > 0 && (
                    <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1">
                      <Sparkles className="w-3 h-3" />
                      {s.yearsApplied} yrs suggests <strong>L{suggested} — {PROFICIENCY_LABELS[suggested]}</strong>
                      {suggested > policy.maxProvisionalLevel && ` (counts as L${policy.maxProvisionalLevel} until assessed)`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2">{error}</p>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-slate-200">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-slate-300 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 inline-flex items-center gap-1.5">
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
        <button type="submit" disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          {isSaving ? 'Saving…' : initial ? 'Save & Resubmit' : 'Submit for Verification'}
        </button>
      </div>
    </form>
  );
};

export default WorkExperienceForm;
