// One-off migration: normalize the `category` field on every doc in the live
// `skills` collection to a canonical SkillCategory (Title Case):
//   Technical | Behavioral | Safety | Management | Soft Skills
//
// Mirrors normalizeSkillCategory() in types.ts. Legacy / free-text values are
// mapped (e.g. 'Leadership' → Management, 'Business / Commercial' → Technical,
// 'Other'/'General'/unknown → Technical) and casing is fixed ('technical' →
// Technical). Only the `category` field is patched (updateMask) — every other
// field on the doc is left untouched. Docs already canonical are skipped.
//
// Auth: reuses the Firebase CLI login (same mechanism as the seed scripts).
//
// Usage:
//   node scripts/migrate-skill-categories.mjs            # DRY RUN (default) — prints planned changes, writes nothing
//   node scripts/migrate-skill-categories.mjs --apply    # actually commit the updates

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;
const APPLY = process.argv.includes('--apply');

const CANONICAL = ['Technical', 'Behavioral', 'Safety', 'Management', 'Soft Skills'];

// Keep in lockstep with normalizeSkillCategory() in types.ts.
function normalizeSkillCategory(raw) {
  const v = (raw || '').trim().toLowerCase();
  if (v.startsWith('behav')) return 'Behavioral';
  if (v.startsWith('saf') || v.includes('hse')) return 'Safety';
  if (v.startsWith('manage') || v.startsWith('lead')) return 'Management';
  if (v.startsWith('soft')) return 'Soft Skills';
  return 'Technical';
}

// --- Firebase CLI token (mirrors the seed scripts) ---
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

async function listSkills(token) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${BASE}/skills?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`list skills failed ${res.status}: ${await res.text()}`);
    const json = await res.json();
    for (const d of json.documents || []) {
      const id = d.name.split('/').pop();
      const category = d.fields?.category?.stringValue ?? null;
      const name = d.fields?.name?.stringValue ?? '(unnamed)';
      docs.push({ id, name, category, fullName: d.name });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function batchPatch(token, writes) {
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
    console.log(`  ✓ committed ${chunk.length} patches`);
  }
}

async function main() {
  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);

  const skills = await listSkills(token);
  console.log(`→ Read ${skills.length} skills from the live collection.`);

  const changes = [];
  for (const s of skills) {
    const target = normalizeSkillCategory(s.category);
    if (s.category !== target) changes.push({ ...s, target });
  }

  if (changes.length === 0) {
    console.log('✓ Every skill already has a canonical category. Nothing to do.');
    return;
  }

  console.log(`\n${changes.length} of ${skills.length} skills need normalizing:`);
  for (const c of changes) {
    console.log(`  skills/${c.id}  ${JSON.stringify(c.category)} → ${JSON.stringify(c.target)}   (${c.name})`);
  }

  if (!APPLY) {
    console.log('\n— DRY RUN — no writes. Re-run with --apply to commit these patches.');
    return;
  }

  const writes = changes.map(c => ({
    update: { name: c.fullName, fields: { category: { stringValue: c.target } } },
    updateMask: { fieldPaths: ['category'] },
  }));

  console.log(`\n→ Committing ${writes.length} category patches…`);
  await batchPatch(token, writes);
  console.log('✓ Skill categories normalized.');
}

main().catch(err => { console.error('✖ Migration failed:', err.message || err); process.exit(1); });
