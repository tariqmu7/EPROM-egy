// Operations (Canal Cities & Sinai) DEMO support — give every invented account
// the SAME easy password so the system can be demonstrated by switching between
// people quickly.
//
//   node scripts/etl/ops/set-demo-passwords.mjs [--password '<pw>'] [--dry-run]
//                                               [--keep-must-reset]
//
// Scope is the invented 90001-90070 employee block ONLY (`u-9…` ids carrying
// `isTestData: true`). It REFUSES to touch an account that is not test data, so
// a real employee's password can never be set to a demo one by this script.
//
// `must_reset` is cleared by default: the forced-change screen is correct for a
// real roll-out but gets in the way of a demo. Note that changing a credential
// moves `auth_credentials.updated_at`, which ends any session already open on
// these accounts (see middleware/authenticate.ts) — sign in again afterwards.
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const keepMustReset = argv.includes('--keep-must-reset');
const pwIndex = argv.indexOf('--password');
const PASSWORD = pwIndex >= 0 ? argv[pwIndex + 1] : '1234567891';
if (!PASSWORD || PASSWORD.length < 8) {
  console.error('password must be at least 8 characters');
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

const rows = (await client.query(
  `select id, data->>'email' email, data->>'name' name,
          data->>'isTestData' test, data->>'employeeId' emp
   from users where id like 'u-9%' order by id`,
)).rows;

const problems = [];
for (const r of rows) {
  if (r.test !== 'true') problems.push(`${r.id} (${r.name}) is not marked isTestData`);
  const emp = Number(r.emp);
  if (!(emp >= 90001 && emp <= 99999)) problems.push(`${r.id}: employee number ${r.emp} is outside the invented block`);
  if (!r.email) problems.push(`${r.id}: no email to sign in with`);
}
if (!rows.length) problems.push('no invented Operations accounts found (u-9…)');
if (problems.length) {
  console.error('REFUSING: %d problem(s):', problems.length);
  for (const m of problems.slice(0, 20)) console.error('  -', m);
  await client.end();
  process.exit(1);
}

if (dryRun) {
  console.log(`dry run: would set the password of ${rows.length} invented account(s)` +
              `${keepMustReset ? '' : ' and clear must_reset'}`);
  for (const r of rows) console.log(`  ${r.id}  ${r.email}`);
  await client.end();
  process.exit(0);
}

const hash = await bcrypt.hash(PASSWORD, Number(process.env.BCRYPT_ROUNDS ?? 12));
await client.query('BEGIN');
let n = 0;
for (const r of rows) {
  await client.query(
    `INSERT INTO auth_credentials (user_id, email, password_hash, must_reset)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
           must_reset = EXCLUDED.must_reset, updated_at = now()`,
    [r.id, r.email, hash, keepMustReset],
  );
  n++;
}
await client.query('COMMIT');

console.log(`${n} invented Operations account(s) now share the demo password` +
            `${keepMustReset ? ' (must_reset kept)' : ' (must_reset cleared)'}`);
console.log('sign in with any of their emails, password: ' + PASSWORD);
await client.end();
