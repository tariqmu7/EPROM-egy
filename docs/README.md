# EPROM CMS — Documentation

Project docs, grouped by purpose. Root-level docs that stay at the repo root:
`README.md` (overview), `CLAUDE.md` (agent/project instructions), `AGENTS.md`,
and `WORKPLAN.md` (active local-server hardening tracker).

## migration/ — self-hosted migration (off Firebase)
- [MIGRATION_ROADMAP.md](migration/MIGRATION_ROADMAP.md) — full 6-phase plan.
- [MIGRATION_STATUS.md](migration/MIGRATION_STATUS.md) — done vs. remaining snapshot.
- [PHASE3_FRONTEND_SWAP.md](migration/PHASE3_FRONTEND_SWAP.md) — frontend data-access swap notes.
- [IT_INFRA_REQUEST.md](migration/IT_INFRA_REQUEST.md) — VM / Docker / DNS / TLS spec for IT.

## runbooks/ — operational procedures
- [DEV_WORKFLOW.md](runbooks/DEV_WORKFLOW.md) — **start here**: how a change goes laptop → PR → staging → production.
- [DEPLOYMENT_RUNBOOK.md](runbooks/DEPLOYMENT_RUNBOOK.md) — Docker Compose deploy to the company VM (first-time VM setup, full detail).
- [ROLLBACK_RUNBOOK.md](runbooks/ROLLBACK_RUNBOOK.md) — revert images/code + restore Postgres from a backup.
- [PRODUCTION_HARDENING.md](runbooks/PRODUCTION_HARDENING.md) — what is hardened and what is still open: TLS (the one thing still off), the CSP and header set, the secret-strength boot check, backup verification and the monthly restore rehearsal, and the dependency-advisory decisions.
- [MONDAY_GO_LIVE_CHECKLIST.md](runbooks/MONDAY_GO_LIVE_CHECKLIST.md) — first-launch cutover checklist.
- [BD_EC_PRODUCTION_LOAD_RUNBOOK.md](runbooks/BD_EC_PRODUCTION_LOAD_RUNBOOK.md) — loading the Business Development & External Contracts department (skills, profiles, accounts, courses) via the `server/scripts/etl/bd-ec/` pipeline, plus the demo history layer and how to purge it.

## qa/ — quality & task tracking
- [QA_TASKS.md](qa/QA_TASKS.md)
- [PRODUCTION_TASKS.md](qa/PRODUCTION_TASKS.md)

## reference/ — domain & design reference
- [EPROM.md](reference/EPROM.md) — org / competency domain reference.
- [DATABASE_LINKAGE.md](reference/DATABASE_LINKAGE.md)
- [ASSESSMENT_METHODOLOGY.md](reference/ASSESSMENT_METHODOLOGY.md)
- [THEME.md](reference/THEME.md) — UI theme tokens.
- [UX_ISO_UPGRADE.md](reference/UX_ISO_UPGRADE.md)
</content>
