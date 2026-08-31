// BD / External-Contracts import, step 8 — BACK-FILL the monthly snapshots.
//
//   npx tsx scripts/etl/bd-ec/backfill-snapshots.mts [--dry-run] [--purge]
//
// AdminAnalytics' trend chart reads `competency_snapshots`, which only the
// nightly sweep writes — and only ever for the CURRENT month. The app never
// back-fills, on purpose: assessing somebody today must not make last June look
// better than it was.
//
// The demo history loaded in task 6 lands in three dated waves (16 Jun / 15 Jul
// / 12 Aug), so an honest past DOES exist in the records — it just was never
// snapshotted, because the system was not running then. This script writes it
// the only way that stays honest:
//
//   • the maths is `runMonthlySnapshot` itself, NOT a copy — same coverage
//     split, same roll-up, same NULL-when-nothing-known rule;
//   • only the INPUTS are moved back in time: an as-of ScoringIndex whose
//     assessments (`date`) and APPROVED evidence (`reviewedAt`) are filtered to
//     the month end, exactly as scripts/etl/bd-ec/dump_gaps.mts does for the
//     development plans. June's row therefore knows nothing of the July wave.
//
// Two things it does NOT pretend:
//   • the roster, job profiles and requirements are TODAY's — a person hired or
//     re-profiled since June is counted in June under their current profile.
//     Nothing in the data records what a profile said in June, so this is the
//     honest limit of the back-fill, and it is stated in each row's `detail`.
//   • every written row carries detail.demo = true and detail.backfilled, so a
//     back-filled point is distinguishable from one the job took live, and
//     --purge removes exactly those rows and nothing else.
//
// The CURRENT month is deliberately NOT back-filled: the nightly sweep (or
// POST /jobs/run) writes it live and is the real thing.
import 'dotenv/config';
import { query } from '../../../src/db.js';
import { loadAnalyticsModel } from '../../../src/analytics/model.js';
import { runMonthlySnapshot } from '../../../src/jobs/snapshots.js';
import { monthKey } from '../../../src/jobs/scheduling.js';
import { pairKey, type AssessmentLike, type ScoringIndex } from '../../../src/jobs/scoring.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const PURGE = args.includes('--purge');

// Month ENDS, local time — monthKey() reads local getFullYear/getMonth, so a
// local end-of-month is the value that labels the row correctly.
const MONTHS = [
  new Date(2026, 5, 30, 23, 59, 59), // June 2026 — after the 16 Jun wave only
  new Date(2026, 6, 31, 23, 59, 59), // July 2026 — after the 15 Jul wave
];

const NOTE =
  'DEMO DATA - back-filled from dated assessment/evidence records, not taken live by the nightly job. ' +
  'Roster and job profiles are as they stand today; only the scoring inputs were filtered to the month end.';

if (PURGE) {
  const { rowCount } = await query(
    `DELETE FROM competency_snapshots WHERE detail->>'backfilled' = 'true'`,
  );
  console.log(`Purged ${rowCount ?? 0} back-filled snapshot rows (live job rows untouched).`);
  process.exit(0);
}

const model = await loadAnalyticsModel();

// Raw rows, because the model's index carries no dates for evidence.
const assessmentRows = (await query('SELECT id, data FROM assessments')).rows as { data: any }[];
const evidenceRows = (await query('SELECT id, data FROM evidences')).rows as { data: any }[];

/** The live index with its assessments and evidence cut off at `asOf`. */
function indexAsOf(asOf: string): ScoringIndex {
  const assessments = new Map<string, AssessmentLike[]>();
  for (const { data } of assessmentRows) {
    if (data.isArchived) continue;
    const subject = data.subjectId ? String(data.subjectId) : '';
    const skillId = data.skillId ? String(data.skillId) : '';
    const date = data.date ? String(data.date) : '';
    if (!subject || !skillId) continue;
    // Undated ⇒ cannot be placed in time, so it is excluded from a dated view
    // rather than silently treated as older than every cut-off.
    if (!date || date > asOf) continue;
    const key = pairKey(subject, skillId);
    const list = assessments.get(key) ?? [];
    list.push({
      type: data.type ? String(data.type) : undefined,
      raterId: data.raterId ? String(data.raterId) : '',
      score: Number(data.score ?? 0),
      date,
    });
    assessments.set(key, list);
  }

  const evidenceScores = new Map<string, number[]>();
  for (const { data } of evidenceRows) {
    if (data.status !== 'APPROVED') continue;
    const userId = data.userId ? String(data.userId) : '';
    const skillId = data.skillId ? String(data.skillId) : '';
    const score = Number(data.assignedScore ?? 0);
    // An evidence scores from the moment it was APPROVED, not submitted.
    const at = data.reviewedAt ? String(data.reviewedAt) : '';
    if (!userId || !skillId || !score) continue;
    if (!at || at > asOf) continue;
    const key = pairKey(userId, skillId);
    const list = evidenceScores.get(key) ?? [];
    list.push(score);
    evidenceScores.set(key, list);
  }

  // Work experience carries no verification date in the demo data; it is left
  // as-is (a provisional level is a standing fact, not an event).
  return { ...model.index, assessments, evidenceScores };
}

for (const when of MONTHS) {
  const period = monthKey(when);
  const asOf = new Date(when.getTime()).toISOString();
  const index = indexAsOf(asOf);

  let measured = 0;
  for (const list of index.assessments.values()) measured += list.length;
  let evidences = 0;
  for (const list of index.evidenceScores.values()) evidences += list.length;

  if (DRY) {
    console.log(
      `${period}  as-of ${asOf}  would score on ${measured} assessments + ${evidences} approved evidences (dry run, nothing written)`,
    );
    continue;
  }

  const summary = await runMonthlySnapshot({
    now: when,
    index,
    detailExtra: { demo: true, backfilled: true, asOf, note: NOTE },
  });
  console.log(
    `${period}  scopes ${summary.scopesWritten}  people with requirements ${summary.withRequirements}  ` +
      `inputs ${measured} assessments / ${evidences} evidences  (${summary.ms} ms)`,
  );
}

if (!DRY) {
  const { rows } = await query(
    `SELECT period, scope_id, headcount, required, measured, unknown, compliance_pct, avg_gap
       FROM competency_snapshots
      WHERE scope_type = 'COMPANY' ORDER BY period`,
  );
  console.log('\nCompany trend now stored:');
  for (const r of rows) {
    console.log(
      `  ${r.period}  headcount ${r.headcount}  measured ${r.measured}/${r.required}  ` +
        `unknown ${r.unknown}  compliance ${r.compliance_pct ?? '—'}%  avg gap ${r.avg_gap ?? '—'}`,
    );
  }
  console.log(
    `\nCurrent month is NOT back-filled — run the nightly sweep (POST /jobs/run) to take it live.`,
  );
}

process.exit(0);
