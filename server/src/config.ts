import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
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
    password: process.env.PGPASSWORD ?? '',
    database: process.env.PGDATABASE ?? 'eprom_cms',
    ssl: (process.env.PGSSL ?? 'false') === 'true' ? { rejectUnauthorized: false } : undefined,
  },

  jwtSecret: process.env.NODE_ENV === 'test' ? (process.env.JWT_SECRET ?? 'test-secret') : required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 12),

  bootstrapAdminEmail: (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase(),
  allowSignup: (process.env.ALLOW_SIGNUP ?? 'true') === 'true',
};

export type Config = typeof config;
