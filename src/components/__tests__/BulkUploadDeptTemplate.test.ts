import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseDeptTemplate } from '../BulkUpload';
import { Department, JobProfile, Skill } from '../../types';

// The department template workbook is the one file ECMS accepts that it did not
// generate itself: a department fills it in offline and sends it back. These
// tests pin the two promises the importer makes — it invents nothing, and it
// reports every problem BEFORE anything is written.

const RUNG_HEADERS = [
  'FR\nFresh', 'JP\nJunior Professional', 'SP\nSenior Professional', 'SH\nSection Head',
  'DM\nDepartment Manager', 'AGM\nAssistant General Manager', 'GM\nGeneral Manager',
];

const MATRIX_HEADER = [
  'Skill Code', 'Category', 'Skill Name',
  'Description - what the person must be able to DO',
  'Why it matters to the business', 'Assessment Type', ...RUNG_HEADERS,
];

const POS_HEADER = [
  'Position Title', 'Rung (FR/JP/SP/SH/DM/AGM/GM)', 'Reports To (position title)',
  'Current Headcount', 'What this position is responsible for',
];

const INFO_QUESTIONS = [
  'General Department (the top unit this sits under)',
  'Department name (exactly as it should appear in the system)',
  'Section name, if this sheet covers one section only',
  'Total headcount covered by this sheet',
];

interface Fixture {
  general?: string;
  department?: string;
  section?: string;
  positions?: any[][];
  matrix?: any[][];
  sheetNames?: [string, string, string];
}

const buildWorkbook = async (f: Fixture): Promise<ExcelJS.Workbook> => {
  const [infoName, posName, matName] = f.sheetNames
    ?? ['1. Department Info', '2. Positions', '3. Competency Matrix'];
  const wb = new ExcelJS.Workbook();

  const info = wb.addWorksheet(infoName);
  info.addRow(['Question', 'Your answer']);
  info.addRow([INFO_QUESTIONS[0], f.general ?? '']);
  info.addRow([INFO_QUESTIONS[1], f.department ?? '']);
  info.addRow([INFO_QUESTIONS[2], f.section ?? '']);
  info.addRow([INFO_QUESTIONS[3], '']);

  const pos = wb.addWorksheet(posName);
  pos.addRow(POS_HEADER);
  for (const r of f.positions ?? []) pos.addRow(r);

  const mat = wb.addWorksheet(matName);
  mat.addRow(MATRIX_HEADER);
  for (const r of f.matrix ?? []) mat.addRow(r);

  // Round-trip through the file format, exactly as an upload arrives.
  const buffer = await wb.xlsx.writeBuffer();
  const loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(buffer as any);
  return loaded;
};

// A small org chart with the duplicate-name shape the live EPROM org actually
// has: "Business Development" exists as a DEPARTMENT and as a SECTION under it.
const DEPTS: Department[] = [
  { id: 'gen-1', name: 'Business Development & Marketing', type: 'GENERAL' },
  { id: 'dept-bd', name: 'Business Development', type: 'DEPARTMENT', parentId: 'gen-1' },
  { id: 'sect-bd', name: 'Business Development', type: 'SECTION', parentId: 'dept-bd' },
  { id: 'dept-ec', name: 'External Contracts', type: 'DEPARTMENT', parentId: 'gen-1' },
];

const GOOD_MATRIX = [
  ['XX-S-01', 'Safety', 'Permit to Work', 'Raises and closes a PTW.', 'People get hurt otherwise.', 'Practical Demo', 3, 4, 5, 5, 5, 5, 5],
  ['XX-T-01', 'Technical', 'Contract Administration', 'Runs the obligations register.', 'A missed notice kills a claim.', 'Work Record', 1, 2, 4, 5, 5, 4, 4],
  ['XX-W-01', 'Software', 'Primavera P6', 'Builds a resourced schedule.', 'The schedule is the shared truth.', 'Practical Demo', '', 2, 4, 4, 3, 3, 3],
];

const GOOD_POSITIONS = [
  ['Contracts Engineer', 'SP', 'Section Head', 3, 'Administers signed contracts.'],
  ['Graduate Trainee', 'FR', 'Contracts Engineer', 2, 'Learns the cycle.'],
];

const parse = (wb: ExcelJS.Workbook, skills: Skill[] = [], jobs: JobProfile[] = []) =>
  parseDeptTemplate(wb, DEPTS, skills, jobs);

