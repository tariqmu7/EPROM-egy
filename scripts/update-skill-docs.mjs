// Inject a standards-based "## Assessment Methods" section into every skill doc
// in skills/*.md, driven by the SAME config that seeds Firestore
// (scripts/seed-skill-assessment-methods.mjs) — so the authored docs and the
// live data never drift. Also authors the two docs that were missing
// (leadership, strategic-planning).
//
// Idempotent: re-running replaces the existing "## Assessment Methods" section
// (it is bounded by the next "## " heading) rather than duplicating it.
//
// Usage:  node scripts/update-skill-docs.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SKILLS, buildBlock, TEST_LINK } from './seed-skill-assessment-methods.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(__dirname, '..', 'skills');

// skill id → markdown filename
const FILE_BY_ID = {
  'sk-bid-tender': 'bid-tender-management.md',
  'sk-bizdev-strategy': 'business-development-strategy.md',
  'sk-client-relationship': 'client-relationship-management.md',
  'sk-commercial-acumen': 'commercial-financial-acumen.md',
  'sk-contract-admin': 'contract-drafting-administration.md',
  'sk-contract-negotiation': 'contract-negotiation.md',
  'sk-contract-risk': 'contractual-risk-compliance.md',
  'sk-data-analysis': 'data-analysis-reporting.md',
  'sk-digital-marketing': 'digital-marketing-brand-management.md',
  'sk-hse-awareness': 'hse-awareness.md',
  'sk-market-research': 'market-research-competitive-intelligence.md',
  'sk-marketing-programs': 'marketing-program-management.md',
  'sk-oilgas-knowledge': 'oil-gas-industry-market-knowledge.md',
  'sk-project-contract-followup': 'project-contract-followup-claims.md',
  'sk-proposal-writing': 'proposal-technical-writing.md',
  'sk-stakeholder-comm': 'stakeholder-communication-presentation.md',
  'sk-tender-evaluation': 'tender-evaluation-bid-adjudication.md',
  'sk-vendor-relationship': 'vendor-subcontractor-management.md',
  // Authored fresh by this script (no existing doc):
  'sk-leadership': 'leadership-people-management.md',
  'sk-strategic-planning': 'strategic-planning-execution.md',
};

const METHOD_LABEL = {
  WRITTEN_EXAM: 'Written Examination (online, external link)',
  INTERVIEW: 'Interview & Technical Discussion',
  PRACTICAL_DEMO: 'Practical Demonstration / Simulation',
  OJT_OBSERVATION: 'OJT Observation (On-the-Job)',
  THREE_SIXTY_EVALUATION: '360° Multi-Rater Evaluation',
  WORK_RECORD_REVIEW: 'Work Record / Case Study Review',
};

const METHOD_CONFORMS = {
  WRITTEN_EXAM: 'ISO 10667, ISO/IEC 17024, NIST SP 800-181 r1',
  INTERVIEW: 'ISO 10667, BARS, SHRM BASK',
  PRACTICAL_DEMO: 'ISO 10667, ISO/IEC 17024, OPITO',
  OJT_OBSERVATION: 'BARS, 360° Multi-Rater, NIH, OPITO',
  THREE_SIXTY_EVALUATION: '360° Multi-Rater, BARS, SHRM BASK',
  WORK_RECORD_REVIEW: 'ISO 10667, ISO/IEC 17024, OPITO',
};

const ASSESSOR_LABEL = {
  DIRECT_MANAGER: 'Direct Manager',
  SECTION_HEAD: 'Section Head',
  DEPARTMENT_MANAGER: 'Department Manager',
  EXTERNAL: 'External Assessor',
  COMMITTEE: 'Assessment Committee',
};

const FREQ_LABEL = {
  ONE_TIME: 'One time (never recurs)',
  ANNUAL_FIXED_DATE: 'Annually on a fixed date',
  ANYTIME_ANNUAL: 'Any time within the year (annual)',
  QUARTERLY: 'Quarterly',
  MONTHLY: 'Monthly',
  WEEKLY: 'Weekly',
  CERTIFICATE_BASED: 'Certificate-based (expires with certificate)',
};

const AUDIENCE_LABEL = {
  ALL: 'All employees assigned the skill',
  FRESH_ONLY: 'Fresh hires only',
  MANAGERS_ONLY: 'Managers only',
  ORG_LEVELS: 'Specific org levels',
  DEPARTMENTS: 'Specific departments',
};

