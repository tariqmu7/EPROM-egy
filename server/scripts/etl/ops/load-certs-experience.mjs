// Operations (Canal Cities & Sinai) demo data, phase 3 task 3 - LOAD the
// invented certificates and the invented external work experience.
//
//   node scripts/etl/ops/load-certs-experience.mjs [--dry-run] [--purge]
//
// Reads data/ops/certificates.json + workExperiences.json (written by
// generate_certs_experience.py). Idempotent: a certificate id is
// `cert-<userId>-<award>` and an experience id `we-<userId>-<employer>`, so a
// re-run replaces what this loader owns instead of doubling anybody's file.
//
// THESE ARE INVENTED RECORDS FOR INVENTED PEOPLE - every issuer and employer
// carries "(DEMO)" and every credential id starts with DEMO-. `--purge` removes
// exactly what this loader owns (`cert-u-9…` inside the invented users'
// documents, `we-u-9…` rows) and NOTHING else, so a real person's certificates
// and the BD / External-Contracts demo data next door both survive it.
//
// Two shapes matter and are easy to get wrong:
//
//   * `users.certificates` is a JSON **STRING** on the wire (store.ts
//     preparePayload stringifies it), so the merge parses whatever is there,
//     keeps every certificate this loader does not own, and writes a string
//     back. Same for `workExperiences.skills`.
//   * every `fileUrl` inside `users.certificates` is policed by the server
//     (schemas.ts ATTACHMENT_MIME). A text/plain attachment would load fine
//     here and then 422 the NEXT edit of that person's profile, so it is
//     refused up front.
//
// Refuses on: an unknown or non-invented owner; a missing DEMO marker; an id
// this loader does not own; a duplicate id; an attachment that is not a PDF
// data URL; a skill that is not live; a `renewalStatus` that disagrees with its
// own expiry date (the nightly sweep would re-band it on its first run); a
// verdict on a record that is not VERIFIED, or a VERIFIED record with no
// verdict; a verified level above the policy cap; a reviewer who does not
// exist; or an id already held by somebody else's record.
import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'data', 'ops');
const dryRun = process.argv.includes('--dry-run');
const purge = process.argv.includes('--purge');

// DEFAULT_WORK_EXPERIENCE_POLICY.maxProvisionalLevel — nobody is credited above
// this from tenure alone.
const MAX_PROVISIONAL = 3;

const certificates = JSON.parse(readFileSync(join(DATA, 'certificates.json'), 'utf8'));
const experiences = JSON.parse(readFileSync(join(DATA, 'workExperiences.json'), 'utf8'));

const client = new pg.Client({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5433),
  user: process.env.PGUSER ?? 'cms',
  password: process.env.PGPASSWORD ?? 'cms-local-pass',
  database: process.env.PGDATABASE ?? 'eprom_cms',
});
await client.connect();

const users = new Map((await client.query('select id, data from users')).rows.map((r) => [r.id, r.data]));
const liveSkills = new Set(
  (await client.query(`select id from skills where data->>'isArchived' is distinct from 'true'`))
    .rows.map((r) => r.id)
);
const ownerOfExperience = new Map(
  (await client.query(`select id, data->>'userId' s from "workExperiences"`)).rows.map((r) => [r.id, r.s])
);

const isInvented = (id) => users.get(id)?.isTestData === true;

// A certificates field written by the app is a JSON string; one written by an
// older ETL could be a real array. Read both, and never guess at a value that
// will not parse - overwriting it would destroy somebody's file.
const readList = (value, label, problems) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    problems.push(`${label}: existing certificates are not readable JSON - refusing to overwrite them`);
    return null;
  }
};

