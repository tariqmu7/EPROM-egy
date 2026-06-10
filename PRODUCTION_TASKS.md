# EPROM CMS — Production Readiness Task List

> **Legend:** &nbsp; 🔴 Critical &nbsp;&nbsp; 🟠 High &nbsp;&nbsp; 🟡 Medium

---

# ✅ PART A — Do Now (40 Tasks)
> No server required. All work runs in local dev environment.

---

## A1 — Security Hardening (6 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| A1.1 | Remove hardcoded bootstrap admin email from `firestore.rules` — ensure `npm run rules:build` always regenerates from template before any deploy | 🔴 | [x] |
| A1.2 | Fix Firestore rule: scope notification `create` to admin or the target user only — currently any authenticated user can notify anyone | 🔴 | [x] |
| A1.3 | Fix Firestore rule: scope evidence approval to direct reports only — `isManagerOf()` must be enforced with tight subordinate check | 🔴 | [x] |
| A1.4 | Add enum validation to `persistItem()` in `services/store.ts` — reject writes with invalid `assessmentType`, `role`, `orgLevel` values before hitting Firestore | 🟠 | [ ] |
| A1.5 | Add `orgLevel` allow-list validation inside Firestore rules for the `users` collection | 🟠 | [ ] |
| A1.6 | Update CI/CD (`.github/workflows/deploy.yml`) to run `npm run rules:build` before every deploy so the generated rules file is always fresh | 🔴 | [x] |

---

## A2 — Data Integrity & Transaction Safety (7 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| A2.1 | Wrap evidence submission + notification write in a Firestore `batch` or `runTransaction` in `services/store.ts` (~line 821) — eliminate orphaned evidence records | 🔴 | [x] |
| A2.2 | Wrap user deletion + subordinate reassignment in a batch write — currently separate awaits risk partial failure | 🔴 | [x] |
| A2.3 | Add a cycle-guard to `getGeneralDeptId()` department traversal — a circular parent reference currently causes an infinite loop | 🔴 | [x] |
| A2.4 | Add soft-delete (archive flag) to users, skills, and job profiles instead of hard deletes — prevents dangling references in closed cycles and historical assessments | 🟠 | [x] |
| A2.5 | Throttle `checkCertificationExpiries()` — currently fires on every roster change; debounce it or run once on login only to prevent notification storms | 🟠 | [x] |
| A2.6 | Add deduplication guard on form submissions (disable button on first click, re-enable on response) — prevents duplicate Firestore writes from double-clicks | 🟠 | [x] |
| A2.7 | Clean up Assessment Plans when a linked skill is deleted — currently the plan silently holds a dangling `skillId` | 🟡 | [x] |

---

## A3 — Scalability & Performance (7 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| A3.1 | Add pagination to all admin collection listeners in `services/store.ts` — replace the blanket `limit(10000)` with cursor-based `startAfter()` pagination | 🔴 | [x] |
| A3.2 | Refactor `getUserSkillScore()` memoization — cache by `userId+skillId` pair instead of global `storeVersion` to avoid invalidating all scores on any data change | 🔴 | [x] |
| A3.3 | Cache resolved user doc paths (`userDocPathById`) in `sessionStorage` with a TTL — eliminates N+1 Firestore reads during bulk operations | 🟠 | [x] |
| A3.4 | Add virtual scrolling (`react-window`) to user lists, assessment tables, and skill lists in AdminPanel — prevents DOM freeze with 500+ rows | 🟠 | [x] |
| A3.5 | Add `React.lazy` + `Suspense` code-splitting per page (`AdminPanel`, `CEOPanel`, `ManagerDashboard`) — reduce initial bundle size | 🟠 | [x] |
| A3.6 | Add Firestore composite indexes for the most common filtered queries (assessments by `userId+skillId`, evidences by `userId+status`) — create `firestore.indexes.json` | 🟠 | [x] |
| A3.7 | Scope manager listener to direct-reports subtree only — a manager with 50 reports should not load all 10K users | 🟠 | [x] |

---

