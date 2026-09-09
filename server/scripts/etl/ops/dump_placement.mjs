// Operations (Canal Cities & Sinai) demo history, step 1 of 3 — DUMP the LIVE
// placement of the invented roster.
//
//   node scripts/etl/ops/dump_placement.mjs
//
// Writes data/ops/livePlacement.json: every ACTIVE, non-archived INVENTED person
// (the 90001+ block) with the job profile / unit / manager the DATABASE now
// holds, plus each job profile's requiredSkills and each live skill's primary
// assessment method.
//
// Why not users.json: that is what the people-load WROTE, not what the system
// holds now — placements get edited in the app afterwards, and history generated
// against a stale placement lands on skills the person is no longer required to
// have. Same reasoning (and same shape) as the bd-ec dump next door.
import 'dotenv/config';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'data', 'ops', 'livePlacement.json');

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
   where id like 'u-9%'
     and data->>'isTestData' = 'true'
     and coalesce(data->>'status', 'ACTIVE') = 'ACTIVE'
     and data->>'isArchived' is distinct from 'true'
   order by id`
)).rows.map((r) => ({
  id: r.id,
  name: r.data.name ?? null,
  orgLevel: r.data.orgLevel ?? null,
  departmentId: r.data.departmentId ?? null,
  location: r.data.location ?? null,
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
    category: r.data.category ?? null,
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

console.log(`livePlacement.json: ${users.length} invented people, ${profiles.length} job profiles, ${skills.length} live skills`);
console.log(`admin (rater of last resort): ${adminId ?? 'NONE — history for a manager-less person cannot be rated'}`);
if (unprofiled.length) console.log(`no job profile (no requirements, so no history): ${unprofiled.join(', ')}`);
for (const u of dangling) console.log(`WARNING ${u.id}: job profile ${u.jobProfileId} does not exist`);

await client.end();
