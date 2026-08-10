// ============================================================================
// The nightly sweep — the first scheduled work this system has ever done.
//
// It answers finding 5 of the analytical-engine review: "nothing is active".
// Every night it reads the whole roster and:
//   1. re-bands every certificate's renewalStatus and warns its owner at the
//      90 / 60 / 30-day and expired marks (this used to run in the BROWSER on
//      login — see `checkCertificationExpiries`, now removed from store.ts);
//   2. finds every employee with an assessment that is due or overdue against
//      their job profile's required skills, and nudges them;
//   3. finds every overdue item on an ACTIVE development plan and nudges its
//      owner;
//   4. sends each manager ONE weekly digest of the above across their team;
//   5. writes this month's competency snapshot for the company and every
//      department (snapshots.ts) — the system's only stored history of its own
//      numbers.
//
// Three rules keep it from becoming noise — the reason people switch alerts off:
//   • EVERY notification carries a `sourceKey` and is written only if no
//     notification with that key exists yet. The key embeds its own period
//     (`…:2026-08` monthly, `…:2026-W32` weekly, or the expiry window), so a
//     nightly job cannot say the same thing twice.
//   • An employee gets at most ONE assessment nudge and ONE plan nudge per
//     month, listing the skills — not one notification per skill.
//   • A manager gets ONE digest per week, never a copy of each employee alert.
//
// It is read-mostly: the only documents it writes are notifications, plus the
// `renewalStatus` field on a user's own certificates when the band changed.
// ============================================================================
import { randomUUID } from 'node:crypto';
import { query, withTransaction } from '../db.js';
import { logger } from '../logger.js';
import {
  certificateStatus,
  expiryBucket,
  monthKey,
  nextAssessmentDate,
  safeJson,
  weekKey,
  type CertificateLike,
  type MethodBlock,
  type SweepUser,
} from './scheduling.js';
import { runMonthlySnapshot } from './snapshots.js';

export interface SweepSummary {
  usersScanned: number;
  certificatesRebanded: number;
  usersUpdated: number;
  employeesWithOverdueAssessments: number;
  overdueAssessments: number;
  employeesWithOverduePlanItems: number;
  overduePlanItems: number;
  managersNotified: number;
  notificationsCreated: number;
  /** Notifications the dedupe key suppressed — proof the job isn't spamming. */
  notificationsSuppressed: number;
  /** The month the snapshot was written for, e.g. `2026-08`. */
  snapshotPeriod: string | null;
  /** Company + department rows written/refreshed for that month. */
  snapshotScopes: number;
  ms: number;
}

interface Row {
  id: string;
  data: Record<string, any>;
}

