import React, { useMemo, useState } from 'react';
import {
  User,
  DevelopmentPlan,
  DevelopmentPlanItem,
  DevelopmentItemStatus,
  DEVELOPMENT_ITEM_STATUS_LABELS,
  DEVELOPMENT_PLAN_STATUS_LABELS,
  CompetencyCoverage,
} from '../types';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { CoverageNote } from './CoverageIndicator';
import { CriticalityBadge } from './CriticalityBadge';
import {
  Target,
  BookOpen,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  Play,
  Save,
  Archive,
  Trash2,
  PlusCircle,
  History,
  X,
} from 'lucide-react';

/**
 * THE SAVED DEVELOPMENT PLAN.
 *
 * The IDP used to be regenerated on every page load and thrown away, so the app
 * could recommend training but never record that it was agreed, that anyone did
 * it, or that it changed a score. This panel is the persisted plan
 * (`developmentPlans`, migration 006): propose → save → activate → track →
 * manager sign-off → re-measure.
 *
 * Two honest rules it keeps:
 *  • A never-assessed skill is NEVER planned as a gap — it is an assessment
 *    need. Those stay in the "not measured" list on the dashboard.
 *  • The level at planning time is FROZEN on each item, so "did it work" is
 *    answered from stored before/after, not from re-derivation.
 */

interface DevelopmentPlanPanelProps {
  /** Whose plan this is. */
  subject: User;
  /** Who is looking. Drives what can be done, not what can be seen. */
  viewer: User;
  /** The subject's coverage — the base every figure here is read against. */
  coverage: CompetencyCoverage;
}

const itemStatusTone: Record<DevelopmentItemStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-600 border-slate-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-slate-50 text-slate-400 border-slate-200',
};

const planStatusTone: Record<string, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
  ACTIVE: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ARCHIVED: 'bg-slate-100 text-slate-500 border-slate-200',
};

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '—');

