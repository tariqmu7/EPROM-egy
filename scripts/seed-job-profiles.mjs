// One-off seed: create a Job Profile for every TITLED LEADERSHIP ROLE in the
// EPROM Head Office org chart (EPROM_Org_Hierarchy/EPROM_Org_Hierarchy_Tree.md /
// the `departments` collection), deduping same-meaning posts.
//
// Scope (decided with the product owner):
//   - INCLUDED: Chairman, Vice Chairman, the Assistant-to-President sectors,
//     every General Manager, the distinct named Assistant GMs, project managers,
//     experts, plus ONE merged profile each for the many identical
//     "General Manager / Assistant General Manager (personal capacity)" posts.
//   - EXCLUDED: pure organisational units / sections (Personnel Affairs,
//     Maintenance, etc.) — those are departments, not job titles.
//
// Dedup: the dozens of repeated "بصفة شخصية / بالإدارة" GM & AGM posts collapse
// into two canonical profiles (jp-gm-personal-capacity, jp-asstgm-personal-capacity).
//
// Each profile is one position scoped to a single `orgLevel` with an EMPTY
// `requiredSkills` list — admins attach the required skills/levels later in the
// Admin Panel. `departmentId` points at the matching org-chart node so the
// profile groups under the right unit; `description` carries the Arabic title.
//
// Auth: reuses the Firebase CLI login (same mechanism as rebuild-org-hierarchy.mjs).
//
// Behaviour: upserts the 49 leadership profiles by deterministic `jp-*` id, and
// deletes any stale `jp-*` profile no longer in this set. Random-id profiles
// (the existing engineering roles) are never touched.
//
// Usage:  node scripts/seed-job-profiles.mjs [--dry-run]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

