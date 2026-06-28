// Seed inline `assessmentMethods` blocks onto every skill in the live `skills`
// collection — giving the app actual, standards-based assessment data instead of
// the empty legacy stubs left behind by the one-time migration.
//
// Each block defines HOW (method + prompt / link / question bank), WHEN
// (recurrence) and WHO (audience), plus the per-method standards controls from
// ASSESSMENT_METHODOLOGY.md §5:
//   - WRITTEN_EXAM .......... passingScorePercent, timeLimitMinutes, questionCount, link (ISO/IEC 17024)
//   - INTERVIEW ............. assessorRole, meeting link, BARS-anchored questions (ISO 10667 / BARS)
//   - PRACTICAL_DEMO ........ assessorRole, observation checklist (ISO 10667 / OPITO)
//   - THREE_SIXTY_EVALUATION  raterWeights (Self/Peer/Manager), assessorRole (360° / BARS)
//   - WORK_RECORD_REVIEW .... evidenceValidityMonths, minEvidenceCount (ISO 10667 / OPITO)
//
// All external links are stubbed to https://www.google.com/ for testing.
//
// Source of truth for which method each skill uses: skills/*.md + skills/README.md.
//
// Behaviour: idempotent. Uses an updateMask so ONLY the `assessmentMethods`
// field is written — every other field on each skill doc is left untouched. It
// never deletes documents. Re-running overwrites only that one field.
//
// Auth: reuses the Firebase CLI login (same mechanism as seed-job-profiles.mjs).
//
// Usage:  node scripts/seed-skill-assessment-methods.mjs [--dry-run]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

export const TEST_LINK = 'https://www.google.com/';
const DEFAULT_RATER_WEIGHTS = { self: 10, peer: 30, manager: 60 };

// Helper: build a rating-style question (1-5 BARS anchor, weighted).
const q = (text, weight) => ({ text, minRating: 1, maxRating: 5, weight });
// Helper: build a knowledge item for a written exam (no weight/rating).
const k = (text) => ({ text });

