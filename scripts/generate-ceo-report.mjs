// EPROM CEO Report — Word Document Generator
// node scripts/generate-ceo-report.mjs

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageBreak, BorderStyle, WidthType, ShadingType,
  AlignmentType, VerticalAlign, HeadingLevel, PageNumber,
  convertInchesToTwip, convertMillimetersToTwip, UnderlineType,
} from "docx";
import { writeFileSync } from "fs";

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  navy:    "1B2A4A",
  gold:    "C9A84C",
  slate:   "4A5568",
  lightBg: "F0F4F8",
  white:   "FFFFFF",
  red:     "C0392B",
  green:   "1E8449",
  amber:   "B7950B",
  blue:    "1A5276",
  tblBdr:  "CBD5E0",
  coverBg: "0D1B2E",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const pt  = (n) => n * 2;
const inch = convertInchesToTwip;
const mm   = convertMillimetersToTwip;

function nilBorder() {
  return { style: BorderStyle.NIL, size: 0, color: "FFFFFF" };
}
function solidBorder(color, size = 4) {
  return { style: BorderStyle.SINGLE, size, color };
}
function allBorders(color, size = 4) {
  const b = solidBorder(color, size);
  return { top: b, bottom: b, left: b, right: b };
}
function noBorders() {
  const b = nilBorder();
  return { top: b, bottom: b, left: b, right: b };
}

function txr(text, { bold = false, size = 11, color = C.slate, italic = false, font = "Calibri", children } = {}) {
  if (children !== undefined) {
    return new TextRun({ font, size: pt(size), bold, color, italics: italic, children });
  }
  return new TextRun({ text: String(text), font, size: pt(size), bold, color, italics: italic });
}

function par(content, { align = AlignmentType.JUSTIFIED, spaceBefore = 4, spaceAfter = 8, indent = false } = {}) {
  const children = typeof content === "string" ? [txr(content)] : content;
  return new Paragraph({
    children,
    alignment: align,
    spacing: { before: pt(spaceBefore), after: pt(spaceAfter) },
    indent: indent ? { left: mm(8) } : undefined,
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: pt(22), after: pt(8) },
    border: { bottom: solidBorder(C.gold, 8) },
    children: [txr(text, { bold: true, size: 16, color: C.navy })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: pt(14), after: pt(6) },
    children: [txr(text, { bold: true, size: 13, color: C.navy })],
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: pt(10), after: pt(4) },
    children: [txr(text, { bold: true, size: 11, color: C.gold })],
  });
}

function gap(n = 1) {
  return new Paragraph({ children: [new TextRun({ text: " ".repeat(n) })], spacing: { before: 0, after: pt(6) } });
}
function pgBreak() {
  return new Paragraph({ children: [new PageBreak()], spacing: { before: 0, after: 0 } });
}
function bul(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    children: [txr(text, { size: 10.5 })],
    spacing: { before: pt(2), after: pt(2) },
  });
}

// ── Callout box (left-border accent) ─────────────────────────────────────────
function callout(text, opts) {
  const bg          = (opts && opts.bg)          || C.lightBg;
  const textColor   = (opts && opts.textColor)   || C.navy;
  const bold        = (opts && opts.bold)        || false;
  const borderColor = (opts && opts.borderColor) || C.gold;
  const cell = new TableCell({
    shading: { type: ShadingType.SOLID, color: bg },
    margins: { top: mm(3), bottom: mm(3), left: mm(5), right: mm(5) },
    borders: { left: solidBorder(borderColor, 18), top: nilBorder(), right: nilBorder(), bottom: nilBorder() },
    children: [par([txr(text, { color: textColor, bold: bold, size: 10.5 })], { align: AlignmentType.LEFT })],
  });
  const row  = new TableRow({ children: [cell] });
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [row] });
}

// ── Data table ────────────────────────────────────────────────────────────────
function tbl(headers, rows, colWidths) {
  const total = 9000;
  const widths = colWidths || headers.map(() => Math.floor(total / headers.length));

  const hRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: C.navy },
      margins: { top: mm(2), bottom: mm(2), left: mm(3), right: mm(3) },
      verticalAlign: VerticalAlign.CENTER,
      borders: allBorders(C.navy),
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txr(h, { bold: true, size: 9.5, color: C.white })] })],
    })),
  });

  const dRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      width: { size: widths[ci], type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: ri % 2 === 0 ? C.white : C.lightBg },
      margins: { top: mm(1.5), bottom: mm(1.5), left: mm(3), right: mm(3) },
      verticalAlign: VerticalAlign.CENTER,
      borders: allBorders(C.tblBdr),
      children: [new Paragraph({
        alignment: ci === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
        children: [txr(cell, { bold: ci === 0, size: 9.5, color: ci === 0 ? C.navy : C.slate })],
      })],
    })),
  }));

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [hRow, ...dRows] });
}

// ── KPI card row ──────────────────────────────────────────────────────────────
function kpiRow(cards) {
  const w = Math.floor(9000 / cards.length);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({
      children: cards.map(({ value, label, color = C.navy }) => new TableCell({
        width: { size: w, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color },
        margins: { top: mm(5), bottom: mm(5), left: mm(3), right: mm(3) },
        borders: { ...noBorders(), left: solidBorder(C.white, 6), right: solidBorder(C.white, 6) },
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, children: [txr(value, { bold: true, size: 18, color: C.white })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [txr(label, { size: 8.5, color: "C8D8EE", italic: true })] }),
        ],
      })),
    })],
  });
}

