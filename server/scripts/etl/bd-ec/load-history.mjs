// BD / External-Contracts import, step 6 of 9 — LOAD the demo assessment
// history + evidence records.
//
//   node scripts/etl/bd-ec/load-history.mjs [--dry-run] [--purge]
//
// Reads data/bd-ec/assessments.json + evidences.json (written by
// generate_history.py). Idempotent: ids embed (subject, skill, period, type),
// so a re-run updates in place rather than doubling anybody's history.
//
// THESE ARE DEMO RECORDS, not real evaluations — every row says so in its own
// comment/notes field. `--purge` deletes every row this loader owns (id prefix
// `asm-` / `ev-`) before loading, which is how the demo history is removed when
// real evaluation starts.
//
// Refuses on: an unknown subject, rater, reviewer or skill; a skill that is
// archived; a score outside 1-5; an APPROVED evidence with no assignedScore
// (it would score nothing while looking assessed); or an id already held in the
// table by a different subject (which would rewrite somebody else's history).
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'data', 'bd-ec');
const dryRun = process.argv.includes('--dry-run');
const purge = process.argv.includes('--purge');

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});

const assessments = JSON.parse(readFileSync(join(DATA, 'assessments.json'), 'utf8'));
const evidences = JSON.parse(readFileSync(join(DATA, 'evidences.json'), 'utf8'));

await client.connect();

const userIds = new Set((await client.query('select id from users')).rows.map((r) => r.id));
const liveSkills = new Set(
  (await client.query(`select id from skills where data->>'isArchived' is distinct from 'true'`))
    .rows.map((r) => r.id)
);
const ownerOfAssessment = new Map(
  (await client.query(`select id, data->>'subjectId' s from assessments`)).rows.map((r) => [r.id, r.s])
);
const ownerOfEvidence = new Map(
  (await client.query(`select id, data->>'userId' s from evidences`)).rows.map((r) => [r.id, r.s])
);

const VALID_TYPE = new Set([
  'SELF', 'PEER', 'MANAGER', 'UPWARD', 'WRITTEN_EXAM', 'PRACTICAL_DEMO', 'INTERVIEW', 'WORK_RECORD_REVIEW',
]);
const VALID_STATUS = new Set(['PENDING', 'APPROVED', 'REJECTED']);

const problems = [];
for (const a of assessments) {
  if (!userIds.has(a.subjectId)) problems.push(`${a.id}: subject ${a.subjectId} does not exist`);
  if (!userIds.has(a.raterId)) problems.push(`${a.id}: rater ${a.raterId} does not exist`);
  if (!liveSkills.has(a.skillId)) problems.push(`${a.id}: skill ${a.skillId} is not a live skill`);
  if (!VALID_TYPE.has(a.type)) problems.push(`${a.id}: bad type ${a.type}`);
  if (!(a.score >= 1 && a.score <= 5)) problems.push(`${a.id}: score ${a.score} outside 1-5`);
  if (!a.date) problems.push(`${a.id}: no date`);
  const owner = ownerOfAssessment.get(a.id);
  if (owner && owner !== a.subjectId) {
    problems.push(`${a.id}: id already holds ${owner}'s record, not ${a.subjectId}'s`);
  }
}
for (const e of evidences) {
  if (!userIds.has(e.userId)) problems.push(`${e.id}: user ${e.userId} does not exist`);
  if (!liveSkills.has(e.skillId)) problems.push(`${e.id}: skill ${e.skillId} is not a live skill`);
  if (!VALID_STATUS.has(e.status)) problems.push(`${e.id}: bad status ${e.status}`);
  if (e.reviewedBy && !userIds.has(e.reviewedBy)) problems.push(`${e.id}: reviewer ${e.reviewedBy} does not exist`);
  if (e.status === 'APPROVED' && !(e.assignedScore >= 1 && e.assignedScore <= 5)) {
    problems.push(`${e.id}: APPROVED with assignedScore ${e.assignedScore}`);
  }
  if (typeof e.fileUrl !== 'string') problems.push(`${e.id}: fileUrl must be a string (the UI calls .startsWith on it)`);
  const owner = ownerOfEvidence.get(e.id);
  if (owner && owner !== e.userId) {
    problems.push(`${e.id}: id already holds ${owner}'s record, not ${e.userId}'s`);
  }
}

