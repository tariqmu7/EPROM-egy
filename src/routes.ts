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
  /** Sub-view segment for pages that have sub-tabs (see SUB_VIEWS below). */
  subView?: string | null;
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

// -----------------------------------------------------------------------------
// Sub-view routing. Some pages have sub-tabs (e.g. the employee dashboard's
// Overview/History/IDP/Certificates/Career tabs). Each sub-tab gets a URL
// sub-segment so it survives a refresh and is deep-linkable. The parent tab stays
// the app's source of truth; the sub-view lives in the URL tail (+ a
// sessionStorage fallback — see hooks/usePersistentView.ts). The default
// sub-view is omitted from the URL (bare parent path == default view).
// -----------------------------------------------------------------------------
export interface SubViewSpec {
  /** Must equal this tab's TAB_PATHS entry (e.g. '/dashboard'). */
  parentPath: string;
  /** Valid sub-view keys, in URL (lowercase) form. */
  values: string[];
  /** Sub-view an absent segment maps to; omitted from the URL. */
  default: string;
}

export const SUB_VIEWS: Record<string, SubViewSpec> = {
  'emp-dashboard': {
    parentPath: '/dashboard',
    values: ['overview', 'idp', 'history', 'certificates', 'career'],
    default: 'overview',
  },
  // NOTE: page-level sub-views only. In-page state that depends on a selection
  // (e.g. the Personnel/Sub-units tabs inside a *specific* department's profile,
  // or admin list filters) is persisted to sessionStorage via useSessionState —
  // it isn't a clean top-level sub-view so it doesn't belong in the URL.
};

/** Build the browser path for a tab's sub-view (default sub-view → bare path). */
export function buildSubViewPath(tab: string, subView: string): string | null {
  const spec = SUB_VIEWS[tab];
  if (!spec) return null;
  const sub = spec.values.includes(subView) ? subView : spec.default;
  return withBase(spec.parentPath + (sub === spec.default ? '' : '/' + sub));
}

/**
 * Read an explicit sub-view (lowercase) from a path for a given tab. Returns null
 * for the bare parent path (no explicit segment → caller consults storage/default)
 * and for unrelated paths.
 */
export function readSubViewFromPath(tab: string, pathname: string): string | null {
  const spec = SUB_VIEWS[tab];
  if (!spec) return null;
  const p = stripBase(pathname);
  if (p.startsWith(spec.parentPath + '/')) {
    const sub = p.slice(spec.parentPath.length + 1);
    return spec.values.includes(sub) ? sub : spec.default;
  }
  return null;
}

/** Build the full browser path for an app route (activeTab + any params). */
export function routeToPath(state: RouteState): string {
  if (state.tab === 'ceo-view-profile') {
    return withBase(
      state.profileUserId
        ? CEO_PROFILE_PREFIX + encodeURIComponent(state.profileUserId)
        : '/ceo',
    );
  }
  const spec = SUB_VIEWS[state.tab];
  if (spec) {
    return buildSubViewPath(state.tab, state.subView ?? spec.default) as string;
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
  // Sub-view parents: a bare parent path or a parent/<sub> path both resolve to
  // the parent tab; an explicit sub-view (if present) rides along for pages that
  // read it. Bare parent → just the tab (no null subView noise).
  for (const [tab, spec] of Object.entries(SUB_VIEWS)) {
    if (p === spec.parentPath || p.startsWith(spec.parentPath + '/')) {
      const subView = readSubViewFromPath(tab, pathname);
      return subView ? { tab, subView } : { tab };
    }
  }
  const tab = PATH_TO_TAB[p];
  return tab ? { tab } : null;
}
