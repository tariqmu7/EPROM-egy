#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# EPROM CMS — restore a pg_dump into a stack. Run ON THE VM, from the repo root.
#
#   ./deploy/restore-db.sh backups/cms-2026-07-20-0300.sql.gz
#       → wipes STAGING's database and loads that dump into it.
#
# Two jobs, both important:
#   1. Give staging realistic data, so a deploy is rehearsed against the shapes
#      production actually holds — not an empty schema.
#   2. PROVE THE BACKUPS WORK. A dump nobody has ever restored is not a backup,
#      it is a file. Run this monthly against the newest nightly dump.
#
# Targets staging by default. Restoring into production is a disaster-recovery
# action and must be spelled out in full:
#
#   ./deploy/restore-db.sh --target production --i-understand-this-wipes-prod <dump>
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET=staging
CONFIRMED=0
DUMP=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) TARGET="$2"; shift 2 ;;
    --i-understand-this-wipes-prod) CONFIRMED=1; shift ;;
    *) DUMP="$1"; shift ;;
  esac
done

if [[ -z "$DUMP" ]]; then
  echo "Usage: ./deploy/restore-db.sh [--target staging|production] <dump.sql.gz>" >&2
  echo "Available dumps:" >&2
  ls -1t backups/*.sql.gz 2>/dev/null | head -10 | sed 's/^/  /' >&2 || echo "  (none)" >&2
  exit 1
fi

if [[ ! -f "$DUMP" ]]; then
  echo "ERROR: no such dump: $DUMP" >&2
  exit 1
fi

if [[ "$TARGET" == "production" ]]; then
  if [[ "$CONFIRMED" -ne 1 ]]; then
    echo "REFUSING: restoring into production destroys current live data." >&2
    echo "If that is genuinely what you want, re-run with" >&2
    echo "  --target production --i-understand-this-wipes-prod" >&2
    exit 1
  fi
  ENV_FILE=.env
  COMPOSE=(docker compose)
else
  ENV_FILE=.env.staging
  COMPOSE=(docker compose -p ecms-staging --env-file .env.staging
           -f docker-compose.yml -f docker-compose.staging.yml)
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found." >&2
  exit 1
fi

PGUSER_VAL="$(sed -n 's/^PGUSER=//p' "$ENV_FILE" | tail -1)"; PGUSER_VAL="${PGUSER_VAL:-cms}"
PGDB_VAL="$(sed -n 's/^PGDATABASE=//p' "$ENV_FILE" | tail -1)"; PGDB_VAL="${PGDB_VAL:-eprom_cms}"

echo "==> Target:   $TARGET ($PGDB_VAL)"
echo "==> Dump:     $DUMP ($(du -h "$DUMP" | cut -f1))"

# Postgres must be up; the api must be DOWN so nothing writes mid-restore.
echo "==> Stopping api (so nothing writes during the restore)"
"${COMPOSE[@]}" stop api >/dev/null 2>&1 || true
"${COMPOSE[@]}" up -d postgres
"${COMPOSE[@]}" exec -T postgres sh -c \
  "until pg_isready -U $PGUSER_VAL -d postgres >/dev/null 2>&1; do sleep 1; done"

echo "==> Dropping and recreating $PGDB_VAL"
"${COMPOSE[@]}" exec -T postgres \
  psql -U "$PGUSER_VAL" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$PGDB_VAL\" WITH (FORCE);" \
  -c "CREATE DATABASE \"$PGDB_VAL\" OWNER \"$PGUSER_VAL\";"

echo "==> Loading dump"
gunzip -c "$DUMP" | "${COMPOSE[@]}" exec -T postgres \
  psql -U "$PGUSER_VAL" -d "$PGDB_VAL" -v ON_ERROR_STOP=1 --quiet

echo "==> Restarting api"
"${COMPOSE[@]}" up -d

# ── verify the restore actually produced usable data ─────────────────────────
# A restore that "succeeded" into an empty database is the classic silent
# failure, so count rows rather than trusting the exit code.
echo "==> Verifying"
USERS="$("${COMPOSE[@]}" exec -T postgres \
  psql -U "$PGUSER_VAL" -d "$PGDB_VAL" -tAc "SELECT count(*) FROM users;" 2>/dev/null || echo 0)"
echo "    users rows: $USERS"
if [[ "${USERS:-0}" -lt 1 ]]; then
  echo "ERROR: restore left the users table empty — treat this backup as BAD." >&2
  exit 1
fi

echo "==> Restore OK. Now run integrity checks:"
echo "    ${COMPOSE[*]} exec -T api npm run integrity"