describe('DEPT_TEMPLATE import — parsing a filled department template', () => {
  it('reads the three sheets, resolves the unit and builds the plan', async () => {
    const wb = await buildWorkbook({
      general: 'Business Development & Marketing',
      department: 'External Contracts',
      positions: GOOD_POSITIONS,
      matrix: GOOD_MATRIX,
    });
    const plan = parse(wb);

    expect(plan.errors).toEqual([]);
    expect(plan.departmentId).toBe('dept-ec');
    expect(plan.departmentLabel).toBe('Business Development & Marketing › External Contracts');
    expect(plan.skills.map(s => s.name)).toEqual([
      'Permit to Work', 'Contract Administration', 'Primavera P6',
    ]);
    // Software collapses into ECMS's five categories.
    expect(plan.skills[2].category).toBe('Technical');
    expect(plan.skills[1].assessmentMethod).toBe('WORK_RECORD_REVIEW');
  });

  it('reads a rung column across the row, and a BLANK rate means "not required"', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts', positions: GOOD_POSITIONS, matrix: GOOD_MATRIX,
    });
    const plan = parse(wb);

    const p6 = plan.skills.find(s => s.name === 'Primavera P6')!;
    expect(p6.rates.FR).toBeUndefined();   // blank, NOT zero
    expect(p6.rates.SP).toBe(4);
    expect(p6.rates.GM).toBe(3);

    // The Fresh position therefore requires two of the three skills.
    expect(plan.positions.find(p => p.orgLevel === 'FR')!.skillCount).toBe(2);
    expect(plan.positions.find(p => p.orgLevel === 'SP')!.skillCount).toBe(3);
  });

  it('flags an existing competency and an existing profile rather than duplicating', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts', positions: GOOD_POSITIONS, matrix: GOOD_MATRIX,
    });
    const skills = [{ id: 'sk-1', name: 'permit to work', category: 'Safety', levels: {} }] as any as Skill[];
    const jobs = [{ id: 'job-1', title: 'Contracts Engineer', departmentId: 'dept-ec' }] as any as JobProfile[];
    const plan = parse(wb, skills, jobs);

    expect(plan.skills.find(s => s.name === 'Permit to Work')!.existingId).toBe('sk-1');
    expect(plan.positions.find(p => p.title === 'Contracts Engineer')!.existingId).toBe('job-1');
    // Same title in a DIFFERENT unit is a different profile.
    const other = parse(wb, [], [{ id: 'job-x', title: 'Contracts Engineer', departmentId: 'dept-bd' }] as any);
    expect(other.positions.find(p => p.title === 'Contracts Engineer')!.existingId).toBeUndefined();
  });
});

describe('DEPT_TEMPLATE import — it refuses rather than invents', () => {
  it('refuses a department that is not in the org chart, and creates nothing', async () => {
    const wb = await buildWorkbook({
      department: 'Department Of Wishful Thinking', positions: GOOD_POSITIONS, matrix: GOOD_MATRIX,
    });
    const plan = parse(wb);
    expect(plan.departmentId).toBe('');
    expect(plan.errors.some(e => /No unit in the org chart/.test(e.message))).toBe(true);
  });

  it('refuses an ambiguous duplicate name and names the candidates', async () => {
    const wb = await buildWorkbook({
      department: 'Business Development', positions: GOOD_POSITIONS, matrix: GOOD_MATRIX,
    });
    const plan = parse(wb);
    expect(plan.departmentId).toBe('');
    const msg = plan.errors.find(e => /matches 2 units/.test(e.message))!.message;
    expect(msg).toContain('Business Development & Marketing › Business Development');
    expect(msg).toContain('› Business Development › Business Development');
  });

  it('resolves that same duplicate once the Section is named', async () => {
    const wb = await buildWorkbook({
      department: 'Business Development', section: 'Business Development',
      positions: GOOD_POSITIONS, matrix: GOOD_MATRIX,
    });
    const plan = parse(wb);
    expect(plan.departmentId).toBe('sect-bd');
    expect(plan.errors).toEqual([]);
  });

  it('reports a missing sheet instead of falling back to the first one', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts', positions: GOOD_POSITIONS, matrix: GOOD_MATRIX,
      sheetNames: ['Info', 'Positions', 'Matrix'],
    });
    const plan = parse(wb);
    expect(plan.errors.map(e => e.sheet)).toContain('1. Department Info');
    expect(plan.skills).toEqual([]);
  });
});

