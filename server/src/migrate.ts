// Forward-only SQL migration runner. Applies every .sql file in src/migrations
// in filename order, once each, tracked in a `_migrations` table.
//
// Hardening over the naïve version:
//   • Each migration runs inside its OWN transaction — a multi-statement file
//     that fails midway rolls back completely instead of leaving partial schema.
//   • Every applied migration stores a SHA-256 checksum of its file. If a file
//     that was already applied is later edited, the runner refuses to continue
//     (drift detection) rather than silently ignoring the change.
// Run with: npm run migrate
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, withTransaction } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, 'migrations');

function checksumOf(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

export async function runMigrations(): Promise<string[]> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      checksum   TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  // Backfill for clusters created before checksums existed.
  await pool.query(`ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum TEXT`);

  const appliedRows = (await pool.query('SELECT name, checksum FROM _migrations')).rows as {
    name: string;
    checksum: string | null;
  }[];
  const applied = new Map(appliedRows.map((r) => [r.name, r.checksum]));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const checksum = checksumOf(sql);

    if (applied.has(file)) {
      const stored = applied.get(file);
      if (stored && stored !== checksum) {
        throw new Error(
          `migration drift: ${file} was modified after being applied ` +
            `(stored ${stored.slice(0, 12)}…, file ${checksum.slice(0, 12)}…). ` +
            `Migrations are immutable — add a new migration instead of editing an applied one.`,
        );
      }
      if (!stored) {
        // Legacy row with no checksum — record it now so future drift is caught.
        await pool.query('UPDATE _migrations SET checksum = $2 WHERE name = $1', [file, checksum]);
      }
      continue;
    }

    // Apply the whole file atomically, then record it in the SAME transaction.
    await withTransaction(async (tx) => {
      await tx(sql);
      await tx('INSERT INTO _migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
    });
    ran.push(file);
    console.log(`applied migration: ${file}`);
  }
  if (ran.length === 0) console.log('no pending migrations');
  return ran;
}

// Run directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('migration failed:', err);
      process.exit(1);
    });
}
