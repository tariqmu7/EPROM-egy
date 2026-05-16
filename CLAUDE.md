# EPROM Competency Management System

## Project Overview

A React + Firebase SPA for employee competency management. The system allows admins to define **Job Profiles** with required skill levels, assign employees to those profiles, and evaluate each employee's proficiency across all relevant skills. Output includes skill gap reports, Individual Training Plans (ITP), and career progression roadmaps.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript, Vite, Tailwind CSS |
| Database | Firebase Firestore (primary), Supabase (secondary) |
| Auth | Firebase Authentication (email/password) |
| Charts | Recharts |
| Icons | Lucide React |
| Bulk Import | XLSX (Excel parsing) |

---

## Project Structure

```
EPROM-egy/
├── App.tsx              # Root: auth screen + role-based tab routing
├── types.ts             # All TypeScript interfaces & enums
├── constants.ts         # Proficiency level labels (1=Awareness → 5=Expert)
├── firebase.ts          # Firebase init (auth, db)
├── services/
│   └── store.ts         # DataService — all Firestore ops & business logic
├── pages/
│   ├── AdminPanel.tsx   # Multi-view admin dashboard
│   ├── EmployeeDashboard.tsx
│   ├── ManagerDashboard.tsx
│   ├── CEOPanel.tsx
│   ├── EvaluationsHub.tsx
│   ├── OnlineAssessments.tsx
│   ├── ManagerialInterviews.tsx
│   ├── BehavioralAssessment.tsx  # 360° self/peer/manager
│   ├── EvidencePortal.tsx
│   ├── CompetencyMatrix.tsx
│   └── SupervisorApproval.tsx
└── components/
    ├── Layout.tsx        # Sidebar nav + header
    ├── BulkUpload.tsx    # Excel import for users
    ├── SearchableSelect.tsx
    ├── NotificationBell.tsx
    └── AssessmentHistoryLog.tsx
```

---

## Core Data Model (Firestore Collections)

### Key Collections

| Collection | Purpose |
|---|---|
| `users` | Employee profiles: role, orgLevel, departmentId, managerId, jobProfileId |
| `skills` | Competency catalog with 5-level proficiency scale and assessment method |
| `jobProfiles` | Role definitions: maps OrgLevel → required skills & required level |
| `assessments` | Score records per user/skill/cycle (Self, Peer, Manager, Exam, Interview, etc.) |
| `evidences` | Work records submitted by employees, approved by managers |
| `assessmentCycles` | Time-bound evaluation periods (ACTIVE / CLOSED) |
| `departments` | Org units with hierarchy (General → Department → Section) |
| `notifications` | In-app alerts per user |
| `trainingCourses` | Courses linked to skills for ITP recommendations |

### Org Hierarchy (OrgLevel enum)
`CEO` → `GM` → `AGM` → `DM` → `SH` → `SP` → `JP` → `FR`

### User Roles
- `ADMIN` — full system management
- `CEO` — org-wide read + executive analytics
- `EMPLOYEE` — own assessments, ITP, evidence submission
- Managers are employees flagged by `isManager(user)` based on org position

---

## Core Business Logic (services/store.ts)

### Skill Scoring (`getUserSkillScore`)
- **360° / OJT skills**: Weighted average — Self 10% + Peer 30% + Manager 60%
- **Direct assessment skills**: Latest score from WRITTEN_EXAM, INTERVIEW, or PRACTICAL_DEMO
- **Evidence skills**: Highest `assignedScore` from APPROVED work records

### Skill Gap
`gap = requiredLevel - currentScore`

Used to drive ITP generation and career path readiness calculations.

### Career Path (`generateCareerPath`)
Compares employee's current scores vs. requirements at each higher OrgLevel up to GM. Readiness buckets: `READY_NOW`, `READY_1_2_YEARS`, `READY_3_5_YEARS`, `NOT_READY`.

### ITP (`generateIndividualTrainingPlan`)
Auto-generates training recommendations from skill gaps, linked to courses in `trainingCourses`.

