// EPROM Head Office org hierarchy (المركز الرئيسي), transcribed from
// EPROM_Org_Hierarchy/EPROM_Org_Hierarchy.md (source PPT: "العليا لحد مدير
// عام مساعد - بالمركز الرئيسي.ppt").
//
// Shape: a forest of top-level units (each becomes a GENERAL department under
// the Head Office). Children nest via `children`. Department `type` is derived
// from depth (0 → GENERAL, 1 → DEPARTMENT, 2+ → SECTION) unless overridden.
//
// IDs are deterministic, derived from the position in the tree (e.g. "og-1",
// "og-1-2", "og-1-2-3"), so re-running the seed upserts the same documents.

export const HEAD_OFFICE = [
  {
    en: 'Administrative Affairs',
    ar: 'الشئون الإدارية',
    children: [
      {
        en: 'Human Resources', ar: 'الموارد البشرية',
        children: [
          { en: 'Organization & Workforce Planning', ar: 'التنظيم وتخطيط القوى العاملة' },
          { en: 'Personnel Affairs', ar: 'شئون العاملين' },
          { en: 'Entitlements', ar: 'الإستحقاقات' },
          { en: 'Social Insurance & Pensions', ar: 'التأمينات الاجتماعية والمعاشات' },
        ],
      },
      {
        en: 'Public Relations & General Services', ar: 'العلاقات والخدمات العامة',
        children: [
          { en: 'Public Relations', ar: 'العلاقات العامة' },
          { en: 'Administrative Services', ar: 'الخدمات الإدارية' },
        ],
      },
      {
        en: 'Training', ar: 'التدريب',
        children: [
          { en: 'Training Preparation & Planning', ar: 'إعداد وتخطيط التدريب' },
          { en: 'Research & Training Development', ar: 'البحوث وتطوير التدريب' },
        ],
      },
      {
        en: 'Communication & Government Relations', ar: 'الإتصال والعلاقات الحكومية',
        children: [
          { en: 'Communication', ar: 'الإتصال' },
          { en: 'Government Relations', ar: 'العلاقات الحكومية' },
        ],
      },
    ],
  },
  {
    en: 'Technical Services & Business Development',
    ar: 'الخدمات الفنية وتنمية الأعمال',
    children: [
      {
        en: 'Supplies & Contracts', ar: 'المهمات والعقود',
        children: [
          { en: 'Purchasing', ar: 'المشتريات' },
          { en: 'Warehouses', ar: 'المخازن' },
          { en: 'Contracts', ar: 'العقود' },
        ],
      },
      {
        en: 'Business Development & External Contracting', ar: 'تنمية الأعمال والتعاقدات الخارجية',
        children: [
          { en: 'Business Development & Marketing Programs', ar: 'تنمية الأعمال وبرامج التسويق' },
          { en: 'External Contracts/Bids & Project Contract Follow-up', ar: 'العقود والعروض الخارجية ومتابعة عقود المشروعات' },
        ],
      },
    ],
  },
  {
    en: 'Financial Affairs',
    ar: 'الشئون المالية',
    children: [
      {
        en: 'Financial Affairs', ar: 'الشئون المالية',
        children: [
          { en: 'Costs, Project Control & Receivables', ar: 'التكاليف ومراقبة المشروعات والمقبوضات' },
          { en: 'Accounts & Budget', ar: 'الحسابات والموازنة' },
          { en: 'Wages & Employee Entitlements', ar: 'الأجور وإستحقاقات العاملين' },
          { en: 'Finance & Taxes', ar: 'التمويل والضرائب' },
          { en: 'Payments', ar: 'المدفوعات' },
        ],
      },
    ],
  },
  {
    en: 'Engineering Affairs',
    ar: 'الشئون الهندسية',
    children: [
      {
        en: 'Integrated Information Systems', ar: 'نظم المعلومات المتكاملة',
        children: [
          { en: 'Infrastructure, Networks & Hardware Operation/Maintenance', ar: 'البنية التحتية والشبكات وتشغيل وصيانة الأجهزة' },
          { en: 'Databases & Software', ar: 'قواعد المعلومات والبرمجيات' },
          { en: 'Software & Hardware/Network Maintenance (Cairo)', ar: 'البرمجيات وصيانة الأجهزة والشبكات بالقاهرة' },
        ],
      },
    ],
  },
  {
    en: 'Operations',
    ar: 'العمليات',
    children: [
      {
        en: 'Technical Office for Documents', ar: 'المكتب الفني للوثائق',
        children: [
          { en: 'Technical Office, Engineering Affairs', ar: 'المكتب الفني للشئون الهندسية' },
          { en: 'Technical Office, Control Systems', ar: 'المكتب الفني لنظم التحكم' },
          { en: 'Technical Office, Engineering Inspection (Technical Support)', ar: 'المكتب الفني للتفتيش الهندسي (الدعم الفني)' },
        ],
      },
    ],
  },
  {
    en: 'Technical Affairs',
    ar: 'الشئون الفنية',
    children: [
      {
        en: 'Technical Support for Projects', ar: 'الدعم الفني للمشروعات',
        children: [
          { en: 'Technical Support for Utilities & Storage', ar: 'الدعم الفني للمرافق والمستودعات' },
          { en: 'Technical Support for Operations', ar: 'الدعم الفني للعمليات' },
          { en: 'Technical Support for Performance Evaluation & Work Programs', ar: 'الدعم الفني لمتابعة تقييم الأداء وبرامج العمل' },
        ],
      },
      { en: 'Operations: Western Region', ar: 'التشغيل بالمنطقة الغربية', children: regionalUnits() },
      { en: 'Operations: Southern Region', ar: 'التشغيل بالمنطقة الجنوبية', children: regionalUnits() },
      { en: 'Operations: Canal Cities & Sinai', ar: 'التشغيل بمدن القناة وسيناء', children: regionalUnits() },
    ],
  },
  {
    en: 'Mechanical Maintenance & Engineering Inspection',
    ar: 'الصيانة الميكانيكية والتفتيش الهندسي',
    children: [],
  },

  // --- Standalone General Manager units (report to the top) ---
  {
    en: 'Technical Follow-up (Cairo Office)', ar: 'المتابعة الفنية (مكتب القاهرة)',
    children: [
      { en: 'Technical Studies', ar: 'الدراسات الفنية' },
      { en: 'Engineering Affairs Follow-up', ar: 'متابعة الشئون الهندسية' },
    ],
  },
  {
    en: 'Security', ar: 'الأمن',
    children: [
      { en: 'Security (Asst. GM)', ar: 'مدير عام مساعد الأمن' },
    ],
  },
  {
    en: 'Legal Affairs', ar: 'الشئون القانونية',
    children: [
      { en: 'Litigation', ar: 'القضايا' },
      { en: 'Investigations', ar: 'التحقيقات' },
    ],
  },
  {
    en: 'General Secretariat & Board Chairman Secretariat', ar: 'الأمانة العامة وسكرتارية رئيس مجلس الإدارة',
    children: [
      { en: 'General Secretariat of the Board', ar: 'الأمانة العامة لمجلس الإدارة' },
      { en: "Board Chairman's Secretariat", ar: 'سكرتارية رئيس مجلس الإدارة' },
    ],
  },
  {
    en: 'Medical Affairs', ar: 'الشئون الطبية',
    children: [
      { en: 'Preventive Medicine', ar: 'الطب الوقائي' },
      { en: 'Curative Medicine', ar: 'الطب العلاجي' },
    ],
  },
  {
    en: 'Energy Rationalization', ar: 'ترشيد الطاقة',
    children: [
      { en: 'Energy Efficiency Project Implementation', ar: 'تنفيذ مشروعات رفع كفاءة الطاقة' },
      { en: 'Energy Efficiency Studies', ar: 'دراسات رفع كفاءة الطاقة' },
    ],
  },
  {
    en: 'Process Safety', ar: 'سلامة العمليات',
    children: [
      { en: 'Technical Safety & Loss Prevention', ar: 'السلامة الفنية ومنع الخسائر' },
      { en: 'Operational Safety', ar: 'السلامة التشغيلية' },
    ],
  },
  {
    en: 'Quality Systems', ar: 'نظم الجودة',
    children: [
      { en: 'Quality Systems (Asst. GM)', ar: 'مدير عام مساعد نظم الجودة' },
    ],
  },

  // --- Units reporting directly to the top, led by an Assistant GM ---
  { en: 'Internal Audit', ar: 'المراجعة الداخلية', children: [] },
  { en: 'Health, Safety & Environment (HSE)', ar: 'السلامة والصحة المهنية وحماية البيئة', children: [] },
  { en: "Administrative Follow-up for the President's Assistants", ar: 'المتابعة الإدارية لمساعدي رئيس الشركة', children: [] },
  { en: 'Corporate Social Responsibility (CSR)', ar: 'أنشطة المسئولية المجتمعية', children: [] },
];

