import React, { useEffect, useMemo, useState } from 'react';
import { dataService } from '../services/store';
import { ActivityLog, AuditLogEntry } from '../types';
import { usePersistentView } from '../hooks/usePersistentView';
import { ShieldCheck, RefreshCw, Search, ArrowRight, ChevronDown } from 'lucide-react';

// ISO.1 — read-only view of who changed what, when.
//
// Two sources, kept apart on purpose:
//   • Record changes — the SERVER's audit log (GET /audit, finding R9). Written
//     by the API in the same transaction as every change, actor from the
//     session. This is the audit trail.
//   • Activity notes — the browser-written `activityLogs`. Pages narrate in
//     words the server cannot ("Approved evidence"), but a client decided
//     whether to write one, so they are context, not proof.

const VIEWS = ['changes', 'notes'] as const;
type View = typeof VIEWS[number];

const PAGE_SIZE = 100;

const COLLECTION_LABELS: Record<string, string> = {
  users: 'Employee',
  skills: 'Skill',
  jobProfiles: 'Job profile',
  departments: 'Department',
  assessments: 'Assessment',
  evidences: 'Evidence',
  workExperiences: 'Work experience',
  developmentPlans: 'Development plan',
  trainingCourses: 'Training course',
  assessmentCycles: 'Assessment cycle',
  assessmentPlans: 'Assessment plan',
  appSettings: 'Setting',
  activityLogs: 'Activity note',
};

const ACTION_STYLES: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  update: 'bg-sky-50 text-sky-800 border-sky-200',
  delete: 'bg-rose-50 text-rose-800 border-rose-200',
};

const fmt = (iso: string) => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

// A stored value as one line. The server already summarises files and cuts
// long text, so this only has to make it readable.
const show = (v: unknown): string => {
  if (v === undefined) return '';
  if (v === null) return 'empty';
  if (typeof v === 'string') return v === '' ? 'empty' : v;
  return JSON.stringify(v);
};

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

// The record's name as the directory knows it today; the id is always shown
// too, because the record may since have been renamed or deleted.
const recordName = (collection: string, id: string): string | undefined => {
  switch (collection) {
    case 'users': return dataService.getUserById(id)?.name;
    case 'skills': return dataService.getSkill(id)?.name;
    case 'jobProfiles': return dataService.getJobProfile(id)?.title;
    case 'departments': return dataService.getAllDepartments().find(d => d.id === id)?.name;
    default: return undefined;
  }
};

const ChangeList: React.FC<{ entry: AuditLogEntry }> = ({ entry }) => {
  const fields = Object.entries(entry.changes || {});
  if (fields.length === 0) return <span className="text-slate-400">—</span>;

  const rows = fields.map(([field, c]) => (
    <li key={field} className="flex flex-wrap items-baseline gap-1.5">
      <span className="font-bold text-slate-700">{field}</span>
      {'before' in c && (
        <span className="text-rose-600 break-all" title={show(c.before)}>{clip(show(c.before))}</span>
      )}
      {'before' in c && 'after' in c && <ArrowRight size={11} className="text-slate-400 shrink-0" aria-hidden="true" />}
      {'after' in c && (
        <span className="text-emerald-700 break-all" title={show(c.after)}>{clip(show(c.after))}</span>
      )}
    </li>
  ));

  // A create or delete lists the whole record — fold it so the table stays readable.
  if (fields.length <= 3 && entry.action === 'update') {
    return <ul className="space-y-1 font-mono text-xs">{rows}</ul>;
  }
  return (
    <details className="group">
      <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-slate-900">
        <ChevronDown size={13} className="transition-transform group-open:rotate-180" aria-hidden="true" />
        {fields.length} field{fields.length === 1 ? '' : 's'}
        <span className="font-normal text-slate-400 truncate max-w-[16rem]">
          · {fields.slice(0, 4).map(([f]) => f).join(', ')}{fields.length > 4 ? '…' : ''}
        </span>
      </summary>
      <ul className="mt-2 space-y-1 font-mono text-xs">{rows}</ul>
    </details>
  );
};