// ── Bar chart (shaded cell bars) ──────────────────────────────────────────────
function barChart(title, items, maxVal, barColor = C.navy, valColor = C.gold) {
  const MAX_SEGS = 20;
  const titleRow = new TableRow({ children: [new TableCell({
    columnSpan: 4,
    shading: { type: ShadingType.SOLID, color: C.navy },
    margins: { top: mm(3), bottom: mm(3), left: mm(4), right: mm(4) },
    borders: allBorders(C.navy),
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txr(title, { bold: true, size: 10.5, color: C.white })] })],
  })] });

  const dataRows = items.map(({ label, value, suffix = "" }) => {
    const filled = Math.max(1, Math.round((value / maxVal) * MAX_SEGS));
    const empty  = MAX_SEGS - filled;
    const cells = [
      new TableCell({
        width: { size: 2400, type: WidthType.DXA },
        borders: noBorders(),
        margins: { top: mm(1.5), bottom: mm(1.5), left: mm(2), right: mm(3) },
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [txr(label, { bold: true, size: 9, color: C.navy })] })],
      }),
      new TableCell({
        width: { size: filled * 230, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: barColor },
        borders: allBorders(barColor),
        children: [new Paragraph({ children: [txr(" ")] })],
      }),
    ];
    if (empty > 0) {
      cells.push(new TableCell({
        width: { size: empty * 230, type: WidthType.DXA },
        shading: { type: ShadingType.SOLID, color: "E2E8F0" },
        borders: allBorders("E2E8F0"),
        children: [new Paragraph({ children: [txr(" ")] })],
      }));
    }
    cells.push(new TableCell({
      width: { size: 950, type: WidthType.DXA },
      borders: noBorders(),
      margins: { top: mm(1.5), bottom: mm(1.5), left: mm(3), right: mm(2) },
      children: [new Paragraph({ children: [txr(`${typeof value === "number" ? value.toLocaleString() : value}${suffix}`, { bold: true, size: 9, color: valColor })] })],
    }));
    return new TableRow({ children: cells });
  });

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [titleRow, ...dataRows] });
}

// ── Blocker card ──────────────────────────────────────────────────────────────
function blockerCard(title, what, fix, effort) {
  return new TableRow({ children: [new TableCell({
    shading: { type: ShadingType.SOLID, color: "FEF0EF" },
    margins: { top: mm(4), bottom: mm(4), left: mm(6), right: mm(6) },
    borders: { left: solidBorder(C.red, 20), top: nilBorder(), right: nilBorder(), bottom: nilBorder() },
    children: [
      new Paragraph({ children: [txr(title, { bold: true, size: 11, color: C.red })] }),
      par([txr("What: ", { bold: true }), txr(what)], { align: AlignmentType.LEFT }),
      par([txr("Fix: ",  { bold: true }), txr(fix)],  { align: AlignmentType.LEFT }),
      par([txr("Effort: ", { bold: true }), txr(effort)], { align: AlignmentType.LEFT, spaceAfter: 0 }),
    ],
  })] });
}
function spacerRow() {
  return new TableRow({ children: [new TableCell({ borders: noBorders(), children: [gap()] })] });
}

// ════════════════════════════════════════════════════════════════════════════
//  COVER PAGE
// ════════════════════════════════════════════════════════════════════════════
function coverPage() {
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        // Dark top band
        new TableRow({ children: [new TableCell({
          shading: { type: ShadingType.SOLID, color: C.coverBg },
          margins: { top: mm(22), bottom: mm(10), left: mm(18), right: mm(18) },
          borders: { ...noBorders(), bottom: solidBorder(C.gold, 12) },
          children: [
            new Paragraph({ children: [txr("EPROM", { bold: true, size: 40, color: C.gold })] }),
            new Paragraph({ children: [txr("COMPETENCY MANAGEMENT SYSTEM", { bold: true, size: 15, color: C.white })] }),
          ],
        })] }),
        // Navy mid band — main title
        new TableRow({ children: [new TableCell({
          shading: { type: ShadingType.SOLID, color: C.navy },
          margins: { top: mm(20), bottom: mm(20), left: mm(18), right: mm(18) },
          borders: { ...noBorders(), bottom: solidBorder(C.gold, 8) },
          children: [
            new Paragraph({ children: [txr("EXECUTIVE BRIEFING REPORT", { bold: true, size: 26, color: C.white })] }),
            gap(),
            new Paragraph({ children: [txr("Deployment Challenges  ·  Remaining Work  ·  ROI Analysis", { size: 12, color: "8EA7C8", italic: true })] }),
            new Paragraph({ children: [txr("Egypt Oil, Gas & Energy Market Strategy  ·  Case Study", { size: 12, color: "8EA7C8", italic: true })] }),
          ],
        })] }),
        // Dark footer band — metadata
        new TableRow({ children: [new TableCell({
          shading: { type: ShadingType.SOLID, color: "10203A" },
          margins: { top: mm(8), bottom: mm(8), left: mm(18), right: mm(18) },
          borders: noBorders(),
          children: [
            tbl([], [
              ["Prepared by", "Tariq Salama — System Owner"],
              ["Date",        "May 19, 2026"],
              ["Status",      "95% Complete — Deployment Imminent"],
              ["Contact",     "tarekmoh123@gmail.com"],
            ], [2400, 6600]),
          ],
        })] }),
      ],
    }),
    pgBreak(),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 1 — Executive Summary
