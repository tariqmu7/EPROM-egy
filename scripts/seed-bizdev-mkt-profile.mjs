// Seed the "Business Development & Marketing Programs" job profile plus the 13
// skills it requires, into the live `skills` and `jobProfiles` collections.
//
// Source of truth (authored docs):
//   - job_profiles/business-development-external-contracting/business-development-marketing-programs-sp.md
//   - skills/*.md  (one file per skill)
//
// Placement (confirmed with the product owner):
//   - departmentId `d-bizdev-mkt` — the "Business Development & Marketing
//     Programs" sub-unit directly under the GM of Business Development (`g-bizdev`).
//   - orgLevel `AGM` (Assistant General Manager) — derived from the node's
//     structural Hierarchy Level / Type. `d-bizdev-mkt` is an ASSISTANT_GENERAL-type
//     unit box (every sub-unit directly under a GM is an AGM box), and the
//     type→org-level mapping is ASSISTANT_GENERAL → AGM.
//
// Behaviour: idempotent upsert by deterministic id (`sk-*` skills, `bizdev-mkt-sp`
// profile). Re-running overwrites those docs and touches nothing else — it never
// deletes. The profile id intentionally avoids the `jp-` prefix so the leadership
// seed (scripts/seed-job-profiles.mjs), which deletes stale `jp-*` profiles, can
// never remove it.
//
// Auth: reuses the Firebase CLI login (same mechanism as seed-job-profiles.mjs).
//
// Usage:  node scripts/seed-bizdev-mkt-profile.mjs [--dry-run]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

const DEPARTMENT_ID = 'd-bizdev-mkt';
const ORG_LEVEL = 'AGM';
const PROFILE_ID = 'bizdev-mkt-sp';

