import { useEffect, useRef } from 'react';
import { pathToRoute, routeToPath, RouteState } from '../routes';

interface Options {
  /** True once a user session is established (routing is a no-op before login). */
  isAuthenticated: boolean;
  /** The current `activeTab` — App's source of truth. */
  activeTab: string;
  /** Param state for parameterised routes (ceo-view-profile). */
  profileUserId: string | null;
  /**
   * Apply a URL-derived route back into app state (set activeTab + params).
   * Must be referentially stable (wrap in useCallback) — it backs the popstate
   * listener.
   */
  applyRoute: (route: RouteState) => void;
}

/**
 * Bidirectional sync between the browser URL and the app's `activeTab` state.
 *
 * `activeTab` stays the source of truth; this hook keeps the address bar, deep
 * links, page refresh, and browser back/forward in step with it. All routing
 * paths live in routes.ts.
 *
 * Must be called unconditionally on every render (before any early return) — it
 * self-gates on `isAuthenticated` internally.
 */
export function useUrlRouting({ isAuthenticated, activeTab, profileUserId, applyRoute }: Options) {
  const initialized = useRef(false);
  // Set when a state change originated FROM the URL (initial adoption or a
  // back/forward pop), so the state->URL effect doesn't echo it back as a
  // spurious new history entry.
  const fromUrl = useRef(false);

  // 1. First authenticated render: adopt the current URL (deep link / refresh),
  //    or canonicalise the address bar to the role-default tab's path.
  useEffect(() => {
    if (!isAuthenticated) {
      initialized.current = false; // reset so a re-login re-initialises
      return;
    }
    if (initialized.current) return;
    initialized.current = true;

    const route = pathToRoute(window.location.pathname);
    if (route) {
      fromUrl.current = true;
      applyRoute(route);
    } else {
      window.history.replaceState(
        { tab: activeTab },
        '',
        routeToPath({ tab: activeTab, profileUserId }),
      );
    }
  }, [isAuthenticated, activeTab, profileUserId, applyRoute]);

  // 2. State -> URL: push a new history entry when the active route changes.
  useEffect(() => {
    if (!isAuthenticated || !initialized.current) return;
    if (fromUrl.current) {
      fromUrl.current = false; // this change came from the URL; don't push back
      return;
    }
    const target = routeToPath({ tab: activeTab, profileUserId });
    if (target !== window.location.pathname) {
      window.history.pushState({ tab: activeTab }, '', target);
    }
  }, [isAuthenticated, activeTab, profileUserId]);

  // 3. URL -> State: react to browser back/forward.
  useEffect(() => {
    if (!isAuthenticated) return;
    const onPop = () => {
      const route = pathToRoute(window.location.pathname);
      if (route) {
        fromUrl.current = true;
        applyRoute(route);
      }
      // Unknown path on pop: leave the current tab; the address bar has already
      // moved, and there's nothing sensible to render for it.
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isAuthenticated, applyRoute]);
}
