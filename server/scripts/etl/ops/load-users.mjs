// Operations (Canal Cities & Sinai) import, step 2 of 2 for the PEOPLE — LOAD.
//
//   node scripts/etl/ops/load-users.mjs [--dry-run] [--password '<temp>']
//                                       [--reset-existing] [--no-restore]
//
// Reads data/ops/users.json (written by extract_users.py) and:
//   1. upserts the 70 user documents (ids are stable — `u-<employeeId>` over the
//      invented 90001+ block — so a re-run updates in place);
//   2. gives each of them the SAME temporary password with `must_reset = true`,
//      so the forced-password-change screen gates a first login. An account that
//      ALREADY has a password is left alone (`--reset-existing` overrides);
//   3. points each Operations unit at the person who runs it (the AGM, the three
//      site Department Managers, the twelve Section Heads);
//   4. RESTORES the strays: anybody sitting in an Operations unit who is not on
//      this roster is put back where the BD / External-Contracts load says they
//      belong (data/bd-ec/users.json — departmentId, generalDepartmentId,
//      orgLevel, jobProfileId, managerId). Three real BD/EC people were moved
//      into the Sinai tank farm by hand while the profiles were being sorted
//      out, and their org level no longer matches the profile they were given,
//      so the employee form refuses to save them. `--no-restore` leaves them.
//
// Refuses on a dangling reference (unknown department, job profile, manager, or
// a job profile whose orgLevel disagrees with the person's), on an email already
// claimed by a DIFFERENT user id, and on a stray with no canonical record to be
// restored to — rather than guessing where a real person belongs.
//
// Writes the same wire shape store.ts's preparePayload writes (`certificates`
// and `careerHistory` are stringified — neither is set here).
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'data', 'ops', 'users.json');
const CANONICAL = join(here, '..', 'data', 'bd-ec', 'users.json');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const resetExisting = argv.includes('--reset-existing');
const restore = !argv.includes('--no-restore');
const pwIndex = argv.indexOf('--password');
const TEMP_PASSWORD = pwIndex >= 0 ? argv[pwIndex + 1] : 'Eprom@2026';
if (!TEMP_PASSWORD || TEMP_PASSWORD.length < 8) {
  console.error('temporary password must be at least 8 characters');
  process.exit(1);
}

const { users, departmentManagers, clearDepartmentManagers } = JSON.parse(readFileSync(SRC, 'utf8'));

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});
await client.connect();

const depts = new Map(
  (await client.query('select id, data from departments')).rows.map((r) => [r.id, r.data]),
);
const profiles = new Map(
  (await client.query('select id, data from "jobProfiles"')).rows.map((r) => [r.id, r.data]),
);
const existing = new Map(
  (await client.query('select id, data from users')).rows.map((r) => [r.id, r.data]),
);
const hasPassword = new Set(
  (await client.query('select user_id from auth_credentials where password_hash is not null')).rows
    .map((r) => r.user_id),
);

const ids = new Set(users.map((u) => u.id));
const problems = [];
for (const u of users) {
  if (!depts.has(u.departmentId)) problems.push(`${u.id}: department ${u.departmentId} does not exist`);
  if (u.generalDepartmentId && !depts.has(u.generalDepartmentId)) {
    problems.push(`${u.id}: general department ${u.generalDepartmentId} does not exist`);
  }
  const profile = profiles.get(u.jobProfileId);
  if (!profile) problems.push(`${u.id}: job profile ${u.jobProfileId} does not exist`);
  else if (profile.orgLevel !== u.orgLevel) {
    problems.push(`${u.id}: orgLevel ${u.orgLevel} but profile ${u.jobProfileId} is ${profile.orgLevel}`);
  }
  if (u.managerId && !ids.has(u.managerId) && !existing.has(u.managerId)) {
    problems.push(`${u.id}: manager ${u.managerId} does not exist`);
  }
  for (const [otherId, data] of existing) {
    if (otherId !== u.id && String(data.email ?? '').toLowerCase() === u.email.toLowerCase()) {
      problems.push(`${u.id}: email ${u.email} already belongs to ${otherId}`);
    }
  }
}
for (const [deptId, userId] of Object.entries(departmentManagers)) {
  if (!depts.has(deptId)) problems.push(`department ${deptId} (manager fix) does not exist`);
  if (!ids.has(userId)) problems.push(`department ${deptId}: manager ${userId} is not in this load`);
}
for (const deptId of clearDepartmentManagers) {
  if (!depts.has(deptId)) problems.push(`department ${deptId} (manager clear) does not exist`);
}