// --- Per-skill assessment definitions (method drawn from skills/README.md) ---
// Each entry produces ONE SkillAssessmentMethod block. `audience: ALL`,
// annual recurrence by default — sensible re-assessment cadence for commercial
// competencies.
export const SKILLS = {
  // ---------------- WRITTEN_EXAM (ISO/IEC 17024) ----------------
  'sk-market-research': {
    method: 'WRITTEN_EXAM',
    passingScorePercent: 70, timeLimitMinutes: 45, questionCount: 25,
    frequency: 'ANYTIME_ANNUAL',
    questions: [
      k('Define market segmentation and explain how it informs BD targeting in oil & gas.'),
      k('Given a competitor data set, identify the company’s relative market positioning.'),
      k('List reliable sources of market & competitive intelligence and rank their credibility.'),
    ],
  },
  'sk-commercial-acumen': {
    method: 'WRITTEN_EXAM',
    passingScorePercent: 70, timeLimitMinutes: 45, questionCount: 25,
    frequency: 'ANYTIME_ANNUAL',
    questions: [
      k('Calculate gross margin and mark-up for a given cost and selling price.'),
      k('Build a simple ROI / payback case for an investment opportunity.'),
      k('Explain how pricing, cost and risk trade off in a commercial decision.'),
    ],
  },
  'sk-oilgas-knowledge': {
    method: 'WRITTEN_EXAM',
    passingScorePercent: 70, timeLimitMinutes: 40, questionCount: 20,
    frequency: 'ANYTIME_ANNUAL',
    questions: [
      k('Describe the upstream / midstream / downstream oil & gas value chain.'),
      k('Identify the main Egyptian operators and regulators and their roles.'),
      k('Explain how a regulatory change could affect a commercial opportunity.'),
    ],
  },
  'sk-hse-awareness': {
    method: 'WRITTEN_EXAM',
    // Safety-critical baseline → higher pass bar, company-wide annual refresh.
    passingScorePercent: 80, timeLimitMinutes: 30, questionCount: 20,
    frequency: 'ANYTIME_ANNUAL',
    questions: [
      k('State the core HSE rules and your hazard-reporting obligations.'),
      k('Identify the correct HSE procedure for a described worksite hazard.'),
      k('Explain the company HSE policy and the safety culture expected of all staff.'),
    ],
  },

  // ---------------- INTERVIEW (ISO 10667 / BARS) ----------------
  'sk-bizdev-strategy': {
    method: 'INTERVIEW', assessorRole: 'DEPARTMENT_MANAGER', frequency: 'ANYTIME_ANNUAL',
    questions: [
      q('Translates market intelligence into a qualified, prioritised opportunity pipeline.', 40),
      q('Builds a sound business case for a market-entry / growth decision.', 30),
      q('Aligns opportunities to company growth objectives and qualification criteria.', 30),
    ],
  },
  'sk-contract-negotiation': {
    method: 'INTERVIEW', assessorRole: 'DEPARTMENT_MANAGER', frequency: 'ANYTIME_ANNUAL',
    questions: [
      q('Prepares and runs a negotiation within the approved mandate / red lines.', 35),
      q('Balances margin, risk and relationship to reach favourable commercial terms.', 40),
      q('Handles concessions and deadlock with a clear strategy.', 25),
    ],
  },
  'sk-contract-risk': {
    method: 'INTERVIEW', assessorRole: 'DEPARTMENT_MANAGER', frequency: 'ANYTIME_ANNUAL',
    questions: [
      q('Identifies and quantifies contractual risk and compliance exposure.', 40),
      q('Applies appropriate mitigation, escalation and approval controls.', 35),
      q('Demonstrates knowledge of governing law, liability and indemnity clauses.', 25),
    ],
  },
  'sk-strategic-planning': {
    method: 'INTERVIEW', assessorRole: 'COMMITTEE', frequency: 'ANYTIME_ANNUAL',
    questions: [
      q('Translates company direction into clear objectives, budgets and KPIs.', 40),
      q('Drives disciplined execution and course-corrects against performance.', 35),
      q('Aligns resources and leadership behind the plan.', 25),
    ],
  },

  // ---------------- PRACTICAL_DEMO (ISO 10667 / OPITO) ----------------
  'sk-data-analysis': {
    method: 'PRACTICAL_DEMO', assessorRole: 'DIRECT_MANAGER', frequency: 'ANYTIME_ANNUAL',
    assessmentQuestion: 'Observe the candidate analyse a supplied data set and build a report/dashboard live; score against the checklist below.',
    questions: [
      q('Cleans and structures the raw data correctly.', 25),
      q('Applies the right analysis / model for the question (pipeline, forecast, etc.).', 35),
      q('Produces a clear, accurate dashboard / report with actionable insight.', 40),
    ],
  },

  // ---------------- THREE_SIXTY_EVALUATION (360° / BARS) ----------------
  'sk-client-relationship': {
    method: 'THREE_SIXTY_EVALUATION', assessorRole: 'DIRECT_MANAGER',
    raterWeights: DEFAULT_RATER_WEIGHTS, frequency: 'ANYTIME_ANNUAL',
    questions: [
      q('Builds and sustains trusted, long-term client / partner relationships.', 40),
      q('Manages and grows assigned accounts through proactive engagement.', 35),
      q('Represents the company credibly when networking at senior levels.', 25),
    ],
  },
  'sk-stakeholder-comm': {
    method: 'THREE_SIXTY_EVALUATION', assessorRole: 'DIRECT_MANAGER',
    raterWeights: DEFAULT_RATER_WEIGHTS, frequency: 'ANYTIME_ANNUAL',
    questions: [
      q('Communicates clearly and adapts the message to the audience.', 35),
      q('Presents confidently to groups and handles tough Q&A.', 35),
      q('Influences and aligns senior stakeholders.', 30),
    ],
  },
  'sk-vendor-relationship': {
    method: 'THREE_SIXTY_EVALUATION', assessorRole: 'DIRECT_MANAGER',
    raterWeights: DEFAULT_RATER_WEIGHTS, frequency: 'ANYTIME_ANNUAL',
    questions: [
      q('Selects, onboards and manages vendors / subcontractors effectively.', 35),
      q('Monitors performance against SLAs and resolves issues constructively.', 35),
      q('Maintains fair, compliant and value-driven supplier relationships.', 30),
    ],
  },
  'sk-leadership': {
    method: 'THREE_SIXTY_EVALUATION', assessorRole: 'DEPARTMENT_MANAGER',
    raterWeights: DEFAULT_RATER_WEIGHTS, frequency: 'ANYTIME_ANNUAL',
    questions: [
      q('Sets clear direction and goals for teams / managers across units.', 35),
      q('Develops capability and manages performance fairly.', 35),
      q('Builds an accountable, high-performing culture.', 30),
    ],
  },

  // ---------------- WORK_RECORD_REVIEW (ISO 10667 / OPITO) ----------------
  'sk-marketing-programs': {
    method: 'WORK_RECORD_REVIEW', evidenceValidityMonths: 12, minEvidenceCount: 2,
    frequency: 'ANYTIME_ANNUAL',
    assessmentQuestion: 'Review submitted campaign plans, budgets and KPI / ROI reports as evidence of competence.',
    questions: [
      q('Plans and delivers campaigns end-to-end with a budget and KPIs.', 50),
      q('Measures and optimises on ROI / lead generation.', 50),
    ],
  },
  'sk-bid-tender': {
    method: 'WORK_RECORD_REVIEW', evidenceValidityMonths: 12, minEvidenceCount: 2,
    frequency: 'ANYTIME_ANNUAL',
    assessmentQuestion: 'Review tender trackers, qualify/no-bid records and submitted bid documents as evidence.',
    questions: [
      q('Coordinates a compliant bid response end-to-end and meets submission rules.', 50),
      q('Drives a sound qualify / no-bid decision and win strategy.', 50),
    ],
  },
  'sk-proposal-writing': {
    method: 'WORK_RECORD_REVIEW', evidenceValidityMonths: 12, minEvidenceCount: 2,
    frequency: 'ANYTIME_ANNUAL',
    assessmentQuestion: 'Review authored proposals / tenders for clarity, compliance and persuasiveness.',
    questions: [
      q('Produces complete, compliant proposals that meet submission requirements.', 50),
      q('Writes clear, client-focused, win-themed content.', 50),
    ],
  },
  'sk-digital-marketing': {
    method: 'WORK_RECORD_REVIEW', evidenceValidityMonths: 12, minEvidenceCount: 2,
    frequency: 'ANYTIME_ANNUAL',
    assessmentQuestion: 'Review digital campaigns, content and brand assets produced as evidence.',
    questions: [
      q('Runs digital campaigns and maintains brand consistency across channels.', 50),
      q('Ties channel / content activity to demand-generation goals and measures it.', 50),
    ],
  },
  'sk-contract-admin': {
    method: 'WORK_RECORD_REVIEW', evidenceValidityMonths: 12, minEvidenceCount: 2,
    frequency: 'ANYTIME_ANNUAL',
    assessmentQuestion: 'Review drafted / administered contracts and amendment records as evidence.',
    questions: [
      q('Drafts and administers contracts accurately and compliantly.', 50),
      q('Maintains complete records, variations and obligations tracking.', 50),
    ],
  },
  'sk-tender-evaluation': {
    method: 'WORK_RECORD_REVIEW', evidenceValidityMonths: 12, minEvidenceCount: 2,
    frequency: 'ANYTIME_ANNUAL',
    assessmentQuestion: 'Review bid evaluation matrices and adjudication recommendations as evidence.',
    questions: [
      q('Applies objective, weighted evaluation criteria fairly.', 50),
      q('Produces a defensible, well-documented adjudication recommendation.', 50),
    ],
  },
  'sk-project-contract-followup': {
    method: 'WORK_RECORD_REVIEW', evidenceValidityMonths: 12, minEvidenceCount: 2,
    frequency: 'ANYTIME_ANNUAL',
    assessmentQuestion: 'Review contract follow-up logs, variation orders and claims files as evidence.',
    questions: [
      q('Tracks contract obligations and milestones and flags deviations early.', 50),
      q('Prepares and manages variations / claims with proper substantiation.', 50),
    ],
  },
};