if (problems.length) {
  console.error('REFUSING: %d problem(s):', problems.length);
  for (const m of problems.slice(0, 40)) console.error('  -', m);
  await client.end();
  process.exit(1);
}

if (dryRun) {
  const newA = assessments.filter((a) => !ownerOfAssessment.has(a.id)).length;
  const newE = evidences.filter((e) => !ownerOfEvidence.has(e.id)).length;
  console.log(`dry run: assessments ${newA} new / ${assessments.length - newA} updated ` +
              `(table holds ${ownerOfAssessment.size}); ` +
              `evidences ${newE} new / ${evidences.length - newE} updated ` +
              `(table holds ${ownerOfEvidence.size})`);
  await client.end();
  process.exit(0);
}

const now = new Date().toISOString();
await client.query('BEGIN');

if (purge) {
  const a = await client.query(`delete from assessments where id like 'asm-%'`);
  const e = await client.query(`delete from evidences where id like 'ev-%'`);
  console.log(`purged ${a.rowCount} assessments, ${e.rowCount} evidences`);
}

let createdA = 0, updatedA = 0, createdE = 0, updatedE = 0;
for (const a of assessments) {
  const r = await client.query(
    `INSERT INTO assessments (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [a.id, { ...a, createdAt: a.createdAt ?? now, updatedAt: now }]
  );
  if (r.rows[0].inserted) createdA++; else updatedA++;
}
for (const e of evidences) {
  const r = await client.query(
    `INSERT INTO evidences (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [e.id, { ...e, createdAt: e.createdAt ?? now, updatedAt: now }]
  );
  if (r.rows[0].inserted) createdE++; else updatedE++;
}
await client.query('COMMIT');

console.log(`assessments: ${createdA} created, ${updatedA} updated`);
console.log(`evidences:   ${createdE} created, ${updatedE} updated`);

const byType = await client.query(
  `select data->>'type' type, count(*) n, min(data->>'date') first, max(data->>'date') last
   from assessments group by 1 order by 2 desc`
);
console.table(byType.rows);

const byStatus = await client.query(
  `select data->>'status' status, count(*) n,
          count(*) filter (where data->>'assignedScore' is null) unscored
   from evidences group by 1 order by 1`
);
console.table(byStatus.rows);

// The coverage figure the app will show: how many of each person's required
// skills now carry a scoring input. Printed here so a load cannot hide behind a
// total — an all-green report would mean the demo lost its honest holes.
const coverage = await client.query(
  `with req as (
     select u.id uid, u.data->>'orgLevel' lvl,
            jsonb_array_elements(
              case jsonb_typeof(p.data->'requiredSkills')
                when 'array' then p.data->'requiredSkills'
                else (p.data->>'requiredSkills')::jsonb
              end
            )->>'skillId' sid
     from users u
     join "jobProfiles" p on p.id = u.data->>'jobProfileId'
   )
   select r.uid, r.lvl, count(*) required,
          count(*) filter (
            where exists (select 1 from assessments a
                          where a.data->>'subjectId' = r.uid and a.data->>'skillId' = r.sid)
               or exists (select 1 from evidences e
                          where e.data->>'userId' = r.uid and e.data->>'skillId' = r.sid
                            and e.data->>'status' = 'APPROVED'
                            and e.data->>'assignedScore' is not null)
          ) measured
   from req r group by 1, 2 order by 1`
);
for (const r of coverage.rows) {
  const pct = Math.round((100 * Number(r.measured)) / Number(r.required));
  console.log(`  ${r.uid.padEnd(14)} ${String(r.lvl).padEnd(4)} ${r.measured}/${r.required} measured (${pct}%)`);
}

await client.end();
