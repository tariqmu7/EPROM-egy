// ============================================================================
// Firestore-compatible shim over the self-hosted REST API.
//
// Exposes the exact subset of the `firebase/firestore` API that
// services/store.ts imports, so the data layer can be swapped by changing
// import lines (or a Vite alias) rather than rewriting 150+ call sites.
//
// Real-time is replaced by POLLING: onSnapshot fetches immediately, then on an
// interval, and invokes the callback with the same snapshot shape store.ts
// already consumes (snapshot.docs[].data()/.id, getDoc().exists()/.data()).
// ============================================================================
import { api, ApiError } from './api-client';

// Polling cadence for onSnapshot listeners (ms). Overridable via env.
export const POLL_INTERVAL_MS: number = Number(import.meta.env.VITE_POLL_INTERVAL_MS) || 20000;

// `db` is just an opaque marker in the compat world — the API base URL is fixed
// in api-client. store.ts passes it to collection()/doc()/writeBatch(); we ignore it.
export const compatDb = { __eprom: 'db' } as const;

// How often a delta-synced listener does a FULL resync instead of an incremental
// one. Delta (updated_at > cursor) misses two rare edge cases: a row that was
// updated so it no longer matches the listener's filter, and a tombstone the
// client was offline for. A periodic full sync self-heals both. At the default
// 20s poll, 15 ticks ≈ every 5 minutes.
const DELTA_FULL_RESYNC_TICKS = 15;

// ── Optimistic-concurrency version cache ────────────────────────────────────
// The server returns a monotonic `version` per document. We remember the last
// version seen per (collection/id) so merge-writes can send `expectedVersion`
// and a lost update becomes a detectable 409 instead of silent data loss.
// Populated by every read; refreshed on every successful write.
const versionCache = new Map<string, number>();
const vkey = (name: string, id: string) => `${name}/${id}`;
function recordVersion(name: string, id: string, version: unknown): void {
  if (typeof version === 'number') versionCache.set(vkey(name, id), version);
}

/** Thrown when a merge-write keeps losing a race after several auto-retries. */
export class VersionConflictError extends Error {
  constructor(
    public collection: string,
    public id: string,
    public currentVersion?: number,
  ) {
    super(`version conflict on ${collection}/${id}`);
    this.name = 'VersionConflictError';
  }
}

// ── Reference types ─────────────────────────────────────────────────────────
type WhereOp = '==' | 'in';

interface WhereC { __c: 'where'; field: string; op: WhereOp; value: unknown }
interface OrC { __c: 'or'; clauses: WhereC[] }
interface OrderC { __c: 'orderBy'; field: string; direction: 'asc' | 'desc' }
interface LimitC { __c: 'limit'; n: number }
interface StartAfterC { __c: 'startAfter'; offset: number }
type Constraint = WhereC | OrC | OrderC | LimitC | StartAfterC;

export interface CollectionRef { __type: 'collection'; name: string }
export interface DocRef { __type: 'doc'; name: string; id: string }
export interface QueryRef { __type: 'query'; name: string; constraints: Constraint[] }

// ── Snapshot types (match Firestore's consumed surface) ─────────────────────
export type DocumentData = Record<string, any>;

export interface QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  _index: number;
  // `exists()` is inherited from DocumentSnapshot as a `this is QueryDocumentSnapshot<T>`
  // type predicate (mirroring firebase/firestore); only `data()` is overridden to
  // always return a defined value.
  data(): T; // always defined (overrides DocumentSnapshot.data)
}

export interface QuerySnapshot<T = DocumentData> {
  docs: QueryDocumentSnapshot<T>[];
  size: number;
  empty: boolean;
  forEach(cb: (d: QueryDocumentSnapshot<T>) => void): void;
}

export interface DocumentSnapshot<T = DocumentData> {
  id: string;
  // Type guard mirroring firebase/firestore: after `if (snap.exists())`,
  // `snap.data()` narrows to a defined value.
  exists(): this is QueryDocumentSnapshot<T>;
  data(): T | undefined;
}

