// The one piece of judgement the analytics screen makes locally: how the
// department comparison is ordered.
//
// The rule it must never break is the coverage rule applied to sorting — a unit
// nobody has measured has NO compliance and NO average gap (both null), and must
// sort LAST whichever column is chosen. Sorting nulls as 0 would either crown an
// unmeasured unit as perfectly compliant or condemn it as the worst gap in the
// company; both are the same lie this workstream exists to remove.
import { describe, expect, it } from 'vitest';
import { sortDepartments } from '../AdminAnalytics';
import { CompetencyCoverage, DepartmentCoverageRow } from '../../types';

const coverage = (over: Partial<CompetencyCoverage>): CompetencyCoverage => ({
  required: 10, measured: 5, provisional: 0, unknown: 5, known: 5,
  measuredPct: 50, knownPct: 50, compliantKnown: 3, gapsKnown: 2,
  compliancePct: 60, totalGap: 4, avgGap: 0.8,
  ...over,
});

const dept = (name: string, headcount: number, c: Partial<CompetencyCoverage>): DepartmentCoverageRow => ({
  departmentId: name.toLowerCase(),
  name,
  parentId: null,
  headcount,
  withRequirements: headcount,
  coverage: coverage(c),
});

const rows: DepartmentCoverageRow[] = [
  dept('Rotating', 12, { compliancePct: 80, avgGap: 0.4, unknown: 2 }),
  dept('Electrical', 30, { compliancePct: 40, avgGap: 1.9, unknown: 9 }),
  // Never assessed: no compliance, no average gap, and 12 unknowns.
  dept('Instruments', 7, {
    measured: 0, known: 0, unknown: 12, measuredPct: 0, knownPct: 0,
    compliantKnown: 0, gapsKnown: 0, compliancePct: null, totalGap: 0, avgGap: null,
  }),
];

const names = (rs: DepartmentCoverageRow[]) => rs.map(r => r.name);

describe('AdminAnalytics — department comparison order', () => {
  it('puts the worst average gap first and the never-measured unit last', () => {
    expect(names(sortDepartments(rows, 'avgGap'))).toEqual(['Electrical', 'Rotating', 'Instruments']);
  });

  it('puts the weakest compliance first and still keeps the never-measured unit last', () => {
    // Ascending here (worst compliance first), but a null is not a 0% — the
    // unmeasured unit must not lead the table as if it were the worst performer.
    expect(names(sortDepartments(rows, 'compliancePct'))).toEqual(['Electrical', 'Rotating', 'Instruments']);
  });

  it('ranks by coverage worst-first, where an unmeasured unit legitimately leads', () => {
    // Coverage is never null — 0% measured IS a real, actionable figure.
    expect(names(sortDepartments(rows, 'measuredPct'))).toEqual(['Instruments', 'Electrical', 'Rotating']);
  });

  it('ranks the biggest assessment backlog first', () => {
    expect(names(sortDepartments(rows, 'unknown'))).toEqual(['Instruments', 'Electrical', 'Rotating']);
  });

  it('sorts by size and by name without mutating the input', () => {
    expect(names(sortDepartments(rows, 'headcount'))).toEqual(['Electrical', 'Rotating', 'Instruments']);
    expect(names(sortDepartments(rows, 'name'))).toEqual(['Electrical', 'Instruments', 'Rotating']);
    expect(names(rows)).toEqual(['Rotating', 'Electrical', 'Instruments']);
  });
});