async function loadAll(table: string): Promise<Row[]> {
  const { rows } = await query(`SELECT id, data FROM ${table}`);
  return rows.map((r) => ({ id: String(r.id), data: (r.data ?? {}) as Record<string, any> }));
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `subjectId|skillId` — the key both the assessment and evidence maps use. */
function pairKey(userId: string, skillId: string): string {
  return `${userId}|${skillId}`;
}

// ── Notification writer with built-in dedupe ────────────────────────────────

class Notifier {
  private created = 0;
  private suppressed = 0;

  constructor(private readonly existingKeys: Set<string>) {}

  get counts() {
    return { created: this.created, suppressed: this.suppressed };
  }

  /** Writes one notification unless its sourceKey has already been used. */
  async send(n: {
    userId: string;
    title: string;
    message: string;
    type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
    actionLink?: string;
    sourceKey: string;
  }): Promise<boolean> {
    if (this.existingKeys.has(n.sourceKey)) {
      this.suppressed++;
      return false;
    }
    const id = randomUUID();
    await query('INSERT INTO notifications (id, data, created_by, updated_by) VALUES ($1, $2, $3, $3)', [
      id,
      {
        id,
        userId: n.userId,
        title: n.title,
        message: n.message,
        type: n.type,
        actionLink: n.actionLink,
        isRead: false,
        createdAt: new Date().toISOString(),
        // Not part of the Notification contract the UI reads — it exists so
        // this job can recognise its own past output. See src/types.ts.
        sourceKey: n.sourceKey,
      },
      'system:nightly',
    ]);
    this.existingKeys.add(n.sourceKey);
    this.created++;
    return true;
  }
}

/** Every sourceKey already used, so the sweep never repeats itself. Loaded once
 *  per run rather than one SELECT per candidate notification. */
async function loadUsedKeys(): Promise<Set<string>> {
  const { rows } = await query(
    `SELECT data->>'sourceKey' AS k FROM notifications WHERE data->>'sourceKey' IS NOT NULL`,
  );
  // De-duped in JS rather than with SELECT DISTINCT on an expression, which
  // pg-mem (the test harness) does not support.
  return new Set(rows.map((r) => String(r.k)));
}

// ── The sweep ───────────────────────────────────────────────────────────────

export async function runNightlySweep(opts: { now?: Date } = {}): Promise<SweepSummary> {
  const now = opts.now ?? new Date();
  const startedMs = Date.now();

  const [userRows, skillRows, jobRows, assessmentRows, evidenceRows, planRows] = await Promise.all([
    loadAll('users'),
    loadAll('skills'),
    loadAll('"jobProfiles"'),
    loadAll('assessments'),
    loadAll('evidences'),
    loadAll('"developmentPlans"'),
  ]);

  // ── Roster ────────────────────────────────────────────────────────────────
  // Keyed by CANONICAL id (`data.id`), because that is what managerId,
  // subjectId, userId and every notification's userId refer to; the table id can
  // differ after the Firebase ETL.
  const managerCounts = new Map<string, number>();
  for (const r of userRows) {
    const mgr = r.data.managerId;
    if (mgr) managerCounts.set(String(mgr), (managerCounts.get(String(mgr)) ?? 0) + 1);
  }

  const users: SweepUser[] = userRows.map((r) => {
    const canonical = String(r.data.id ?? r.id);
    return {
      id: canonical,
      rowId: r.id,
      name: String(r.data.name ?? r.data.email ?? canonical),
      email: r.data.email ? String(r.data.email) : undefined,
      role: r.data.role ? String(r.data.role) : undefined,
      status: r.data.status ? String(r.data.status) : undefined,
      orgLevel: r.data.orgLevel ? String(r.data.orgLevel) : undefined,
      departmentId: r.data.departmentId ? String(r.data.departmentId) : undefined,
      managerId: r.data.managerId ? String(r.data.managerId) : undefined,
      jobProfileId: r.data.jobProfileId ? String(r.data.jobProfileId) : undefined,
      isArchived: r.data.isArchived === true,
      certificates: safeJson<CertificateLike[]>(r.data.certificates, []) || [],
      hasSubordinates: (managerCounts.get(canonical) ?? 0) > 0,
    };
  });

  // Only live people are chased. A PENDING account has never signed in and an
  // archived one has left the company; notifying either is pure noise.
  const active = users.filter((u) => u.status === 'ACTIVE' && !u.isArchived);

  // ── Lookups ───────────────────────────────────────────────────────────────
  const skillMethods = new Map<string, MethodBlock[]>();
  const skillNames = new Map<string, string>();
  for (const r of skillRows) {
    const id = String(r.data.id ?? r.id);
    skillNames.set(id, String(r.data.name ?? id));
    const blocks = safeJson<MethodBlock[]>(r.data.assessmentMethods, []);
    skillMethods.set(id, Array.isArray(blocks) ? blocks : []);
  }

  const jobRequirements = new Map<string, { skillId: string; requiredLevel: number }[]>();
  for (const r of jobRows) {
    const id = String(r.data.id ?? r.id);
    const reqs = safeJson<{ skillId?: string; requiredLevel?: number }[]>(r.data.requiredSkills, []);
    jobRequirements.set(
      id,
      (Array.isArray(reqs) ? reqs : [])
        .filter((x) => x && typeof x.skillId === 'string' && x.skillId !== '')
        // A requirement pointing at a deleted skill is dropped at read time
        // everywhere else too (`getEffectiveRequirements`).
        .filter((x) => skillMethods.has(String(x.skillId)))
        .map((x) => ({ skillId: String(x.skillId), requiredLevel: Number(x.requiredLevel ?? 0) })),
    );
  }

  // Latest assessment per user+skill (archived rows ignored, as in the store).
  const lastAssessment = new Map<string, Date>();
  for (const r of assessmentRows) {
    if (r.data.isArchived) continue;
    const subject = r.data.subjectId ? String(r.data.subjectId) : '';
    const skillId = r.data.skillId ? String(r.data.skillId) : '';
    const date = parseDate(r.data.date);
    if (!subject || !skillId || !date) continue;
    const key = pairKey(subject, skillId);
    const seen = lastAssessment.get(key);
    if (!seen || date > seen) lastAssessment.set(key, date);
  }

  // Latest expiry across APPROVED evidences — what a CERTIFICATE_BASED block
  // schedules against.
  const latestEvidenceExpiry = new Map<string, Date>();
  for (const r of evidenceRows) {
    if (r.data.status !== 'APPROVED') continue;
    const userId = r.data.userId ? String(r.data.userId) : '';
    const skillId = r.data.skillId ? String(r.data.skillId) : '';
    const expiry = parseDate(r.data.expiryDate);
    if (!userId || !skillId || !expiry) continue;
    const key = pairKey(userId, skillId);
    const seen = latestEvidenceExpiry.get(key);
    if (!seen || expiry > seen) latestEvidenceExpiry.set(key, expiry);
  }

  const notifier = new Notifier(await loadUsedKeys());
  const month = monthKey(now);
  const week = weekKey(now);

  // Per-manager tallies for the weekly digest.
  const teamAssessments = new Map<string, number>();
  const teamPlans = new Map<string, number>();
  const teamCerts = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  const summary: SweepSummary = {
    usersScanned: active.length,
    certificatesRebanded: 0,
    usersUpdated: 0,
    employeesWithOverdueAssessments: 0,
    overdueAssessments: 0,
    employeesWithOverduePlanItems: 0,
    overduePlanItems: 0,
    managersNotified: 0,
    notificationsCreated: 0,
    notificationsSuppressed: 0,
    snapshotPeriod: null,
    snapshotScopes: 0,
    ms: 0,
  };

  // ── 1. Certificates ───────────────────────────────────────────────────────
  for (const user of active) {
    if (user.certificates.length === 0) continue;

    const updated = [...user.certificates];
    let dirty = false;
    let warned = false;

    for (let i = 0; i < updated.length; i++) {
      const cert = updated[i];
      if (!cert || cert.noExpiry === true || !cert.expiryDate) continue;

      const { status, diffDays } = certificateStatus(String(cert.expiryDate), now);
      if (cert.renewalStatus !== status) {
        updated[i] = { ...cert, renewalStatus: status };
        dirty = true;
        summary.certificatesRebanded++;
      }

      const bucket = expiryBucket(diffDays);
      if (!bucket) continue;

      const certId = String(cert.id ?? `idx${i}`);
      const certName = String(cert.name ?? 'certificate');
      const sent = await notifier.send({
        userId: user.id,
        title: 'Certification Renewal Alert',
        message:
          bucket === 'expired'
            ? `CRITICAL: Your certification "${certName}" has EXPIRED.`
            : `Warning: Your certification "${certName}" expires in ${diffDays} day${diffDays === 1 ? '' : 's'}.`,
        type: bucket === 'expired' ? 'ERROR' : 'WARNING',
        actionLink: 'evidence-portal',
        sourceKey: `cert:${user.id}:${certId}:${bucket}`,
      });
      if (sent) warned = true;
    }

    if (warned && user.managerId) bump(teamCerts, user.managerId);

    if (dirty) {
      // Write back in the SAME wire shape the field arrived in: the frontend's
      // preparePayload stringifies users.certificates, so a document loaded as a
      // string must be stored as a string or the browser's safeJsonField would
      // start seeing a different type than every other write produces.
      //
      // Read-modify-write under FOR UPDATE rather than `jsonb_set` / `data ||
      // '{…}'::jsonb`: those two forms are not supported by pg-mem, and re-reading
      // inside the transaction means a profile edit made between the sweep's bulk
      // load and this write is not clobbered.
      await withTransaction(async (tx) => {
        const { rows } = await tx('SELECT data FROM users WHERE id = $1 FOR UPDATE', [user.rowId]);
        if (rows.length === 0) return;
        const current = (rows[0].data ?? {}) as Record<string, any>;
        const certificates = typeof current.certificates === 'string' ? JSON.stringify(updated) : updated;
        await tx(
          `UPDATE users
              SET data = $2, version = version + 1, updated_at = now(), updated_by = $3
            WHERE id = $1`,
          [user.rowId, { ...current, certificates }, 'system:nightly'],
        );
      });
      summary.usersUpdated++;
    }
  }

  // ── 2. Assessments due / overdue ──────────────────────────────────────────
  for (const user of active) {
    if (!user.jobProfileId) continue;
    const requirements = jobRequirements.get(user.jobProfileId);
    if (!requirements || requirements.length === 0) continue;

    const overdue: string[] = [];
    for (const req of requirements) {
      const due = nextAssessmentDate(user, skillMethods.get(req.skillId) ?? [], {
        now,
        lastAssessment: lastAssessment.get(pairKey(user.id, req.skillId)) ?? null,
        latestCertificateExpiry: latestEvidenceExpiry.get(pairKey(user.id, req.skillId)) ?? null,
      });
      if (due && due <= now) overdue.push(skillNames.get(req.skillId) ?? req.skillId);
    }

    if (overdue.length === 0) continue;
    summary.employeesWithOverdueAssessments++;
    summary.overdueAssessments += overdue.length;

    // ONE nudge per employee per month, naming the skills — not one per skill.
    const named = overdue.slice(0, 3).join(', ');
    const rest = overdue.length > 3 ? ` and ${overdue.length - 3} more` : '';
    await notifier.send({
      userId: user.id,
      title: 'Assessments due',
      message:
        `You have ${overdue.length} skill${overdue.length === 1 ? '' : 's'} due for assessment: ` +
        `${named}${rest}.`,
      type: 'WARNING',
      actionLink: 'evaluations',
      sourceKey: `assess:${user.id}:${month}`,
    });
    if (user.managerId) bump(teamAssessments, user.managerId);
  }

  // ── 3. Overdue development-plan items ─────────────────────────────────────
  const overdueByUser = new Map<string, string[]>();
  for (const r of planRows) {
    if (r.data.status !== 'ACTIVE') continue;
    const userId = r.data.userId ? String(r.data.userId) : '';
    if (!userId) continue;
    const items = safeJson<Record<string, any>[]>(r.data.items, []);
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || item.status === 'COMPLETED' || item.status === 'CANCELLED') continue;
      const target = parseDate(item.targetDate);
      if (!target || target > now) continue;
      const list = overdueByUser.get(userId) ?? [];
      list.push(String(item.skillName ?? item.skillId ?? 'a training item'));
      overdueByUser.set(userId, list);
    }
  }

  for (const user of active) {
    const items = overdueByUser.get(user.id);
    if (!items || items.length === 0) continue;
    summary.employeesWithOverduePlanItems++;
    summary.overduePlanItems += items.length;

    const named = items.slice(0, 3).join(', ');
    const rest = items.length > 3 ? ` and ${items.length - 3} more` : '';
    await notifier.send({
      userId: user.id,
      title: 'Development plan overdue',
      message:
        `${items.length} item${items.length === 1 ? '' : 's'} on your development plan passed their ` +
        `target date: ${named}${rest}.`,
      type: 'WARNING',
      actionLink: 'emp-dashboard',
      sourceKey: `plan:${user.id}:${month}`,
    });
    if (user.managerId) bump(teamPlans, user.managerId);
  }

  // ── 4. Weekly manager digest ──────────────────────────────────────────────
  // One notification per manager per week covering all three sweeps, instead of
  // a copy of every employee alert. Only managers who are themselves active.
  const activeById = new Map(active.map((u) => [u.id, u]));
  const managerIds = new Set([...teamAssessments.keys(), ...teamPlans.keys(), ...teamCerts.keys()]);
  for (const managerId of managerIds) {
    if (!activeById.has(managerId)) continue;
    const parts: string[] = [];
    const a = teamAssessments.get(managerId) ?? 0;
    const p = teamPlans.get(managerId) ?? 0;
    const c = teamCerts.get(managerId) ?? 0;
    if (a > 0) parts.push(`${a} with assessments due`);
    if (p > 0) parts.push(`${p} with overdue development items`);
    if (c > 0) parts.push(`${c} with a certificate expiring or expired`);
    if (parts.length === 0) continue;

    const sent = await notifier.send({
      userId: managerId,
      title: 'Team compliance summary',
      message: `Your team this week: ${parts.join('; ')}.`,
      type: 'INFO',
      actionLink: 'manager-dashboard',
      sourceKey: `team:${managerId}:${week}`,
    });
    if (sent) summary.managersNotified++;
  }

  // ── 5. This month's snapshot ──────────────────────────────────────────────
  // Deliberately LAST and deliberately non-fatal: the snapshot is a record of
  // the numbers, while steps 1-4 are the work. A snapshot that fails must not
  // cost people their reminders, so it is caught and reported rather than
  // thrown. The run is still marked ok — `snapshotPeriod: null` in the stored
  // summary is what says the history has a hole.
  try {
    const snapshot = await runMonthlySnapshot({ now });
    summary.snapshotPeriod = snapshot.period;
    summary.snapshotScopes = snapshot.scopesWritten;
  } catch (err) {
    logger.error('nightly_snapshot_failed', { err: err instanceof Error ? err.message : String(err) });
  }

  const counts = notifier.counts;
  summary.notificationsCreated = counts.created;
  summary.notificationsSuppressed = counts.suppressed;
  summary.ms = Date.now() - startedMs;
  return summary;
}

