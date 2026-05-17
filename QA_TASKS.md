# QA Task List — EPROM Competency Management System

Work through these one at a time, top to bottom. Check the box when done.

> **Deployment target:** Static Vite build (`dist/`) served by a local company web server (nginx / IIS / Apache).
> Firebase Auth and Firestore remain cloud-hosted; employees need outbound HTTPS to Firebase endpoints.
> Several tasks below are prerequisites before first production deployment — these are marked ⚠️ DEPLOY BLOCKER.

---

## 🔴 CRITICAL

- [ ] **#36** ⚠️ DEPLOY BLOCKER — Add the local server's domain/IP (e.g. `http://intranet.eprom.local`) to **Firebase Console → Authentication → Authorized domains**; without this, Firebase Auth will refuse all logins in production with a "domain not authorized" error

- [ ] **#37** ⚠️ DEPLOY BLOCKER — Configure HTTPS (TLS) on the local web server before go-live; Firebase Auth requires a secure context (`https://`) in production — obtain a certificate from the company CA or use a self-signed cert trusted by company devices; document this in the deployment runbook

- [ ] **#38** ⚠️ DEPLOY BLOCKER — Fix `vite.config.ts` `base` path — currently `'./'` (a GitHub Pages workaround); change to `'/'` for root deployment or `'/cms/'` if the app lives at a sub-path on the local server; wrong value breaks all asset and route resolution

- [x] **#1** Move Firebase credentials out of source code — `firebase-applet-config.json` is committed to Git; migrate all keys to `.env.local` (dev) and `.env.production` (build) using `import.meta.env.VITE_FIREBASE_*` and add the JSON file to `.gitignore`; on a local server anyone with access to the Git repo or deployment folder can read the keys

- [x] **#2** Remove hardcoded admin email from `store.ts` (lines 457, 547, 577, 621) and `firestore.rules` (line 14); drive it from `VITE_BOOTSTRAP_ADMIN_EMAIL` env var instead

- [deferred] **#31** Implement Firebase Auth Custom Claims for role/admin verification — replace email string comparisons in `firestore.rules` and frontend with token claim checks (e.g. `request.auth.token.admin == true`); set claims via a bootstrap Cloud Function or Admin SDK script

- [x] **#3** Fix Firestore evidence update rule in `firestore.rules:92-98` — remove `isManagerLevel()` fallback so only the actual manager of the evidence owner (or admin) can update it

- [x] **#4** Scope Firestore real-time listeners in `store.ts:163-302` — non-admin users currently download every user's profiles, assessments, and evidence; add `where` clauses to limit data to what the current user is permitted to see

- [x] **#5** Fix `Math.max()` crash on empty array in `store.ts:1217` — add `if (relevantEvidence.length === 0) return 0;` before the spread call to prevent `-Infinity` being returned as a skill score

---

## 🟠 HIGH

- [ ] **#39** ⚠️ DEPLOY BLOCKER — Create `.env.production` with all `VITE_FIREBASE_*` variables set to the production Firebase project values; this file must exist on the build machine before running `npm run build` or the deployed app will have undefined config; add `.env.production` to `.gitignore` and document the required keys in a `.env.example` file committed to the repo

- [ ] **#40** Add HTTP security headers to the local web server config — at minimum: `Content-Security-Policy` (whitelist `connect-src` for Firebase endpoints: `*.googleapis.com`, `*.firebaseio.com`, `*.firebaseapp.com`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin`; without these the app is vulnerable to clickjacking and data injection from the internal network

- [ ] **#41** Add a build and deployment runbook (`DEPLOY.md`) — document the exact steps: set env vars → `npm run build` → copy `dist/` to web server root → reload server; this prevents the IT team from accidentally deploying a dev build or missing env vars

- [x] **#6** ⚠️ DEPLOY BLOCKER — Gate the dev login bypass in `App.tsx:345-363` behind `import.meta.env.DEV`; add a runtime guard that throws if `CONFIG.SOURCE === 'MOCK'` in production; a mock bypass reachable on the live internal server is a complete auth bypass for all company users

- [x] **#7** Restrict CEO role to only `admin-depts` tab in `App.tsx:373-391` — current check allows CEO to access every `admin-*` route

- [x] **#8** Replace the hard-coded 1-second `setTimeout` on login in `store.ts:508` with a proper Promise that resolves once the first Firestore snapshot arrives

- [x] **#32** Fix login flow for `PENDING` users — currently the app authenticates them, detects pending status, then calls `signOut(auth)`, causing a jarring dashboard flash; route them directly to a dedicated "Waiting for Approval" screen before any dashboard renders

- [x] **#33** Wrap `JSON.parse(data.certificates)` and `JSON.parse(data.careerHistory)` calls inside Firestore snapshot listeners in `store.ts` with `try/catch` blocks — a single malformed string in the database currently crashes the entire real-time listener silently

- [x] **#9** Fix BehavioralAssessment double-submit race condition in `pages/BehavioralAssessment.tsx:182-226` — remove `setTimeout` wrapper; use `try/finally` to set `isSubmitting = false` after the `await` resolves