// ════════════════════════════════════════════════════════════════════════════
function sec1() {
  return [
    h1("1. Executive Summary"),
    par("EPROM has developed a fully functional, enterprise-grade Competency Management System (CMS) — a browser-based application that digitises the complete employee skill lifecycle: from defining what each role requires, through assessing every employee's current proficiency, to automatically generating individual training plans and career progression roadmaps."),
    gap(),
    kpiRow([
      { value: "95%",      label: "Build Complete",       color: C.navy  },
      { value: "2 – 4 wk", label: "To Go-Live",           color: C.blue  },
      { value: "150",      label: "Employees — Phase 1",  color: "2E4057" },
      { value: "EGP 12M+", label: "3-Year Net Return",    color: C.green  },
    ]),
    gap(),
    callout(
      "Three IT configuration tasks — estimated 2–3 person-days total — are the only barrier between today and a live production system. No new code is required to unblock go-live.",
      { bg: "EAF7EE", textColor: C.green, bold: true, borderColor: C.green }
    ),
    gap(),
    par("Beyond internal use, this system represents a significant commercial opportunity. Egypt's oil, gas, and energy sector employs over 208,000 technical professionals across 115+ entities. No Arabic-market, energy-sector-specific SaaS competency platform currently dominates this space. With EPROM's sector credibility, the CMS can become the national standard — with the EPROM Training Center as the revenue engine running on the data it generates."),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 2 — What We Built
// ════════════════════════════════════════════════════════════════════════════
function sec2() {
  return [
    pgBreak(),
    h1("2. What We Built — System Capabilities"),
    par("The EPROM CMS covers the full competency cycle across all 8 organisational levels (FR → GM). It is accessible from any company computer or tablet through a standard web browser — no installation required."),
    gap(),
    tbl(
      ["Module", "What It Does", "Users"],
      [
        ["Skills Catalog",            "Defines all competencies on a 1–5 proficiency scale",                 "Admin"],
        ["Job Profiles",              "Maps each org level to required skill levels",                        "Admin"],
        ["360° Assessments",          "Weighted self (10%) + peer (30%) + manager (60%) scoring",           "All"],
        ["Technical Assessments",     "Written exams, managerial interviews, practical demonstrations",     "Employee / Manager"],
        ["Evidence Portal",           "Employees submit work records; managers approve and score",          "Employee / Manager"],
        ["Skill Gap Reports",         "Instantly shows each employee's gap vs. required level",             "Manager / HR"],
        ["Individual Training Plans", "Auto-generated from gaps, linked directly to training courses",      "Employee / HR"],
        ["Career Path Planner",       "Readiness score for promotion to next org level with gap breakdown", "Employee / CEO"],
        ["Assessment Scheduling",     "Defines when and how each skill is re-assessed",                     "Admin"],
        ["CEO & Manager Dashboards",  "Real-time org-wide analytics and team performance views",            "CEO / Manager"],
        ["Bulk Employee Import",      "Upload hundreds of employees via Excel in minutes",                  "Admin"],
      ],
      [2800, 4500, 1700]
    ),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 3 — Deployment Challenges
// ════════════════════════════════════════════════════════════════════════════
function sec3() {
  return [
    pgBreak(),
    h1("3. Deployment Challenges & Current Status"),

    h2("3.1  Architecture Decision — Cloud vs. On-Premise"),
    par("The current build uses Firebase (Google Cloud) for data and authentication — the fastest, most reliable production path. Two options are available:"),
    gap(),
    tbl(
      ["Path", "Pros", "Cons", "Timeline"],
      [
        ["Firebase (current build)", "Ready in 2–4 weeks · No server hardware needed · 99.9% uptime SLA · Automatic backups", "Data hosted on Google servers (GDPR-compliant, EU data centres)", "2–4 weeks"],
        ["Fully On-Premise",        "All data inside company walls · No internet dependency",                                  "Server hardware required · 8–12 week backend rewrite · IT maintenance overhead", "3–4 months"],
      ],
      [2000, 3600, 2400, 1000]
    ),
    gap(),
    callout(
      "Recommendation: Deploy on Firebase for Phase 1. Competency data sensitivity is moderate — far below payroll or medical records. On-premise can be evaluated for Phase 2 if mandated by IT security policy.",
      { bg: C.lightBg, textColor: C.navy }
    ),

    gap(),
    h2("3.2  Critical Blockers — Must Resolve Before Go-Live"),
    par("All three items below are IT / admin configuration tasks — zero code changes required:"),
    gap(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        blockerCard(
          "BLOCKER 1 — Firebase Domain Authorisation",
          "Firebase rejects login attempts from any domain not on its approved list. Without this fix, every user who tries to log in sees an 'unauthorised domain' error.",
          "Add the deployment URL (e.g. cms.eprom.com.eg) to Firebase Console → Authentication → Authorised Domains.",
          "5 minutes. Owner: Tariq Salama."
        ),
        spacerRow(),
        blockerCard(
          "BLOCKER 2 — HTTPS / SSL Certificate",
          "Firebase Authentication requires a secure HTTPS connection. An HTTP-only server will refuse all login attempts.",
          "Obtain an SSL certificate via Let's Encrypt (free) or the company's internal Certificate Authority.",
          "1–2 hours. Owner: EPROM IT Department."
        ),
        spacerRow(),
        blockerCard(
          "BLOCKER 3 — Production Environment Configuration",
          "The production build requires a configuration file (.env.production) containing Firebase credentials. Without it the deployed app cannot connect to the database.",
          "Create the file from the .env.example template — all keys are available in the Firebase Console.",
          "15 minutes. Owner: Tariq Salama."
        ),
      ],
    }),

    gap(),
    h2("3.3  Additional Pre-Launch Tasks (Non-Blocking)"),
    tbl(
      ["Task", "Effort", "Owner", "Priority"],
      [
        ["Configure company firewall — allow outbound HTTPS to Firebase endpoints", "1 hr",   "IT",        "HIGH"],
        ["Add HTTP security headers to web server (CSP, X-Frame-Options)",         "2 hrs",   "IT",        "HIGH"],
        ["Fix build base URL path in vite.config.ts",                              "30 min",  "Developer", "HIGH"],
        ["Add idle session auto-logout (30-min timeout)",                           "4 hrs",   "Developer", "MEDIUM"],
        ["Add connectivity error banner for network outages",                       "3 hrs",   "Developer", "MEDIUM"],
        ["Add build version stamp in admin footer",                                 "1 hr",    "Developer", "LOW"],
      ],
      [4000, 1200, 1600, 2200]
    ),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 4 — Remaining Work
// ════════════════════════════════════════════════════════════════════════════
function phaseHeaderRow(label, color) {
  return new TableRow({ children: [new TableCell({
    columnSpan: 3,
    shading: { type: ShadingType.SOLID, color },
    margins: { top: mm(3), bottom: mm(3), left: mm(4), right: mm(4) },
    borders: allBorders(color),
    children: [new Paragraph({ children: [txr(label, { bold: true, size: 11, color: C.white })] })],
  })] });
}

function taskRow(text, owner, status, statusBg, statusColor, idx) {
  const bg = idx % 2 === 0 ? C.white : C.lightBg;
  return new TableRow({ children: [
    new TableCell({ width: { size: 5500, type: WidthType.DXA }, shading: { type: ShadingType.SOLID, color: bg }, margins: { top: mm(1.5), bottom: mm(1.5), left: mm(4), right: mm(4) }, borders: allBorders(C.tblBdr), children: [new Paragraph({ children: [txr(text, { size: 10 })] })] }),
    new TableCell({ width: { size: 2000, type: WidthType.DXA }, shading: { type: ShadingType.SOLID, color: bg }, borders: allBorders(C.tblBdr), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txr(owner, { size: 9.5 })] })] }),
    new TableCell({ width: { size: 1500, type: WidthType.DXA }, shading: { type: ShadingType.SOLID, color: statusBg }, borders: allBorders(C.tblBdr), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txr(status, { bold: true, size: 9.5, color: statusColor })] })] }),
  ] });
}

