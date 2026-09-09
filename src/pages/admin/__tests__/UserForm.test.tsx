/**
 * The Job Profile dropdown in the employee form.
 *
 * A ladder is written ONCE for a branch and shared by the units under it —
 * Operations holds eight positions on its assistant-general unit for three
 * sites, and BD/EC hold their AGM and GM rungs above the sections. Offering
 * only profiles whose `departmentId` matched the chosen unit exactly left
 * every one of those sections with an empty dropdown, so nobody sitting in a
 * section could be given a position at all.
 *
 * What is pinned here: the unit's OWN profiles and those of its ANCESTORS are
 * offered, a sibling section's are not, and the unit's own come first.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Role, type User } from '../../../types';

const g = { id: 'g1', name: 'General Ops', type: 'GENERAL' };
const agm = { id: 'd1', name: 'Operations - Canal', type: 'ASSISTANT_GENERAL', parentId: 'g1' };
const sectA = { id: 'sect-a', name: 'Tank Farm - Suez', type: 'SECTION', parentId: 'd1' };
const sectB = { id: 'sect-b', name: 'Tank Farm - Sinai', type: 'SECTION', parentId: 'd1' };

const ladderFR = { id: 'jp-fr', title: 'Operations Engineer - Fresh', code: 'OP-FR', orgLevel: 'FR', departmentId: 'd1', requiredSkills: [] };
const ladderSH = { id: 'jp-sh', title: 'Operations Section Head', code: 'OP-SH', orgLevel: 'SH', departmentId: 'd1', requiredSkills: [] };
const ownProfile = { id: 'jp-own', title: 'Suez Farm Specialist', code: 'OP-OWN', orgLevel: 'SP', departmentId: 'sect-a', requiredSkills: [] };
const siblingProfile = { id: 'jp-sib', title: 'Sinai Farm Specialist', code: 'OP-SIB', orgLevel: 'SP', departmentId: 'sect-b', requiredSkills: [] };

const admin: User = {
  id: 'a1', name: 'Admin One', email: 'admin@eprom.com', role: Role.ADMIN,
  status: 'ACTIVE', orgLevel: 'GM', departmentId: 'd1', employeeId: 1,
} as User;

const employee: User = {
  id: 'u1', name: 'Mostafa Farag', email: 'mostafa@eprom.com', role: Role.EMPLOYEE,
  status: 'ACTIVE', orgLevel: 'FR', departmentId: 'sect-a', generalDepartmentId: 'g1',
  employeeId: 4021,
} as User;

vi.mock('../../../services/store', () => ({
  dataService: {
    getAllUsers: () => [admin, employee],
    getAllJobs: () => [ladderFR, ladderSH, ownProfile, siblingProfile],
    getAllDepartments: () => [g, agm, sectA, sectB],
    getAllProjects: () => [],
    getGeneralDeptId: () => 'g1',
    getDepartmentOrgLevel: () => 'SH',
  },
}));

const { UserForm } = await import('../UserForm');

function openJobProfileDropdown() {
  render(<UserForm initialData={employee} currentUser={admin} onSave={vi.fn()} onCancel={vi.fn()} />);
  fireEvent.click(screen.getByText('Assign Job Profile...'));
}

describe('UserForm — job profile options', () => {
  it('offers the branch ladder held on an ancestor unit', () => {
    openJobProfileDropdown();
    expect(screen.getByText('Operations Engineer - Fresh')).toBeTruthy();
    expect(screen.getByText('Operations Section Head')).toBeTruthy();
  });

  it("offers the unit's own profile first and never a sibling section's", () => {
    openJobProfileDropdown();
    expect(screen.getByText('Suez Farm Specialist')).toBeTruthy();
    expect(screen.queryByText('Sinai Farm Specialist')).toBeNull();

    // The unit's own profile is listed before the ones inherited from above.
    const own = screen.getByText('Suez Farm Specialist');
    const inherited = screen.getByText('Operations Engineer - Fresh');
    expect(own.compareDocumentPosition(inherited) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
