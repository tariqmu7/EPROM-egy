# Dev → Staging → Production Workflow

How a change travels from your laptop to the live EPROM CMS. Read this once; after
that the loop is four commands.

```
  laptop            GitHub                  EPROM VM
  ──────            ──────                  ────────
  run.bat     →  feature branch  →  PR  →  main  →  staging (:8081)
                                             ↓         ↓ smoke test
                                            tag  →  PRODUCTION (:8080)
```

Three rules make the rest work:

1. **Never commit to `main` directly.** Every change is a branch + PR, so CI gates it.
2. **`main` is always deployable.** If it is broken, fixing it is the priority.
3. **Production only ever runs a tag.** A release has a name, so rollback is one command.

---

## 1. Develop (your laptop)

```
git checkout main && git pull origin main
git checkout -b feat/my-change
run.bat                      # API :4000 (embedded Postgres) + SPA :5173
```

`run.bat` uses an embedded throwaway Postgres — you cannot damage anything real.
Seeded admin credentials come from `server/.env`.

## 2. Test locally — before you push

```
npm run typecheck  &&  npm run lint  &&  npm test
cd server  &&  npm run typecheck  &&  npm test  &&  cd ..
```

Same checks CI runs, so passing here means the PR goes green. Run them yourself
first — waiting on CI to discover a typo is slow.

## 3. Open a PR

```
git push -u origin feat/my-change
gh pr create --fill
```

[CI](../../.github/workflows/ci.yml) runs audit + typecheck + lint + tests on both
frontend and server. **Merge only when green.** Squash-merge into `main`.

> **Recommended one-time setup:** in GitHub → Settings → Branches, protect `main`:
> require a PR, and require the CI check to pass. Rule 1 becomes enforced rather
> than remembered.

## 4. Deploy to staging (on the VM)

Staging is a second, fully isolated stack on the same VM — its own database
volume, its own port (8081), its own subdomain. Production is untouched.

```
ssh <vm>
cd /path/to/ECMS
./deploy/deploy.sh --staging          # deploys main
```

**First time only:**
```
cp .env.staging.example .env.staging  # then edit — use DIFFERENT secrets than prod
```
Set `CORS_ORIGINS` to the VM's real LAN IP and port.

Staging needs **no DNS name and no IT request** — you browse it directly at
`http://<vm-ip>:8081` from the company network. Only production goes through the
host nginx / subdomain ([`deploy/nginx-host-ecms.conf`](../../deploy/nginx-host-ecms.conf)).

> Because staging publishes on all interfaces, anyone who can route to the VM can
> open it — and [`restore-db.sh`](../../deploy/restore-db.sh) puts **real production
> data** inside it. If the VM is reachable beyond your own subnet, firewall port
> 8081 accordingly.

### Give staging real-shaped data

Testing against an empty database proves very little. Load the newest nightly
production dump into staging:

```
./deploy/restore-db.sh backups/cms-<newest>.sql.gz
```

This **also proves the backups restore** — do it at least monthly regardless of
whether you are shipping. An untested backup is a file, not a backup.

### Smoke test

Open `http://<vm-ip>:8081` from your laptop and walk the paths that matter: log
in as admin, open a job profile, run an evaluation, check a gap report and an
ITP. Anything that touched your change gets exercised deliberately.

## 5. Release to production

Tag the exact commit you validated on staging:

```
git checkout main && git pull
git tag -a v1.4.0 -m "Clean URL routing + delta sync"
git push origin v1.4.0
```

Then on the VM:

```
./deploy/deploy.sh v1.4.0
```

The script refuses a dirty tree, **backs up the database before touching
anything**, rebuilds, and waits for `/api/health/ready` to genuinely answer. If
health never comes up it rolls the code back automatically and prints the API
logs.

## 6. If a release goes bad

```
./deploy/deploy.sh v1.3.0      # the previous tag
```

That covers code. **It does not undo database migrations** — they are
forward-only by design. If the bad release migrated the schema, or corrupted
data, see [`ROLLBACK_RUNBOOK.md`](ROLLBACK_RUNBOOK.md) and the pre-deploy dump
the deploy script left in `backups/predeploy-*.sql.gz`.

---

## Command reference

| What | Command |
|---|---|
| Local dev | `run.bat` |
| Full local check | `npm run typecheck && npm run lint && npm test` |
| Deploy main to staging | `./deploy/deploy.sh --staging` |
| Deploy a branch to staging | `./deploy/deploy.sh --staging feat/my-change` |
| Load prod data into staging | `./deploy/restore-db.sh backups/<dump>.sql.gz` |
| Release to production | `./deploy/deploy.sh v1.4.0` |
| Roll production back | `./deploy/deploy.sh v1.3.0` |
| Staging logs | `docker compose -p ecms-staging -f docker-compose.yml -f docker-compose.staging.yml logs -f api` |
| Production logs | `docker compose logs -f api` |
| Integrity check | `docker compose exec api npm run integrity` |

> **Why staging needs `-f` flags and production does not:** production relies on
> [`docker-compose.override.yml`](../../docker-compose.override.yml) being merged
> automatically (it is what binds prod to port 8080 on the shared VM). Passing
> explicit `-f` files turns that automatic merge off — which is exactly what
> staging wants, since it binds 8081 instead.
