# Deployment Runbook — EPROM CMS

Ordered checklist for every production deploy. Run each step in sequence; do not skip any.

---

## Pre-deploy checks

1. **Ensure your working tree is clean**
   ```
   git status
   ```
   Stash or commit any unfinished work before continuing.

2. **Pull the latest main**
   ```
   git checkout main && git pull origin main
   ```

3. **Install dependencies**
   ```
   npm ci
   ```

---

## Build pipeline

4. **Regenerate Firestore rules from template**
   ```
   npm run rules:build
   ```
   Verify `firestore.rules` was updated (check the timestamp). Never deploy a stale generated file.

5. **Type-check**
   ```
   npx tsc --noEmit
   ```
   Fix all errors before continuing.

6. **Lint**
   ```
   npm run lint
   ```
   Fix all errors and warnings flagged as errors.

7. **Audit dependencies**
   ```
   npm audit --audit-level=high
   ```
   Review and resolve any high/critical findings before proceeding.

8. **Run tests with coverage**
   ```
   npm run test:coverage
   ```
   Coverage on `services/store.ts` must stay above 70%. Fix any regressions.

9. **Production build**
   ```
   npm run build
   ```
   Confirm the build completes without errors and inspect the output in `dist/`.

---

## Deploy

10. **Log in to Firebase (if not already authenticated)**
    ```
    firebase login
    ```

11. **Select the correct project**
    ```
    firebase use eprom-cms
    ```

12. **Deploy Firestore rules**
    ```
    firebase deploy --only firestore:rules
    ```
    Confirm "Deploy complete!" before proceeding.

13. **Deploy Firestore indexes** (only if `firestore.indexes.json` changed)
    ```
    firebase deploy --only firestore:indexes
    ```

14. **Deploy hosting**
    ```
    firebase deploy --only hosting
    ```

---

## Smoke test (post-deploy)

15. Open the production URL in a private/incognito window.
16. Log in as an Admin account and verify the Admin Panel loads.
17. Log in as an Employee account and verify the Employee Dashboard loads.
18. Submit a test assessment or notification and confirm it appears in Firestore.
19. Check the browser console — no uncaught errors or permission-denied messages.

---

## On failure

- If any step above fails, **do not proceed to deploy**.
- See `ROLLBACK_RUNBOOK.md` if a bad deploy has already gone live.