export type Unsubscribe = () => void;

// ── Reference builders ──────────────────────────────────────────────────────
function genId(): string {
  // 20-char id, Firestore-ish; only needs to be unique.
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 20; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export function collection(_db: unknown, name: string): CollectionRef {
  return { __type: 'collection', name };
}

// Overloads: doc(db, name, id) | doc(collectionRef, id?) | doc(collectionRef)
export function doc(dbOrColl: unknown, nameOrId?: string, id?: string): DocRef {
  if (dbOrColl && (dbOrColl as CollectionRef).__type === 'collection') {
    const coll = dbOrColl as CollectionRef;
    return { __type: 'doc', name: coll.name, id: nameOrId ?? genId() };
  }
  // doc(db, name, id)
  return { __type: 'doc', name: String(nameOrId), id: id ?? genId() };
}

export function query(ref: CollectionRef | QueryRef, ...constraints: Constraint[]): QueryRef {
  const base = ref.__type === 'query' ? ref.constraints : [];
  return { __type: 'query', name: ref.name, constraints: [...base, ...constraints] };
}

export function where(field: string, op: WhereOp, value: unknown): WhereC {
  return { __c: 'where', field, op, value };
}
export function or(...clauses: WhereC[]): OrC {
  return { __c: 'or', clauses };
}
export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): OrderC {
  return { __c: 'orderBy', field, direction };
}
export function limit(n: number): LimitC {
  return { __c: 'limit', n };
}
export function startAfter(snap: QueryDocumentSnapshot | null | undefined): StartAfterC {
  return { __c: 'startAfter', offset: snap ? snap._index + 1 : 0 };
}

// ── Query translation → API QuerySpec ───────────────────────────────────────
interface Filter { field: string; op: 'eq' | 'in'; value: unknown }
interface QuerySpec {
  where?: Filter[];
  or?: Filter[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  since?: string | null; // delta cursor
}

// Query endpoint response (now carries per-doc version + a delta cursor + deletes).
interface QueryResponse {
  documents: { id: string; data: DocumentData; version?: number }[];
  cursor?: string | null;
  deletions?: { id: string }[];
}

function toFilter(w: WhereC): Filter {
  return { field: w.field, op: w.op === 'in' ? 'in' : 'eq', value: w.value };
}

function buildSpec(constraints: Constraint[]): QuerySpec {
  const spec: QuerySpec = {};
  for (const c of constraints) {
    if (c.__c === 'where') (spec.where ??= []).push(toFilter(c));
    else if (c.__c === 'or') spec.or = c.clauses.map(toFilter);
    else if (c.__c === 'orderBy') spec.orderBy = { field: c.field, direction: c.direction };
    else if (c.__c === 'limit') spec.limit = c.n;
    else if (c.__c === 'startAfter') spec.offset = c.offset;
  }
  return spec;
}

function mkQueryDoc(row: { id: string; data: DocumentData }, index: number): QueryDocumentSnapshot {
  return {
    id: row.id,
    _index: index,
    exists(): this is QueryDocumentSnapshot {
      return true;
    },
    data: () => row.data,
  };
}

function mkQuerySnapshot(rows: { id: string; data: DocumentData }[]): QuerySnapshot {
  const docs = rows.map(mkQueryDoc);
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    forEach: (cb) => docs.forEach(cb),
  };
}

function nameOf(ref: CollectionRef | QueryRef): string {
  return ref.name;
}

// ── Reads ───────────────────────────────────────────────────────────────────
// Low-level query that records every returned doc's version (keeps the
// optimistic-concurrency cache warm) and passes the delta cursor/deletions
// straight through to the caller.
async function postQuery(name: string, spec: QuerySpec): Promise<QueryResponse> {
  const res = await api.post<QueryResponse>(`/col/${name}/query`, spec);
  for (const d of res.documents) recordVersion(name, d.id, d.version);
  return res;
}