// Build the "## Assessment Methods" markdown for one skill block.
function sectionFor(skillId, def) {
  const b = buildBlock(skillId, def);
  const rows = [['Method', METHOD_LABEL[b.method]]];
  if (b.assessmentLink) {
    const label = b.method === 'WRITTEN_EXAM' ? 'Exam link' : 'Meeting link';
    rows.push([label, `${b.assessmentLink} *(test placeholder)*`]);
  }
  if (b.passingScorePercent != null) rows.push(['Passing score', `${b.passingScorePercent}%`]);
  if (b.timeLimitMinutes != null) rows.push(['Time limit', `${b.timeLimitMinutes} min`]);
  if (b.questionCount != null) rows.push(['Questions drawn', String(b.questionCount)]);
  if (b.raterWeights) rows.push(['Rater weights', `Self ${b.raterWeights.self}% / Peer ${b.raterWeights.peer}% / Manager ${b.raterWeights.manager}%`]);
  if (b.assessorRole) rows.push([b.method === 'THREE_SIXTY_EVALUATION' ? 'Assessor (manager rater)' : 'Assessor', ASSESSOR_LABEL[b.assessorRole]]);
  if (b.evidenceValidityMonths != null) rows.push(['Evidence validity', `${b.evidenceValidityMonths} months`]);
  if (b.minEvidenceCount != null) rows.push(['Min. approved records', String(b.minEvidenceCount)]);
  rows.push(['Frequency', FREQ_LABEL[b.frequency]]);
  rows.push(['Audience', AUDIENCE_LABEL[b.audience]]);

  let out = '## Assessment Methods\n\n';
  out += `Configured inline on the skill (**Admin › Skills › Competency Standard › Assessment Methods**) and conforms to **${METHOD_CONFORMS[b.method]}**.\n\n`;
  out += '| Setting | Value |\n|---|---|\n';
  for (const [k, v] of rows) out += `| ${k} | ${v} |\n`;
  out += '\n';

  if (b.assessmentQuestion) out += `**Prompt** — ${b.assessmentQuestion}\n\n`;

  if (b.questions && b.questions.length) {
    const weighted = b.questions.some(q => q.weight != null);
    if (weighted) {
      out += '**Behaviourally-anchored criteria** (rated 1–5, weighted to 100):\n\n';
      for (const q of b.questions) out += `- ${q.text} — **${q.weight}%**\n`;
    } else {
      out += '**Sample exam items:**\n\n';
      for (const q of b.questions) out += `- ${q.text}\n`;
    }
    out += '\n';
  }
  return out;
}

// Replace an existing "## Assessment Methods" section (up to the next "## ") or
// insert before "## Notes" (or append) in an existing doc.
function injectSection(content, section) {
  const re = /## Assessment Methods\n[\s\S]*?(?=\n## |\n*$)/;
  if (re.test(content)) {
    return content.replace(re, section.trimEnd() + '\n');
  }
  const notesIdx = content.indexOf('\n## Notes');
  if (notesIdx !== -1) {
    return content.slice(0, notesIdx + 1) + section + content.slice(notesIdx + 1);
  }
  return content.trimEnd() + '\n\n' + section;
}

// --- Authored content for the two docs with no existing file ---
const NEW_DOCS = {
  'sk-leadership': {
    nameEn: 'Leadership & People Management', nameAr: 'القيادة وإدارة الأفراد',
    category: 'Management', appliesTo: 'Managers — section, department and general-department leadership roles',
    description: 'Leading managers and teams across multiple units — setting direction, developing capability, managing performance, and building a high-performing, accountable commercial organisation.',
    levels: [
      'Understands team goals and supports colleagues constructively',
      'Guides a small task or team and gives basic feedback with support',
      'Leads a team: sets goals, manages performance and develops members',
      'Leads managers across units; builds capability and a strong performance culture',
      'Shapes leadership and talent strategy for the general department; develops other leaders',
    ],
    notes: 'Leadership competency assessed via 360° multi-rater feedback; the manager-rater is the post-holder’s own line manager.',
  },
  'sk-strategic-planning': {
    nameEn: 'Strategic Planning & Execution', nameAr: 'التخطيط الاستراتيجي والتنفيذ',
    category: 'Management', appliesTo: 'General-department and senior management roles',
    description: 'Translating company direction into clear objectives, budgets and measurable targets for a general department, then driving disciplined execution and course-correction against them.',
    levels: [
      'Understands the department objectives and how own work supports them',
      'Contributes to plans and tracks progress against set targets with guidance',
      'Builds objectives, budgets and plans for a unit and monitors delivery',
      'Sets multi-unit strategy and KPIs; aligns resources and adjusts to performance',
      'Owns the general-department strategy and execution system; aligns leadership behind it',
    ],
    notes: 'Assessed by an interview / panel discussion conducted by an assessment committee.',
  },
};

const PROFICIENCY = ['Awareness', 'Basic', 'Intermediate', 'Advanced', 'Expert'];

function newDoc(skillId, def, meta) {
  let out = `# Skill — ${meta.nameEn}\n\n`;
  out += `> ${meta.nameAr}\n\n`;
  out += '| Field | Value |\n|---|---|\n';
  out += `| **Category** | ${meta.category} |\n`;
  out += `| **Assessment method** | ${def.method} |\n`;
  out += `| **Applies to** | ${meta.appliesTo} |\n\n`;
  out += `## Description\n\n${meta.description}\n\n`;
  out += '## Proficiency Levels\n\n';
  out += '| Level | Label | What it means for this skill |\n|---|---|---|\n';
  meta.levels.forEach((d, i) => { out += `| ${i + 1} | ${PROFICIENCY[i]} | ${d} |\n`; });
  out += '\n';
  out += sectionFor(skillId, def);
  out += `## Notes\n\n${meta.notes}\n`;
  return out;
}

function main() {
  let updated = 0, created = 0;
  for (const [skillId, def] of Object.entries(SKILLS)) {
    const file = FILE_BY_ID[skillId];
    if (!file) { console.warn(`! no filename mapped for ${skillId}`); continue; }
    const fp = path.join(SKILLS_DIR, file);
    if (fs.existsSync(fp)) {
      const before = fs.readFileSync(fp, 'utf8');
      const after = injectSection(before, sectionFor(skillId, def));
      if (after !== before) { fs.writeFileSync(fp, after); updated++; console.log(`  ✓ updated  ${file}`); }
      else console.log(`  · unchanged ${file}`);
    } else if (NEW_DOCS[skillId]) {
      fs.writeFileSync(fp, newDoc(skillId, def, NEW_DOCS[skillId]));
      created++; console.log(`  + created  ${file}`);
    } else {
      console.warn(`! missing file and no template for ${skillId} (${file})`);
    }
  }
  console.log(`\n✓ ${updated} updated, ${created} created.`);
}

main();
