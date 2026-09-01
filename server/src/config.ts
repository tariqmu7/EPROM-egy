import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

// ─── Secret strength ────────────────────────────────────────────────────────
// JWT_SECRET is not "a config value": it is the password to EVERY account at
// once. Anyone holding it can mint a token for any user id with role ADMIN,
// and nothing in authz.ts would notice — the whole authorization layer sits
// downstream of "this signature is valid". The example env files ship an
// obvious placeholder, and a placeholder that boots is a placeholder that
// reaches production, so the API refuses to start on one.
//
// The same reasoning applies to PGPASSWORD (the database is reachable from
// anything on the VM's docker network).
const PLACEHOLDER_MARKERS = [
  'change-me',
  'changeme',
  'change_me',
  'your-secret',
  'yoursecret',
  'placeholder',
  'example',
  'secret',
  'password',
  'test-secret',
];

/** True when a value is obviously an unedited example rather than a real secret. */
export function looksLikePlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => v.includes(m));
}

/**
 * Throws when `value` is too weak to be a production secret. Length alone is
 * not enough — the shipped placeholder is 33 characters long — so a marker
 * check runs beside it. Returns the value so it can be used inline.
 */
export function assertStrongSecret(name: string, value: string, minLength = 32): string {
  if (value.trim().length < minLength) {
    throw new Error(
      `${name} is too short for production (${value.trim().length} chars, need >= ${minLength}). ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
    );
  }
  if (looksLikePlaceholder(value)) {
    throw new Error(
      `${name} still looks like the example value from .env.example. ` +
        `Generate a real one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
    );
  }
  return value;
}

const NODE_ENV = process.env.NODE_ENV;
const IS_TEST = NODE_ENV === 'test';
// The api container sets NODE_ENV=production (server/Dockerfile), so these
// checks fire exactly on the VM and never on a developer's machine.
const IS_PRODUCTION = NODE_ENV === 'production';

function resolveJwtSecret(): string {
  if (IS_TEST) return process.env.JWT_SECRET ?? 'test-secret';
  const secret = required('JWT_SECRET');
  if (IS_PRODUCTION) assertStrongSecret('JWT_SECRET', secret);
  return secret;
}

function resolvePgPassword(): string {
  const pw = process.env.PGPASSWORD ?? '';
  if (IS_PRODUCTION) assertStrongSecret('PGPASSWORD', pw, 16);
  return pw;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  pg: {
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'cms',
    password: resolvePgPassword(),
    database: process.env.PGDATABASE ?? 'eprom_cms',
    ssl: (process.env.PGSSL ?? 'false') === 'true' ? { rejectUnauthorized: false } : undefined,
  },

  // How many reverse proxies sit in front of the API. In the documented deploy
  // there is exactly ONE (the `web` nginx container), which appends the caller
  // to X-Forwarded-For. Express must be told, or `req.ip` is the proxy's address
  // for EVERY request — which silently collapses both rate limiters into a
  // single shared bucket for the whole company (one person's polling can lock
  // everybody out with 429s) and makes the access log useless for tracing.
  // Kept a number, never `true`: trusting the whole chain would let a caller
  // forge X-Forwarded-For and evade the limiter entirely. Set 0 when the API is
  // exposed directly with no proxy in front of it.
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),

  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),

  // Scheduled work (src/jobs/). The nightly sweep re-bands certificates, chases
  // due assessments and overdue development items, and sends managers a weekly
  // digest. Off under test so the suite never starts a background timer.
  jobs: {
    enabled: IS_TEST ? false : (process.env.JOBS_ENABLED ?? 'true') === 'true',
    // Local server time. 02:00 by default — after the nightly pg_dump backup
    // window in docker-compose.yml, and long before anyone logs in.
    hour: Math.min(23, Math.max(0, Number(process.env.JOBS_HOUR ?? 2))),
    minute: Math.min(59, Math.max(0, Number(process.env.JOBS_MINUTE ?? 0))),
    // Run once shortly after boot if the last successful sweep is older than
    // this — so a night lost to a reboot is caught up, not skipped.
    catchUpOnBoot: (process.env.JOBS_CATCH_UP_ON_BOOT ?? 'true') === 'true',
    catchUpAfterHours: Number(process.env.JOBS_CATCH_UP_AFTER_HOURS ?? 20),
    bootDelayMs: Number(process.env.JOBS_BOOT_DELAY_MS ?? 30_000),
  },

  bootstrapAdminEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase(),
  // Self-registration is OFF unless explicitly enabled. Accounts are created by
  // an admin (Admin → Employees), who issues a temporary password. The bootstrap
  // admin email stays exempt so a fresh install can still be claimed.
  allowSignup: (process.env.ALLOW_SIGNUP ?? 'false') === 'true',
};

export type Config = typeof config;
