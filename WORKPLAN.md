# EPROM CMS — Local-Server Hardening Workplan

> **Purpose:** track the multi-part effort to (1) verify the app runs fully on the
> local self-hosted stack, (2) make every view survive a page refresh (deep-link +
> storage fallback), (3) deep-restructure the file layout, (4) QA/security pass.
> This file is the **resume point** — if work is interrupted, read the checkboxes
> below to see exactly where to pick up.

_Owner: Tariq · Started 2026-07-10 · Model: Claude (Opus)_

## How to run the stack locally (dry run)
- One-click: `run.bat` — boots backend (embedded Postgres :5433 + Express API :4000)
  and the Vite frontend (:5173), then opens the browser.
- Manual backend: `cd server && npx tsx scripts/serve-local.ts`
- Manual frontend: `npm run dev`
- Admin login (seeded, insert-if-absent): `tarekmoh123@gmail.com` / `ChangeMe2026`
- Health check: `GET http://localhost:4000/health` → `{"ok":true,...}`

## Decisions taken (2026-07-10)
- **Refresh persistence = BOTH**: deep clean-URLs for sub-views + a sessionStorage
  fallback for finer state (filters / scroll / search).
- **File org = DEEP restructure**: move app source into `src/`, regroup, rewrite
  import paths, update build config.

---

## Phase 0 — Dry run / local smoke test ✅ DONE
- [x] Backend boots (embedded Postgres + API on :4000); `/health` OK
- [x] Admin login returns a JWT; `/auth/me` resolves the admin user
- [x] Authorized `/col/users` read works; unauthorized read → 401
- [x] Frontend served on :5173 (title "Oriens Competency Manager")
- Note: DB currently holds only the seeded admin — real data needs the ETL
  (`server/scripts/etl/load-postgres.mjs`) once a Firestore export exists.

## Phase 1 — Refresh persistence + deeper routing (BOTH)  ✅ DONE & VERIFIED
Top-level pages already survived refresh (clean URLs). Closed the sub-view gap.
- [x] 1a. `hooks/usePersistentView.ts` — `useState` drop-in syncing a page's
      sub-view to a URL sub-segment (deep link) **and** sessionStorage (fallback).
      Has an `enabled` flag so embedded reuse (CEO/manager profile) doesn't rewrite the URL.
- [x] 1b. `routes.ts` — `SUB_VIEWS` registry + `buildSubViewPath` /
      `readSubViewFromPath`; `/dashboard/:sub` (overview|idp|history|certificates|career).
      `pathToRoute`/`routeToPath` are sub-segment aware.
- [x] 1c. `useUrlRouting.ts` — **key fix**: the state→URL effect now skips the push
      when the address bar already resolves to the active tab, so adopting a deep
      link no longer flattens `/dashboard/career` → `/dashboard`.
- [x] 1d. Wired: EmployeeDashboard (5 sub-tabs, `routed` prop),
      EvaluationsHub (5 sub-tabs via `onTabChange` → existing per-sub routes).
- [x] 1e. `hooks/useSessionState.ts` — finer state to sessionStorage: admin
      per-view list filter, department Personnel/Sub-units drill-down tab.
      (Dept Personnel/Sub-units is selection-scoped → storage, not a URL sub-view.)
- [x] 1f. Verified: typecheck ✓ · 109 unit tests ✓ (incl. 7 new sub-view route
      tests) · 3/3 puppeteer browser tests ✓ (deep-link dashboard sub-view,
      click→URL→reload dashboard, evaluations sub-tab).

## Phase 2 — Deep file restructure  ✅ DONE & VERIFIED
All frontend source moved into `src/`; relative imports unchanged (whole tree
moved together). `constants.ts` file + `constants/` dir coexist fine under src/.
- [x] 2a. Moved into `src/`: App.tsx, index.tsx→`src/main.tsx`, routes.ts,
      types.ts, constants.ts, index.css, vite-env.d.ts, assets/, components/,
      constants/, hooks/, i18n/, pages/, services/, utils/, __tests__/.
      (assets/ untracked + components/ had a staged-delete → plain `mv`; rest `git mv`.)
