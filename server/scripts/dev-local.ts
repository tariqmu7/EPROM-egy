// ============================================================================
// Stage B — "Prove it on this laptop" harness.
//
// Boots a REAL PostgreSQL (embedded-postgres binaries — no Docker, no admin),
// applies the real 001_init.sql migration, seeds a small coherent org, then
// starts the actual Express API (reusing src/app.ts). One process keeps Postgres
// + the API alive so the React app can be driven against it in a browser.
//
//   cd server && npx tsx scripts/dev-local.ts
//
// Everything is throwaway: the data dir is recreated each run and deleted on
// exit (persistent:false). Nothing here ships to the VM.
// ============================================================================
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync, rmSync } from 'node:fs';

const PG_PORT = Number(process.env.DEV_PG_PORT ?? 5433);
const API_PORT = Number(process.env.DEV_API_PORT ?? 4000);
// Keep the cluster data OUT of the repo (scratchpad).
const dataDir =
  process.env.DEV_PG_DIR ??
  'C:/Users/tariq/AppData/Local/Temp/claude/c--Users-tariq-Desktop-work-Work-laptop-competency-ECMS/e6d64d2b-39c4-48d2-a031-2a817d00378b/scratchpad/pgdata';

async function main() {
  // Fresh cluster every run.
  if (existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });

  console.log(`[dev] initialising embedded Postgres in ${dataDir} …`);
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'cms',
    password: 'cms-dev-pass',
    port: PG_PORT,
    authMethod: 'password',
    persistent: false,
    // Force a UTF8 cluster (Windows initdb defaults to WIN1252, which can't store
    // the box-drawing chars in 001_init.sql or Arabic seed text). --locale=C keeps
    // initdb from demanding a matching WIN1252 locale. This mirrors the prod
    // Docker Postgres image, which is UTF8.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: (m) => console.error('[pg]', m),
  });
  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase('eprom_cms');
  } catch (e) {
    console.log('[dev] createDatabase note:', (e as Error).message);
  }
  console.log(`[dev] Postgres up on :${PG_PORT}`);

  // Point the API's config/db at this cluster BEFORE importing them.
  process.env.PGHOST = 'localhost';
  process.env.PGPORT = String(PG_PORT);
  process.env.PGUSER = 'cms';
  process.env.PGPASSWORD = 'cms-dev-pass';
  process.env.PGDATABASE = 'eprom_cms';
  process.env.PGSSL = 'false';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'dev-local-only-secret';
  process.env.JWT_EXPIRES_IN = '12h';
  process.env.BCRYPT_ROUNDS = process.env.BCRYPT_ROUNDS ?? '10';
  process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173';
  process.env.ALLOW_SIGNUP = process.env.ALLOW_SIGNUP ?? 'false';
  process.env.BOOTSTRAP_ADMIN_EMAIL = process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'tarekmoh123@gmail.com';

  const { runMigrations } = await import('../src/migrate.js');
  const { query } = await import('../src/db.js');
  const { hashPassword } = await import('../src/auth/password.js');
  const { createApp } = await import('../src/app.js');

  console.log('[dev] applying migrations (real 001_init.sql) …');
  await runMigrations();

  console.log('[dev] seeding representative org …');
  await seed(query, hashPassword);

  const app = createApp();
  app.listen(API_PORT, () => {
    console.log(`\n[dev] ✅ EPROM CMS API on http://localhost:${API_PORT}`);
    console.log('[dev] Logins (all ACTIVE):');
    console.log('        tarekmoh123@gmail.com / admin123    (ADMIN — your email)');
    console.log('        admin@eprom.local     / admin123    (ADMIN)');
    console.log('        ceo@eprom.local       / ceo12345    (CEO)');
    console.log('        mona.head@eprom.local / manager123  (Section Head / manager)');
    console.log('        ali.tech@eprom.local  / employee123 (Junior Position)');
    console.log('        sara.tech@eprom.local / employee123 (Junior Position)');
    console.log('[dev] Ctrl-C to stop (Postgres data dir is wiped on exit).');
  });

  const shutdown = async () => {
    console.log('\n[dev] shutting down …');
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

// ── Seed ────────────────────────────────────────────────────────────────────

type Q = (t: string, p?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

// SkillLevel map 1..5 with the canonical proficiency labels.
function levels(perLevelDesc: string) {
  const labels: Record<number, string> = { 1: 'Awareness', 2: 'Knowledge', 3: 'Skill', 4: 'Advanced', 5: 'Expert' };
  const out: Record<number, { level: number; description: string; requiredCertificates: string[] }> = {};
  for (let l = 1; l <= 5; l++) out[l] = { level: l, description: `${labels[l]} — ${perLevelDesc}`, requiredCertificates: [] };
  return out;
}

async function seed(query: Q, hashPassword: (p: string) => Promise<string>) {
  const TABLE: Record<string, string> = {
    users: 'users',
    skills: 'skills',
    departments: 'departments',
    jobProfiles: '"jobProfiles"',
    assessments: 'assessments',
    evidences: 'evidences',
    notifications: 'notifications',
    trainingCourses: '"trainingCourses"',
  };
  const put = (coll: string, id: string, data: Record<string, unknown>) =>
    query(
      `INSERT INTO ${TABLE[coll]} (id, data) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [id, { ...data, id }],
    );
  const cred = async (userId: string, email: string, password: string) =>
    query(
      `INSERT INTO auth_credentials (user_id, email, password_hash, must_reset)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, must_reset = false`,
      [userId, email.toLowerCase(), await hashPassword(password)],
    );

  // Departments: General → Department → Section
  await put('departments', 'dept-gen-ops', { name: 'Operations', nameAr: 'العمليات', type: 'GENERAL' });
  await put('departments', 'dept-maint', { name: 'Maintenance', type: 'DEPARTMENT', parentId: 'dept-gen-ops', managerId: 'mgr-1' });
  await put('departments', 'dept-sec-mech', { name: 'Mechanical Maintenance', type: 'SECTION', parentId: 'dept-maint', managerId: 'mgr-1' });

  // Skills
  await put('skills', 'skill-welding', { name: 'Welding', category: 'Technical', status: 'APPROVED', levels: levels('arc & TIG welding') });
  await put('skills', 'skill-pump', { name: 'Pump Maintenance', category: 'Technical', status: 'APPROVED', levels: levels('centrifugal pump overhaul') });
  await put('skills', 'skill-safety', { name: 'Process Safety', category: 'Safety', status: 'APPROVED', levels: levels('permit-to-work & LOTO') });
  await put('skills', 'skill-leadership', { name: 'Team Leadership', category: 'Management', status: 'APPROVED', levels: levels('leading a shift crew') });

  // Job profiles (one position = one profile)
  await put('jobProfiles', 'jp-mech-tech', {
    title: 'Mechanical Technician', description: 'Front-line mechanical maintenance technician.',
    departmentId: 'dept-sec-mech', orgLevel: 'JP',
    requiredSkills: [
      { skillId: 'skill-welding', requiredLevel: 3 },
      { skillId: 'skill-pump', requiredLevel: 3 },
      { skillId: 'skill-safety', requiredLevel: 4 },
    ],
  });
  await put('jobProfiles', 'jp-sec-head', {
    title: 'Mechanical Section Head', description: 'Leads the mechanical maintenance section.',
    departmentId: 'dept-sec-mech', orgLevel: 'SH',
    requiredSkills: [
      { skillId: 'skill-welding', requiredLevel: 4 },
      { skillId: 'skill-pump', requiredLevel: 4 },
      { skillId: 'skill-safety', requiredLevel: 5 },
      { skillId: 'skill-leadership', requiredLevel: 3 },
    ],
  });

  // Users
  await put('users', 'admin-1', { name: 'System Admin', email: 'admin@eprom.local', role: 'ADMIN', status: 'ACTIVE', departmentId: 'dept-gen-ops' });
  await put('users', 'ceo-1', { name: 'Company CEO', email: 'ceo@eprom.local', role: 'CEO', status: 'ACTIVE', departmentId: 'dept-gen-ops', orgLevel: 'CEO' });
  await put('users', 'mgr-1', {
    name: 'Mona Elsayed', email: 'mona.head@eprom.local', role: 'EMPLOYEE', status: 'ACTIVE',
    departmentId: 'dept-sec-mech', generalDepartmentId: 'dept-gen-ops', orgLevel: 'SH', jobProfileId: 'jp-sec-head',
  });
  await put('users', 'emp-1', {
    name: 'Ali Hassan', email: 'ali.tech@eprom.local', role: 'EMPLOYEE', status: 'ACTIVE',
    departmentId: 'dept-sec-mech', generalDepartmentId: 'dept-gen-ops', orgLevel: 'JP', jobProfileId: 'jp-mech-tech', managerId: 'mgr-1',
  });
  await put('users', 'emp-2', {
    name: 'Sara Kamal', email: 'sara.tech@eprom.local', role: 'EMPLOYEE', status: 'ACTIVE',
    departmentId: 'dept-sec-mech', generalDepartmentId: 'dept-gen-ops', orgLevel: 'JP', jobProfileId: 'jp-mech-tech', managerId: 'mgr-1',
  });

  // Your real email as an ACTIVE admin too, so the pre-filled login form works.
  // NOTE: this is a LOCAL test password — unrelated to your Firebase password.
  await put('users', 'admin-tariq', { name: 'Tariq (Admin)', email: 'tarekmoh123@gmail.com', role: 'ADMIN', status: 'ACTIVE', departmentId: 'dept-gen-ops' });
  await cred('admin-tariq', 'tarekmoh123@gmail.com', 'admin123');

  await cred('admin-1', 'admin@eprom.local', 'admin123');
  await cred('ceo-1', 'ceo@eprom.local', 'ceo12345');
  await cred('mgr-1', 'mona.head@eprom.local', 'manager123');
  await cred('emp-1', 'ali.tech@eprom.local', 'employee123');
  await cred('emp-2', 'sara.tech@eprom.local', 'employee123');

  // A 360° set for Ali on Welding: Self 3, Peer 3, Manager 4 → weighted score.
  const today = new Date().toISOString();
  await put('assessments', 'a-self-1', { raterId: 'emp-1', subjectId: 'emp-1', skillId: 'skill-welding', score: 3, comment: 'self', date: today, method: 'THREE_SIXTY_EVALUATION', type: 'SELF' });
  await put('assessments', 'a-peer-1', { raterId: 'emp-2', subjectId: 'emp-1', skillId: 'skill-welding', score: 3, comment: 'peer', date: today, method: 'THREE_SIXTY_EVALUATION', type: 'PEER' });
  await put('assessments', 'a-mgr-1', { raterId: 'mgr-1', subjectId: 'emp-1', skillId: 'skill-welding', score: 4, comment: 'manager', date: today, method: 'THREE_SIXTY_EVALUATION', type: 'MANAGER' });
  // An exam score for Ali on Safety.
  await put('assessments', 'a-exam-1', { raterId: 'admin-1', subjectId: 'emp-1', skillId: 'skill-safety', score: 3, comment: 'exam', date: today, method: 'WRITTEN_EXAM', type: 'WRITTEN_EXAM' });

  // A pending evidence Ali submitted for Pump Maintenance (manager can approve).
  await put('evidences', 'ev-1', { userId: 'emp-1', skillId: 'skill-pump', fileUrl: 'https://example.local/ali-pump.pdf', fileName: 'pump-overhaul.pdf', notes: 'Completed P-101 overhaul', status: 'PENDING', submittedAt: today });

  // Notifications (owner-scoped).
  await put('notifications', 'n-1', { userId: 'emp-1', title: 'Assessment due', message: 'Your Safety exam is due this cycle.', type: 'INFO', isRead: false, createdAt: today });
  await put('notifications', 'n-2', { userId: 'mgr-1', title: 'Evidence to review', message: 'Ali Hassan submitted evidence for Pump Maintenance.', type: 'INFO', isRead: false, createdAt: today });

  // A training course linked to a skill (ITP recommendations).
  await put('trainingCourses', 'tc-1', { title: 'Advanced Welding', provider: 'EPROM Academy', linkedSkillIds: ['skill-welding'], type: 'INTERNAL' });

  const n = (await query('SELECT count(*)::int AS c FROM users')).rows[0].c;
  console.log(`[dev] seeded — users=${n}, skills=4, jobProfiles=2, assessments=4, evidences=1, notifications=2`);
}

main().catch((err) => {
  console.error('[dev] fatal:', err);
  process.exit(1);
});
