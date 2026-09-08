// Operations (Canal Cities & Sinai) import, step 2 of 2 — LOAD the org units.
//
//   node scripts/etl/ops/load-departments.mjs [--dry-run]
//
// Idempotent: ids come from the generator, so a re-run updates in place.
// Documents are applied in file order, parents before children, so the tree is
// navigable at every point of the transaction.
//
// One document is a RENAME of a unit that is already live (`d-canal-ops`,
// "Operations" -> "Operations - Canal Cities & Sinai"). The id is untouched, so
// nobody moves; the name is what every importer matches on, and three units
// currently share the old one.
//
// Refuses on a parent that is neither live nor earlier in this batch, and on a
// name held by a different unit — either would leave an org chart that the app
// cannot resolve.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'data', 'ops', 'departments.json');
const dryRun = process.argv.includes('--dry-run');

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});

const docs = JSON.parse(readFileSync(SRC, 'utf8'));
await client.connect();

const live = new Map(
  (await client.query(`select id, data->>'name' name from departments`)).rows.map((r) => [r.id, r.name ?? ''])
);
const nameOwners = new Map();
for (const [id, name] of live) {
  const k = name.trim().toLowerCase();
  if (!nameOwners.has(k)) nameOwners.set(k, []);
  nameOwners.get(k).push(id);
}

const problems = [];
const applied = new Set();
for (const d of docs) {
  const parent = d.data.parentId;
  if (parent && !live.has(parent) && !applied.has(parent)) {
    problems.push(`${d.id}: parent ${parent} is neither live nor earlier in this batch`);
  }
  const clash = (nameOwners.get((d.data.name ?? '').trim().toLowerCase()) ?? []).filter((i) => i !== d.id);
  if (clash.length) problems.push(`${d.id}: name "${d.data.name}" is already held by ${clash.join(', ')}`);
  applied.add(d.id);
}
if (problems.length) {
  console.error('REFUSING: %d problem(s):', problems.length);
  for (const m of problems) console.error('  -', m);
  process.exit(1);
}

const renames = docs.filter((d) => live.has(d.id) && live.get(d.id) !== d.data.name);
const creates = docs.filter((d) => !live.has(d.id));
const touched = docs.filter((d) => live.has(d.id) && live.get(d.id) === d.data.name);

for (const d of renames) console.log(`rename: ${d.id}  "${live.get(d.id)}" -> "${d.data.name}"`);

if (dryRun) {
  console.log(`dry run: ${creates.length} new, ${renames.length} renamed, ${touched.length} refreshed in place ` +
              `(${live.size} departments live now)`);
  await client.end();
  process.exit(0);
}

await client.query('BEGIN');
let created = 0, updated = 0;
for (const d of docs) {
  const r = await client.query(
    `INSERT INTO departments (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [d.id, d.data]
  );
  if (r.rows[0].inserted) created++; else updated++;
}
await client.query('COMMIT');

const after = await client.query('select count(*)::int n from departments');
console.log(`departments: ${created} created, ${updated} updated — ${after.rows[0].n} in the table`);
await client.end();
