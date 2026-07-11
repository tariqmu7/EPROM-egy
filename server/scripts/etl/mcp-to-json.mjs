// Convert a Firestore REST "listDocuments" payload ({documents:[{name,fields}]})
// into the plain [{ id, data }] shape that load-postgres.mjs expects.
//
//   node scripts/etl/mcp-to-json.mjs <raw-input.json> <collection> <out.json>
//
// Used for the one-time, no-key pull of `departments` + `skills` from Firestore
// via the authenticated Firebase CLI/MCP (no service-account key needed).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Firestore typed value → plain JS value (recursive).
function val(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue; // keep ISO string
  if ('nullValue' in v) return null;
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('bytesValue' in v) return v.bytesValue;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(val);
  if ('mapValue' in v) return fields(v.mapValue.fields ?? {});
  return null;
}
function fields(f) {
  const out = {};
  for (const [k, v] of Object.entries(f)) out[k] = val(v);
  return out;
}

const [rawPath, collection, outPath] = process.argv.slice(2);
if (!rawPath || !collection || !outPath) {
  console.error('usage: node mcp-to-json.mjs <raw-input.json> <collection> <out.json>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
const docs = (raw.documents ?? []).map((d) => {
  const id = d.name.split('/').pop();
  const data = fields(d.fields ?? {});
  data.id = id; // ensure the doc carries its own id (matches app convention)
  return { id, data };
});

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(docs, null, 2));
console.log(`${collection}: wrote ${docs.length} docs -> ${outPath}`);
if (raw.nextPageToken) console.warn(`WARNING: input had nextPageToken — ${collection} may be incomplete!`);
