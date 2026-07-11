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
export async function getDocs(ref: CollectionRef | QueryRef): Promise<QuerySnapshot> {
  const name = nameOf(ref);
  const spec = ref.__type === 'query' ? buildSpec(ref.constraints) : {};
  const res = await api.post<{ documents: { id: string; data: DocumentData }[] }>(
    `/col/${name}/query`,
    spec,
  );
  return mkQuerySnapshot(res.documents);
}

export async function getDoc(ref: DocRef): Promise<DocumentSnapshot> {
  try {
    const res = await api.get<{ id: string; data: DocumentData }>(`/col/${ref.name}/${encodeURIComponent(ref.id)}`);
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
export async function setDoc(ref: DocRef, data: DocumentData, options?: { merge?: boolean }): Promise<void> {
  if (options?.merge) {
    await api.patch(`/col/${ref.name}/${encodeURIComponent(ref.id)}`, { data });
  } else {
    await api.put(`/col/${ref.name}/${encodeURIComponent(ref.id)}`, { data });
  }
}

export async function updateDoc(ref: DocRef, data: DocumentData): Promise<void> {
  await api.patch(`/col/${ref.name}/${encodeURIComponent(ref.id)}`, { data });
}

export async function deleteDoc(ref: DocRef): Promise<void> {
  await api.del(`/col/${ref.name}/${encodeURIComponent(ref.id)}`);
}

export async function addDoc(ref: CollectionRef, data: DocumentData): Promise<DocRef> {
  const res = await api.post<{ id: string }>(`/col/${ref.name}`, { data });
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

  const tick = async () => {
    try {
      const snap = ref.__type === 'doc' ? await getDoc(ref as DocRef) : await getDocs(ref as CollectionRef | QueryRef);
      if (!cancelled) onNext(snap);
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
