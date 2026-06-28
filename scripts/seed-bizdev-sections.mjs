// Seed the full DEPARTMENT (DM) + SECTION (SH/SP/JP/FR) ladder for the four
// Business-Development & External-Contracting sections, into the live
// `jobProfiles` collection.
//
// Org model (chart approved 2026-06-22 — see job_profiles/README.md and
// scripts/rebuild-org-hierarchy.mjs). Under GM `g-bizdev` each of the two AGM
// units splits into TWO Department-Manager (DEPARTMENT) units, and each
// DEPARTMENT owns ONE same-named SECTION holding the Section Head plus the
// Senior / Junior / Fresh staff inside it:
//
//   d-bizdev-mkt (AGM)
//     ├─ dept-bizdev-mkt-programs (DM)  → sect-bizdev-mkt-programs (SH→FR)  برامج التسويق
//     └─ dept-bizdev-mkt-bd       (DM)  → sect-bizdev-mkt-bd       (SH→FR)  تنمية الأعمال
//   d-bizdev-ext (AGM)
//     ├─ dept-bizdev-ext-followup (DM)  → sect-bizdev-ext-followup (SH→FR)  متابعة عقود المشروعات
//     └─ dept-bizdev-ext-contracts(DM)  → sect-bizdev-ext-contracts(SH→FR)  العقود والعروض الخارجية
//
// This script owns 4 DM profiles + 4×(SH/SP/JP/FR) = 20 job profiles. It does
// NOT create or modify skills — it references the `sk-*` catalog already created
// by the AGM-head seeds (run those first):
//   scripts/seed-bizdev-gm-profile.mjs   (sk-strategic-planning, sk-leadership)
//   scripts/seed-bizdev-mkt-profile.mjs  (13 base sk-* skills)
//   scripts/seed-bizdev-ext-profile.mjs  (5 contract sk-* skills)
//
// Level model (standard competency step-down — AG5 / TalentGuard / SPE / IHRDC):
//   SH (lead)   = authored baseline (Advanced–Expert)         [col 0]
//   SP (senior) = baseline − 1   (Intermediate–Advanced)      [col 1]
//   JP (junior) = baseline − 2   (Basic–Intermediate)         [col 2]
//   FR (fresh)  = baseline − 3   (Awareness–Basic)            [col 3]
// floored at 1; HSE Awareness is pinned at 2 across every stage (baseline safety
// culture). The DM carries the SECTION's authored baseline (same advanced depth
// as the SH); DM vs SH differ in scope/authority, not competency depth.
//
// Behaviour: idempotent upsert by deterministic id; never deletes by default.
// Pass --prune to additionally delete the 11 superseded legacy profile ids that
// this consolidated ladder replaces (see SUPERSEDED below) — opt-in because
// deletion is destructive and may orphan a user.jobProfileId reference.
//
// Auth: reuses the Firebase CLI login (same mechanism as seed-bizdev-mkt-profile.mjs).
//
// Usage:  node scripts/seed-bizdev-sections.mjs [--dry-run] [--prune]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const PRUNE = process.argv.includes('--prune');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

// --- Section definitions. `skills` maps skillId → SH baseline level (1–5). ---
const SECTIONS = [
  {
    key: 'bizdev-mkt-bd',
    titleEn: 'Business Development',
    titleAr: 'تنمية الأعمال',
    deptId: 'dept-bizdev-mkt-bd',
    sectId: 'sect-bizdev-mkt-bd',
    skills: {
      'sk-market-research': 4,
      'sk-bizdev-strategy': 4,
      'sk-bid-tender': 4,
      'sk-contract-negotiation': 4,
      'sk-commercial-acumen': 3,
      'sk-client-relationship': 4,
      'sk-oilgas-knowledge': 4,
      'sk-proposal-writing': 3,
      'sk-stakeholder-comm': 4,
      'sk-data-analysis': 3,
      'sk-hse-awareness': 2,
    },
  },
  {
    key: 'bizdev-mkt-programs',
    titleEn: 'Marketing Programs',
    titleAr: 'برامج التسويق',
    deptId: 'dept-bizdev-mkt-programs',
    sectId: 'sect-bizdev-mkt-programs',
    skills: {
      'sk-market-research': 4,
      'sk-marketing-programs': 4,
      'sk-digital-marketing': 4,
      'sk-bizdev-strategy': 3,
      'sk-client-relationship': 3,
      'sk-commercial-acumen': 3,
      'sk-oilgas-knowledge': 3,
      'sk-proposal-writing': 3,
      'sk-stakeholder-comm': 4,
      'sk-data-analysis': 3,
      'sk-hse-awareness': 2,
    },
  },
  {
    key: 'bizdev-ext-contracts',
    titleEn: 'External Contracts & Offers',
    titleAr: 'العقود والعروض الخارجية',
    deptId: 'dept-bizdev-ext-contracts',
    sectId: 'sect-bizdev-ext-contracts',
    skills: {
      'sk-bid-tender': 4,
      'sk-tender-evaluation': 4,
      'sk-contract-admin': 4,
      'sk-contract-negotiation': 4,
      'sk-contract-risk': 4,
      'sk-commercial-acumen': 3,
      'sk-vendor-relationship': 3,
      'sk-proposal-writing': 3,
      'sk-oilgas-knowledge': 4,
      'sk-stakeholder-comm': 4,
      'sk-data-analysis': 3,
      'sk-hse-awareness': 2,
    },
  },
  {
    key: 'bizdev-ext-followup',
    titleEn: 'Project Contract Follow-up',
    titleAr: 'متابعة عقود المشروعات',
    deptId: 'dept-bizdev-ext-followup',
    sectId: 'sect-bizdev-ext-followup',
    skills: {
      'sk-project-contract-followup': 4,
      'sk-contract-admin': 4,
      'sk-contract-risk': 4,
      'sk-contract-negotiation': 3,
      'sk-bid-tender': 3,
      'sk-commercial-acumen': 3,
      'sk-vendor-relationship': 3,
      'sk-oilgas-knowledge': 4,
      'sk-stakeholder-comm': 3,
      'sk-proposal-writing': 3,
      'sk-data-analysis': 3,
      'sk-hse-awareness': 2,
    },
  },
];

