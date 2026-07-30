import { describe, it, expect } from 'vitest';
import { routeToPath, pathToRoute, buildSubViewPath, readSubViewFromPath } from '../routes';

describe('routes: routeToPath', () => {
  it('maps simple tabs to their clean path', () => {
    expect(routeToPath({ tab: 'emp-dashboard' })).toBe('/dashboard');
    expect(routeToPath({ tab: 'admin-users' })).toBe('/admin/users');
    expect(routeToPath({ tab: 'admin-depts' })).toBe('/admin/departments');
    expect(routeToPath({ tab: 'evaluations' })).toBe('/evaluations');
    expect(routeToPath({ tab: 'emp-assessment' })).toBe('/evaluations/360');
  });

  it('encodes the ceo-view-profile route param', () => {
    expect(routeToPath({ tab: 'ceo-view-profile', profileUserId: 'u_123' }))
      .toBe('/ceo/profile/u_123');
    expect(routeToPath({ tab: 'ceo-view-profile', profileUserId: 'a b/c' }))
      .toBe('/ceo/profile/a%20b%2Fc');
  });

  it('falls back to /ceo when ceo-view-profile has no id', () => {
    expect(routeToPath({ tab: 'ceo-view-profile', profileUserId: null })).toBe('/ceo');
    expect(routeToPath({ tab: 'ceo-view-profile' })).toBe('/ceo');
  });

  it('falls back to /dashboard for an unmapped tab', () => {
    expect(routeToPath({ tab: 'totally-unknown-tab' })).toBe('/dashboard');
  });
});

describe('routes: pathToRoute', () => {
  it('resolves clean paths back to their tab', () => {
    expect(pathToRoute('/admin/users')).toEqual({ tab: 'admin-users' });
    expect(pathToRoute('/admin/departments')).toEqual({ tab: 'admin-depts' });
    expect(pathToRoute('/manager/approvals')).toEqual({ tab: 'manager-approvals' });
  });

  it('distinguishes nested evaluation paths from the parent', () => {
    expect(pathToRoute('/evaluations')).toEqual({ tab: 'evaluations' });
    expect(pathToRoute('/evaluations/online')).toEqual({ tab: 'online-assessments' });
    expect(pathToRoute('/evaluations/360')).toEqual({ tab: 'emp-assessment' });
  });

  it('decodes the ceo-view-profile param', () => {
    expect(pathToRoute('/ceo/profile/u_123'))
      .toEqual({ tab: 'ceo-view-profile', profileUserId: 'u_123' });
    expect(pathToRoute('/ceo/profile/a%20b%2Fc'))
      .toEqual({ tab: 'ceo-view-profile', profileUserId: 'a b/c' });
  });

  it('tolerates a trailing slash', () => {
    expect(pathToRoute('/admin/users/')).toEqual({ tab: 'admin-users' });
  });

  it('returns null for the root path (keep role-default tab)', () => {
    expect(pathToRoute('/')).toBeNull();
    expect(pathToRoute('')).toBeNull();
  });

  it('returns null for an unknown path', () => {
    expect(pathToRoute('/nope/nowhere')).toBeNull();
  });
});

describe('routes: round-trip', () => {
  // Every tab that has a stable path must survive path -> tab -> path unchanged.
  const tabs = [
    'emp-dashboard', 'evaluations', 'online-assessments', 'interviews',
    'emp-assessment', 'emp-appraisal', 'evidence-portal', 'manager-dashboard',
    'manager-approvals', 'ceo-dashboard', 'admin-dashboard', 'admin-analytics',
    'admin-appraisal', 'admin-audit', 'admin-users', 'admin-jobs', 'admin-skills',
    'admin-depts', 'admin-experience', 'settings', 'methodology',
  ];

  it.each(tabs)('tab %s -> path -> same tab', (tab) => {
    const path = routeToPath({ tab });
    expect(pathToRoute(path)).toEqual({ tab });
  });

  it('round-trips the parameterised ceo-view-profile route', () => {
    const path = routeToPath({ tab: 'ceo-view-profile', profileUserId: 'u_42' });
    expect(pathToRoute(path)).toEqual({ tab: 'ceo-view-profile', profileUserId: 'u_42' });
  });
});

describe('routes: sub-view routing', () => {
  it('builds a sub-view path; omits the default sub-view', () => {
    expect(buildSubViewPath('emp-dashboard', 'history')).toBe('/dashboard/history');
    expect(buildSubViewPath('emp-dashboard', 'career')).toBe('/dashboard/career');
    expect(buildSubViewPath('emp-dashboard', 'overview')).toBe('/dashboard'); // default omitted
  });

  it('coerces an unknown sub-view to the default (bare path)', () => {
    expect(buildSubViewPath('emp-dashboard', 'bogus')).toBe('/dashboard');
  });

  it('returns null for a tab without sub-views', () => {
    expect(buildSubViewPath('admin-users', 'whatever')).toBeNull();
    expect(readSubViewFromPath('admin-users', '/admin/users/x')).toBeNull();
  });

  it('reads an explicit sub-view from the path (bare parent → null)', () => {
    expect(readSubViewFromPath('emp-dashboard', '/dashboard/history')).toBe('history');
    expect(readSubViewFromPath('emp-dashboard', '/dashboard')).toBeNull();
    expect(readSubViewFromPath('emp-dashboard', '/dashboard/bogus')).toBe('overview'); // unknown → default
  });

  it('routeToPath includes the sub-view segment when set', () => {
    expect(routeToPath({ tab: 'emp-dashboard', subView: 'idp' })).toBe('/dashboard/idp');
    expect(routeToPath({ tab: 'emp-dashboard', subView: 'overview' })).toBe('/dashboard');
    expect(routeToPath({ tab: 'emp-dashboard' })).toBe('/dashboard');
  });

  it('pathToRoute resolves a sub-view path to tab + subView', () => {
    expect(pathToRoute('/dashboard/history')).toEqual({ tab: 'emp-dashboard', subView: 'history' });
    expect(pathToRoute('/dashboard/career')).toEqual({ tab: 'emp-dashboard', subView: 'career' });
    expect(pathToRoute('/dashboard')).toEqual({ tab: 'emp-dashboard' }); // bare → no subView noise
  });

  it('round-trips every dashboard sub-view', () => {
    for (const sub of ['overview', 'idp', 'history', 'certificates', 'career', 'experience']) {
      const path = routeToPath({ tab: 'emp-dashboard', subView: sub });
      const back = pathToRoute(path);
      expect(back?.tab).toBe('emp-dashboard');
      // default sub-view collapses to the bare path (no subView on the way back)
      expect(back?.subView ?? 'overview').toBe(sub);
    }
  });
});
