// Seed the "External Contracts/Bids & Project Contract Follow-up" AGM unit-head
// job profile, plus the 5 NEW contracts-specific skills it introduces, into the
// live `skills` and `jobProfiles` collections.
//
// Source of truth (authored docs):
//   - job_profiles/business-development-external-contracting/external-contracts-bids-programs-sp.md
//   - skills/*.md  (one file per skill)
//
// Placement (structural twin of the Marketing sub-unit under the same GM):
//   - departmentId `d-bizdev-ext` — the "External Contracts/Bids & Project
//     Contract Follow-up" ASSISTANT_GENERAL box directly under the GM of Business
//     Development (`g-bizdev`).
//   - orgLevel `AGM` (Assistant General Manager) — derived from the node's
//     structural Hierarchy Level / Type. `d-bizdev-ext` is an ASSISTANT_GENERAL-type
//     unit box, the twin of `d-bizdev-mkt`; both are sub-units directly under the GM
//     and so are headed at AGM level (ASSISTANT_GENERAL → AGM).
//
// Skills: this profile reuses 8 skills already owned by the Marketing seed
// (seed-bizdev-mkt-profile.mjs) and introduces 5 NEW contracts-specific skills.
// To stay a clean single owner, this script ONLY creates the 5 new `sk-*` skills;
// it assumes the 8 shared skills already exist (run the Marketing seed first if
// not). It then attaches all 13 to the profile at the levels in the doc.
//
// Behaviour: idempotent upsert by deterministic id (5 new `sk-*` skills,
// `bizdev-ext-sp` profile). Re-running overwrites those docs and touches nothing
// else — it never deletes. The profile id intentionally avoids the `jp-` prefix
// so the leadership seed (scripts/seed-job-profiles.mjs), which deletes stale
// `jp-*` profiles, can never remove it.
//
// Auth: reuses the Firebase CLI login (same mechanism as seed-bizdev-mkt-profile.mjs).
//
// Usage:  node scripts/seed-bizdev-ext-profile.mjs [--dry-run]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

const DEPARTMENT_ID = 'd-bizdev-ext';
const ORG_LEVEL = 'AGM';
const PROFILE_ID = 'bizdev-ext-sp';