export const DevelopmentPlanPanel: React.FC<DevelopmentPlanPanelProps> = ({ subject, viewer, coverage }) => {
  const storeVersion = useStoreData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [signOffFor, setSignOffFor] = useState<string | null>(null);
  const [signOffText, setSignOffText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isSelf = viewer.id === subject.id;
  const canSupervise = useMemo(
    () => dataService.canSupervise(viewer.id, subject.id),
    [viewer.id, subject.id, storeVersion],
  );
  // Anyone who may act at all: the employee on their own plan, or a supervisor.
  const canEdit = isSelf || canSupervise;

  const plan = useMemo(
    () => dataService.getCurrentDevelopmentPlan(subject.id),
    [subject.id, storeVersion],
  );
  const history = useMemo(
    () => dataService.getDevelopmentPlans(subject.id).filter(p => p.id !== plan?.id),
    [subject.id, plan?.id, storeVersion],
  );
  const progress = useMemo(
    () => (plan ? dataService.getDevelopmentPlanProgress(plan) : null),
    [plan, storeVersion],
  );
  // What a plan created right now would contain (nothing is saved by asking).
  const proposal = useMemo(
    () => (plan ? [] : dataService.proposeDevelopmentPlanItems(subject.id)),
    [plan, subject.id, storeVersion],
  );
  const unplanned = useMemo(
    () => (plan && plan.status !== 'ARCHIVED' ? dataService.getUnplannedDevelopmentItems(plan) : []),
    [plan, storeVersion],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message || 'Could not save the change. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  // ── No saved plan yet: show the live proposal and offer to save it ────────
  if (!plan) {
    return (
      <div className="space-y-6">
        <PanelHeader coverage={coverage} />

        {proposal.length === 0 ? (
          coverage.known === 0 ? (
            <EmptyState
              tone="amber"
              icon={<AlertTriangle size={40} className="text-amber-500" />}
              title="Nothing Measured Yet"
              body={
                coverage.required > 0
                  ? `None of the ${coverage.required} skills required by this position has been assessed, so no development plan can be written yet. Assessment comes first.`
                  : 'No skill requirements are defined for this position yet.'
              }
            />
          ) : (
            <EmptyState
              tone="emerald"
              icon={<CheckCircle2 size={40} className="text-emerald-500" />}
              title="No Gaps To Plan"
              body={`The required level is met on all ${coverage.known} assessed skill${coverage.known === 1 ? '' : 's'}${
                coverage.unknown > 0 ? `; ${coverage.unknown} of ${coverage.required} remain unassessed and are not gaps.` : '.'
              }`}
            />
          )
        ) : (
          <div className="border border-dashed border-slate-300 bg-white">
            <div className="p-5 border-b border-slate-100 bg-amber-50/60 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-black uppercase tracking-tight text-slate-900">
                  Proposed Plan — Not Saved
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {proposal.length} measured gap{proposal.length === 1 ? '' : 's'}. Nothing is tracked until this plan
                  is saved.
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        dataService.createDevelopmentPlan(subject.id, {
                          createdBy: viewer.id,
                          items: proposal,
                          status: 'DRAFT',
                        }),
                      )
                    }
                    className="flex items-center gap-1 text-[10px] font-black uppercase px-3 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Save size={12} /> Save As Draft
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        dataService.createDevelopmentPlan(subject.id, {
                          createdBy: viewer.id,
                          items: proposal,
                          status: 'ACTIVE',
                        }),
                      )
                    }
                    className="flex items-center gap-1 text-[10px] font-black uppercase px-3 py-2 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Play size={12} /> {canSupervise && !isSelf ? 'Assign Plan' : 'Start Plan'}
                  </button>
                </div>
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {proposal.map(item => (
                <ProposedRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

        {error && <ErrorNote message={error} onDismiss={() => setError(null)} />}
        {history.length > 0 && (
          <PlanHistory
            plans={history}
            open={showHistory}
            onToggle={() => setShowHistory(v => !v)}
          />
        )}
      </div>
    );
  }

  // ── A saved plan exists ───────────────────────────────────────────────────
  const p = progress!;
  const closed = plan.status === 'COMPLETED' || plan.status === 'ARCHIVED';

  return (
    <div className="space-y-6">
      <PanelHeader coverage={coverage} />

      <div className="bg-white border border-slate-200">
        {/* Plan header */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black uppercase tracking-tight text-slate-900">{plan.title}</h4>
              <span className={`text-[9px] font-black uppercase px-2 py-0.5 border ${planStatusTone[plan.status]}`}>
                {DEVELOPMENT_PLAN_STATUS_LABELS[plan.status]}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Created {fmtDate(plan.createdAt)} by {dataService.getUserById(plan.createdBy)?.name || 'Unknown'}
              {plan.activatedAt && ` · Active since ${fmtDate(plan.activatedAt)}`}
              {plan.completedAt && ` · Completed ${fmtDate(plan.completedAt)}`}
            </p>
            {plan.coverageAtPlanning && plan.coverageAtPlanning.unknown > 0 && (
              <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} />
                Written when {plan.coverageAtPlanning.measured} of {plan.coverageAtPlanning.required} required skills
                were measured — {plan.coverageAtPlanning.unknown} were never assessed and could not be planned.
              </p>
            )}
          </div>

          {canEdit && !closed && (
            <div className="flex flex-wrap gap-2">
              {plan.status === 'DRAFT' && (
                <button
                  disabled={busy}
                  onClick={() => run(() => dataService.setDevelopmentPlanStatus(plan.id, 'ACTIVE'))}
                  className="flex items-center gap-1 text-[10px] font-black uppercase px-3 py-2 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <Play size={12} /> {canSupervise && !isSelf ? 'Approve & Activate' : 'Start Plan'}
                </button>
              )}
              {plan.status === 'DRAFT' && (
                <button
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1 text-[10px] font-black uppercase px-3 py-2 border border-slate-300 text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={12} /> Discard
                </button>
              )}
              {plan.status === 'ACTIVE' && canSupervise && (
                <button
                  disabled={busy}
                  onClick={() => run(() => dataService.setDevelopmentPlanStatus(plan.id, 'ARCHIVED'))}
                  className="flex items-center gap-1 text-[10px] font-black uppercase px-3 py-2 border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Archive size={12} /> Archive
                </button>
              )}
            </div>
          )}
        </div>

        {confirmDelete && (
          <div className="p-4 bg-red-50 border-b border-red-200 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-bold text-red-700 uppercase">
              Discard this draft? Nothing has been agreed yet, so it can be deleted.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] font-black uppercase px-3 py-1.5 border border-slate-300 text-slate-600 hover:bg-white"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={async () => {
                  await run(() => dataService.deleteDevelopmentPlan(plan.id));
                  setConfirmDelete(false);
                }}
                className="text-[10px] font-black uppercase px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Delete Draft
              </button>
            </div>
          </div>
        )}

        {/* Progress strip — completion AND effect, side by side */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
          <Stat
            label="Completed"
            value={p.completedPct === null ? '—' : `${p.completedPct}%`}
            sub={`${p.completed} of ${p.total - p.cancelled} items`}
            icon={<CheckCircle2 size={14} className="text-emerald-600" />}
          />
          <Stat
            label="Signed Off"
            value={String(p.signedOff)}
            sub={p.completed > p.signedOff ? `${p.completed - p.signedOff} awaiting a manager` : 'All verified'}
            icon={<ShieldCheck size={14} className="text-blue-600" />}
          />
          <Stat
            label="Levels Gained"
            value={p.levelsGained > 0 ? `+${p.levelsGained}` : '0'}
            sub={`${p.improved} skill${p.improved === 1 ? '' : 's'} improved since planning`}
            icon={<TrendingUp size={14} className="text-indigo-600" />}
          />
          <Stat
            label="Overdue"
            value={String(p.overdue)}
            sub={p.overdue > 0 ? 'Past target date' : 'On schedule'}
            icon={<Clock size={14} className={p.overdue > 0 ? 'text-amber-600' : 'text-slate-400'} />}
            tone={p.overdue > 0 ? 'text-amber-700' : undefined}
          />
        </div>

        {/* New gaps that appeared after the plan was agreed */}
        {unplanned.length > 0 && canEdit && !closed && (
          <div className="p-4 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-amber-800">
              <strong>{unplanned.length}</strong> measured gap{unplanned.length === 1 ? ' is' : 's are'} not on this
              plan (requirements or scores changed since it was written).
            </p>
            <button
              disabled={busy}
              onClick={() => run(() => dataService.addDevelopmentPlanItems(plan.id, unplanned))}
              className="flex items-center gap-1 text-[10px] font-black uppercase px-3 py-1.5 border border-amber-300 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              <PlusCircle size={12} /> Add To Plan
            </button>
          </div>
        )}

        {error && <ErrorNote message={error} onDismiss={() => setError(null)} inline />}

        {/* Items */}
        {p.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">This plan has no items.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {p.items.map(item => {
              const cancelled = item.status === 'CANCELLED';
              return (
                <div key={item.id} className={`p-5 ${cancelled ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h5 className="text-sm font-black uppercase tracking-tight text-slate-900">{item.skillName}</h5>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 border ${itemStatusTone[item.status]}`}>
                          {DEVELOPMENT_ITEM_STATUS_LABELS[item.status]}
                        </span>
                        {item.supervisorSignOff && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                            <ShieldCheck size={10} /> Signed Off
                          </span>
                        )}
                        {item.isOverdue && (
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 border bg-amber-50 text-amber-700 border-amber-200">
                            Overdue
                          </span>
                        )}
                      </div>

                      {/* before → now → required: the whole point of saving the plan */}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px]">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold">
                          At planning: L{item.levelAtPlanning}
                        </span>
                        <span className="text-slate-400">→</span>
                        <span
                          className={`px-2 py-0.5 font-bold ${
                            item.improvement > 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.improvement < 0
                              ? 'bg-red-50 text-red-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          Now: L{item.currentLevel}
                          {item.improvement !== 0 && ` (${item.improvement > 0 ? '+' : ''}${item.improvement})`}
                        </span>
                        <span className="text-slate-400">of</span>
                        <span className="px-2 py-0.5 bg-slate-900 text-white font-bold">
                          Required L{item.requiredLevel}
                        </span>
                        {item.metRequirement && (
                          <span className="text-[10px] font-black uppercase text-emerald-600">Requirement met</span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-600 italic mt-2 max-w-2xl">{item.recommendation}</p>
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-slate-500">
                        {item.courseTitle && (
                          <span className="flex items-center gap-1">
                            <BookOpen size={11} className="text-blue-600" /> {item.courseTitle}
                          </span>
                        )}
                        <span>Target: {fmtDate(item.targetDate)}</span>
                        {item.completedAt && <span>Completed: {fmtDate(item.completedAt)}</span>}
                        {item.signedOffAt && (
                          <span>
                            Signed off {fmtDate(item.signedOffAt)} by{' '}
                            {dataService.getUserById(item.signedOffBy || '')?.name || 'a supervisor'}
                            {item.levelAtSignOff !== undefined && ` at L${item.levelAtSignOff}`}
                          </span>
                        )}
                      </div>
                      {item.completionNote && (
                        <p className="text-[11px] text-slate-600 mt-2 p-2 bg-slate-50 border border-slate-100">
                          <span className="font-bold uppercase text-[9px] text-slate-400">Employee note: </span>
                          {item.completionNote}
                        </p>
                      )}
                      {item.signOffComment && (
                        <p className="text-[11px] text-slate-600 mt-2 p-2 bg-blue-50/60 border border-blue-100">
                          <span className="font-bold uppercase text-[9px] text-blue-500">Supervisor: </span>
                          {item.signOffComment}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {canEdit && !closed && (
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {!item.supervisorSignOff && (
                          <select
                            disabled={busy}
                            value={item.status}
                            onChange={e => {
                              const next = e.target.value as DevelopmentItemStatus;
                              if (next === 'COMPLETED') {
                                setNoteFor(item.id);
                                setNoteText(item.completionNote || '');
                              } else {
                                run(() => dataService.setDevelopmentPlanItemStatus(plan.id, item.id, next));
                              }
                            }}
                            className="text-[10px] font-bold uppercase border border-slate-300 px-2 py-1.5 bg-white"
                          >
                            {(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as DevelopmentItemStatus[]).map(s => (
                              <option key={s} value={s}>
                                {DEVELOPMENT_ITEM_STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        )}
                        {canSupervise && item.status === 'COMPLETED' && !item.supervisorSignOff && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              setSignOffFor(item.id);
                              setSignOffText('');
                            }}
                            className="flex items-center gap-1 text-[10px] font-black uppercase px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            <ShieldCheck size={12} /> Sign Off
                          </button>
                        )}
                        {!canSupervise && item.status === 'COMPLETED' && !item.supervisorSignOff && (
                          <span className="text-[10px] font-bold uppercase text-amber-600">Awaiting sign-off</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Completion note capture */}
                  {noteFor === item.id && (
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200">
                      <label className="text-[10px] font-black uppercase text-slate-500">
                        What was done? (optional, but it is what the supervisor reads)
                      </label>
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        rows={2}
                        className="w-full mt-1 text-xs border border-slate-300 p-2"
                        placeholder="e.g. Completed the 5-day course and applied it on the turnaround."
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={() => setNoteFor(null)}
                          className="text-[10px] font-black uppercase px-3 py-1.5 border border-slate-300 text-slate-600"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            await run(() =>
                              dataService.setDevelopmentPlanItemStatus(plan.id, item.id, 'COMPLETED', noteText),
                            );
                            setNoteFor(null);
                          }}
                          className="text-[10px] font-black uppercase px-3 py-1.5 bg-slate-900 text-white disabled:opacity-50"
                        >
                          Mark Complete
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sign-off capture */}
                  {signOffFor === item.id && (
                    <div className="mt-3 p-3 bg-blue-50/60 border border-blue-200">
                      <p className="text-[11px] text-blue-900">
                        Signing off records today's level (<strong>L{item.currentLevel}</strong>) against the level at
                        planning (L{item.levelAtPlanning}), so the effect of this training stays on the record.
                      </p>
                      <textarea
                        value={signOffText}
                        onChange={e => setSignOffText(e.target.value)}
                        rows={2}
                        className="w-full mt-2 text-xs border border-blue-200 p-2"
                        placeholder="Supervisor comment (optional)"
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={() => setSignOffFor(null)}
                          className="text-[10px] font-black uppercase px-3 py-1.5 border border-slate-300 text-slate-600 bg-white"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={busy}
                          onClick={async () => {
                            await run(() =>
                              dataService.signOffDevelopmentPlanItem(plan.id, item.id, viewer.id, signOffText),
                            );
                            setSignOffFor(null);
                          }}
                          className="text-[10px] font-black uppercase px-3 py-1.5 bg-blue-600 text-white disabled:opacity-50"
                        >
                          Confirm Sign-Off
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {history.length > 0 && (
        <PlanHistory plans={history} open={showHistory} onToggle={() => setShowHistory(v => !v)} />
      )}
    </div>
  );
};

// ── small presentational pieces ─────────────────────────────────────────────

const PanelHeader: React.FC<{ coverage: CompetencyCoverage }> = ({ coverage }) => (
  <div className="p-6 border border-slate-200 bg-slate-50/50">
    <div className="flex items-center gap-3 mb-2">
      <Target size={22} className="text-slate-900" />
      <h2 className="text-xl font-black uppercase tracking-tight">Individual Development Plan</h2>
    </div>
    <p className="text-slate-500 text-xs font-medium">
      Agreed training against measured gaps — saved, tracked to completion, signed off by a supervisor, and
      re-measured so the effect is on the record.
    </p>
    <CoverageNote coverage={coverage} className="text-[10px] font-bold uppercase tracking-wide mt-3" />
  </div>
);

const Stat: React.FC<{
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone?: string;
}> = ({ label, value, sub, icon, tone }) => (
  <div className="p-4">
    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
      {icon} {label}
    </div>
    <div className={`text-2xl font-black mt-1 ${tone || 'text-slate-900'}`}>{value}</div>
    <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
  </div>
);

const ProposedRow: React.FC<{ item: DevelopmentPlanItem }> = ({ item }) => (
  <div className="p-4 flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-sm font-black uppercase tracking-tight text-slate-900">{item.skillName}</h5>
        <span
          className={`text-[9px] font-black uppercase px-2 py-0.5 border ${
            item.priority === 'HIGH'
              ? 'bg-red-50 text-red-700 border-red-200'
              : item.priority === 'MEDIUM'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : 'bg-slate-50 text-slate-500 border-slate-200'
          }`}
        >
          {item.priority}
        </span>
        {/* Why this line sits where it does: priority is the gap weighted by
            how much the skill matters, so the judgement is visible here too. */}
        <CriticalityBadge criticality={dataService.getSkill(item.skillId)?.criticality} />
      </div>
      <p className="text-[11px] text-slate-600 italic mt-1 max-w-2xl">{item.recommendation}</p>
      {item.courseTitle && (
        <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
          <BookOpen size={11} className="text-blue-600" /> {item.courseTitle}
        </p>
      )}
    </div>
    <div className="text-[11px] font-bold text-slate-600 shrink-0">
      L{item.levelAtPlanning} → L{item.requiredLevel}
      <span className="ml-2 text-slate-400">gap {item.gapAtPlanning}</span>
    </div>
  </div>
);

const EmptyState: React.FC<{
  tone: 'amber' | 'emerald';
  icon: React.ReactNode;
  title: string;
  body: string;
}> = ({ icon, title, body }) => (
  <div className="text-center py-12 bg-white border border-slate-200">
    <div className="flex justify-center mb-3">{icon}</div>
    <h4 className="text-lg font-black uppercase tracking-tight">{title}</h4>
    <p className="text-slate-500 text-sm mt-2 max-w-lg mx-auto">{body}</p>
  </div>
);

const ErrorNote: React.FC<{ message: string; onDismiss: () => void; inline?: boolean }> = ({
  message,
  onDismiss,
  inline,
}) => (
  <div className={`flex items-start justify-between gap-3 p-3 bg-red-50 border border-red-200 ${inline ? 'border-x-0' : ''}`}>
    <p className="text-[11px] text-red-700">{message}</p>
    <button onClick={onDismiss} className="text-red-400 hover:text-red-600">
      <X size={14} />
    </button>
  </div>
);

const PlanHistory: React.FC<{ plans: DevelopmentPlan[]; open: boolean; onToggle: () => void }> = ({
  plans,
  open,
  onToggle,
}) => (
  <div className="bg-white border border-slate-200">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50"
    >
      <span className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-2">
        <History size={14} /> Previous Plans ({plans.length})
      </span>
      <span className="text-[10px] font-bold uppercase text-slate-400">{open ? 'Hide' : 'Show'}</span>
    </button>
    {open && (
      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {plans.map(plan => {
          const signedOff = plan.items.filter(i => i.supervisorSignOff).length;
          return (
            <div key={plan.id} className="p-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800">{plan.title}</span>
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 border ${planStatusTone[plan.status]}`}>
                    {DEVELOPMENT_PLAN_STATUS_LABELS[plan.status]}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {fmtDate(plan.createdAt)} → {fmtDate(plan.completedAt || plan.archivedAt)} · {plan.items.length} items
                  · {signedOff} signed off
                </p>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
