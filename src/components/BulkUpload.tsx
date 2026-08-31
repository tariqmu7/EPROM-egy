import React, { useState } from 'react';
import ExcelJS from 'exceljs';
import { Download, Upload, X, AlertCircle, CheckCircle, FileSpreadsheet, Loader2, Lock } from 'lucide-react';
import { dataService } from '../services/store';
import { User, Role, JobProfile, Skill, Department, OrgLevel, TrainingCourse, SkillCategory, SkillCriticality, normalizeSkillCategory, skillCriticalityOf } from '../types';

interface BulkUploadProps {
  type: 'USER' | 'JOB' | 'SKILL' | 'DEPT' | 'PROJECT' | 'COURSE' | 'DEPT_TEMPLATE';
  user: User | null;
  onComplete: () => void;
  onCancel: () => void;
}

// Prevent spreadsheet formula injection (a.k.a. CSV injection): a cell whose
// value begins with =, @ or + is interpreted as a formula when the data is
// later opened in Excel/Sheets. Strip those leading characters so every
// imported value is treated as inert text. Repeated leading markers (e.g.
// "=+cmd|...") are stripped together.
const sanitizeCellValue = (value: any): any => {
  // ExcelJS rich text: { richText: [{text: '...'},...] }
  if (value && typeof value === 'object' && Array.isArray(value.richText)) {
    value = value.richText.map((rt: any) => rt.text ?? '').join('');
  }
  // ExcelJS formula: { formula: '...', result: ... }
  if (value && typeof value === 'object' && 'result' in value) {
    value = value.result;
  }
  if (typeof value !== 'string') return value;
  return value.replace(/^[=@+]+/, '');
};

const sanitizeRow = (row: Record<string, any>): Record<string, any> => {
  const clean: Record<string, any> = {};
  for (const key of Object.keys(row)) {
    clean[key] = sanitizeCellValue(row[key]);
  }
  return clean;
};

// ---------------------------------------------------------------------------
// DEPT_TEMPLATE — the department job-profile template workbook
// ---------------------------------------------------------------------------
// The workbook every department is sent (EPROM_Job_Profile_Template.xlsx) is
// MULTI-SHEET: department identity, its positions, and one competency matrix
// whose rows are skills and whose last seven columns are the required rate at
// each rung. Every other importer here reads `worksheets[0]` only, so this type
// resolves its sheets by NAME.
//
// Two rules this importer keeps that the plain JOB importer does not:
//   * It NEVER invents anything. The JOB importer silently creates a missing
//     department and a missing skill; here an unresolvable department is a
//     refusal, and every requirement is resolved from a skill defined on the
//     matrix sheet itself, so a typo cannot become a blank Technical skill.
//   * It validates BEFORE it writes. The admin sees the whole plan — what will
//     be created, what updated, and every row-level problem — and a single
//     error blocks the import. A half-applied framework is worse than none.

const DEPT_TEMPLATE_RUNGS: OrgLevel[] = ['FR', 'JP', 'SP', 'SH', 'DM', 'AGM', 'GM'];

// The template offers six categories; ECMS has five. Software collapses into
// Technical (which is also normalizeSkillCategory's own fallback).
const DEPT_TEMPLATE_CATEGORIES = ['technical', 'software', 'safety', 'management', 'behavioral', 'soft skills'];

// The template's seven assessment labels -> the ECMS enum. "Online Exam" has no
// member of its own: ECMS's WRITTEN_EXAM is labelled "Written Examination
// (External / Online)".
// Skill.assessmentMethod is narrower than AssessmentMethod (no ANNUAL_APPRAISAL).
type DeptTemplateMethod = NonNullable<Skill['assessmentMethod']>;

const DEPT_TEMPLATE_ASSESSMENTS: Record<string, DeptTemplateMethod> = {
  'written exam': 'WRITTEN_EXAM',
  'online exam': 'WRITTEN_EXAM',
  'practical demo': 'PRACTICAL_DEMO',
  'interview': 'INTERVIEW',
  'work record': 'WORK_RECORD_REVIEW',
  'ojt observation': 'OJT_OBSERVATION',
  '360 evaluation': 'THREE_SIXTY_EVALUATION',
};

export interface DeptTemplateIssue { sheet: string; row?: number; message: string; }

export interface DeptTemplateSkillRow {
  code: string;
  name: string;
  category: SkillCategory;
  description: string;
  benefit: string;
  assessmentMethod: DeptTemplateMethod;
  rates: Partial<Record<OrgLevel, number>>;
  existingId?: string;
}

export interface DeptTemplatePositionRow {
  title: string;
  orgLevel: OrgLevel;
  description: string;
  existingId?: string;
  skillCount: number;
}

export interface DeptTemplatePlan {
  departmentId: string;
  departmentLabel: string;
  positions: DeptTemplatePositionRow[];
  skills: DeptTemplateSkillRow[];
  errors: DeptTemplateIssue[];
  warnings: DeptTemplateIssue[];
}

const norm = (v: any): string => sanitizeCellValue(v)?.toString().trim() ?? '';
const lower = (v: any): string => norm(v).toLowerCase();

// Sheets are matched on the leading "1." / "2." / "3." so a department that
// retitles a tab still imports; an exact name match is tried first.
const findSheet = (wb: ExcelJS.Workbook, exact: string, prefix: string) =>
  wb.worksheets.find(w => w.name.trim().toLowerCase() === exact.toLowerCase())
  ?? wb.worksheets.find(w => w.name.trim().toLowerCase().startsWith(prefix));

// header text (lower-cased, newlines flattened) -> 1-based column number
const headerMap = (ws: ExcelJS.Worksheet): Map<string, number> => {
  const map = new Map<string, number>();
  const vals = (ws.getRow(1).values as any[]) ?? [];
  for (let c = 1; c < vals.length; c++) {
    const h = norm(vals[c]).replace(/\s+/g, ' ').toLowerCase();
    if (h && !map.has(h)) map.set(h, c);
  }
  return map;
};

const columnFor = (map: Map<string, number>, startsWith: string): number | undefined => {
  for (const [h, c] of map) if (h.startsWith(startsWith)) return c;
  return undefined;
};

// "General Dept > Department > Section" — so a duplicate name can be told apart.
const deptPath = (dept: Department, all: Department[]): string => {
  const chain: string[] = [];
  let cur: Department | undefined = dept;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur.name);
    const parentId: string | undefined = cur.parentId;
    cur = parentId ? all.find(d => d.id === parentId) : undefined;
  }
  return chain.join(' › ');
};

