# EPROM CMS — External Audit & Upgrade Plan (UX · Accessibility · ISO · Features · Code)

> **Auditor's framing.** This is an independent review of the *product experience* — the
> workflows an Admin, Manager, CEO and Employee actually walk through, how options are
> displayed and selected, how the system measures up against the relevant ISO / WCAG
> standards, and the maintainability of the code behind it.
>
> It is **complementary to, not a duplicate of,** [PRODUCTION_TASKS.md](PRODUCTION_TASKS.md)
> (which covers security, data-integrity, scalability and DevOps). Where the two overlap
> a cross-reference is given. Nothing here is a blocker for "the app runs"; everything
> here is a blocker for "the app is professional, auditable and inclusive."
>
> **Legend:** &nbsp; 🔴 Critical &nbsp;&nbsp; 🟠 High &nbsp;&nbsp; 🟡 Medium &nbsp;&nbsp; 🟢 Low / polish
>
> **Standards referenced:** WCAG 2.1 AA · EN 301 549 · ISO 9241-110/-171 (ergonomics &
> accessibility of interactive systems) · ISO/IEC 25010 (software product quality) ·
> ISO 9001:2015 §7.2 (Competence) · ISO 10018 (people engagement & competence) ·
> ISO 30414 (human-capital reporting) · ISO 8601 (dates).

---

## 0 — Executive Summary

| Area | Verdict | Headline finding |
|---|---|---|
| **Workflow** | 🟠 Solid backbone, leaky edges | Core competency loop (profile → assess → gap → ITP → career) is coherent, but the 360°/appraisal capture has a data-integrity defect (unanswered = "No") and inconsistent rating scales across screens. |
| **Accessibility (WCAG/EN 301 549)** | 🔴 Not yet AA | Icon-only controls without labels, colour used as the *only* signal, labels not programmatically tied to inputs, no skip-link, modals without focus management. |
| **Internationalisation** | 🔴 Gap for an Egyptian operator | UI is English-only with no `lang`/`dir`, no Arabic interface, no RTL — despite bilingual data already in the model (`Department.nameAr`). |
| **ISO 9001 / 10018 competence records** | 🟠 Close | Evidence & evaluation are captured, but objectivity safeguards (peer anonymity), record immutability and an exportable competence certificate are missing. |
| **Features / options** | 🟠 Functional, thin on self-service | No global search, no language/theme/notification preferences, "Export CV" is a raw `window.print()`, no employee data export, no reporting/print views. |
| **Code quality (ISO/IEC 25010)** | 🟠 Works, hard to maintain | `AdminPanel.tsx` (3,472 lines) and `store.ts` (2,650 lines) are god-modules; appraisal answers are serialised into a free-text comment string; scattered `any`. |