// --- Skill catalog (from skills/*.md). lv = [l1, l2, l3, l4, l5] meanings. ---
const SKILLS = [
  {
    id: 'sk-market-research', code: 'COM-MKT-01', category: 'Technical',
    name: 'Market Research & Competitive Intelligence', method: 'WRITTEN_EXAM',
    description: 'Gathering and analysing data on industry trends, client needs, and competitor activity to inform business decisions and identify new opportunities in the oil-and-gas market.',
    lv: [
      'Knows what market research is and where company market data lives',
      'Collects and summarises published market and competitor data with guidance',
      'Runs structured market studies; profiles competitors and segments independently',
      'Synthesises intelligence into opportunity assessments that shape BD decisions',
      'Builds the market-intelligence framework; forecasts market shifts and advises leadership',
    ],
  },
  {
    id: 'sk-bizdev-strategy', code: 'COM-BDS-01', category: 'Technical',
    name: 'Business Development Strategy', method: 'INTERVIEW',
    description: 'Evaluating and developing growth strategy aligned to company objectives and services — translating market intelligence into a prioritised pipeline of qualified opportunities.',
    lv: [
      "Understands the company's services and growth objectives",
      'Contributes ideas to opportunity lists under direction',
      'Builds and maintains an opportunity pipeline; applies qualification criteria',
      'Develops segment/market entry strategies and business cases that win new work',
      'Sets the BD strategy and growth roadmap; aligns leadership behind it',
    ],
  },
  {
    id: 'sk-marketing-programs', code: 'COM-MPM-01', category: 'Technical',
    name: 'Marketing Program Management', method: 'WORK_RECORD_REVIEW',
    description: "Planning, running, and measuring marketing campaigns and brand initiatives that generate qualified leads and support the company's commercial positioning.",
    lv: [
      "Knows the company's marketing channels and brand basics",
      'Executes defined campaign tasks and tracks simple metrics',
      'Plans and delivers campaigns end-to-end with a budget and KPIs',
      'Designs multi-channel programs tied to pipeline goals; optimises on ROI',
      'Owns the marketing program portfolio and sets measurement standards',
    ],
  },
  {
    id: 'sk-bid-tender', code: 'COM-BID-01', category: 'Technical',
    name: 'Bid & Tender Management (RFQ / RFP / ITT)', method: 'WORK_RECORD_REVIEW',
    description: 'Tracking and managing RFQs, RFPs and ITTs through a structured tender process — making qualify / no-bid decisions and providing technical and commercial input into winning proposals.',
    lv: [
      'Understands the tender lifecycle and key document types',
      'Maintains the tender tracker and assembles bid documents with guidance',
      'Coordinates a bid response end-to-end and meets submission compliance',
      'Leads bids; drives qualify/no-bid calls and win strategy with commercial input',
      'Owns the bid process and win-rate improvement; mentors bid teams',
    ],
  },
  {
    id: 'sk-contract-negotiation', code: 'COM-CNG-01', category: 'Technical',
    name: 'Contract Negotiation', method: 'INTERVIEW',
    description: 'Negotiating contracts with clients, vendors and partners to secure favorable commercial terms while meeting client needs and managing risk.',
    lv: [
      "Understands common contract terms and the company's red lines",
      'Supports negotiations and prepares term comparisons',
      'Leads routine negotiations within an approved mandate',
      'Negotiates complex/high-value deals, balancing margin, risk and relationship',
      'Sets negotiation strategy and playbooks; handles the most strategic deals',
    ],
  },
  {
    id: 'sk-commercial-acumen', code: 'COM-CFA-01', category: 'Technical',
    name: 'Commercial & Financial Acumen', method: 'WRITTEN_EXAM',
    description: 'Applying pricing, margin, ROI and business-case logic to evaluate opportunities and make commercially sound decisions.',
    lv: [
      'Understands basic cost, price and margin concepts',
      'Reads financial figures and builds simple cost estimates with guidance',
      'Builds business cases and pricing models for individual opportunities',
      'Evaluates deal economics and risk; advises on pricing and margin trade-offs',
      'Sets commercial/pricing policy and benchmarks across the portfolio',
    ],
  },
  {
    id: 'sk-client-relationship', code: 'COM-CRM-01', category: 'Technical',
    name: 'Client Relationship Management', method: 'THREE_SIXTY_EVALUATION',
    description: 'Building and managing long-term client and partner relationships — account management, networking and partnership development that sustain and grow business.',
    lv: [
      'Knows key clients and the basics of professional networking',
      'Maintains client contact records and handles routine follow-up',
      'Manages assigned accounts and grows them through proactive engagement',
      'Owns strategic accounts; builds trusted partnerships at senior levels',
      'Sets the account-management approach; opens doors others cannot',
    ],
  },
  {
    id: 'sk-oilgas-knowledge', code: 'TEC-OAG-01', category: 'Technical',
    name: 'Oil & Gas Industry & Market Knowledge', method: 'WRITTEN_EXAM',
    description: 'Understanding the oil-and-gas value chain, key players, regulatory environment and competitive landscape (Egypt and regional) to ground commercial decisions in sector reality.',
    lv: [
      'Knows the basic upstream/midstream/downstream value chain',
      'Familiar with key local operators, services and terminology',
      'Understands market structure, regulation and competitor positioning',
      'Reads sector dynamics and links them to company opportunities and risks',
      'Recognised sector authority; anticipates market and regulatory shifts',
    ],
  },
  {
    id: 'sk-proposal-writing', code: 'COM-PRP-01', category: 'Technical',
    name: 'Proposal & Technical Writing', method: 'WORK_RECORD_REVIEW',
    description: 'Producing clear, compliant and persuasive proposals, tenders and commercial bids that communicate value and meet submission requirements.',
    lv: [
      'Understands proposal structure and compliance basics',
      'Drafts sections from templates with review',
      'Writes complete, compliant proposals independently',
      'Crafts win-themed, client-focused proposals that lift win rate',
      'Sets proposal standards and templates; coaches writers',
    ],
  },
  {
    id: 'sk-stakeholder-comm', code: 'BEH-STK-01', category: 'Behavioral',
    name: 'Stakeholder Communication & Presentation', method: 'THREE_SIXTY_EVALUATION',
    description: 'Communicating with influence — presenting to clients, partners and executives, and adapting the message to persuade and align stakeholders.',
    lv: [
      'Communicates clearly in routine, one-to-one settings',
      'Delivers prepared updates and simple presentations',
      'Presents confidently to groups and tailors content to the audience',
      'Influences senior stakeholders; handles tough rooms and Q&A',
      'Sets the communication standard; represents the company in high-stakes forums',
    ],
  },
  {
    id: 'sk-digital-marketing', code: 'COM-DIG-01', category: 'Technical',
    name: 'Digital Marketing & Brand Management', method: 'WORK_RECORD_REVIEW',
    description: "Using digital channels, content and brand positioning to raise the company's profile and generate demand in target segments.",
    lv: [
      "Understands the company's brand and main digital channels",
      'Publishes content and updates with guidance',
      'Runs digital campaigns and manages brand consistency',
      'Plans channel/content strategy tied to demand-generation goals',
      'Owns brand and digital strategy; sets standards and measurement',
    ],
  },
  {
    id: 'sk-data-analysis', code: 'TEC-DAR-01', category: 'Technical',
    name: 'Data Analysis & Reporting', method: 'PRACTICAL_DEMO',
    description: 'Using spreadsheet and BI tools to analyse pipeline, forecast, and produce market and performance reports that inform commercial decisions.',
    lv: [
      'Reads basic charts and tables',
      'Builds simple spreadsheets and standard reports',
      'Models pipeline/forecast data and builds clear dashboards',
      'Derives insight from complex data sets and presents actionable analysis',
      'Sets reporting/analytics standards and tooling for the function',
    ],
  },
  {
    id: 'sk-hse-awareness', code: 'SAF-HSE-02', category: 'Safety',
    name: 'HSE Awareness', method: 'WRITTEN_EXAM',
    description: "Baseline understanding of Health, Safety and Environment principles and the company's HSE policy — the safety culture expected of every employee in an oil-and-gas organisation.",
    lv: [
      'Knows core HSE rules, hazards and reporting obligations',
      'Applies HSE procedures correctly in own work and worksites',
      'Identifies risks proactively and promotes safe behavior in the team',
      'Embeds HSE into planning and decisions; coaches others',
      'Shapes HSE culture and policy across the organisation',
    ],
  },
];

