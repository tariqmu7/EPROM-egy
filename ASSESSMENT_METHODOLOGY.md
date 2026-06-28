# Assessment Methodology & Standards

**EPROM Competency Management System**

This document describes how employee competence is measured in the system and the
internationally recognized frameworks the methodology is designed to conform to. It serves as
reference evidence for external review and certification.

> Single source of truth: the standards registry in [`constants/standards.ts`](constants/standards.ts)
> drives both this document and the in-app **Methodology & Standards** page. Keep the three in sync.

---

## 1. Purpose & conformance statement

The competency-assessment process — defining competency standards, assessing employees, scoring
proficiency, and producing skill-gap / training / career outputs — is designed to align with the
frameworks below. The intent is a transparent, repeatable, auditable methodology suitable for
external certification of personnel competence.

## 2. Reference frameworks

| Ref | Standard | Issuing body | What it governs | Source |
|---|---|---|---|---|
| ISO 10667 | ISO 10667-1 / -2:2020 — Assessment service delivery | ISO | Quality procedures for assessing people in work and organizational settings (client + service-provider requirements) across recruitment, development, appraisal, promotion and succession planning. | <https://www.iso.org/standard/74717.html> |
| ISO/IEC 17024 | ISO/IEC 17024:2012 — Certification of persons | ISO/IEC | General requirements for bodies certifying that an individual meets defined competence within a documented certification scheme (structure, resources, records, scheme development, certification process). | <https://www.iso.org/standard/52993.html> |
| NIH | NIH Proficiency Scale | U.S. National Institutes of Health | A single 1–5 scale applied to every competency, each level carrying a written descriptor — enabling consistent, comparable proficiency ratings. | <https://hr.nih.gov/about/faq/working-nih/competencies/what-nih-proficiency-scale> |
| BARS | Behaviorally Anchored Rating Scales | Established HR methodology | Anchors each rating point to a specific observable behavior rather than a personality judgment, reducing rater subjectivity. | <https://peoplemanagingpeople.com/performance-management/behaviorally-anchored-rating-scale/> |
| 360° | 360° Multi-Rater Feedback | Established HR methodology | Triangulates competence from self, peer and manager perspectives via a defined weighting policy. | <https://www.deel.com/glossary/bars-method-performance-appraisal/> |
| SHRM | SHRM BASK® (Body of Applied Skills and Knowledge) | Society for Human Resource Management | Competency-model structure: definitions, sub-competencies and observable behaviors. | <https://www.shrm.org/credentials/certification/exam-preparation/bask> |
| NICE | NIST SP 800-181 r1 (NICE Framework) | NIST | Tasks / Knowledge / Skills building blocks for describing role competencies and the items that measure them. | <https://www.nist.gov/itl/applied-cybersecurity/nice/nice-framework-resource-center> |
| OPITO | OPITO Competence & Training Standards | OPITO (Offshore Petroleum Industry Training Organization) | The global skills body for the energy industry. Competence-management and training standards for safety-critical and technical oil & gas roles — evidence-based competence verified by a qualified assessor, with defined recency and periodic re-assessment. | <https://opito.com/> |

## 3. Proficiency scale (NIH 1–5)

Every competency is rated on the same 1–5 scale (`PROFICIENCY_LABELS`):

| Level | Label | Descriptor |
|---|---|---|
| 1 | Awareness | Recognizes technologies, techniques and knowledge; knows their purpose, value and limitations. |
| 2 | Knowledge | Understands principles and fundamentals; applies the knowledge under supervision. |
| 3 | Skill | Applies knowledge routinely, independently and correctly; analyzes processes and recommends solutions. |
| 4 | Advanced | Applies in complex projects; advises others and improves application in the job. |
| 5 | Expert | Generates knowledge and innovates; a recognized technical authority. |

The **target proficiency (pass level)** a skill must reach is owned per position by the
job profile (`JobProfileSkill.requiredLevel`) — the same skill can require a different level
in each profile it is assigned to. The exam **pass mark** likewise has a skill-wide default
(`SkillAssessmentMethod.passingScorePercent`) that a job profile may override per skill via
`JobProfileSkill.passingScorePercent`.

## 4. Method → standard conformance matrix

Each assessment method type is configured by an administrator with standards-based controls
(see §5) and conforms to the standards below (`METHOD_STANDARD_MAP`):

| Assessment method | Conforms to |
|---|---|
| Written Examination (External / Online) | ISO 10667, ISO/IEC 17024, NIST SP 800-181 r1 |
| Interview & Technical Discussion | ISO 10667, BARS, SHRM BASK |
| Practical Demonstration / Simulation | ISO 10667, ISO/IEC 17024, OPITO |
| OJT Observation (On-the-Job) | BARS, 360° Multi-Rater, NIH, OPITO |
| 360° Multi-Rater Evaluation | 360° Multi-Rater, BARS, SHRM BASK |
| Work Record / Case Study Review | ISO 10667, ISO/IEC 17024, OPITO |

## 5. Per-method administrator controls

Configured in **Admin › Skills › Competency Standard › Assessment Methods**
([`components/AssessmentMethodEditor.tsx`](components/AssessmentMethodEditor.tsx)). Every method
block defines *how* (method + prompt / link / question bank), *when* (recurrence) and *who*
(audience), plus the standards-based controls relevant to its type:

| Control | Applies to | Purpose |
|---|---|---|
| Default passing score %, time limit, question count | Written Examination | Objective pass criteria for knowledge tests (ISO/IEC 17024 scheme). The passing score is a skill-wide default; a job profile can override it per skill (`JobProfileSkill.passingScorePercent`). |
| Rater weights (Self / Peer / Manager) | OJT Observation, 360° | Configurable 360° blend; default **Self 10 / Peer 30 / Manager 60**. |
| Assessor role | Interview, Practical Demo, 360° | Traceability of who conducts the assessment (ISO 10667). |
| Evidence validity (months), min. approved records | Work Record Review | Evidence sufficiency and recency for competence based on work records. |

## 6. Scoring policy

Defined in `getUserSkillScore` ([`services/store.ts`](services/store.ts)):

- **360° / OJT competencies** — weighted average of self / peer / manager ratings using the
  per-skill **rater weights** (`getRaterWeightsForUserSkill`); the blend is re-normalized over the
  rater types that actually submitted. Default Self 10 / Peer 30 / Manager 60.
- **Direct-assessment competencies** (written exam, interview, practical demo) — the latest
  recorded score.
- **Evidence-based competencies** — the highest assigned score across approved work records.

## 7. Traceability & data quality

- All assessment and configuration changes are recorded in the activity log (`logActivity`).
- Each competency carries written proficiency descriptors (behavioral anchors per BARS).
- A single resolver (`getEffectiveRequirements`) governs "what a position requires", ensuring
  consistent scoring, gap, ITP, career and TNA outputs.
