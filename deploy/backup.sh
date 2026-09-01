#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# EPROM CMS — nightly database backup. Runs inside the `backup` container
# (docker-compose.yml), which mounts this file read-only and ./backups as
# /backups. Nothing schedules it externally: it loops and sleeps.
#
# WHY THIS IS A SCRIPT AND NOT A ONE-LINER IN THE COMPOSE FILE
# The previous one-liner was `pg_dump ... | gzip > file.gz || echo FAILED`.
# In a pipeline the shell reports the exit status of the LAST command, and gzip
# happily succeeds on an empty input — so a pg_dump that failed (database down,
# wrong password, out of disk) still produced a small, perfectly valid .gz that
# looked like a backup. Worse, the retention `find -delete` then ran anyway, so
# a month of silent failures would quietly delete every good dump and leave a
# directory of empty files. Every check below exists because of that.
# ─────────────────────────────────────────────────────────────────────────────
set -u

: "${PGHOST:=postgres}"
: "${PGUSER:?PGUSER is required}"
: "${PGDATABASE:?PGDATABASE is required}"
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_INTERVAL_SECONDS:=86400}"
: "${BACKUP_MIN_BYTES:=10240}"   # a real ECMS dump is far bigger than 10 KB

log() { echo "[backup] $(date -Iseconds) $*"; }

run_backup() {
  stamp="$(date +%F-%H%M)"
  tmp="${BACKUP_DIR}/.in-progress-${stamp}.sql"
  final="${BACKUP_DIR}/cms-${stamp}.sql.gz"

  log "starting dump of ${PGDATABASE}"
  if ! pg_dump -h "$PGHOST" -U "$PGUSER" "$PGDATABASE" > "$tmp"; then
    log "FAILED: pg_dump exited non-zero — keeping previous backups, deleting nothing"
    rm -f "$tmp"
    return 1
  fi

  # pg_dump writes this as its last line only when it ran to completion. A dump
  # truncated by a disconnect or a full disk will not have it, and would restore
  # into a half-populated database without complaining.
  if ! tail -c 400 "$tmp" | grep -q 'PostgreSQL database dump complete'; then
    log "FAILED: dump is truncated (no completion marker) — treating as BAD"
    rm -f "$tmp"
    return 1
  fi

  if ! gzip -c "$tmp" > "${final}.part"; then
    log "FAILED: could not compress the dump"
    rm -f "$tmp" "${final}.part"
    return 1
  fi
  rm -f "$tmp"

  size="$(wc -c < "${final}.part" | tr -d ' ')"
  if [ "$size" -lt "$BACKUP_MIN_BYTES" ]; then
    log "FAILED: compressed dump is only ${size} bytes (< ${BACKUP_MIN_BYTES}) — treating as BAD"
    rm -f "${final}.part"
    return 1
  fi

  # Rename last, so a file named cms-*.sql.gz is ALWAYS a dump that passed every
  # check above. Anything half-written carries a .part / .in-progress name and is
  # invisible to both the retention sweep and restore-db.sh.
  mv "${final}.part" "$final"
  log "OK: ${final} (${size} bytes)"
  return 0
}

prune() {
  # Only ever reached after a verified good backup, so retention can never be
  # what removes the last usable dump.
  deleted="$(find "$BACKUP_DIR" -name 'cms-*.sql.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')"
  [ "$deleted" -gt 0 ] && log "pruned ${deleted} backup(s) older than ${BACKUP_RETENTION_DAYS} days"
  # Clear up anything a killed container left behind mid-write.
  find "$BACKUP_DIR" \( -name '.in-progress-*' -o -name '*.part' \) -mmin +120 -delete 2>/dev/null || true
}

# BACKUP_ONCE=1 runs a single backup and exits with its status — that is how the
# deploy runbook takes an on-demand dump before a migration.
if [ "${BACKUP_ONCE:-0}" = "1" ]; then
  run_backup && prune
  exit $?
fi

while true; do
  if run_backup; then
    prune
  else
    log "WARNING: no good backup was produced in this cycle"
  fi
  sleep "$BACKUP_INTERVAL_SECONDS"
done
