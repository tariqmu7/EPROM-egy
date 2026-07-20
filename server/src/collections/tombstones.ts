// Tombstone helpers — see migration 003. A tombstone lets delta-sync clients
// learn about hard deletes (which `updated_at > cursor` can't observe).
// `collection` is the logical registry name (e.g. 'jobProfiles'), matching what
// the client requests deletions by.

type Runner = (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

/** Record (or refresh) a deletion so delta clients evict the id. */
export async function writeTombstone(run: Runner, collection: string, id: string): Promise<void> {
  await run(
    `INSERT INTO tombstones (collection, id) VALUES ($1, $2)
     ON CONFLICT (collection, id) DO UPDATE SET deleted_at = now()`,
    [collection, id],
  );
}

/** Clear any tombstone for an id being (re)created, so it isn't wrongly evicted. */
export async function clearTombstone(run: Runner, collection: string, id: string): Promise<void> {
  await run(`DELETE FROM tombstones WHERE collection = $1 AND id = $2`, [collection, id]);
}