export async function getDocs(ref: CollectionRef | QueryRef): Promise<QuerySnapshot> {
  const name = nameOf(ref);
  const spec = ref.__type === 'query' ? buildSpec(ref.constraints) : {};
  const res = await postQuery(name, spec);
  return mkQuerySnapshot(res.documents);
}

export async function getDoc(ref: DocRef): Promise<DocumentSnapshot> {
  try {
    const res = await api.get<{ id: string; data: DocumentData; version?: number }>(
      `/col/${ref.name}/${encodeURIComponent(ref.id)}`,
    );
    recordVersion(ref.name, res.id, res.version);
    return {
      id: res.id,
      exists(): this is QueryDocumentSnapshot {
        return true;
      },
      data: () => res.data,
    };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
      return {
        id: ref.id,
        exists(): this is QueryDocumentSnapshot {
          return false;
        },
        data: () => undefined,
      };
    }
    throw e;
  }
}

// ── Writes ──────────────────────────────────────────────────────────────────
// A merge write (PATCH) with automatic optimistic concurrency: it sends the last
// known version, and on a 409 re-reads the current version and retries. Because
// the server re-merges the patch onto the LATEST document, concurrent edits to
// different fields both succeed; only a genuine same-field race keeps conflicting,
// which surfaces as VersionConflictError after a few attempts.
async function patchWithConcurrency(name: string, id: string, data: DocumentData): Promise<void> {
  const url = `/col/${name}/${encodeURIComponent(id)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const known = versionCache.get(vkey(name, id));
    try {
      const res = await api.patch<{ version?: number }>(url, known !== undefined ? { data, expectedVersion: known } : { data });
      recordVersion(name, id, res?.version);
      return;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const current = (e.body as { currentVersion?: number } | undefined)?.currentVersion;
        if (typeof current === 'number') versionCache.set(vkey(name, id), current);
        else versionCache.delete(vkey(name, id)); // unknown → next try sends no expectedVersion
        continue;
      }
      throw e;
    }
  }
  throw new VersionConflictError(name, id, versionCache.get(vkey(name, id)));
}

export async function setDoc(ref: DocRef, data: DocumentData, options?: { merge?: boolean }): Promise<void> {
  if (options?.merge) {
    await patchWithConcurrency(ref.name, ref.id, data);
  } else {
    // Full replace is intentionally last-write-wins (no expectedVersion).
    const res = await api.put<{ version?: number }>(`/col/${ref.name}/${encodeURIComponent(ref.id)}`, { data });
    recordVersion(ref.name, ref.id, res?.version);
  }
}

export async function updateDoc(ref: DocRef, data: DocumentData): Promise<void> {
  await patchWithConcurrency(ref.name, ref.id, data);
}

export async function deleteDoc(ref: DocRef): Promise<void> {
  await api.del(`/col/${ref.name}/${encodeURIComponent(ref.id)}`);
  versionCache.delete(vkey(ref.name, ref.id));
}

export async function addDoc(ref: CollectionRef, data: DocumentData): Promise<DocRef> {
  const res = await api.post<{ id: string; version?: number }>(`/col/${ref.name}`, { data });
  recordVersion(ref.name, res.id, res.version);
  return { __type: 'doc', name: ref.name, id: res.id };
}

// ── writeBatch (atomic) ─────────────────────────────────────────────────────
interface BatchOp { type: 'set' | 'update' | 'delete'; collection: string; id: string; data?: DocumentData }

export function writeBatch(_db: unknown) {
  const ops: BatchOp[] = [];
  return {
    set(ref: DocRef, data: DocumentData) {
      ops.push({ type: 'set', collection: ref.name, id: ref.id, data });
      return this;
    },
    update(ref: DocRef, data: DocumentData) {
      ops.push({ type: 'update', collection: ref.name, id: ref.id, data });
      return this;
    },
    delete(ref: DocRef) {
      ops.push({ type: 'delete', collection: ref.name, id: ref.id });
      return this;
    },
    async commit() {
      if (ops.length === 0) return;
      await api.post('/batch', { operations: ops });
    },
  };
}

// ── onSnapshot → polling ────────────────────────────────────────────────────
// Overloaded like firebase/firestore so the callback's snapshot type is inferred
// from the ref (doc → DocumentSnapshot, collection/query → QuerySnapshot),
// which in turn types the `snap.docs.map(doc => …)` callbacks in store.ts.
export function onSnapshot(
  ref: DocRef,
  onNext: (snap: DocumentSnapshot) => void,
  onError?: (err: unknown) => void,
): Unsubscribe;
export function onSnapshot(
  ref: CollectionRef | QueryRef,
  onNext: (snap: QuerySnapshot) => void,
  onError?: (err: unknown) => void,
): Unsubscribe;
export function onSnapshot(
  ref: DocRef | CollectionRef | QueryRef,
  onNext: (snap: any) => void,
  onError?: (err: unknown) => void,
): Unsubscribe {
  let cancelled = false;

  // Single-document listener: just poll the doc.
  if (ref.__type === 'doc') {
    const tick = async () => {
      try {
        const snap = await getDoc(ref as DocRef);
        if (!cancelled) onNext(snap);
      } catch (err) {
        if (!cancelled && onError) onError(err);
      }
    };
    void tick();
    const handle = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }

  // Collection / query listener: maintain a local cache and fetch only the rows
  // that changed since the last poll (delta sync), reconstructing the SAME full
  // snapshot store.ts already consumes — so no listener code changes. Deletes
  // arrive as tombstones and evict from the cache. Ordered queries opt out
  // (their order/limit can't be reconstructed cheaply) and stay full-snapshot.
  const collRef = ref as CollectionRef | QueryRef;
  const name = collRef.name;
  const baseSpec: QuerySpec = collRef.__type === 'query' ? buildSpec(collRef.constraints) : {};
  const deltaEligible = !baseSpec.orderBy;

  const cache = new Map<string, DocumentData>();
  let cursor: string | null = null;
  let tickN = 0;

  const emit = () => {
    if (cancelled) return;
    const rows = [...cache.entries()].map(([id, data]) => ({ id, data }));
    onNext(mkQuerySnapshot(rows));
  };

  const tick = async () => {
    try {
      const doFull = !deltaEligible || cursor == null || tickN % DELTA_FULL_RESYNC_TICKS === 0;
      tickN++;
      if (doFull) {
        const res = await postQuery(name, baseSpec);
        cache.clear();
        for (const d of res.documents) cache.set(d.id, d.data);
        cursor = res.cursor ?? cursor;
      } else {
        const res = await postQuery(name, { ...baseSpec, since: cursor });
        for (const d of res.documents) cache.set(d.id, d.data);
        for (const del of res.deletions ?? []) cache.delete(del.id);
        cursor = res.cursor ?? cursor;
      }
      emit();
    } catch (err) {
      if (!cancelled && onError) onError(err);
    }
  };

  void tick(); // fire immediately, like Firestore's initial snapshot
  const handle = setInterval(() => void tick(), POLL_INTERVAL_MS);
  return () => {
    cancelled = true;
    clearInterval(handle);
  };
}

// ── Field values / timestamps ───────────────────────────────────────────────
// Our documents store dates as ISO strings, so serverTimestamp is the current
// ISO timestamp. Timestamp is a light shim for the few type references.
export function serverTimestamp(): string {
  return new Date().toISOString();
}

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static now(): Timestamp {
    return Timestamp.fromDate(new Date());
  }
  static fromDate(d: Date): Timestamp {
    return new Timestamp(Math.floor(d.getTime() / 1000), 0);
  }
  toDate(): Date {
    return new Date(this.seconds * 1000);
  }
  toMillis(): number {
    return this.seconds * 1000;
  }
}
