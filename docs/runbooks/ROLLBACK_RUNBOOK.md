# Rollback Runbook — EPROM CMS

Use this when a deploy of the self-hosted stack (SPA + Node/Express API + PostgreSQL)
introduces a regression and must be reverted. Run on the VM, from the repo directory.

> **Key idea:** a rollback has up to two parts — (1) revert the **code/images**, and
> (2) *only if the database was damaged* restore **data** from a backup. Normal redeploys
> keep the Postgres volume intact, so most rollbacks are code-only.

---

## Step 1 — Identify the previous good release

The "release" is a git commit (the `api` and `web` images are built from it).

```
git log --oneline -10
```

Note the last commit that was known-good in production (the one before the bad deploy).

---

## Step 2 — Revert the code to that commit

Prefer a forward revert (keeps history) when reverting specific bad commits:

```
git revert <bad-commit-hash>        # or a range: <first>^..<last>
```

Or, to jump straight back to a known-good commit:

```
git checkout <good-commit-hash>
```

---

## Step 3 — Rebuild and restart the stack

```
docker compose up -d --build
```

This rebuilds the `api` and `web` images from the reverted code and recreates the
containers. The `postgres` volume (`pgdata`) is **not** touched, so data is preserved.

Confirm health:
```
docker compose ps
curl -f http://localhost/api/health      # → {"ok":true,...}
```

---

## Step 4 — Restore the database (ONLY if data/schema was corrupted)

Skip this unless the bad deploy wrote bad data or applied a harmful migration. Restoring
**overwrites current data** with the backup's contents — take a fresh dump first so nothing
is lost irreversibly.

1. Take a safety dump of the current (bad) state:
   ```
   docker compose exec -T postgres pg_dump -U "$PGUSER" "$PGDATABASE" | gzip > backups/pre-restore-$(date +%F-%H%M).sql.gz
   ```

2. Pick the good nightly backup from `./backups/` (e.g. `cms-2026-07-10-0300.sql.gz`).

3. Restore it into the running Postgres container:
   ```
   gunzip -c backups/cms-<date>.sql.gz | docker compose exec -T postgres psql -U "$PGUSER" -d "$PGDATABASE"
   ```

4. Restart the API so it reconnects cleanly:
   ```
   docker compose restart api
   ```

> **Migrations are forward-only.** There is no automatic "down" migration. If a bad deploy's
> migration changed the schema, rolling the code back is not enough on its own — restore from a
> backup taken *before* that migration ran.

---

## Step 5 — Verify

1. Open the DNS URL in a private/incognito window; log in as Admin and as an Employee.
2. Confirm the regression is gone and data looks correct.
3. Check `docker compose logs api --tail=100` — no errors on boot or first requests.

---

## Step 6 — Fix forward

After production is stable on the known-good release:

1. Fix the bug on a branch, open a PR, get it reviewed.
2. Follow the full [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md) checklist for the next deploy.
3. If you used `git checkout <commit>` (detached HEAD) for the rollback, get back onto a branch
   (`git checkout main`) once the fix is merged and redeployed.

---

## Notes

- **Frontend + backend ship together** in the same images, so a code rollback reverts both at
  once — there is no separate "hosting rollback" step like the old Firebase flow had.
- **Auth accounts and data** live in Postgres, not in the images — they survive any code
  rollback. Only a Step 4 restore changes them.
- Keep at least the 30-day nightly backups (`./backups`) available; a rollback that needs a data
  restore is only as good as the most recent clean dump.
