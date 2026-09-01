import React, { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { safeExportRow } from '../utils/fileUpload';
import {
  GraduationCap, Download, Users, AlertTriangle, TrendingDown, Search, BookOpen, Layers, Wallet,
} from 'lucide-react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { useSessionState } from '../hooks/useSessionState';
import {
  User, Role, Department, TrainingNeed, TrainingNeedsAnalysis as TNA,
  SKILL_CRITICALITY_LABELS, skillCriticalityOf,
} from '../types';
import { CoverageMeter, CoverageNote, CompliancePercent } from '../components/CoverageIndicator';
import { CriticalityBadge } from '../components/CriticalityBadge';

// Every exported cell goes through `safeExportCell`: a value that begins with
// = + - @ is executed as a FORMULA when the file is opened in Excel or Sheets,
// on the recipient's machine. Skill names, course titles and notes are all free
// text somebody typed into this app, so the export is the injection point.
const addSafeRow = (ws: ExcelJS.Worksheet, values: unknown[]) => ws.addRow(safeExportRow(values));


/**
 * TRAINING NEEDS ANALYSIS — the departmental answer to "what training do we
 * need to buy". The maths runs on the SERVER (`GET /analytics/training-needs`,
 * server/src/analytics/aggregate.ts); this page picks the scope, shows the rows
 * and exports them. It used to compute the lot in the browser, which meant
 * downloading the whole company to answer a question about one section.
 *
 * Three rules it must not break:
 *  - A never-assessed requirement is an ASSESSMENT need, not a training gap. It
 *    is listed separately and shaded amber, and it never inflates a priority.
 *  - No percentage without its base — every figure here carries "X of Y
 *    measured" (see components/CoverageIndicator).
 *  - No total without its base either: the estimated cost always says how many
 *    skills with a gap could NOT be priced, because a catalogue with no price
 *    on a course would otherwise make the bill look smaller than it is.
 *
 * Rows are ordered by WEIGHTED gap (head count × depth × the skill's
 * criticality), so the top of the table is where the budget should go first.
 */

const COMPANY_SCOPE = '__ALL__';
const TEAM_SCOPE = '__TEAM__';

const PRIORITY_PILL: Record<TrainingNeed['priority'], string> = {
  HIGH: 'bg-rose-50 text-rose-700 border-rose-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-slate-50 text-slate-600 border-slate-200',
};

/** Departments ordered as a tree, with a depth for indenting the picker. */
const buildDeptTree = (depts: Department[]): { dept: Department; depth: number }[] => {
  const byParent = new Map<string, Department[]>();
  const ids = new Set(depts.map(d => d.id));
  for (const d of depts) {
    // A unit whose parent is missing is treated as a root, so nothing is hidden.
    const key = d.parentId && ids.has(d.parentId) ? d.parentId : '';
    byParent.set(key, [...(byParent.get(key) || []), d]);
  }
  const out: { dept: Department; depth: number }[] = [];
  const walk = (parent: string, depth: number, seen: Set<string>) => {
    const children = [...(byParent.get(parent) || [])].sort((a, b) => a.name.localeCompare(b.name));
    for (const dept of children) {
      if (seen.has(dept.id)) continue; // cycle guard
      seen.add(dept.id);
      out.push({ dept, depth });
      walk(dept.id, depth + 1, seen);
    }
  };
  walk('', 0, new Set());
  return out;
};

export const TrainingNeedsAnalysis: React.FC<{ user: User }> = ({ user }) => {
  const storeVersion = useStoreData();

  const isOrgWide = user.role === Role.ADMIN || user.role === Role.CEO;
  const [scopeId, setScopeId] = useSessionState<string>(
    'tna-scope', isOrgWide ? COMPANY_SCOPE : TEAM_SCOPE,
  );
  const [includeSubUnits, setIncludeSubUnits] = useSessionState<boolean>('tna-subunits', true);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const departments = useMemo(() => dataService.getAllDepartments(), [storeVersion]);

  // Which units the viewer may analyse. Admin/CEO see the whole chart; a
  // manager sees only the units they run (their team is always available).
  const selectableDepts = useMemo(() => {
    const tree = buildDeptTree(departments);
    if (isOrgWide) return tree;
    const mine = new Set(
      departments.filter(d => d.managerId === user.id).flatMap(d => dataService.getDepartmentSubtreeIds(d.id)),
    );
    return tree.filter(({ dept }) => mine.has(dept.id));
  }, [departments, isOrgWide, user.id, storeVersion]);

  const canPickTeam = !isOrgWide;

  // What the server is asked for. It re-checks the scope itself: a manager may
  // ask for their own team or a unit they run, and gets a 403 for anything else.
  const serverScope = useMemo(() => {
    if (scopeId === COMPANY_SCOPE && isOrgWide) return 'company';
    if (scopeId === TEAM_SCOPE || !departments.some(d => d.id === scopeId)) return 'team';
    return scopeId;
  }, [scopeId, departments, isOrgWide]);

  const [result, setResult] = useState<TNA | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Re-asked on a scope change and whenever the store reports new data, so the
  // page stays as live as it was when it computed everything locally. The
  // server holds the loaded model for a few seconds, so a poll is cheap.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dataService.getTrainingNeeds(serverScope, { includeSubUnits })
      .then(res => {
        if (cancelled) return;
        setResult(res);
        setError(null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load the training needs analysis.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [serverScope, includeSubUnits, storeVersion]);

  // Nothing loaded yet is NOT "zero needs" — the empty shape below only ever
  // feeds the markup while the loading panel is the thing on screen.
  const analysis: TNA = result ?? {
    headcount: 0, withRequirements: 0, needs: [],
    budget: {
      skillsCosted: 0, skillsUncosted: 0, seatsCosted: 0, seatsUncosted: 0,
      estimatedCost: null, estimatedHours: null,
    },
    coverage: {
      required: 0, measured: 0, provisional: 0, unknown: 0, known: 0,
      measuredPct: 0, knownPct: 0, compliantKnown: 0, gapsKnown: 0,
      compliancePct: null, totalGap: 0, avgGap: null,
    },
  };

  const scopeLabel = analysis.scope?.label
    ?? (serverScope === 'company' ? 'Whole company'
      : serverScope === 'team' ? 'My team'
      : departments.find(d => d.id === serverScope)?.name ?? 'Selected unit');

  const visibleNeeds = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return analysis.needs;
    return analysis.needs.filter(n =>
      n.skillName.toLowerCase().includes(term) || (n.skillCategory || '').toLowerCase().includes(term));
  }, [analysis, search]);

  const totals = useMemo(() => ({
    skillsWithGap: analysis.needs.filter(n => n.gapCount > 0).length,
    peopleSkillGaps: analysis.needs.reduce((sum, n) => sum + n.gapCount, 0),
    skillsUnmeasured: analysis.needs.filter(n => n.unknown > 0).length,
    highPriority: analysis.needs.filter(n => n.priority === 'HIGH').length,
    // The rows a manager cannot defer: a gap on something safety critical.
    safetySeats: analysis.needs
      .filter(n => skillCriticalityOf(n.criticality) === 'SAFETY_CRITICAL')
      .reduce((sum, n) => sum + n.gapCount, 0),
    safetySkills: analysis.needs
      .filter(n => skillCriticalityOf(n.criticality) === 'SAFETY_CRITICAL' && n.gapCount > 0).length,
  }), [analysis]);

  // An older server (or the empty shape above) may carry no budget block; a
  // missing estimate must read as "not priced", never as zero cost.
  const budget = analysis.budget ?? {
    skillsCosted: 0, skillsUncosted: totals.skillsWithGap, seatsCosted: 0,
    seatsUncosted: totals.peopleSkillGaps, estimatedCost: null, estimatedHours: null,
  };

  const money = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 0 });

  const exportExcel = async () => {
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Training Needs');
      const c = analysis.coverage;
      addSafeRow(ws, ['Training Needs Analysis']);
      addSafeRow(ws, ['Scope', scopeLabel]);
      addSafeRow(ws, ['Generated', new Date().toLocaleString()]);
      addSafeRow(ws, ['Employees in scope', analysis.headcount]);
      addSafeRow(ws, ['Employees with a job profile', analysis.withRequirements]);
      addSafeRow(ws, ['Requirements measured', `${c.measured} of ${c.required}`]);
      addSafeRow(ws, ['Never assessed', c.unknown]);
      // The bill, always beside what it does NOT cover.
      addSafeRow(ws, [
        'Estimated cost',
        budget.estimatedCost === null ? 'not priced' : budget.estimatedCost,
        budget.skillsUncosted > 0
          ? `covers ${budget.skillsCosted} of ${budget.skillsCosted + budget.skillsUncosted} skills with a gap (${budget.seatsUncosted} seats unpriced)`
          : 'covers every skill with a gap',
      ]);
      addSafeRow(ws, []);
      addSafeRow(ws, [
        'Skill', 'Category', 'Criticality', 'Gap weight', 'Employees requiring', 'Measured', 'Provisional',
        'Never assessed', 'With a gap', 'Share of measured with a gap (%)',
        'Average gap (levels)', 'Total gap (levels)', 'Weighted gap', 'Highest level required',
        'Urgency score', 'Priority', 'Cost per seat', 'Estimated cost', 'Training hours',
        'Linked courses',
      ]);
      ws.getRow(1).font = { bold: true, size: 14 };
      ws.getRow(10).font = { bold: true };
      for (const n of analysis.needs) {
        const criticality = skillCriticalityOf(n.criticality);
        addSafeRow(ws, [
          n.skillName, n.skillCategory || '', SKILL_CRITICALITY_LABELS[criticality], n.criticalityWeight,
          n.employeesRequiring, n.measured, n.provisional,
          n.unknown, n.gapCount, n.affectedPct === null ? 'n/a' : n.affectedPct,
          n.gapCount > 0 ? Number(n.averageGap.toFixed(2)) : 0, Number(n.totalGap.toFixed(2)),
          Number(n.weightedGap.toFixed(2)), n.maxRequiredLevel,
          n.priorityScore === null ? 'n/a' : n.priorityScore, n.priority,
          n.seatCost === null ? 'not priced' : n.seatCost,
          n.estimatedCost === null ? 'not priced' : n.estimatedCost,
          n.estimatedHours === null ? 'n/a' : n.estimatedHours,
          n.courses.map(co => `${co.title} (${co.provider})`).join('; '),
        ]);
      }
      ws.columns.forEach(col => { col.width = 22; });
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `training_needs_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('TNA export failed', err);
    } finally {
      setExporting(false);
    }
  };

  const coverage = analysis.coverage;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <div className="bg-white border border-slate-200 shadow-sm p-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-slate-900 text-white flex items-center justify-center shrink-0">
            <GraduationCap size={22} />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Training Needs Analysis</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Every position requirement in the selected unit, aggregated by skill. Gaps are counted
              only where somebody was actually measured — never-assessed skills are listed as
              assessment work, not as a training bill.
            </p>
          </div>
        </div>
        <button
          onClick={exportExcel}
          disabled={exporting || analysis.needs.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Download size={14} /> {exporting ? 'Preparing…' : 'Export to Excel'}
        </button>
      </div>

      {/* Scope bar */}
      <div className="bg-white border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-slate-400" />
          <label htmlFor="tna-scope" className="text-[10px] font-black uppercase tracking-widest text-slate-500">Scope</label>
        </div>
        <select
          id="tna-scope"
          value={scopeId}
          onChange={e => setScopeId(e.target.value)}
          className="min-w-[16rem] px-3 py-2 border border-slate-300 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {isOrgWide && <option value={COMPANY_SCOPE}>Whole company</option>}
          {canPickTeam && <option value={TEAM_SCOPE}>My team (everyone reporting to me)</option>}
          {selectableDepts.map(({ dept, depth }) => (
            <option key={dept.id} value={dept.id}>
              {'  '.repeat(depth) + dept.name}
            </option>
          ))}
        </select>

        {scopeId !== COMPANY_SCOPE && scopeId !== TEAM_SCOPE && (
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSubUnits}
              onChange={e => setIncludeSubUnits(e.target.checked)}
              className="w-4 h-4 accent-slate-900"
            />
            Include sub-units
          </label>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <Search size={14} className="text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter skills…"
            className="px-3 py-2 border border-slate-300 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* The figures. Until the server answers, the page says so — it never
          shows a zeroed analysis, which would read as "no training needed". */}
      {error ? (
        <div className="bg-rose-50 border border-rose-200 p-6 flex items-start gap-3">
          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-900">
            <p className="font-black uppercase tracking-widest text-[10px] mb-1">Analysis unavailable</p>
            <p>{error}</p>
            <p className="text-xs mt-2 text-rose-700">
              These figures are computed on the server. Check the connection and try the scope again.
            </p>
          </div>
        </div>
      ) : loading && !result ? (
        <div className="space-y-4 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 bg-slate-100 border border-slate-200" />
            ))}
          </div>
          <div className="h-64 bg-slate-100 border border-slate-200" />
          <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
            Computing the analysis on the server…
          </p>
        </div>
      ) : (
        <>
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <Users size={12} /> Employees
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{analysis.headcount}</p>
          <p className="text-[10px] text-slate-500 mt-1">{analysis.withRequirements} with a job profile</p>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Assessment coverage</div>
          <p className="text-3xl font-black text-slate-900 mt-2">{coverage.measuredPct}%</p>
          <CoverageMeter coverage={coverage} className="mt-2" label="Measured" />
        </div>

        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <TrendingDown size={12} /> Skills needing training
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{totals.skillsWithGap}</p>
          <p className="text-[10px] text-slate-500 mt-1">{totals.highPriority} high priority</p>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Employee-skill gaps</div>
          <p className="text-3xl font-black text-slate-900 mt-2">{totals.peopleSkillGaps}</p>
          <p className="text-[10px] text-slate-500 mt-1">
            seats to fill
            {totals.safetySeats > 0 && (
              <span className="text-rose-600 font-bold"> · {totals.safetySeats} safety critical</span>
            )}
          </p>
        </div>

        {/* The budget-ready figure. It is an ESTIMATE at catalogue prices, and
            it always says how much of the bill nobody can price yet. */}
        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <Wallet size={12} /> Estimated cost
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">
            {budget.estimatedCost === null ? '—' : money(budget.estimatedCost)}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">
            {budget.estimatedCost === null
              ? 'No linked course carries a price'
              : `${budget.seatsCosted} seat${budget.seatsCosted === 1 ? '' : 's'} priced`}
            {budget.skillsUncosted > 0 && (
              <span className="text-amber-600 font-bold"> · {budget.skillsUncosted} skill{budget.skillsUncosted === 1 ? '' : 's'} unpriced</span>
            )}
          </p>
        </div>

        <div className="bg-white border border-slate-200 shadow-sm p-4">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
            <AlertTriangle size={12} className={coverage.unknown > 0 ? 'text-amber-500' : ''} /> Never assessed
          </div>
          <p className="text-3xl font-black text-slate-900 mt-2">{coverage.unknown}</p>
          <p className="text-[10px] text-slate-500 mt-1">of {coverage.required} requirements</p>
        </div>
      </div>

      {/* Confidence banner */}
      {coverage.required > 0 && coverage.unknown > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <p className="font-bold uppercase tracking-wide text-[10px] mb-1">Read this before budgeting</p>
            <p>
              {coverage.unknown} of {coverage.required} requirements in <strong>{scopeLabel}</strong> have never
              been assessed, so this analysis is based on the {coverage.known} that are known
              ({coverage.knownPct}% of the unit). Compliance across what has been measured is{' '}
              <CompliancePercent coverage={coverage} className="font-bold" />. Assess the missing
              skills before treating the list below as the full training bill.
            </p>
          </div>
        </div>
      )}

      {/* The table */}
      <div className="bg-white border border-slate-200 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">
            Skill needs — {scopeLabel}
          </h2>
          <CoverageNote coverage={coverage} className="text-[10px] font-bold uppercase tracking-wide" />
        </div>

        {analysis.headcount === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            No employees in this scope yet.
          </p>
        ) : analysis.withRequirements === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            Nobody in this scope is assigned to a job profile, so there are no requirements to analyse.
            Assign job profiles in Admin → Departments first.
          </p>
        ) : visibleNeeds.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            {analysis.needs.length === 0
              ? 'No outstanding needs — every measured requirement in this unit is met and nothing is unassessed.'
              : 'No skill matches that filter.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <th className="text-left px-6 py-3">Skill</th>
                  <th className="text-center px-3 py-3">Criticality</th>
                  <th className="text-right px-3 py-3">Requires it</th>
                  <th className="text-left px-3 py-3 w-48">Measured</th>
                  <th className="text-right px-3 py-3">With a gap</th>
                  <th className="text-right px-3 py-3">Avg gap</th>
                  <th className="text-right px-3 py-3">Never assessed</th>
                  <th className="text-center px-3 py-3">Priority</th>
                  <th className="text-right px-3 py-3">Est. cost</th>
                  <th className="text-left px-6 py-3">Course</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleNeeds.map(n => (
                  <tr key={n.skillId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-bold text-slate-900">{n.skillName}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                        {n.skillCategory || 'Uncategorised'} · required up to L{n.maxRequiredLevel}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CriticalityBadge criticality={n.criticality} />
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">{n.employeesRequiring}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 bg-slate-100 overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${Math.round((n.measured / Math.max(1, n.employeesRequiring)) * 100)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                          {n.measured}/{n.employeesRequiring}
                          {n.provisional > 0 && ` +${n.provisional}p`}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-black text-slate-900">{n.gapCount}</span>
                      {n.affectedPct !== null && (
                        <span className="text-[10px] text-slate-400 ml-1">({n.affectedPct}%)</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">
                      {n.gapCount > 0 ? n.averageGap.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {n.unknown > 0
                        ? <span className="font-bold text-amber-600">{n.unknown}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        title={n.priorityScore === null
                          ? 'Nothing measured on this skill yet — an assessment need, not a training priority.'
                          : `Urgency ${n.priorityScore}: ${n.affectedPct}% of the measured fall short, average gap ${n.averageGap.toFixed(1)} levels, ${SKILL_CRITICALITY_LABELS[skillCriticalityOf(n.criticality)].toLowerCase()} ×${n.criticalityWeight}`}
                        className={`inline-block px-2 py-1 border text-[9px] font-black uppercase tracking-widest ${PRIORITY_PILL[n.priority]}`}
                      >
                        {n.priority}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {n.estimatedCost === null ? (
                        <span
                          className="text-[10px] italic text-slate-400"
                          title={n.gapCount === 0 ? 'No gap to cost' : 'No linked course carries a price per seat'}
                        >
                          {n.gapCount === 0 ? '—' : 'Not priced'}
                        </span>
                      ) : (
                        <>
                          <span className="font-bold text-slate-900">{money(n.estimatedCost)}</span>
                          <span className="block text-[10px] text-slate-400">
                            {n.gapCount} × {money(n.seatCost ?? 0)}
                          </span>
                        </>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      {n.courses.length > 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                          <BookOpen size={12} className="text-slate-400 shrink-0" />
                          {n.courses[0].title}
                          {n.courses.length > 1 && (
                            <span className="text-[10px] text-slate-400">+{n.courses.length - 1}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[10px] italic text-slate-400">No course linked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-6 py-3 border-t border-slate-100 text-[10px] text-slate-500">
              Ordered worst first by weighted gap — how many people fall short, how far, and how much
              the skill matters (safety critical ×3, business critical ×2, standard ×1, nice to have ×0.5).
              Set a skill's criticality in Admin → Skill Standards.
              {budget.skillsUncosted > 0 && (
                <> Costs are catalogue prices for the cheapest linked course; <strong>{budget.skillsUncosted}</strong> skill
                  {budget.skillsUncosted === 1 ? '' : 's'} with a gap ({budget.seatsUncosted} seat
                  {budget.seatsUncosted === 1 ? '' : 's'}) carry no priced course, so the total above is a floor,
                  not the full bill.</>
              )}
            </p>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
};