- [x] 2b. `index.html`: `/index.tsx` → `/src/main.tsx`
- [x] 2c. `tailwind.config.js` content → `["./index.html","./src/**/*.{js,ts,jsx,tsx}"]`
- [x] 2d. `vitest.config.ts` coverage include → `src/services/store.ts`
- [x] 2e. `tsconfig.json` include → `["src","vite.config.ts","vitest.config.ts"]`,
      exclude adds `dist`,`server` (server has its own tsconfig).
- [x] 2f. Verified: typecheck ✓ · `npm run build` ✓ (6.9s) · Vite restarted ·
      browser refresh test re-run ✓ (deep-link + click both survive reload).

## Phase 3 — Docs & dead-file cleanup  ✅ DONE
- [x] 3a. `docs/` with `migration/`, `qa/`, `runbooks/`, `reference/` (+ docs/README.md index).
- [x] 3b. Moved 14 loose root markdown files into docs/ (kept README.md, CLAUDE.md,
      AGENTS.md, WORKPLAN.md at root). Intra-folder cross-links stay valid.
- [x] 3c. No physical dead files remained (test.docx/scratch/coverage/firebase already
      removed from the working tree). Updated CLAUDE.md structure + routing + dev notes
      to the src/ layout & self-hosted backend; fixed the dead job_profiles link.
- [x] 3d. **Fixed broken CI**: removed the deleted-script steps (`rules:build`,
      `check-env`) + stale Firebase build env; added backend typecheck + tests to CI.

## Phase 4 — QA / security pass  ✅ DONE
- [x] 4a. Typecheck: frontend `tsc --noEmit` ✓ · `cd server && npm run typecheck` ✓
- [x] 4b. Tests: frontend 109 ✓ (incl. new route tests) · backend 9/9 authz+auth ✓
- [x] 4c. Security review of the self-hosted API (the new trust boundary):
      - **SQLi:** none. Field names regex-validated (`^[A-Za-z_][A-Za-z0-9_]*$`) before
        inlining as `data->>'field'`; table names are a fixed allowlist (`registry.ts`);
        all values parameterized; LIMIT/OFFSET `Math.floor`'d. (`query.ts`)
      - **AuthN:** bcrypt(12), JWT HS256 with a **required** secret (no prod default),
        login/signup/reset rate-limited, constant-ish login (no user enumeration),
        every request reloads the fresh user doc (role/status never stale),
        non-ACTIVE accounts locked out. (`auth/*`, `middleware/authenticate.ts`)
      - **AuthZ:** server-side port of firestore.rules; self-update **cannot change role**;
        owner/manager scoping; admin-write allowlist; notifications owner-scoped in SQL.
      - **Transport/secrets:** helmet on, CORS allowlist, 5 MB body cap; `.env`/`server/.env`
        are git-ignored and **not** committed (verified).
- [x] 4d. Low-severity notes (non-blocking, future hardening):
      - JWT stored in localStorage (XSS-exposed); roadmap suggests httpOnly cookie.
      - Any authenticated user can create a notification for any userId (spam) and can
        read most collections org-wide (mirrors the original Firestore rules by design).

## Phase 5 — Memory ⏳
- [ ] Record migration state + local-run workflow + these decisions in ~/.claude/memory.

---

## Known issues found along the way (fix during Phase 3/4)
- CI (`.github/workflows/ci.yml`) still runs Firebase-era steps: `npm run rules:build`
  and `npm run check-env`, whose scripts were deleted in the migration → CI would
  fail. Remove those steps + the Firebase env vars (app is off Firebase now).

## Resume notes (update as you go)
- 2026-07-10: Phase 0 complete & verified. Starting Phase 1.
- 2026-07-11: Phase 1 complete & verified (typecheck + 109 unit tests + 3 browser
  tests). Backend + Vite were relaunched by me (user had closed run.bat windows).
- 2026-07-11: **ALL PHASES (0–5) COMPLETE & VERIFIED.** Frontend now under `src/`;
  refresh keeps the exact sub-view; docs in `docs/`; CI fixed; API security review
  clean; memory updated. Stack left running (API :4000 + Vite :5173). Nothing
  committed to git (left for user review). Remaining real-work is the migration's
  own Phase 6 (live-data ETL + cutover) — unrelated to this hardening pass.
</content>
</invoke>