const RecordChanges: React.FC = () => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collection, setCollection] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await dataService.getAuditLog({ limit: PAGE_SIZE, collection: collection || undefined });
      setEntries(page.entries);
      setNext(page.next?.beforeId ?? null);
    } catch (err) {
      console.error('getAuditLog failed', err);
      setError('The audit log could not be loaded. Check the connection and try again.');
      setEntries([]);
      setNext(null);
    } finally {
      setLoading(false);
    }
  };

  const loadOlder = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const page = await dataService.getAuditLog({ limit: PAGE_SIZE, beforeId: next, collection: collection || undefined });
      setEntries(prev => [...prev, ...page.entries]);
      setNext(page.next?.beforeId ?? null);
    } catch (err) {
      console.error('getAuditLog (older) failed', err);
      setError('Older entries could not be loaded. Try again.');
    } finally {
      setLoadingMore(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [collection]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      [e.actorName, e.actorEmail, e.action, e.collection, e.docId,
       recordName(e.collection, e.docId), ...Object.keys(e.changes || {})]
        .filter(Boolean)
        .some(v => v!.toLowerCase().includes(q))
    );
  }, [entries, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Recorded by the server with every change, at the moment it was saved. Nobody can edit or remove an entry.
          {!loading && !error && (
            <> Showing {entries.length} {next ? 'most recent' : ''} entr{entries.length === 1 ? 'y' : 'ies'}.</>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="audit-collection" className="sr-only">Record type</label>
          <select
            id="audit-collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            className="py-2 pl-3 pr-8 bg-white border border-slate-300 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
          >
            <option value="">All record types</option>
            {Object.entries(COLLECTION_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
            <label htmlFor="audit-search" className="sr-only">Search loaded entries</label>
            <input
              id="audit-search"
              type="text"
              placeholder="Search person, record, field…"
              className="w-60 pl-10 pr-4 py-2 bg-white border border-slate-300 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
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

      {error && (
        <div role="alert" className="p-3 text-sm border border-rose-200 bg-rose-50 text-rose-800">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-50 border border-slate-200" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        !error && (
          <div className="text-center p-12 text-slate-500 border-2 border-dashed border-slate-300">
            {entries.length === 0
              ? 'No changes recorded yet. Entries appear here from the moment the server audit log was switched on.'
              : 'No loaded entries match your search. Load older entries to search further back.'}
          </div>
        )
      ) : (
        <div className="overflow-x-auto border border-slate-300 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="p-3 pl-4">When</th>
                <th className="p-3">Who</th>
                <th className="p-3">Action</th>
                <th className="p-3">Record</th>
                <th className="p-3">What changed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const name = recordName(e.collection, e.docId);
                return (
                  <tr key={e.id} className="border-b border-slate-100 align-top hover:bg-slate-50/60">
                    <td className="p-3 pl-4 whitespace-nowrap text-slate-600">{fmt(e.at)}</td>
                    <td className="p-3">
                      <div className="font-medium text-slate-800">{e.actorName || e.actorEmail || 'Unknown'}</div>
                      {e.actorName && e.actorEmail && <div className="text-xs text-slate-400">{e.actorEmail}</div>}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide border ${ACTION_STYLES[e.action] || 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                        {e.action.replace('-', ' ')}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">{COLLECTION_LABELS[e.collection] || e.collection}</div>
                      <div className="text-slate-800">{name || <span className="font-mono text-xs text-slate-500">{e.docId}</span>}</div>
                      {name && <div className="font-mono text-[10px] text-slate-400">{e.docId}</div>}
                    </td>
                    <td className="p-3 text-slate-600 min-w-[16rem]"><ChangeList entry={e} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && next && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            {loadingMore && <RefreshCw size={15} className="animate-spin" aria-hidden="true" />}
            Load older entries
          </button>
        </div>
      )}
    </div>
  );
};

const ActivityNotes: React.FC = () => {
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Plain-language notes the screens write as people work (latest {logs.length}). Helpful context — the
          {' '}<span className="font-bold">Record changes</span> tab is the authoritative record.
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
            <label htmlFor="notes-search" className="sr-only">Search activity notes</label>
            <input
              id="notes-search"
              type="text"
              placeholder="Search actor, action, entity…"
              className="w-60 pl-10 pr-4 py-2 bg-white border border-slate-300 text-sm focus:ring-2 focus:ring-slate-900 outline-none"
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
          No activity notes match your search.
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

export const AuditTrail: React.FC = () => {
  const [view, setView] = usePersistentView<View>('admin-audit', VIEWS, 'changes');

  const tab = (key: View, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === key}
      onClick={() => setView(key)}
      className={`px-4 py-2 text-sm font-bold border-b-2 -mb-px focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
        view === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-300">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <ShieldCheck className="text-slate-700" size={28} /> Audit Trail
        </h2>
        <p className="text-slate-600 text-sm mt-1">
          Who changed which record, when, and what it was before (ISO 9001 §7.2). Read-only.
        </p>
      </div>

      <div role="tablist" aria-label="Audit sources" className="flex gap-1 border-b border-slate-200">
        {tab('changes', 'Record changes')}
        {tab('notes', 'Activity notes')}
      </div>

      {view === 'changes' ? <RecordChanges /> : <ActivityNotes />}
    </div>
  );
};