## A4 — Testing (8 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| A4.1 | Set up Vitest + React Testing Library — add `vitest.config.ts`, install deps, configure coverage reporting | 🔴 | [x] |
| A4.2 | Write unit tests for `getUserSkillScore()` — all three scoring paths (360°, direct assessment, evidence) | 🔴 | [x] |
| A4.3 | Write unit tests for `getNextAssessmentDate()` — all frequency types including `CERTIFICATE_BASED` | 🔴 | [x] |
| A4.4 | Write unit tests for `generateCareerPath()` and all four readiness bucket outcomes | 🔴 | [x] |
| A4.5 | Write unit tests for `isUserInPlanAudience()` — all audience types (all / fresh / managers / org-levels / departments) | 🟠 | [x] |
| A4.6 | Write unit tests for `generateIndividualTrainingPlan()` gap-to-course mapping | 🟠 | [x] |
| A4.7 | Write integration tests for the full evidence flow: submit → manager approval → score update | 🟠 | [x] |
| A4.8 | Add CI/CD step to run `vitest --coverage` and fail the build if coverage drops below 70% on `services/store.ts` | 🟠 | [x] |

---

## A5 — Error Handling & Reliability (6 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| A5.1 | Add `React.ErrorBoundary` wrapper to every page component (`AdminPanel`, `EmployeeDashboard`, `CEOPanel`, `ManagerDashboard`, etc.) — prevents full-app blank screen on any unhandled throw | 🔴 | [x] |
| A5.2 | Replace 5-second auto-clear error toasts with persistent error UI that requires user acknowledgment for all write operations | 🟠 | [x] |
| A5.3 | Surface Firestore permission errors to the user — currently silently logged to `console.error` only; add a visible "Permission denied" message | 🟠 | [x] |
| A5.4 | Add retry logic (max 3 attempts, exponential backoff) to `addNotification()` and other fire-and-forget writes | 🟠 | [x] |
| A5.5 | Add loading skeleton components to CEO analytics and admin user list — currently shows empty state while data loads | 🟡 | [x] |
| A5.6 | Add `unsubscribe` timeout guard in `clearListeners()` — prevent auth-state-change stall if a listener hangs on cleanup | 🟡 | [x] |

---

## A6 — DevOps & CI/CD (6 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| A6.1 | Add `tsc --noEmit` step to CI/CD pipeline — currently type errors silently ship to production | 🔴 | [x] |
| A6.2 | Add `npm run lint` (ESLint) step to CI/CD — install and configure ESLint if not already present | 🟠 | [x] |
| A6.3 | Add `npm audit --audit-level=high` step to CI/CD — catches vulnerable or malicious packages before deploy | 🟠 | [x] |
| A6.4 | Validate all required `VITE_FIREBASE_*` env vars at build time — fail the build fast if any variable is empty or missing | 🔴 | [x] |
| A6.5 | Write a deployment runbook (ordered checklist: rules rebuild → type-check → lint → test → build → deploy → smoke test) | 🟠 | [x] |
| A6.6 | Write a rollback runbook — document how to revert to a previous Firebase Hosting release using `firebase hosting:clone` | 🟠 | [x] |

---

## Part A — Summary

| Category | Critical 🔴 | High 🟠 | Medium 🟡 | Total |
|----------|:-----------:|:-------:|:---------:|:-----:|
| A1 Security | 3 | 3 | 0 | **6** |
| A2 Data Integrity | 3 | 3 | 1 | **7** |
| A3 Scalability | 2 | 5 | 0 | **7** |
| A4 Testing | 4 | 4 | 0 | **8** |
| A5 Error Handling | 1 | 3 | 2 | **6** |
| A6 DevOps | 2 | 4 | 0 | **6** |
| **Total** | **15** | **22** | **3** | **40** |

### Recommended Execution Order

```
Week 1  →  A1 (Security) + A2 (Data Integrity) + A5.1 (Error Boundaries)
Week 2  →  A4 (Testing setup + core unit tests) + A6.1–A6.4 (CI/CD guards)
Week 3  →  A3.1–A3.4 (Pagination, memoization, virtual scroll)
Week 4  →  A3.5–A3.7 + A5.2–A5.6 (Remaining reliability tasks) + A6.5–A6.6 (Runbooks)
────────── READY TO LAUNCH at 100–500 users ──────────
```

---
---

# 🔒 PART B — Postponed (18 Tasks)
> Requires live/local server, Firebase Functions, GCP access, or a staging environment.

---