// --- Leadership roles. Shape: [id, level, title (EN), departmentId, titleAr] ---
// `departmentId` is the org-chart node this role lives in (from the departments
// collection). The two *-personal-capacity merges sit company-wide under chairman.
const JOBS = [
  // ── Executive ──
  ['jp-chairman',      'CEO', 'Chairman & Managing Director',      'chairman',      'رئيس مجلس الإدارة والعضو المنتدب'],
  ['jp-vice-chairman', 'CEO', 'Vice Chairman of the Board',        'vice-chairman', 'نائب رئيس مجلس الإدارة'],

  // ── Assistants to the Company President (sectors) ──
  ['jp-sec-admin',   'GM', 'Assistant to Company President for Administrative Affairs',                    'sec-admin',   'مساعد رئيس الشركة للشئون الإدارية'],
  ['jp-sec-techsvc', 'GM', 'Assistant to Company President for Technical Services & Business Development', 'sec-techsvc', 'مساعد رئيس الشركة للخدمات الفنية وتنمية الأعمال'],
  ['jp-sec-fin',     'GM', 'Assistant to Company President for Financial Affairs',                         'sec-fin',     'مساعد رئيس الشركة للشئون المالية'],
  ['jp-sec-eng',     'GM', 'Assistant to Company President for Engineering Affairs',                       'sec-eng',     'مساعد رئيس الشركة للشئون الهندسية'],
  ['jp-sec-ops',     'GM', 'Assistant to Company President for Operations',                                'sec-ops',     'مساعد رئيس الشركة للعمليات'],
  ['jp-sec-tech',    'GM', 'Assistant to Company President for Technical Affairs',                         'sec-tech',    'مساعد رئيس الشركة للشئون الفنية'],
  ['jp-sec-mech',    'GM', 'Assistant to Company President for Mechanical Maintenance & Engineering Inspection', 'sec-mech', 'مساعد رئيس الشركة للصيانة الميكانيكية والتفتيش الهندسي'],

  // ── General Managers ──
  ['jp-g-hr',         'GM', 'General Manager of Human Resources',                          'g-hr',         'مدير عام الموارد البشرية'],
  ['jp-g-pr',         'GM', 'General Manager of Public Relations & General Services',       'g-pr',         'مدير عام العلاقات والخدمات العامة'],
  ['jp-g-train',      'GM', 'General Manager of Training',                                  'g-train',      'مدير عام التدريب'],
  ['jp-g-comm',       'GM', 'General Manager of Communication & Government Relations',      'g-comm',       'مدير عام الإتصال والعلاقات الحكومية'],
  ['jp-g-supply',     'GM', 'General Manager of Supplies & Contracts',                      'g-supply',     'مدير عام المهمات والعقود'],
  ['jp-g-bizdev',     'GM', 'General Manager of Business Development & External Contracting','g-bizdev',     'مدير عام تنمية الأعمال والتعاقدات الخارجية'],
  ['jp-g-fin',        'GM', 'General Manager of Financial Affairs',                         'g-fin',        'مدير عام الشئون المالية'],
  ['jp-g-iis',        'GM', 'General Manager of Integrated Information Systems',            'g-iis',        'مدير عام نظم المعلومات المتكاملة'],
  ['jp-g-techoff',    'GM', 'General Manager of Technical Office for Documents',            'g-techoff',    'مدير عام المكتب الفني للوثائق'],
  ['jp-g-techsup',    'GM', 'General Manager of Technical Support for Projects',            'g-techsup',    'مدير عام الدعم الفني للمشروعات'],
  ['jp-g-canal',      'GM', 'General Manager of Operations: Canal Cities & Sinai',          'g-canal',      'مدير عام التشغيل بمدن القناة وسيناء'],
  ['jp-g-south',      'GM', 'General Manager of Operations: Southern Region',               'g-south',      'مدير عام التشغيل بالمنطقة الجنوبية'],
  ['jp-g-west',       'GM', 'General Manager of Operations: Western Region',                'g-west',       'مدير عام التشغيل بالمنطقة الغربية'],
  ['jp-g-techfollow', 'GM', 'General Manager of Technical Follow-up, Cairo Office',         'g-techfollow', 'مدير عام المتابعة الفنية (مكتب القاهرة)'],
  ['jp-g-security',   'GM', 'General Manager of Security',                                  'g-security',   'مدير عام الأمن'],
  ['jp-g-legal',      'GM', 'General Manager of Legal Affairs',                             'g-legal',      'مدير عام الشئون القانونية'],
  ['jp-g-secretariat','GM', 'General Manager of General Secretariat & Board Chairman Secretariat', 'g-secretariat', 'مدير عام الأمانة العامة وسكرتارية رئيس مجلس الإدارة'],
  ['jp-g-medical',    'GM', 'General Manager of Medical Affairs',                           'g-medical',    'مدير عام الشئون الطبية'],
  ['jp-g-energy',     'GM', 'General Manager of Energy Rationalization',                    'g-energy',     'مدير عام ترشيد الطاقة'],
  ['jp-g-quality',    'GM', 'General Manager of Quality Systems',                           'g-quality',    'مدير عام نظم الجودة'],
  ['jp-g-psafety',    'GM', 'General Manager of Process Safety',                            'g-psafety',    'مدير عام سلامة العمليات'],
  ['jp-erc-maint-gm', 'GM', 'General Manager, General Maintenance (ERC Project)',           'p-erc-maint-gm','مدير عام بالإدارة العامة للصيانة العامة — بمشروع المصرية للتكرير'],

  // ── Distinct named Assistant General Managers ──
  ['jp-asstgm-security',        'AGM', 'Assistant General Manager, Security',                              'p-security-asstgm',      'مدير عام مساعد الأمن'],
  ['jp-asstgm-quality',         'AGM', 'Assistant General Manager, Quality Systems',                       'p-quality-asstgm',       'مدير عام مساعد نظم الجودة'],
  ['jp-asstgm-internal-audit',  'AGM', 'Assistant General Manager of Internal Audit',                      'p-asstgm-internal-audit','مدير عام مساعد المراجعة الداخلية'],
  ['jp-asstgm-hse',             'AGM', 'Assistant General Manager of Health, Safety & Environment (HSE)',  'p-asstgm-hse',           'مدير عام مساعد السلامة والصحة المهنية وحماية البيئة'],
  ['jp-asstgm-admin-followup',  'AGM', "Assistant General Manager of Administrative Follow-up",            'p-asstgm-admin-followup',"مدير عام مساعد المتابعة الإدارية لمساعدي رئيس الشركة"],
  ['jp-asstgm-csr',             'AGM', 'Assistant General Manager of Corporate Social Responsibility (CSR)','p-asstgm-csr',          'مدير عام مساعد أنشطة المسئولية المجتمعية'],
  ['jp-asstgm-cairo-admin',     'AGM', 'Assistant General Manager, Cairo Administrative Affairs',          'p-admin-asstgm-cairo',   'مدير عام مساعد الشئون الإدارية بالقاهرة'],

  // ── Project Managers ──
  ['jp-pm-sokhna',    'GM', 'Project Manager, Sokhna',                          'p-pm-sokhna',    'مدير مشروع السخنة'],
  ['jp-pm-esterenex', 'GM', 'Project Manager, Esterenex',                       'p-pm-esterenex', 'مدير مشروع الإستيرنكس'],
  ['jp-pm-amoc',      'GM', 'Project Manager, AMOC',                            'p-pm-amoc',      'مدير مشروع أموك'],
  ['jp-pm-elab',      'GM', 'Project Manager, ELAB',                            'p-pm-elab',      'مدير مشروع إيلاب'],
  ['jp-pm-midor',     'GM', 'Project Manager, MIDOR',                           'p-pm-midor',     'مدير مشروع ميدور'],
  ['jp-pm-erc',       'GM', 'Project Manager, ERC (Egyptian Refining Company)', 'p-pm-erc',       'مدير مشروع المصرية للتكرير'],

  // ── Experts (advisory grades) ──
  ['jp-expert-company-pres', 'GM',  'Expert — Company President Grade',   'p-expert-company-pres', 'خبير / رئيس شركة'],
  ['jp-expert-vice-pres',    'GM',  'Expert — Vice President Grade',      'p-expert-vice-pres',    'خبير / نائب رئيس شركة'],
  ['jp-expert-asst-pres',    'AGM', 'Expert — Assistant President Grade', 'p-expert-asst-pres',    'خبير / مساعد رئيس شركة'],

  // ── Merged same-meaning posts (deduped) ──
  ['jp-gm-personal-capacity',    'GM',  'General Manager (Personal Capacity)',           'chairman', 'مدير عام بصفة شخصية / بالإدارة'],
  ['jp-asstgm-personal-capacity','AGM', 'Assistant General Manager (Personal Capacity)', 'chairman', 'مدير عام مساعد بصفة شخصية / بالإدارة'],
];