Recommended sequencing is in [§7](#7--recommended-execution-order).

---

## 1 — Workflow & User-Experience Findings

### 1.1 Critical workflow defects

| # | Finding | Evidence | Fix | Pri |
|---|---------|----------|-----|-----|
| W1.1 | **Annual-appraisal checklist defaults every question to "No".** Answers initialise to `Array(n).fill(false)` and the *No* button renders as selected (red) whenever the value is `false`. An assessor who submits without touching a row silently scores the employee **0%** while the UI looks like a deliberate "all No". There is no "unanswered" state. | [BehavioralAssessment.tsx:55](pages/BehavioralAssessment.tsx#L55), [:196](pages/BehavioralAssessment.tsx#L196), [:481-491](pages/BehavioralAssessment.tsx#L481-L491) | Make the control tri-state (`null` / yes / no); block submit until every item is answered; show "X of N answered". | 🔴 |
| W1.2 | **Appraisal answers are packed into the free-text comment field** as `[APPRAISAL_DATA:true,false,...]\n<feedback>` and re-parsed by string surgery on read. Fragile, unqueryable, and corrupts if a user types `]` near the start. | [:233](pages/BehavioralAssessment.tsx#L233), [:168-188](pages/BehavioralAssessment.tsx#L168-L188) | Persist a structured `appraisalAnswers: boolean[]` field on the assessment doc (see C2.2). Keep the parser only as a read-time migration for legacy docs. | 🔴 |
| W1.3 | **Inconsistent measurement scales** confuse raters. The org uses a 1–5 *proficiency* scale (Awareness→Expert, [types.ts:38](types.ts#L38)), but 360° rating shows 1–5 *stars* labelled Poor→Outstanding ([:434](pages/BehavioralAssessment.tsx#L434)), and appraisal is a 0–100 % weighted score. Three different mental models for "how good." | — | Standardise on the 5-level proficiency vocabulary everywhere a competency is scored; show the proficiency label next to the star, not a separate Poor→Outstanding scale. | 🟠 |

### 1.2 360°/feedback experience

| # | Finding | Fix | Pri |
|---|---------|-----|-----|
| W1.4 | **Peer feedback is not anonymised.** The submit copy says *"Feedback will be shared with the employee and their manager"* ([:511](pages/BehavioralAssessment.tsx#L511)). Attributable peer ratings bias scores and violate 360° best practice (and ISO 10018 fairness). | Aggregate peer scores; never expose individual peer rater identity to the subject. | 🟠 |
| W1.5 | **Star fill is grey** (`text-slate-400 fill-slate-400`, [:429](pages/BehavioralAssessment.tsx#L429)) — weak affordance and poor contrast; a "filled" and "empty" star look almost identical. | Use an amber/gold fill (`amber-400`) for set stars; keep a visible focus ring. | 🟡 |
| W1.6 | **Success confirmations auto-dismiss in 3 s** ([:262](pages/BehavioralAssessment.tsx#L262)) with no persistent record that "you already evaluated X." Easy to double-submit perception. | Keep an inline "✓ submitted / update existing" badge until the form is changed; don't rely on a timed toast alone. | 🟡 |

### 1.3 Navigation & information architecture

| # | Finding | Fix | Pri |
|---|---------|-----|-----|
| W1.7 | **No breadcrumb / location cue** inside the deep Admin views (8 sub-views routed through one `AdminPanel` via a `view` prop, [App.tsx:531-538](App.tsx#L531-L538)). Users lose track of where they are. | Add a breadcrumb row (Admin ▸ Users ▸ Edit) and reflect the sub-view in the document title. | 🟡 |
| W1.8 | **Routing is hand-rolled tab state** (`activeTab`), so there are no shareable/bookmarkable URLs, no browser back/forward, and a refresh always lands on the role default. | Adopt the URL (hash or `react-router`) as the source of truth for `activeTab`. | 🟡 |
| W1.9 | **No global search.** Finding a user/skill/profile means knowing which admin sub-tab to open first. | Add a command-palette / global search (users, skills, departments, profiles). | 🟢 |
| W1.10 | **Certificate & evidence files are stored as base64 data-URLs** inside Firestore docs ([EmployeeDashboard.tsx:73-79](pages/EmployeeDashboard.tsx#L73-L79); EvidencePortal `readFileAsDataURL`). The migration notes already record this exploding doc size for avatars. | Move file bytes to Firebase Storage; keep only a URL in the doc. *(Cross-ref scalability.)* | 🟠 |

---

## 2 — Accessibility Audit (WCAG 2.1 AA / EN 301 549 / ISO 9241-171)

> Run `/accessibility-review` on the live pages for the full machine-checked pass; the
> below are the structural issues found by reading the components.

| # | WCAG ref | Finding | Evidence | Fix | Pri |
|---|----------|---------|----------|-----|-----|
| AX.1 | 4.1.2 Name, Role, Value | **Icon-only buttons have no accessible name** — the 5 star buttons, and several action icons, render only an SVG. Screen-reader users hear "button". | [BehavioralAssessment.tsx:418-432](pages/BehavioralAssessment.tsx#L418-L432) | Add `aria-label` (e.g. `aria-label="Rate 3 of 5"`) and `aria-pressed`. | 🔴 |
| AX.2 | 1.4.1 Use of Colour | **Colour is the sole signal** for Yes/No (green/red), compliant/gap (emerald/rose) and active tabs. Colour-blind users can't distinguish. | [:477-491](pages/BehavioralAssessment.tsx#L477-L491) | Pair colour with an icon/text (✓/✕, "Met"/"Gap"). | 🔴 |
| AX.3 | 1.3.1 / 3.3.2 | **`<label>` elements are not tied to inputs** — most forms use a bare `<label>` followed by an input with no `htmlFor`/`id`. Clicking the label doesn't focus; SR doesn't announce the field name. | e.g. [App.tsx:322-333](App.tsx#L322-L333), [BehavioralAssessment.tsx:388-401](pages/BehavioralAssessment.tsx#L388-L401) | Add matching `htmlFor`/`id` (or wrap the input inside the label). | 🟠 |
| AX.4 | 2.4.1 Bypass Blocks | **No "skip to main content" link**; keyboard users tab through the whole header on every page. | [Layout.tsx](components/Layout.tsx) | Add a visually-hidden skip link to `<main>`. | 🟠 |
| AX.5 | 2.4.3 / 2.1.2 | **Modals/dialogs (cert editor, delete confirms, detail views) appear to lack focus trapping, `role="dialog"`/`aria-modal`, Esc-to-close and focus-return.** | EmployeeDashboard cert modals; AdminPanel dialogs | Build one accessible `<Dialog>` primitive (focus trap, Esc, restore focus, labelled by title) and reuse. | 🟠 |
| AX.6 | 1.4.3 Contrast | **Body/secondary text uses `slate-400`/`slate-500` on white**, which fails 4.5:1 (e.g. helper text, descriptions, "Found" counters). | widespread (e.g. [EvaluationsHub.tsx:41](pages/EvaluationsHub.tsx#L41), [BehavioralAssessment.tsx:322](pages/BehavioralAssessment.tsx#L322)) | Darken secondary text to `slate-600`+; audit with a contrast tool. | 🟠 |
| AX.7 | 2.4.7 Focus Visible | Several custom buttons use `focus:outline-none` without a replacement ring ([:425](pages/BehavioralAssessment.tsx#L425)). | — | Always provide a visible `focus-visible:ring`. | 🟠 |
| AX.8 | 4.1.3 Status Messages | Success/error banners are plain `<div>`s; SR users aren't notified. (The permission banner already uses `role="alert"` — good, [App.tsx:551](App.tsx#L551).) | — | Add `role="status"`/`aria-live="polite"` to success toasts, `role="alert"` to errors. | 🟡 |
| AX.9 | 1.1.1 Non-text | Avatar `<img>` from `ui-avatars` and the login hero image — check meaningful `alt`. Hero is decorative (ok) but avatar should be `alt={user.name}`. | [Layout.tsx:110](components/Layout.tsx#L110) | Set descriptive/empty `alt` appropriately. | 🟢 |

---

## 3 — Internationalisation & Localisation (Egyptian operator)

| # | Finding | Evidence | Fix | Pri |
|---|---------|----------|-----|-----|
| I18N.1 | **No Arabic UI and no RTL support**, despite an Arabic energy-sector audience and bilingual data already modelled. The org chart already stores `nameAr`, but every label, button and message is hard-coded English. | [types.ts:226](types.ts#L226); strings throughout | Introduce an i18n layer (e.g. `react-i18next`), extract strings to `en`/`ar` bundles, set `<html lang dir>` and a language toggle in the header. | 🔴 |
| I18N.2 | **`<html lang>` / `dir` never set** — assistive tech and browsers can't pick pronunciation or direction. | `index.html` / `Layout` | Set `lang`/`dir` dynamically with the chosen locale. | 🟠 |
| I18N.3 | **Dates & numbers are not locale-formatted.** Display formatting is ad-hoc; persistence should be ISO 8601 (mostly is via `toISOString()`), but presentation should use `Intl.DateTimeFormat`/`NumberFormat`. | EmployeeDashboard date displays | Centralise a `formatDate`/`formatNumber` helper bound to the active locale. | 🟡 |
| I18N.4 | **Org-level & proficiency labels are English-only constants** ([types.ts:13](types.ts#L13), [:38](types.ts#L38)). | — | Move these to translation bundles so reports render bilingually. | 🟡 |

---

## 4 — ISO Competence-Management Conformance (9001 §7.2 / 10018 / 30414)

| # | Standard | Finding | Fix | Pri |
|---|----------|---------|-----|-----|
| ISO.1 | 9001 §7.2 (d) "retain documented information as evidence of competence" | **No immutable audit trail of who scored whom, when, and the before/after.** Assessments can be edited in place; there's no tamper-evident record. *(B7.1–B7.3 in PRODUCTION_TASKS cover the backend; this is the conformance driver.)* | Append-only `activityLogs` + an admin "Audit Trail" view; never hard-delete competence records (archive only — partly done via A2.4). | 🔴 |
| ISO.2 | 10018 (fairness/objectivity) | **Evaluator objectivity not safeguarded** — peers are identifiable (W1.4); a single manager rating carries 60 % weight with no second-rater or moderation step. | Anonymise peers; optionally require ≥2 raters or a calibration/sign-off before a 360 score is final. | 🟠 |
| ISO.3 | 9001 §7.2 / records | **No exportable "Certificate / Statement of Competence"** per employee — the appraisal and gap data live only on screen. | Generate a branded PDF competence statement (skills, levels achieved, evaluator, date, validity). Replaces the raw `window.print()` "Export CV" ([EmployeeDashboard.tsx:125](pages/EmployeeDashboard.tsx#L125)). | 🟠 |
| ISO.4 | 30414 (human-capital metrics) | **No workforce-competence reporting** (coverage %, avg gap by department, % staff meeting profile, training-completion rate) beyond on-screen analytics. | Add an exportable HC report (CSV/PDF) for L&D and executive review. | 🟡 |
| ISO.5 | 9001 §7.2 (c) "evaluate effectiveness of actions" | **ITP recommendations have no closed-loop effectiveness check** — a plan is generated but there's no "was the gap closed after training?" measurement. | Track pre/post scores against each `TrainingRecommendation` and surface effectiveness. | 🟡 |
| ISO.6 | Data subject rights (privacy, supports ISO 27701 / local law) | **No employee data export / "download my data"** despite holding PII + appraisals. | Add a self-service "Export my profile & assessments" action. | 🟡 |

---

## 5 — Features & Options the Product Is Missing

| # | Gap | Why it matters | Pri |
|---|-----|----------------|-----|
| F.1 | **User preferences / settings page** — no language, theme, notification or display preferences anywhere. | Baseline expectation; prerequisite for I18N.1 and AX. | 🟠 |
| F.2 | **Email / push notifications** — alerts are in-app only ([NotificationBell.tsx](components/NotificationBell.tsx)); due assessments and approvals are missed if the user doesn't log in. | Drives the assessment cadence the whole system is built on. | 🟠 |
| F.3 | **Printable / exportable reports** — competency matrix, department TNA, career roadmap, analytics are screen-only. | L&D and audit consumers need artefacts. | 🟠 |
| F.4 | **Bulk operations beyond user import** — no bulk assessment-plan assignment, bulk profile assignment, or bulk export. | Admin time at scale. | 🟡 |
| F.5 | **Onboarding / contextual help** — no first-run guidance, tooltips on the org/scale vocabulary, or empty-state explanations of *why* a screen is empty. | Reduces the "what do I do here" friction the multi-method model creates. | 🟡 |
| F.6 | **Dark mode / theming** — single hard light theme. | Accessibility (light sensitivity) + modern expectation. | 🟢 |
| F.7 | **CEO export** — CEO can view org analytics but cannot export them for board reporting. | Executive workflow. | 🟡 |

---

## 6 — Code Quality & Maintainability (ISO/IEC 25010)

| # | Finding | Evidence | Fix | Pri |
|---|---------|----------|-----|-----|
| C.1 | **God-modules.** `AdminPanel.tsx` is **3,472 lines** and `store.ts` is **2,650 lines** — both far past a maintainable threshold; every admin view lives in one file behind a `view` switch. | `AdminPanel.tsx`, `store.ts` | Split `AdminPanel` into per-view components (`UsersView`, `SkillsView`, …) and split `DataService` into domain modules (users/skills/assessments/plans) behind one facade. | 🟠 |
| C.2 | **In-band data serialisation.** Appraisal answers and a magic `skillId === 'annual-appraisal'` sentinel encode structured data inside string fields. | [BehavioralAssessment.tsx:233](pages/BehavioralAssessment.tsx#L233), [:237](pages/BehavioralAssessment.tsx#L237) | Promote to first-class typed fields (see W1.2); reserve a real `kind: 'ANNUAL_APPRAISAL'` rather than a sentinel id. | 🟠 |
| C.3 | **`any` leaks** weaken the type safety the rest of `types.ts` works hard for. | `icon: any` ([Layout.tsx:18](components/Layout.tsx#L18)), `certDetailView: any` ([EmployeeDashboard.tsx:67](pages/EmployeeDashboard.tsx#L67)) | Type icon props as `LucideIcon`; type the cert detail state. | 🟡 |
| C.4 | **No design-token / shared-component layer.** Long Tailwind class strings (incl. `rounded-none`/`rounded-sm` mixed) are copy-pasted; buttons, cards, badges, inputs, dialogs are re-declared per page. | widespread | Extract `<Button>`, `<Input>`, `<Card>`, `<Badge>`, `<Dialog>` primitives + token scale. Run `/design-system` to seed it. This single change also unblocks AX.5, AX.7 and W1.5 consistently. | 🟠 |
| C.5 | **Re-render via global `storeVersion` counter** — most pages recompute all memos on any store change. (Score caching A3.2 already mitigates the worst case.) | `useStoreData()` usage everywhere | Move toward selector-based subscriptions so a notification write doesn't recompute the whole dashboard. | 🟡 |
| C.6 | **Duplicated role/nav config** — the Admin/CEO/Employee nav arrays are written twice (desktop + mobile) in `Layout`. | [Layout.tsx:63-148](components/Layout.tsx#L63-L148) | Define the nav model once and render both. | 🟢 |

---

## 7 — Recommended Execution Order

```
Sprint 1 — Integrity & trust (do first; user-visible correctness)
   W1.1  Tri-state appraisal (no silent "all No")
   W1.2 / C.2  Structured appraisal storage
   ISO.1  Audit trail of competence records
   AX.1 / AX.2  Accessible names + colour-plus-icon

Sprint 2 — Accessibility AA baseline
   AX.3 AX.4 AX.5 AX.6 AX.7 AX.8  (label binding, skip-link, dialog primitive,
                                    contrast, focus, live regions)
   C.4  Shared component/token layer (carries AX fixes consistently)

Sprint 3 — Localisation (Egyptian rollout)
   I18N.1 I18N.2 I18N.3 I18N.4   (i18n layer, lang/dir, locale formatting, AR bundle)
   F.1   Settings page (hosts the language toggle)

Sprint 4 — Competence conformance & reporting
   ISO.3  PDF competence statement (replaces window.print)
   ISO.2  Peer anonymity + rater rules
   ISO.4 / F.3 / F.7  Exportable HC + analytics reports
   F.2   Email/push notifications

Sprint 5 — Workflow polish & maintainability
   W1.3 W1.5 W1.6 W1.7 W1.8 W1.9   (scale consistency, affordances, IA, URL routing, search)
   C.1 C.3 C.5 C.6                  (de-monolith, type cleanup, selectors, nav DRY)
   ISO.5 ISO.6 F.4 F.5 F.6          (ITP effectiveness, data export, bulk ops, onboarding, dark mode)
```

### Summary counts

| Section | 🔴 | 🟠 | 🟡 | 🟢 | Total |
|---------|:--:|:--:|:--:|:--:|:-----:|
| 1 Workflow / UX | 2 | 4 | 4 | 1 | 11 |
| 2 Accessibility | 2 | 5 | 1 | 1 | 9 |
| 3 i18n | 1 | 1 | 2 | 0 | 4 |
| 4 ISO competence | 1 | 2 | 3 | 0 | 6 |
| 5 Features | 0 | 3 | 3 | 1 | 7 |
| 6 Code quality | 0 | 3 | 2 | 1 | 6 |
| **Total** | **6** | **18** | **15** | **4** | **43** |

---

*Prepared as an independent UX / accessibility / ISO conformance review. Line references
are to the working tree at audit time and should be re-confirmed before each task is
picked up. For security, data-integrity, scalability and DevOps items see
[PRODUCTION_TASKS.md](PRODUCTION_TASKS.md).*