// Legacy profile ids replaced by this consolidated ladder (deleted only with --prune).
const SUPERSEDED = [
  'bizdev-bd-sp', 'bizdev-bd-snr', 'bizdev-bd-jnr', 'bizdev-bd-fresh', // old "Business Development" section (dept z3xbqrles)
  'bizdev-mkt-dm',                                                     // combined BD&Marketing DM (now split into two DMs)
  'bizdev-mkt-snr', 'bizdev-mkt-jnr', 'bizdev-mkt-fresh',             // staff that hung off the AGM node d-bizdev-mkt
  'bizdev-ext-snr', 'bizdev-ext-jnr', 'bizdev-ext-fresh',            // staff that hung off the AGM node d-bizdev-ext
];

// Career-stage step-down from an authored SH baseline. HSE pinned at 2.
function stepDown(skillId, base) {
  if (skillId === 'sk-hse-awareness') return [2, 2, 2, 2];
  return [0, 1, 2, 3].map(d => Math.max(1, base - d));
}

// Build the 5 profiles (DM + SH/SP/JP/FR) for one section.
function buildProfiles(s) {
  const skillIds = Object.keys(s.skills);
  const reqAt = (col) => skillIds.map(id => ({ skillId: id, requiredLevel: stepDown(id, s.skills[id])[col] }));
  const dmSkills = skillIds.map(id => ({ skillId: id, requiredLevel: s.skills[id] })); // DM = SH baseline
  return [
    { id: `${s.key}-dm`,    orgLevel: 'DM', departmentId: s.deptId, title: `${s.titleEn} (Department Manager)`, description: `${s.titleAr} — مدير إدارة`,   requiredSkills: dmSkills },
    { id: `${s.key}-sh`,    orgLevel: 'SH', departmentId: s.sectId, title: `${s.titleEn} (Section Head)`,        description: `${s.titleAr} — رئيس قسم`,      requiredSkills: reqAt(0) },
    { id: `${s.key}-snr`,   orgLevel: 'SP', departmentId: s.sectId, title: `${s.titleEn} (Senior Position)`,     description: `${s.titleAr} — أخصائي أول`,    requiredSkills: reqAt(1) },
    { id: `${s.key}-jnr`,   orgLevel: 'JP', departmentId: s.sectId, title: `${s.titleEn} (Junior Position)`,     description: `${s.titleAr} — أخصائي`,        requiredSkills: reqAt(2) },
    { id: `${s.key}-fresh`, orgLevel: 'FR', departmentId: s.sectId, title: `${s.titleEn} (Fresh)`,               description: `${s.titleAr} — حديث التعيين`, requiredSkills: reqAt(3) },
  ];
}

const PROFILES = SECTIONS.flatMap(buildProfiles);

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
  console.log(`→ Prepared ${PROFILES.length} profiles across ${SECTIONS.length} sections (4 DM + 16 SH/SP/JP/FR), reusing the existing sk-* catalog.`);
  if (PRUNE) console.log(`→ --prune: will also DELETE ${SUPERSEDED.length} superseded legacy profiles.`);

  if (DRY_RUN) {
    console.log('— DRY RUN — no writes.');
    for (const p of PROFILES) {
      console.log(`  upsert jobProfiles/${p.id}  ${p.title} (${p.orgLevel}) → dept ${p.departmentId}`);
      p.requiredSkills.forEach(rs => console.log(`     • ${rs.skillId} → level ${rs.requiredLevel}`));
    }
    if (PRUNE) SUPERSEDED.forEach(id => console.log(`  delete jobProfiles/${id}`));
    return;
  }

  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);

  const writes = PROFILES.map(p => ({ update: { name: `${DOC_PATH}/jobProfiles/${p.id}`, fields: fields(p) } }));
  if (PRUNE) for (const id of SUPERSEDED) writes.push({ delete: `${DOC_PATH}/jobProfiles/${id}` });

  console.log(`→ Committing ${writes.length} writes…`);
  await batchWrite(token, writes);
  console.log('✓ Business-Development sections ladder seeded.');
  if (PRUNE) console.log(`ℹ Deleted ${SUPERSEDED.length} superseded legacy profiles — reassign any affected users in the Admin Panel.`);
}

main().catch(err => { console.error('✖ Seed failed:', err.message || err); process.exit(1); });
