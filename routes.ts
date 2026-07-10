// -----------------------------------------------------------------------------
// Clean-URL routing map — the single source of truth pairing each `activeTab`
// key (see App.tsx) with a browser path.
//
// The app keeps `activeTab` as its source of truth; hooks/useUrlRouting.ts syncs
// the address bar to it (deep links, refresh, back/forward). This file is the
// one place a path is defined.
//
// ADD A FEATURE → ADD A ROUTE:
//   Every new page/tab MUST get a row in TAB_PATHS below. That is all a new tab
//   needs to become deep-linkable, refresh-stable, and back/forward-aware — the
//   sidebar and <App> already key everything off `activeTab`. A tab with no row
//   here still renders, but its URL falls back to /dashboard and it won't be
//   linkable. Don't add a tab without adding its path.
// -----------------------------------------------------------------------------

export interface RouteState {
  /** The `activeTab` key this route maps to. */
  tab: string;
  /** Route param for parameterised routes (currently only ceo-view-profile). */
  profileUserId?: string | null;
}

// tab key -> path. Paths are base-relative, leading slash, no trailing slash.
const TAB_PATHS: Record<string, string> = {
  'emp-dashboard': '/dashboard',
  'evaluations': '/evaluations',
  'online-assessments': '/evaluations/online',
  'interviews': '/evaluations/interviews',
  'emp-assessment': '/evaluations/360',
  'emp-appraisal': '/evaluations/appraisal',
  'evidence-portal': '/evaluations/evidence',
  'manager-dashboard': '/manager',
  'manager-approvals': '/manager/approvals',
  'ceo-dashboard': '/ceo',
  // 'ceo-view-profile' is parameterised — handled explicitly below, not here.
  'admin-dashboard': '/admin',
  'admin-analytics': '/admin/analytics',
  'admin-appraisal': '/admin/appraisal',
  'admin-audit': '/admin/audit',
  'admin-users': '/admin/users',
  'admin-jobs': '/admin/jobs',
  'admin-skills': '/admin/skills',
  'admin-depts': '/admin/departments',
  'settings': '/settings',
  'methodology': '/methodology',
};

const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_PATHS).map(([tab, path]) => [path, tab]),
);

const CEO_PROFILE_PREFIX = '/ceo/profile/';

// Vite base URL (e.g. '/' at a domain root, or '/subpath/'). Normalised to ''
// or '/subpath' (no trailing slash) so the app is portable across deploy paths.
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

const withBase = (path: string): string => (BASE ? BASE + path : path) || '/';

const stripBase = (pathname: string): string => {
  let p = pathname;
  if (BASE && p.startsWith(BASE)) p = p.slice(BASE.length);
  if (!p.startsWith('/')) p = '/' + p;
  return p.replace(/\/+$/, '') || '/'; // drop trailing slash, keep root as '/'
};

/** Build the full browser path for an app route (activeTab + any params). */
export function routeToPath(state: RouteState): string {
  if (state.tab === 'ceo-view-profile') {
    return withBase(
      state.profileUserId
        ? CEO_PROFILE_PREFIX + encodeURIComponent(state.profileUserId)
        : '/ceo',
    );
  }
  return withBase(TAB_PATHS[state.tab] ?? '/dashboard');
}

/**
 * Resolve a browser path to an app route. Returns null for the root path and
 * for any unknown path, letting the caller fall back to the role-default tab.
 */
export function pathToRoute(pathname: string): RouteState | null {
  const p = stripBase(pathname);
  if (p === '/') return null; // root: keep the role-default tab
  if (p.startsWith(CEO_PROFILE_PREFIX)) {
    const id = decodeURIComponent(p.slice(CEO_PROFILE_PREFIX.length));
    return { tab: 'ceo-view-profile', profileUserId: id || null };
  }
  const tab = PATH_TO_TAB[p];
  return tab ? { tab } : null;
}