describe('DEPT_TEMPLATE import — row-level validation', () => {
  it('rejects a rate that is not a whole 1-5, and rejects 0 explicitly', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts',
      positions: GOOD_POSITIONS,
      matrix: [
        ['XX-T-01', 'Technical', 'Bad Rates', 'Does a thing.', 'Matters.', 'Interview', 0, 'N/A', 6, 3.5, 3, 3, 3],
      ],
    });
    const plan = parse(wb);
    const msgs = plan.errors.map(e => e.message).join(' | ');
    expect(msgs).toContain('FR reads "0"');
    expect(msgs).toContain('JP reads "N/A"');
    expect(msgs).toContain('SP reads "6"');
    expect(msgs).toContain('SH reads "3.5"');
    // The good ones still came through.
    expect(plan.skills[0].rates.DM).toBe(3);
  });

  it('rejects a duplicated skill name and points at the first row', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts',
      positions: GOOD_POSITIONS,
      matrix: [
        ['XX-T-01', 'Technical', 'Contract Administration', 'A.', 'B.', 'Interview', 3, 3, 3, 3, 3, 3, 3],
        ['XX-T-02', 'Technical', 'contract administration', 'A.', 'B.', 'Interview', 4, 4, 4, 4, 4, 4, 4],
      ],
    });
    const plan = parse(wb);
    expect(plan.skills).toHaveLength(1);
    expect(plan.errors.some(e => e.row === 3 && /already on row 2/.test(e.message))).toBe(true);
  });

  it('rejects a category, an assessment type and a rung outside the drop-downs', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts',
      positions: [['Odd One', 'DEPUTY GM', '', 1, 'Runs things.']],
      matrix: [['XX-1', 'Commercial', 'Something', 'Does it.', 'Matters.', 'Vibes', 3, 3, 3, 3, 3, 3, 3]],
    });
    const plan = parse(wb);
    const msgs = plan.errors.map(e => e.message).join(' | ');
    expect(msgs).toContain('Category "Commercial" is not one of the six');
    expect(msgs).toContain('Assessment Type "Vibes" is not one of the seven');
    expect(msgs).toContain('Rung "DEPUTY GM" is not one of');
  });

  it('rejects a skill with no description — the assessor has nothing to read', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts',
      positions: GOOD_POSITIONS,
      matrix: [['XX-1', 'Technical', 'Nameless Work', '', 'Matters.', 'Interview', 3, 3, 3, 3, 3, 3, 3]],
    });
    const plan = parse(wb);
    expect(plan.errors.some(e => /has no Description/.test(e.message))).toBe(true);
  });

  it('warns, but does not block, a skill required at no rung', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts',
      positions: GOOD_POSITIONS,
      matrix: [
        ...GOOD_MATRIX,
        ['XX-9', 'Technical', 'Orphan Skill', 'Does it.', 'Matters.', 'Interview', '', '', '', '', '', '', ''],
      ],
    });
    const plan = parse(wb);
    expect(plan.errors).toEqual([]);
    expect(plan.warnings.some(w => /"Orphan Skill" is required at no rung/.test(w.message))).toBe(true);
  });

  it('warns about a position whose rung nobody rated', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts',
      positions: [['Assistant GM', 'AGM', '', 1, 'Deputises.']],
      matrix: [['XX-1', 'Technical', 'Only Junior Work', 'Does it.', 'Matters.', 'Interview', 2, 2, '', '', '', '', '']],
    });
    const plan = parse(wb);
    expect(plan.errors).toEqual([]);
    expect(plan.warnings.some(w => /would require nothing/.test(w.message))).toBe(true);
  });

  it('ignores the hundreds of untouched blank template rows', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts',
      positions: [...GOOD_POSITIONS, ['', '', '', '', ''], ['', '', '', '', '']],
      matrix: [...GOOD_MATRIX, ['', '', '', '', '', '', '', '', '', '', '', '', '']],
    });
    const plan = parse(wb);
    expect(plan.errors).toEqual([]);
    expect(plan.skills).toHaveLength(3);
    expect(plan.positions).toHaveLength(2);
  });

  it('refuses an empty workbook rather than importing nothing quietly', async () => {
    const wb = await buildWorkbook({ department: 'External Contracts' });
    const plan = parse(wb);
    expect(plan.errors.some(e => /No skills were filled in/.test(e.message))).toBe(true);
    expect(plan.errors.some(e => /No positions were filled in/.test(e.message))).toBe(true);
  });

  it('strips a leading formula marker from an imported name', async () => {
    const wb = await buildWorkbook({
      department: 'External Contracts',
      positions: [['=cmd|calc', 'SP', '', 1, 'x']],
      matrix: [['XX-1', 'Technical', '@Injected Skill', 'Does it.', 'Matters.', 'Interview', 3, 3, 3, 3, 3, 3, 3]],
    });
    const plan = parse(wb);
    expect(plan.skills[0].name).toBe('Injected Skill');
    expect(plan.positions[0].title).toBe('cmd|calc');
  });
});
