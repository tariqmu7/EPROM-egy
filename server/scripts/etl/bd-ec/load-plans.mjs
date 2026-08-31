// BD / External-Contracts import, step 7 of 9 — LOAD the demo development plans.
//
//   node scripts/etl/bd-ec/load-plans.mjs [--dry-run] [--purge] [file.json]
//
// Reads data/bd-ec/developmentPlans.json (written by generate_plans.py) and
// upserts one row per plan into the "developmentPlans" table. Idempotent: ids
// are `dp-<userId>-2026`, so a re-run rewrites the same plan instead of giving
// somebody a second one.
//
// THESE ARE DEMO PLANS — nothing here was agreed with anybody. `--purge`
// deletes every row this loader owns (id prefix `dp-`), which is how they are
// removed before real planning starts.
//
// Refuses on: an unknown / inactive / archived owner, an owner with no job
// profile, an unknown job profile, an unknown or archived skill, an unknown or
// archived course, an unknown sign-off user, an item that is signed off without
// being COMPLETED or carries a levelAtSignOff without a sign-off, a level +
// gap that does not equal the required level, a duplicate item id inside a
// plan, or a plan id already held in the table by a DIFFERENT person (which
// would overwrite somebody else's agreed plan).
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'data', 'bd-ec');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const purge = args.includes('--purge');
const fileArg = args.find((a) => !a.startsWith('--'));
const FILE = fileArg ? (isAbsolute(fileArg) ? fileArg : join(process.cwd(), fileArg)) : join(DATA, 'developmentPlans.json');

const plans = JSON.parse(readFileSync(FILE, 'utf8'));
if (!Array.isArray(plans)) {
  console.error(`${FILE} must contain an array of plan documents`);
  process.exit(1);
}

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});
await client.connect();

const problems = [];
const fail = (msg) => problems.push(msg);

const userRows = (await client.query('select id, data from users')).rows;
const users = new Map();
for (const r of userRows) {
  const id = String(r.data.id ?? r.id);
  users.set(id, {
    name: r.data.name ?? id,
    status: r.data.status ?? 'ACTIVE',
    isArchived: r.data.isArchived === true,
    jobProfileId: r.data.jobProfileId || null,
  });
}

const liveSkills = new Set(
  (await client.query(`select id, data from skills where data->>'isArchived' is distinct from 'true'`)).rows.map(
    (r) => String(r.data.id ?? r.id),
  ),
);
const liveProfiles = new Set(
  (await client.query(`select id, data from "jobProfiles" where data->>'isArchived' is distinct from 'true'`)).rows.map(
    (r) => String(r.data.id ?? r.id),
  ),
);
const liveCourses = new Set(
  (await client.query(`select id, data from "trainingCourses" where data->>'isArchived' is distinct from 'true'`)).rows.map(
    (r) => String(r.data.id ?? r.id),
  ),
);
const existingOwners = new Map(
  (await client.query('select id, data from "developmentPlans"')).rows.map((r) => [r.id, r.data.userId ?? null]),
);

const PLAN_STATUSES = new Set(['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED']);
const ITEM_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);

