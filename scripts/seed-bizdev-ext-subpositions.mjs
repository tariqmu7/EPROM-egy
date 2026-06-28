// @deprecated 2026-06-22 — superseded by scripts/seed-bizdev-sections.mjs. The
// chart splits the External-Contracts AGM unit into two sections (External
// Contracts & Offers + Project Contract Follow-up); these combined
// `bizdev-ext-snr/jnr/fresh` posts on the AGM node `d-bizdev-ext` are replaced
// by section-scoped ladders. Kept for ref.
//
// Seed the SP / JP / FR sub-position job profiles that sit UNDER the External
// Contracts/Bids & Project Contract Follow-up Section Head, in the live
// `jobProfiles` collection.
//
// Model: "one position = one job profile". The Section Head (SH) profile
// `bizdev-ext-sp` already exists (scripts/seed-bizdev-ext-profile.mjs) and owns
// the 13 skills it references. The positions below the SH (Senior / Junior /
// Fresh) are NOT their own org-chart boxes — they live inside the same
// DEPARTMENT node `d-bizdev-ext`. They reuse the SAME 13 skills but at the
// proficiency level expected for their career stage, per standard competency
// frameworks (AG5, TalentGuard, CUPA-HR; SPE/IHRDC oil-&-gas practice):
//
//   SH (lead)    → Advanced–Expert       (4–5)   [authored in the SH profile]
//   SP (senior)  → Intermediate–Advanced (3–4)
//   JP (junior)  → Basic–Intermediate    (2–3)
//   FR (fresh)   → Awareness–Basic        (1–2)
//
// Each lower position steps down one band from the SH's authored level, floored
// at its stage minimum. HSE Awareness is pinned at 2 across all levels — its own
// note makes it the baseline safety culture required of every oil-&-gas role, so
// it does not drop to awareness-only.
//
// This script does NOT create or modify skills — it assumes the SH seed has
// already created / referenced the `sk-*` skill docs. It only upserts the 3
// sub-position profiles by deterministic id and never deletes anything.
//
// Auth: reuses the Firebase CLI login (same mechanism as seed-bizdev-ext-profile.mjs).
//
// Usage:  node scripts/seed-bizdev-ext-subpositions.mjs [--dry-run]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

const DEPARTMENT_ID = 'd-bizdev-ext';

// The 13 skills referenced by the Section Head profile, in display order.
const SKILL_IDS = [
  'sk-bid-tender',
  'sk-tender-evaluation',
  'sk-contract-admin',
  'sk-contract-negotiation',
  'sk-project-contract-followup',
  'sk-contract-risk',
  'sk-commercial-acumen',
  'sk-proposal-writing',
  'sk-oilgas-knowledge',
  'sk-stakeholder-comm',
  'sk-vendor-relationship',
  'sk-data-analysis',
  'sk-hse-awareness',
];

// Required proficiency level (1–5) per skill, per career-stage position.
// SH column is the authored baseline (kept here for reference / parity only —
// the SH profile is owned by seed-bizdev-ext-profile.mjs and is NOT written here).
//                                  [ SH, SP, JP, FR ]
const LEVELS = {
  'sk-bid-tender':                [4, 3, 2, 1],
  'sk-tender-evaluation':         [4, 3, 2, 1],
  'sk-contract-admin':            [4, 3, 2, 1],
  'sk-contract-negotiation':      [4, 3, 2, 1],
  'sk-project-contract-followup': [4, 3, 2, 1],
  'sk-contract-risk':             [4, 3, 2, 1],
  'sk-commercial-acumen':         [3, 2, 1, 1],
  'sk-proposal-writing':          [3, 2, 1, 1],
  'sk-oilgas-knowledge':          [4, 3, 2, 1],
  'sk-stakeholder-comm':          [4, 3, 2, 1],
  'sk-vendor-relationship':       [3, 2, 1, 1],
  'sk-data-analysis':             [3, 2, 1, 1],
  'sk-hse-awareness':             [2, 2, 2, 2], // pinned baseline for every role
};

// Sub-position profiles (one position = one profile). col = index into LEVELS rows.
const POSITIONS = [
  { id: 'bizdev-ext-snr',   orgLevel: 'SP', col: 1, title: 'External Contracts/Bids & Project Contract Follow-up — Senior Position', titleAr: 'العقود والعروض الخارجية ومتابعة عقود المشروعات — أخصائي أول' },
  { id: 'bizdev-ext-jnr',   orgLevel: 'JP', col: 2, title: 'External Contracts/Bids & Project Contract Follow-up — Junior Position', titleAr: 'العقود والعروض الخارجية ومتابعة عقود المشروعات — أخصائي' },
  { id: 'bizdev-ext-fresh', orgLevel: 'FR', col: 3, title: 'External Contracts/Bids & Project Contract Follow-up — Fresh',           titleAr: 'العقود والعروض الخارجية ومتابعة عقود المشروعات — حديث التعيين' },
];

const PROFILES = POSITIONS.map(p => ({
  id: p.id,
  title: p.title,
  description: p.titleAr,
  departmentId: DEPARTMENT_ID,
  orgLevel: p.orgLevel,
  requiredSkills: SKILL_IDS.map(skillId => ({ skillId, requiredLevel: LEVELS[skillId][p.col] })),
}));

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

// --- Firebase CLI token (mirrors seed-bizdev-ext-profile.mjs) ---
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
  console.log(`→ Prepared ${PROFILES.length} sub-position profiles under ${DEPARTMENT_ID} (reusing ${SKILL_IDS.length} existing sk-* skills).`);

  if (DRY_RUN) {
    console.log('— DRY RUN — no writes.');
    for (const p of PROFILES) {
      console.log(`  upsert jobProfiles/${p.id}  ${p.title} (${p.orgLevel})`);
      p.requiredSkills.forEach(rs => console.log(`     • ${rs.skillId} → level ${rs.requiredLevel}`));
    }
    return;
  }

  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);

  const writes = PROFILES.map(p => ({ update: { name: `${DOC_PATH}/jobProfiles/${p.id}`, fields: fields(p) } }));
  console.log(`→ Committing ${writes.length} writes…`);
  await batchWrite(token, writes);
  console.log('✓ Sub-position profiles seeded.');
}

main().catch(err => { console.error('✖ Seed failed:', err.message || err); process.exit(1); });
