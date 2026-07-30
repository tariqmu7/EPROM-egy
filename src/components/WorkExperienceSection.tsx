import React, { useMemo, useState } from 'react';
import { Plus, Briefcase, ShieldCheck, AlertTriangle } from 'lucide-react';
import { WorkExperienceTimeline } from './WorkExperienceTimeline';
import { WorkExperienceForm } from './WorkExperienceForm';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { User, WorkExperience } from '../types';

/**
 * The "Work Experience" dashboard tab: a unified career timeline (external
 * employment + internal moves) plus the add/edit flow.
 *
 * `readOnly` is passed explicitly rather than inferred from routing, because the
 * same dashboard is embedded read-only inside a CEO/manager profile view.
 */

interface Props {
  user: User;
  readOnly?: boolean;
}

export const WorkExperienceSection: React.FC<Props> = ({ user, readOnly = false }) => {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<WorkExperience | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkExperience | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const storeVersion = useStoreData();
  const policy = dataService.getWorkExperiencePolicy();

  const stats = useMemo(() => {
    const all = dataService.getWorkExperiences(user.id);
    const verified = all.filter(w => w.status === 'VERIFIED');
    const skillIds = new Set(verified.flatMap(w => (w.skills || []).map(s => s.skillId)));
    return {
      total: all.length,
      pending: all.filter(w => w.status === 'PENDING').length,
      verifiedSkills: skillIds.size,
    };
  }, [user.id, refreshKey, storeVersion]);

  const closeForm = () => { setShowForm(false); setEditing(null); };
  const afterWrite = () => { closeForm(); setRefreshKey(k => k + 1); };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await dataService.deleteWorkExperience(pendingDelete.id);
      setPendingDelete(null);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not remove that record.');
      setPendingDelete(null);
    }
  };

  return (
    // Flat, square, uppercase — the same visual language as the other dashboard
    // tabs (History / Career), which open with a dark banner then stack cards.
    <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
      <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
        <Briefcase className="absolute -right-8 -bottom-8 w-48 h-48 opacity-10" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div className="min-w-0">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Professional Work Experience</h2>
            <p className="text-slate-300 text-sm max-w-xl">
              Employment before joining, plus your internal career moves. Verified experience can give
              you a provisional level on the skills you tagged
              {policy.enabled ? ` (up to Level ${policy.maxProvisionalLevel})` : ''} until a formal
              assessment measures them.
            </p>
          </div>
          {!readOnly && !showForm && (
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="bg-white text-slate-900 px-6 py-3 font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-slate-100 transition-all shadow-lg shrink-0"
            >
              <Plus className="w-4 h-4" /> Add Experience
            </button>
          )}
        </div>
      </div>

      {!showForm && stats.total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Records', value: stats.total },
            { label: 'Awaiting Verification', value: stats.pending },
            { label: 'Skills Credited', value: stats.verifiedSkills },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
              <p className="text-2xl font-black text-slate-900 mt-1 leading-none">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {actionError && (
        <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 px-3 py-2">{actionError}</p>
      )}

      {showForm ? (
        <div className="bg-white border border-slate-200 p-6">
          <h4 className="text-xs font-black uppercase text-slate-700 tracking-widest mb-4 border-b border-slate-100 pb-2">
            {editing ? 'Edit Experience Record' : 'New Experience Record'}
          </h4>
          <WorkExperienceForm
            userId={user.id}
            initial={editing}
            onSaved={afterWrite}
            onCancel={closeForm}
          />
        </div>
      ) : (
        <div className="bg-white border border-slate-200 p-6">
          <h4 className="text-xs font-black uppercase text-slate-700 tracking-widest mb-4 border-b border-slate-100 pb-2">
            Career Timeline
          </h4>
          {stats.pending > 0 && (
            <p className="mb-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-px" />
              <span>
                {stats.pending} record{stats.pending === 1 ? ' is' : 's are'} waiting on your manager. Nothing counts towards your profile until verified.
              </span>
            </p>
          )}
          <WorkExperienceTimeline
            user={user}
            readOnly={readOnly}
            refreshKey={refreshKey}
            onEdit={entry => { setEditing(entry); setShowForm(true); }}
            onDelete={entry => setPendingDelete(entry)}
          />
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
          <div className="bg-white border border-slate-200 shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-700">Remove this record?</h4>
                <p className="text-xs text-slate-500 mt-2">
                  {pendingDelete.jobTitle} at {pendingDelete.employer} will be deleted. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setPendingDelete(null)} className="px-4 py-2 border border-slate-300 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={confirmDelete} className="px-4 py-2 bg-rose-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-rose-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkExperienceSection;