// --- Build a SkillAssessmentMethod block from a definition ---
export function buildBlock(skillId, def) {
  const block = {
    id: `am-${skillId}-1`,
    method: def.method,
    frequency: def.frequency,
    audience: 'ALL',
    questions: (def.questions || []).map((qq, i) => ({ id: `${skillId}-q${i + 1}`, ...qq })),
  };
  if (def.assessmentQuestion) block.assessmentQuestion = def.assessmentQuestion;
  if (def.method === 'WRITTEN_EXAM') {
    block.assessmentLink = TEST_LINK;
    if (def.passingScorePercent != null) block.passingScorePercent = def.passingScorePercent;
    if (def.timeLimitMinutes != null) block.timeLimitMinutes = def.timeLimitMinutes;
    if (def.questionCount != null) block.questionCount = def.questionCount;
  }
  if (def.method === 'INTERVIEW') {
    block.assessmentLink = TEST_LINK; // meeting link
  }
  if (def.assessorRole) block.assessorRole = def.assessorRole;
  if (def.raterWeights) block.raterWeights = def.raterWeights;
  if (def.evidenceValidityMonths != null) block.evidenceValidityMonths = def.evidenceValidityMonths;
  if (def.minEvidenceCount != null) block.minEvidenceCount = def.minEvidenceCount;
  return block;
}

