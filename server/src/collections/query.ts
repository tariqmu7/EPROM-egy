// Translates a structured query spec into a parameterized SQL WHERE/ORDER/LIMIT
// clause over a (id, data JSONB) table. Only the operators the app actually
// uses are supported: equality, membership (in), and OR-of-equality groups.
export interface Filter {
  field: string;
  op: 'eq' | 'in';
  value: unknown;
}

export interface QuerySpec {
  where?: Filter[]; // ANDed together
  or?: Filter[]; // ORed together, then ANDed with `where`
  orderBy?: { field: string; direction?: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  // Delta-sync cursor: when set, only rows changed since this timestamp are
  // returned, ordered by `updated_at ASC` (overriding `orderBy`). See routes.ts.
  since?: string | null;
}

// Hard upper bound on how many rows any single list/query response may return.
// A caller may ask for fewer, never more. Without this a `GET /col/:name` with no
// `limit` streams an entire (scoped) collection into memory (finding F-3). Set to
// the client's own listener cap (MAX_LISTENER_DOCS) so no legitimate read is
// truncated; a delta poll that hits the cap simply resumes from the advanced
// cursor next tick.
export const MAX_PAGE_SIZE = 10000;

// Only simple identifiers are valid JSON field names in this app. Validating
// against this regex means the field can be safely inlined as data->>'field'
// (no quote/backslash can appear), which is injection-safe AND portable.
//
// NOTE (finding F-6): the generic read path always filters/orders via
// `data->>'field'`, so it is served by the btree EXPRESSION indexes from
// migration 001 — not the typed generated columns added in 002. Those columns
// exist for their CHECK constraints and ad-hoc/reporting SQL; migration 004
// dropped their now-redundant duplicate indexes. If a hot field ever needs the
// typed column on the app path, map it here and index the column deliberately.
const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function fieldExpr(field: string): string {
  if (!FIELD_RE.test(field)) {
    throw new Error(`invalid query field: ${field}`);
  }
  return `data->>'${field}'`;
}

function renderFilter(f: Filter, params: unknown[]): string {
  const col = fieldExpr(f.field);
  if (f.op === 'in') {
    const arr = Array.isArray(f.value) ? f.value.map((v) => String(v)) : [String(f.value)];
    const valParam = params.push(arr);
    return `${col} = ANY($${valParam}::text[])`;
  }
  // eq
  const valParam = params.push(f.value == null ? null : String(f.value));
  return `${col} = $${valParam}`;
}

export interface BuiltQuery {
  text: string;
  params: unknown[];
}

// A mandatory access-control scope, ANDed into every list query so the caller can
// never over-return. The conditions in `or` are OR'd together (the row is visible
// if it matches ANY of them). An empty `or` denies everything. A `null`/absent
// scope means no restriction (privileged reader or an open collection).
export interface ScopeFilter {
  or: Filter[];
}

// Builds "<table-agnostic> WHERE ... ORDER BY ... LIMIT ...". Caller supplies the
// SELECT + table. `scope` is a mandatory access filter (e.g. own + subordinate
// records) that is always ANDed in — it is the server-side read boundary.
export function buildWhere(
  spec: QuerySpec,
  scope?: ScopeFilter | null,
): BuiltQuery {
  const params: unknown[] = [];
  const clauses: string[] = [];

  if (scope) {
    if (scope.or.length === 0) {
      clauses.push('FALSE'); // scope present but matches nothing → deny all
    } else {
      const ors = scope.or.map((f) => renderFilter(f, params));
      clauses.push(`(${ors.join(' OR ')})`);
    }
  }

  for (const f of spec.where ?? []) {
    clauses.push(renderFilter(f, params));
  }

  if (spec.or && spec.or.length > 0) {
    const ors = spec.or.map((f) => renderFilter(f, params));
    clauses.push(`(${ors.join(' OR ')})`);
  }

  // Delta cursor filters on the real `updated_at` column (not a JSONB field).
  const isDelta = typeof spec.since === 'string' && spec.since !== '';
  if (isDelta) {
    const p = params.push(spec.since);
    clauses.push(`updated_at > $${p}`);
  }

  let text = clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '';

  if (isDelta) {
    // Deterministic progression for the cursor; overrides any spec.orderBy.
    text += ` ORDER BY updated_at ASC`;
  } else if (spec.orderBy?.field) {
    const dir = spec.orderBy.direction === 'desc' ? 'DESC' : 'ASC';
    text += ` ORDER BY ${fieldExpr(spec.orderBy.field)} ${dir}`;
  }

  // Always emit a LIMIT: honour a smaller client-requested page, otherwise fall
  // back to MAX_PAGE_SIZE, and never exceed it. This is the single choke point
  // both the GET list and POST query paths flow through, so every response is
  // bounded regardless of the caller (finding F-3).
  const requested = typeof spec.limit === 'number' && spec.limit > 0 ? Math.floor(spec.limit) : MAX_PAGE_SIZE;
  const p = params.push(Math.min(requested, MAX_PAGE_SIZE));
  text += ` LIMIT $${p}`;

  if (typeof spec.offset === 'number' && spec.offset > 0) {
    const p = params.push(Math.floor(spec.offset));
    text += ` OFFSET $${p}`;
  }

  return { text, params };
}