### TNA (`generateDepartmentalTNA`)
Aggregates skill gaps across a whole department for L&D planning.

---

## Assessment Methods

| Method | Description |
|---|---|
| `WRITTEN_EXAM` | Online exam via external link; scores imported |
| `INTERVIEW` | Structured manager interview |
| `PRACTICAL_DEMO` | Hands-on skill demonstration |
| `OJT_OBSERVATION` / `THREE_SIXTY_EVALUATION` | 360° behavioral observation |
| `WORK_RECORD_REVIEW` | Employee submits evidence; manager grades |

---

## Key Workflows

1. **Admin** creates Skills → creates Job Profiles (attaches skills + required levels per OrgLevel) → assigns employees to job profiles
2. **Employee** takes assessments (online/360°/interview) and submits evidence → scores recorded
3. **Manager** reviews evidence, conducts interviews, rates subordinates in 360° evaluations
4. **System** calculates skill gaps → generates ITP and career path
5. **Admin** manages assessment cycles; archiving closes a cycle and resets for the next

---

## Navigation / Routing

Routing is tab-based state in `App.tsx` (no React Router). `activeTab` drives which page renders.

| Tab Key | Component | Role |
|---|---|---|
| `emp-dashboard` | EmployeeDashboard | Employee |
| `evaluations` | EvaluationsHub | Employee |
| `manager-dashboard` | ManagerDashboard | Manager |
| `admin-dashboard/users/jobs/skills/depts/cycles/analytics` | AdminPanel | Admin |
| `ceo-dashboard` | CEOPanel | CEO |

---

## Development Notes

- All data access goes through `DataService` in `services/store.ts` — do not call Firestore directly from components.
- `types.ts` is the source of truth for all interfaces; update it before adding new fields.
- `constants.ts` holds proficiency level labels — the scale is always 1–5.
- The app has no backend server; all logic runs client-side against Firestore.
- Firebase config is loaded by `firebase.ts` from `VITE_FIREBASE_*` env vars (`.env.local` / `.env.production`); see `.env.example` for the required keys.

---

## Firebase Project

**Active project:** `eprom-cms` (migrated 2026-05-15 from `gen-lang-client-0893475577`)

| Setting | Value |
|---|---|
| Project ID | `eprom-cms` |
| Firestore DB | `(default)` |
| Auth domain | `eprom-cms.firebaseapp.com` |
| Config | `VITE_FIREBASE_*` env vars (`.env.local` dev / `.env.production` build) |
| Rules file | `firestore.rules` (generated — see below) |

`firebase.ts` reads config from `import.meta.env.VITE_FIREBASE_*`; env files are gitignored. Copy `.env.example` to `.env.local` / `.env.production` and fill in values from Firebase Console. `getFirestore(app)` is used — no custom database ID needed.

`firestore.rules` is **generated** from `firestore.rules.template` by `npm run rules:build`, which bakes in `VITE_BOOTSTRAP_ADMIN_EMAIL` (Firestore rules can't read env vars at runtime). Edit the template, not the generated file; run `npm run rules:build` before `firebase deploy --only firestore:rules`. The generated `firestore.rules` is gitignored.

### Migration notes
- All Firestore collections migrated with original document IDs preserved.
- User avatars were reset to `ui-avatars.com` URLs (base64 originals were too large); users can re-upload via the app.
- Firebase Auth accounts are **not** migratable — existing users must sign up again with the same email. After sign-up, their new UID will differ from the Firestore `id` field; fix via Admin Panel or Firestore console.
- `evidences` and `activityLogs` collections were not migrated (large volume / low priority); re-populate through normal app usage.

### Auth setup
- Provider: Email/Password (enabled manually in Firebase Console).
- Bootstrap admin email is driven by the `VITE_BOOTSTRAP_ADMIN_EMAIL` env var: consumed by the frontend (`isBootstrapAdminEmail` in `services/store.ts`) and substituted into `isAdmin()` in the generated `firestore.rules`. It is a first-run / recovery fallback only — normal admin access is role-driven (`users` doc `role == 'ADMIN'`).
