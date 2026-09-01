# Production hardening — what is on, what is off, what you must do

Written 1 Sep 2026 (task 7 of the pre-production audit). This is the sheet to
read before ECMS carries real staff logins, and again after any deploy that
touches nginx, the API's config, or the backup service.

The audit's earlier tasks closed the authorization holes and the upload and
session ones. This file covers the layer underneath: the wire, the headers, the
secrets and the backups.

---

## 1. THE ONE THING STILL OPEN — the traffic is not encrypted

The stack listens on **plain HTTP**. Every login password and every session
token crosses the company network in the clear, and a token copied off the wire
is good for 12 hours as that user. Nothing else in this document matters as much.

It is not switched on automatically because nginx will not start without a
certificate file, and shipping it enabled would mean a stack that cannot boot.

**Action: follow [`deploy/tls/README.md`](../../deploy/tls/README.md).** Ask IT
for a certificate from the company CA (route (a) — no browser warnings); use
`deploy/tls/make-selfsigned-cert.sh` only as a stop-gap while you wait.

---

## 2. Security headers — ON

Both nginx configs now send a full header set, including a real
**Content-Security-Policy**:

| Header | Why |
|---|---|
| `Content-Security-Policy` | `script-src 'self'` — no inline script anywhere. This is the directive that actually stops a stored-XSS payload from running. |
| `X-Content-Type-Options: nosniff` | An uploaded file must never be re-read as HTML. |
| `X-Frame-Options` + `frame-ancestors 'none'` | The app is never framed. |
| `Referrer-Policy` | URLs carry user ids (`/ceo/profile/:id`); don't leak them off-site. |
| `Permissions-Policy` | Camera, microphone, geolocation and friends are refused up front. |
| `Strict-Transport-Security` | Written, but only in the **https** site — it is meaningless and harmful on http. |

The policy can be this strict because every dependency is bundled by Vite and
the Inter font is self-hosted: **the app loads nothing from the internet.** The
two deliberate relaxations are `style-src 'unsafe-inline'` (React writes inline
style attributes) and `img-src data: blob:` (ECMS has no object storage —
avatars, certificate scans and evidence images are base64 data URLs inside the
document, and blob: is the Excel export).

The header set lives once, in
[`deploy/nginx/security-headers.inc`](../../deploy/nginx/security-headers.inc),
and is `include`d by each server block. It is named `.inc`, not `.conf`, so
nginx's own `include conf.d/*.conf` does not load it a second time.

> **If you ever add a CDN script, an external font, or an embedded PDF viewer,
> the CSP will block it silently and the browser console is the only place that
> says so.** Change the policy in the same commit, not afterwards.

**One code rule follows from this:** `exportCompetenceStatement()` drives
printing from the opener window rather than writing a `<script>` into the
generated sheet. A document written into `about:blank` inherits this page's CSP,
so an inline script there would simply never run.

## 3. Secrets — the API now refuses to boot on a placeholder

`JWT_SECRET` is not a config value; it is the password to every account at once.
Anyone holding it can mint a token for any user id with role `ADMIN`, and every
check in `authz.ts` sits downstream of "the signature is valid".

The example env files ship `change-me-to-a-long-random-string`, which is 33
characters — long enough that a length check alone would have waved it through.
[`server/src/config.ts`](../../server/src/config.ts) now refuses to start, in
production only, on a secret under 32 characters **or** one containing
placeholder wording. `PGPASSWORD` gets the same treatment at 16 characters.
Pinned by `server/src/__tests__/config.test.ts`.

Generate each with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Changing `JWT_SECRET` invalidates every issued token — everyone is signed out
and signs back in. That is the emergency lever if a secret is ever exposed.

## 4. Backups — verified at write time, and rehearsed monthly

The nightly dump used to be a one-liner: `pg_dump ... | gzip > file.gz`. A shell
pipeline reports the **last** command's status and gzip succeeds on empty input,
so a pg_dump that failed still wrote a small, perfectly valid `.gz` that looked
like a backup — and the retention sweep then ran anyway. A month of silent
failures would have deleted every good dump and left a folder of empty files.

[`deploy/backup.sh`](../../deploy/backup.sh) replaces it. A file named
`cms-*.sql.gz` now only ever exists if it passed all of:

- `pg_dump` exited zero;
- the dump ends with pg_dump's own completion marker (catches a truncated dump);
- the compressed file is over 10 KB;
- and only then is it renamed into place, and only then are old dumps pruned.

Rehearsed 1 Sep 2026 against a fake `pg_dump` in four modes — good, connection
failure, truncated output, empty database. Only the good run produced a file;
each failure exited non-zero and left the previous good backup untouched.

### The monthly restore rehearsal — DO THIS

A dump nobody has ever restored is not a backup, it is a file. Once a month, on
the VM:

```bash
ls -1t backups/*.sql.gz | head -3                    # pick the newest
./deploy/restore-db.sh backups/cms-<newest>.sql.gz   # restores into STAGING
docker compose -p ecms-staging exec -T api npm run integrity
```

`restore-db.sh` counts rows afterwards and fails loudly if the restore left the
`users` table empty. Write the date and the row count somewhere you will find
next month. If it fails, that is a live incident: the backups are not working.

## 5. Dependency advisories — decided

Non-breaking fixes applied on both halves (1 Sep 2026).

- **Server API: 0 advisories.**
- **Frontend: 4 left, none of them shipped to a user, and both "fixes" are
  breaking downgrades — so both are deliberately NOT taken:**
  - `vite` / `esbuild` — a dev-server issue. The fix is Vite 8, a major upgrade.
    The dev server never runs in production; the VM serves a static build.
  - `exceljs` → `uuid` — the advisory is a missing bounds check in uuid **v3/v5/v6
    when a `buf` argument is passed**. exceljs calls only `uuid.v4`, with no
    buffer (`lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`), so the code path
    does not exist here. The offered fix is exceljs 3.4.0, a major downgrade that
    would break Excel import and export.

Re-check with `npm audit` before each release and revisit if either becomes
reachable.

---

## Still open, and needing Tariq's decision

- **Self sign-up** — off. Should employees be able to register themselves into
  an approval queue, or are all accounts admin-created?
- **The staff directory** — every signed-in user can read every employee record.
  Approved "for now" in July; confirm for production.
- **The session token lives in `localStorage`**, so it survives a browser restart
  for the JWT's 12 hours. On a shared machine `sessionStorage` would be safer,
  at the cost of signing people out whenever they close the browser.
- **Scale** — how many people, how often? The rate limits (600 req/min per IP)
  and the SPA polling interval are guesses until that is known.
