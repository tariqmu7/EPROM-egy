// Seed an AGM head profile + a DM (Department Manager) profile for EVERY
// ASSISTANT_GENERAL organisational unit in the EPROM org chart, into the live
// `jobProfiles` collection.
//
// Why: per the product decision, every AGM unit (`d-*` ASSISTANT_GENERAL box in
// scripts/rebuild-org-hierarchy.mjs / the `departments` collection) must carry
// BOTH:
//   - an AGM job profile — the unit head (ASSISTANT_GENERAL → AGM), and
//   - a DM job profile  — the department-manager band directly below the AGM
//     (AGM → DM → SH → SP → JP → FR).
// The DM is NOT its own org-chart box; like the SP/JP/FR sub-positions it is a
// position that lives inside the unit's node.
//
// Skills: following the same convention as the leadership seed
// (scripts/seed-job-profiles.mjs), the profiles created here have an EMPTY
// `requiredSkills` list — admins attach the required skills/levels per unit in
// the Admin Panel (or a dedicated per-unit seed, as done for Business
// Development & Marketing Programs). This script never creates or modifies skills.
//
// Already-authored units are NOT touched:
//   - d-bizdev-mkt — AGM `bizdev-mkt-sp` (seed-bizdev-mkt-profile.mjs) +
//                    DM  `bizdev-mkt-dm` (seed-bizdev-mkt-dm.mjs)
//   - d-bizdev-ext — AGM `bizdev-ext-sp` (seed-bizdev-ext-profile.mjs)
// See SKIP below — those (id, level) pairs are excluded so this seed never
// duplicates or overwrites the authored, skill-bearing profiles.
//
// Behaviour: idempotent upsert by deterministic id (`agm-<unit>`, `dm-<unit>`).
// Re-running overwrites only those profiles and never deletes anything. The ids
// avoid the `jp-` prefix so the leadership seed (which deletes stale `jp-*`
// profiles) can never remove them.
//
// Auth: reuses the Firebase CLI login (same mechanism as seed-job-profiles.mjs).
//
// Usage:  node scripts/seed-agm-dm-profiles.mjs [--dry-run]

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`;
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;

// Five identical ASSISTANT_GENERAL sub-units under each regional Operations GM
// (mirrors REGIONAL() in scripts/rebuild-org-hierarchy.mjs).
const REGIONAL = (p) => [
  [`d-${p}-ops`,   'التشغيل', 'Operations'],
  [`d-${p}-maint`, 'الصيانة', 'Maintenance'],
  [`d-${p}-insp`,  'التفتيش الهندسي والتآكل', 'Engineering Inspection & Corrosion'],
  [`d-${p}-hse`,   'السلامة والصحة المهنية وحماية البيئة والجودة', 'HSE & Quality'],
  [`d-${p}-lab`,   'المعامل الكيميائية', 'Chemical Laboratories'],
];

// Every ASSISTANT_GENERAL unit: [departmentId, titleAr, titleEn].
// Mirrors the org chart in scripts/rebuild-org-hierarchy.mjs (the single source
// of truth). Keep in sync if units are added/removed there.
const UNITS = [
  // GM of Human Resources
  ['d-hr-org',  'التنظيم وتخطيط القوى العاملة', 'Organization & Workforce Planning'],
  ['d-hr-pers', 'شئون العاملين', 'Personnel Affairs'],
  ['d-hr-ent',  'الإستحقاقات', 'Entitlements'],
  ['d-hr-ins',  'التأمينات الاجتماعية والمعاشات', 'Social Insurance & Pensions'],
  // GM of Public Relations & General Services
  ['d-pr-pr',  'العلاقات العامة', 'Public Relations'],
  ['d-pr-adm', 'الخدمات الإدارية', 'Administrative Services'],
  // GM of Training
  ['d-train-prep', 'إعداد وتخطيط التدريب', 'Training Preparation & Planning'],
  ['d-train-rd',   'البحوث وتطوير التدريب', 'Research & Training Development'],
  // GM of Communication & Government Relations
  ['d-comm-comm', 'الإتصال', 'Communication'],
  ['d-comm-gov',  'العلاقات الحكومية', 'Government Relations'],
  // GM of Supplies & Contracts
  ['d-supply-purch', 'المشتريات', 'Purchasing'],
  ['d-supply-wh',    'المخازن', 'Warehouses'],
  ['d-supply-contr', 'العقود', 'Contracts'],
  // GM of Business Development & External Contracting
  ['d-bizdev-mkt', 'تنمية الأعمال وبرامج التسويق', 'Business Development & Marketing Programs'],
  ['d-bizdev-ext', 'العقود والعروض الخارجية ومتابعة عقود المشروعات', 'External Contracts/Bids & Project Contract Follow-up'],
  // GM of Financial Affairs
  ['d-fin-cost', 'التكاليف ومراقبة المشروعات والمقبوضات', 'Costs, Project Control & Receivables'],
  ['d-fin-acct', 'الحسابات والموازنة', 'Accounts & Budget'],
  ['d-fin-wage', 'الأجور وإستحقاقات العاملين', 'Wages & Employee Entitlements'],
  ['d-fin-tax',  'التمويل والضرائب', 'Finance & Taxes'],
  ['d-fin-pay',  'المدفوعات', 'Payments'],
  // GM of Integrated Information Systems
  ['d-iis-infra', 'البنية التحتية والشبكات وتشغيل وصيانة الأجهزة', 'Infrastructure, Networks & Hardware Operation/Maintenance'],
  ['d-iis-db',    'قواعد المعلومات والبرمجيات', 'Databases & Software'],
  ['d-iis-cairo', 'البرمجيات وصيانة الأجهزة والشبكات بالقاهرة', 'Software & Hardware/Network Maintenance (Cairo)'],
  // GM of Technical Office for Documents
  ['d-techoff-eng',  'المكتب الفني للشئون الهندسية', 'Technical Office, Engineering Affairs'],
  ['d-techoff-ctrl', 'المكتب الفني لنظم التحكم', 'Technical Office, Control Systems'],
  ['d-techoff-insp', 'المكتب الفني للتفتيش الهندسي (الدعم الفني)', 'Technical Office, Engineering Inspection (Technical Support)'],
  // GM of Technical Support for Projects
  ['d-techsup-util', 'الدعم الفني للمرافق والمستودعات', 'Technical Support for Utilities & Storage'],
  ['d-techsup-ops',  'الدعم الفني للعمليات', 'Technical Support for Operations'],
  ['d-techsup-perf', 'الدعم الفني لمتابعة تقييم الأداء وبرامج العمل', 'Technical Support for Performance Evaluation & Work Programs'],
  // Regional Operations GMs (Canal Cities & Sinai, Southern, Western)
  ...REGIONAL('canal'),
  ...REGIONAL('south'),
  ...REGIONAL('west'),
  // GM of Technical Follow-up (Cairo Office)
  ['d-tf-studies', 'الدراسات الفنية', 'Technical Studies'],
  ['d-tf-eng',     'متابعة الشئون الهندسية', 'Engineering Affairs Follow-up'],
  // GM of Legal Affairs
  ['d-legal-lit', 'القضايا', 'Litigation'],
  ['d-legal-inv', 'التحقيقات', 'Investigations'],
  // GM of General Secretariat & Board Chairman Secretariat
  ['d-sec-board', 'الأمانة العامة لمجلس الإدارة', 'General Secretariat of the Board'],
  ['d-sec-chair', 'سكرتارية رئيس مجلس الإدارة', "Board Chairman's Secretariat"],
  // GM of Medical Affairs
  ['d-med-prev', 'الطب الوقائي', 'Preventive Medicine'],
  ['d-med-cur',  'الطب العلاجي', 'Curative Medicine'],
  // GM of Energy Rationalization
  ['d-energy-impl',    'تنفيذ مشروعات رفع كفاءة الطاقة', 'Energy Efficiency Project Implementation'],
  ['d-energy-studies', 'دراسات رفع كفاءة الطاقة', 'Energy Efficiency Studies'],
  // GM of Process Safety
  ['d-ps-tech', 'السلامة الفنية ومنع الخسائر', 'Technical Safety & Loss Prevention'],
  ['d-ps-ops',  'السلامة التشغيلية', 'Operational Safety'],
];

// Profiles already authored elsewhere (with real skills) — never duplicate them.
// Keyed by the profile id this seed WOULD have generated.
const SKIP = new Set([
  'agm-d-bizdev-mkt', // authored as bizdev-mkt-sp (seed-bizdev-mkt-profile.mjs)
  'dm-d-bizdev-mkt',  // authored as bizdev-mkt-dm (seed-bizdev-mkt-dm.mjs)
  'agm-d-bizdev-ext', // authored as bizdev-ext-sp (seed-bizdev-ext-profile.mjs)
]);

function buildProfiles() {
  const out = [];
  for (const [deptId, titleAr, titleEn] of UNITS) {
    const variants = [
      { id: `agm-${deptId}`, orgLevel: 'AGM', title: `${titleEn} — Assistant General Manager`, titleAr: `${titleAr} — مدير عام مساعد` },
      { id: `dm-${deptId}`,  orgLevel: 'DM',  title: `${titleEn} — Department Manager`,        titleAr: `${titleAr} — مدير إدارة` },
    ];
    for (const v of variants) {
      if (SKIP.has(v.id)) continue;
      out.push({
        id: v.id,
        title: v.title,
        description: v.titleAr,
        departmentId: deptId,
        orgLevel: v.orgLevel,
        requiredSkills: [], // admins attach skills/levels later (see seed-job-profiles.mjs convention)
      });
    }
  }
  return out;
}

// --- Firestore REST value serialisation (recursive). ---
function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') {
    const fields = {};
    for (const [k, val] of Object.entries(v)) fields[k] = toValue(val);
    return { mapValue: { fields } };
  }
  throw new Error(`Unserialisable value: ${v}`);
}

function fields(rec) {
  const f = {};
  for (const [k, v] of Object.entries(rec)) f[k] = toValue(v);
  return f;
}

// --- Firebase CLI token (mirrors seed-job-profiles.mjs) ---
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
  const profiles = buildProfiles();
  const ids = new Set(profiles.map(p => p.id));
  if (ids.size !== profiles.length) throw new Error('Duplicate profile id generated.');
  const agm = profiles.filter(p => p.orgLevel === 'AGM').length;
  const dm = profiles.filter(p => p.orgLevel === 'DM').length;
  console.log(`→ ${UNITS.length} ASSISTANT_GENERAL units. Prepared ${profiles.length} profiles (${agm} AGM + ${dm} DM); skipped ${SKIP.size} already-authored.`);

  if (DRY_RUN) {
    console.log('— DRY RUN — no writes.');
    profiles.forEach(p => console.log(`  upsert jobProfiles/${p.id}  ${p.orgLevel.padEnd(3)}  dept ${p.departmentId}  | ${p.title}`));
    return;
  }

  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);

  const writes = profiles.map(p => ({ update: { name: `${DOC_PATH}/jobProfiles/${p.id}`, fields: fields(p) } }));
  console.log(`→ Committing ${writes.length} writes…`);
  await batchWrite(token, writes);
  console.log('✓ AGM + DM job profiles seeded.');
}

main().catch(err => { console.error('✖ Seed failed:', err.message || err); process.exit(1); });