export const parseDeptTemplate = (
  wb: ExcelJS.Workbook,
  depts: Department[],
  skills: Skill[],
  jobs: JobProfile[],
): DeptTemplatePlan => {
  const errors: DeptTemplateIssue[] = [];
  const warnings: DeptTemplateIssue[] = [];
  const plan: DeptTemplatePlan = {
    departmentId: '', departmentLabel: '', positions: [], skills: [], errors, warnings,
  };

  const infoWs = findSheet(wb, '1. Department Info', '1.');
  const posWs = findSheet(wb, '2. Positions', '2.');
  const matWs = findSheet(wb, '3. Competency Matrix', '3.');
  const required: [ExcelJS.Worksheet | undefined, string][] = [
    [infoWs, '1. Department Info'], [posWs, '2. Positions'], [matWs, '3. Competency Matrix'],
  ];
  for (const [ws, name] of required) {
    if (!ws) errors.push({ sheet: name, message: `Sheet "${name}" is missing. This importer needs the issued template workbook, not a single-sheet export.` });
  }
  if (!infoWs || !posWs || !matWs) return plan;

  // ---------------------------------------------------------------- 1. Info
  const answers = new Map<string, string>();
  for (let r = 2; r <= infoWs.rowCount; r++) {
    const vals = (infoWs.getRow(r).values as any[]) ?? [];
    const q = lower(vals[1]);
    if (q) answers.set(q, norm(vals[2]));
  }
  const answerFor = (needle: string) => {
    for (const [q, a] of answers) if (q.includes(needle)) return a;
    return '';
  };
  // Order matters: "General Department (...)" also contains "department".
  const generalName = answerFor('general department');
  const sectionName = answerFor('section name');
  const deptName = answerFor('department name');

  const target = sectionName || deptName;
  if (!target) {
    errors.push({ sheet: '1. Department Info', message: 'No department name was given. Fill in "Department name (exactly as it should appear in the system)".' });
  } else {
    let matches = depts.filter(d => d.name.trim().toLowerCase() === target.toLowerCase());
    // Narrow a duplicate name by the unit it was said to sit under.
    if (matches.length > 1 && sectionName && deptName) {
      const parents = depts.filter(d => d.name.trim().toLowerCase() === deptName.toLowerCase()).map(d => d.id);
      const narrowed = matches.filter(d => d.parentId && parents.includes(d.parentId));
      if (narrowed.length) matches = narrowed;
    }
    if (matches.length > 1 && generalName) {
      const narrowed = matches.filter(d => deptPath(d, depts).toLowerCase().includes(generalName.toLowerCase()));
      if (narrowed.length) matches = narrowed;
    }
    if (matches.length === 0) {
      errors.push({ sheet: '1. Department Info', message: `No unit in the org chart is called "${target}". Nothing was created — correct the name on the sheet, or add the unit first under Admin > Departments.` });
    } else if (matches.length > 1) {
      errors.push({ sheet: '1. Department Info', message: `"${target}" matches ${matches.length} units — ${matches.map(d => deptPath(d, depts)).join('  |  ')}. Fill in the General Department (and Section, if this sheet covers one) so the right one can be picked.` });
    } else {
      plan.departmentId = matches[0].id;
      plan.departmentLabel = deptPath(matches[0], depts);
    }
  }

  // ---------------------------------------------------------------- 3. Matrix
  const mh = headerMap(matWs);
  const cCode = columnFor(mh, 'skill code');
  const cCat = columnFor(mh, 'category');
  const cName = columnFor(mh, 'skill name');
  const cDesc = columnFor(mh, 'description');
  const cBenefit = columnFor(mh, 'why it matters');
  const cAssess = columnFor(mh, 'assessment type');
  const rungCols = new Map<OrgLevel, number>();
  for (const rung of DEPT_TEMPLATE_RUNGS) {
    const c = columnFor(mh, rung.toLowerCase());
    if (c) rungCols.set(rung, c);
  }
  if (!cName || !cCat || !cAssess) {
    errors.push({ sheet: '3. Competency Matrix', message: "The header row is not the template's. Expected Skill Code / Category / Skill Name / Description / Why it matters / Assessment Type, then one column per rung." });
    return plan;
  }
  for (const rung of DEPT_TEMPLATE_RUNGS) {
    if (!rungCols.has(rung)) errors.push({ sheet: '3. Competency Matrix', message: `No column found for rung ${rung}. All seven rungs (FR JP SP SH DM AGM GM) must be present.` });
  }

  const seenSkill = new Map<string, number>();
  for (let r = 2; r <= matWs.rowCount; r++) {
    const vals = (matWs.getRow(r).values as any[]) ?? [];
    const cells = vals.slice(1).map(norm);
    if (!cells.some(v => v !== '')) continue;   // untouched template row

    const name = norm(vals[cName]);
    if (!name) { errors.push({ sheet: '3. Competency Matrix', row: r, message: 'Row has data but no Skill Name.' }); continue; }
    const key = name.toLowerCase();
    if (seenSkill.has(key)) { errors.push({ sheet: '3. Competency Matrix', row: r, message: `"${name}" is already on row ${seenSkill.get(key)}. A skill is written once; a higher rung is a higher number further along the same row.` }); continue; }
    seenSkill.set(key, r);

    const rawCat = lower(vals[cCat]);
    if (!rawCat) errors.push({ sheet: '3. Competency Matrix', row: r, message: `"${name}" has no Category.` });
    else if (!DEPT_TEMPLATE_CATEGORIES.includes(rawCat)) errors.push({ sheet: '3. Competency Matrix', row: r, message: `"${name}" — Category "${norm(vals[cCat])}" is not one of the six offered (Technical, Software, Safety, Management, Behavioral, Soft Skills).` });

    const rawAssess = lower(vals[cAssess]);
    const method = DEPT_TEMPLATE_ASSESSMENTS[rawAssess];
    if (!rawAssess) errors.push({ sheet: '3. Competency Matrix', row: r, message: `"${name}" has no Assessment Type.` });
    else if (!method) errors.push({ sheet: '3. Competency Matrix', row: r, message: `"${name}" — Assessment Type "${norm(vals[cAssess])}" is not one of the seven offered.` });

    const description = cDesc ? norm(vals[cDesc]) : '';
    if (!description) errors.push({ sheet: '3. Competency Matrix', row: r, message: `"${name}" has no Description. It is what the assessor reads before scoring somebody.` });

    const rates: Partial<Record<OrgLevel, number>> = {};
    for (const [rung, col] of rungCols) {
      const raw = norm(vals[col]);
      if (raw === '') continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        errors.push({ sheet: '3. Competency Matrix', row: r, message: `"${name}" — ${rung} reads "${raw}". A rate is a whole number 1-5, or blank for "not required at this rung" (never 0 or N/A).` });
      } else {
        rates[rung] = n;
      }
    }
    if (Object.keys(rates).length === 0) {
      warnings.push({ sheet: '3. Competency Matrix', row: r, message: `"${name}" is required at no rung. It will be added to the competency library but no position will ask for it.` });
    }

    const existing = skills.find(s => s.name.trim().toLowerCase() === key);
    plan.skills.push({
      code: cCode ? norm(vals[cCode]) : '',
      name,
      category: normalizeSkillCategory(norm(vals[cCat])),
      description,
      benefit: cBenefit ? norm(vals[cBenefit]) : '',
      assessmentMethod: method ?? 'OJT_OBSERVATION',
      rates,
      existingId: existing?.id,
    });
  }
  if (plan.skills.length === 0) errors.push({ sheet: '3. Competency Matrix', message: 'No skills were filled in.' });

  // ---------------------------------------------------------------- 2. Positions
  const ph = headerMap(posWs);
  const pTitle = columnFor(ph, 'position title');
  const pRung = columnFor(ph, 'rung');
  const pResp = columnFor(ph, 'what this position');
  if (!pTitle || !pRung) {
    errors.push({ sheet: '2. Positions', message: "The header row is not the template's. Expected Position Title / Rung / Reports To / Current Headcount / What this position is responsible for." });
    return plan;
  }
  const seenPos = new Map<string, number>();
  for (let r = 2; r <= posWs.rowCount; r++) {
    const vals = (posWs.getRow(r).values as any[]) ?? [];
    const cells = vals.slice(1).map(norm);
    if (!cells.some(v => v !== '')) continue;

    const title = norm(vals[pTitle]);
    if (!title) { errors.push({ sheet: '2. Positions', row: r, message: 'Row has data but no Position Title.' }); continue; }
    const key = title.toLowerCase();
    if (seenPos.has(key)) { errors.push({ sheet: '2. Positions', row: r, message: `"${title}" is already on row ${seenPos.get(key)}. One position = one profile = one row.` }); continue; }
    seenPos.set(key, r);

    const rung = norm(vals[pRung]).toUpperCase() as OrgLevel;
    if (!DEPT_TEMPLATE_RUNGS.includes(rung)) {
      errors.push({ sheet: '2. Positions', row: r, message: `"${title}" — Rung "${norm(vals[pRung])}" is not one of FR JP SP SH DM AGM GM.` });
      continue;
    }
    const skillCount = plan.skills.filter(s => s.rates[rung] !== undefined).length;
    if (skillCount === 0) {
      warnings.push({ sheet: '2. Positions', row: r, message: `"${title}" (${rung}) — no skill on the matrix carries a rate at ${rung}, so this profile would require nothing.` });
    }
    plan.positions.push({
      title,
      orgLevel: rung,
      description: pResp ? norm(vals[pResp]) : '',
      existingId: plan.departmentId
        ? jobs.find(j => j.title.trim().toLowerCase() === key && j.departmentId === plan.departmentId)?.id
        : undefined,
      skillCount,
    });
  }
  if (plan.positions.length === 0) errors.push({ sheet: '2. Positions', message: 'No positions were filled in. Each position becomes one job profile — without them there is nothing to attach the skills to.' });

  return plan;
};

