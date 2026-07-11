import { useCallback, useEffect, useState } from 'react';
import { buildSubViewPath, readSubViewFromPath } from '../routes';

/**
 * Drop-in replacement for `useState` for a page's sub-view (sub-tab), so the view
 * survives a page refresh and is deep-linkable.
 *
 * It keeps the current sub-view in TWO places:
 *   1. the URL sub-segment (e.g. /dashboard/history)  → deep-linkable + shareable
 *   2. sessionStorage (per tab)                        → fallback so returning to
 *      the bare parent path restores the last-visited sub-view
 *
 * On refresh the URL already carries the sub-view (readSubViewFromPath), so the
 * exact view is restored; landing on the bare parent path falls back to storage,
 * then the page default.
 *
 * @param tab      App-level tab key that owns this page (must have a routes.ts
 *                 SUB_VIEWS entry). Used to namespace storage + build the URL.
 * @param values   The page's own sub-view keys (any case). The URL form is
 *                 lowercase; matching is case-insensitive.
 * @param fallback The default sub-view when neither URL nor storage has one.
 * @param enabled  When false, behaves like a plain `useState` (no URL/storage
 *                 sync). Use for pages reused in an embedded context — e.g. the
 *                 employee dashboard shown inside a CEO/manager profile view,
 *                 where it must NOT rewrite the current URL.
 */
export function usePersistentView<T extends string>(
  tab: string,
  values: readonly T[],
  fallback: T,
  enabled = true,
): [T, (v: T) => void] {
  const storageKey = `eprom_view_${tab}`;

  const match = (raw: string | null | undefined): T | undefined =>
    raw == null ? undefined : values.find((v) => v.toLowerCase() === raw.toLowerCase());

  const readInitial = (): T => {
    if (!enabled) return fallback;
    // 1. explicit URL segment wins (deep link / refresh)
    const fromUrl = match(readSubViewFromPath(tab, window.location.pathname));
    if (fromUrl) return fromUrl;
    // 2. else the last-visited view for this page
    try {
      const stored = match(sessionStorage.getItem(storageKey));
      if (stored) return stored;
    } catch {
      /* storage may be unavailable (private mode) */
    }
    return fallback;
  };

  const [view, setViewState] = useState<T>(readInitial);

  const syncUrl = useCallback(
    (v: T) => {
      if (!enabled) return;
      const path = buildSubViewPath(tab, v.toLowerCase());
      if (path && path !== window.location.pathname) {
        // replaceState (not push): switching sub-tabs shouldn't spam history,
        // but the address bar must still reflect the visible view for refresh.
        window.history.replaceState(window.history.state, '', path);
      }
    },
    [tab, enabled],
  );

  const setView = useCallback(
    (v: T) => {
      setViewState(v);
      if (enabled) {
        try {
          sessionStorage.setItem(storageKey, v);
        } catch {
          /* ignore */
        }
      }
      syncUrl(v);
    },
    [storageKey, syncUrl, enabled],
  );

  // On mount, reflect the restored view into the URL when it came from storage or
  // the default (i.e. the URL landed on the bare parent path). Keeps the address
  // bar == the visible view after a sidebar navigation.
  useEffect(() => {
    syncUrl(view);
    // mount-only: the URL is otherwise driven by setView + useUrlRouting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [view, setView];
}
