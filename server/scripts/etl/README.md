# ETL — migrate Firestore data into Postgres

One-time (plus a final delta at cutover). Preserves document IDs.

## Prerequisites
- Postgres up and schema migrated (`npm run migrate` in `/server`, or the api
  container which migrates on boot).
- A Firebase **service account** key: Firebase console → Project settings →
  Service accounts → *Generate new private key*.

## Run

```bash
cd server

# 1) Export from Firestore  (one-off dep)
npm i firebase-admin
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json   # Windows: set ...
node scripts/etl/export-firestore.mjs
# → writes scripts/etl/data/<collection>.json

# 2) Load into Postgres  (uses server/.env for the connection)
node scripts/etl/load-postgres.mjs
```

## Notes
- **Passwords do not migrate.** Firebase Auth password hashes aren't exportable.
  Every user gets an `auth_credentials` row with `must_reset=true` and no hash.
  Give users a temporary password via the admin panel (`POST /auth/admin/set-password`)
  or wire the reset-email flow. They set their own on first login.
- **Avatars localized on load.** Migrated users carry remote `ui-avatars.com`
  links from the 2026-05 Firebase migration. The loader rewrites any remote
  `http(s)` avatar to a self-contained data-URI SVG (initials on a colored
  background) — a port of `utils/localAvatar.ts`, matching what new signups get —
  so no avatar request leaves the machine. Real `data:` uploads are left as-is.
  The load logs `avatars localized: N`.
- **Idempotent.** Both steps are safe to re-run — the load upserts by ID, so you
  can run a final delta at cutover after freezing Firebase writes. The avatar
  rewrite is idempotent too (the rewritten value is a `data:` URI, so re-runs skip it).
- **Verify** after load: compare row counts to the export line output, and spot
  check a few users' skill scores against the current Firebase app.

## Verify counts (quick)
```bash
node -e "const fs=require('fs');const d='scripts/etl/data';for(const f of fs.readdirSync(d)){console.log(f, JSON.parse(fs.readFileSync(d+'/'+f)).length)}"
```