// ── Run recording ───────────────────────────────────────────────────────────

let running = false;

/** True while a sweep is in flight — the manual trigger refuses to overlap. */
export function isSweepRunning(): boolean {
  return running;
}

export interface JobRunRecord {
  id: string;
  job: string;
  trigger: string;
  startedAt: string | null;
  finishedAt: string | null;
  ok: boolean | null;
  summary: SweepSummary | null;
  error: string | null;
}

/**
 * Runs the sweep and records it in `job_runs` (migration 007) whether it
 * succeeded or threw. Never rejects for a sweep failure — the caller reads
 * `ok` — so a bad night can't take the scheduler (or the API) down with it.
 */
export async function runAndRecord(trigger: 'scheduled' | 'boot' | 'manual', now?: Date): Promise<JobRunRecord> {
  if (running) throw new Error('sweep already running');
  running = true;
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  await query('INSERT INTO job_runs (id, job, trigger, started_at) VALUES ($1, $2, $3, $4)', [
    id,
    'nightly',
    trigger,
    startedAt,
  ]);

  try {
    const summary = await runNightlySweep({ now });
    await query('UPDATE job_runs SET finished_at = now(), ok = true, summary = $2 WHERE id = $1', [
      id,
      JSON.stringify(summary),
    ]);
    logger.info('nightly_sweep_ok', { trigger, ...summary });
    return { id, job: 'nightly', trigger, startedAt, finishedAt: new Date().toISOString(), ok: true, summary, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query('UPDATE job_runs SET finished_at = now(), ok = false, error = $2 WHERE id = $1', [id, message]);
    logger.error('nightly_sweep_failed', { trigger, err: message });
    return {
      id,
      job: 'nightly',
      trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: false,
      summary: null,
      error: message,
    };
  } finally {
    running = false;
  }
}
