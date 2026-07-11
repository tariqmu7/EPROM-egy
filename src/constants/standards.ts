// Global competency-assessment standards the system conforms to.
// Single source of truth for the in-app Methodology & Standards page and the
// committed ASSESSMENT_METHODOLOGY.md audit document — keep the two in sync.
//
// References are to recognized international frameworks so the assessment
// methodology is auditable / certifiable by an external body.
import { AssessmentMethod } from '../types';

export interface AssessmentStandard {
  id: string;       // stable key referenced by METHOD_STANDARD_MAP
  code: string;     // formal designation, e.g. 'ISO 10667-1/-2:2020'
  name: string;     // human title
  body: string;     // issuing organization
  summary: string;  // what it governs / why it matters here
  url: string;      // authoritative source
}

export const ASSESSMENT_STANDARDS: AssessmentStandard[] = [
  {
    id: 'ISO_10667',
    code: 'ISO 10667-1 / -2:2020',
    name: 'Assessment Service Delivery',
    body: 'ISO',
    summary:
      'Procedures and methods to assess people in work and organizational settings. Defines quality requirements for both the client and the service provider across recruitment, development, appraisal, promotion and succession planning.',
    url: 'https://www.iso.org/standard/74717.html',
  },
  {
    id: 'ISO_17024',
    code: 'ISO/IEC 17024:2012',
    name: 'Certification of Persons',
    body: 'ISO/IEC',
    summary:
      'General requirements for bodies operating certification of persons — assurance that an individual meets defined competence requirements within a documented certification scheme (structure, resources, records, scheme development, certification process).',
    url: 'https://www.iso.org/standard/52993.html',
  },
  {
    id: 'NIH',
    code: 'NIH Proficiency Scale',
    name: 'Five-Level Proficiency Scale',
    body: 'U.S. National Institutes of Health',
    summary:
      'A single 1–5 scale applied to every competency: Fundamental Awareness, Novice, Intermediate, Advanced, Expert. Each level carries a written descriptor, enabling consistent, comparable proficiency ratings across all skills.',
    url: 'https://hr.nih.gov/about/faq/working-nih/competencies/what-nih-proficiency-scale',
  },
  {
    id: 'BARS',
    code: 'BARS',
    name: 'Behaviorally Anchored Rating Scales',
    body: 'Established HR methodology',
    summary:
      'Each rating point is anchored to a specific observable behavior rather than a personality judgment, reducing rater subjectivity and giving employees a clear standard for each proficiency level.',
    url: 'https://peoplemanagingpeople.com/performance-management/behaviorally-anchored-rating-scale/',
  },
  {
    id: 'THREE_SIXTY',
    code: '360° Multi-Rater',
    name: '360° Multi-Rater Feedback',
    body: 'Established HR methodology',
    summary:
      'Competence is triangulated from multiple perspectives — self, peer and manager — combined through a defined weighting policy to produce a balanced, fairer proficiency score.',
    url: 'https://www.deel.com/glossary/bars-method-performance-appraisal/',
  },
  {
    id: 'SHRM',
    code: 'SHRM BASK®',
    name: 'Body of Applied Skills and Knowledge',
    body: 'Society for Human Resource Management',
    summary:
      'A competency-model structure of definitions, sub-competencies and observable behaviors. Informs how each competency standard is described and how behavioral indicators are written.',
    url: 'https://www.shrm.org/credentials/certification/exam-preparation/bask',
  },
  {
    id: 'NICE',
    code: 'NIST SP 800-181 r1',
    name: 'NICE Workforce Framework',
    body: 'NIST',
    summary:
      'Building blocks (Tasks, Knowledge, Skills) for describing role competencies and the assessment items that measure them — the basis for objective, role-linked technical examinations.',
    url: 'https://www.nist.gov/itl/applied-cybersecurity/nice/nice-framework-resource-center',
  },
  {
    id: 'OPITO',
    code: 'OPITO Standards',
    name: 'Competence & Training Standards (Energy Sector)',
    body: 'OPITO — Offshore Petroleum Industry Training Organization',
    summary:
      'The global skills body for the energy industry. Defines competence-management and training standards for safety-critical and technical oil & gas roles — evidence-based competence verified by a qualified assessor, with defined recency and periodic re-assessment.',
    url: 'https://opito.com/',
  },
];

export const getStandard = (id: string): AssessmentStandard | undefined =>
  ASSESSMENT_STANDARDS.find(s => s.id === id);

// Which standards each assessment method conforms to. Drives the conformance
// matrix on the Methodology & Standards page and in ASSESSMENT_METHODOLOGY.md.
export const METHOD_STANDARD_MAP: Record<AssessmentMethod, string[]> = {
  WRITTEN_EXAM: ['ISO_10667', 'ISO_17024', 'NICE'],
  INTERVIEW: ['ISO_10667', 'BARS', 'SHRM'],
  PRACTICAL_DEMO: ['ISO_10667', 'ISO_17024', 'OPITO'],
  OJT_OBSERVATION: ['BARS', 'THREE_SIXTY', 'NIH', 'OPITO'],
  THREE_SIXTY_EVALUATION: ['THREE_SIXTY', 'BARS', 'SHRM'],
  WORK_RECORD_REVIEW: ['ISO_10667', 'ISO_17024', 'OPITO'],
  ANNUAL_APPRAISAL: ['BARS', 'SHRM'],
};
