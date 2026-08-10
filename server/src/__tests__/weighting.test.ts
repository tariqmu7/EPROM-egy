// Verification for SKILL CRITICALITY and the weighted ranking (finding 9:
// every gap used to weigh the same, so a training list could not be turned into
// a budget without a human re-reading every row).
//
// These are pure unit tests over `trainingNeeds` — no DB, no HTTP — because the
// thing under test is the arithmetic of "which gap is worst", and it should be
// readable as a table of cases. The end-to-end shape (the fields actually
// reaching the browser) is covered in analytics.test.ts.
//
// The rules being pinned:
//   • Criticality MULTIPLIES a gap; it never changes a score.
//   • The list is ordered by weighted gap, so a small safety-critical gap can
//     outrank a bigger nice-to-have one.
//   • A skill nobody measured still has NO priority score. Silence cannot be
//     escalated by making it safety critical.
//   • A cost is only ever quoted from a priced course, and the total always
//     reports how many gap skills it could NOT price.
import { describe, expect, it } from 'vitest';
import { trainingNeeds, budgetOf, type TrainingNeedRow } from '../analytics/aggregate.js';
import type { AnalyticsModel, CourseRef, Requirement } from '../analytics/model.js';
import type { SkillCriticality } from '../domain/enums.js';
import type { SweepUser } from '../jobs/scheduling.js';
import { pairKey } from '../jobs/scoring.js';

interface Person {
  id: string;
  /** skillId → the score an INTERVIEW assessment records for them. */
  scores: Record<string, number>;
}

interface SkillSpec {
  id: string;
  name: string;
  criticality?: SkillCriticality;
  requiredLevel: number;
  courses?: CourseRef[];
}

/** A minimal model: one job profile, everyone on it, one assessment per score.
 *  Only the fields the training-needs aggregate reads are populated. */
function modelOf(skills: SkillSpec[], people: Person[]): AnalyticsModel {
  const users: SweepUser[] = people.map((p) => ({
    id: p.id,
    rowId: p.id,
    name: p.id,
    status: 'ACTIVE',
    isArchived: false,
    jobProfileId: 'jp',
    certificates: [],
    hasSubordinates: false,
  }));

  const requirements: Requirement[] = skills.map((s) => ({
    skillId: s.id,
    requiredLevel: s.requiredLevel,
  }));

  const assessments = new Map<string, { type: string; raterId: string; score: number; date: string }[]>();
  for (const p of people) {
    for (const [skillId, score] of Object.entries(p.scores)) {
      assessments.set(pairKey(p.id, skillId), [
        { type: 'INTERVIEW', raterId: 'rater', score, date: '2026-01-01' },
      ]);
    }
  }

  const coursesBySkill = new Map<string, CourseRef[]>();
  for (const s of skills) if (s.courses) coursesBySkill.set(s.id, s.courses);

  return {
    users,
    usersById: new Map(users.map((u) => [u.id, u])),
    skillNames: new Map(skills.map((s) => [s.id, s.name])),
    skillCategories: new Map(skills.map((s) => [s.id, 'TECHNICAL'])),
    skillCriticalities: new Map(skills.map((s) => [s.id, s.criticality ?? 'STANDARD'])),
    jobRequirements: new Map([['jp', requirements]]),
    index: {
      // An INTERVIEW block, so every skill scores from the direct branch.
      skillMethods: new Map(
        skills.map((s) => [s.id, [{ id: 'm', method: 'INTERVIEW', frequency: 'ONE_TIME', audience: 'ALL' }]]),
      ),
      assessments,
      evidenceScores: new Map(),
      experienceLevels: new Map(),
      experiencePolicy: { enabled: true, maxProvisionalLevel: 3 },
    },
    deptParents: new Map(),
    deptNames: new Map(),
    deptManagers: new Map(),
    deptTypes: new Map(),
    coursesBySkill,
  };
}

const run = (skills: SkillSpec[], people: Person[]) =>
  trainingNeeds(modelOf(skills, people), people.map((p) => p.id));

const bySkill = (rows: TrainingNeedRow[]) => Object.fromEntries(rows.map((r) => [r.skillId, r]));