// The five Assistant-GM units shared by every regional operations GM.
function regionalUnits() {
  return [
    { en: 'Operations', ar: 'التشغيل' },
    { en: 'Maintenance', ar: 'الصيانة' },
    { en: 'Engineering Inspection & Corrosion', ar: 'التفتيش الهندسي والتآكل' },
    { en: 'HSE & Quality', ar: 'السلامة والصحة المهنية وحماية البيئة والجودة' },
    { en: 'Chemical Laboratories', ar: 'المعامل الكيميائية' },
  ];
}

// Flatten the forest into Department records with deterministic ids, parentId
// links and a type derived from depth (overridable via node.type).
export function flattenHierarchy(forest = HEAD_OFFICE) {
  const out = [];
  const walk = (nodes, parentId, prefix, depth) => {
    nodes.forEach((node, i) => {
      const id = `${prefix}${i + 1}`;
      const type = node.type || (depth === 0 ? 'GENERAL' : depth === 1 ? 'DEPARTMENT' : 'SECTION');
      out.push({
        id,
        name: node.en,
        nameAr: node.ar,
        type,
        ...(parentId ? { parentId } : {}),
      });
      if (node.children && node.children.length) {
        walk(node.children, id, `${id}-`, depth + 1);
      }
    });
  };
  walk(forest, undefined, 'og-', 0);
  return out;
}
