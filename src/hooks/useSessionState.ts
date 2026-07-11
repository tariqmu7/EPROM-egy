import { useCallback, useState } from 'react';

/**
 * `useState` backed by sessionStorage, so a value survives a page refresh (but
 * not a new tab / browser restart — session scope). Use for finer in-page state
 * that shouldn't own a URL: list filters, drill-down sub-tabs, search terms.
 *
 * Values are JSON-serialised. `key` is namespaced under `eprom_ss_`.
 */
export function useSessionState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const storageKey = `eprom_ss_${key}`;

  const [value, setValueState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw != null) return JSON.parse(raw) as T;
    } catch {
      /* storage unavailable / bad JSON → fall back to initial */
    }
    return initial;
  });

  const setValue = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
        try {
          sessionStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  return [value, setValue];
}