function sec4() {
  const phase0 = [
    ["Resolve 3 deployment blockers",            "IT / Developer", "Pending", "FDEDEC", C.red],
    ["Configure company firewall rules",          "IT",             "Pending", "FDEDEC", C.red],
    ["Create .env.production with Firebase keys", "Developer",      "Pending", "FDEDEC", C.red],
    ["Add HTTP security headers to web server",   "IT",             "Pending", "FDEDEC", C.red],
    ["Internal smoke test — 5–10 pilot users",    "HR / IT",        "Pending", "FDEDEC", C.red],
  ];
  const phase1 = [
    ["Bulk-upload all employees via Excel template",  "HR Admin", "Planned", "FEF9E7", C.amber],
    ["Define all Job Profiles per org level",         "HR Admin", "Planned", "FEF9E7", C.amber],
    ["Load Skills Catalog (45 competencies)",         "HR Admin", "Planned", "FEF9E7", C.amber],
    ["Assign employees to job profiles",              "HR Admin", "Planned", "FEF9E7", C.amber],
    ["Run first assessment cycle",                    "HR Admin", "Planned", "FEF9E7", C.amber],
    ["Distribute first ITP reports to managers",      "HR Admin", "Planned", "FEF9E7", C.amber],
  ];
  const phase2 = [
    ["Idle session auto-logout (30 min)",            "Developer", "Upcoming", "EAF7EE", C.green],
    ["Connectivity error handling for LAN outages",  "Developer", "Upcoming", "EAF7EE", C.green],
    ["Performance optimisations at scale",           "Developer", "Upcoming", "EAF7EE", C.green],
    ["First org-wide TNA report for L&D planning",   "HR Admin",  "Upcoming", "EAF7EE", C.green],
    ["First Board-level competency dashboard brief", "HR / CEO",  "Upcoming", "EAF7EE", C.green],
  ];

  return [
    pgBreak(),
    h1("4. Remaining Work Before Go-Live"),
    gap(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        phaseHeaderRow("PHASE 0 — Pre-Launch  (Weeks 1–2)", C.red),
        ...phase0.map(([t, o, s, bg, sc], i) => taskRow(t, o, s, bg, sc, i)),
        phaseHeaderRow("PHASE 1 — Soft Launch  (Weeks 3–4)", C.amber),
        ...phase1.map(([t, o, s, bg, sc], i) => taskRow(t, o, s, bg, sc, i)),
        phaseHeaderRow("PHASE 2 — Full Production  (Months 2–3)", C.green),
        ...phase2.map(([t, o, s, bg, sc], i) => taskRow(t, o, s, bg, sc, i)),
      ],
    }),
    gap(),
    callout("Total IT effort to go-live: ~20–30 person-hours.  Total developer effort: ~30–40 hours for blockers and near-term improvements."),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 5 — ROI