// --- the strays: real people parked in an Operations unit -------------------
// The Operations subtree here is every unit this load places somebody in, plus
// the units it hands a manager to.
const opsUnits = new Set([...Object.keys(departmentManagers), ...users.map((u) => u.departmentId)]);
const RESTORED_FIELDS = ['departmentId', 'generalDepartmentId', 'orgLevel', 'jobProfileId', 'managerId'];
const canonical = new Map(
  JSON.parse(readFileSync(CANONICAL, 'utf8')).users.map((u) => [u.id, u]),
);
const strays = [];
if (restore) {
  for (const [id, data] of existing) {
    if (ids.has(id) || !opsUnits.has(data.departmentId)) continue;
    const home = canonical.get(id);
    if (!home) {
      problems.push(`${id} (${data.name}) sits in ${data.departmentId} but is not on the roster ` +
                    'and has no canonical record — move them by hand or re-run with --no-restore');
      continue;
    }
    strays.push({ id, name: data.name, from: data.departmentId, home });
  }
}

if (problems.length) {
  console.error('REFUSING: %d problem(s):', problems.length);
  for (const m of problems.slice(0, 40)) console.error('  -', m);
  await client.end();
  process.exit(1);
}

if (dryRun) {
  const news = users.filter((u) => !existing.has(u.id)).length;
  console.log(`dry run: ${news} new user(s), ${users.length - news} updated`);
  for (const u of users) {
    const pw = hasPassword.has(u.id) && !resetExisting ? 'password KEPT' : 'temp password';
    console.log(`  ${existing.has(u.id) ? 'update' : 'create'} ${u.id} ${u.email} ` +
                `${u.orgLevel} ${u.jobProfileId} @ ${u.departmentId} ` +
                `mgr=${u.managerId ?? '-'} (${pw})`);
  }
  console.log('department managers set:', departmentManagers);
  console.log('department managers cleared:', clearDepartmentManagers);
  console.log(restore ? `strays to restore: ${strays.length}` : 'stray restore: SKIPPED (--no-restore)');
  for (const s of strays) {
    console.log(`  ${s.id} ${s.name}: ${s.from} -> ${s.home.departmentId} ` +
                `(${s.home.orgLevel} ${s.home.jobProfileId})`);
  }
  await client.end();
  process.exit(0);
}

const rounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
const hash = await bcrypt.hash(TEMP_PASSWORD, rounds);

await client.query('BEGIN');
let created = 0, updated = 0, issued = 0, kept = 0;
for (const u of users) {
  const prev = existing.get(u.id) ?? {};
  const doc = { ...prev, ...u };
  const r = await client.query(
    `INSERT INTO users (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = $2, version = users.version + 1, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [u.id, doc],
  );
  if (r.rows[0].inserted) created++; else updated++;

  if (hasPassword.has(u.id) && !resetExisting) {
    await client.query(
      'UPDATE auth_credentials SET email = $2, updated_at = now() WHERE user_id = $1',
      [u.id, u.email],
    );
    kept++;
    continue;
  }
  await client.query(
    `INSERT INTO auth_credentials (user_id, email, password_hash, must_reset)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (user_id) DO UPDATE
       SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
           must_reset = true, updated_at = now()`,
    [u.id, u.email, hash],
  );
  issued++;
}

// Put the strays back — read-modify-write under a row lock, touching only the
// five placement fields so anything else on their document survives.
let restored = 0;
for (const s of strays) {
  const row = (await client.query('select data from users where id = $1 for update', [s.id])).rows[0];
  const data = { ...(row?.data ?? {}) };
  for (const f of RESTORED_FIELDS) {
    if (s.home[f] === undefined) delete data[f];
    else data[f] = s.home[f];
  }
  await client.query(
    'update users set data = $2, version = version + 1, updated_at = now() where id = $1',
    [s.id, data],
  );
  restored++;
}

// Department manager refs: read-modify-write under a row lock, like the app's
// own path — the document is the app's shape, not SQL's.
let mgrSet = 0, mgrCleared = 0;
for (const [deptId, userId] of Object.entries(departmentManagers)) {
  const row = (await client.query('select data from departments where id = $1 for update', [deptId])).rows[0];
  const data = { ...(row?.data ?? {}) };
  if (data.managerId === userId) continue;
  data.managerId = userId;
  await client.query(
    'update departments set data = $2, version = version + 1, updated_at = now() where id = $1',
    [deptId, data],
  );
  mgrSet++;
}
for (const deptId of clearDepartmentManagers) {
  const row = (await client.query('select data from departments where id = $1 for update', [deptId])).rows[0];
  const data = { ...(row?.data ?? {}) };
  if (data.managerId === undefined) continue;
  delete data.managerId;
  await client.query(
    'update departments set data = $2, version = version + 1, updated_at = now() where id = $1',
    [deptId, data],
  );
  mgrCleared++;
}

await client.query('COMMIT');
console.log(`users: ${created} created, ${updated} updated (${users.length} total)`);
console.log(`credentials: ${issued} set to the shared temporary password (must_reset = true), ` +
            `${kept} existing password(s) left untouched`);
console.log(`strays: ${restored} put back to their own section`);
console.log(`departments: ${mgrSet} manager(s) set, ${mgrCleared} cleared`);
await client.end();
