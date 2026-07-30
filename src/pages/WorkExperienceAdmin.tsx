import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Briefcase, Plus, Trash2, Save, AlertTriangle, CheckCircle, Info, Search,
} from 'lucide-react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { useSessionState } from '../hooks/useSessionState';
import {
  ExperienceLevelBand,
  WorkExperienceStatus,
  WORK_EXPERIENCE_STATUS_LABELS,
  PROFICIENCY_LABELS,
} from '../types';
import { validateBands } from '../constants/experiencePolicy';

/**
 * Admin surface for the experience→competency translation:
 *   1. The policy editor — master switch, provisional cap, and the years→level
 *      band table (validated so a saved table can never leave a gap).
 *   2. An org-wide register of every work-experience record.
 */

const STATUS_PILL: Record<WorkExperienceStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
  VERIFIED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
};

export const WorkExperienceAdmin: React.FC = () => {
  const storeVersion = useStoreData();
  const [refreshKey, setRefreshKey] = useState(0);

  const saved = useMemo(() => dataService.getWorkExperiencePolicy(), [storeVersion, refreshKey]);

  const [enabled, setEnabled] = useState(saved.enabled);
  const [cap, setCap] = useState(saved.maxProvisionalLevel);
  const [bands, setBands] = useState<ExperienceLevelBand[]>(saved.bands);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  // The stored policy usually arrives on a poll AFTER first render (the initial
  // useState values are the shipped defaults). Re-seed the form when the stored
  // document genuinely changes — compared by value, since
  // getWorkExperiencePolicy() returns a fresh object every call and an identity
  // check would clobber the admin's in-progress edits on every render.
  const lastSyncedRef = useRef<string>(JSON.stringify(saved));
  useEffect(() => {
    const incoming = JSON.stringify(saved);
    if (incoming === lastSyncedRef.current) return;
    lastSyncedRef.current = incoming;
    setEnabled(saved.enabled);
    setCap(saved.maxProvisionalLevel);
    setBands(saved.bands);
  }, [saved]);

  const [statusFilter, setStatusFilter] = useSessionState<'ALL' | WorkExperienceStatus>('admin-we-status', 'ALL');
  const [search, setSearch] = useState('');

  const bandErrors = useMemo(() => validateBands(bands), [bands]);

  const users = useMemo(() => dataService.getAllUsers(), [storeVersion, refreshKey]);
  const records = useMemo(() => {
    const all = dataService.getWorkExperiences();
    const term = search.trim().toLowerCase();
    return all
      .filter(w => (statusFilter === 'ALL' ? true : w.status === statusFilter))
      .filter(w => {
        if (!term) return true;
        const owner = users.find(u => u.id === w.userId);
        return [w.employer, w.jobTitle, owner?.name].some(v => (v || '').toLowerCase().includes(term));
      });
  }, [statusFilter, search, users, storeVersion, refreshKey]);

  const patchBand = (i: number, patch: Partial<ExperienceLevelBand>) =>
    setBands(prev => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const handleSave = async () => {
    if (bandErrors.length > 0) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      await dataService.updateWorkExperiencePolicy({ enabled, maxProvisionalLevel: cap, bands });
      setSaveState('saved');
      setRefreshKey(k => k + 1);
      setTimeout(() => setSaveState('idle'), 2500);
    } catch (e) {
      setSaveState('error');
      setSaveError(e instanceof Error ? e.message : 'Could not save the policy.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-black text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <Briefcase size={20} className="text-slate-500" /> Work Experience Policy
        </h2>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Controls how employees' prior employment translates into competency levels. Verified experience
          gives a <strong>provisional</strong> score only where a skill has no assessment and no scored
          evidence — a real assessment always takes precedence, and provisional skills stay in the
          assessment queue.
        </p>
      </div>

      {/* ── Policy editor ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-300">
        <div className="p-5 border-b border-slate-200 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-bold text-slate-800">
                Credit verified experience towards competency
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                When off, employees can still record their history and managers can still verify it, but no
                score is derived from it.
              </span>
            </span>
          </label>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1" htmlFor="we-cap">
              Maximum provisional level
            </label>
            <select
              id="we-cap"
              className="px-3 py-2 text-sm border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-slate-900"
              value={cap}
              onChange={e => setCap(Number(e.target.value))}
              disabled={!enabled}
            >
              {[1, 2, 3, 4, 5].map(l => (
                <option key={l} value={l}>L{l} — {PROFICIENCY_LABELS[l]}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1.5 max-w-2xl">
              The hard ceiling on any experience-derived score. A band may still <em>suggest</em> a higher
              level to the verifying manager — this is what actually reaches the employee's profile.
            </p>
          </div>
        </div>

        {/* Band table */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-slate-800">Years → Level Bands</h3>
            <button
              onClick={() => setBands(prev => [...prev, { minYears: 0, maxYears: 1, level: 1 }])}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-700 border border-slate-300 hover:bg-slate-50 inline-flex items-center gap-1.5"
            >
              <Plus size={13} /> Add Band
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Ranges are inclusive of "from" and exclusive of "to". The table must start at 0 and the last
            band must be open-ended, so every tenure matches exactly one band.
          </p>

          <div className="space-y-2">
            {bands.map((b, i) => (
              <div key={i} className="flex flex-wrap items-end gap-3 p-3 bg-slate-50 border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">From (yrs)</label>
                  <input
                    type="number" min={0} step={0.5}
                    className="w-24 px-2 py-1.5 text-sm border border-slate-300 outline-none focus:ring-2 focus:ring-slate-900"
                    value={b.minYears}
                    onChange={e => patchBand(i, { minYears: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">To (yrs)</label>
                  <input
                    type="number" min={0} step={0.5}
                    placeholder="∞"
                    className="w-24 px-2 py-1.5 text-sm border border-slate-300 outline-none focus:ring-2 focus:ring-slate-900"
                    value={b.maxYears ?? ''}
                    onChange={e => patchBand(i, { maxYears: e.target.value === '' ? undefined : Number(e.target.value) })}
                  />
                </div>
                <div className="flex-grow min-w-[180px]">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Suggests</label>
                  <select
                    className="w-full px-2 py-1.5 text-sm border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-slate-900"
                    value={b.level}
                    onChange={e => patchBand(i, { level: Number(e.target.value) })}
                  >
                    {[1, 2, 3, 4, 5].map(l => (
                      <option key={l} value={l}>L{l} — {PROFICIENCY_LABELS[l]}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => setBands(prev => prev.filter((_, idx) => idx !== i))}
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  aria-label={`Remove band ${i + 1}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>

          {bandErrors.length > 0 && (
            <ul className="mt-3 space-y-1">
              {bandErrors.map((err, i) => (
                <li key={i} className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 flex items-start gap-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {err}
                </li>
              ))}
            </ul>
          )}

          {cap < Math.max(...bands.map(b => b.level), 0) && bandErrors.length === 0 && (
            <p className="mt-3 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-3 py-2 flex items-start gap-2">
              <Info size={13} className="shrink-0 mt-0.5" />
              Some bands suggest above the L{cap} cap. Managers will see the higher suggestion, but no more
              than L{cap} will count until the skill is formally assessed.
            </p>
          )}

          <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-slate-200">
            {saveState === 'saved' && (
              <span className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1.5">
                <CheckCircle size={14} /> Policy saved
              </span>
            )}
            {saveError && <span className="text-xs text-rose-600">{saveError}</span>}
            <button
              onClick={handleSave}
              disabled={bandErrors.length > 0 || saveState === 'saving'}
              className="px-4 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 inline-flex items-center gap-1.5"
            >
              <Save size={15} /> {saveState === 'saving' ? 'Saving…' : 'Save Policy'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Org-wide register ──────────────────────────────────────────── */}
      <div className="bg-white border border-slate-300">
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-slate-800">
            Experience Register <span className="text-slate-400 font-normal">({records.length})</span>
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                className="pl-8 pr-3 py-1.5 text-sm border border-slate-300 outline-none focus:ring-2 focus:ring-slate-900"
                placeholder="Employee, employer, title…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="px-2 py-1.5 text-sm border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-slate-900"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'ALL' | WorkExperienceStatus)}
            >
              <option value="ALL">All statuses</option>
              {(Object.keys(WORK_EXPERIENCE_STATUS_LABELS) as WorkExperienceStatus[]).map(s => (
                <option key={s} value={s}>{WORK_EXPERIENCE_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {records.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">No records match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5">Employee</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Period</th>
                  <th className="px-4 py-2.5">Skills Credited</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(w => {
                  const owner = users.find(u => u.id === w.userId);
                  const credited = (w.skills || []).filter(s => s.verifiedLevel);
                  return (
                    <tr key={w.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-800">{owner?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {w.jobTitle}
                        <span className="block text-xs text-slate-400">{w.employer}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {w.startDate} → {w.endDate || 'Present'}
                      </td>
                      <td className="px-4 py-3">
                        {w.status === 'VERIFIED' && credited.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {credited.map(s => {
                              const skill = dataService.getSkill(s.skillId);
                              return (
                                <span key={s.skillId} className="px-1.5 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                  {skill?.name || 'Unknown'} · L{Math.min(s.verifiedLevel!, cap)}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {(w.skills || []).length} tagged, none credited
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-[10px] font-bold border ${STATUS_PILL[w.status]}`}>
                          {WORK_EXPERIENCE_STATUS_LABELS[w.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkExperienceAdmin;