// ════════════════════════════════════════════════════════════════════════════
function sec5() {
  return [
    pgBreak(),
    h1("5. Return on Investment (ROI) Analysis"),

    h2("5.1  Internal Cost Savings — Current Manual Process"),
    par("EPROM currently manages competency tracking through spreadsheets, paper evaluations, and ad-hoc manager assessments. The CMS replaces this entirely."),
    gap(),
    tbl(
      ["Activity", "Frequency", "Est. Hours/Cycle", "Annual Cost (EGP)"],
      [
        ["Annual appraisal data collection & consolidation", "Annual",    "200",  "60,000"],
        ["Individual skill gap analysis per employee",       "Per cycle", "150",  "75,000"],
        ["Training Needs Analysis (TNA) per department",     "Quarterly", "40",   "80,000"],
        ["ITP creation and distribution",                    "Annual",    "225",  "90,000"],
        ["Compliance & certification tracking",              "Monthly",   "20",   "48,000"],
        ["TOTAL — Current Manual Cost",                      "",          "635+", "353,000"],
      ],
      [3800, 1600, 1600, 2000]
    ),
    gap(),
    tbl(
      ["Activity", "With CMS", "Annual Cost (EGP)"],
      [
        ["Assessment data collection",  "Real-time / self-service", "~5,000"],
        ["Skill gap analysis",           "Instant, automated",       "0"],
        ["TNA generation",               "1-click report",           "~2,000"],
        ["ITP generation",               "Automated per employee",   "~2,000"],
        ["Certificate tracking",         "Automated expiry alerts",  "~1,000"],
        ["TOTAL — CMS Annual Cost",      "",                         "~10,000"],
      ],
      [3000, 3000, 3000]
    ),
    gap(),
    kpiRow([
      { value: "EGP 353K", label: "Current Annual Cost",    color: C.red   },
      { value: "EGP 10K",  label: "CMS Annual Cost",        color: C.green },
      { value: "EGP 343K", label: "Annual Saving",          color: C.navy  },
      { value: "< 6 mo",   label: "Payback Period",         color: C.blue  },
    ]),

    gap(),
    h2("5.2  Indirect Value"),
    tbl(
      ["Value Driver", "Mechanism", "Estimated Annual Value (EGP)"],
      [
        ["ISO / OPITO Compliance",    "Audit-ready competency evidence generated automatically — reduces preparation cost and external audit risk",       "50,000 – 100,000"],
        ["Talent Retention",          "5% turnover reduction × 150 employees × EGP 20K avg replacement cost",                                            "150,000"],
        ["Training Budget Efficiency","L&D spend directed only at verified gaps — eliminates courses bought for already-proficient employees",             "80,000 – 120,000"],
        ["Succession Planning",       "Real-time readiness scores enable identifying high-performers months before vacancies occur",                       "High strategic value"],
      ],
      [2200, 4000, 2800]
    ),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 6 — Market Opportunity
// ════════════════════════════════════════════════════════════════════════════
function sec6() {
  return [
    pgBreak(),
    h1("6. Market Opportunity — Egypt Oil, Gas & Energy Sector"),

    h2("6.1  Sector Workforce Landscape"),
    par("Egypt's energy sector is one of the largest employers of technical professionals in the MENA region:"),
    gap(),
    barChart(
      "Egypt Energy Sector — Estimated Technical Workforce by Segment",
      [
        { label: "Engineering & Service Cos.", value: 50000 },
        { label: "National Oil Companies",     value: 45000 },
        { label: "Electricity Generation",     value: 40000 },
        { label: "IOCs in Egypt",              value: 30000 },
        { label: "Downstream / Distribution",  value: 20000 },
        { label: "Petrochemicals",             value: 15000 },
        { label: "Renewable Energy",           value: 8000  },
      ],
      50000
    ),
    gap(),
    callout(
      "Total addressable workforce: 208,000+ technical professionals across 115+ entities. Capturing even 5% of this market at EGP 500/user/year = EGP 5,200,000 in annual platform revenue.",
      { bg: "EAF7EE", textColor: C.green, borderColor: C.green }
    ),

    gap(),
    h2("6.2  The Problem Every Sector Entity Faces"),
    par("Each entity in the sector faces the same challenges EPROM is solving internally:"),
    gap(),
    tbl(
      ["Challenge", "Current Reality in the Sector"],
      [
        ["Skill-to-role mapping",       "No system linking employee scores to job level requirements — done manually or not at all"],
        ["Assessment consistency",      "Appraisals vary by manager; no standardised scoring across departments"],
        ["Regulatory compliance",       "ISO, OPITO, NEBOSH require documented competency evidence — paper files are inadequate for audit"],
        ["Knowledge transfer crisis",   "Senior engineers are retiring — no data-driven succession pipeline to capture their knowledge"],
        ["Training ROI measurement",    "Training spend not linked to verified gaps; L&D effectiveness is unmeasurable"],
      ],
      [2500, 6500]
    ),

    gap(),
    h2("6.3  Competitive Landscape — No Dominant Local Competitor"),
    tbl(
      ["Solution", "Reality", "Gap"],
      [
        ["SAP SuccessFactors / Oracle HCM", "Priced for Fortune 500 (EGP 500K+/yr); 6-month implementation; no sector-specific Arabic framework", "Too expensive, too generic"],
        ["Local HR systems (Rotoye, Odoo)", "Built for payroll — no competency management or skill gap engine",                                    "Wrong product category"],
        ["Manual Excel tracking",           "Still dominant — no analytics, no automation, no audit trail",                                        "Not scalable"],
        ["EPROM CMS",                       "Purpose-built for energy sector; Arabic-market pricing; deployable in weeks",                         "The gap EPROM fills"],
      ],
      [2500, 4000, 2500]
    ),
  ];
}

// ── Flywheel diagram table ────────────────────────────────────────────────────
function flywheelCell(num, label, isArrow) {
  if (isArrow) {
    return new TableCell({
      width: { size: 320, type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, color: "E8EDF3" },
      margins: { top: mm(4), bottom: mm(4), left: mm(1), right: mm(1) },
      borders: noBorders(),
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txr("->", { bold: true, size: 14, color: C.navy })] })],
    });
  }
  const lines = label.split("\n");
  const children = [new Paragraph({ alignment: AlignmentType.CENTER, children: [txr(num, { bold: true, size: 13, color: C.gold })] })];
  for (const line of lines) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [txr(line, { size: 8.5, color: "A8C0DE", italic: true })] }));
  }
  return new TableCell({
    width: { size: 1400, type: WidthType.DXA },
    shading: { type: ShadingType.SOLID, color: C.navy },
    margins: { top: mm(4), bottom: mm(4), left: mm(3), right: mm(3) },
    borders: noBorders(),
    verticalAlign: VerticalAlign.CENTER,
    children: children,
  });
}
function flywheelTable() {
  const cells = [
    flywheelCell("1", "Employee\nAssessed", false),
    flywheelCell("->", "", true),
    flywheelCell("2", "Gap\nIdentified", false),
    flywheelCell("->", "", true),
    flywheelCell("3", "CMS Recommends\nSpecific Course", false),
    flywheelCell("->", "", true),
    flywheelCell("4", "Manager Sees\nITP Report", false),
    flywheelCell("->", "", true),
    flywheelCell("5", "Training Center\nEnrollment", false),
  ];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: cells })] });
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 7 — Training Center Revenue
// ════════════════════════════════════════════════════════════════════════════
function sec7() {
  return [
    pgBreak(),
    h1("7. Training Center Revenue Model"),

    h2("7.1  The Flywheel Effect"),
    gap(),
    flywheelTable(),
    gap(),
    par("This is not a passive referral. The system explicitly links each identified skill gap to a training course in the database. Every ITP report generated is a pre-qualified training referral — the employee and their manager already know exactly which course is needed and why."),

    gap(),
    h2("7.2  Revenue Scenarios"),
    gap(),
    tbl(
      ["Scenario", "Employees", "Gaps/Cycle", "Enrollment Rate", "Enrollments/Year", "Revenue (EGP)"],
      [
        ["A — EPROM internal only",      "150",   "375",   "40%", "150",   "525,000"],
        ["B — 5 licensed companies",     "1,000", "2,500", "40%", "1,000", "3,500,000"],
        ["C — 10+ companies (SaaS)",     "2,000", "5,000", "40%", "2,000", "7,000,000"],
      ],
      [2600, 1100, 1100, 1300, 1500, 1400]
    ),
    gap(),
    callout("Average training course revenue assumed at EGP 3,500 per enrollment based on current EPROM Training Center pricing."),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 8 — Case Study
// ════════════════════════════════════════════════════════════════════════════
function sec8() {
  return [
    pgBreak(),
    h1("8. Case Study — Simulated Numbers"),
    callout("All figures below are simulated projections based on system capabilities and comparable sector deployments. They represent realistic outcomes at the stated headcount.", { bg: C.lightBg }),

    gap(),
    h2("8.1  Stage 1 — EPROM Internal Deployment (Months 1–6)"),
    h3("Starting Conditions"),
    tbl(
      ["Parameter", "Value"],
      [
        ["Total employees",     "150"],
        ["Org levels covered",  "8 (FR → GM)"],
        ["Skills in catalog",   "45 across 6 categories"],
        ["Job profiles",        "12"],
        ["Departments",         "6"],
      ],
      [4500, 4500]
    ),

    gap(),
    h3("After 90 Days of Operation"),
    gap(),
    kpiRow([
      { value: "85%", label: "Baseline Assessment Complete",  color: C.navy  },
      { value: "74%", label: "Employees With Gap Identified", color: C.blue  },
      { value: "412", label: "Total Skill Gaps Found",        color: C.red   },
      { value: "67%", label: "Avg Org Readiness Score",       color: C.amber },
    ]),
    gap(),
    tbl(
      ["Metric", "Simulated Result"],
      [
        ["Employees with completed baseline assessment",            "127 / 150  (85%)"],
        ["Employees with at least one skill gap",                   "94 / 127  (74%)"],
        ["Total skill gaps identified across org",                  "412"],
        ["Employees with auto-generated ITP",                       "94"],
        ["Critical skills — no employees at required level",        "8 skills flagged"],
        ["Time to produce first org-wide TNA report",               "4 minutes"],
        ["Hours saved vs. manual process in 90 days",              "380 hours"],
        ["Training enrollments from CMS-generated ITPs (90 days)", "62 enrollments"],
        ["Training center revenue from CMS (90 days)",             "EGP 217,000"],
        ["Employees identified 'Ready Now' for promotion",          "14"],
        ["Employees with approaching certificate expiry — alerted", "7"],
      ],
      [5500, 3500]
    ),

    gap(),
    h3("6-Month Financial Summary — Phase 1"),
    tbl(
      ["Item", "Amount (EGP)"],
      [
        ["HR / L&D hours saved (6 months)",                       "180,000"],
        ["Training center revenue from ITP-driven enrollments",   "434,000"],
        ["System development cost (one-time investment)",         "(150,000)"],
        ["NET 6-MONTH BENEFIT",                                   "EGP 464,000"],
      ],
      [6500, 2500]
    ),

    gap(),
    pgBreak(),
    h2("8.2  Stage 2 — Egypt Market Expansion (Months 7–24)"),
    h3("Go-to-Market Approach"),
    bul("Use EPROM's 90-day internal data as proof of concept for external pitches"),
    bul("Target EGPC subsidiaries, EGAS, and 3 IOCs operating in Egypt as first pilot customers"),
    bul("License at EGP 20,000 / company / year (25–500 employees tier)"),
    bul("Bundle with preferred-partner training rates from EPROM Training Center"),
    gap(),

    h3("Year-by-Year Expansion"),
    tbl(
      ["Metric", "Year 1", "Year 2", "Year 3"],
      [
        ["Licensed companies",        "7",           "15",          "30"],
        ["Platform license revenue",  "EGP 140,000", "EGP 300,000", "EGP 600,000"],
        ["Training referral revenue", "EGP 1,225,000","EGP 2,625,000","EGP 5,250,000"],
        ["Total external revenue",    "EGP 1,365,000","EGP 2,925,000","EGP 5,850,000"],
      ],
      [3000, 2000, 2000, 2000]
    ),
    gap(),

    h3("3-Year Cumulative Revenue Breakdown"),
    gap(),
    barChart(
      "3-Year Cumulative Net Revenue by Source (EGP thousands)",
      [
        { label: "Training Referral — External", value: 9100, suffix: "K" },
        { label: "Internal Training Uplift",      value: 1302, suffix: "K" },
        { label: "Internal Cost Savings",         value: 1029, suffix: "K" },
        { label: "Platform Licenses — External",  value: 1040, suffix: "K" },
      ],
      9100, C.navy, C.gold
    ),
    gap(),
    tbl(
      ["Revenue Source", "Year 1", "Year 2", "Year 3", "3-Year Total"],
      [
        ["Internal cost savings",      "343,000",   "343,000",   "343,000",   "1,029,000"],
        ["Internal training uplift",   "434,000",   "434,000",   "434,000",   "1,302,000"],
        ["Platform license revenue",   "140,000",   "300,000",   "600,000",   "1,040,000"],
        ["Training referral revenue",  "1,225,000", "2,625,000", "5,250,000", "9,100,000"],
        ["Less: dev cost (one-time)",  "(150,000)", "—",         "—",         "(150,000)"],
        ["NET TOTAL (EGP)",            "1,992,000", "3,702,000", "6,627,000", "12,321,000"],
      ],
      [3000, 1500, 1500, 1500, 1500]
    ),
    gap(),
    kpiRow([
      { value: "EGP 2.0M",  label: "Year 1 Net",     color: C.navy  },
      { value: "EGP 3.7M",  label: "Year 2 Net",     color: C.blue  },
      { value: "EGP 6.6M",  label: "Year 3 Net",     color: C.green },
      { value: "EGP 12.3M", label: "3-Year Total",   color: C.gold.replace("C9", "A0") },
    ]),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  SECTION 9 — Strategic Recommendation
// ════════════════════════════════════════════════════════════════════════════
function sec9() {
  const steps = [
    ["Authorise Go-Live",               "The system is deployment-ready pending 3 IT configuration tasks. Total effort: 2–3 IT-days. No code changes required."],
    ["Designate a CMS Administrator",   "Assign one HR manager to own data entry: Skills Catalog, Job Profiles, employee assignments. Estimated onboarding: 1 training day."],
    ["Pilot with One Department",       "Choose the largest technical department. Run a full assessment cycle in 30 days, produce the first ITP reports, and document time savings — this data becomes the proof of concept for external market pitches."],
    ["Approach Two Peer Companies",     "At 90 days, use EPROM's internal results to open pilot conversations with 2 sector peers (e.g. an EGPC subsidiary and one IOC). Offer a free 3-month trial with a preferred-partner training agreement attached."],
  ];

  return [
    pgBreak(),
    h1("9. Strategic Recommendation"),
    h2("Immediate Actions — Next 30 Days"),
    gap(),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: steps.map(([title, body], i) => new TableRow({ children: [
        new TableCell({
          width: { size: 700, type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, color: C.navy },
          borders: { ...noBorders(), bottom: solidBorder(C.white, 6) },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [txr(String(i + 1), { bold: true, size: 18, color: C.gold })] })],
        }),
        new TableCell({
          shading: { type: ShadingType.SOLID, color: i % 2 === 0 ? C.lightBg : C.white },
          margins: { top: mm(4), bottom: mm(4), left: mm(6), right: mm(6) },
          borders: { ...noBorders(), bottom: solidBorder(C.tblBdr, 4) },
          children: [
            new Paragraph({ children: [txr(title, { bold: true, size: 11, color: C.navy })] }),
            par(body, { align: AlignmentType.LEFT, spaceAfter: 2 }),
          ],
        }),
      ]})),
    }),

    gap(),
    h2("12-Month Vision"),
    callout(
      "Position EPROM not just as an energy company, but as the provider of the competency management standard for Egypt's energy sector — with the Training Center as the revenue engine that runs on the data the platform generates.\n\nThe CMS is not just an internal tool. It is the foundation of a new business line.",
      { bg: C.navy, textColor: C.white, borderColor: C.gold }
    ),

    gap(),
    h2("Compliance Standards Alignment"),
    tbl(
      ["Standard", "How the CMS Supports Compliance"],
      [
        ["ISO 9001:2015 — Clause 7.2 (Competence)", "Documented evidence of competency determination and training effectiveness — audit-ready instantly"],
        ["ISO 55001 — Asset Management",             "Skills linked to asset-critical roles; gap analysis per organisational level"],
        ["OPITO Standards",                           "Certificate tracking with expiry alerts; assessment scheduling per competency type"],
        ["Egyptian Labour Law",                       "Documented training plans and evidence of professional development for every employee"],
        ["Corporate Governance",                      "Full audit trail: assessment records with timestamps, rater identity, and score history"],
      ],
      [3500, 5500]
    ),
    gap(),
    callout("Report prepared by Tariq Salama — EPROM CMS System Owner  |  tarekmoh123@gmail.com  |  May 2026", { bg: "F0F4F8", textColor: "777777" }),
  ];
}

