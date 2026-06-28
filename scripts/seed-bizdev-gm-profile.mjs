// Seed the "General Manager of Business Development & External Contracting" job
// profile into the live `jobProfiles` collection, plus the TWO net-new skills it
// introduces into the `skills` collection.
//
// Source of truth (authored doc):
//   - job_profiles/business-development-external-contracting/business-development-external-contracting-gm.md
//
// Placement (from the org hierarchy, scripts/rebuild-org-hierarchy.mjs):
//   - departmentId `g-bizdev` — the GENERAL-type general-administration node
//     "General Manager of Business Development & External Contracting" (1.3.2).
//   - orgLevel `GM` (General Manager) — derived from the node's structural
//     Hierarchy Level / Type. `g-bizdev` is a GENERAL-type box and the
//     type→org-level mapping is GENERAL → GM. It sits one level above its two
//     ASSISTANT_GENERAL sub-units (`d-bizdev-mkt`, `d-bizdev-ext`).
//
// Skills: 13 of the 15 required skills are SHARED with the BD&Marketing and
// External-Contracts AGM/DM/sub-position seeds and are reused by `sk-*` id only
// (NOT rewritten here — run those seeds first if the skill docs are missing).
// Only TWO skills are net-new and authored here: `sk-strategic-planning` and
// `sk-leadership`.
//
// Behaviour: idempotent upsert by deterministic id (`sk-strategic-planning`,
// `sk-leadership`, and the `bizdev-gm` profile). Re-running overwrites only those
// docs and touches nothing else — it never deletes. The profile id intentionally
// avoids the `jp-` prefix so the leadership seed (scripts/seed-job-profiles.mjs),
// which deletes stale `jp-*` profiles, can never remove it.
//
// Auth: reuses the Firebase CLI login (same mechanism as seed-job-profiles.mjs).
//
// Usage:  node scripts/seed-bizdev-gm-profile.mjs [--dry-run]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

const DEPARTMENT_ID = 'g-bizdev';
const ORG_LEVEL = 'GM';
const PROFILE_ID = 'bizdev-gm';

// --- NET-NEW skills authored by this seed (the other 13 are reused by id). ---
const NEW_SKILLS = [
  {
    id: 'sk-strategic-planning', code: 'LED-STP-01', category: 'Management',
    name: 'Strategic Planning & Execution', method: 'INTERVIEW',
    description: 'Translating company direction into clear objectives, budgets and measurable targets for a general department, then driving disciplined execution and course-correction against them.',
    lv: [
      'Understands the department objectives and how own work supports them',
      'Contributes to plans and tracks progress against set targets with guidance',
      'Builds objectives, budgets and plans for a unit and monitors delivery',
      'Sets multi-unit strategy and KPIs; aligns resources and adjusts to performance',
      'Owns the general-department strategy and execution system; aligns leadership behind it',
    ],
  },
  {
    id: 'sk-leadership', code: 'LED-LPM-01', category: 'Management',
    name: 'Leadership & People Management', method: 'THREE_SIXTY_EVALUATION',
    description: 'Leading managers and teams across multiple units — setting direction, developing capability, managing performance, and building a high-performing, accountable commercial organisation.',
    lv: [
      'Understands team goals and supports colleagues constructively',
      'Guides a small task or team and gives basic feedback with support',
      'Leads a team: sets goals, manages performance and develops members',
      'Leads managers across units; builds capability and a strong performance culture',
      'Shapes leadership and talent strategy for the general department; develops other leaders',
    ],
  },
];

// --- Required level per skill for this position (from the profile doc). ---
// 13 reused (`sk-*` from BD&Marketing / External-Contracts seeds) + 2 new.
const REQUIRED_SKILLS = [
  { skillId: 'sk-bizdev-strategy', requiredLevel: 5 },
  { skillId: 'sk-market-research', requiredLevel: 4 },
  { skillId: 'sk-bid-tender', requiredLevel: 5 },
  { skillId: 'sk-contract-negotiation', requiredLevel: 5 },
  { skillId: 'sk-contract-admin', requiredLevel: 4 },
  { skillId: 'sk-contract-risk', requiredLevel: 4 },
  { skillId: 'sk-commercial-acumen', requiredLevel: 4 },
  { skillId: 'sk-client-relationship', requiredLevel: 5 },
  { skillId: 'sk-oilgas-knowledge', requiredLevel: 5 },
  { skillId: 'sk-marketing-programs', requiredLevel: 3 },
  { skillId: 'sk-strategic-planning', requiredLevel: 4 },
  { skillId: 'sk-leadership', requiredLevel: 5 },
  { skillId: 'sk-stakeholder-comm', requiredLevel: 5 },
  { skillId: 'sk-data-analysis', requiredLevel: 3 },
  { skillId: 'sk-hse-awareness', requiredLevel: 2 },
];

const PROFILE = {
  id: PROFILE_ID,
  title: 'General Manager of Business Development & External Contracting',
  description: 'مدير عام تنمية الأعمال والتعاقدات الخارجية',
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
  const skillRecords = NEW_SKILLS.map(skillRecord);
  console.log(`→ Prepared ${skillRecords.length} new skills + 1 job profile (${PROFILE_ID}, ${ORG_LEVEL}, dept ${DEPARTMENT_ID}).`);
  console.log(`  (the other ${REQUIRED_SKILLS.length - NEW_SKILLS.length} required skills are reused by id and not rewritten.)`);

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
  console.log('✓ New skills + GM job profile seeded.');
}

main().catch(err => { console.error('✖ Seed failed:', err.message || err); process.exit(1); });
