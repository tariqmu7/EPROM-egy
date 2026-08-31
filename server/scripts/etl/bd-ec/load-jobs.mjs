// BD / External-Contracts import, step 2 of 2 — LOAD the extracted job profiles.
//
//   node scripts/etl/bd-ec/load-jobs.mjs [file.json] [--dry-run]
//
// `file.json` defaults to data/bd-ec/jobProfiles.json (the workbook ladders);
// pass data/bd-ec/jobProfilesLeadership.json for the derived GM/AGM/DM set.
//
// Idempotent: ids are derived from the workbook's Code column, so a re-run
// updates in place. Writes the SAME wire shape store.ts's preparePayload writes
// (`requiredSkills` is a JSON *string*), so a profile loaded here is
// byte-comparable to one saved from the Job Profile form.
//
// Refuses on a dangling reference: an unknown departmentId or skillId would be
// dropped at read time and the requirement would silently vanish from every gap,
// ITP and TNA figure.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const SRC = fileArg ?? join(here, '..', 'data', 'bd-ec', 'jobProfiles.json');

const dryRun = process.argv.includes('--dry-run');

// Fields store.ts stringifies on the way out for the `jobProfiles` collection.
const STRINGIFY = ['requiredSkills'];

function wire(profile) {
  const out = { ...profile };
  for (const f of STRINGIFY) if (out[f] !== undefined) out[f] = JSON.stringify(out[f]);
  return out;
}

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});

const profiles = JSON.parse(readFileSync(SRC, 'utf8'));
await client.connect();

const depts = new Set((await client.query('select id from departments')).rows.map((r) => r.id));
const skills = new Set(
  (await client.query(`select id from skills where data->>'isArchived' is distinct from 'true'`)).rows.map((r) => r.id)
);
const before = await client.query(`select id, data->>'title' title from "jobProfiles"`);

const problems = [];
for (const p of profiles) {
  if (!depts.has(p.departmentId)) problems.push(`${p.code}: department ${p.departmentId} does not exist`);
  for (const r of p.requiredSkills) {
    if (!skills.has(r.skillId)) problems.push(`${p.code}: skill ${r.skillId} is not a live skill`);
  }
  if (!p.requiredSkills.length) problems.push(`${p.code}: has no required skills`);
}
if (problems.length) {
  console.error('REFUSING: %d dangling reference(s):', problems.length);
  for (const m of problems.slice(0, 40)) console.error('  -', m);
  process.exit(1);
}

if (dryRun) {
  const existing = new Set(before.rows.map((r) => r.id));
  const news = profiles.filter((p) => !existing.has(p.id)).length;
  console.log(`dry run: ${news} new, ${profiles.length - news} updated, ` +
              `${before.rows.length} already in the table`);
  await client.end();
  process.exit(0);
}

await client.query('BEGIN');
let created = 0, updated = 0;
for (const p of profiles) {
  const r = await client.query(
    `INSERT INTO "jobProfiles" (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [p.id, wire(p)]
  );
  if (r.rows[0].inserted) created++; else updated++;
}
await client.query('COMMIT');

console.log(`job profiles: ${created} created, ${updated} updated`);
const after = await client.query(
  `select data->>'code' code, data->>'orgLevel' lvl, data->>'departmentId' dept,
          jsonb_array_length((data->>'requiredSkills')::jsonb) n
   from "jobProfiles" order by dept, lvl`
);
console.table(after.rows);
await client.end();
