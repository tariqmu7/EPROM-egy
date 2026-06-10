// ISO.3 — exportable "Statement of Competence". Replaces the raw window.print()
// of the whole dashboard with a branded, print-optimised competence record:
// employee identity, each competency with required vs. achieved proficiency
// level and status, plus issue date and a validity note. Opens in a new window
// so the user can Save-as-PDF or print. Dependency-free (no PDF lib needed).

import { PROFICIENCY_DEFINITIONS } from '../constants';

export interface CompetenceRow {
  code?: string;
  name: string;
  required: number;
  current: number;
}

export interface CompetenceStatementInput {
  employeeName: string;
  employeeId?: string;
  jobTitle?: string;
  department?: string;
  orgLevelLabel?: string;
  managerName?: string;
  rows: CompetenceRow[];
  appraisalScore?: number; // latest annual appraisal %, if any
  // Months the statement remains valid for (re-assessment cadence). Default 12.
  validityMonths?: number;
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

const levelLabel = (n: number): string => {
  const def = PROFICIENCY_DEFINITIONS[n as 1 | 2 | 3 | 4 | 5];
  return def ? `${n} — ${def.label}` : (n > 0 ? String(n) : '—');
};

export function buildCompetenceStatementHtml(input: CompetenceStatementInput): string {
  const issued = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  const validity = input.validityMonths ?? 12;
  const validUntilDate = new Date();
  validUntilDate.setMonth(validUntilDate.getMonth() + validity);
  const validUntil = new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(validUntilDate);

  const metCount = input.rows.filter(r => r.current >= r.required).length;
  const total = input.rows.length;
  const coverage = total > 0 ? Math.round((metCount / total) * 100) : 0;

  const rowsHtml = input.rows.map(r => {
    const met = r.current >= r.required;
    return `
      <tr>
        <td class="code">${esc(r.code || '')}</td>
        <td>${esc(r.name)}</td>
        <td class="lvl">${esc(levelLabel(r.required))}</td>
        <td class="lvl">${esc(levelLabel(r.current))}</td>
        <td class="status ${met ? 'met' : 'gap'}">${met ? '✓ Met' : '✕ Gap'}</td>
      </tr>`;
  }).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Statement of Competence — ${esc(input.employeeName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Inter', Arial, sans-serif; color: #0f172a; margin: 0; padding: 40px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1d4ed8; padding-bottom:16px; }
  .head h1 { font-size:22px; margin:0; letter-spacing:-.5px; }
  .head .org { font-size:12px; text-transform:uppercase; letter-spacing:2px; color:#1d4ed8; font-weight:800; }
  .sub { color:#475569; font-size:13px; margin-top:4px; }
  .meta { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; margin:24px 0; font-size:13px; }
  .meta div span { color:#64748b; display:block; font-size:11px; text-transform:uppercase; letter-spacing:1px; }
  .meta div b { font-size:14px; }
  .summary { background:#f1f5f9; border:1px solid #e2e8f0; padding:14px 16px; margin:16px 0; font-size:13px; display:flex; gap:32px; }
  .summary b { font-size:18px; display:block; }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; }
  th { text-align:left; background:#0f172a; color:#fff; padding:8px 10px; font-size:11px; text-transform:uppercase; letter-spacing:.5px; }
  td { padding:8px 10px; border-bottom:1px solid #e2e8f0; }
  td.code { font-family:monospace; color:#64748b; }
  td.lvl { white-space:nowrap; }
  td.status { font-weight:700; white-space:nowrap; }
  td.status.met { color:#047857; }
  td.status.gap { color:#be123c; }
  .foot { margin-top:32px; font-size:11px; color:#64748b; border-top:1px solid #e2e8f0; padding-top:16px; }
  .sign { margin-top:40px; display:grid; grid-template-columns:1fr 1fr; gap:48px; }
  .sign div { border-top:1px solid #94a3b8; padding-top:6px; font-size:12px; color:#475569; }
  @media print { body { padding:0; } .noprint { display:none; } }
</style></head>
<body>
  <div class="head">
    <div>
      <div class="org">EPROM Competency Management</div>
      <h1>Statement of Competence</h1>
      <div class="sub">Issued in accordance with ISO 9001:2015 §7.2 (Competence)</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#475569;">
      <div>Issued: <b>${esc(issued)}</b></div>
      <div>Valid until: <b>${esc(validUntil)}</b></div>
    </div>
  </div>

  <div class="meta">
    <div><span>Employee</span><b>${esc(input.employeeName)}</b></div>
    <div><span>Employee ID</span><b>${esc(input.employeeId || '—')}</b></div>
    <div><span>Job Title</span><b>${esc(input.jobTitle || '—')}</b></div>
    <div><span>Hierarchy Level</span><b>${esc(input.orgLevelLabel || '—')}</b></div>
    <div><span>Department</span><b>${esc(input.department || '—')}</b></div>
    <div><span>Reporting Manager</span><b>${esc(input.managerName || '—')}</b></div>
  </div>

  <div class="summary">
    <div>Profile coverage<b>${coverage}%</b></div>
    <div>Competencies met<b>${metCount} / ${total}</b></div>
    ${input.appraisalScore != null ? `<div>Latest annual appraisal<b>${esc(input.appraisalScore)}%</b></div>` : ''}
  </div>

  <table>
    <thead><tr><th>Code</th><th>Competency</th><th>Required</th><th>Achieved</th><th>Status</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">No competencies on profile.</td></tr>'}</tbody>
  </table>

  <div class="sign">
    <div>Reporting Manager — signature &amp; date</div>
    <div>Competency Administrator — signature &amp; date</div>
  </div>

  <div class="foot">
    Proficiency scale: 1 Awareness · 2 Knowledge · 3 Skill · 4 Advanced · 5 Expert. This statement reflects
    assessed competence as of the issue date and is valid for ${validity} months, subject to the assessment
    re-evaluation cadence. Generated automatically by EPROM CMS.
  </div>

  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body></html>`;
}

export function exportCompetenceStatement(input: CompetenceStatementInput): void {
  const html = buildCompetenceStatementHtml(input);
  const win = window.open('', '_blank');
  if (!win) return; // popup blocked
  win.document.open();
  win.document.write(html);
  win.document.close();
}
