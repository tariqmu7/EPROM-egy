# Rollback Runbook — EPROM CMS

Use this runbook when a production deploy introduces a regression and must be reverted.

---

## Step 1 — Identify the previous good release

List recent Firebase Hosting releases:
```
firebase hosting:releases:list --limit 10
```

Each entry shows a release version ID (e.g. `VERSION_ID`), deploy time, and status.
Identify the last **LIVE** release before the bad deploy.

---

## Step 2 — Revert hosting to the previous release

```
firebase hosting:clone eprom-cms:live eprom-cms:live --version VERSION_ID
```

Replace `VERSION_ID` with the version from Step 1. This promotes the previous release back to live without re-building.

Alternatively, use the Firebase Console:
> Firebase Console → Hosting → Release history → select the previous release → ⋮ → **Rollback**

Confirm the previous version is live by visiting the production URL.

---

## Step 3 — Revert Firestore rules (if rules were also deployed)

If the bad deploy included a Firestore rules change, roll them back:

1. Check out the previous rules commit:
   ```
   git log --oneline firestore.rules.template
   git checkout <previous-good-commit> -- firestore.rules.template
   ```
2. Regenerate and redeploy:
   ```
   npm run rules:build
   firebase deploy --only firestore:rules
   ```

---

## Step 4 — Revert Firestore indexes (if indexes were changed)

Removing an index must be done manually in the Firebase Console:
> Firestore → Indexes → locate the new index → Delete

Adding back a removed index:
```
firebase deploy --only firestore:indexes
```

---

## Step 5 — Fix and re-deploy

After stabilising production:

1. Revert the bad commits on `main`:
   ```
   git revert <bad-commit-hash>
   git push origin main
   ```
2. Follow the full `DEPLOYMENT_RUNBOOK.md` checklist before the next deploy.

---

## Notes

- Firebase Hosting keeps the last **25 releases**. Older releases cannot be restored this way — use a `git revert` + fresh build instead.
- Firestore data is **not** affected by a hosting rollback. If a deploy wrote bad data to Firestore, that must be corrected separately via the Firebase Console or an admin script.
- Auth accounts are never affected by a hosting rollback.
