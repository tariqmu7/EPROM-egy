// ─────────────────────────────────────────────────────────────────────────────
// Referential-integrity reporter (addresses finding F-8).
//
// The schema deliberately has NO foreign keys: dangling references are tolerated
// and dropped at read time (a jobProfile.requiredSkills entry pointing at a
// deleted skill, a managerId pointing at a removed user, imported rows that cite
// never-migrated ids). That's a reasonable stance for a migration-era system —
// but it means orphans accumulate silently. This READ-ONLY report surfaces them
// so they can be reconciled deliberately instead of never being seen.
//
//   cd server && npm run integrity            # print the report
//   cd server && npm run integrity -- --strict # exit 1 if anything dangles (CI/cron)
//
// It reports only; it never deletes or rewrites data.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import { getPool, query } from '../src/db.js';

interface Ref {
  from: string; // SQL table identifier (camelCase tables are quoted)
  field: string; // JSON field on the source document holding the reference
  to: string; // SQL table identifier of the referenced collection
  label: string; // human-readable description
}

// Single-value references keyed by id. A target id is considered present if it
// matches EITHER the table `id` OR the document's canonical `data->>'id'`, since
// post-migration those can differ — matching both avoids false positives.
const REFS: Ref[] = [
  { from: 'users', field: 'departmentId', to: 'departments', label: 'user → department' },
  { from: 'users', field: 'generalDepartmentId', to: 'departments', label: 'user → general department' },
  { from: 'users', field: 'managerId', to: 'users', label: 'user → manager' },
  { from: 'users', field: 'jobProfileId', to: '"jobProfiles"', label: 'user → job profile' },
  { from: '"jobProfiles"', field: 'departmentId', to: 'departments', label: 'job profile → department' },
  { from: 'departments', field: 'parentId', to: 'departments', label: 'department → parent' },
  { from: 'departments', field: 'managerId', to: 'users', label: 'department → manager' },
  { from: 'assessments', field: 'subjectId', to: 'users', label: 'assessment → subject' },
  { from: 'assessments', field: 'raterId', to: 'users', label: 'assessment → rater' },
  { from: 'assessments', field: 'skillId', to: 'skills', label: 'assessment → skill' },
  { from: 'evidences', field: 'userId', to: 'users', label: 'evidence → user' },
  { from: 'evidences', field: 'skillId', to: 'skills', label: 'evidence → skill' },
  { from: 'notifications', field: 'userId', to: 'users', label: 'notification → user' },
];

interface Dangling {
  label: string;
  count: number;
  samples: { rowId: string; ref: string }[];
}

async function checkSingle(ref: Ref): Promise<Dangling> {
  // `field`, `from`, `to` are all fixed constants from REFS above (never user
  // input), so interpolating them into the SQL is safe.
  const sql = `
    SELECT src.id AS row_id, src.data->>'${ref.field}' AS ref
    FROM ${ref.from} src
    WHERE src.data->>'${ref.field}' IS NOT NULL
      AND src.data->>'${ref.field}' <> ''
      AND NOT EXISTS (
        SELECT 1 FROM ${ref.to} t
        WHERE t.id = src.data->>'${ref.field}'
           OR t.data->>'id' = src.data->>'${ref.field}'
      )
  `;
  const { rows } = await query(sql);
  return {
    label: ref.label,
    count: rows.length,
    samples: rows.slice(0, 5).map((r) => ({ rowId: String(r.row_id), ref: String(r.ref) })),
  };
}

// jobProfiles.requiredSkills[].skillId → skills (array reference).
async function checkRequiredSkills(): Promise<Dangling> {
  const sql = `
    SELECT jp.id AS row_id, elem->>'skillId' AS ref
    FROM "jobProfiles" jp
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(jp.data->'requiredSkills', '[]'::jsonb)) elem
    WHERE elem->>'skillId' IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM skills s
        WHERE s.id = elem->>'skillId' OR s.data->>'id' = elem->>'skillId'
      )
  `;
  const { rows } = await query(sql);
  return {
    label: 'job profile → required skill',
    count: rows.length,
    samples: rows.slice(0, 5).map((r) => ({ rowId: String(r.row_id), ref: String(r.ref) })),
  };
}

async function main(): Promise<void> {
  const strict = process.argv.includes('--strict');
  const results: Dangling[] = [];

  for (const ref of REFS) {
    try {
      results.push(await checkSingle(ref));
    } catch (e) {
      console.error(`  ! could not check ${ref.label}: ${(e as Error).message}`);
    }
  }
  try {
    results.push(await checkRequiredSkills());
  } catch (e) {
    console.error(`  ! could not check job profile → required skill: ${(e as Error).message}`);
  }

  const problems = results.filter((r) => r.count > 0);
  const totalDangling = problems.reduce((n, r) => n + r.count, 0);

  console.log('\nReferential-integrity report');
  console.log('════════════════════════════');
  if (problems.length === 0) {
    console.log('✓ No dangling references found across', results.length, 'relationships.');
  } else {
    for (const p of problems) {
      console.log(`\n✗ ${p.label}: ${p.count} dangling`);
      for (const s of p.samples) {
        console.log(`    row ${s.rowId} → missing "${s.ref}"`);
      }
      if (p.count > p.samples.length) console.log(`    … and ${p.count - p.samples.length} more`);
    }
    console.log(`\n${totalDangling} dangling reference(s) across ${problems.length} relationship(s).`);
    console.log('These are dropped at read time; reconcile them before adding foreign keys.');
  }

  // Close the pool so the process can exit cleanly.
  const pool = getPool() as unknown as { end?: () => Promise<void> };
  await pool.end?.();

  process.exit(strict && totalDangling > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('integrity check failed:', err);
  process.exit(1);
});