- [x] **#10** Fix EvidencePortal async bug in `pages/EvidencePortal.tsx:51-109` — success message is shown before `FileReader.readAsDataURL()` completes; move all post-read logic inside `reader.onloadend`

- [x] **#11** Add role guard to `components/BulkUpload.tsx` — return `<AccessDenied />` if `user.role !== Role.ADMIN`

- [x] **#12** Add `limit()` and `where` scoping to unbounded Firestore listeners across all collections in `store.ts` to prevent downloading the entire database on every login — non-privileged viewers (employees + dept/section managers) now scope `users` to their own `departmentId` (Direct Department / Section); a `MAX_LISTENER_DOCS` safety cap is layered on every listener. NOTE: true department-scoping of `assessments`/`evidences`/`nominations` needs a denormalized `departmentId` on those docs + backfill (deferred, see TODO in `store.ts` / #31); pure employees there remain self-scoped (already tighter than dept).

- [x] **#13** Add `request.resource.data.raterId != null` validation to the nominations `create` rule in `firestore.rules:119-121`

- [x] **#14** Sanitize Excel cell values in `components/BulkUpload.tsx` — strip leading `=`, `@`, `+` characters to prevent formula injection attacks

---

## 🟡 MEDIUM

- [ ] **#42** Add a `firebase.ts` connectivity error handler — show a user-friendly "Cannot reach the server, check your network connection" banner when Firestore/Auth is unreachable; company LAN outages or firewall misconfigurations will otherwise leave users on a blank/frozen screen with no explanation

- [ ] **#43** Add idle session auto-logout — use `firebase.auth().onAuthStateChanged` combined with a `setTimeout` reset on user activity; target 30–60 min idle timeout; required by most corporate security policies for internal tools

- [ ] **#44** Verify outbound firewall allows the web server and client machines to reach Firebase endpoints (`*.googleapis.com:443`, `firestore.googleapis.com:443`, `identitytoolkit.googleapis.com:443`); document required firewall rules in `DEPLOY.md` alongside task #41

- [ ] **#15** Replace empty `catch (e) {}` block in `pages/BehavioralAssessment.tsx:155-160` with proper error logging and user feedback

- [ ] **#16** Replace hardcoded `98.4%` system health value in `pages/CEOPanel.tsx:113` with a real calculated metric

- [ ] **#17** Add range validation (1–5) for `assignedScore` at the `updateEvidenceStatus` call site in `store.ts`

- [deferred] **#34** Migrate `generateDepartmentalTNA` and `generateCareerPath` to Firebase Cloud Functions — both iterate over the entire org's data on the client, blocking the main thread as headcount grows; note this requires upgrading the Firebase project to the Blaze (pay-as-you-go) plan

- [ ] **#18** Memoize `getSubordinatesRecursive()` in `store.ts:804-811` — currently O(n²) and called on every visibility check; build the map once at startup and invalidate on user updates

- [ ] **#19** Reduce redundant array scans in `getUserSkillScore()` `store.ts:1174-1186` — replace five separate `.filter()` passes with a single accumulator pass

- [ ] **#20** Restrict `activityLogs` create rule in `firestore.rules:84` — currently any authenticated user can write arbitrary audit entries

- [ ] **#21** Disable the approval button in `pages/SupervisorApproval.tsx:120-121` when score is below the required level, or require explicit confirmation — gap warning is set but does not block the action

- [ ] **#22** Standardize timestamp format across `store.ts` — pick either `new Date().toISOString()` or Firestore `serverTimestamp()` consistently; mixed formats cause fragile date comparisons

- [ ] **#23** Add `if (cert.noExpiry || !cert.expiryDate) continue;` guard in `store.ts:828` before cert expiry date parsing to prevent `NaN` diffDays on non-expiring certificates

- [ ] **#24** Return a meaningful "already at top" result for CEO-level users in `generateCareerPath()` `store.ts:1070` instead of silently returning `null`

---

## 🔵 LOW

- [ ] **#45** Add a version stamp to the built app — inject `VITE_APP_VERSION` from `package.json` and display it in the footer or admin panel; makes it easy for IT to confirm which build is running on the local server after deployments

- [ ] **#25** Add ARIA labels to the star rating component in `pages/BehavioralAssessment.tsx` for screen reader accessibility

- [ ] **#26** Add password strength validation and a confirm-password field to the sign-up form in `App.tsx`

- [ ] **#27** Add loading skeleton / spinner states to `OnlineAssessments`, `CompetencyMatrix`, and `SupervisorApproval` pages; also show a full-page "Connecting…" state on initial load to gracefully handle slow Firebase connections from the local network

- [ ] **#28** Replace `undefined` fallback in notification messages in `store.ts:425` with `'unknown employee'` when user lookup returns null

- [ ] **#29** Replace `any[]` type assertions in `pages/SupervisorApproval.tsx` with proper `Skill[]` and `JobProfile[]` types

- [ ] **#30** Standardize button border-radius across all pages — pick one (`rounded-sm` or `rounded-none`) and apply consistently

- [ ] **#35** Remove unused `@supabase/supabase-js` dependency from `package.json` — the project runs entirely on Firebase; the package adds bundle weight with no benefit
