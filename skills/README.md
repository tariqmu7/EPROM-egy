# EPROM Skills

This folder holds **Skill** definitions — the competency catalog that Job Profiles draw from. Each skill is authored once here, then attached to one or more job profiles in [`../job_profiles/`](../job_profiles/) with a required proficiency level (1–5).

## Model

Per the system data model, a **skill** is a single competency in the catalog with a 5-level proficiency scale and a defined assessment method. Job Profiles reference skills by name and assign each a `requiredLevel` (1–5); employees are then scored against those requirements to produce skill gaps, ITPs, and career paths.

## Structure

```
skills/
├── README.md       # this file
├── _TEMPLATE.md    # copy this to author a new skill
└── <skill-name>.md # one file per skill
```

## How to add a skill

1. Copy [`_TEMPLATE.md`](_TEMPLATE.md) into this folder.
2. Rename it to the skill (e.g. `payroll-administration.md`).
3. Fill in the name, category, assessment method, and the meaning of each proficiency level.

## Proficiency scale

`1 = Awareness · 2 = Basic · 3 = Intermediate · 4 = Advanced · 5 = Expert`

## Assessment methods

| Method | Description |
|---|---|
| `WRITTEN_EXAM` | Online exam via external link; scores imported |
| `INTERVIEW` | Structured manager interview |
| `PRACTICAL_DEMO` | Hands-on skill demonstration |
| `OJT_OBSERVATION` / `THREE_SIXTY_EVALUATION` | 360° behavioral observation |
| `WORK_RECORD_REVIEW` | Employee submits evidence; manager grades |

## Skill catalog

Reusable competencies — attach any of these to a job profile with a required level (1–5).

| Skill | Category | Assessment method |
|---|---|---|
| [Market Research & Competitive Intelligence](market-research-competitive-intelligence.md) | Business / Commercial | WRITTEN_EXAM |
| [Business Development Strategy](business-development-strategy.md) | Business / Commercial | INTERVIEW |
| [Marketing Program Management](marketing-program-management.md) | Business / Commercial | WORK_RECORD_REVIEW |
| [Bid & Tender Management (RFQ / RFP / ITT)](bid-tender-management.md) | Business / Commercial | WORK_RECORD_REVIEW |
| [Contract Negotiation](contract-negotiation.md) | Business / Commercial | INTERVIEW |
| [Commercial & Financial Acumen](commercial-financial-acumen.md) | Business / Commercial | WRITTEN_EXAM |
| [Client Relationship Management](client-relationship-management.md) | Business / Commercial | THREE_SIXTY_EVALUATION |
| [Oil & Gas Industry & Market Knowledge](oil-gas-industry-market-knowledge.md) | Technical | WRITTEN_EXAM |
| [Proposal & Technical Writing](proposal-technical-writing.md) | Business / Commercial | WORK_RECORD_REVIEW |
| [Stakeholder Communication & Presentation](stakeholder-communication-presentation.md) | Behavioral | THREE_SIXTY_EVALUATION |
| [Digital Marketing & Brand Management](digital-marketing-brand-management.md) | Business / Commercial | WORK_RECORD_REVIEW |
| [Data Analysis & Reporting](data-analysis-reporting.md) | Technical | PRACTICAL_DEMO |
| [Tender Evaluation & Bid Adjudication](tender-evaluation-bid-adjudication.md) | Business / Commercial | WORK_RECORD_REVIEW |
| [Contract Drafting & Administration](contract-drafting-administration.md) | Business / Commercial | WORK_RECORD_REVIEW |
| [Project Contract Follow-up & Claims Management](project-contract-followup-claims.md) | Business / Commercial | WORK_RECORD_REVIEW |
| [Contractual Risk & Compliance Management](contractual-risk-compliance.md) | Business / Commercial | INTERVIEW |
| [Vendor & Subcontractor Management](vendor-subcontractor-management.md) | Business / Commercial | THREE_SIXTY_EVALUATION |
| [HSE Awareness](hse-awareness.md) | Safety | WRITTEN_EXAM |
| [Leadership & People Management](leadership-people-management.md) | Management | THREE_SIXTY_EVALUATION |
| [Strategic Planning & Execution](strategic-planning-execution.md) | Management | INTERVIEW |
