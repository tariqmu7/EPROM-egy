// BD / External-Contracts import, step 6 support — DUMP the LIVE placement.
//
//   node scripts/etl/bd-ec/dump_placement.mjs
//
// Writes data/bd-ec/livePlacement.json: every ACTIVE, non-archived person with
// the job profile / unit / manager the DATABASE currently holds, plus each job
// profile's requiredSkills and each live skill's primary assessment method.
//
// Why this exists: users.json is what task 4 LOADED, not what the system now
// holds. Placements get edited in the app afterwards (they were — u-1347 moved
// profile and u-3397 lost theirs), and history generated against a stale
// placement lands on skills the person is no longer required to have. Anything
// deriving demo history reads THIS file, so the demo can never describe an org
// chart that is not the live one.
import 'dotenv/config';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'data', 'bd-ec', 'livePlacement.json');

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});
await client.connect();

const users = (await client.query(
  `select id, data from users
   where data->>'role' = 'EMPLOYEE'
     and coalesce(data->>'status', 'ACTIVE') = 'ACTIVE'
     and data->>'isArchived' is distinct from 'true'
   order by id`
)).rows.map((r) => ({
  id: r.id,
  name: r.data.name ?? null,
  orgLevel: r.data.orgLevel ?? null,
  departmentId: r.data.departmentId ?? null,
  // An empty string is not a profile; normalise it away so every reader has one
  // shape for "unprofiled" instead of two.
  jobProfileId: r.data.jobProfileId ? r.data.jobProfileId : null,
  managerId: r.data.managerId ? r.data.managerId : null,
}));

const profiles = (await client.query(
  `select id, data from "jobProfiles" where data->>'isArchived' is distinct from 'true' order by id`
)).rows.map((r) => {
  const raw = r.data.requiredSkills ?? [];
  const requiredSkills = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return { id: r.id, code: r.data.code ?? null, orgLevel: r.data.orgLevel ?? null, requiredSkills };
});

const skills = (await client.query(
  `select id, data from skills where data->>'isArchived' is distinct from 'true' order by id`
)).rows.map((r) => {
  const raw = r.data.assessmentMethods ?? [];
  const methods = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return {
    id: r.id,
    name: r.data.name,
    criticality: r.data.criticality ?? 'STANDARD',
    // store.ts getSkillPrimaryMethod: first block, default OJT_OBSERVATION.
    method: methods[0]?.method ?? 'OJT_OBSERVATION',
  };
});

const adminId = (await client.query(
  `select id from users where data->>'role' = 'ADMIN' order by id limit 1`
)).rows[0]?.id ?? null;

const unprofiled = users.filter((u) => !u.jobProfileId).map((u) => u.id);
const dangling = users.filter((u) => u.jobProfileId && !profiles.some((p) => p.id === u.jobProfileId));

writeFileSync(OUT, JSON.stringify({
  dumpedAt: new Date().toISOString(),
  adminId,
  users,
  jobProfiles: profiles,
  skills,
}, null, 2), 'utf8');

console.log(`livePlacement.json: ${users.length} people, ${profiles.length} job profiles, ${skills.length} live skills`);
console.log(`admin (rater of last resort): ${adminId ?? 'NONE — history for a manager-less person cannot be rated'}`);
if (unprofiled.length) console.log(`no job profile (no requirements, so no history): ${unprofiled.join(', ')}`);
for (const u of dangling) console.log(`WARNING ${u.id}: job profile ${u.jobProfileId} does not exist`);

await client.end();