function toRecord([id, level, title, departmentId, titleAr]) {
  return {
    id,
    title,
    description: titleAr,
    departmentId,
    orgLevel: level,
    requiredSkills: JSON.stringify([]),
  };
}

// --- Firebase CLI token (mirrors rebuild-org-hierarchy.mjs) ---
async function getToken() {
  const globalRoot = execSync('npm root -g').toString().trim();
  const authPath = path.join(globalRoot, 'firebase-tools', 'lib', 'auth.js');
  const auth = await import(pathToFileURL(authPath).href);
  const account = auth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error('No Firebase CLI login found. Run `firebase login` first.');
  }
  const tok = await auth.getAccessToken(account.tokens.refresh_token, [
    'https://www.googleapis.com/auth/cloud-platform',
  ]);
  return { token: tok.access_token, email: account.user?.email };
}

function fields(rec) {
  const f = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v !== undefined) f[k] = { stringValue: String(v) };
  }
  return f;
}

async function listExisting(token) {
  const ids = new Set();
  let pageToken;
  do {
    const url = new URL(`${BASE}/jobProfiles`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`list failed ${res.status}: ${await res.text()}`);
    const json = await res.json();
    for (const d of json.documents || []) ids.add(d.name.split('/').pop());
    pageToken = json.nextPageToken;
  } while (pageToken);
  return ids;
}

async function batchWrite(token, writes) {
  for (let i = 0; i < writes.length; i += 400) {
    const chunk = writes.slice(i, i + 400);
    const res = await fetch(`${BASE}:batchWrite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ writes: chunk }),
    });
    if (!res.ok) throw new Error(`batchWrite failed ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const errs = (json.status || []).filter(s => s.code && s.code !== 0);
    if (errs.length) throw new Error(`batchWrite partial errors: ${JSON.stringify(errs)}`);
    console.log(`  ✓ committed ${chunk.length} writes`);
  }
}

async function main() {
  const records = JOBS.map(toRecord);
  const newIds = new Set(records.map(r => r.id));
  if (newIds.size !== records.length) throw new Error('Duplicate job-profile id in JOBS.');
  console.log(`→ Prepared ${records.length} leadership job profiles.`);

  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);

  const existing = await listExisting(token);
  // Only ever delete our own seeded `jp-*` profiles — never the random-id ones.
  const toDelete = [...existing].filter(id => id.startsWith('jp-') && !newIds.has(id));
  console.log(`→ Existing profiles: ${existing.size}. Stale jp-* to delete: ${toDelete.length}. To upsert: ${records.length}.`);

  if (DRY_RUN) {
    console.log('— DRY RUN — no writes.');
    records.forEach(r => console.log(`  upsert ${r.id} ← dept ${r.departmentId}  | ${r.orgLevel}  | ${r.title}`));
    console.log('Delete:', toDelete.join(', ') || '(none)');
    return;
  }

  const writes = [];
  for (const r of records) {
    writes.push({ update: { name: `${DOC_PATH}/jobProfiles/${r.id}`, fields: fields(r) } });
  }
  for (const id of toDelete) {
    writes.push({ delete: `${DOC_PATH}/jobProfiles/${id}` });
  }

  console.log(`→ Committing ${writes.length} writes…`);
  await batchWrite(token, writes);
  console.log('✓ Job profiles seeded.');
}

main().catch(err => { console.error('✖ Seed failed:', err.message || err); process.exit(1); });
