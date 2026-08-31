// BD / External-Contracts import, step 5 of 5 — LOAD the training catalogue.
//
//   node scripts/etl/bd-ec/load-courses.mjs [file.json] [--dry-run]
//
// `file.json` defaults to data/bd-ec/trainingCourses.json (written by
// draft_courses.py). Idempotent: ids come from the course code, so a re-run
// updates in place.
//
// `linkedSkillIds` is written as a REAL JSON array, not a string: store.ts's
// preparePayload has no stringify rule for the trainingCourses collection, so
// this matches what the app's own Course form saves.
//
// Refuses on a dangling or archived skill link. A course pointing at a skill
// that no longer exists is worse than no course: getCoursesForSkill would never
// return it, so the ITP would silently fall back to "intensive training
// required" while the catalogue page still counted the skill as covered.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
const SRC = fileArg ?? join(here, '..', 'data', 'bd-ec', 'trainingCourses.json');

const dryRun = process.argv.includes('--dry-run');

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});

const courses = JSON.parse(readFileSync(SRC, 'utf8'));
await client.connect();

const live = new Set(
  (await client.query(`select id from skills where data->>'isArchived' is distinct from 'true'`)).rows.map((r) => r.id)
);
const before = await client.query(`select id, data->>'code' code from "trainingCourses"`);

const problems = [];
const seenCode = new Map();
for (const c of courses) {
  if (!c.id || !c.title || !c.provider) problems.push(`${c.code ?? c.id}: missing id, title or provider`);
  if (!['INTERNAL', 'EXTERNAL', 'OJT'].includes(c.type)) problems.push(`${c.code}: bad type ${c.type}`);
  if (!Array.isArray(c.linkedSkillIds) || !c.linkedSkillIds.length) {
    problems.push(`${c.code}: links no skill`);
  }
  for (const sid of c.linkedSkillIds ?? []) {
    if (!live.has(sid)) problems.push(`${c.code}: skill ${sid} is not a live skill`);
  }
  if (c.targetLevel != null && (c.targetLevel < 1 || c.targetLevel > 5)) {
    problems.push(`${c.code}: targetLevel ${c.targetLevel} outside 1-5`);
  }
  if (c.costPerSeat != null && !(c.costPerSeat >= 0)) problems.push(`${c.code}: negative seat cost`);
  if (seenCode.has(c.code)) problems.push(`${c.code}: duplicate code (also ${seenCode.get(c.code)})`);
  seenCode.set(c.code, c.id);
}
// A code held by a DIFFERENT id already in the table would give the catalogue
// two rows with the same human reference.
const clash = before.rows.filter((r) => r.code && seenCode.has(r.code) && seenCode.get(r.code) !== r.id);
for (const r of clash) problems.push(`${r.code}: already used by a different course id (${r.id})`);

if (problems.length) {
  console.error('REFUSING: %d problem(s):', problems.length);
  for (const m of problems.slice(0, 40)) console.error('  -', m);
  await client.end();
  process.exit(1);
}

if (dryRun) {
  const existing = new Set(before.rows.map((r) => r.id));
  const news = courses.filter((c) => !existing.has(c.id)).length;
  console.log(`dry run: ${news} new, ${courses.length - news} updated, ` +
              `${before.rows.length} already in the table`);
  await client.end();
  process.exit(0);
}

const now = new Date().toISOString();
await client.query('BEGIN');
let created = 0, updated = 0;
for (const c of courses) {
  const r = await client.query(
    `INSERT INTO "trainingCourses" (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [c.id, { ...c, createdAt: c.createdAt ?? now, updatedAt: now }]
  );
  if (r.rows[0].inserted) created++; else updated++;
}
await client.query('COMMIT');

console.log(`training courses: ${created} created, ${updated} updated`);

const summary = await client.query(
  `select data->>'type' type, count(*) n,
          count(*) filter (where data->>'costPerSeat' is null) unpriced,
          min((data->>'costPerSeat')::numeric) min_cost,
          max((data->>'costPerSeat')::numeric) max_cost
   from "trainingCourses" where data->>'isArchived' is distinct from 'true'
   group by 1 order by 1`
);
console.table(summary.rows);

// The catalogue page's headline figure: a live skill nobody can be sent
// anywhere for. Report it here too, so a bad load cannot hide behind a total.
const uncovered = await client.query(
  `select s.id, s.data->>'name' name from skills s
   where s.data->>'isArchived' is distinct from 'true'
     and not exists (
       select 1 from "trainingCourses" c
       where c.data->>'isArchived' is distinct from 'true'
         and c.data->'linkedSkillIds' @> to_jsonb(s.id)
     )`
);
console.log(`skills with no course: ${uncovered.rowCount}`);
for (const r of uncovered.rows.slice(0, 20)) console.log('  -', r.id, r.name);

await client.end();