// --- NEW skills introduced by this profile (from skills/*.md). The 8 shared
//     skills (sk-bid-tender, sk-contract-negotiation, sk-commercial-acumen,
//     sk-proposal-writing, sk-oilgas-knowledge, sk-stakeholder-comm,
//     sk-data-analysis, sk-hse-awareness) are owned by the Marketing seed and
//     are NOT (re)written here. lv = [l1..l5] meanings. ---
const NEW_SKILLS = [
  {
    id: 'sk-tender-evaluation', code: 'COM-TEV-01', category: 'Technical',
    name: 'Tender Evaluation & Bid Adjudication', method: 'WORK_RECORD_REVIEW',
    description: 'Evaluating received bids and tenders against technical, commercial and compliance criteria — running a structured, auditable adjudication to recommend award decisions that achieve best value and meet governance requirements.',
    lv: [
      'Knows the stages of bid evaluation and basic technical/commercial criteria',
      'Compiles received bids and checks completeness and compliance with guidance',
      'Scores bids against agreed technical and commercial criteria independently',
      'Designs evaluation models and leads adjudication panels to a justified, auditable award recommendation',
      'Sets evaluation / adjudication policy and governance; assures award integrity across the function',
    ],
  },
  {
    id: 'sk-contract-admin', code: 'COM-CAD-01', category: 'Technical',
    name: 'Contract Drafting & Administration', method: 'WORK_RECORD_REVIEW',
    description: 'Drafting, issuing and administering contracts and their amendments — building clear, enforceable terms, maintaining the contract record, and ensuring obligations, milestones and approvals are tracked through the full contract lifecycle.',
    lv: [
      'Understands standard contract structure and key clause types',
      'Prepares contracts from approved templates and maintains the contract register with guidance',
      'Drafts and administers complete contracts and variations independently',
      'Tailors complex contract terms and leads administration across a portfolio of contracts',
      'Sets contract templates, clause libraries and administration standards for the company',
    ],
  },
  {
    id: 'sk-project-contract-followup', code: 'COM-PCF-01', category: 'Technical',
    name: 'Project Contract Follow-up & Claims Management', method: 'WORK_RECORD_REVIEW',
    description: "Following up project contracts through execution — administering variations, progress and payment certificates, and managing claims and disputes (e.g. under FIDIC-style conditions of contract) to protect the company's entitlement and commercial value.",
    lv: [
      'Understands the project-contract lifecycle and what a variation / claim is',
      'Tracks contractual correspondence, milestones and payment applications with guidance',
      'Administers variations and prepares routine claims and contractual notices independently',
      'Leads claims strategy and dispute resolution on major contracts; protects entitlement and value',
      'Sets the claims / dispute and project-contract governance approach across all projects',
    ],
  },
  {
    id: 'sk-contract-risk', code: 'COM-CRK-01', category: 'Technical',
    name: 'Contractual Risk & Compliance Management', method: 'INTERVIEW',
    description: 'Identifying, allocating and mitigating contractual and commercial risk, and ensuring contracts comply with company policy, delegated authority, governance and applicable law and regulation.',
    lv: [
      "Aware of common contract risks and the company's approval / authority limits",
      'Flags risk items and checks contracts against a compliance checklist with guidance',
      'Assesses and allocates contractual risk and ensures compliance independently',
      'Shapes risk-allocation and mitigation strategy on complex / high-value contracts',
      'Owns the contractual risk and compliance framework; advises leadership and assures governance',
    ],
  },
  {
    id: 'sk-vendor-relationship', code: 'COM-VSM-01', category: 'Technical',
    name: 'Vendor & Subcontractor Management', method: 'THREE_SIXTY_EVALUATION',
    description: 'Selecting, on-boarding and managing vendors, contractors and subcontractors — managing performance, relationships and contractual obligations to secure reliable, value-for-money external delivery.',
    lv: [
      'Knows key vendors / subcontractors and basic supplier processes',
      'Maintains vendor records and handles routine follow-up with guidance',
      'Manages assigned vendors / subcontractors and monitors their performance',
      'Owns strategic vendor / subcontractor relationships and drives performance and value',
      'Sets vendor-management strategy, segmentation and performance standards',
    ],
  },
];

// --- Required level per skill for this position (from the profile doc), in
//     display order. Mixes the 5 new skills with 8 reused ones. ---
const REQUIRED_SKILLS = [
  { skillId: 'sk-bid-tender',                 requiredLevel: 4 },
  { skillId: 'sk-tender-evaluation',          requiredLevel: 4 },
  { skillId: 'sk-contract-admin',             requiredLevel: 4 },
  { skillId: 'sk-contract-negotiation',       requiredLevel: 4 },
  { skillId: 'sk-project-contract-followup',  requiredLevel: 4 },
  { skillId: 'sk-contract-risk',              requiredLevel: 4 },
  { skillId: 'sk-commercial-acumen',          requiredLevel: 3 },
  { skillId: 'sk-proposal-writing',           requiredLevel: 3 },
  { skillId: 'sk-oilgas-knowledge',           requiredLevel: 4 },
  { skillId: 'sk-stakeholder-comm',           requiredLevel: 4 },
  { skillId: 'sk-vendor-relationship',        requiredLevel: 3 },
  { skillId: 'sk-data-analysis',              requiredLevel: 3 },
  { skillId: 'sk-hse-awareness',              requiredLevel: 2 },
];

const PROFILE = {
  id: PROFILE_ID,
  title: 'External Contracts/Bids & Project Contract Follow-up',
  description: 'العقود والعروض الخارجية ومتابعة عقود المشروعات',
  departmentId: DEPARTMENT_ID,
  orgLevel: ORG_LEVEL,
  requiredSkills: REQUIRED_SKILLS,
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

// --- Firebase CLI token (mirrors seed-bizdev-mkt-profile.mjs) ---
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
  const skillRecords = NEW_SKILLS.map(skillRecord);
  console.log(`→ Prepared ${skillRecords.length} new skills + 1 job profile (${PROFILE_ID}, ${ORG_LEVEL}, dept ${DEPARTMENT_ID}); reuses ${REQUIRED_SKILLS.length - skillRecords.length} existing skills.`);

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
