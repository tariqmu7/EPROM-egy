// Operations import, step 2 of 2 — LOAD the extracted skills.
//
//   node scripts/etl/ops/load-skills.mjs [--update-existing] [--dry-run]
//
// Idempotent: ids are derived from the workbook's Code column, so a re-run
// updates in place. Writes the SAME wire shape store.ts's preparePayload writes
// (levels / assessmentMethods / *Questions are JSON *strings*), so a skill
// loaded here is byte-comparable to one saved from the Competency Standard form.
//
// 21 of the 117 are shared with BD / External Contracts and are ALREADY in the
// dictionary under their BD/EC ids. By default those are left exactly as they
// are: this load adds a department, it does not get to rewrite skills another
// department is already being measured against. `--update-existing` overwrites
// them from the workbook when that is genuinely what you want.
//
// Refuses if a live skill holds a catalogue NAME under a different id — ECMS
// matches skills by name, so that would be an invisible duplicate.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'data', 'ops', 'skills.json');

const updateExisting = process.argv.includes('--update-existing');
const dryRun = process.argv.includes('--dry-run');

const STRINGIFY = ['levels', 'assessmentMethods', 'evaluationQuestions',
                   'interviewQuestions', 'threeSixtyQuestions'];

function wire(skill) {
  const out = { ...skill };
  for (const f of STRINGIFY) if (out[f] !== undefined) out[f] = JSON.stringify(out[f]);
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
const catalogueNames = new Map(skills.map((s) => [s.name.toLowerCase(), s.id]));

const collisions = before.rows.filter(
  (r) => catalogueNames.has((r.name ?? '').toLowerCase()) && catalogueNames.get((r.name ?? '').toLowerCase()) !== r.id
);
if (collisions.length) {
  console.error('REFUSING: %d existing skill(s) share a catalogue NAME under a different id:', collisions.length);
  for (const c of collisions) console.error('  -', c.id, c.name);
  process.exit(1);
}

// An archived skill still holds its name, so a shared skill that somebody
// archived would come back as a requirement pointing at a dead entry.
const existing = new Map(before.rows.map((r) => [r.id, r]));
const archived = skills.filter((s) => existing.get(s.id)?.arch === 'true');
if (archived.length && !updateExisting) {
  console.error('REFUSING: %d shared skill(s) are ARCHIVED in the database — re-run with --update-existing ' +
                'to bring them back, or unarchive them in the app first:', archived.length);
  for (const s of archived) console.error('  -', s.id, s.name);
  process.exit(1);
}

const news = skills.filter((s) => !existing.has(s.id));
const shared = skills.filter((s) => existing.has(s.id));
const toWrite = updateExisting ? skills : news;

if (dryRun) {
  console.log(`dry run: ${news.length} new, ${shared.length} already present ` +
              `(${updateExisting ? 'would be overwritten' : 'left untouched'}), ` +
              `${before.rows.length} skills in the table now`);
  await client.end();
  process.exit(0);
}

await client.query('BEGIN');
let created = 0, updated = 0;
for (const s of toWrite) {
  const r = await client.query(
    `INSERT INTO skills (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [s.id, wire(s)]
  );
  if (r.rows[0].inserted) created++; else updated++;
}
await client.query('COMMIT');

const after = await client.query(`select count(*)::int n from skills where data->>'isArchived' is distinct from 'true'`);
console.log(`skills: ${created} created, ${updated} updated, ` +
            `${updateExisting ? 0 : shared.length} left untouched — ${after.rows[0].n} live in the dictionary`);
await client.end();
