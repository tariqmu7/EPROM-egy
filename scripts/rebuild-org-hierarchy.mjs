// One-off migration: REPLACE the entire `departments` collection with the
// official EPROM Head Office org chart, transcribed verbatim from
// EPROM_Org_Hierarchy/EPROM_Org_Hierarchy_Tree.md (Arabic primary, English under).
//
// Auth: reuses the Firebase CLI login (no admin password needed). It mints an
// OAuth access token from the globally-installed firebase-tools and talks to the
// Firestore REST API directly, so it bypasses security rules with owner access.
//
// Behaviour:
//   - Every existing `departments` document is DELETED, except any whose id is
//     reused by the new chart (those are upserted in place, preserving managerId).
//   - The full Tree.md hierarchy is written with deterministic ids.
//
// Usage:  node scripts/rebuild-org-hierarchy.mjs [--dry-run]
//
// NOTE: This is destructive to org assignments. Users keep their records, but a
// user.departmentId pointing at a removed unit becomes dangling — reassign via
// the Admin Panel afterwards.

import { execSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const PROJECT_ID = 'eprom-cms';
const DB = '(default)';
const DRY_RUN = process.argv.includes('--dry-run');
const DOC_PATH = `projects/${PROJECT_ID}/databases/${DB}/documents`; // bare resource name (for write targets)
const BASE = `https://firestore.googleapis.com/v1/${DOC_PATH}`;      // full URL (for HTTP calls)

// --- The org chart (verbatim from Tree.md). Node shape: ---
//   [id, type, arabic, english, children?]
// Types: COMPANY > EXECUTIVE > SECTOR > GENERAL > DEPARTMENT/POSITION.
// POSITION = an individual/titled post (personal-capacity GM, project manager,
// expert) rather than an organisational unit.

const REGIONAL = (p) => [
  [`d-${p}-ops`,   'DEPARTMENT', 'التشغيل', 'Operations'],
  [`d-${p}-maint`, 'DEPARTMENT', 'الصيانة', 'Maintenance'],
  [`d-${p}-insp`,  'DEPARTMENT', 'التفتيش الهندسي والتآكل', 'Engineering Inspection & Corrosion'],
  [`d-${p}-hse`,   'DEPARTMENT', 'السلامة والصحة المهنية وحماية البيئة والجودة', 'HSE & Quality'],
  [`d-${p}-lab`,   'DEPARTMENT', 'المعامل الكيميائية', 'Chemical Laboratories'],
];

const TREE = [
  ['co-eprom', 'COMPANY', 'المصرية لتشغيل وصيانة المشروعات (المركز الرئيسي)', 'Egyptian Maintenance Company for Operation & Maintenance of Projects (EPROM), Head Office', [
    ['chairman', 'EXECUTIVE', 'رئيس مجلس الإدارة والعضو المنتدب', 'Chairman & Managing Director', [
      ['vice-chairman', 'EXECUTIVE', 'نائب رئيس مجلس الإدارة (1)', 'Vice Chairman of the Board'],

      // --- Assistant to President: Administrative Affairs ---
      ['sec-admin', 'SECTOR', 'مساعد رئيس الشركة للشئون الإدارية', 'Assistant to Company President for Administrative Affairs', [
        ['g-hr', 'GENERAL', 'مدير عام الموارد البشرية', 'General Manager of Human Resources', [
          ['d-hr-org',  'DEPARTMENT', 'التنظيم وتخطيط القوى العاملة', 'Organization & Workforce Planning'],
          ['d-hr-pers', 'DEPARTMENT', 'شئون العاملين', 'Personnel Affairs'],
          ['d-hr-ent',  'DEPARTMENT', 'الإستحقاقات', 'Entitlements'],
          ['d-hr-ins',  'DEPARTMENT', 'التأمينات الاجتماعية والمعاشات', 'Social Insurance & Pensions'],
        ]],
        ['g-pr', 'GENERAL', 'مدير عام العلاقات والخدمات العامة', 'General Manager of Public Relations & General Services', [
          ['d-pr-pr',  'DEPARTMENT', 'العلاقات العامة', 'Public Relations'],
          ['d-pr-adm', 'DEPARTMENT', 'الخدمات الإدارية', 'Administrative Services'],
        ]],
        ['g-train', 'GENERAL', 'مدير عام التدريب', 'General Manager of Training', [
          ['d-train-prep', 'DEPARTMENT', 'إعداد وتخطيط التدريب', 'Training Preparation & Planning'],
          ['d-train-rd',   'DEPARTMENT', 'البحوث وتطوير التدريب', 'Research & Training Development'],
        ]],
        ['g-comm', 'GENERAL', 'مدير عام الإتصال والعلاقات الحكومية', 'General Manager of Communication & Government Relations', [
          ['d-comm-comm', 'DEPARTMENT', 'الإتصال', 'Communication'],
          ['d-comm-gov',  'DEPARTMENT', 'العلاقات الحكومية', 'Government Relations'],
        ]],
        ['p-admin-gm-affairs',    'POSITION', 'مدير عام بالشئون الإدارية (1)', 'General Manager, Administrative Affairs'],
        ['p-admin-gm-dept',       'POSITION', 'مدير عام بالإدارة (1)', 'General Manager within the department'],
        ['p-admin-asstgm-cairo',  'POSITION', 'مدير عام مساعد الشئون الإدارية بالقاهرة (1)', 'Assistant General Manager, Cairo Administrative Affairs'],
        ['p-admin-asstgm-pers',   'POSITION', 'مدير عام مساعد بصفة شخصية (1)', 'Assistant General Manager, personal capacity'],
      ]],

      // --- Assistant to President: Technical Services & Business Development ---
      ['sec-techsvc', 'SECTOR', 'مساعد رئيس الشركة للخدمات الفنية وتنمية الأعمال', 'Assistant to Company President for Technical Services & Business Development', [
        ['g-supply', 'GENERAL', 'مدير عام المهمات والعقود', 'General Manager of Supplies & Contracts', [
          ['d-supply-purch', 'DEPARTMENT', 'المشتريات', 'Purchasing'],
          ['d-supply-wh',    'DEPARTMENT', 'المخازن', 'Warehouses'],
          ['d-supply-contr', 'DEPARTMENT', 'العقود', 'Contracts'],
          ['p-supply-gm-dept',     'POSITION', 'مدير عام بالإدارة (1)', 'General Manager within the department'],
          ['p-supply-asstgm-pers', 'POSITION', 'مدير عام مساعد بصفة شخصية (4)', 'Assistant General Manager, personal capacity'],
        ]],
        ['g-bizdev', 'GENERAL', 'مدير عام تنمية الأعمال والتعاقدات الخارجية', 'General Manager of Business Development & External Contracting', [
          ['d-bizdev-mkt', 'DEPARTMENT', 'تنمية الأعمال وبرامج التسويق', 'Business Development & Marketing Programs'],
          ['d-bizdev-ext', 'DEPARTMENT', 'العقود والعروض الخارجية ومتابعة عقود المشروعات', 'External Contracts/Bids & Project Contract Follow-up'],
        ]],
        ['p-techsvc-gm-pers',     'POSITION', 'مدير عام بصفة شخصية (1)', 'General Manager, personal capacity'],
        ['p-techsvc-asstgm-pers', 'POSITION', 'مدير عام مساعد بصفة شخصية (4)', 'Assistant General Manager, personal capacity'],
      ]],

      // --- Assistant to President: Financial Affairs ---
      ['sec-fin', 'SECTOR', 'مساعد رئيس الشركة للشئون المالية', 'Assistant to Company President for Financial Affairs', [
        ['g-fin', 'GENERAL', 'مدير عام الشئون المالية', 'General Manager of Financial Affairs', [
          ['d-fin-cost', 'DEPARTMENT', 'التكاليف ومراقبة المشروعات والمقبوضات', 'Costs, Project Control & Receivables'],
          ['d-fin-acct', 'DEPARTMENT', 'الحسابات والموازنة', 'Accounts & Budget'],
          ['d-fin-wage', 'DEPARTMENT', 'الأجور وإستحقاقات العاملين', 'Wages & Employee Entitlements'],
          ['d-fin-tax',  'DEPARTMENT', 'التمويل والضرائب', 'Finance & Taxes'],
          ['d-fin-pay',  'DEPARTMENT', 'المدفوعات', 'Payments'],
          ['p-fin-asstgm-dept', 'POSITION', 'مدير عام مساعد بالإدارة (1)', 'Assistant General Manager within the department'],
        ]],
        ['p-fin-gm-pers',          'POSITION', 'مدير عام بصفة شخصية (1)', 'General Manager, personal capacity'],
        ['p-fin-asstgm-dept-pers', 'POSITION', 'مدير عام مساعد بالإدارة بصفة شخصية (3)', 'Assistant General Manager within the department, personal capacity'],
      ]],

      // --- Assistant to President: Engineering Affairs ---
      ['sec-eng', 'SECTOR', 'مساعد رئيس الشركة للشئون الهندسية', 'Assistant to Company President for Engineering Affairs', [
        ['g-iis', 'GENERAL', 'مدير عام نظم المعلومات المتكاملة', 'General Manager of Integrated Information Systems', [
          ['d-iis-infra', 'DEPARTMENT', 'البنية التحتية والشبكات وتشغيل وصيانة الأجهزة', 'Infrastructure, Networks & Hardware Operation/Maintenance'],
          ['d-iis-db',    'DEPARTMENT', 'قواعد المعلومات والبرمجيات', 'Databases & Software'],
          ['d-iis-cairo', 'DEPARTMENT', 'البرمجيات وصيانة الأجهزة والشبكات بالقاهرة', 'Software & Hardware/Network Maintenance (Cairo)'],
          ['p-iis-asstgm-pers', 'POSITION', 'مدير عام مساعد بصفة شخصية (2)', 'Assistant General Manager, personal capacity'],
        ]],
      ]],

      // --- Assistant to President: Operations ---
      ['sec-ops', 'SECTOR', 'مساعد رئيس الشركة للعمليات', 'Assistant to Company President for Operations', [
        ['g-techoff', 'GENERAL', 'مدير عام المكتب الفني للوثائق', 'General Manager of Technical Office for Documents', [
          ['d-techoff-eng',  'DEPARTMENT', 'المكتب الفني للشئون الهندسية', 'Technical Office, Engineering Affairs'],
          ['d-techoff-ctrl', 'DEPARTMENT', 'المكتب الفني لنظم التحكم', 'Technical Office, Control Systems'],
          ['d-techoff-insp', 'DEPARTMENT', 'المكتب الفني للتفتيش الهندسي (الدعم الفني)', 'Technical Office, Engineering Inspection (Technical Support)'],
          ['p-techoff-gm-pers',     'POSITION', 'مدير عام بصفة شخصية (1)', 'General Manager, personal capacity'],
          ['p-techoff-asstgm-pers', 'POSITION', 'مدير عام مساعد بصفة شخصية (1)', 'Assistant General Manager, personal capacity'],
        ]],
      ]],

      // --- Assistant to President: Technical Affairs ---
      ['sec-tech', 'SECTOR', 'مساعد رئيس الشركة للشئون الفنية', 'Assistant to Company President for Technical Affairs', [
        ['g-techsup', 'GENERAL', 'مدير عام الدعم الفني للمشروعات', 'General Manager of Technical Support for Projects', [
          ['d-techsup-util', 'DEPARTMENT', 'الدعم الفني للمرافق والمستودعات', 'Technical Support for Utilities & Storage'],
          ['d-techsup-ops',  'DEPARTMENT', 'الدعم الفني للعمليات', 'Technical Support for Operations'],
          ['d-techsup-perf', 'DEPARTMENT', 'الدعم الفني لمتابعة تقييم الأداء وبرامج العمل', 'Technical Support for Performance Evaluation & Work Programs'],
          ['p-techsup-gm-pers', 'POSITION', 'مدير عام بصفة شخصية (1)', 'General Manager, personal capacity'],
        ]],
        ['g-canal', 'GENERAL', 'مدير عام التشغيل بمدن القناة وسيناء', 'General Manager of Operations: Canal Cities & Sinai', REGIONAL('canal')],
        ['g-south', 'GENERAL', 'مدير عام التشغيل بالمنطقة الجنوبية', 'General Manager of Operations: Southern Region', REGIONAL('south')],
        ['g-west',  'GENERAL', 'مدير عام التشغيل بالمنطقة الغربية', 'General Manager of Operations: Western Region', REGIONAL('west')],
        ['p-tech-gm-pers',     'POSITION', 'مدير عام بصفة شخصية (1)', 'General Manager, personal capacity'],
        ['p-tech-asstgm-pers', 'POSITION', 'مدير عام مساعد بصفة شخصية (1)', 'Assistant General Manager, personal capacity'],
      ]],

      // --- Assistant to President: Mechanical Maintenance & Engineering Inspection ---
      ['sec-mech', 'SECTOR', 'مساعد رئيس الشركة للصيانة الميكانيكية والتفتيش الهندسي', 'Assistant to Company President for Mechanical Maintenance & Engineering Inspection'],

      // --- Standalone units reporting to the Chairman ---
      ['g-techfollow', 'GENERAL', 'مدير عام المتابعة الفنية (مكتب القاهرة)', 'General Manager of Technical Follow-up, Cairo Office', [
        ['d-tf-studies', 'DEPARTMENT', 'الدراسات الفنية', 'Technical Studies'],
        ['d-tf-eng',     'DEPARTMENT', 'متابعة الشئون الهندسية', 'Engineering Affairs Follow-up'],
      ]],
      ['g-security', 'GENERAL', 'مدير عام الأمن', 'General Manager of Security', [
        ['p-security-asstgm', 'POSITION', 'مدير عام مساعد الأمن (1)', 'Assistant General Manager, Security'],
      ]],
      ['g-legal', 'GENERAL', 'مدير عام الشئون القانونية', 'General Manager of Legal Affairs', [
        ['d-legal-lit', 'DEPARTMENT', 'القضايا', 'Litigation'],
        ['d-legal-inv', 'DEPARTMENT', 'التحقيقات', 'Investigations'],
        ['p-legal-asstgm-pers', 'POSITION', 'مدير عام مساعد بصفة شخصية (2)', 'Assistant General Manager, personal capacity'],
      ]],
      ['g-secretariat', 'GENERAL', 'مدير عام الأمانة العامة وسكرتارية رئيس مجلس الإدارة', 'General Manager of General Secretariat & Board Chairman Secretariat', [
        ['d-sec-board', 'DEPARTMENT', 'الأمانة العامة لمجلس الإدارة', 'General Secretariat of the Board'],
        ['d-sec-chair', 'DEPARTMENT', 'سكرتارية رئيس مجلس الإدارة', "Board Chairman's Secretariat"],
        ['p-secretariat-asstgm-pers', 'POSITION', 'مدير عام مساعد بصفة شخصية (1)', 'Assistant General Manager, personal capacity'],
      ]],
      ['p-erc-maint-gm', 'POSITION', 'مدير عام بالإدارة العامة للصيانة العامة — بمشروع المصرية للتكرير (ERC project)', 'General Manager, General Maintenance (at ERC refining project)'],
      ['g-medical', 'GENERAL', 'مدير عام الشئون الطبية', 'General Manager of Medical Affairs', [
        ['d-med-prev', 'DEPARTMENT', 'الطب الوقائي', 'Preventive Medicine'],
        ['d-med-cur',  'DEPARTMENT', 'الطب العلاجي', 'Curative Medicine'],
      ]],
      ['g-energy', 'GENERAL', 'مدير عام ترشيد الطاقة', 'General Manager of Energy Rationalization', [
        ['d-energy-impl',    'DEPARTMENT', 'تنفيذ مشروعات رفع كفاءة الطاقة', 'Energy Efficiency Project Implementation'],
        ['d-energy-studies', 'DEPARTMENT', 'دراسات رفع كفاءة الطاقة', 'Energy Efficiency Studies'],
      ]],
      ['g-quality', 'GENERAL', 'مدير عام نظم الجودة', 'General Manager of Quality Systems', [
        ['p-quality-asstgm', 'POSITION', 'مدير عام مساعد نظم الجودة (1)', 'Assistant General Manager, Quality Systems'],
      ]],
      ['g-psafety', 'GENERAL', 'مدير عام سلامة العمليات', 'General Manager of Process Safety', [
        ['d-ps-tech', 'DEPARTMENT', 'السلامة الفنية ومنع الخسائر', 'Technical Safety & Loss Prevention'],
        ['d-ps-ops',  'DEPARTMENT', 'السلامة التشغيلية', 'Operational Safety'],
      ]],

      // --- Titled posts reporting to the Chairman ---
      ['p-gm-pers-9',            'POSITION', 'مدير عام بصفة شخصية (9)', 'General Manager, personal capacity (9)'],
      ['p-asstgm-internal-audit','POSITION', 'مدير عام مساعد المراجعة الداخلية', 'Assistant General Manager of Internal Audit'],
      ['p-asstgm-hse',           'POSITION', 'مدير عام مساعد السلامة والصحة المهنية وحماية البيئة', 'Assistant General Manager of Health, Safety & Environment (HSE)'],
      ['p-asstgm-admin-followup','POSITION', 'مدير عام مساعد المتابعة الإدارية لمساعدي رئيس الشركة', "Assistant General Manager of Administrative Follow-up for the President's Assistants"],
      ['p-asstgm-csr',           'POSITION', 'مدير عام مساعد أنشطة المسئولية المجتمعية', 'Assistant General Manager of Corporate Social Responsibility (CSR)'],
      ['p-asstgm-pers-10',       'POSITION', 'مدير عام مساعد بصفة شخصية (10)', 'Assistant General Manager, personal capacity (10)'],
      ['p-pm-sokhna',    'POSITION', 'مدير مشروع السخنة', 'Project Manager, Sokhna'],
      ['p-pm-esterenex', 'POSITION', 'مدير مشروع الإستيرنكس', 'Project Manager, Esterenex'],
      ['p-pm-amoc',      'POSITION', 'مدير مشروع أموك', 'Project Manager, AMOC'],
      ['p-pm-elab',      'POSITION', 'مدير مشروع إيلاب', 'Project Manager, ELAB'],
      ['p-pm-midor',     'POSITION', 'مدير مشروع ميدور', 'Project Manager, MIDOR'],
      ['p-pm-erc',       'POSITION', 'مدير مشروع المصرية للتكرير', 'Project Manager, ERC (Egyptian Refining Company)'],
      ['p-expert-company-pres', 'POSITION', 'خبير / رئيس شركة (3)', 'Expert / Company President grade'],
      ['p-expert-vice-pres',    'POSITION', 'خبير / نائب رئيس شركة (1)', 'Expert / Vice President grade'],
      ['p-expert-asst-pres',    'POSITION', 'خبير / مساعد رئيس شركة (15)', 'Expert / Assistant President grade'],
    ]],
  ]],
];

// Flatten the tree into {id, name, nameAr, type, parentId} records.
function flatten(nodes, parentId, out = []) {
  for (const [id, type, ar, en, children] of nodes) {
    out.push({ id, name: en, nameAr: ar, type, ...(parentId ? { parentId } : {}) });
    if (children && children.length) flatten(children, id, out);
  }
  return out;
}

// --- Firebase CLI token ---
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
  const ids = new Map(); // id -> { managerId }
  let pageToken;
  do {
    const url = new URL(`${BASE}/departments`);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`list failed ${res.status}: ${await res.text()}`);
    const json = await res.json();
    for (const d of json.documents || []) {
      const id = d.name.split('/').pop();
      ids.set(id, {
        managerId: d.fields?.managerId?.stringValue,
        behavioralSkillIds: d.fields?.behavioralSkillIds, // raw Firestore Value, carried as-is
      });
    }
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
  const records = flatten(TREE);
  const newIds = new Set(records.map(r => r.id));
  console.log(`→ Prepared ${records.length} org-chart nodes from Tree.md.`);

  const { token, email } = await getToken();
  console.log(`✓ Authenticated via Firebase CLI as ${email}.`);

  const existing = await listExisting(token);
  const toDelete = [...existing.keys()].filter(id => !newIds.has(id));
  console.log(`→ Existing departments: ${existing.size}. To delete: ${toDelete.length}. To upsert: ${records.length}.`);

  if (DRY_RUN) {
    console.log('— DRY RUN — no writes.');
    console.log('Delete:', toDelete.join(', ') || '(none)');
    records.forEach(r => console.log(`  upsert ${r.id} [${r.type}] ${r.nameAr} — ${r.name}${r.parentId ? '  ⟶ ' + r.parentId : ''}`));
    return;
  }

  const writes = [];
  // Upserts (carry forward managerId for reused ids).
  for (const r of records) {
    const carried = existing.get(r.id);
    const rec = { ...r };
    if (carried?.managerId) rec.managerId = carried.managerId;
    const f = fields(rec);
    if (carried?.behavioralSkillIds) f.behavioralSkillIds = carried.behavioralSkillIds;
    writes.push({ update: { name: `${DOC_PATH}/departments/${r.id}`, fields: f } });
  }
  // Deletes.
  for (const id of toDelete) {
    writes.push({ delete: `${DOC_PATH}/departments/${id}` });
  }

  console.log(`→ Committing ${writes.length} writes…`);
  await batchWrite(token, writes);
  console.log('✓ Org chart rebuilt.');
  if (toDelete.length) {
    console.log(`ℹ ${toDelete.length} old unit(s) removed — any users assigned to them now have a dangling departmentId; reassign in the Admin Panel.`);
  }
}

main().catch(err => { console.error('✖ Rebuild failed:', err.message || err); process.exit(1); });