export const BulkUpload: React.FC<BulkUploadProps> = ({ type, user, onComplete, onCancel }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // DEPT_TEMPLATE is a two-step import: the file is parsed and validated into
  // a plan the admin can read, and only a confirmed plan is written.
  const [plan, setPlan] = useState<DeptTemplatePlan | null>(null);

  const getTemplateData = () => {
    switch (type) {
      case 'USER':
        return [
          ['Name', 'Email', 'Phone', 'WhatsApp', 'Role (EMPLOYEE/ADMIN/CEO)', 'Status (ACTIVE/PENDING/REJECTED)', 'General Department Name', 'Parent Department Name', 'Direct Department Name', 'Job Profile Title', 'Manager Email', 'Hierarchy Level (CEO/ACEO/GM/AGM/DM/SH/SP/JP/FR)', 'Location', 'Project Name'],
          ['John Doe', 'john@example.com', '01234567890', '01234567890', 'EMPLOYEE', 'ACTIVE', 'General Health & Safety', 'Safety Department', 'Safety Section 1', 'Safety Engineer', 'manager@example.com', 'JP', 'Cairo Office', 'Project Alpha']
        ];
      case 'JOB':
        return [
          ['Title', 'Description', 'Code', 'Department Name', 'Skill Name', 'Required Level (1-5)', 'Org Level (CEO/ACEO/GM/AGM/DM/SH/SP/JP/FR)'],
          ['Software Engineer', 'Develops and maintains software applications.', 'ENG-SWE', 'Engineering', 'React.js', '3', 'JP'],
          ['Software Engineer', '', '', '', 'Node.js', '2', 'JP'],
          ['Software Engineer', '', '', '', 'React.js', '4', 'SH']
        ];
      case 'SKILL':
        return [
          ['Name', 'Category (Technical/Safety/Management/Soft Skills/Behavioral)', 'Criticality (SAFETY_CRITICAL/HIGH/STANDARD/LOW)', 'Assessment Question', 'Assessment Method (OJT_OBSERVATION/WORK_RECORD_REVIEW/WRITTEN_EXAM/PRACTICAL_DEMO/INTERVIEW)', 'Assessment Link', 'Code', 'Description', 'Level 1 Desc', 'Level 2 Desc', 'Level 3 Desc', 'Level 4 Desc', 'Level 5 Desc', 'Level 1 Certs', 'Level 2 Certs', 'Level 3 Certs', 'Level 4 Certs', 'Level 5 Certs'],
          ['React.js', 'Technical', 'STANDARD', 'How proficient is the employee in React?', 'OJT_OBSERVATION', '', 'TECH-REA-01', 'Proficiency in React.js library', 'Basic knowledge', 'Can build simple components', 'Can build complex apps', 'Expert level', 'Master level', 'React Basic Cert', '', '', '', '']
        ];
      case 'DEPT':
        return [
          ['Name', 'Type (GENERAL/DEPARTMENT/SECTION)', 'Parent Department Name', 'Manager Email'],
          ['Operation', 'GENERAL', '', 'ceo@example.com'],
          ['Safety Dept', 'DEPARTMENT', 'Operation', 'manager@example.com'],
          ['Environmental Section', 'SECTION', 'Safety Dept', 'sectionhead@example.com']
        ];
      case 'PROJECT':
        return [
          ['Name', 'Description', 'Location'],
          ['Project Alpha', 'Main expansion project', 'Alexandria']
        ];
      case 'COURSE':
        return [
          ['Title', 'Provider', 'Delivery (INTERNAL/EXTERNAL/OJT)', 'Skill Names (comma separated)', 'Code', 'Target Level (1-5)', 'Duration Hours', 'Cost Per Seat (EGP)', 'Link', 'Description'],
          ['Basic Offshore Safety Induction (BOSIET)', 'EPROM Training Centre', 'EXTERNAL', 'Fire Fighting, Sea Survival', 'TRN-BOSIE-01', '3', '24', '18000', 'https://example.com/bosiet', 'OPITO-approved offshore safety induction.'],
          ['Pump Alignment Workshop', 'Maintenance General Department', 'INTERNAL', 'Rotating Equipment Alignment', '', '4', '16', '0', '', 'Hands-on laser alignment practice.']
        ];

      default:
        return [];
    }
  };

  // The issued department template is a styled, drop-down-validated workbook
  // built outside the app. What the button hands back here is the same SHAPE —
  // correct sheet names, correct headers, one worked example — so an admin can
  // always see what the importer expects.
  const deptTemplateSheets = (): [string, any[][]][] => {
    const rungs = ['FR\nFresh', 'JP\nJunior Professional', 'SP\nSenior Professional', 'SH\nSection Head', 'DM\nDepartment Manager', 'AGM\nAssistant General Manager', 'GM\nGeneral Manager'];
    const matrixHeader = ['Skill Code', 'Category', 'Skill Name', 'Description - what the person must be able to DO', 'Why it matters to the business', 'Assessment Type', ...rungs];
    return [
      ['1. Department Info', [
        ['Question', 'Your answer'],
        ['General Department (the top unit this sits under)', ''],
        ['Department name (exactly as it should appear in the system)', ''],
        ['Section name, if this sheet covers one section only', ''],
        ['Total headcount covered by this sheet', ''],
        ['Person responsible for this submission (name)', ''],
        ['Job title', ''],
        ['Email', ''],
        ['Phone / extension', ''],
        ['Date submitted', ''],
        ['Anything the Competency team should know before uploading', ''],
      ]],
      ['2. Positions', [
        ['Position Title', 'Rung (FR/JP/SP/SH/DM/AGM/GM)', 'Reports To (position title)', 'Current Headcount', 'What this position is responsible for'],
        ['Contracts Engineer', 'SP', 'Section Head - Contracts', '3', 'Administers signed contracts day to day.'],
      ]],
      ['3. Competency Matrix', [matrixHeader]],
      ['EXAMPLE (filled in)', [
        matrixHeader,
        ['XX-S-01', 'Safety', 'Permit to Work', 'Raises, checks and closes a PTW for hot work, confined space and excavation; identifies when a permit is invalid and stops the job.', 'An invalid permit is how people get hurt.', 'Practical Demo', 3, 4, 5, 5, 5, 5, 5],
        ['XX-T-01', 'Technical', 'Contract Administration', 'Administers a signed contract day to day: obligations register, notices, variations, interim payment certificates and their time bars.', 'A missed notice period converts a valid claim into an unrecoverable cost.', 'Work Record', 1, 2, 4, 5, 5, 4, 4],
        ['XX-M-01', 'Management', 'Budget Ownership & Cost Control', 'Builds the annual budget for the unit, tracks commitment against actual, and explains a variance before it is discovered elsewhere.', 'A department that cannot explain its own variance has lost control of its plan.', 'Interview', '', '', '', 3, 5, 5, 5],
      ]],
    ];
  };

  const downloadTemplate = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      if (type === 'DEPT_TEMPLATE') {
        for (const [name, rows] of deptTemplateSheets()) wb.addWorksheet(name).addRows(rows);
      } else {
        const data = getTemplateData();
        const ws = wb.addWorksheet('Template');
        ws.addRows(data);
      }
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type.toLowerCase()}_template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate template:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
      setPlan(null);
    }
  };

  const processUpload = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);

      // The department template is multi-sheet and is validated before anything
      // is written: parsing produces a plan, and the admin confirms it.
      if (type === 'DEPT_TEMPLATE') {
        const parsed = parseDeptTemplate(
          wb,
          dataService.getAllDepartments(),
          dataService.getAllSkills(),
          dataService.getAllJobs(),
        );
        setPlan(parsed);
        setLoading(false);
        if (parsed.errors.length > 0) {
          setError(`${parsed.errors.length} problem${parsed.errors.length === 1 ? '' : 's'} must be fixed in the workbook before it can be imported. Nothing has been written.`);
        }
        return;
      }

      const ws = wb.worksheets[0];

      const allRows = ws.getRows(1, ws.rowCount) ?? [];
      if (allRows.length < 2) {
        setError('The file is empty.');
        setLoading(false);
        return;
      }
      // ExcelJS row.values is 1-indexed: [undefined, cell1, cell2, ...]
      const headers = (allRows[0].values as any[]).slice(1) as string[];
      const jsonData = allRows.slice(1)
        .map(row => {
          const vals = (row.values as any[]).slice(1);
          const obj: Record<string, any> = {};
          headers.forEach((h, i) => { if (h) obj[h] = vals[i] ?? ''; });
          return obj;
        })
        .filter(row => Object.values(row).some(v => v !== '' && v !== null && v !== undefined))
        .map(sanitizeRow);

      if (jsonData.length === 0) {
        setError('The file is empty.');
        setLoading(false);
        return;
      }

      {
        let count = 0;
        const depts = dataService.getAllDepartments();
        const jobs = dataService.getAllJobs();
        const users = dataService.getAllUsers();
        const skills = dataService.getAllSkills();
        const projects = dataService.getAllProjects();
        const courses = dataService.getAllTrainingCourses(true);
        // Skill names a COURSE row referenced that we could not match. Reported
        // back to the admin — silently dropping them would leave a course that
        // looks imported but can never be recommended.
        const unmatchedSkillNames = new Set<string>();


        // For JOB type, we need to group rows by Title and Department
        const jobBatch = new Map<string, JobProfile>();
        let lastJobKey = '';

        for (const row of jsonData) {
          try {
            switch (type) {
              case 'USER': {
                const email = (row['Email']?.toString() || '').toLowerCase();
                if (!email) break;

                const genDeptName = (row['General Department Name'] || '').toString().trim();
                const parentDeptName = (row['Parent Department Name'] || '').toString().trim();
                const directDeptName = (row['Direct Department Name'] || row['Department Name'] || '').toString().trim();
                
                let genDept = depts.find(d => d.name.toLowerCase() === genDeptName.toLowerCase());
                const parentDept = depts.find(d => d.name.toLowerCase() === parentDeptName.toLowerCase());
                const directDept = depts.find(d => {
                  const matchesName = d.name.toLowerCase() === directDeptName.toLowerCase();
                  if (!matchesName) return false;
                  
                  // If we have parent context, use it to ensure we pick the correct one
                  if (parentDept) return d.parentId === parentDept.id;
                  if (genDept) return dataService.getGeneralDeptId(d.id) === genDept.id;
                  
                  return true;
                });

                // If general dept is missing, try to infer it from direct dept
                if (!genDept && directDept) {
                    const inferredGenId = dataService.getGeneralDeptId(directDept.id);
                    genDept = depts.find(d => d.id === inferredGenId);
                }

                const job = jobs.find(j => j.title.toLowerCase() === (row['Job Profile Title'] || '').toString().toLowerCase());
                const manager = users.find(u => u.email.toLowerCase() === (row['Manager Email'] || '').toString().toLowerCase());

                const existingUser = users.find(u => u.email.toLowerCase() === email);

                const newUser: User = {
                  id: existingUser ? existingUser.id : Math.random().toString(36).substr(2, 9),
                  name: row['Name']?.toString() || '',
                  email: email,
                  phone: row['Phone']?.toString(),
                  whatsapp: row['WhatsApp']?.toString(),
                  projectName: row['Project Name']?.toString(),
                  location: row['Location']?.toString(),
                  role: (row['Role (EMPLOYEE/ADMIN/CEO)']?.toString().toUpperCase() || row['Role (EMPLOYEE/ADMIN)']?.toString().toUpperCase() as Role) || Role.EMPLOYEE,
                  status: (row['Status (ACTIVE/PENDING/REJECTED)']?.toString().toUpperCase() || row['Status (ACTIVE/PENDING)']?.toString().toUpperCase() as any) || 'ACTIVE',
                  departmentId: directDept?.id || parentDept?.id || genDept?.id || '',
                  generalDepartmentId: genDept?.id || (directDept ? dataService.getGeneralDeptId(directDept.id) : (parentDept ? dataService.getGeneralDeptId(parentDept.id) : undefined)),
                  jobProfileId: job?.id,
                  managerId: manager?.id,
                  orgLevel: (row['Hierarchy Level (CEO/ACEO/GM/AGM/DM/SH/SP/JP/FR)']?.toString().toUpperCase() || row['Hierarchy Level (CEO/GM/AGM/DM/SH/SP/JP/FR)']?.toString().toUpperCase() || row['Hierarchy Level (GM/AGM/DM/SH/SP/JP/FR)']?.toString().toUpperCase() as OrgLevel)
                };
                if (newUser.name && newUser.email) {
                  if (existingUser) {
                    await dataService.updateUser(newUser);
                  } else {
                    await dataService.addUser(newUser);
                  }
                  count++;
                }
                break;
              }
              case 'JOB': {
                let title = row['Title']?.toString().trim() || '';
                let deptName = row['Department Name']?.toString().trim() || '';
                
                // If title/dept are missing, use the last one (handles sub-rows for skills)
                if (!title && lastJobKey) {
                  const parts = lastJobKey.split('|');
                  title = parts[0];
                  deptName = parts[1];
                }

                if (!title || !deptName) break;
                
                const key = `${title}|${deptName}`;
                lastJobKey = key;

                let dept = depts.find(d => d.name.toLowerCase() === deptName.toLowerCase());
                if (!dept) {
                  dept = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: deptName,
                    behavioralSkillIds: []
                  };
                  await dataService.addDepartment(dept);
                  depts.push(dept);
                }

                let job = jobBatch.get(key);
                if (!job) {
                  const existingJob = jobs.find(j => j.title.toLowerCase() === title.toLowerCase() && j.departmentId === dept.id);
                  job = existingJob ? { ...existingJob } : {
                    id: Math.random().toString(36).substr(2, 9),
                    title: title,
                    description: row['Description']?.toString() || '',
                    departmentId: dept.id,
                    orgLevel: 'JP' as OrgLevel,
                    requiredSkills: [],
                    code: row['Code']?.toString() || ''
                  };
                  if (row['Code']) {
                    job.code = row['Code'].toString();
                  }
                  jobBatch.set(key, job);
                }

                // Handle skill requirement
                const skillName = row['Skill Name']?.toString().trim();
                const reqLevel = parseInt(row['Required Level (1-5)']?.toString());
                const orgLevelRaw = row['Org Level (CEO/ACEO/GM/AGM/DM/SH/SP/JP/FR)']?.toString() || row['Org Level (CEO/GM/AGM/DM/SH/SP/JP/FR)']?.toString() || row['Org Level (GM/AGM/DM/SH/SP/JP/FR)']?.toString() || row['Org Level']?.toString() || row['Hierarchy Level (CEO/ACEO/GM/AGM/DM/SH/SP/JP/FR)']?.toString() || row['Hierarchy Level (CEO/GM/AGM/DM/SH/SP/JP/FR)']?.toString() || row['Hierarchy Level (GM/AGM/DM/SH/SP/JP/FR)']?.toString();
                const orgLevel = orgLevelRaw?.toString().toUpperCase().trim() as OrgLevel;

                if (skillName && !isNaN(reqLevel) && orgLevel) {
                  let skill = skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
                  if (!skill) {
                    skill = {
                      id: Math.random().toString(36).substr(2, 9),
                      name: skillName,
                      category: 'Technical',
                      levels: {
                        1: { level: 1, description: '', requiredCertificates: [] },
                        2: { level: 2, description: '', requiredCertificates: [] },
                        3: { level: 3, description: '', requiredCertificates: [] },
                        4: { level: 4, description: '', requiredCertificates: [] },
                        5: { level: 5, description: '', requiredCertificates: [] },
                      },
                      status: 'APPROVED',
                      assessmentMethod: 'OJT_OBSERVATION'
                    };
                    await dataService.addSkill(skill);
                    skills.push(skill);
                  }
                  
                  // Each profile is one position at a single org level.
                  job.orgLevel = orgLevel;
                  if (!job.requiredSkills) job.requiredSkills = [];
                  // Avoid duplicate skills on the same profile
                  if (!job.requiredSkills.find((r: any) => r.skillId === skill!.id)) {
                    job.requiredSkills.push({
                      skillId: skill.id,
                      requiredLevel: reqLevel
                    });
                  }
                }
                break;
              }
              case 'SKILL': {
                const levels: any = {};
                for (let i = 1; i <= 5; i++) {
                  levels[i] = {
                    level: i,
                    description: row[`Level ${i} Desc`]?.toString() || '',
                    requiredCertificates: row[`Level ${i} Certs`]?.toString() ? row[`Level ${i} Certs`].toString().split(',').map((s: string) => s.trim()) : []
                  };
                }
                const name = row['Name']?.toString() || '';
                if (!name) break;
                
                const existingSkill = skills.find(s => s.name.toLowerCase() === name.toLowerCase());
                
                // A blank cell keeps whatever the skill already had — a
                // re-import of an old sheet must not silently reset every
                // criticality an admin has judged back to STANDARD.
                const criticalityCell = row['Criticality (SAFETY_CRITICAL/HIGH/STANDARD/LOW)']?.toString().trim().toUpperCase();
                const criticality = criticalityCell
                  ? skillCriticalityOf(criticalityCell)
                  : skillCriticalityOf(existingSkill?.criticality);

                const newSkill: Skill = {
                  id: existingSkill ? existingSkill.id : Math.random().toString(36).substr(2, 9),
                  name: name,
                  category: normalizeSkillCategory(row['Category (Technical/Safety/Management/Soft Skills/Behavioral)']?.toString()),
                  criticality,
                  assessmentQuestion: row['Assessment Question']?.toString() || '',
                  assessmentMethod: (row['Assessment Method (OJT_OBSERVATION/WORK_RECORD_REVIEW/WRITTEN_EXAM/PRACTICAL_DEMO/INTERVIEW)']?.toString().toUpperCase() as any) || (existingSkill?.assessmentMethod) || 'OJT_OBSERVATION',
                  assessmentLink: row['Assessment Link']?.toString() || '',
                  code: row['Code']?.toString() || '',
                  description: row['Description']?.toString() || '',
                  levels,
                  status: existingSkill ? existingSkill.status : 'APPROVED',
                };
                
                if (existingSkill) {
                  await dataService.updateSkill(newSkill);
                } else {
                  await dataService.addSkill(newSkill);
                }
                count++;
                break;
              }
              case 'DEPT': {
                const name = row['Name']?.toString() || '';
                if (!name) break;
                
                const manager = users.find(u => u.email.toLowerCase() === (row['Manager Email'] || '').toString().toLowerCase());
                const existingDept = depts.find(d => d.name.toLowerCase() === name.toLowerCase());
                
                const parentDeptName = (row['Parent Department Name'] || '').toString().trim();
                const parentDept = depts.find(d => d.name.toLowerCase() === parentDeptName.toLowerCase());

                const newDept: Department = {
                  id: existingDept ? existingDept.id : Math.random().toString(36).substr(2, 9),
                  name: name,
                  type: (row['Type (GENERAL/DEPARTMENT/SECTION)']?.toString().toUpperCase() as any) || existingDept?.type || 'DEPARTMENT',
                  parentId: parentDept?.id || existingDept?.parentId,
                  managerId: manager?.id || existingDept?.managerId,
                  behavioralSkillIds: existingDept ? existingDept.behavioralSkillIds : []
                };
                
                if (existingDept) {
                  await dataService.updateDepartment(newDept);
                } else {
                  await dataService.addDepartment(newDept);
                }
                count++;
                break;
              }
              case 'PROJECT': {
                const name = row['Name']?.toString() || '';
                if (!name) break;
                
                const existingProject = projects.find(p => p.name.toLowerCase() === name.toLowerCase());
                
                const newProject: any = {
                  id: existingProject ? existingProject.id : Math.random().toString(36).substr(2, 9),
                  name: name,
                  description: row['Description']?.toString() || '',
                  location: row['Location']?.toString() || '',
                  createdAt: (existingProject as any)?.createdAt || Date.now()
                };
                
                if (existingProject) {
                  await dataService.updateProject(newProject);
                } else {
                  await dataService.addProject(newProject);
                }
                count++;
                break;
              }
              case 'COURSE': {
                const title = row['Title']?.toString().trim() || '';
                if (!title) break;

                const provider = row['Provider']?.toString().trim() || '';
                const rawType = row['Delivery (INTERNAL/EXTERNAL/OJT)']?.toString().trim().toUpperCase()
                  || row['Type (INTERNAL/EXTERNAL/OJT)']?.toString().trim().toUpperCase();
                const type: TrainingCourse['type'] =
                  rawType === 'EXTERNAL' || rawType === 'OJT' ? rawType : 'INTERNAL';

                // Skills are named, not id'd, in a spreadsheet. Match on name
                // first, then code, both case-insensitively.
                const linkedSkillIds: string[] = [];
                const names = (row['Skill Names (comma separated)'] || row['Skill Names'] || row['Skill Name'] || '')
                  .toString().split(',').map((s: string) => s.trim()).filter(Boolean);
                for (const name of names) {
                  const match = skills.find(s =>
                    s.name.toLowerCase() === name.toLowerCase() ||
                    (s.code || '').toLowerCase() === name.toLowerCase());
                  if (match) {
                    if (!linkedSkillIds.includes(match.id)) linkedSkillIds.push(match.id);
                  } else {
                    unmatchedSkillNames.add(name);
                  }
                }

                const num = (raw: any) => {
                  const n = Number(raw?.toString().trim());
                  return raw !== '' && raw != null && Number.isFinite(n) ? n : undefined;
                };
                const targetLevelRaw = num(row['Target Level (1-5)'] ?? row['Target Level']);
                const targetLevel = targetLevelRaw && targetLevelRaw >= 1 && targetLevelRaw <= 5
                  ? Math.round(targetLevelRaw) : undefined;

                // Re-import of the same sheet must update, not duplicate: a
                // course is identified by its code, else by title + provider.
                const code = row['Code']?.toString().trim() || '';
                const existing = courses.find(c =>
                  (code && (c.code || '').toLowerCase() === code.toLowerCase()) ||
                  (!code && c.title.toLowerCase() === title.toLowerCase()
                    && (c.provider || '').toLowerCase() === provider.toLowerCase()));

                const payload = {
                  title,
                  provider,
                  type,
                  linkedSkillIds,
                  code: code || existing?.code,
                  description: row['Description']?.toString().trim() || undefined,
                  link: row['Link']?.toString().trim() || undefined,
                  durationHours: num(row['Duration Hours']),
                  costPerSeat: num(row['Cost Per Seat (EGP)'] ?? row['Cost Per Seat']),
                  targetLevel,
                };

                if (existing) {
                  const updated = await dataService.updateTrainingCourse({ ...existing, ...payload, isArchived: false });
                  const idx = courses.findIndex(c => c.id === existing.id);
                  if (idx >= 0) courses[idx] = updated;
                } else {
                  courses.push(await dataService.addTrainingCourse(payload));
                }
                count++;
                break;
              }

            }
          } catch (err) {
            console.error('Error processing row:', row, err);
          }
        }

        // Save all grouped job profiles
        if (type === 'JOB') {
          for (const job of jobBatch.values()) {
            const existingJob = jobs.find(j => j.id === job.id);
            if (existingJob) {
              await dataService.updateJobProfile(job);
            } else {
              await dataService.addJobProfile(job);
            }
            count++;
          }
        }

        setSuccess(`Successfully imported ${count} ${type.toLowerCase()}s.`);
        if (unmatchedSkillNames.size > 0) {
          // Not an error — the courses were imported — but the admin must know
          // these links were dropped, or the catalogue silently under-covers.
          setError(
            `These skill names were not found and were not linked: ${[...unmatchedSkillNames].join(', ')}. ` +
            `Check the spelling against the Skill Library, then re-import.`,
          );
        }
        setLoading(false);
        setTimeout(() => onComplete(), unmatchedSkillNames.size > 0 ? 6000 : 2000);
      }
    } catch {
      setError('Failed to process file. Please check the format.');
      setLoading(false);
    }
  };

  // A NEW skill's criticality is derived from the sheet the same way the BD/EC
  // import derives it — Safety is safety-critical, a skill already demanded at
  // 5 from a fresh joiner is HIGH, everything else STANDARD. It only weights
  // gap ranking. An EXISTING skill keeps whatever an admin judged: a template
  // upload must never silently re-rank the library.
  const deriveCriticality = (row: DeptTemplateSkillRow): SkillCriticality => {
    if (row.category === 'Safety') return 'SAFETY_CRITICAL';
    if (row.rates.FR === 5) return 'HIGH';
    return 'STANDARD';
  };

  const applyDeptTemplate = async (confirmed: DeptTemplatePlan) => {
    setLoading(true);
    setError(null);
    try {
      const existingSkills = dataService.getAllSkills();
      const existingJobs = dataService.getAllJobs();
      const idByName = new Map<string, string>();
      const failed: string[] = [];
      let skillsCreated = 0;
      let skillsUpdated = 0;

      // --- Phase 1: the dictionary. Skills are always written FIRST so that no
      // requirement in phase 2 can ever reference a skill that does not exist.
      for (const row of confirmed.skills) {
        const existing = row.existingId ? existingSkills.find(s => s.id === row.existingId) : undefined;
        // Blank level descriptions must not wipe wording an admin has written —
        // the template carries no Level 1-5 text at all.
        const levels: any = existing?.levels ?? {};
        for (let i = 1; i <= 5; i++) {
          if (!levels[i]) levels[i] = { level: i, description: '', requiredCertificates: [] };
        }
        const description = row.benefit
          ? `${row.description}\n\nWhy it matters: ${row.benefit}`
          : row.description;
        const payload: Skill = {
          id: existing ? existing.id : Math.random().toString(36).substr(2, 9),
          name: row.name,
          category: row.category,
          criticality: existing ? skillCriticalityOf(existing.criticality) : deriveCriticality(row),
          assessmentQuestion: existing?.assessmentQuestion ?? '',
          assessmentMethod: row.assessmentMethod,
          assessmentLink: existing?.assessmentLink ?? '',
          code: row.code || existing?.code || '',
          description,
          levels,
          status: existing ? existing.status : 'APPROVED',
        };
        try {
          if (existing) { await dataService.updateSkill(payload); skillsUpdated++; }
          else { await dataService.addSkill(payload); skillsCreated++; }
          idByName.set(row.name.toLowerCase(), payload.id);
        } catch (err) {
          console.error('Failed to write skill', row.name, err);
          failed.push(row.name);
        }
      }

      // --- Phase 2: one job profile per position, its requirements read off the
      // matrix column for that position's rung. Every skillId comes out of the
      // map phase 1 built, so an unwritten skill is DROPPED and reported, never
      // invented as a blank one.
      let profilesCreated = 0;
      let profilesUpdated = 0;
      for (const pos of confirmed.positions) {
        const requiredSkills = confirmed.skills
          .filter(s => s.rates[pos.orgLevel] !== undefined)
          .map(s => ({ skillId: idByName.get(s.name.toLowerCase()), requiredLevel: s.rates[pos.orgLevel]! }))
          .filter((r): r is { skillId: string; requiredLevel: number } => !!r.skillId);

        const existing = pos.existingId ? existingJobs.find(j => j.id === pos.existingId) : undefined;
        const payload: JobProfile = {
          id: existing ? existing.id : Math.random().toString(36).substr(2, 9),
          title: pos.title,
          description: pos.description || existing?.description || '',
          departmentId: confirmed.departmentId,
          orgLevel: pos.orgLevel,
          requiredSkills,
          code: existing?.code || '',
        };
        if (existing) { await dataService.updateJobProfile(payload); profilesUpdated++; }
        else { await dataService.addJobProfile(payload); profilesCreated++; }
      }

      setPlan(null);
      setSuccess(
        `Imported into ${confirmed.departmentLabel}: ` +
        `${skillsCreated} new + ${skillsUpdated} updated competencies, ` +
        `${profilesCreated} new + ${profilesUpdated} updated job profiles.`
      );
      if (failed.length > 0) {
        setError(`These competencies could not be saved and were left off every profile: ${failed.join(', ')}.`);
      }
      setLoading(false);
      setTimeout(() => onComplete(), failed.length > 0 ? 6000 : 2500);
    } catch (err) {
      console.error(err);
      setError('The import failed part-way through. Re-check the department under Admin > Job Profiles before re-running.');
      setLoading(false);
    }
  };
  if (!user || user.role !== Role.ADMIN) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-none w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl border border-slate-300">
          <div className="p-6 border-b border-slate-300 flex justify-between items-center bg-slate-50">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Lock size={20} className="text-rose-600" />
              Access Denied
            </h3>
            <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-none text-slate-600 transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="p-8 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-none flex items-center justify-center mx-auto">
              <Lock size={24} />
            </div>
            <p className="text-sm text-slate-600">
              You do not have the required permissions to perform bulk imports. This action is restricted to administrators.
            </p>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-300 flex justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-slate-600 font-bold text-xs uppercase tracking-wide hover:bg-slate-100 transition-colors rounded-none"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const planBlocked = !!plan && plan.errors.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={`bg-white rounded-none w-full ${plan ? 'max-w-3xl' : 'max-w-md'} max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl border border-slate-300`}>
        <div className="p-6 border-b border-slate-300 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-blue-700" />
            Bulk Upload: {type === 'USER' ? 'Workforce' : type === 'JOB' ? 'Job Profiles' : type === 'SKILL' ? 'Skill Standards' : type === 'PROJECT' ? 'Projects' : type === 'COURSE' ? 'Training Courses' : type === 'DEPT_TEMPLATE' ? 'Department Job Profile Template' : 'Departments'}

          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-none text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto">
          {!plan && <div className="bg-blue-50 border border-blue-100 p-4 rounded-none">
            <h4 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
              <Download size={16} /> Step 1: Download Template
            </h4>
            <p className="text-xs text-blue-700 mb-4">Download the pre-formatted Excel file to ensure your data is correctly structured.</p>
            <button 
              onClick={downloadTemplate}
              className="w-full py-2 bg-white border border-blue-300 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-none hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
            >
              Download Excel Template
            </button>
            {type === 'DEPT_TEMPLATE' && (
              <p className="text-[11px] text-blue-700 mt-3 leading-relaxed">
                This is the sheet shape only. Send departments the issued
                <span className="font-bold"> EPROM_Job_Profile_Template.xlsx</span>, which carries the
                instructions, the rating scale and the drop-down validation.
              </p>
            )}
          </div>}

          {!plan && <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Upload size={16} /> Step 2: Upload Filled File
            </h4>
            <div className="border-2 border-dashed border-slate-300 p-8 text-center rounded-none hover:border-blue-500 transition-colors relative group">
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="space-y-2">
                <div className="w-12 h-12 bg-slate-100 rounded-none flex items-center justify-center mx-auto group-hover:bg-blue-50 transition-colors">
                  <Upload size={24} className="text-slate-400 group-hover:text-blue-500" />
                </div>
                <p className="text-sm font-medium text-slate-700">{file ? file.name : 'Click or drag file to upload'}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Excel files only (.xlsx, .xls)</p>
              </div>
            </div>
          </div>}

          {plan && (
            <div className="space-y-5">
              <div className={`p-4 rounded-none border ${planBlocked ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                <h4 className={`text-sm font-bold ${planBlocked ? 'text-rose-900' : 'text-emerald-900'}`}>
                  {planBlocked ? 'This workbook cannot be imported yet' : 'Ready to import'}
                </h4>
                <p className="text-xs text-slate-700 mt-1">
                  {plan.departmentLabel
                    ? <>Target unit: <span className="font-bold">{plan.departmentLabel}</span></>
                    : 'No target unit could be resolved.'}
                </p>
                <p className="text-xs text-slate-700 mt-2">
                  {plan.skills.length} competencies
                  {' '}({plan.skills.filter(k => !k.existingId).length} new,
                  {' '}{plan.skills.filter(k => k.existingId).length} already in the library)
                  {' '}· {plan.positions.length} job profiles
                  {' '}({plan.positions.filter(k => !k.existingId).length} new,
                  {' '}{plan.positions.filter(k => k.existingId).length} to be replaced)
                </p>
                <p className="text-[11px] text-slate-500 mt-2">
                  Nothing has been written yet. Competencies are saved first, then each position's
                  required levels are read off its rung column. No department or competency is
                  created that is not named on the sheet.
                </p>
              </div>

              {plan.positions.length > 0 && (
                <div className="border border-slate-200">
                  <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Job profiles
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-100">
                    {plan.positions.map((pos, i) => (
                      <div key={i} className="px-3 py-2 flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-slate-800 truncate">{pos.title}</span>
                        <span className="shrink-0 text-slate-500">
                          {pos.orgLevel} · {pos.skillCount} skills ·{' '}
                          <span className={pos.existingId ? 'text-amber-700' : 'text-emerald-700'}>
                            {pos.existingId ? 'replaces existing' : 'new'}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {plan.errors.length > 0 && (
                <div className="border border-rose-200">
                  <div className="px-3 py-2 bg-rose-50 border-b border-rose-200 text-[11px] font-bold uppercase tracking-wider text-rose-700">
                    {plan.errors.length} problem{plan.errors.length === 1 ? '' : 's'} — fix in the workbook, then upload again
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-rose-50">
                    {plan.errors.map((issue, i) => (
                      <div key={i} className="px-3 py-2 text-xs text-slate-700">
                        <span className="font-bold text-rose-700">
                          {issue.sheet}{issue.row ? ` · row ${issue.row}` : ''}
                        </span>{' — '}{issue.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {plan.warnings.length > 0 && (
                <div className="border border-amber-200">
                  <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    {plan.warnings.length} thing{plan.warnings.length === 1 ? '' : 's'} to be aware of — the import can still run
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-amber-50">
                    {plan.warnings.map((issue, i) => (
                      <div key={i} className="px-3 py-2 text-xs text-slate-700">
                        <span className="font-bold text-amber-700">
                          {issue.sheet}{issue.row ? ` · row ${issue.row}` : ''}
                        </span>{' — '}{issue.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-100 p-3 rounded-none flex items-start gap-3 text-rose-700">
              <AlertCircle size={18} className="shrink-0" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-none flex items-start gap-3 text-emerald-700">
              <CheckCircle size={18} className="shrink-0" />
              <p className="text-xs font-medium">{success}</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-300 flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 font-bold text-xs uppercase tracking-wide hover:bg-slate-100 transition-colors rounded-none"
          >
            Cancel
          </button>
          {plan && (
            <button
              onClick={() => { setPlan(null); setError(null); }}
              className="px-4 py-2 text-slate-600 font-bold text-xs uppercase tracking-wide hover:bg-slate-100 transition-colors rounded-none"
            >
              Choose another file
            </button>
          )}
          <button
            onClick={plan ? () => applyDeptTemplate(plan) : processUpload}
            disabled={!file || loading || planBlocked}
            className={`px-6 py-2 bg-blue-700 text-white font-bold text-xs uppercase tracking-wide rounded-none transition-all flex items-center gap-2 ${(!file || loading || planBlocked) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-800'}`}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {loading ? 'Processing...' : plan ? 'Confirm Import' : type === 'DEPT_TEMPLATE' ? 'Check File' : 'Start Import'}
          </button>
        </div>
      </div>
    </div>
  );
};
