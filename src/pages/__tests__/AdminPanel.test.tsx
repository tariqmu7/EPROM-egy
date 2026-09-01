/**
 * AdminPanel is now a SHELL: it owns the shared state and hands each tab's real
 * UI to a component in `pages/admin/`. Nothing pinned that before this split, so
 * these are smoke tests with one job — every admin screen still mounts, and the
 * extracted forms and org chart are still reachable from it. They are cheap on
 * purpose: the store is mocked, so what is being proved is the wiring between
 * the shell and the files the split created, not any business rule.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Role, type User } from '../../types';

const admin: User = {
  id: 'a1', name: 'Admin One', email: 'admin@eprom.com', role: Role.ADMIN,
  status: 'ACTIVE', orgLevel: 'GM', departmentId: 'd1', employeeId: 1,
} as User;

const employee: User = {
  id: 'u1', name: 'Ahmed Ali', email: 'ahmed@eprom.com', role: Role.EMPLOYEE,
  status: 'ACTIVE', orgLevel: 'SP', departmentId: 'd1', jobProfileId: 'jp1',
  employeeId: 4021,
} as User;

const skill = {
  id: 's1', name: 'Vibration Analysis', code: 'TEC-001', category: 'Technical',
  status: 'APPROVED', criticality: 'HIGH', assessmentMethods: [],
};

const dept = { id: 'd1', name: 'Mechanical Maintenance', type: 'DEPARTMENT', projectId: 'p1' };
const project = { id: 'p1', name: 'HQ' };
const job = { id: 'jp1', title: 'Rotating Equipment Engineer', orgLevel: 'SP', departmentId: 'd1', requiredSkills: [] };

vi.mock('../../services/store', () => ({
  dataService: {
    getCurrentUser: () => Promise.resolve(admin),
    getAllUsers: () => [admin, employee],
    getPublicUsers: () => [employee],
    getAllJobs: () => [job],
    getAllSkills: () => [skill],
    getAllDepartments: () => [dept],
    getAllProjects: () => [project],
    getAllTrainingCourses: () => [],
    getSystemLogs: () => [],
    getEvidences: () => [],
    getSkillAssessmentQuestion: () => '',
    getSkillAssessmentMethods: () => [],
    getDepartmentOrgLevel: () => 'DM',
    getGeneralDeptId: () => 'd1',
    generateSkillCode: () => 'TEC-002',
    generateJobProfileCode: () => 'JOB-002',
    skillHasMethod: () => false,
    validateUnitPlacement: () => ({ ok: true }),
    validateJobProfilePlacement: () => ({ ok: true }),
    isDataLoaded: () => true,
    migrateAssessmentConfigToSkills: vi.fn(),
    logActivity: vi.fn(),
    updateUser: vi.fn(),
    addUser: vi.fn(),
  },
}));

vi.mock('../../hooks/useStoreData', () => ({ useStoreData: () => 1 }));

import { AdminPanel } from '../AdminPanel';

const renderView = (view: string) => render(<AdminPanel view={view} onNavigate={() => {}} />);

describe('AdminPanel — every admin screen still mounts after the split', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('renders the overview', async () => {
    renderView('OVERVIEW');
    expect(await screen.findByText(/System Overview|Overview/i)).toBeTruthy();
  });

  it('renders the workforce list with the roster in it', async () => {
    renderView('USERS');
    expect(await screen.findByText('Workforce Management')).toBeTruthy();
    expect(await screen.findByText('Ahmed Ali')).toBeTruthy();
  });

  it('renders the skill library with the catalogue in it', async () => {
    renderView('SKILLS');
    expect(await screen.findByText('Skill Library')).toBeTruthy();
    expect(await screen.findByText('Vibration Analysis')).toBeTruthy();
  });

  it('renders the org-structure screen (the extracted org chart)', async () => {
    renderView('DEPTS');
    expect(await screen.findByText('Departments')).toBeTruthy();
    // From the extracted org chart itself, not the shell around it.
    expect(await screen.findByText('Organization Chart')).toBeTruthy();
    expect(screen.getAllByText('Head Office').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mechanical Maintenance').length).toBeGreaterThan(0);
  });

  it('opens the extracted employee form from the workforce list', async () => {
    renderView('USERS');
    fireEvent.click(await screen.findByRole('button', { name: /Add Employee/i }));
    await waitFor(() => expect(screen.getByText(/New Employee Profile/i)).toBeTruthy());
  });

  it('opens the extracted competency-standard form from the skill library', async () => {
    renderView('SKILLS');
    fireEvent.click(await screen.findByRole('button', { name: /Add Skill/i }));
    await waitFor(() => expect(screen.getByText(/New Competency Standard/i)).toBeTruthy());
  });
});
