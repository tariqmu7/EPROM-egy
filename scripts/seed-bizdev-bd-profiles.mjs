// @deprecated 2026-06-22 — superseded by scripts/seed-bizdev-sections.mjs, which
// owns the "Business Development" section (and the other three) on the
// deterministic org node `sect-bizdev-mkt-bd` with ids `bizdev-mkt-bd-*`. This
// script targeted the random UI-created department `z3xbqrles` and ids
// `bizdev-bd-*`; run the consolidated seed (with --prune) to migrate. Kept for
// reference only.
//
// Seed the "Business Development" SECTION job profiles (Section Head + Senior /
// Junior / Fresh sub-positions) into the live `jobProfiles` collection.
//
// Source of truth (authored docs):
//   job_profiles/business-development-external-contracting/business-development-marketing-programs/business-development/
//     - business-development-section-head.md   (SH)
//     - business-development-senior-position.md (SP)
//     - business-development-junior-position.md (JP)
//     - business-development-fresh.md           (FR)
//
// Placement (confirmed against the live org chart):
//   - departmentId `z3xbqrles` — the "Business Development" SECTION created under
//     the "Business Development & Marketing Programs" DEPARTMENT (`d-bizdev-mkt`),
//     itself under the GM of Business Development (`g-bizdev`).
//   - SECTION → orgLevel `SH` for the section head (DEPT_TYPE_TO_ORG_LEVEL in
//     types.ts). The SP/JP/FR are individual posts INSIDE that section (not their
//     own org-chart boxes), stepping one band down per career stage.
//
// Skills: this SECTION reuses 11 of the existing `sk-*` skills owned by the
// Marketing Programs seed (scripts/seed-bizdev-mkt-profile.mjs). The two
// marketing-only skills (`sk-marketing-programs`, `sk-digital-marketing`) are
// intentionally NOT required here. This script does NOT create or modify skills —
// it assumes those `sk-*` docs already exist.
//
// Behaviour: idempotent upsert by deterministic id (`bizdev-bd-*`). Re-running
// overwrites only those 4 profiles and never deletes anything. The ids avoid the
// `jp-` prefix so the leadership seed (seed-job-profiles.mjs) can never remove them.
//
// Auth: reuses the Firebase CLI login (same mechanism as seed-bizdev-mkt-profile.mjs).
//
// Usage:  node scripts/seed-bizdev-bd-profiles.mjs [--dry-run]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

const DEPARTMENT_ID = 'z3xbqrles';

// The 11 existing skills required by this section, in display order.
const SKILL_IDS = [
  'sk-market-research',
  'sk-bizdev-strategy',
  'sk-bid-tender',
  'sk-contract-negotiation',
  'sk-commercial-acumen',
  'sk-client-relationship',
  'sk-oilgas-knowledge',
  'sk-proposal-writing',
  'sk-stakeholder-comm',
  'sk-data-analysis',
  'sk-hse-awareness',
];

// Required proficiency level (1–5) per skill, per career-stage position.
//                          [ SH, SP, JP, FR ]
const LEVELS = {
  'sk-market-research':      [4, 3, 2, 1],
  'sk-bizdev-strategy':      [4, 3, 2, 1],
  'sk-bid-tender':           [4, 3, 2, 1],
  'sk-contract-negotiation': [4, 3, 2, 1],
  'sk-commercial-acumen':    [3, 2, 1, 1],
  'sk-client-relationship':  [4, 3, 2, 1],
  'sk-oilgas-knowledge':     [4, 3, 2, 1],
  'sk-proposal-writing':     [3, 2, 1, 1],
  'sk-stakeholder-comm':     [4, 3, 2, 1],
  'sk-data-analysis':        [3, 2, 1, 1],
  'sk-hse-awareness':        [2, 2, 2, 2], // pinned baseline for every role
};

// One position = one profile. col = index into the LEVELS rows above.
const POSITIONS = [
  { id: 'bizdev-bd-sp',    orgLevel: 'SH', col: 0, title: 'Business Development (Section Head)', titleAr: 'تنمية الأعمال — رئيس قسم' },
  { id: 'bizdev-bd-snr',   orgLevel: 'SP', col: 1, title: 'Business Development (Senior Position)', titleAr: 'تنمية الأعمال — أخصائي أول' },
  { id: 'bizdev-bd-jnr',   orgLevel: 'JP', col: 2, title: 'Business Development (Junior Position)', titleAr: 'تنمية الأعمال — أخصائي' },
  { id: 'bizdev-bd-fresh', orgLevel: 'FR', col: 3, title: 'Business Development (Fresh)',           titleAr: 'تنمية الأعمال — حديث التعيين' },
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
  console.log(`→ Prepared ${PROFILES.length} profiles under section ${DEPARTMENT_ID} (reusing ${SKILL_IDS.length} existing sk-* skills).`);

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
  console.log('✓ Business Development section profiles seeded.');
}

main().catch(err => { console.error('✖ Seed failed:', err.message || err); process.exit(1); });
