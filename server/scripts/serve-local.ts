// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT local server — the real thing you rely on, not the throwaway demo
// (dev-local.ts). One process owns:
//   • a PERSISTENT embedded Postgres (data survives restarts, lives INSIDE the
//     repo at server/data/pgdata — override with LOCAL_PG_DIR for prod/Docker)
//   • schema migrations (idempotent)
//   • an ensure-admin step (INSERT-IF-ABSENT — never clobbers your data/password)
//   • the real Express API on :4000
//
// It does NOT seed demo data and does NOT re-import departments/skills on boot,
// so anything you create/edit in the app persists. The one-time department+skill
// import is done separately via scripts/etl/load-postgres.mjs.
//
//   cd server && npx tsx scripts/serve-local.ts
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

// Data lives INSIDE the repo (server/data/pgdata) so it travels with the project
// and is easy to back up. Resolved from this file's location, so it does not
// matter what cwd you launch from. Override with LOCAL_PG_DIR (prod/Docker).
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.LOCAL_PG_DIR
  ? resolve(process.env.LOCAL_PG_DIR)
  : join(__dirname, '..', 'data', 'pgdata');

const PGUSER = process.env.PGUSER ?? 'cms';
const PGPASSWORD = process.env.PGPASSWORD ?? 'cms-local-pass';
const PGPORT = Number(process.env.PGPORT ?? 5433);
const PGDATABASE = process.env.PGDATABASE ?? 'eprom_cms';

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: PGUSER,
    password: PGPASSWORD,
    port: PGPORT,
    authMethod: 'password',
    persistent: true,
    // Force UTF8 so the migration's box-drawing comments + Arabic dept names store
    // correctly (Windows initdb otherwise defaults to WIN1252). Matches prod.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: (m) => console.error('[pg]', m),
  });

  const initialised = existsSync(join(DATA_DIR, 'PG_VERSION'));
  if (!initialised) {
    console.log(`[serve] first run — initialising persistent cluster at ${DATA_DIR}`);
    await pg.initialise();
  }
  console.log(`[serve] starting Postgres on :${PGPORT} (persistent: ${DATA_DIR})`);
  await pg.start();

  try {
    await pg.createDatabase(PGDATABASE);
    console.log(`[serve] created database "${PGDATABASE}"`);
  } catch (e: any) {
    if (!String(e?.message ?? e).includes('already exists')) throw e;
  }

  const { runMigrations } = await import('../src/migrate.js');
  const { query } = await import('../src/db.js');
  const { hashPassword } = await import('../src/auth/password.js');
  const { createApp } = await import('../src/app.js');
  const { config } = await import('../src/config.js');

  console.log('[serve] applying migrations…');
  await runMigrations();

  // Ensure an ACTIVE admin exists so you can enter the portal. INSERT-IF-ABSENT:
  // if the admin already exists (e.g. you changed the password in-app), do nothing.
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  const name = process.env.SEED_ADMIN_NAME ?? 'Admin';
  if (email && password) {
    const existing = (await query('SELECT user_id FROM auth_credentials WHERE lower(email) = $1', [email])).rows[0];
    if (existing) {
      console.log(`[serve] admin ${email} already exists — leaving it untouched`);
    } else {
      const id = `admin-${email.replace(/[^a-z0-9]+/gi, '-')}`;
      await query(
        `INSERT INTO users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [id, { id, name, email, role: 'ADMIN', status: 'ACTIVE' }],
      );
      await query(
        `INSERT INTO auth_credentials (user_id, email, password_hash, must_reset)
         VALUES ($1, $2, $3, false) ON CONFLICT (user_id) DO NOTHING`,
        [id, email, await hashPassword(password)],
      );
      console.log(`[serve] seeded ADMIN ${email} (temporary password from SEED_ADMIN_PASSWORD)`);
    }
  }

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`\n[serve] ✅ EPROM CMS API on http://localhost:${config.port}`);
    console.log(`[serve] ✅ Frontend: http://localhost:5173`);
    console.log(`[serve]    Admin login: ${email} / ${password}  (change it after first login)\n`);
  });

  const shutdown = async () => {
    console.log('\n[serve] shutting down (data is preserved)…');
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[serve] failed to start:', err);
  process.exit(1);
});
