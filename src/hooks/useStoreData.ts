import { useSyncExternalStore } from 'react';
import { dataService } from '../services/store';

/**
 * Re-renders the calling component whenever the DataService receives new
 * Firestore data (any onSnapshot listener delivering a fresh batch).
 *
 * Components still read their data synchronously via `dataService.getX()`;
 * this hook only forces the re-render so late-arriving snapshots become
 * visible immediately, instead of staying frozen until an unrelated
 * re-render (a tab switch or a manual edit) happens to recompute them.
 *
 * Returns a monotonic version counter. Pass it into the dependency array
 * of any `useMemo` that derives from store data, so the memo recomputes
 * when the underlying data changes:
 *
 *   const storeVersion = useStoreData();
 *   const manager = useMemo(
 *     () => dataService.getUserById(user.managerId),
 *     [user.managerId, storeVersion],
 *   );
 */
export function useStoreData(): number {
  return useSyncExternalStore(
    dataService.subscribe,
    dataService.getSnapshotVersion,
    dataService.getSnapshotVersion,
  );
}