describe('skill criticality', () => {
  it('defaults an unjudged skill to STANDARD (weight 1), leaving the old ranking intact', () => {
    const { needs } = run(
      [{ id: 'plain', name: 'Plain', requiredLevel: 4 }],
      [{ id: 'u1', scores: { plain: 2 } }],
    );
    expect(needs[0].criticality).toBe('STANDARD');
    expect(needs[0].criticalityWeight).toBe(1);
    expect(needs[0].weightedGap).toBe(2); // the raw gap, unchanged
  });

  it('multiplies the gap, so a small safety gap outranks a bigger nice-to-have', () => {
    const { needs } = run(
      [
        { id: 'permit', name: 'Permit to Work', criticality: 'SAFETY_CRITICAL', requiredLevel: 3 },
        { id: 'excel', name: 'Spreadsheets', criticality: 'LOW', requiredLevel: 5 },
      ],
      [{ id: 'u1', scores: { permit: 2, excel: 1 } }],
    );

    // Raw gaps: permit 1, excel 4 — the old order would put spreadsheets first.
    expect(needs.map((n) => n.skillId)).toEqual(['permit', 'excel']);
    expect(bySkill(needs).permit.weightedGap).toBe(3); // 1 × 3
    expect(bySkill(needs).excel.weightedGap).toBe(2);  // 4 × 0.5
  });

  it('escalates the priority pill without re-scaling an ordinary skill', () => {
    // Half the team short by one level: a shallow, half-affected gap.
    const people = [
      { id: 'u1', scores: { s: 2 } },
      { id: 'u2', scores: { s: 3 } },
    ];
    const at = (criticality: SkillCriticality) =>
      run([{ id: 's', name: 'S', criticality, requiredLevel: 3 }], people).needs[0];

    // share 0.5 × depth 0.5 × weight
    expect(at('STANDARD').priorityScore).toBe(25);
    expect(at('STANDARD').priority).toBe('MEDIUM');
    expect(at('LOW').priorityScore).toBe(13);
    expect(at('LOW').priority).toBe('LOW');
    expect(at('HIGH').priorityScore).toBe(50);
    expect(at('HIGH').priority).toBe('HIGH');
    expect(at('SAFETY_CRITICAL').priorityScore).toBe(75);
    expect(at('SAFETY_CRITICAL').priority).toBe('HIGH');
  });

  it('never lets criticality manufacture a priority out of silence', () => {
    // Required of one person, measured on nobody — an assessment need.
    const { needs } = run(
      [{ id: 'unseen', name: 'Unseen', criticality: 'SAFETY_CRITICAL', requiredLevel: 4 }],
      [{ id: 'u1', scores: {} }],
    );
    expect(needs[0].unknown).toBe(1);
    expect(needs[0].known).toBe(0);
    expect(needs[0].priorityScore).toBeNull();
    expect(needs[0].priority).toBe('LOW');
    expect(needs[0].weightedGap).toBe(0);
  });

  it('sinks assessment-only rows below anything with a real gap', () => {
    const { needs } = run(
      [
        { id: 'unseen', name: 'Unseen', criticality: 'SAFETY_CRITICAL', requiredLevel: 4 },
        { id: 'small', name: 'Small', criticality: 'LOW', requiredLevel: 2 },
      ],
      [{ id: 'u1', scores: { small: 1 } }],
    );
    expect(needs.map((n) => n.skillId)).toEqual(['small', 'unseen']);
  });
});

describe('cost estimate', () => {
  const priced: SkillSpec = {
    id: 'pump',
    name: 'Pump Alignment',
    requiredLevel: 4,
    courses: [
      { id: 'c-expensive', title: 'Vendor course', provider: 'OEM', costPerSeat: 5000, durationHours: 40 },
      { id: 'c-cheap', title: 'In-house', provider: 'EPROM', costPerSeat: 1200, durationHours: 16 },
    ],
  };

  it('costs the gap head count at the cheapest linked course', () => {
    const { needs, budget } = run([priced], [
      { id: 'u1', scores: { pump: 2 } },
      { id: 'u2', scores: { pump: 3 } },
      { id: 'u3', scores: { pump: 4 } }, // meets it — never a seat
    ]);

    expect(needs[0].gapCount).toBe(2);
    expect(needs[0].seatCost).toBe(1200);
    expect(needs[0].estimatedCost).toBe(2400);
    expect(needs[0].estimatedHours).toBe(32);
    expect(budget).toEqual({
      skillsCosted: 1, skillsUncosted: 0, seatsCosted: 2, seatsUncosted: 0,
      estimatedCost: 2400, estimatedHours: 32,
    });
  });

  it('says "not priced" rather than free when no linked course carries a price', () => {
    const { needs, budget } = run(
      [{ id: 'x', name: 'X', requiredLevel: 3, courses: [{ id: 'c', title: 'Untitled', provider: 'P' }] }],
      [{ id: 'u1', scores: { x: 1 } }],
    );
    expect(needs[0].seatCost).toBeNull();
    expect(needs[0].estimatedCost).toBeNull();
    expect(budget.estimatedCost).toBeNull();
    expect(budget.skillsUncosted).toBe(1);
    expect(budget.seatsUncosted).toBe(1);
  });

  it('reports the total beside what it could not price — no total without its base', () => {
    const { budget } = run(
      [
        priced,
        { id: 'nocourse', name: 'No course', requiredLevel: 5 },
      ],
      [{ id: 'u1', scores: { pump: 3, nocourse: 1 } }],
    );
    expect(budget.estimatedCost).toBe(1200); // only the priced line
    expect(budget.skillsCosted).toBe(1);
    expect(budget.skillsUncosted).toBe(1);
    expect(budget.seatsUncosted).toBe(1);
  });

  it('leaves a skill with unknowns but no gap out of the bill entirely', () => {
    const rows: TrainingNeedRow[] = [
      { ...({} as TrainingNeedRow), gapCount: 0, estimatedCost: null, estimatedHours: null },
    ];
    expect(budgetOf(rows)).toEqual({
      skillsCosted: 0, skillsUncosted: 0, seatsCosted: 0, seatsUncosted: 0,
      estimatedCost: null, estimatedHours: null,
    });
  });
});