## B1 — Security (2 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| B1.1 | Add HTTP security headers (CSP, X-Frame-Options, HSTS) via Firebase Hosting `firebase.json` headers config — requires a deployed hosting environment | 🟠 | [ ] |
| B1.2 | Document and implement a credential rotation runbook for Firebase API keys — requires access to GCP IAM and production secrets management | 🟡 | [ ] |

---

## B2 — Data Integrity (1 task)

| # | Task | Priority | Status |
|---|------|----------|--------|
| B2.1 | Implement Firestore-level field validation via Firebase Functions triggers for critical collections (`assessments`, `users`) — requires Functions deployment | 🟠 | [ ] |

---

## B3 — Scalability (3 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| B3.1 | Move heavy batch computations (TNA, org-wide career path, ITP bulk generation) to Firebase Functions — offload from browser | 🔴 | [ ] |
| B3.2 | Implement server-side aggregation for CEO analytics — loading all 10K+ assessments to the browser is not viable at scale | 🔴 | [ ] |
| B3.3 | Enable Firestore offline persistence (`enableIndexedDbPersistence`) for employee-facing pages — improves resilience on slow networks | 🟡 | [ ] |

---

## B4 — Testing (2 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| B4.1 | Set up Firebase Emulator Suite for integration tests against real Firestore security rules — requires local Firebase CLI + emulator setup | 🟠 | [ ] |
| B4.2 | Load testing with k6 or Artillery — simulate 500 concurrent logins hitting Firestore listeners; requires a staging Firebase project | 🔴 | [ ] |

---

## B5 — Error Handling & Monitoring (2 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| B5.1 | Integrate Sentry (or Firebase Crashlytics) for unhandled error capture and session replay — requires a Sentry project and deployed environment | 🔴 | [ ] |
| B5.2 | Set up uptime monitoring (Better Uptime or Firebase Alerts) with on-call notification — requires a live deployment | 🟠 | [ ] |

---

## B6 — DevOps & CI/CD (4 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| B6.1 | Create a staging Firebase project and add a staging CI/CD branch (`develop` → staging, `main` → production) | 🔴 | [ ] |
| B6.2 | Add Firebase Hosting preview channels for PR-level deployments | 🟡 | [ ] |
| B6.3 | Set up Firestore automated daily backups via GCP scheduled export | 🔴 | [ ] |
| B6.4 | Configure Firebase App Check to block unauthorized API callers | 🟠 | [ ] |

---

## B7 — Observability & Audit (4 tasks)

| # | Task | Priority | Status |
|---|------|----------|--------|
| B7.1 | Implement a structured `activityLogs` Firestore collection — log every write operation (who, what, when, before/after values) for HR compliance | 🔴 | [ ] |
| B7.2 | Set up Firebase Performance Monitoring SDK — instrument slow queries and page load times | 🟠 | [ ] |
| B7.3 | Build an admin "Audit Trail" view reading from `activityLogs` — required for compliance and incident investigation | 🟠 | [ ] |
| B7.4 | Add Firestore budget alerts in GCP to catch runaway read costs from listener bugs | 🟠 | [ ] |

---

## Part B — Summary

| Category | Critical 🔴 | High 🟠 | Medium 🟡 | Total |
|----------|:-----------:|:-------:|:---------:|:-----:|
| B1 Security | 0 | 1 | 1 | **2** |
| B2 Data Integrity | 0 | 1 | 0 | **1** |
| B3 Scalability | 2 | 0 | 1 | **3** |
| B4 Testing | 1 | 1 | 0 | **2** |
| B5 Monitoring | 1 | 1 | 0 | **2** |
| B6 DevOps | 2 | 1 | 1 | **4** |
| B7 Observability | 1 | 3 | 0 | **4** |
| **Total** | **7** | **8** | **3** | **18** |

### When to execute Part B

```
After server migration / staging environment is available:
  Sprint 1  →  B6.1 (staging project) + B4.1 (emulator) + B3.1–B3.2 (Firebase Functions)
  Sprint 2  →  B4.2 (load test) + B5.1 (Sentry) + B6.3 (backups) + B6.4 (App Check)
  Sprint 3  →  B7.1–B7.3 (audit log + trail UI) + B1.1 (security headers) + B5.2 (uptime)
  Sprint 4  →  B2.1 (Functions triggers) + B3.3 (offline persistence) + B7.4 (budget alerts)
────────── READY FOR 10K+ USERS ──────────
```
