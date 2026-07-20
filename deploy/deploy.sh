#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EPROM CMS — deploy script. Run ON THE VM, from the repo root:
#
#   ./deploy/deploy.sh --staging          # deploy main to staging
#   ./deploy/deploy.sh --staging <ref>    # deploy any branch/tag to staging
#   ./deploy/deploy.sh v1.4.0             # deploy a tag to PRODUCTION
#
# What it does, in order:
#   1. refuses to run on a dirty working tree
#   2. fetches and checks out the requested ref
#   3. backs up the database FIRST (production only)
#   4. rebuilds and restarts the stack
#   5. waits for /api/health/ready to actually answer
#   6. if health never comes up, rolls the CODE back to the previous commit
#
# Production requires an explicit ref (a tag), so a deploy is always a
# deliberate, named release you can point at when rolling back.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET=production
if [[ "${1:-}" == "--staging" ]]; then
  TARGET=staging
  shift
fi

REF="${1:-}"

if [[ "$TARGET" == "production" ]]; then
  ENV_FILE=.env
  # The live VM (192.168.240.4) is DEDICATED to this app, so the web container
  # owns port 80 directly and docker-compose.override.yml was deleted there.
  # Default to 80, not 8080 — otherwise the health check below polls a port
  # nothing is listening on and rolls back a perfectly good deploy.
  DEFAULT_PORT=80
  COMPOSE=(docker compose)          # no -f: docker-compose.override.yml auto-merges
  if [[ -z "$REF" ]]; then
    echo "ERROR: production needs an explicit ref (a release tag)." >&2
    echo "       e.g. ./deploy/deploy.sh v1.4.0" >&2
    echo "       Recent tags:" >&2
    git tag --sort=-creatordate | head -5 | sed 's/^/         /' >&2
    exit 1
  fi
else
  ENV_FILE=.env.staging
  DEFAULT_PORT=8081
  COMPOSE=(docker compose -p ecms-staging --env-file .env.staging
           -f docker-compose.yml -f docker-compose.staging.yml)
  REF="${REF:-main}"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy the matching .example and fill it in." >&2
  exit 1
fi

# WEB_PORT lives in the env file; read it without sourcing the whole thing
# (which would drag secrets into this shell's environment unnecessarily).
WEB_PORT="$(sed -n 's/^WEB_PORT=//p' "$ENV_FILE" | tail -1)"
WEB_PORT="${WEB_PORT:-$DEFAULT_PORT}"

echo "==> Target:  $TARGET"
echo "==> Ref:     $REF"
echo "==> Port:    127.0.0.1:$WEB_PORT"

# ── 1. clean tree ────────────────────────────────────────────────────────────
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree is dirty. Commit or stash on the VM before deploying." >&2
  git status --short >&2
  exit 1
fi

PREV_COMMIT="$(git rev-parse HEAD)"
echo "==> Current commit (rollback point): $PREV_COMMIT"

# ── 2. check out the ref ─────────────────────────────────────────────────────
git fetch --all --tags --prune
git checkout --detach "$REF"
NEW_COMMIT="$(git rev-parse HEAD)"
echo "==> Deploying commit: $NEW_COMMIT"

# ── 3. back up the database first (production only) ──────────────────────────
# Staging data is disposable; production is not. Taking the dump BEFORE the new
# code runs its migrations means this file is the pre-migration state.
if [[ "$TARGET" == "production" ]]; then
  mkdir -p backups
  STAMP="$(date +%F-%H%M%S)"
  DUMP="backups/predeploy-$STAMP.sql.gz"
  echo "==> Backing up database to $DUMP"
  PGUSER_VAL="$(sed -n 's/^PGUSER=//p' "$ENV_FILE" | tail -1)"
  PGDB_VAL="$(sed -n 's/^PGDATABASE=//p' "$ENV_FILE" | tail -1)"
  if ! "${COMPOSE[@]}" exec -T postgres \
        pg_dump -U "${PGUSER_VAL:-cms}" "${PGDB_VAL:-eprom_cms}" | gzip > "$DUMP"; then
    echo "ERROR: pre-deploy backup failed — refusing to deploy." >&2
    rm -f "$DUMP"
    git checkout --detach "$PREV_COMMIT"
    exit 1
  fi
  echo "==> Backup OK ($(du -h "$DUMP" | cut -f1))"
fi

# ── 4. rebuild + restart ─────────────────────────────────────────────────────
echo "==> Building and starting the stack"
"${COMPOSE[@]}" up -d --build

# ── 5. wait for readiness ────────────────────────────────────────────────────
# /health/ready pings the DB too, so this proves migrations finished and the API
# can actually serve — not merely that a container started.
#
# The live VM has NO curl installed (only wget), so probe with whichever exists.
# Getting this wrong is worse than it sounds: a health check that can never
# succeed makes the script roll back a deploy that was actually fine.
if command -v curl >/dev/null 2>&1; then
  probe() { curl -fsS "$1" >/dev/null 2>&1; }
elif command -v wget >/dev/null 2>&1; then
  probe() { wget -q -O /dev/null "$1" >/dev/null 2>&1; }
else
  echo "ERROR: neither curl nor wget available — cannot verify health." >&2
  exit 1
fi

echo -n "==> Waiting for http://127.0.0.1:$WEB_PORT/api/health/ready "
HEALTHY=0
for _ in $(seq 1 60); do
  if probe "http://127.0.0.1:$WEB_PORT/api/health/ready"; then
    HEALTHY=1
    break
  fi
  echo -n "."
  sleep 3
done
echo

# ── 6. roll back on failure ──────────────────────────────────────────────────
if [[ "$HEALTHY" -ne 1 ]]; then
  echo "ERROR: stack did not become healthy within 3 minutes." >&2
  echo "==> Last 40 log lines:" >&2
  "${COMPOSE[@]}" logs --tail 40 api >&2 || true
  echo "==> Rolling code back to $PREV_COMMIT" >&2
  git checkout --detach "$PREV_COMMIT"
  "${COMPOSE[@]}" up -d --build
  echo >&2
  echo "Code is rolled back. NOTE: migrations are forward-only — if the failed" >&2
  echo "deploy applied one, the schema is still on the NEW version. Check" >&2
  echo "docs/runbooks/ROLLBACK_RUNBOOK.md before assuming this is fully undone." >&2
  exit 1
fi

echo "==> Healthy. $TARGET is now running $REF ($NEW_COMMIT)."
[[ "$TARGET" == "production" ]] && echo "==> Rollback: ./deploy/deploy.sh <previous-tag>"
exit 0
