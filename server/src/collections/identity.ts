// The `id` stored INSIDE a document is its identity, and it is not always the
// row's key. Records carried over from Firebase keep their original id in
// `data.id` (the canonical id every assessment, evidence, plan and `managerId`
// points at) while the row may be keyed by the person's login uid — see
// `canonicalId` in authz.ts.
//
// Every write used to stamp the row key over `data.id` (R11). On such a record
// that silently re-keyed the person: an admin archiving them, or re-pointing
// their reports' `managerId`, orphaned their whole history; and an owner's own
// profile edit was refused, because `id` is a protected users field and the
// stamp "changed" it.
//
// So: a new document takes the row key; an existing one keeps the id it has.
// Whatever `id` the caller sent is ignored either way — an edit cannot change
// a record's identity.
export function docIdFor(existing: Record<string, any> | null | undefined, rowId: string): string {
  const stored = existing?.id;
  return typeof stored === 'string' && stored !== '' ? stored : rowId;
}
