import pg from 'pg';
import { config } from './config.js';

// pg returns numeric/bigint as strings by default; that's fine — our data lives
// in JSONB so numbers round-trip through JSON. We keep the pool small; this app
// is internal-scale.
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

let pool: Queryable | null = null;

export function getPool(): Queryable {
  if (!pool) {
    pool = new pg.Pool({
      host: config.pg.host,
      port: config.pg.port,
      user: config.pg.user,
      password: config.pg.password,
      database: config.pg.database,
      ssl: config.pg.ssl,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return pool;
}

/** Allow tests (pg-mem) or the migration runner to inject a pool. */
export function setPool(p: Queryable): void {
  pool = p;
}

export function query(text: string, params?: unknown[]) {
  return getPool().query(text, params);
}

export type Tx = (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

// Runs fn inside a BEGIN/COMMIT transaction on a dedicated client, rolling back
// on any error. Used for writeBatch atomicity. Works with pg and pg-mem pools.
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const p = getPool() as any;
  if (typeof p.connect !== 'function') {
    return fn((t, pa) => p.query(t, pa));
  }
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await fn((t: string, pa?: unknown[]) => client.query(t, pa));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback failure */
    }
    throw e;
  } finally {
    client.release?.();
  }
}
