// BD / External-Contracts import, step 2 of 2 — LOAD the extracted skills.
//
//   node scripts/etl/bd-ec/load-skills.mjs [--archive-placeholders] [--dry-run]
//
// Idempotent: ids are derived from the workbook's Code column, so a re-run
// updates in place. Writes the SAME wire shape store.ts's preparePayload writes
// (levels / assessmentMethods / *Questions are JSON *strings*), so a skill
// loaded here is byte-comparable to one saved from the Competency Standard form.
//
// --archive-placeholders sets isArchived on any pre-existing skill that is NOT
// in this catalogue — the 20 seed skills. Nothing is deleted.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'data', 'bd-ec', 'skills.json');

const archivePlaceholders = process.argv.includes('--archive-placeholders');
const dryRun = process.argv.includes('--dry-run');

// Fields store.ts stringifies on the way out for the `skills` collection.
const STRINGIFY = ['levels', 'assessmentMethods', 'evaluationQuestions',
                   'interviewQuestions', 'threeSixtyQuestions'];

function wire(skill) {
  const out = { ...skill };
  for (const f of STRINGIFY) if (out[f] !== undefined) out[f] = JSON.stringify(out[f]);
  // The form always writes these three, empty when unused.
  for (const f of ['evaluationQuestions', 'interviewQuestions', 'threeSixtyQuestions']) {
    if (out[f] === undefined) out[f] = '[]';
  }
  return out;
}

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});

const skills = JSON.parse(readFileSync(SRC, 'utf8'));
await client.connect();

const before = await client.query(`select id, data->>'name' name, data->>'isArchived' arch from skills`);
const catalogueIds = new Set(skills.map((s) => s.id));
const catalogueNames = new Map(skills.map((s) => [s.name.toLowerCase(), s.id]));

// ECMS matches skills BY NAME. A pre-existing skill sharing a catalogue name
// under a different id would become an invisible duplicate — refuse instead.
const collisions = before.rows.filter(
  (r) => catalogueNames.has((r.name ?? '').toLowerCase()) && catalogueNames.get((r.name ?? '').toLowerCase()) !== r.id
);
if (collisions.length) {
  console.error('REFUSING: %d existing skill(s) share a catalogue NAME under a different id:', collisions.length);
  for (const c of collisions) console.error('  -', c.id, c.name);
  process.exit(1);
}

if (dryRun) {
  const existing = new Set(before.rows.map((r) => r.id));
  const news = skills.filter((s) => !existing.has(s.id)).length;
  console.log(`dry run: ${news} new, ${skills.length - news} updated, ` +
              `${before.rows.filter((r) => !catalogueIds.has(r.id)).length} pre-existing outside the catalogue`);
  await client.end();
  process.exit(0);
}

await client.query('BEGIN');
let created = 0, updated = 0;
for (const s of skills) {
  const r = await client.query(
    `INSERT INTO skills (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [s.id, wire(s)]
  );
  if (r.rows[0].inserted) created++; else updated++;
}

let archived = 0;
if (archivePlaceholders) {
  for (const row of before.rows) {
    if (catalogueIds.has(row.id) || row.arch === 'true') continue;
    await client.query(
      `UPDATE skills SET data = data || '{"isArchived": true}'::jsonb, updated_at = now() WHERE id = $1`,
      [row.id]
    );
    archived++;
  }
}
await client.query('COMMIT');

console.log(`skills: ${created} created, ${updated} updated, ${archived} pre-existing archived`);
const after = await client.query(
  `select count(*) filter (where data->>'isArchived' is distinct from 'true') live,
          count(*) total from skills`
);
console.log(`skills table now: ${after.rows[0].live} live / ${after.rows[0].total} total`);
await client.end();
