// ETL step 2 — load the exported JSON into Postgres. Idempotent (re-runnable for
// the cutover delta). Reads PG connection from the same env as the API (server/.env).
//
//   node scripts/etl/load-postgres.mjs
//
// For every user it also seeds an auth_credentials row with NO password and
// must_reset=true — migrated users can't bring their Firebase password, so an
// admin sets a temporary one (or they use the reset flow) on first login.
import 'dotenv/config';
import pg from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TABLES = {
  users: 'users',
  skills: 'skills',
  departments: 'departments',
  jobProfiles: '"jobProfiles"',
  assessments: 'assessments',
  activityLogs: '"activityLogs"',
  evidences: 'evidences',
  notifications: 'notifications',
  assessmentCycles: '"assessmentCycles"',
  nominations: 'nominations',
  scheduledAssessments: '"scheduledAssessments"',
  assessmentPlans: '"assessmentPlans"',
  assessmentInstructions: '"assessmentInstructions"',
  trainingCourses: '"trainingCourses"',
  projects: 'projects',
};

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data');

const pool = new pg.Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? '',
  database: process.env.PGDATABASE ?? 'eprom_cms',
  ssl: (process.env.PGSSL ?? 'false') === 'true' ? { rejectUnauthorized: false } : undefined,
});

function readDocs(coll) {
  const file = join(dataDir, `${coll}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf8'));
}

// --- Avatar transform -------------------------------------------------------
// Migrated users carry REMOTE avatar URLs — the 2026-05 Firebase migration reset
// everyone to a `ui-avatars.com` link. Those defeat the offline / self-hosted
// goal: the browser would still fetch each avatar over the internet, and several
// render sites (CompetencyMatrix, ManagerialInterviews, ManagerDashboard) use an
// unconditional `<img src={avatarUrl}>` with no initials fallback, so a stale or
// unreachable URL shows a broken image. Rewrite any remote http(s) avatar to a
// self-contained data-URI SVG — identical to what new signups get. Self-contained
// `data:` URIs (real uploads) and empty values are left untouched. Idempotent:
// the rewritten value is a `data:` URI, so a re-run (cutover delta) skips it.
//
// This is a hand port of utils/localAvatar.ts so the loader stays runnable with
// plain `node` (no TS loader). Keep the two in sync if the generator changes.
const AVATAR_BG = [
  '#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#DC2626',
  '#EA580C', '#CA8A04', '#16A34A', '#0891B2', '#4F46E5',
];
function avatarInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function avatarColor(name) {
  const s = String(name || 'User');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_BG[Math.abs(hash) % AVATAR_BG.length];
}
function localAvatar(name) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const label = esc(avatarInitials(name || 'User'));
  const bg = avatarColor(name || 'User');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" fill="${bg}"/>` +
    `<text x="64" y="64" fill="#ffffff" font-family="Inter, system-ui, sans-serif" ` +
    `font-size="54" font-weight="600" text-anchor="middle" dominant-baseline="central">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
// Rewrite a remote avatar in place; returns true if it changed the doc.
function delocalizeAvatar(data) {
  const url = data?.avatarUrl;
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    data.avatarUrl = localAvatar(data.name || data.email || 'User');
    return true;
  }
  return false;
}

let grand = 0;
let avatarsFixed = 0;
for (const [coll, table] of Object.entries(TABLES)) {
  const docs = readDocs(coll);
  if (!docs) {
    console.log(`skip  ${coll.padEnd(24)} (no export file)`);
    continue;
  }
  for (const { id, data } of docs) {
    if (coll === 'users' && delocalizeAvatar(data)) avatarsFixed += 1;
    await pool.query(
      `INSERT INTO ${table} (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [id, data],
    );
  }
  console.log(`load  ${coll.padEnd(24)} ${docs.length}`);
  grand += docs.length;
}
if (avatarsFixed) console.log(`\navatars localized (remote URL -> offline SVG): ${avatarsFixed}`);

// Seed credential rows for every user (password set later by admin/reset flow).
const users = readDocs('users') ?? [];
let creds = 0;
for (const { id, data } of users) {
  const email = String(data?.email ?? '').toLowerCase();
  if (!email) continue;
  await pool.query(
    `INSERT INTO auth_credentials (user_id, email, password_hash, must_reset)
     VALUES ($1, $2, NULL, true)
     ON CONFLICT (user_id) DO NOTHING`,
    [id, email],
  );
  creds += 1;
}
console.log(`\nauth_credentials seeded (must_reset): ${creds}`);
console.log(`Done. Loaded ${grand} documents.`);
await pool.end();
process.exit(0);