// ════════════════════════════════════════════════════════════════════════════
//  ASSEMBLE & WRITE
// ════════════════════════════════════════════════════════════════════════════
async function build() {
  const children = [
    ...coverPage(),
    ...sec1(),
    ...sec2(),
    ...sec3(),
    ...sec4(),
    ...sec5(),
    ...sec6(),
    ...sec7(),
    ...sec8(),
    ...sec9(),
  ];

  const doc = new Document({
    creator:     "Tariq Salama",
    title:       "EPROM CMS — CEO Executive Briefing Report",
    description: "Deployment challenges, ROI, Egypt energy market strategy, and case study.",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: pt(11), color: C.slate } },
      },
    },
    sections: [{
      properties: {
        page: { margin: { top: inch(1), bottom: inch(1), left: inch(1.1), right: inch(1.1) } },
      },
      headers: {
        default: new Header({
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [new TableRow({ children: [
                new TableCell({
                  borders: { ...noBorders(), bottom: solidBorder(C.gold, 6) },
                  children: [new Paragraph({ children: [txr("EPROM Competency Management System — CEO Executive Briefing  |  May 2026", { size: 8.5, color: "999999" })] })],
                }),
              ]})],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [new TableRow({ children: [
                new TableCell({
                  width: { size: 7000, type: WidthType.DXA },
                  borders: { ...noBorders(), top: solidBorder(C.gold, 6) },
                  children: [new Paragraph({ children: [txr("INTERNAL — EXECUTIVE USE ONLY", { size: 8.5, color: "AAAAAA", bold: true })] })],
                }),
                new TableCell({
                  width: { size: 2000, type: WidthType.DXA },
                  borders: { ...noBorders(), top: solidBorder(C.gold, 6) },
                  children: [new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      txr("Page ", { size: 9, color: "888888" }),
                      new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: pt(9), color: "888888" }),
                    ],
                  })],
                }),
              ]})],
            }),
          ],
        }),
      },
      children,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  writeFileSync("EPROM_CEO_Report_2026.docx", buf);
  console.log("Done — EPROM_CEO_Report_2026.docx written (" + Math.round(buf.length / 1024) + " KB)");
}

build().catch(err => { console.error(err); process.exit(1); });
