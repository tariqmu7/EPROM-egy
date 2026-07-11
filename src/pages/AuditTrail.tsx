import React, { useEffect, useMemo, useState } from 'react';
import { dataService } from '../services/store';
import { ActivityLog } from '../types';
import { ShieldCheck, RefreshCw, Search, ArrowRight } from 'lucide-react';

// ISO.1 — tamper-evident view over the append-only `activityLogs` collection:
// who did what, when, and the before/after of competence records. Read-only;
// logs are never edited or deleted from here.
export const AuditTrail: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    const data = await dataService.fetchAuditLogs(500);
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(l =>
      [l.action, l.target, l.actorName, l.entity, l.before, l.after]
        .filter(Boolean)
        .some(v => v!.toLowerCase().includes(q))
    );
  }, [logs, search]);

  const fmt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(undefined, {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-slate-300">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="text-slate-700" size={28} /> Audit Trail
          </h2>
          <p className="text-slate-600 text-sm mt-1">
            Append-only record of competence-management actions (ISO 9001 §7.2). Showing the latest {logs.length} events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
            <label htmlFor="audit-search" className="sr-only">Search audit log</label>
            <input
              id="audit-search"
              type="text"
              placeholder="Search actor, action, entity…"
              className="w-64 pl-10 pr-4 py-2 bg-white border border-slate-300 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-50 border border-slate-200" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center p-12 text-slate-500 border-2 border-dashed border-slate-300">
          No audit events match your search.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-300 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="p-3 pl-4">When</th>
                <th className="p-3">Actor</th>
                <th className="p-3">Action</th>
                <th className="p-3">Target</th>
                <th className="p-3">Change</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="p-3 pl-4 whitespace-nowrap text-slate-600">{fmt(l.timestamp)}</td>
                  <td className="p-3 font-medium text-slate-800">{l.actorName || '—'}</td>
                  <td className="p-3">
                    <span className="font-bold text-slate-900">{l.action}</span>
                    {l.entity && <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400">{l.entity}</span>}
                  </td>
                  <td className="p-3 text-slate-700">{l.target}</td>
                  <td className="p-3 text-slate-600">
                    {l.before || l.after ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                        {l.before && <span className="text-rose-600">{l.before}</span>}
                        {l.before && l.after && <ArrowRight size={12} className="text-slate-400" aria-hidden="true" />}
                        {l.after && <span className="text-emerald-700">{l.after}</span>}
                      </span>
                    ) : '—'}
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
