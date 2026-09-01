import React, { useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import { safeExportRow } from '../utils/fileUpload';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import {
  CompetencySnapshot, OrgOverview, DepartmentCoverageRow, OrgSkillGapRow,
  SKILL_CRITICALITY_LABELS, skillCriticalityOf,
} from '../types';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import {
  Activity, TrendingUp, Users, History, AlertTriangle, Download, Flame, Building2,
  ArrowUpDown, UserX,
} from 'lucide-react';
import { CoverageMeter, CoverageNote, CompliancePercent } from '../components/CoverageIndicator';
import { CriticalityBadge } from '../components/CriticalityBadge';

// Every exported cell goes through `safeExportCell`: a value that begins with
// = + - @ is executed as a FORMULA when the file is opened in Excel or Sheets,
// on the recipient's machine. Skill names, course titles and notes are all free
// text somebody typed into this app, so the export is the injection point.
const addSafeRow = (ws: ExcelJS.Worksheet, values: unknown[]) => ws.addRow(safeExportRow(values));


// ============================================================================
// Organization Analytics — the executive read of the competency position:
// where we are now, where the worst skills are, which units are behind, and
// where we were in past months.
//
// Everything here comes from the SERVER (`GET /analytics/overview` for the live
// picture, `GET /analytics/snapshots` for the stored history). The page used to
// rebuild the trend IN THE BROWSER by replaying assessment records: it counted a
// never-assessed skill as a full gap and ignored evidence and work-experience
// scores, so its line disagreed with every other screen (finding 6). It also
// scored the whole company locally to fill one tile (finding 7).
//
// Two rules this page must keep:
//  - NO PLACEHOLDER NUMBER WHILE A FIGURE IS IN FLIGHT. A zeroed coverage tile
//    reads as a finding, which is the exact lie the coverage rule removes — so
//    the tiles and tables show a skeleton, "—" or "Measuring…" until the server
//    answers.
//  - NO PERCENTAGE WITHOUT ITS BASE. Every compliance figure carries "X of Y
//    measured" (components/CoverageIndicator), and a scope with nothing measured
//    prints "—", never 0%.
//
// Consequence worth stating plainly on the page: history starts when the first
// snapshot is taken. Nothing is back-filled, because the past cannot be
// recomputed — assessing someone today would make last June look better than it
// actually was.
// ============================================================================

const monthLabel = (period: string): string => {
  const [year, month] = period.split('-');
  const d = new Date(Number(year), Number(month) - 1);
  return Number.isNaN(d.getTime()) ? period : d.toLocaleString('default', { month: 'short', year: 'numeric' });
};

/** Department comparison sort keys. `avgGap` / `compliancePct` are nullable —
 *  a unit nobody measured has no score and must sort LAST either way, never as
 *  a zero that flatters or condemns it. */
type DeptSortKey = 'name' | 'headcount' | 'measuredPct' | 'compliancePct' | 'avgGap' | 'unknown';

const DEPT_SORT_LABEL: Record<DeptSortKey, string> = {
  name: 'Unit',
  headcount: 'People',
  measuredPct: 'Coverage',
  compliancePct: 'Compliance',
  avgGap: 'Avg gap',
  unknown: 'Never assessed',
};

export const sortDepartments = (rows: DepartmentCoverageRow[], key: DeptSortKey): DepartmentCoverageRow[] => {
  const value = (r: DepartmentCoverageRow): number | null => {
    switch (key) {
      case 'headcount': return r.headcount;
      case 'measuredPct': return r.coverage.measuredPct;
      case 'compliancePct': return r.coverage.compliancePct;
      case 'avgGap': return r.coverage.avgGap;
      case 'unknown': return r.coverage.unknown;
      default: return null;
    }
  };
  return [...rows].sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name);
    const av = value(a);
    const bv = value(b);
    // Unknown last, whichever direction the column runs.
    if (av === null && bv === null) return a.name.localeCompare(b.name);
    if (av === null) return 1;
    if (bv === null) return -1;
    // Worst first for the two "bad news" columns, biggest first for the rest.
    const desc = key === 'avgGap' || key === 'unknown' || key === 'headcount';
    const asc = key === 'measuredPct' || key === 'compliancePct';
    if (desc) return bv - av || a.name.localeCompare(b.name);
    if (asc) return av - bv || a.name.localeCompare(b.name);
    return 0;
  });
};

