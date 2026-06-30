// One-off cleanup: collapse duplicate evaluation records in the live
// `assessments` collection that accumulated before addAssessment() became an
// upsert (services/store.ts). The app now holds at most one live evaluation per
// rater+subject+skill (per cycle), but historical re-submissions left stacks of
// duplicates that pollute the Evaluation History Ledger and skew 360° averages
// (getUserSkillScore averages all SELF/PEER/MANAGER records for a skill).
//
// Strategy: group non-archived assessments by (raterId, subjectId, skillId,
// cycleId) — the same key addAssessment() now upserts on. In each group keep the
// most recent by `date` and ARCHIVE the rest (set isArchived: true). Archiving,
// not deleting, is the default: getUserSkillScore and getAssessmentHistory both
// skip archived records, so the dupes vanish from scores and the ledger while
// the data stays recoverable. Pass --delete to hard-delete instead.
//
// Auth: reuses the Firebase CLI login (same mechanism as the seed/migrate scripts).
//
// Usage:
//   node scripts/dedup-assessments.mjs            # DRY RUN (default) — prints planned changes, writes nothing
//   node scripts/dedup-assessments.mjs --apply    # archive older duplicates
//   node scripts/dedup-assessments.mjs --apply --delete   # hard-delete older duplicates instead of archiving

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;
const APPLY = process.argv.includes('--apply');
const HARD_DELETE = process.argv.includes('--delete');

// --- Firebase CLI token (mirrors the seed/migrate scripts) ---
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

function str(field) { return field?.stringValue ?? null; }
function bool(field) { return field?.booleanValue ?? false; }
function num(field) {
  if (field?.integerValue !== undefined) return Number(field.integerValue);
  if (field?.doubleValue !== undefined) return Number(field.doubleValue);
  return null;
}

async function listAssessments(token) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${BASE}/assessments?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`list assessments failed ${res.status}: ${await res.text()}`);
    const json = await res.json();
    for (const d of json.documents || []) {
      const f = d.fields || {};
      docs.push({
        id: d.name.split('/').pop(),
        fullName: d.name,
        raterId: str(f.raterId),
        subjectId: str(f.subjectId),
        skillId: str(f.skillId),
        cycleId: str(f.cycleId),
        type: str(f.type),
        score: num(f.score),
        date: str(f.date) || '',
        isArchived: bool(f.isArchived),
      });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return docs;
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
  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);

  const all = await listAssessments(token);
  console.log(`→ Read ${all.length} assessment docs from the live collection.`);

  // Only consider live records — already-archived dupes are left as-is.
  const live = all.filter(a => !a.isArchived);

  // Group by the upsert key: rater + subject + skill + period. The period is
  // the explicit cycleId when set, else the calendar year — so duplicates are
  // only collapsed within the same year and distinct years stay as separate
  // historical records (mirrors assessmentCycleBucket in services/store.ts).
  const bucket = a => a.cycleId ? `cycle:${a.cycleId}` : `year:${new Date(a.date).getFullYear()}`;
  const groups = new Map();
  for (const a of live) {
    const key = `${a.raterId}|${a.subjectId}|${a.skillId}|${bucket(a)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  const losers = []; // duplicates to archive/delete
  for (const [, recs] of groups) {
    if (recs.length < 2) continue;
    // Keep the most recent by date (ties → keep the lexicographically larger id
    // for determinism); everything else is a duplicate.
    recs.sort((x, y) => {
      const dt = new Date(y.date).getTime() - new Date(x.date).getTime();
      return dt !== 0 ? dt : (y.id > x.id ? 1 : -1);
    });
    const [keep, ...rest] = recs;
    for (const r of rest) losers.push({ ...r, keptId: keep.id, keptDate: keep.date });
  }

  if (losers.length === 0) {
    console.log('✓ No duplicate evaluation records found. Nothing to do.');
    return;
  }

  console.log(`\n${losers.length} duplicate record(s) across ${new Set(losers.map(l => l.keptId)).size} evaluation group(s):`);
  for (const l of losers) {
    console.log(`  ${HARD_DELETE ? 'DELETE' : 'ARCHIVE'} assessments/${l.id}  ` +
      `[${l.type} score ${l.score} @ ${l.date}]  rater=${l.raterId} subject=${l.subjectId} skill=${l.skillId}` +
      `  → keep ${l.keptId} (@ ${l.keptDate})`);
  }

  if (!APPLY) {
    console.log(`\n— DRY RUN — no writes. Re-run with --apply to ${HARD_DELETE ? 'delete' : 'archive'} these duplicates.`);
    return;
  }

  const writes = losers.map(l => HARD_DELETE
    ? { delete: l.fullName }
    : {
        update: { name: l.fullName, fields: { isArchived: { booleanValue: true } } },
        updateMask: { fieldPaths: ['isArchived'] },
      });

  console.log(`\n→ ${HARD_DELETE ? 'Deleting' : 'Archiving'} ${writes.length} duplicate(s)…`);
  await batchWrite(token, writes);
  console.log(`✓ Done. Duplicates ${HARD_DELETE ? 'deleted' : 'archived'}.`);
}

main().catch(err => { console.error('✖ Dedup failed:', err.message || err); process.exit(1); });