// --- Firestore REST value serialisation (recursive). ---
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [key, val] of Object.entries(v)) fields[key] = toValue(val);
    return { mapValue: { fields } };
  }
  throw new Error(`Unserialisable value: ${v}`);
}

// --- Firebase CLI token (mirrors seed-job-profiles.mjs) ---
async function getToken() {
  const globalRoot = execSync('npm root -g').toString().trim();
  const authPath = path.join(globalRoot, 'firebase-tools', 'lib', 'auth.js');
  const auth = await import(pathToFileURL(authPath).href);
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('No Firebase CLI login found. Run `firebase login` first.');
  }
  const tok = await auth.getAccessToken(account.tokens.refresh_token, [
    'https://www.googleapis.com/auth/cloud-platform',
  ]);
  return { token: tok.access_token, email: account.user?.email };
}

async function batchWrite(token, writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const res = await fetch(`${BASE}:batchWrite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: chunk }),
    });
    if (!res.ok) throw new Error(`batchWrite failed ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const errs = (json.status || []).filter(s => s.code && s.code !== 0);
    if (errs.length) throw new Error(`batchWrite partial errors: ${JSON.stringify(errs)}`);
    console.log(`  ✓ committed ${chunk.length} writes`);
  }
}

async function main() {
  const entries = Object.entries(SKILLS);
  console.log(`→ Prepared assessmentMethods for ${entries.length} skills.`);

  const writes = entries.map(([skillId, def]) => {
    const block = buildBlock(skillId, def);
    // Stored exactly as the app writes it: a JSON string in the `assessmentMethods` field.
    const json = JSON.stringify([block]);
    return {
      update: {
        name: `${DOC_PATH}/skills/${skillId}`,
        fields: { assessmentMethods: toValue(json) },
      },
      updateMask: { fieldPaths: ['assessmentMethods'] },
    };
  });

  if (DRY_RUN) {
    console.log('— DRY RUN — no writes.');
    entries.forEach(([skillId, def]) => {
      const b = buildBlock(skillId, def);
      console.log(`  skills/${skillId}  ${b.method}  freq=${b.frequency}  q=${b.questions.length}` +
        (b.passingScorePercent ? `  pass=${b.passingScorePercent}%` : '') +
        (b.assessorRole ? `  assessor=${b.assessorRole}` : '') +
        (b.raterWeights ? `  raters=${b.raterWeights.self}/${b.raterWeights.peer}/${b.raterWeights.manager}` : '') +
        (b.evidenceValidityMonths ? `  evidence=${b.minEvidenceCount}@${b.evidenceValidityMonths}mo` : '') +
        (b.assessmentLink ? `  link=${b.assessmentLink}` : ''));
    });
    return;
  }

  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);
  console.log(`→ Committing ${writes.length} writes (assessmentMethods field only)…`);
  await batchWrite(token, writes);
  console.log('✓ assessmentMethods seeded onto all skills.');
}

// Only run the seed when invoked directly (not when imported for its config).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch(err => { console.error('✖ Seed failed:', err.message || err); process.exit(1); });
}
