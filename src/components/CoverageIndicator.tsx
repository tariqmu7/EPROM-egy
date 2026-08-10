import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CompetencyCoverage } from '../types';

/**
 * MEASURED vs UNKNOWN — the shared way to show how much of a compliance or gap
 * figure is actually backed by a measurement.
 *
 * Every percentage in the app used to divide by "required skills", counting a
 * never-assessed skill (score 0) as a failed one. `dataService.getUserCoverage`
 * / `getGroupCoverage` split those apart; these components render the split so
 * the number is always read with its evidence base next to it.
 *
 *  - `CompliancePercent` — the % itself, showing "—" when nothing is measured.
 *  - `CoverageNote`      — "12 of 18 skills measured" (+ provisional/unknown).
 *  - `CoverageMeter`     — the same, with a two-tone bar (measured vs known).
 */

export const coverageTitle = (c: CompetencyCoverage): string =>
  c.required === 0
    ? 'No skill requirements defined for this position'
    : `${c.measured} of ${c.required} required skills have a real measurement` +
      (c.provisional > 0 ? `, ${c.provisional} provisional (work experience)` : '') +
      (c.unknown > 0 ? `, ${c.unknown} never assessed` : '') +
      (c.compliancePct === null
        ? '. Compliance cannot be calculated until something is measured.'
        : `. Compliance is calculated over the ${c.known} known skill${c.known === 1 ? '' : 's'} only.`);

/** The compliance percentage, or an honest dash when nothing has been measured. */
export const CompliancePercent: React.FC<{
  coverage: CompetencyCoverage;
  className?: string;
}> = ({ coverage, className = '' }) => (
  <span className={className} title={coverageTitle(coverage)}>
    {coverage.compliancePct === null ? '—' : `${coverage.compliancePct}%`}
  </span>
);

/** One line of plain text: how many of the required skills are really measured. */
export const CoverageNote: React.FC<{
  coverage: CompetencyCoverage;
  className?: string;
  /** Show the icon + amber tint when anything is still unmeasured. */
  emphasizeUnknown?: boolean;
}> = ({ coverage, className = '', emphasizeUnknown = true }) => {
  if (coverage.required === 0) {
    return <span className={`italic ${className}`}>No requirements defined</span>;
  }

  const hasUnknown = coverage.unknown > 0;
  const tone = emphasizeUnknown && hasUnknown ? 'text-amber-600' : 'text-slate-500';

  return (
    <span className={`inline-flex items-center gap-1 ${tone} ${className}`} title={coverageTitle(coverage)}>
      {emphasizeUnknown && (hasUnknown
        ? <AlertTriangle size={11} className="shrink-0" />
        : <CheckCircle2 size={11} className="shrink-0 text-emerald-600" />)}
      <span>
        {coverage.measured} of {coverage.required} measured
        {coverage.provisional > 0 && ` · ${coverage.provisional} provisional`}
        {hasUnknown && ` · ${coverage.unknown} never assessed`}
      </span>
    </span>
  );
};

/**
 * Bar + note. The filled part is what is genuinely measured; the lighter part
 * is provisional (experience-credited); the empty remainder is unknown — so an
 * empty bar reads as "we haven't looked", not "they failed".
 */
export const CoverageMeter: React.FC<{
  coverage: CompetencyCoverage;
  className?: string;
  label?: string;
}> = ({ coverage, className = '', label = 'Measured' }) => (
  <div className={`flex flex-col gap-1 ${className}`} title={coverageTitle(coverage)}>
    <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
      <span>{label}</span>
      <span className={coverage.unknown > 0 ? 'text-amber-600' : 'text-slate-500'}>
        {coverage.measured}/{coverage.required}
      </span>
    </div>
    <div className="h-1.5 w-full bg-slate-100 overflow-hidden flex">
      <div className="h-full bg-blue-600 transition-all duration-700" style={{ width: `${coverage.measuredPct}%` }} />
      <div
        className="h-full bg-indigo-300 transition-all duration-700"
        style={{
          width: `${Math.max(0, coverage.knownPct - coverage.measuredPct)}%`,
          backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,.6) 3px, rgba(255,255,255,.6) 6px)',
        }}
      />
    </div>
  </div>
);