const seenPlanIds = new Set();
for (const plan of plans) {
  const where = plan.id ?? '(no id)';
  if (!plan.id) fail('a plan has no id');
  if (seenPlanIds.has(plan.id)) fail(`${where}: duplicate plan id in the input file`);
  seenPlanIds.add(plan.id);

  const owner = users.get(plan.userId);
  if (!owner) fail(`${where}: owner ${plan.userId} is not a user`);
  else {
    if (owner.status !== 'ACTIVE' || owner.isArchived) fail(`${where}: owner ${plan.userId} is not ACTIVE`);
    if (!owner.jobProfileId) fail(`${where}: owner ${plan.userId} holds no job profile — nothing to plan against`);
  }
  if (!PLAN_STATUSES.has(plan.status)) fail(`${where}: unknown plan status ${plan.status}`);
  if (plan.jobProfileId && !liveProfiles.has(plan.jobProfileId)) {
    fail(`${where}: unknown job profile ${plan.jobProfileId}`);
  }
  if (plan.createdBy && !users.has(plan.createdBy)) fail(`${where}: createdBy ${plan.createdBy} is not a user`);

  const held = existingOwners.get(plan.id);
  if (held && held !== plan.userId) {
    fail(`${where}: already held in the table by ${held} — refusing to overwrite another person's plan`);
  }

  if (!Array.isArray(plan.items) || plan.items.length === 0) fail(`${where}: plan has no items`);

  const seenItemIds = new Set();
  for (const item of plan.items ?? []) {
    const at = `${where}/${item.id ?? '(no id)'}`;
    if (!item.id) fail(`${where}: an item has no id`);
    if (seenItemIds.has(item.id)) fail(`${at}: duplicate item id inside the plan`);
    seenItemIds.add(item.id);

    if (!liveSkills.has(item.skillId)) fail(`${at}: skill ${item.skillId} is unknown or archived`);
    if (!ITEM_STATUSES.has(item.status)) fail(`${at}: unknown item status ${item.status}`);
    if (item.sourceAtPlanning === 'NONE') fail(`${at}: a never-assessed skill was planned`);
    if (!(item.gapAtPlanning > 0)) fail(`${at}: item carries no gap`);
    if (item.levelAtPlanning + item.gapAtPlanning !== item.requiredLevel) {
      fail(`${at}: levelAtPlanning + gapAtPlanning does not equal requiredLevel`);
    }
    if (item.courseId && !liveCourses.has(item.courseId)) fail(`${at}: course ${item.courseId} is unknown or archived`);
    if (item.supervisorSignOff && item.status !== 'COMPLETED') fail(`${at}: signed off while ${item.status}`);
    if (item.signedOffBy && !users.has(item.signedOffBy)) fail(`${at}: signedOffBy ${item.signedOffBy} is not a user`);
    if (item.levelAtSignOff != null && !item.supervisorSignOff) fail(`${at}: levelAtSignOff without a sign-off`);
    if (item.supervisorSignOff && item.levelAtSignOff == null) fail(`${at}: signed off with no level re-read`);
  }
}

if (problems.length > 0) {
  console.error('REFUSING to load — fix these first:');
  for (const p of problems) console.error(`  - ${p}`);
  await client.end();
  process.exit(1);
}

// ── Write ───────────────────────────────────────────────────────────────────
// `developmentPlans.items` is NOT one of the fields preparePayload stringifies,
// so it is written as a real JSON array — the same shape the app's own save
// produces.
if (dryRun) {
  console.log(`DRY RUN — ${plans.length} plans validated against the live database, nothing written.`);
} else {
  await client.query('begin');
  try {
    if (purge) {
      const { rowCount } = await client.query(`delete from "developmentPlans" where id like 'dp-%'`);
      console.log(`Purged ${rowCount} demo plan row(s).`);
    }
    for (const plan of plans) {
      await client.query(
        `insert into "developmentPlans" (id, data) values ($1, $2::jsonb)
         on conflict (id) do update set data = excluded.data`,
        [plan.id, JSON.stringify(plan)],
      );
    }
    await client.query('commit');
  } catch (err) {
    await client.query('rollback');
    throw err;
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const totals = { items: 0, completed: 0, cancelled: 0, signedOff: 0, improved: 0, overdueOpen: 0 };
const now = new Date().toISOString();
for (const plan of plans) {
  for (const i of plan.items) {
    totals.items += 1;
    if (i.status === 'COMPLETED') totals.completed += 1;
    if (i.status === 'CANCELLED') totals.cancelled += 1;
    if (i.supervisorSignOff) totals.signedOff += 1;
    if (i.levelAtSignOff != null && i.levelAtSignOff > i.levelAtPlanning) totals.improved += 1;
    if ((i.status === 'NOT_STARTED' || i.status === 'IN_PROGRESS') && i.targetDate < now) totals.overdueOpen += 1;
  }
}

console.log(`${dryRun ? 'Would load' : 'Loaded'} ${plans.length} development plan(s), ${totals.items} item(s).`);
for (const plan of plans) {
  const inPlay = plan.items.filter((i) => i.status !== 'CANCELLED').length;
  const done = plan.items.filter((i) => i.status === 'COMPLETED').length;
  const pct = inPlay === 0 ? '—' : `${Math.round((done / inPlay) * 100)}%`;
  console.log(
    `  ${plan.id.padEnd(22)} ${plan.status.padEnd(10)} ${String(users.get(plan.userId)?.name ?? plan.userId).slice(0, 26).padEnd(28)}` +
      ` items ${String(plan.items.length).padStart(2)}  complete ${pct}`,
  );
}
console.log(
  `  totals: completed ${totals.completed} · cancelled ${totals.cancelled} · signed off ${totals.signedOff} ·` +
    ` level rose after sign-off ${totals.improved} · open past target ${totals.overdueOpen}`,
);

await client.end();
