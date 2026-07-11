// ETL step 1 — export every Firestore collection to JSON, preserving doc IDs.
//
// Uses the Firebase Admin SDK (bypasses security rules for a full export).
//   1. Firebase console → Project settings → Service accounts → Generate key
//   2. Save it, then: export GOOGLE_APPLICATION_CREDENTIALS=/path/serviceAccount.json
//   3. One-off dep:  npm i firebase-admin
//   4. node scripts/etl/export-firestore.mjs
//
// Output: scripts/etl/data/<collection>.json  ->  [{ id, data }, ...]
import admin from 'firebase-admin';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COLLECTIONS = [
  'users', 'skills', 'departments', 'jobProfiles', 'assessments', 'activityLogs',
  'evidences', 'notifications', 'assessmentCycles', 'nominations',
  'scheduledAssessments', 'assessmentPlans', 'assessmentInstructions',
  'trainingCourses', 'projects',
];

// Recursively convert Firestore Timestamps / GeoPoints to plain JSON. Most dates
// in this app are already ISO strings, but this catches any real Timestamp.
function normalize(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'object') {
    if (typeof v.toDate === 'function') return v.toDate().toISOString(); // Timestamp
    if (Array.isArray(v)) return v.map(normalize);
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = normalize(val);
    return out;
  }
  return v;
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'data');
mkdirSync(outDir, { recursive: true });

let total = 0;
for (const coll of COLLECTIONS) {
  const snap = await db.collection(coll).get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: normalize(d.data()) }));
  writeFileSync(join(outDir, `${coll}.json`), JSON.stringify(docs, null, 2));
  console.log(`exported ${coll.padEnd(24)} ${docs.length}`);
  total += docs.length;
}
console.log(`\nDone. ${total} documents across ${COLLECTIONS.length} collections -> ${outDir}`);
process.exit(0);
