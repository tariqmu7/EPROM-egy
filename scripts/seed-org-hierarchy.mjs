// Seed the EPROM Head Office org hierarchy into Firestore `departments`.
//
// Usage (PowerShell):
//   $env:SEED_ADMIN_EMAIL="admin@example.com"; $env:SEED_ADMIN_PASSWORD="..."; node scripts/seed-org-hierarchy.mjs
//
// Flags:
//   --prune       Delete existing Head Office departments (no projectId) that
//                 are NOT part of the seeded set. Orphaned users are reported,
//                 not modified — re-assign them via the Admin Panel afterwards.
//   --dry-run     Print what would change; write nothing.
//
// Firebase config is read from .env.local (the same VITE_FIREBASE_* keys the
// app uses). Admin credentials are required because Firestore rules only allow
// department writes for an authenticated admin.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore, collection, getDocs, setDoc, deleteDoc, doc,
} from 'firebase/firestore';
import { flattenHierarchy } from './org-hierarchy-data.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PRUNE = process.argv.includes('--prune');
const DRY_RUN = process.argv.includes('--dry-run');

function loadEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) {
    console.error('✖ .env.local not found. Copy .env.example and fill in your Firebase config.');
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };

  const email = process.env.SEED_ADMIN_EMAIL || env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD || env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('✖ Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (admin login) before running.');
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`→ Signing in as ${email} on project ${firebaseConfig.projectId}…`);
  await signInWithEmailAndPassword(auth, email, password);
  console.log('✓ Authenticated.');

  const records = flattenHierarchy();
  const newIds = new Set(records.map(r => r.id));
  console.log(`→ Prepared ${records.length} Head Office departments.`);

  // Existing departments (for prune + orphan reporting).
  const snap = await getDocs(collection(db, 'departments'));
  const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const existingHq = existing.filter(d => !d.projectId);

  if (DRY_RUN) {
    console.log('— DRY RUN — no writes will be made.');
    records.forEach(r => console.log(`  upsert ${r.id} [${r.type}] ${r.name} — ${r.nameAr}`));
  } else {
    for (const r of records) {
      await setDoc(doc(db, 'departments', r.id), r, { merge: true });
    }
    console.log(`✓ Upserted ${records.length} departments.`);
  }

  if (PRUNE) {
    const stale = existingHq.filter(d => !newIds.has(d.id));
    const usersSnap = await getDocs(collection(db, 'users'));
    const users = usersSnap.docs.map(u => ({ id: u.id, ...u.data() }));
    const staleIds = new Set(stale.map(d => d.id));
    const orphaned = users.filter(u => u.departmentId && staleIds.has(u.departmentId));

    console.log(`→ Prune: ${stale.length} stale Head Office department(s) to remove.`);
    if (orphaned.length) {
      console.log(`⚠ ${orphaned.length} user(s) reference a department being removed — re-assign them in the Admin Panel:`);
      orphaned.forEach(u => console.log(`    • ${u.name} (${u.email}) → dept ${u.departmentId}`));
    }
    if (!DRY_RUN) {
      for (const d of stale) await deleteDoc(doc(db, 'departments', d.id));
      console.log(`✓ Removed ${stale.length} stale department(s).`);
    }
  } else {
    const stale = existingHq.filter(d => !newIds.has(d.id));
    if (stale.length) {
      console.log(`ℹ ${stale.length} existing Head Office department(s) were left in place. Re-run with --prune to remove them.`);
    }
  }

  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('✖ Seeding failed:', err.message || err);
  process.exit(1);
});
