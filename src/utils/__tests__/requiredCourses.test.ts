// Old typed certificate names -> Training Catalogue courses (course requests,
// task 4). The bulk upload, the skill details view and the clean-up button all
// rely on these rules agreeing.
import { describe, it, expect } from 'vitest';
import {
  normalizeCourseName, findCourseForName, resolveRequiredCourses, linkSkillCertificates,
} from '../requiredCourses';
import { Skill, TrainingCourse } from '../../types';

const course = (id: string, title: string, extra: Partial<TrainingCourse> = {}): TrainingCourse =>
  ({ id, title, provider: '', linkedSkillIds: [], type: 'EXTERNAL', ...extra });

const catalogue = [
  course('c1', 'NEBOSH IGC', { code: 'TRN-SAF-01' }),
  course('c2', 'H2S Awareness'),
  course('c3', 'Old Course', { isArchived: true }),
  course('c4', 'Turned Down', { status: 'REJECTED' }),
  course('c5', 'Gas Testing', { status: 'PENDING' }),
  course('c6', 'Gas Testing'),
];

describe('normalizeCourseName', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normalizeCourseName('  H2S-Awareness. ')).toBe('h2s awareness');
    expect(normalizeCourseName('Safety & Health')).toBe(normalizeCourseName('safety and health'));
  });
});

describe('findCourseForName', () => {
  it('matches by title or by code', () => {
    expect(findCourseForName('nebosh  igc', catalogue)?.id).toBe('c1');
    expect(findCourseForName('trn-saf-01', catalogue)?.id).toBe('c1');
  });
  it('never matches archived or rejected courses', () => {
    expect(findCourseForName('Old Course', catalogue)).toBeUndefined();
    expect(findCourseForName('Turned Down', catalogue)).toBeUndefined();
  });
  it('prefers the approved course over a pending request of the same title', () => {
    expect(findCourseForName('gas testing', catalogue)?.id).toBe('c6');
  });
});

describe('resolveRequiredCourses', () => {
  it('links what it can and keeps the rest as names', () => {
    const r = resolveRequiredCourses(['h2s awareness', 'First Aid', 'NEBOSH IGC', 'first aid'], catalogue);
    expect(r.courseIds).toEqual(['c2', 'c1']);
    expect(r.unmatched).toEqual(['First Aid']);
    expect(r.names).toEqual(['H2S Awareness', 'NEBOSH IGC', 'First Aid']);
  });
  it('keeps existing ids first and does not duplicate them', () => {
    const r = resolveRequiredCourses(['NEBOSH IGC', 'H2S Awareness'], catalogue, ['c2']);
    expect(r.courseIds).toEqual(['c2', 'c1']);
  });
  it('keeps the title of an already linked course that is no longer matchable', () => {
    const r = resolveRequiredCourses(['Turned Down'], catalogue, ['c4']);
    expect(r.courseIds).toEqual(['c4']);
    expect(r.unmatched).toEqual([]);
  });
});

describe('linkSkillCertificates', () => {
  const skill: Skill = {
    id: 's1', name: 'Safety', category: 'Safety', status: 'APPROVED',
    levels: {
      1: { level: 1, description: '', requiredCertificates: ['H2S awareness'] },
      2: { level: 2, description: '', requiredCertificates: ['Mystery Cert'] },
      3: { level: 3, description: '', requiredCertificates: ['NEBOSH IGC'], requiredCourseIds: ['c1'] },
    },
  } as Skill;

  it('links typed names on every level and reports what is left', () => {
    const r = linkSkillCertificates(skill, catalogue);
    expect(r.changed).toBe(true);
    expect(r.linked).toBe(1);
    expect(r.unmatched).toEqual(['Mystery Cert']);
    expect(r.skill.levels[1].requiredCourseIds).toEqual(['c2']);
    expect(r.skill.levels[1].requiredCertificates).toEqual(['H2S Awareness']);
    expect(r.skill.levels[2]).toBe(skill.levels[2]);
    expect(r.skill.levels[3]).toBe(skill.levels[3]);
  });

  it('reports no change when nothing new can be linked', () => {
    const r = linkSkillCertificates(r0(), catalogue);
    expect(r.changed).toBe(false);
  });
  const r0 = () => linkSkillCertificates(skill, catalogue).skill;
});
