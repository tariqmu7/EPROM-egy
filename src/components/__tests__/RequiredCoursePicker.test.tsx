/**
 * Required certificates are picked from the Training Catalogue; a course the
 * catalogue lacks is requested with its syllabus and lands as PENDING.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const courses: any[] = [
  { id: 'c1', title: 'NEBOSH IGC', code: 'TRN-NEBOS-01', provider: 'RRC', type: 'EXTERNAL', linkedSkillIds: [] },
  { id: 'c2', title: 'Permit to Work', provider: 'EPROM', type: 'INTERNAL', linkedSkillIds: [], status: 'PENDING' },
  { id: 'c3', title: 'Old Rejected', provider: 'X', type: 'INTERNAL', linkedSkillIds: [], status: 'REJECTED' },
];
const requestTrainingCourse = vi.fn(async (d: any) => {
  const c = { ...d, id: 'new1', status: 'PENDING' };
  courses.push(c);
  return c;
});

vi.mock('../../services/store', () => ({
  dataService: {
    getAllTrainingCourses: () => courses,
    getTrainingCourse: (id: string) => courses.find(c => c.id === id),
    requestTrainingCourse: (d: any) => requestTrainingCourse(d),
    subscribe: () => () => {},
    getSnapshotVersion: () => 1,
  },
}));

import { RequiredCoursePicker } from '../RequiredCoursePicker';

beforeEach(() => { requestTrainingCourse.mockClear(); });

const setup = (props: Partial<React.ComponentProps<typeof RequiredCoursePicker>> = {}) => {
  const onChange = vi.fn();
  render(<RequiredCoursePicker courseIds={[]} legacyNames={[]} skillId="s1" skillName="HSE" level={2} onChange={onChange} {...props} />);
  return onChange;
};

describe('RequiredCoursePicker', () => {
  it('offers catalogue courses (pending marked, rejected hidden) and picks by id', () => {
    const onChange = setup();
    fireEvent.focus(screen.getByPlaceholderText(/search the training catalogue/i));
    expect(screen.getByText('NEBOSH IGC')).toBeTruthy();
    expect(screen.getByText('Awaiting approval')).toBeTruthy();
    expect(screen.queryByText('Old Rejected')).toBeNull();
    fireEvent.click(screen.getByText('NEBOSH IGC'));
    expect(onChange).toHaveBeenCalledWith(['c1'], ['NEBOSH IGC']);
  });

  it('shows typed-in names as not in the catalogue', () => {
    setup({ legacyNames: ['PMP'] });
    expect(screen.getByText('PMP')).toBeTruthy();
    expect(screen.getByText(/not in catalogue/i)).toBeTruthy();
  });

  it('requests a missing course with its syllabus and selects it', async () => {
    const onChange = setup();
    const search = screen.getByPlaceholderText(/search the training catalogue/i);
    fireEvent.change(search, { target: { value: 'Confined Space Entry' } });
    fireEvent.click(screen.getByText(/request a new course/i));
    // Syllabus is required.
    fireEvent.click(screen.getByText(/send for approval/i));
    expect(screen.getByRole('alert').textContent).toMatch(/must cover/i);
    fireEvent.change(screen.getByPlaceholderText(/one topic per line/i), { target: { value: 'Gas testing\nRescue plan' } });
    fireEvent.click(screen.getByText(/send for approval/i));
    await waitFor(() => expect(requestTrainingCourse).toHaveBeenCalled());
    const draft = requestTrainingCourse.mock.calls[0][0];
    expect(draft).toMatchObject({ title: 'Confined Space Entry', linkedSkillIds: ['s1'], targetLevel: 2, syllabus: 'Gas testing\nRescue plan' });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(['new1'], ['Confined Space Entry']));
  });
});
