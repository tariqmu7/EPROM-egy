// @deprecated 2026-06-22 — superseded by scripts/seed-bizdev-sections.mjs. The
// single combined `bizdev-mkt-dm` is replaced by two department-scoped DMs
// (`bizdev-mkt-bd-dm` + `bizdev-mkt-programs-dm`) on their own DEPARTMENT nodes.
// Kept for reference only.
//
// Seed the "Business Development & Marketing Programs" DEPARTMENT MANAGER (DM)
// job profile into the live `jobProfiles` collection.
//
// Source of truth (authored doc):
//   job_profiles/business-development-external-contracting/business-development-marketing-programs/
//     business-development-marketing-programs-dm.md
//
// Model: "one position = one job profile". The AGM unit-head profile
// `bizdev-mkt-sp` already exists (scripts/seed-bizdev-mkt-profile.mjs) and owns
// the 13 `sk-*` skills in the `skills` collection. The DM is the department-
// management band directly below the AGM (AGM → DM → SH → SP → JP → FR). Like the
// SP/JP/FR sub-positions it is NOT its own org-chart box — it lives inside the
// same unit node `d-bizdev-mkt`. It reuses the SAME 13 skills at the unit's
// authored baseline (the DM shares the AGM's competency depth; they differ in
// scope/authority, not proficiency level).
//
// This script does NOT create or modify skills — it assumes the AGM seed has
// already created the `sk-*` skill docs. It only upserts the one DM profile by
// deterministic id (`bizdev-mkt-dm`) and never deletes anything. The id avoids
// the `jp-` prefix so the leadership seed (scripts/seed-job-profiles.mjs), which
// deletes stale `jp-*` profiles, can never remove it.
//
// Auth: reuses the Firebase CLI login (same mechanism as seed-bizdev-mkt-profile.mjs).
//
// Usage:  node scripts/seed-bizdev-mkt-dm.mjs [--dry-run]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

const DEPARTMENT_ID = 'd-bizdev-mkt';
const PROFILE_ID = 'bizdev-mkt-dm';
const ORG_LEVEL = 'DM';

// The 13 skills owned by the AGM profile, with the DM's required level (1–5).
// DM carries the unit's authored baseline (same depth as the AGM head).
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
  title: 'Business Development & Marketing Programs — Department Manager',
  description: 'تنمية الأعمال وبرامج التسويق — مدير إدارة',
  departmentId: DEPARTMENT_ID,
  orgLevel: ORG_LEVEL,
  requiredSkills: Object.entries(REQUIRED_LEVELS).map(([skillId, requiredLevel]) => ({ skillId, requiredLevel })),
};

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
  const res = await fetch(`${BASE}:batchWrite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) throw new Error(`batchWrite failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const errs = (json.status || []).filter(s => s.code && s.code !== 0);
  if (errs.length) throw new Error(`batchWrite partial errors: ${JSON.stringify(errs)}`);
  console.log(`  ✓ committed ${writes.length} writes`);
}

async function main() {
  console.log(`→ Prepared 1 DM job profile (${PROFILE_ID}, ${ORG_LEVEL}, dept ${DEPARTMENT_ID}) reusing ${PROFILE.requiredSkills.length} existing sk-* skills.`);

  if (DRY_RUN) {
    console.log('— DRY RUN — no writes.');
    console.log(`  upsert jobProfiles/${PROFILE.id}  ${PROFILE.title} (${PROFILE.orgLevel})`);
    PROFILE.requiredSkills.forEach(rs => console.log(`     • ${rs.skillId} → level ${rs.requiredLevel}`));
    return;
  }

  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);

  const writes = [{ update: { name: `${DOC_PATH}/jobProfiles/${PROFILE.id}`, fields: fields(PROFILE) } }];
  console.log(`→ Committing ${writes.length} writes…`);
  await batchWrite(token, writes);
  console.log('✓ DM job profile seeded.');
}

main().catch(err => { console.error('✖ Seed failed:', err.message || err); process.exit(1); });