const pct = (v: number | null): string => (v === null ? '—' : `${v}%`);

export const AdminAnalytics: React.FC = () => {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');
  const [deptSort, setDeptSort] = useState<DeptSortKey>('avgGap');
  const [exporting, setExporting] = useState(false);

  const storeVersion = useStoreData();

  const depts = useMemo(() => dataService.getAllDepartments(), [storeVersion]);
  const deptNames = useMemo(() => new Map(depts.map(d => [d.id, d.name])), [depts]);

  const allAssessments = useMemo(() => dataService.getAssessments({}), [storeVersion]);

  // ── The live picture ──────────────────────────────────────────────────────
  //
  // Computed SERVER-side (`GET /analytics/overview`) on the same scoring port as
  // the stored snapshots below, so the live tiles and the last point on the
  // trend are one measure. It also stops this page scoring the whole company in
  // the browser just to fill a tile.
  const [overview, setOverview] = useState<OrgOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Clearing the figure is a SCOPE change, not a refresh. `storeVersion` bumps
  // on every poll tick, so blanking the state in the fetch effect made the whole
  // page drop to skeletons every few seconds. The "no placeholder number while a
  // figure is in flight" rule still holds: the skeleton shows on first load and
  // whenever the scope changes — when there genuinely is no figure yet — while a
  // background refresh of an already-loaded scope swaps the numbers in place.
  useEffect(() => {
    setOverview(null);
    setOverviewError(null);
  }, [selectedDeptId]);

  useEffect(() => {
    let cancelled = false;
    dataService
      .getOrgOverview(selectedDeptId)
      .then(res => { if (!cancelled) { setOverview(res); setOverviewError(null); } })
      .catch(err => { if (!cancelled) setOverviewError(err?.message || 'Could not load live coverage.'); });
    return () => { cancelled = true; };
  }, [selectedDeptId, storeVersion]);

  const coverage = overview?.coverage ?? null;

  const scopeLabel = overview?.scope?.label
    ?? (selectedDeptId === 'ALL' ? 'Whole company' : deptNames.get(selectedDeptId) ?? 'Selected unit');

  // Assessments recorded for the people in scope. A raw activity count, not a
  // competency figure — it is the one number here that is still counted in the
  // browser, and it is cheap because the records are already in memory.
  const assessmentCount = useMemo(() => {
    if (!overview) return null;
    if (overview.scope.kind === 'COMPANY') return allAssessments.length;
    const inScope = new Set(overview.people.map(p => p.userId));
    return allAssessments.filter(a => inScope.has(a.subjectId)).length;
  }, [overview, allAssessments]);

  const hotspots: OrgSkillGapRow[] = overview?.topSkillGaps ?? [];

  const sortedDepartments = useMemo(
    () => sortDepartments(overview?.departments ?? [], deptSort),
    [overview, deptSort],
  );

  // ── Stored history ────────────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState<CompetencySnapshot[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshots(null);
    setHistoryError(null);
    dataService
      .getCompetencySnapshots(selectedDeptId)
      .then(rows => { if (!cancelled) setSnapshots(rows); })
      .catch(err => { if (!cancelled) setHistoryError(err?.message || 'Could not load stored history.'); });
    return () => { cancelled = true; };
  }, [selectedDeptId]);

  const trendData = useMemo(
    () =>
      (snapshots || []).map(s => ({
        name: monthLabel(s.period),
        // null, never 0 — a month in which nothing was measured has no average
        // gap, and Recharts leaves a break in the line rather than drawing a
        // drop to zero that never happened.
        'Average Gap (measured)': s.avgGap,
        'Assessment Coverage %': s.measuredPct,
        _snapshot: s,
      })),
    [snapshots],
  );

  const latest = snapshots && snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const snap: CompetencySnapshot | undefined = payload[0]?.payload?._snapshot;
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-none">
        <p className="font-bold text-white text-xs mb-2">{label}</p>
        {payload.map((p: any, idx: number) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-none" style={{ background: p.color }}></div>
            <span className="text-slate-400">{p.name}:</span>
            <span className="font-bold text-white">{p.value === null ? '—' : p.value}</span>
          </div>
        ))}
        {snap && (
          // The base, always beside the percentage.
          <p className="text-[10px] text-slate-400 mt-2">
            {snap.measured} of {snap.required} skills measured · {snap.headcount} employees
          </p>
        )}
      </div>
    );
  };

  // ── Export ────────────────────────────────────────────────────────────────
  //
  // Five sheets, each carrying its own base: a compliance column is meaningless
  // in a spreadsheet without the measured count beside it, and "n/a" is written
  // where the app would print "—" — never a zero somebody could total up.
  const exportExcel = async () => {
    if (!overview) return;
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const c = overview.coverage;

      const summary = wb.addWorksheet('Summary');
      addSafeRow(summary, ['Organization Analytics']);
      addSafeRow(summary, ['Scope', scopeLabel]);
      addSafeRow(summary, ['Generated', new Date().toLocaleString()]);
      addSafeRow(summary, []);
      addSafeRow(summary, ['Employees in scope', overview.headcount]);
      addSafeRow(summary, ['With a job profile', overview.withRequirements]);
      addSafeRow(summary, ['Without a job profile', overview.withoutProfile]);
      addSafeRow(summary, ['Assessments recorded', assessmentCount ?? 'n/a']);
      addSafeRow(summary, []);
      addSafeRow(summary, ['Requirements', c.required]);
      addSafeRow(summary, ['Measured', c.measured]);
      addSafeRow(summary, ['Provisional (work experience)', c.provisional]);
      addSafeRow(summary, ['Never assessed', c.unknown]);
      addSafeRow(summary, ['Assessment coverage (%)', c.measuredPct]);
      addSafeRow(summary, ['Compliance over measured (%)', c.compliancePct === null ? 'n/a — nothing measured' : c.compliancePct]);
      addSafeRow(summary, ['Average gap over measured (levels)', c.avgGap === null ? 'n/a — nothing measured' : Number(c.avgGap.toFixed(2))]);
      addSafeRow(summary, ['Total gap (levels, measured only)', Number(c.totalGap.toFixed(2))]);
      summary.getRow(1).font = { bold: true, size: 14 };

      const hot = wb.addWorksheet('Skill hotspots');
      addSafeRow(hot, [
        'Skill', 'Category', 'Criticality', 'Gap weight', 'Employees requiring', 'Measured',
        'Provisional', 'Never assessed', 'With a gap', 'Share of measured with a gap (%)',
        'Average gap (levels)', 'Total gap (levels)', 'Weighted gap',
      ]);
      for (const s of hotspots) {
        addSafeRow(hot, [
          s.skillName, s.skillCategory || '', SKILL_CRITICALITY_LABELS[skillCriticalityOf(s.criticality)],
          s.criticalityWeight, s.employeesRequiring, s.measured, s.provisional, s.unknown, s.gapCount,
          s.affectedPct === null ? 'n/a' : s.affectedPct,
          s.gapCount > 0 ? Number(s.averageGap.toFixed(2)) : 0,
          Number(s.totalGap.toFixed(2)), Number(s.weightedGap.toFixed(2)),
        ]);
      }
      hot.getRow(1).font = { bold: true };

      const units = wb.addWorksheet('Departments');
      addSafeRow(units, [
        'Unit', 'Parent unit', 'People (incl. sub-units)', 'With a job profile', 'Requirements',
        'Measured', 'Provisional', 'Never assessed', 'Assessment coverage (%)',
        'Compliance over measured (%)', 'Average gap (levels)', 'Total gap (levels)',
      ]);
      for (const d of sortedDepartments) {
        addSafeRow(units, [
          d.name, d.parentId ? deptNames.get(d.parentId) ?? d.parentId : '', d.headcount, d.withRequirements,
          d.coverage.required, d.coverage.measured, d.coverage.provisional, d.coverage.unknown,
          d.coverage.measuredPct,
          d.coverage.compliancePct === null ? 'n/a' : d.coverage.compliancePct,
          d.coverage.avgGap === null ? 'n/a' : Number(d.coverage.avgGap.toFixed(2)),
          Number(d.coverage.totalGap.toFixed(2)),
        ]);
      }
      units.getRow(1).font = { bold: true };

      const people = wb.addWorksheet('People');
      addSafeRow(people, [
        'Employee', 'Unit', 'Org level', 'Requirements', 'Measured', 'Provisional', 'Never assessed',
        'Compliance over measured (%)', 'Average gap (levels)',
      ]);
      for (const p of overview.people) {
        addSafeRow(people, [
          p.name, p.departmentId ? deptNames.get(p.departmentId) ?? p.departmentId : '', p.orgLevel || '',
          p.coverage.required, p.coverage.measured, p.coverage.provisional, p.coverage.unknown,
          p.coverage.compliancePct === null ? 'n/a' : p.coverage.compliancePct,
          p.coverage.avgGap === null ? 'n/a' : Number(p.coverage.avgGap.toFixed(2)),
        ]);
      }
      people.getRow(1).font = { bold: true };

      const history = wb.addWorksheet('History');
      addSafeRow(history, ['Reading taken from the monthly snapshots. Nothing is back-filled — history starts at the first snapshot.']);
      addSafeRow(history, [
        'Month', 'Taken', 'Employees', 'Requirements', 'Measured', 'Never assessed',
        'Assessment coverage (%)', 'Compliance over measured (%)', 'Average gap (levels)',
      ]);
      for (const s of snapshots || []) {
        addSafeRow(history, [
          s.period, new Date(s.takenAt).toLocaleDateString(), s.headcount, s.required, s.measured, s.unknown,
          s.measuredPct,
          s.compliancePct === null ? 'n/a' : s.compliancePct,
          s.avgGap === null ? 'n/a' : Number(s.avgGap.toFixed(2)),
        ]);
      }
      history.getRow(2).font = { bold: true };

      for (const ws of [summary, hot, units, people, history]) {
        ws.columns.forEach(col => { col.width = 24; });
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `competency_analytics_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Analytics export failed', err);
    } finally {
      setExporting(false);
    }
  };

  const SortHeader: React.FC<{ column: DeptSortKey; align?: string }> = ({ column, align = 'text-right' }) => (
    <th className={`${align} px-3 py-3`}>
      <button
        onClick={() => setDeptSort(column)}
        className={`inline-flex items-center gap-1 uppercase tracking-widest ${deptSort === column ? 'text-slate-900' : 'hover:text-slate-700'}`}
        title={`Sort by ${DEPT_SORT_LABEL[column].toLowerCase()}`}
      >
        {DEPT_SORT_LABEL[column]}
        <ArrowUpDown size={10} className={deptSort === column ? 'opacity-100' : 'opacity-30'} />
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-300 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Organization Analytics</h2>
          <p className="text-slate-700 text-sm mt-1">
            Where the competency position stands, which skills and units are worst, and how it has moved.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-slate-700" htmlFor="analytics-scope">Filter by Department:</label>
          <select
            id="analytics-scope"
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-2.5 "
          >
            <option value="ALL">All Departments</option>
            {depts.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <button
            onClick={exportExcel}
            disabled={exporting || !overview}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Download size={14} /> {exporting ? 'Preparing…' : 'Export to Excel'}
          </button>
        </div>
      </div>

      {overviewError && (
        <div className="bg-rose-50 border border-rose-200 p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-rose-600 shrink-0 mt-0.5" />
          <div className="text-sm text-rose-900">
            <p className="font-black uppercase tracking-widest text-[10px] mb-1">Live figures unavailable</p>
            <p>{overviewError}</p>
            <p className="text-xs mt-2 text-rose-700">
              These numbers are computed on the server. The stored history below may still load.
            </p>
          </div>
        </div>
      )}

      {/* KPI row. Until the server answers, every figure reads "—" with a note
          saying it is still measuring — a zeroed tile reads as a finding. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-sm border border-slate-300">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
            <Users size={12} /> Employees in scope
          </div>
          <h3 className="text-3xl font-bold text-slate-900 mt-2">{overview ? overview.headcount : '—'}</h3>
          <p className="text-[10px] text-slate-500 mt-1">
            {overview
              ? <>{overview.withRequirements} with a job profile
                  {overview.withoutProfile > 0 && (
                    <span className="text-amber-600 font-bold"> · {overview.withoutProfile} without</span>
                  )}</>
              : 'Measuring…'}
            {selectedDeptId !== 'ALL' && overview && <span className="block text-slate-400">Includes sub-units</span>}
          </p>
        </div>

        <div className="bg-white p-5 rounded-sm border border-slate-300">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
            <Activity size={12} /> Assessment coverage
          </div>
          <h3 className="text-3xl font-bold text-slate-900 mt-2">
            {coverage ? `${coverage.measuredPct}%` : '—'}
          </h3>
          {coverage
            ? <CoverageMeter coverage={coverage} className="mt-2" />
            : <p className="text-[10px] text-slate-500 mt-1">Measuring…</p>}
        </div>

        <div className="bg-white p-5 rounded-sm border border-slate-300">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
            <TrendingUp size={12} /> Compliance (measured)
          </div>
          <h3 className="text-3xl font-bold text-slate-900 mt-2">
            {coverage ? <CompliancePercent coverage={coverage} /> : '—'}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            {coverage
              ? <CoverageNote coverage={coverage} emphasizeUnknown={false} />
              : 'Measuring…'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-sm border border-slate-300">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
            <Flame size={12} /> Avg gap (measured)
          </div>
          <h3 className="text-3xl font-bold text-slate-900 mt-2">
            {!coverage || coverage.avgGap === null ? '—' : coverage.avgGap.toFixed(2)}
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            {!coverage
              ? 'Measuring…'
              : coverage.avgGap === null
                ? 'Nothing measured yet in this scope'
                : `${coverage.totalGap.toFixed(1)} levels short in total`}
          </p>
        </div>

        <div className="bg-white p-5 rounded-sm border border-slate-300">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
            <AlertTriangle size={12} className={coverage && coverage.unknown > 0 ? 'text-amber-500' : ''} /> Never assessed
          </div>
          <h3 className="text-3xl font-bold text-slate-900 mt-2">{coverage ? coverage.unknown : '—'}</h3>
          <p className="text-[10px] text-slate-500 mt-1">
            {coverage
              ? <>of {coverage.required} requirements · {assessmentCount ?? '—'} assessments recorded</>
              : 'Measuring…'}
          </p>
        </div>
      </div>

      {/* Skill hotspots — the worst skills in scope, ranked the SAME way the
          training-needs table ranks them, so the two screens agree on which
          skill is worst. */}
      <div className="bg-white rounded-sm border border-slate-300">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-slate-900" />
            <h4 className="font-bold text-slate-900">Skill hotspots — {scopeLabel}</h4>
          </div>
          {coverage && <CoverageNote coverage={coverage} className="text-[10px] font-bold uppercase tracking-wide" />}
        </div>

        {!overview ? (
          <div className="p-6 space-y-2 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100" />)}
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 pt-2">
              Ranking the skills on the server…
            </p>
          </div>
        ) : hotspots.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            {overview.withRequirements === 0
              ? 'Nobody in this scope is assigned to a job profile, so there are no requirements to rank.'
              : 'No gaps and nothing unassessed in this scope — every measured requirement is met.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <th className="text-left px-6 py-3">Skill</th>
                  <th className="text-center px-3 py-3">Criticality</th>
                  <th className="text-right px-3 py-3">Requires it</th>
                  <th className="text-right px-3 py-3">Measured</th>
                  <th className="text-right px-3 py-3">With a gap</th>
                  <th className="text-right px-3 py-3">Avg gap</th>
                  <th className="text-right px-3 py-3">Never assessed</th>
                  <th className="text-right px-6 py-3">Weighted gap</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hotspots.map(s => (
                  <tr key={s.skillId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <p className="font-bold text-slate-900">{s.skillName}</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                        {s.skillCategory || 'Uncategorised'}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <CriticalityBadge criticality={s.criticality} />
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">{s.employeesRequiring}</td>
                    <td className="px-3 py-3 text-right text-slate-600">
                      {s.measured}
                      {s.provisional > 0 && <span className="text-[10px] text-slate-400"> +{s.provisional}p</span>}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-black text-slate-900">{s.gapCount}</span>
                      {s.affectedPct !== null && (
                        <span className="text-[10px] text-slate-400 ml-1">({s.affectedPct}%)</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">
                      {s.gapCount > 0 ? s.averageGap.toFixed(1) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {s.unknown > 0
                        ? <span className="font-bold text-amber-600">{s.unknown}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-6 py-3 text-right font-black text-slate-900">
                      {s.weightedGap.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-6 py-3 border-t border-slate-100 text-[10px] text-slate-500">
              The worst {hotspots.length} skill{hotspots.length === 1 ? '' : 's'} in this scope, ordered by weighted gap
              (levels short × the skill's criticality — safety critical ×3, business critical ×2, standard ×1,
              nice to have ×0.5). A never-assessed requirement is counted as assessment work in its own column,
              never as a gap. The full list, with courses and costs, is on the Training Needs screen.
            </p>
          </div>
        )}
      </div>

      {/* Department comparison — where the coverage and the gaps actually sit.
          Every unit's figures are ROLLED UP through its sub-units, so a general
          department with nobody in it directly still shows its branch. */}
      <div className="bg-white rounded-sm border border-slate-300">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-slate-900" />
            <h4 className="font-bold text-slate-900">Department comparison</h4>
          </div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">
            Sorted by {DEPT_SORT_LABEL[deptSort].toLowerCase()} · figures include sub-units
          </p>
        </div>

        {!overview ? (
          <div className="p-6 space-y-2 animate-pulse">
            {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-100" />)}
          </div>
        ) : sortedDepartments.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            Nobody in this scope is assigned to a department yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-500">
                  <SortHeader column="name" align="text-left" />
                  <SortHeader column="headcount" />
                  <th className="text-left px-3 py-3 w-48">Coverage</th>
                  <SortHeader column="compliancePct" />
                  <SortHeader column="avgGap" />
                  <SortHeader column="unknown" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedDepartments.map(d => (
                  <tr key={d.departmentId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3">
                      <p className="font-bold text-slate-900">{d.name}</p>
                      {d.parentId && (
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                          in {deptNames.get(d.parentId) ?? d.parentId}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-bold text-slate-700">{d.headcount}</span>
                      {d.headcount > d.withRequirements && (
                        <span
                          className="block text-[10px] text-amber-600"
                          title="People here carry no job profile, so nothing is required of them yet."
                        >
                          {d.headcount - d.withRequirements} unprofiled
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <CoverageMeter coverage={d.coverage} label={`${d.coverage.measuredPct}%`} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      {/* "—", never 0%, for a unit nobody has measured. */}
                      <CompliancePercent
                        coverage={d.coverage}
                        className={`font-black ${d.coverage.compliancePct === null ? 'text-slate-300' : 'text-slate-900'}`}
                      />
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-slate-700">
                      {d.coverage.avgGap === null
                        ? <span className="text-slate-300">—</span>
                        : d.coverage.avgGap.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {d.coverage.unknown > 0
                        ? <span className="font-bold text-amber-600">{d.coverage.unknown}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-6 py-3 border-t border-slate-100 text-[10px] text-slate-500">
              A unit's row covers everyone beneath it, so the general departments repeat their sections'
              people — read a branch, not a sum. Compliance and average gap are calculated over what has
              actually been measured; a unit showing "—" has never been assessed, which is not the same
              as scoring zero.
            </p>
          </div>
        )}
      </div>

      {/* People without a profile — nothing can be required of them, so they are
          invisible in every figure above. Worth naming rather than hiding. */}
      {overview && overview.withoutProfile > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <UserX size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900">
            <p className="font-bold uppercase tracking-wide text-[10px] mb-1">Outside every figure on this page</p>
            <p>
              {overview.withoutProfile} of {overview.headcount} people in <strong>{scopeLabel}</strong> carry no job
              profile, so nothing is required of them and they contribute no coverage, gap or compliance figure.
              Assign job profiles in Admin → Users before reading the numbers above as the whole unit.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-sm  border border-slate-300">
        <div className="flex items-center gap-2 mb-1">
          <History size={20} className="text-slate-900" />
          <h4 className="font-bold text-slate-900">Skill Gap Trend Over Time</h4>
        </div>
        <p className="text-[11px] text-slate-500 mb-6">
          Drawn from the monthly snapshots stored by the nightly job — the same scoring used
          everywhere else in the system (assessment, evidence and provisional experience scores,
          with never-assessed skills excluded rather than counted as failures).
          {latest && (
            <> Last reading taken {new Date(latest.takenAt).toLocaleDateString()}.</>
          )}
        </p>

        {historyError ? (
          <div className="h-80 flex flex-col items-center justify-center text-slate-500 text-center px-6">
            <AlertTriangle size={40} className="mb-4 text-amber-500" />
            <p className="font-bold text-slate-700">Stored history could not be loaded.</p>
            <p className="text-xs mt-1">{historyError}</p>
          </div>
        ) : snapshots === null ? (
          <div className="h-80 flex items-center justify-center text-slate-400 text-sm">Loading stored history…</div>
        ) : trendData.length > 0 ? (
          <>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis yAxisId="gap" domain={[0, 5]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                  <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} unit="%" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line
                    yAxisId="gap"
                    type="monotone"
                    dataKey="Average Gap (measured)"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                    // A month with nothing measured leaves a BREAK in the line
                    // rather than a drop to zero that never happened.
                    connectNulls={false}
                  />
                  <Line
                    yAxisId="pct"
                    type="monotone"
                    dataKey="Assessment Coverage %"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {trendData.length === 1 && (
              <p className="text-[11px] text-amber-600 mt-2">
                One reading so far — a trend appears from next month's snapshot onwards.
              </p>
            )}
            {latest && (
              <p className="text-[11px] text-slate-500 mt-2">
                Latest stored month: coverage {latest.measuredPct}% ({latest.measured} of {latest.required} measured),
                compliance {pct(latest.compliancePct)}, average gap{' '}
                {latest.avgGap === null ? '—' : latest.avgGap.toFixed(2)}.
              </p>
            )}
          </>
        ) : (
          <div className="h-80 flex flex-col items-center justify-center text-slate-500 text-center px-6">
            <History size={48} className="mb-4 text-slate-300" />
            <p className="font-bold text-slate-700">No stored history yet for this scope.</p>
            <p className="text-xs mt-2 max-w-md">
              The nightly job records one snapshot per month. Nothing is back-filled: an
              assessment done today would otherwise make last month look better than it was.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