// --- Required level per skill for this position (from the profile doc). ---
const REQUIRED_LEVELS = {
  'sk-market-research': 4,
  'sk-bizdev-strategy': 4,
  'sk-marketing-programs': 4,
  'sk-bid-tender': 4,
  'sk-contract-negotiation': 4,
  'sk-commercial-acumen': 3,
  'sk-client-relationship': 4,
  'sk-oilgas-knowledge': 4,
  'sk-proposal-writing': 3,
  'sk-stakeholder-comm': 4,
  'sk-digital-marketing': 3,
  'sk-data-analysis': 3,
  'sk-hse-awareness': 2,
};

const PROFILE = {
  id: PROFILE_ID,
  title: 'Business Development & Marketing Programs',
  description: 'تنمية الأعمال وبرامج التسويق',
  departmentId: DEPARTMENT_ID,
  orgLevel: ORG_LEVEL,
  requiredSkills: SKILLS.map(s => ({ skillId: s.id, requiredLevel: REQUIRED_LEVELS[s.id] })),
};

// --- Firestore REST value serialisation (recursive). ---
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toValue) } };
  }
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toValue(val);
    return { mapValue: { fields } };
  }
  throw new Error(`Unserialisable value: ${v}`);
}

function fields(rec) {
  const f = {};
  for (const [k, v] of Object.entries(rec)) f[k] = toValue(v);
  return f;
}

function skillRecord(s) {
  const levels = {};
  s.lv.forEach((desc, i) => {
    levels[String(i + 1)] = { level: i + 1, description: desc, requiredCertificates: [] };
  });
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    code: s.code,
    description: s.description,
    assessmentMethod: s.method,
    status: 'APPROVED',
    isArchived: false,
    levels,
  };
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
  const skillRecords = SKILLS.map(skillRecord);
  console.log(`→ Prepared ${skillRecords.length} skills + 1 job profile (${PROFILE_ID}, ${ORG_LEVEL}, dept ${DEPARTMENT_ID}).`);

  if (DRY_RUN) {
    console.log('— DRY RUN — no writes.');
    skillRecords.forEach(r => console.log(`  upsert skills/${r.id}  [${r.code}]  ${r.name}`));
    console.log(`  upsert jobProfiles/${PROFILE.id}  ${PROFILE.title} (${PROFILE.orgLevel})`);
    PROFILE.requiredSkills.forEach(rs => console.log(`     • ${rs.skillId} → level ${rs.requiredLevel}`));
    return;
  }

  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);

  const writes = [];
  for (const r of skillRecords) {
    writes.push({ update: { name: `${DOC_PATH}/skills/${r.id}`, fields: fields(r) } });
  }
  writes.push({ update: { name: `${DOC_PATH}/jobProfiles/${PROFILE.id}`, fields: fields(PROFILE) } });

  console.log(`→ Committing ${writes.length} writes…`);
  await batchWrite(token, writes);
  console.log('✓ Skills + job profile seeded.');
}

main().catch(err => { console.error('✖ Seed failed:', err.message || err); process.exit(1); });