/** server/src/jobs/scheduling.ts certificateStatus, in whole days. */
const renewalStatus = (expiryDate, now) => {
  const diffDays = Math.ceil((new Date(expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'EXPIRED';
  if (diffDays <= 90) return 'EXPIRING_SOON';
  return 'VALID';
};

const now = new Date();
const problems = [];

const certIds = new Set();
for (const row of certificates) {
  if (!users.has(row.userId)) problems.push(`${row.userId}: user does not exist`);
  else if (!isInvented(row.userId)) problems.push(`${row.userId}: not invented test data - a real person must never receive demo certificates`);
  if (!Array.isArray(row.certificates) || row.certificates.length === 0) {
    problems.push(`${row.userId}: no certificates in the file`);
    continue;
  }
  for (const cert of row.certificates) {
    const id = String(cert.id ?? '');
    if (!id.startsWith(`cert-${row.userId}-`)) problems.push(`${id || '(no id)'}: not an id this loader owns for ${row.userId}`);
    if (certIds.has(id)) problems.push(`${id}: duplicate certificate id`);
    certIds.add(id);
    if (!String(cert.issuer ?? '').includes('(DEMO)')) problems.push(`${id}: issuer carries no DEMO marker`);
    if (!String(cert.credentialId ?? '').startsWith('DEMO-')) problems.push(`${id}: credentialId carries no DEMO marker`);
    if (!String(cert.fileUrl ?? '').startsWith('data:application/pdf;base64,')) {
      problems.push(`${id}: attachment is not an allowlisted PDF data URL (it would 422 the next profile edit)`);
    }
    if (cert.expiryDate) {
      const expected = renewalStatus(cert.expiryDate, now);
      if (cert.renewalStatus !== expected) {
        problems.push(`${id}: renewalStatus ${cert.renewalStatus} disagrees with its expiry ${cert.expiryDate} (should be ${expected})`);
      }
    } else if (cert.noExpiry !== true) {
      problems.push(`${id}: no expiry date and not marked noExpiry`);
    }
  }
}

const experienceIds = new Set();
for (const entry of experiences) {
  const id = String(entry.id ?? '');
  if (!id.startsWith(`we-${entry.userId}-`)) problems.push(`${id || '(no id)'}: not an id this loader owns for ${entry.userId}`);
  if (experienceIds.has(id)) problems.push(`${id}: duplicate work-experience id`);
  experienceIds.add(id);
  if (!users.has(entry.userId)) problems.push(`${id}: user ${entry.userId} does not exist`);
  else if (!isInvented(entry.userId)) problems.push(`${id}: ${entry.userId} is not invented test data`);
  if (!String(entry.employer ?? '').includes('(DEMO)')) problems.push(`${id}: employer carries no DEMO marker`);
  if (!['PENDING', 'VERIFIED', 'REJECTED'].includes(entry.status)) problems.push(`${id}: bad status ${entry.status}`);
  if (!entry.startDate || !entry.endDate || entry.startDate >= entry.endDate) problems.push(`${id}: employment dates are not in order`);
  if (!entry.submittedAt) problems.push(`${id}: no submittedAt`);

  // A submission never carries its own verdict (authz.ts): reviewer fields
  // belong to the reviewer, and only a VERIFIED record credits a level.
  if (entry.status === 'PENDING' && (entry.reviewedBy || entry.reviewedAt)) {
    problems.push(`${id}: a PENDING record must not carry reviewer fields`);
  }
  if (entry.status !== 'PENDING') {
    if (!entry.reviewedBy) problems.push(`${id}: a ${entry.status} record must name its reviewer`);
    else if (!users.has(entry.reviewedBy)) problems.push(`${id}: reviewer ${entry.reviewedBy} does not exist`);
    if (entry.reviewedBy === entry.userId) problems.push(`${id}: reviewed by its own subject`);
  }

  if (!Array.isArray(entry.skills) || entry.skills.length === 0) problems.push(`${id}: no tagged skills`);
  for (const skill of entry.skills ?? []) {
    if (!liveSkills.has(skill.skillId)) problems.push(`${id}: ${skill.skillId} is not a live skill`);
    if (!(skill.claimedLevel >= 1 && skill.claimedLevel <= 5)) problems.push(`${id}: claimedLevel outside 1-5`);
    if (!(skill.yearsApplied > 0)) problems.push(`${id}: yearsApplied must be positive`);
    const hasVerdict = skill.verifiedLevel != null;
    if ((entry.status === 'VERIFIED') !== hasVerdict) {
      problems.push(`${id}: ${entry.status} record with${hasVerdict ? '' : 'out'} a verifiedLevel on ${skill.skillId}`);
    }
    if (hasVerdict && !(skill.verifiedLevel >= 1 && skill.verifiedLevel <= MAX_PROVISIONAL)) {
      problems.push(`${id}: verifiedLevel ${skill.verifiedLevel} above the policy cap of ${MAX_PROVISIONAL}`);
    }
  }

  const owner = ownerOfExperience.get(id);
  if (owner && owner !== entry.userId) problems.push(`${id}: id already holds ${owner}'s record, not ${entry.userId}'s`);
}

// Read every target document once, so a malformed existing certificates field
// is a refusal rather than a half-finished merge.
const merges = new Map();
if (!purge) {
  for (const row of certificates) {
    const data = users.get(row.userId);
    if (!data) continue;
    const existing = readList(data.certificates, `${row.userId}.certificates`, problems);
    if (existing === null) continue;
    const kept = existing.filter((cert) => !String(cert?.id ?? '').startsWith(`cert-${row.userId}-`));
    merges.set(row.userId, { data, kept, next: [...kept, ...row.certificates] });
  }
}

if (problems.length) {
  console.error('REFUSING: %d problem(s):', problems.length);
  for (const m of problems.slice(0, 40)) console.error('  -', m);
  await client.end();
  process.exit(1);
}

if (dryRun) {
  const newE = experiences.filter((e) => !ownerOfExperience.has(e.id)).length;
  const kept = [...merges.values()].reduce((n, m) => n + m.kept.length, 0);
  console.log(`dry run: ${certIds.size} demo certificates across ${certificates.length} people ` +
              `(${kept} existing certificate(s) of theirs kept); ` +
              `${experiences.length} work-experience records ${newE} new / ${experiences.length - newE} updated ` +
              `(table holds ${ownerOfExperience.size})`);
  await client.end();
  process.exit(0);
}

await client.query('BEGIN');

if (purge) {
  const deleted = await client.query(`delete from "workExperiences" where id like 'we-u-9%'`);
  let removed = 0;
  const stuck = [];
  for (const [id, data] of users) {
    if (!isInvented(id)) continue;
    const existing = readList(data.certificates, `${id}.certificates`, stuck);
    if (existing === null || existing.length === 0) continue;
    const kept = existing.filter((cert) => !String(cert?.id ?? '').startsWith('cert-u-9'));
    if (kept.length === existing.length) continue;
    await client.query(
      'update users set data = $2, version = version + 1, updated_at = now() where id = $1',
      [id, { ...data, certificates: JSON.stringify(kept) }]
    );
    removed += existing.length - kept.length;
  }
  await client.query('COMMIT');
  console.log(`purged ${removed} invented certificates and ${deleted.rowCount} invented work-experience records`);
  for (const m of stuck) console.log(`  left alone - ${m}`);
  await client.end();
  process.exit(0);
}

let loadedCerts = 0;
for (const [userId, merge] of merges) {
  await client.query(
    'update users set data = $2, version = version + 1, updated_at = now() where id = $1',
    [userId, { ...merge.data, certificates: JSON.stringify(merge.next) }]
  );
  loadedCerts += merge.next.length - merge.kept.length;
}

const stamp = new Date().toISOString();
let created = 0;
let updated = 0;
for (const entry of experiences) {
  // `skills` goes to the DB as a STRING, exactly as the app writes it.
  const doc = { ...entry, skills: JSON.stringify(entry.skills), createdAt: entry.createdAt ?? stamp, updatedAt: stamp };
  const r = await client.query(
    `INSERT INTO "workExperiences" (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING (xmax = 0) AS inserted`,
    [entry.id, doc]
  );
  if (r.rows[0].inserted) created++; else updated++;
}
await client.query('COMMIT');

console.log(`certificates:    ${loadedCerts} loaded across ${merges.size} people`);
console.log(`work experience: ${created} created, ${updated} updated`);

// What the screens will now show. A load that produced no expiring and no
// expired certificate would leave the renewal banding and the nightly warnings
// with nothing to say, which is the whole point of this step.
const bands = await client.query(
  `select coalesce(c->>'renewalStatus', 'no expiry') band, count(*) n
   from users u, jsonb_array_elements((u.data->>'certificates')::jsonb) c
   where u.data->>'isTestData' = 'true' and c->>'id' like 'cert-u-9%'
   group by 1 order by 2 desc`
);
console.log('certificate renewal bands:');
for (const r of bands.rows) console.log(`  ${String(r.band).padEnd(14)} ${r.n}`);

const pendingCerts = await client.query(
  `select count(*) n from users u, jsonb_array_elements((u.data->>'certificates')::jsonb) c
   where u.data->>'isTestData' = 'true' and c->>'id' like 'cert-u-9%' and c->>'status' = 'PENDING'`
);
console.log(`  awaiting a supervisor's approval: ${pendingCerts.rows[0].n}`);

const byStatus = await client.query(
  `select data->>'status' status, count(*) n from "workExperiences" where id like 'we-u-9%' group by 1 order by 1`
);
console.log('work experience by status:');
for (const r of byStatus.rows) console.log(`  ${String(r.status).padEnd(10)} ${r.n}`);

// The provisional credit this load creates: a VERIFIED skill that nothing has
// measured. It counts as KNOWN, never as MEASURED - so it must stay a small
// share of the roster's requirements, or the coverage figures lose their
// meaning.
const provisional = await client.query(
  `with tagged as (
     select w.data->>'userId' uid, s->>'skillId' sid
     from "workExperiences" w, jsonb_array_elements((w.data->>'skills')::jsonb) s
     where w.id like 'we-u-9%' and w.data->>'status' = 'VERIFIED' and s->>'verifiedLevel' is not null
   )
   select count(*) tagged,
          count(*) filter (
            where not exists (select 1 from assessments a
                              where a.data->>'subjectId' = t.uid and a.data->>'skillId' = t.sid)
              and not exists (select 1 from evidences e
                              where e.data->>'userId' = t.uid and e.data->>'skillId' = t.sid
                                and e.data->>'status' = 'APPROVED' and e.data->>'assignedScore' is not null)
          ) provisional
   from tagged t`
);
const { tagged, provisional: prov } = provisional.rows[0];
console.log(`verified experience tags: ${tagged}, of which ${prov} become PROVISIONAL scores ` +
            `(the rest are already measured, so a real record wins)`);

await client.end();
