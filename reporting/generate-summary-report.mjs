/**
 * EPROM CMS — Executive Summary Report (Straight to the Point)
 * Sections:
 *   1. What Has Been Done
 *   2. What It Achieves When Live
 *   3. Obstacles & How to Manage Them
 *   4. Go-Live Roadmap (from 1 July 2026) — Cloud vs On-Premise
 *   5. Cost Estimation
 *   6. Recommendation
 *
 * Run: node reporting/generate-summary-report.mjs
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageBreak,
  ShadingType,
  Header,
  Footer,
} from "docx";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Colors ──────────────────────────────────────────────────────
const NAVY = "1B2A4A";
const GOLD = "C9A84C";
const WHITE = "FFFFFF";
const LIGHT = "F5F5F5";
const DARK = "333333";
const GREEN = "2E7D32";
const RED = "C62828";
const BLUE = "1565C0";
const GRAY = "757575";

// ─── Helpers ─────────────────────────────────────────────────────
function p(text, o = {}) {
  const {
    bold = false,
    italic = false,
    size = 22,
    color = DARK,
    alignment = AlignmentType.LEFT,
    spacing = { after: 120 },
  } = o;
  return new Paragraph({
    alignment,
    spacing,
    children: [new TextRun({ text, bold, italics: italic, size, color, font: "Calibri" })],
  });
}

function bullet(text, o = {}) {
  const { bold = false, size = 22, color = DARK } = o;
  return new Paragraph({
    spacing: { after: 60 },
    indent: { left: 520 },
    children: [
      new TextRun({ text: "•  ", bold: true, size, color: GOLD, font: "Calibri" }),
      new TextRun({ text, bold, size, color, font: "Calibri" }),
    ],
  });
}

function h1(num, text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 160 },
    children: [new TextRun({ text: `${num}. ${text}`, bold: true, size: 34, color: NAVY, font: "Calibri" })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: NAVY, font: "Calibri" })],
  });
}

function divider() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: GOLD } },
    children: [new TextRun({ text: "", size: 4 })],
  });
}

function table(headers, rows, opts = {}) {
  const { colShades = {} } = opts;
  const bs = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: bs, bottom: bs, left: bs, right: bs };

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (hd) =>
        new TableCell({
          borders,
          shading: { type: ShadingType.SOLID, color: NAVY },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 50, after: 50 },
              children: [new TextRun({ text: hd, bold: true, size: 19, color: WHITE, font: "Calibri" })],
            }),
          ],
        })
    ),
  });

  const dataRows = rows.map((row, ri) => {
    const isTotal = String(row[0]).toUpperCase().startsWith("TOTAL") || row[0] === "NET BENEFIT";
    return new TableRow({
      children: row.map((cell, ci) => {
        let shade;
        if (isTotal) shade = { type: ShadingType.SOLID, color: "EBE3C9" };
        else if (colShades[ci]) shade = { type: ShadingType.SOLID, color: colShades[ci] };
        else if (ri % 2 === 0) shade = { type: ShadingType.SOLID, color: LIGHT };
        return new TableCell({
          borders,
          shading: shade,
          children: [
            new Paragraph({
              spacing: { before: 36, after: 36 },
              indent: { left: 70 },
              children: [
                new TextRun({ text: String(cell), size: 19, color: DARK, bold: isTotal, font: "Calibri" }),
              ],
            }),
          ],
        });
      }),
    });
  });

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...dataRows] });
}

function spacer(before = 160) {
  return new Paragraph({ spacing: { before }, children: [] });
}

// ─── Standard header/footer ──────────────────────────────────────
const stdHeader = new Header({
  children: [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: "EPROM CMS — Executive Summary & Go-Live Plan", italics: true, size: 15, color: GRAY, font: "Calibri" })],
    }),
  ],
});
const stdFooter = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: "EPROM Competency Management System — Confidential / Internal Use", size: 15, color: GRAY, font: "Calibri" })],
    }),
  ],
});

// ═══════════════════════════════════════════════════════════════════
const doc = new Document({
  styles: { default: { document: { run: { font: "Calibri", size: 22, color: DARK } } } },
  sections: [
    // ─── COVER ─────────────────────────────────────────────────
    {
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: [
        spacer(2600),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "EPROM", bold: true, size: 72, color: NAVY, font: "Calibri" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [new TextRun({ text: "Competency Management System", bold: true, size: 40, color: GOLD, font: "Calibri" })],
        }),
        divider(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 80 },
          children: [new TextRun({ text: "EXECUTIVE SUMMARY & GO-LIVE PLAN", bold: true, size: 30, color: NAVY, font: "Calibri" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 40 },
          children: [new TextRun({ text: "Status • Benefits • Obstacles • Roadmap (from 1 July 2026) • Cost", size: 21, color: GRAY, font: "Calibri" })],
        }),
        spacer(1800),
        divider(),
        p("Prepared by: Tariq Salama — System Owner", { alignment: AlignmentType.CENTER, spacing: { after: 50 } }),
        p("Date: 10 June 2026", { alignment: AlignmentType.CENTER, spacing: { after: 50 } }),
        p("Classification: Internal — Executive Use", { alignment: AlignmentType.CENTER, color: RED, bold: true }),
      ],
    },

    // ─── BODY ──────────────────────────────────────────────────
    {
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      headers: { default: stdHeader },
      footers: { default: stdFooter },
      children: [
        // ── At a glance ──
        h1("0", "At a Glance"),
        divider(),
        p(
          "The EPROM Competency Management System (CMS) is a working web application that digitizes the full employee skill cycle — defining required skills per role, assessing each employee, and auto-generating training plans and career paths. The software is built and functional. What remains is a controlled deployment to put it in front of EPROM staff for internal use.",
          { size: 23 }
        ),
        spacer(120),
        table(
          ["Item", "Status"],
          [
            ["Software build (all modules)", "Complete and functional"],
            ["Readiness for internal go-live", "~95% — pending deployment setup"],
            ["Earliest internal go-live (Cloud path)", "Late July 2026"],
            ["Earliest internal go-live (On-Premise path)", "Late September 2026"],
            ["One-time setup cost (Cloud path)", "~EGP 0–20,000"],
            ["Annual running cost (Cloud, 4,000 users)", "~EGP 42,000–84,000"],
            ["Annual saving vs. current manual process", "~EGP 6 million"],
          ]
        ),

        // ── 1. What has been done ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("1", "What Has Been Done"),
        divider(),
        p("The full application has been designed, built, and is operating against a live cloud database. Delivered work:", { size: 23 }),

        h2("1.1  Functional Modules Built"),
        table(
          ["Module", "What It Does"],
          [
            ["Skills Catalog", "All technical & behavioral competencies on a 1–5 proficiency scale"],
            ["Job Profiles", "Maps each org level (FR → GM) to the skills and level it requires"],
            ["360° Assessments", "Self (10%) + Peer (30%) + Manager (60%) weighted scoring"],
            ["Technical Assessments", "Written exams, managerial interviews, practical demonstrations"],
            ["Evidence Portal", "Employees submit work records; managers approve and score"],
            ["Skill Gap Reports", "Instant gap of each employee vs. their required level"],
            ["Individual Training Plans (ITP)", "Auto-generated from gaps, linked to courses"],
            ["Career Path Planner", "Readiness to advance to the next org level"],
            ["Assessment Scheduling", "Defines how/when each skill is re-assessed"],
            ["CEO & Manager Dashboards", "Real-time org-wide and team analytics"],
            ["Bulk Employee Import", "Onboard hundreds of staff via Excel in minutes"],
          ]
        ),

        h2("1.2  Engineering & Infrastructure Completed"),
        bullet("Full React + TypeScript front-end, responsive for desktop and tablet."),
        bullet("Firebase Firestore database live, with role-based access (Admin / CEO / Manager / Employee)."),
        bullet("Firestore security rules generated from a template and ready to deploy."),
        bullet("Organization hierarchy seeded as a full company org chart (bilingual EN/AR), HQ structure in place."),
        bullet("Department / section data-visibility scoping enforced (staff see only their own scope; Admin/CEO see all)."),
        bullet("Bulk Excel import pipeline tested for mass employee onboarding."),
        bullet("Production deployment guide written for both Cloud and self-hosted (on-premise) paths."),

        // ── 2. What it achieves ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("2", "What It Achieves When Live"),
        divider(),
        p("Once in internal use, the system replaces a slow, manual, spreadsheet-driven process with a real-time platform. Concrete outcomes:", { size: 23 }),

        bullet("One source of truth — every employee's required vs. actual skill level, visible instantly.", { bold: true }),
        bullet("Automatic skill-gap analysis across all employees — no manual consolidation."),
        bullet("Auto-generated Individual Training Plans (ITP) per employee, linked to specific courses."),
        bullet("Departmental Training Needs Analysis (TNA) produced in minutes instead of weeks."),
        bullet("Career-path & succession readiness scoring (Ready Now / 1–2 yrs / 3–5 yrs / Not Ready)."),
        bullet("Audit-ready competency records supporting ISO 9001 (Clause 7.2), ISO 55001, and OPITO compliance."),
        bullet("Real-time CEO and manager dashboards for data-driven L&D and promotion decisions."),
        bullet("A direct pipeline from each identified skill gap to a Training Center enrollment."),

        spacer(120),
        h2("2.1  Quantified Impact (4,000 employees)"),
        table(
          ["Measure", "Today (Manual)", "With CMS"],
          [
            ["Annual competency-admin cost", "~EGP 6.19 million", "~EGP 0.18 million"],
            ["Skill-gap analysis", "1 hr × 4,000 staff", "Instant / automated"],
            ["Org-wide TNA report", "Weeks of analyst work", "~6 minutes"],
            ["ITP creation & distribution", "1.5 hr × 4,000 staff", "Auto-generated"],
            ["NET BENEFIT", "—", "~EGP 6 million / year saved"],
          ]
        ),
        spacer(80),
        p("Payback period against the one-time development cost is under two weeks of operation.", { bold: true, color: GREEN, size: 23 }),

        // ── 3. Obstacles ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("3", "Obstacles & How to Manage Them"),
        divider(),
        p("The remaining items are deployment and adoption tasks, not software defects. Each has a clear owner and mitigation.", { size: 23 }),

        h2("3.1  Technical Blockers (must clear before go-live)"),
        table(
          ["Obstacle", "Why It Matters", "How to Manage", "Owner / Effort"],
          [
            ["Authorized domain", "Logins are rejected from an unknown domain", "Add cms.eprom.com.eg to the authorized list", "Owner — 5 min"],
            ["HTTPS / SSL certificate", "Login requires a secure connection", "Free Let's Encrypt or company CA certificate", "IT — 1–2 hrs"],
            ["Production config file", "App can't reach the database without it", "Create .env.production from documented keys", "Owner — 15 min"],
            ["Firewall outbound (Cloud path)", "App must reach the cloud database", "Allow outbound HTTPS to the database endpoints", "IT — 1 hr"],
          ]
        ),

        h2("3.2  Hardening Tasks (week 1, non-blocking)"),
        bullet("Idle session auto-logout (30-minute timeout) — ~4 hrs developer."),
        bullet("Network-outage error banner so users aren't confused on dropouts — ~3 hrs developer."),
        bullet("HTTP security headers (anti-clickjacking, CSP) on the web server — ~2 hrs IT."),

        h2("3.3  Organizational Obstacles"),
        table(
          ["Obstacle", "How to Manage"],
          [
            ["Change management — 4,000 staff moving off spreadsheets", "Department-by-department rollout; short manager briefings; start with one pilot dept"],
            ["Data quality — existing skill data is messy", "Clean & standardize once, then mass-import via the Excel template"],
            ["User adoption & trust in the scores", "Transparent scoring rules; managers validate the first cycle before publishing"],
            ["Single-owner dependency", "Document deployment & admin steps; train one HR admin as backup champion"],
            ["IT coordination", "Use the written deployment guide; pre-agree server/network tasks with IT"],
          ]
        ),

        h2("3.4  Technical Debt (after launch, not blocking)"),
        bullet("Move heavy calculations (TNA, career path) server-side for scale beyond 200 concurrent users."),
        bullet("Stronger role security via Firebase Auth custom claims (Cloud path)."),
        bullet("Loading skeletons and subordinate-lookup speed-ups for polish at scale."),

        // ── 4. Roadmap ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("4", "Go-Live Roadmap — from 1 July 2026"),
        divider(),
        p(
          "Two paths to internal go-live. The Cloud path reuses the current build and is live within weeks. The On-Premise path keeps all data on EPROM servers but requires a back-end rewrite first, pushing go-live later. Both can start on 1 July 2026.",
          { size: 23 }
        ),

        h2("4.1  Option A — Cloud (Firebase) — RECOMMENDED for now"),
        p("Uses the system exactly as built. Fastest, lowest cost, no hardware. Data resides on Google Cloud (GDPR-compliant data centers).", { size: 22 }),
        table(
          ["Phase", "Dates (2026)", "Activities"],
          [
            ["0 — Setup & blockers", "1 Jul – 10 Jul", "Domain, SSL, production config, firewall, security headers"],
            ["1 — Pilot", "13 Jul – 22 Jul", "Smoke test with 5–10 users (HR + IT + one dept); fix feedback"],
            ["2 — Data load", "23 Jul – 30 Jul", "Load skills, job profiles; bulk-import employees; assign profiles"],
            ["GO-LIVE (internal)", "31 Jul 2026", "Open to pilot department; first assessment cycle begins"],
            ["3 — Full rollout", "Aug – Sep", "Department-by-department onboarding of all 4,000 staff"],
            ["4 — First reports", "Sep 2026", "First org-wide TNA, ITPs, and board competency report"],
          ]
        ),
        spacer(80),
        p("Cloud path total time to internal go-live: ~4 weeks. Effort: ~20–30 IT hours + ~30–40 developer hours.", { bold: true, color: BLUE }),

        h2("4.2  Option B — On-Premise (all data on EPROM servers)"),
        p("Keeps 100% of data inside the company. Requires rewriting the back-end from Firebase to PostgreSQL + a local login server, plus server hardware. Choose this only if corporate data policy mandates it.", { size: 22 }),
        table(
          ["Phase", "Dates (2026)", "Activities"],
          [
            ["0 — IT provisioning", "1 Jul – 14 Jul", "Server, OS, network, install Nginx / Node / PostgreSQL"],
            ["1 — Back-end rewrite", "1 Jul – 22 Aug", "Rebuild data layer on PostgreSQL + local authentication (8 wks)"],
            ["2 — Deploy & migrate", "25 Aug – 5 Sep", "Deploy app, load schema, migrate data, enable HTTPS"],
            ["3 — Testing & sign-off", "8 Sep – 19 Sep", "Security checks, backups, pilot test"],
            ["GO-LIVE (internal)", "25 Sep 2026", "Open to staff; cloud build decommissioned"],
            ["4 — Full rollout", "Oct 2026", "Onboard all 4,000 staff; first reports"],
          ]
        ),
        spacer(80),
        p("On-Premise path total time to internal go-live: ~12 weeks (driven by the back-end rewrite).", { bold: true, color: BLUE }),

        h2("4.3  Recommended Sequence"),
        bullet("Go live on the Cloud path on 31 July 2026 to capture savings immediately.", { bold: true }),
        bullet("Run internally on Cloud while evaluating whether data policy truly requires on-premise."),
        bullet("If required, execute the On-Premise migration as a Phase-2 project later in 2026 — with zero downtime to users."),

        // ── 5. Cost ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("5", "Cost Estimation"),
        divider(),

        h2("5.1  Cloud Path (Recommended)"),
        table(
          ["Item", "Type", "Estimated Cost"],
          [
            ["Domain (subdomain of eprom.com.eg)", "One-time", "EGP 0 (already owned)"],
            ["SSL certificate (Let's Encrypt)", "One-time", "EGP 0"],
            ["Setup / config labor", "One-time", "Internal IT + developer hours"],
            ["Cloud database & hosting (4,000 users)", "Annual", "EGP 30,000–72,000"],
            ["Maintenance & improvements (AI tooling)", "Annual", "~EGP 12,000"],
            ["TOTAL annual running cost", "Annual", "~EGP 42,000–84,000"],
          ]
        ),
        spacer(60),
        p("≈ EGP 3,500–7,000 per month all-in — under 0.2% of the ~EGP 6 million/year it saves.", { bold: true, color: GREEN }),

        h2("5.2  On-Premise Path"),
        table(
          ["Item", "Type", "Estimated Cost (EGP)"],
          [
            ["Server hardware (app + DB + backup, UPS, network)", "One-time capex", "810,000 – 1,250,000"],
            ["Back-end rewrite (Firebase → PostgreSQL)", "One-time dev", "150,000 – 250,000"],
            ["Software (PostgreSQL, Keycloak, Nginx — open source)", "Licensing", "0"],
            ["IT administration (1 FTE, server upkeep)", "Annual", "180,000 – 240,000"],
            ["Electricity + warranty / support", "Annual", "58,000 – 110,000"],
            ["TOTAL 3-year cost of ownership", "3-year", "~1,674,000 – 2,550,000"],
          ]
        ),
        spacer(60),
        p("On-premise costs roughly 9–14× the cloud path over three years. A lower-capex alternative is leasing colocation rack space (~EGP 15,000–30,000/month) instead of buying hardware.", { italic: true }),

        h2("5.3  Cost vs. Commercial Alternatives"),
        table(
          ["Solution", "Annual Infrastructure", "Licensing / Implementation"],
          [
            ["EPROM CMS (Cloud)", "EGP 42,000–84,000", "Negligible (in-house)"],
            ["SAP SuccessFactors", "$50,000–200,000", "$500,000+ implementation"],
            ["Oracle HCM Cloud", "$40,000–150,000", "$300,000+ setup"],
            ["Generic local HR SaaS", "EGP 30,000–80,000", "No competency module"],
          ]
        ),
        spacer(60),
        p("The EPROM CMS delivers enterprise-grade competency management at under 0.5% of the cost of SAP or Oracle.", { bold: true, color: GREEN, size: 23 }),

        // ── 6. Recommendation ──
        new Paragraph({ children: [new PageBreak()] }),
        h1("6", "Recommendation"),
        divider(),
        bullet("Approve internal go-live on the Cloud path with a target date of 31 July 2026.", { bold: true, size: 23 }),
        bullet("Assign one HR manager as CMS Administrator (data owner and internal champion)."),
        bullet("Start with a single pilot department, then roll out company-wide through August–September."),
        bullet("Defer the on-premise decision: revisit only if corporate data policy mandates it, and run it as a no-downtime Phase-2 migration."),
        spacer(200),
        p(
          "Bottom line: the system is built and the savings are real. The Cloud path turns it into live internal value within four weeks of starting on 1 July 2026, at a running cost that is a rounding error against the EGP 6 million it saves each year.",
          { bold: true, color: NAVY, size: 24 }
        ),
        spacer(300),
        divider(),
        p("Report prepared by Tariq Salama — EPROM CMS System Owner", { alignment: AlignmentType.CENTER, italic: true, size: 19, color: GRAY }),
        p("For questions or clarifications: tarekmoh123@gmail.com", { alignment: AlignmentType.CENTER, size: 19, color: GRAY }),
      ],
    },
  ],
});

const outputPath = path.join(__dirname, "EPROM_CMS_Summary_Report.docx");
const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(outputPath, buffer);
console.log(`\n✅ Summary report generated: ${outputPath}`);
console.log(`   File size: ${(buffer.length / 1024).toFixed(0)} KB\n`);
