import React, { useMemo, useState } from 'react';
import { dataService } from '../../services/store';
import { X, Link2, Ban, CheckCircle, Loader2 } from 'lucide-react';
import { linkSkillCertificates } from '../../utils/requiredCourses';

// --- One-off clean-up: old typed certificate names -> catalogue courses -----
// Skills written before the catalogue pick-list carry certificate NAMES only.
// This previews which names match a catalogue course (by title or code) and,
// on confirm, saves the links. Names with no course are listed so the admin
// can add or request them; they are never deleted.
export const LinkCertificatesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const plan = useMemo(() => {
    const courses = dataService.getAllTrainingCourses(true);
    return dataService.getAllSkills().map(s => ({ name: s.name, ...linkSkillCertificates(s, courses) }));
  }, []);
  const toLink = plan.filter(p => p.changed);
  const linkCount = toLink.reduce((n, p) => n + p.linked, 0);
  const leftOver = plan.filter(p => p.unmatched.length > 0);

  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ saved: number; failed: string[] } | null>(null);

  const apply = async () => {
    setSaving(true);
    const failed: string[] = [];
    let saved = 0;
    for (const p of toLink) {
      try { await dataService.updateSkill(p.skill); saved++; }
      catch (err) { console.error('Failed to link certificates for', p.name, err); failed.push(p.name); }
    }
    setSaving(false);
    setDone({ saved, failed });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2"><Link2 size={18} /> Link certificates to the catalogue</h3>
            <p className="text-xs text-slate-500 mt-1">Certificate names typed on skills are matched to Training Catalogue courses with the same title or code.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5 text-sm">
          {done ? (
            <div className={`p-4 border ${done.failed.length ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              <p className="font-bold flex items-center gap-2"><CheckCircle size={16} /> {done.saved} skill{done.saved === 1 ? '' : 's'} updated.</p>
              {done.failed.length > 0 && <p className="mt-1">Could not save: {done.failed.join(', ')}. Try again.</p>}
            </div>
          ) : (
            <div className="p-4 border border-blue-100 bg-blue-50 text-blue-900">
              {linkCount > 0
                ? <p><span className="font-bold">{linkCount} certificate{linkCount === 1 ? '' : 's'}</span> on <span className="font-bold">{toLink.length} skill{toLink.length === 1 ? '' : 's'}</span> can be linked to a catalogue course.</p>
                : <p>Nothing new to link — every certificate name that matches a catalogue course is already linked.</p>}
            </div>
          )}

          {!done && toLink.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Will be linked</p>
              <ul className="divide-y divide-slate-100 border border-slate-200">
                {toLink.map(p => (
                  <li key={p.skill.id} className="px-3 py-2 flex justify-between gap-3">
                    <span className="font-semibold text-slate-900">{p.name}</span>
                    <span className="text-xs text-slate-500">{p.linked} link{p.linked === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {leftOver.length > 0 && (
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Not in the catalogue — kept as names</p>
              <p className="text-xs text-slate-500 mb-2">Add these courses to the Training Catalogue, or open the skill and press "Request it", then run this again.</p>
              <ul className="divide-y divide-slate-100 border border-slate-200">
                {leftOver.map(p => (
                  <li key={p.skill.id} className="px-3 py-2">
                    <span className="font-semibold text-slate-900">{p.name}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {p.unmatched.map(n => (
                        <span key={n} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] border border-slate-300 bg-slate-100 text-slate-700"><Ban size={10} className="text-slate-400" /> {n}</span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2 text-slate-600 hover:bg-slate-100 font-bold uppercase tracking-wide text-xs">{done ? 'Close' : 'Cancel'}</button>
          {!done && toLink.length > 0 && (
            <button onClick={apply} disabled={saving}
              className="px-5 py-2 bg-blue-700 text-white font-bold uppercase tracking-wide text-xs hover:bg-blue-800 flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Link {linkCount} certificate{linkCount === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
