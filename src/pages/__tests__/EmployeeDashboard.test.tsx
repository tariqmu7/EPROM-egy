/**
 * Profile header: the CV-style Professional Summary and the Personal Details
 * modal that replaced the old inline "Professional Identity" grid. The store is
 * mocked so the test covers the header's own derivation/rendering only.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Role, type User } from '../../types';

vi.mock('../../services/store', () => {
  const skills: Record<string, any> = {
    s1: { id: 's1', name: 'Vibration Analysis', category: 'TECHNICAL' },
    s2: { id: 's2', name: 'HAZOP Facilitation', category: 'HSE' },
  };
  return {
    dataService: {
      getJobProfile: () => ({ id: 'jp1', title: 'Rotating Equipment Engineer', orgLevel: 'SP', requiredSkills: [] }),
      getAllDepartments: () => [{ id: 'd1', name: 'Mechanical Maintenance' }],
      getUserById: () => ({ id: 'm1', name: 'Sara Fouad' }),
      getEffectiveRequirements: () => [
        { skillId: 's1', requiredLevel: 3 },
        { skillId: 's2', requiredLevel: 4 },
      ],
      getSkill: (id: string) => skills[id],
      getUserSkillScore: (_u: string, id: string) => (id === 's1' ? 5 : 2),
      getUserSkillScoreDetail: (_u: string, id: string) => ({
        score: id === 's1' ? 5 : 2,
        source: 'ASSESSMENT',
      }),
      getSkillScoreSource: () => 'ASSESSMENT',
      // s1 met (5/3), s2 short (2/4); both measured, nothing unknown.
      getUserCoverage: () => ({
        required: 2, measured: 2, provisional: 0, unknown: 0, known: 2,
        measuredPct: 100, knownPct: 100, compliantKnown: 1, gapsKnown: 1,
        compliancePct: 50, totalGap: 2, avgGap: 1,
      }),
      getWorkExperiences: () => [],
      getWorkExperiencePolicy: () => ({ enabled: true, maxProvisionalLevel: 3, bands: [] }),
      suggestExperienceLevel: () => 0,
      getAssessments: () => [],
      getEvidences: () => [],
      getAllCycles: () => [],
      getCoursesForSkill: () => [],
      generateCareerPath: () => ({ roadmap: [] }),
      updateUser: vi.fn(),
    },
  };
});

vi.mock('../../hooks/useStoreData', () => ({ useStoreData: () => 1 }));

const user: User = {
  id: 'u1',
  name: 'Ahmed Ali',
  email: 'ahmed.ali@eprom.com',
  phone: '0100000000',
  role: Role.EMPLOYEE,
  status: 'ACTIVE',
  departmentId: 'd1',
  orgLevel: 'SP',
  jobProfileId: 'jp1',
  managerId: 'm1',
  employeeId: 4021,
  location: 'Ras Gharib',
  projectName: 'Turnaround 2026',
  certificates: [
    { id: 'c1', name: 'BSc Mechanical Engineering', degree: 'BSc Mechanical Engineering', issuer: 'Cairo University', dateAchieved: '2015-06-01', category: 'ACADEMIC', status: 'APPROVED' },
    { id: 'c2', name: 'API 686 Machinery Installation', issuer: 'API', dateAchieved: '2022-03-01', category: 'PROFESSIONAL', status: 'APPROVED' },
  ],
  careerHistory: [
    { id: 'h1', jobProfileId: 'jp1', jobTitle: 'Rotating Equipment Engineer', orgLevel: 'SP', departmentId: 'd1', startDate: '2021-01-01' },
    { id: 'h2', jobProfileId: 'jp0', jobTitle: 'Mechanical Technician', orgLevel: 'JP', departmentId: 'd1', startDate: '2016-01-01', endDate: '2020-12-31' },
  ],
};

describe('profile professional summary', () => {
  it('renders the CV summary and reveals personal details behind the button', async () => {
    const { EmployeeDashboard } = await import('../EmployeeDashboard');
    render(<EmployeeDashboard user={user} />);

    // CV summary replaces the old inline identity grid
    expect(screen.getByText('Professional Summary')).toBeDefined();
    expect(screen.getAllByText(/Rotating Equipment Engineer/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vibration Analysis').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BSc Mechanical Engineering/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/API 686 Machinery Installation/).length).toBeGreaterThan(0);
    expect(screen.getByText('Areas of Expertise', { exact: false })).toBeDefined();
    expect(screen.getByText('Education')).toBeDefined();
    expect(screen.getByText('Certifications')).toBeDefined();
    expect(screen.getByText(/of recorded service across 2 positions/)).toBeDefined();

    // Contact details are NOT on the page until the button is clicked
    expect(screen.queryByText('Official Email')).toBeNull();

    fireEvent.click(screen.getByTitle('View contact and administrative details'));
    expect(screen.getByText('Official Email')).toBeDefined();
    expect(screen.getByText('ahmed.ali@eprom.com')).toBeDefined();
    expect(screen.getByText('Mobile Phone')).toBeDefined();
    expect(screen.getByText('Ras Gharib')).toBeDefined();

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByText('Official Email')).toBeNull();
  });
});
