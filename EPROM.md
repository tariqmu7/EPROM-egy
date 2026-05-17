# EPROM CMS — Project Documentation

> **EPROM Competency Management System** — Enterprise-grade competency tracking, 360° assessments, skill gap analysis, and career progression planning for the energy sector.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [User Roles & Access Control](#user-roles--access-control)
5. [Organizational Hierarchy](#organizational-hierarchy)
6. [Navigation & Routing](#navigation--routing)
7. [Database Schema (Firestore Collections)](#database-schema-firestore-collections)
8. [Collection Relationship Map](#collection-relationship-map)
9. [Core Calculation Logic](#core-calculation-logic)
10. [Key Workflows](#key-workflows)
11. [Service Layer (store.ts)](#service-layer-storets)
12. [Firestore Security Rules Summary](#firestore-security-rules-summary)
13. [Serialization Notes](#serialization-notes)
14. [Known Patterns & Conventions](#known-patterns--conventions)

---

## Project Overview

EPROM CMS is a **React + TypeScript + Firebase** single-page application that manages employee competency development across a multi-project energy sector organization. It covers:

- **Skill Gap Analysis** — compares employee scores against job profile requirements per org level.
- **360° Behavioral Assessments** — weighted self/peer/manager scoring for OJT-type skills.
- **Technical Assessments** — online exams, managerial interviews, practical demos, work record reviews.
- **Evidence Submissions** — employees upload proof; managers review and assign scores.
- **Individual Training Plans (ITP)** — auto-generated from skill gaps, linked to training courses.
- **Career Progression Plans** — roadmap from current level up to GM, with readiness statuses.
- **Assessment Management (Assessment Plans)** — admin defines how/when each skill is assessed: method, recurrence frequency, and target audience; the single source of truth for assessment scheduling.
- **Bulk User Upload** — Excel/CSV import for mass employee onboarding.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Email/Password) |
| Icons | Lucide React |
| Charts | Recharts |
| Excel | xlsx (SheetJS) |
| UI Extras | clsx, tailwind-merge |

**Config switch:** `services/store.ts` → `CONFIG.SOURCE = 'FIREBASE'` (was `'MOCK'` during dev).

---

## Project Structure

```
EPROM-egy/
├── App.tsx                   # Root: Auth gate + tab-based router
├── index.tsx                 # React DOM entry point
├── index.css                 # Global base styles
├── types.ts                  # ALL TypeScript interfaces & enums
├── constants.ts              # Proficiency level descriptions (1–5)
├── firebase.ts               # Firebase app + Firestore + Auth init
├── firestore.rules           # Firestore security rules
├── firebase.json             # Firebase Hosting config
├── .firebaserc               # Firebase project alias
│
├── components/
│   ├── Layout.tsx            # Top navbar, role-based nav, logout
│   ├── Logo.tsx              # SVG logo component
│   ├── NotificationBell.tsx  # Real-time notification dropdown
│   ├── SearchableSelect.tsx  # Reusable dropdown with search
│   ├── BulkUpload.tsx        # Excel/CSV bulk employee import
│   └── AssessmentHistoryLog.tsx  # Merged assessment + evidence ledger
│
├── pages/
│   ├── AdminPanel.tsx        # Master admin panel (view prop switches sub-views)
│   ├── AssessmentManagement.tsx  # Assessment Plans: method/frequency/audience → skills
│   ├── AdminAnalytics.tsx    # Org-wide analytics dashboard
│   ├── EmployeeDashboard.tsx # Employee profile + skill matrix + career path
│   ├── ManagerDashboard.tsx  # Manager's team overview + subordinate scores
│   ├── CEOPanel.tsx          # Org-wide view, search all employees
│   ├── BehavioralAssessment.tsx  # 360° peer/self/manager evaluations
│   ├── ManagerialInterviews.tsx  # Interview + practical demo assessments
│   ├── OnlineAssessments.tsx     # Written exam (links to external form)
│   ├── EvidencePortal.tsx        # Evidence upload + review workflow
│   ├── CompetencyMatrix.tsx      # Dept-level competency matrix view
│   └── SupervisorApproval.tsx    # Supervisor sign-off on training plans
│
└── services/
    └── store.ts              # Singleton DataService class (ALL business logic)
```

---

## User Roles & Access Control

```
Role enum: ADMIN | EMPLOYEE | CEO
UserStatus: ACTIVE | PENDING | REJECTED
```

| Role | Default Tab | Access |
|---|---|---|
| `ADMIN` | `admin-dashboard` | All admin views + full CRUD |
| `CEO` | `ceo-dashboard` | Org overview + `admin-depts` (Org Structure) + own profile |
| `EMPLOYEE` (Manager) | `manager-dashboard` | Own profile + My Team + all employee tabs |
| `EMPLOYEE` | `emp-dashboard` | Own profile, assessments, evidence portal |

**Manager detection** (`dataService.isManager(user)`):
- Role is ADMIN or CEO → always manager
- Has any direct subordinate (`managerId === user.id`)
- OrgLevel is in `['CEO', 'GM', 'AGM', 'DM', 'SH']`

**Account approval gate:** New sign-ups land in `PENDING` status. Login is blocked until an Admin sets them to `ACTIVE`. The bootstrap admin (email set via the `VITE_BOOTSTRAP_ADMIN_EMAIL` env var) is auto-approved.

---

## Organizational Hierarchy

8-tier strict top-to-bottom order:

```
CEO (0) → GM (1) → AGM (2) → DM (3) → SH (4) → SP (5) → JP (6) → FR (7)
```

| Code | Label |
|---|---|
| `CEO` | Chief Executive Officer |
| `GM` | General Manager |
| `AGM` | Assistant General Manager |
| `DM` | Department Manager |
| `SH` | Section Head |
| `SP` | Senior Position |
| `JP` | Junior Position |
| `FR` | Fresh |

Tier number used for hierarchy comparison via `ORG_LEVEL_NUMBERS`. `ORG_HIERARCHY_ORDER` array drives career progression loops.

---

## Navigation & Routing

`App.tsx` uses a simple **tab string state** (`activeTab`), not React Router. The `Layout` navbar calls `onSwitchTab(tabId)` and `renderContent()` switches on the string.

| Tab ID | Component Rendered |
|---|---|
| `emp-dashboard` | `EmployeeDashboard` |
| `manager-dashboard` | `ManagerDashboard` |
| `ceo-dashboard` | `CEOPanel` |
| `ceo-view-profile` | `EmployeeDashboard` (for target user) |
| `online-assessments` | `OnlineAssessments` |
| `interviews` | `ManagerialInterviews` |
| `emp-assessment` | `BehavioralAssessment` |
| `evidence-portal` | `EvidencePortal` |
| `admin-dashboard` | `AdminPanel view="OVERVIEW"` |
| `admin-analytics` | `AdminPanel view="ANALYTICS"` |
| `admin-assessments` | `AdminPanel view="PLANS"` |
| `admin-users` | `AdminPanel view="USERS"` |
| `admin-jobs` | `AdminPanel view="JOBS"` |
| `admin-skills` | `AdminPanel view="SKILLS"` |
| `admin-depts` | `AdminPanel view="DEPTS"` |

`AdminPanel` is one large file (~157KB) that internally switches between sub-views using its `view` prop.

---

## Database Schema (Firestore Collections)

### `users/{uid}`
```ts
{
  id: string;              // Firebase Auth UID
  name: string;
  email: string;
  phone?: string;
  whatsapp?: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'CEO';
  status: 'ACTIVE' | 'PENDING' | 'REJECTED';
  departmentId: string;
  generalDepartmentId?: string;
  orgLevel?: OrgLevel;     // 'CEO'|'GM'|'AGM'|'DM'|'SH'|'SP'|'JP'|'FR'
  jobProfileId?: string;
  managerId?: string;
  avatarUrl?: string;
  certificates?: string;   // ⚠️ JSON.stringify(Certificate[])
  location?: string;
  projectName?: string;
  projectId?: string;
  employeeId?: number;
}
```

### `skills/{skillId}`
```ts
{
  id: string;
  name: string;
  category: string;
  assessmentQuestion?: string;
  levels: string;          // ⚠️ JSON.stringify(Record<number, SkillLevel>)
  status?: 'APPROVED' | 'PENDING';
  assessmentMethod: 'OJT_OBSERVATION'|'WRITTEN_EXAM'|'PRACTICAL_DEMO'|'INTERVIEW'|'WORK_RECORD_REVIEW';
  assessmentLink?: string; // External form URL for WRITTEN_EXAM
  description?: string;
  code?: string;           // Auto-generated e.g. "ENG-WEL-01"
  requiresCertificate?: boolean;
}
```

### `jobProfiles/{profileId}`
```ts
{
  id: string;
  title: string;
  description: string;
  departmentId: string;
  requirements: string;    // ⚠️ JSON.stringify(Partial<Record<OrgLevel, JobProfileSkill[]>>)
  code?: string;           // Auto-generated e.g. "PRO-DM"
}
// JobProfileSkill: { skillId: string, requiredLevel: number (1-5) }
```

### `departments/{deptId}`
```ts
{
  id: string;
  name: string;
  projectId?: string;      // Links to projects collection
  type?: 'GENERAL' | 'DEPARTMENT' | 'SECTION';
  parentId?: string;       // For nested hierarchy
  managerId?: string;
  behavioralSkillIds?: string[];
}
```

### `projects/{projectId}`
```ts
{
  id: string;
  name: string;
  description?: string;
  location?: string;
}
```

### `assessments/{assessmentId}`
```ts
{
  id: string;
  raterId: string;         // Who submitted
  subjectId: string;       // Who is being assessed
  skillId: string;
  score: number;           // 1–5
  comment: string;
  date: string;            // ISO string
  method: AssessmentMethod;
  type: 'SELF'|'PEER'|'MANAGER'|'WRITTEN_EXAM'|'PRACTICAL_DEMO'|'INTERVIEW'|'WORK_RECORD_REVIEW';
  cycleId?: string;
  isArchived?: boolean;
}
```

### `evidences/{evidenceId}`
```ts
{
  id: string;
  userId: string;
  skillId: string;
  fileUrl: string;
  fileName: string;
  notes: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  assignedScore?: number;  // 1–5, set by manager on approval
  reviewerComment?: string;
}
```

### `nominations/{nominationId}`
```ts
{
  id: string;
  nominatorId: string;     // Who nominated (usually manager)
  subjectId: string;       // Who is being assessed
  raterId: string;         // Who will perform the assessment
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  date: string;
}
```

### `assessmentCycles/{cycleId}`
```ts
{
  id: string;
  name: string;
  startDate: string;
  dueDate: string;
  status: 'ACTIVE' | 'CLOSED';
}
// Read-only: the Assessment Engine (cycle create/update + targeted reset)
// was removed. Retained for historical appraisal labelling only.
```

### `scheduledAssessments/{id}`
```ts
{
  id: string;
  userId: string;
  skillId: string;
  method: AssessmentMethod;
  scheduledDate: string;
  status: 'UPCOMING' | 'OVERDUE' | 'COMPLETED';
  assessorId?: string;
}
```

### `assessmentPlans/{planId}`
```ts
{
  id: string;
  name: string;
  description?: string;
  skillIds: string[];                 // one or many skills covered
  method: AssessmentMethod;
  frequency: 'ONE_TIME' | 'ANNUAL_FIXED_DATE' | 'ANYTIME_ANNUAL'
           | 'QUARTERLY' | 'MONTHLY' | 'WEEKLY' | 'CERTIFICATE_BASED';
  fixedMonth?: number;                // 1-12, when frequency = ANNUAL_FIXED_DATE
  fixedDay?: number;                  // 1-31, when frequency = ANNUAL_FIXED_DATE
  audience: 'ALL' | 'FRESH_ONLY' | 'MANAGERS_ONLY' | 'ORG_LEVELS' | 'DEPARTMENTS';
  audienceOrgLevels?: OrgLevel[];     // when audience = ORG_LEVELS
  audienceDepartmentIds?: string[];   // when audience = DEPARTMENTS
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}
// Single source of truth for assessment scheduling. getNextAssessmentDate()
// resolves the earliest due date across every ACTIVE plan that covers the
// skill and whose audience matches the user. Replaces the deprecated
// per-skill assessmentFrequency / periodicInterval fields.
```

### `trainingCourses/{courseId}`
```ts
{
  id: string;
  title: string;
  provider: string;
  linkedSkillIds: string[];
  type: 'INTERNAL' | 'EXTERNAL' | 'OJT';
  link?: string;
}
```

### `notifications/{notificationId}`
```ts
{
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';
  isRead: boolean;
  createdAt: string;
  actionLink?: string;     // Tab ID to navigate on click
}
```

### `activityLogs/{logId}`
```ts
{
  id: string;
  action: string;
  target: string;
  timestamp: string;
}
// Queried with: orderBy('timestamp', 'desc'), limit(50)
```

---

## Collection Relationship Map

```
projects
  └── departments (via projectId)
        └── users (via departmentId / generalDepartmentId)
              └── assessments (via subjectId / raterId)
              └── evidences (via userId)
              └── nominations (via subjectId / raterId)
              └── scheduledAssessments (via userId)
              └── notifications (via userId)

jobProfiles (via departmentId)
  └── users (via jobProfileId)
  └── skills (via requirements[orgLevel][].skillId)

skills
  └── assessments (via skillId)
  └── evidences (via skillId)
  └── trainingCourses (via linkedSkillIds)
  └── scheduledAssessments (via skillId)
  └── assessmentPlans (via skillIds)

assessmentPlans
  └── skills (via skillIds)
  └── users (via audience: org level / department / manager flag)

assessmentCycles  (read-only — historical)
  └── assessments (via cycleId)
```

---

## Core Calculation Logic

### Skill Score (`getUserSkillScore`)

**Branch A — Behavioral / OJT Skills** (`assessmentMethod === 'OJT_OBSERVATION'`):

Weighted average of SELF / PEER / MANAGER assessment types:

| Rater Type | Weight |
|---|---|
| SELF | 10% |
| PEER | 30% |
| MANAGER | 60% |

If a rater type has no submissions, its weight is redistributed proportionally (normalized by `totalWeight`). Returns `Math.round(weightedScore / totalWeight)`.

**Branch B — Technical Skills** (WRITTEN_EXAM, INTERVIEW, PRACTICAL_DEMO, WORK_RECORD_REVIEW):

1. Check for direct assessment records (`type` is WRITTEN_EXAM, INTERVIEW, or PRACTICAL_DEMO) → return the **latest** score by date.
2. Fallback: find highest `assignedScore` from **APPROVED** evidence submissions → clamped to `[1, 5]`.

**Archived assessments** are excluded by default (`isArchived !== true`), but `includeArchived=true` overrides this.

---

### Skill Gap

```
gap = jobProfile.requirements[user.orgLevel][skill].requiredLevel - getUserSkillScore(userId, skillId)
```
A positive gap means training is needed.

---

### Individual Training Plan Priority

| Gap | Priority | Target Date |
|---|---|---|
| ≥ 2 | HIGH | +6 months |
| 1 | MEDIUM | +3 months |

Course recommendation: first match in `trainingCourses` where `linkedSkillIds.includes(skillId)`.

---

### Departmental TNA Priority

```
HIGH   → skill affects > 50% of dept employees
MEDIUM → skill affects > 20%
LOW    → skill affects ≤ 20%
```

---

### Career Readiness Status

| Total Gap Points | Status |
|---|---|
| 0 (with requirements) | `READY_NOW` |
| ≤ 2 | `READY_1_2_YEARS` |
| ≤ 5 | `READY_3_5_YEARS` |
| > 5 | `DEVELOPMENT_NEEDED` |

Career path iterates **backwards** through `ORG_HIERARCHY_ORDER` from the employee's current level up to GM. For each tier, it first tries the employee's own `jobProfile.requirements[level]`, then falls back to any other job profile in the same **General Department** that has requirements for that level.

---

### Proficiency Scale

| Level | Label | Meaning |
|---|---|---|
| 1 | Awareness | Can recognize, describe purpose |
| 2 | Knowledge | Understands fundamentals, applies under supervision |
| 3 | Skill | Applies independently, solves problems |
| 4 | Advanced | Handles complex projects, advises others |
| 5 | Expert | Generates knowledge, recognized authority |

---

### Auto-generated Codes

**Skill code:** `{CAT[0:3]}-{NAME[0:3]}-{SEQ:02}` → e.g., `ENG-WEL-01`

**Job Profile code:** `{DEPT[0:3]}-{TitleInitials}` → e.g., `PRO-DM`

---

## Key Workflows

### 1. Sign-Up Flow
1. User submits email + password + full name.
2. Firebase Auth creates the account.
3. System checks for an existing bulk-uploaded profile with the same email → if found, migrates it to the new UID and deletes the old doc.
4. If no existing profile → creates a new `PENDING` user doc.
5. Session is immediately signed out (pending users cannot access the app).
6. Admin activates account in `AdminPanel → USERS`.

### 2. 360° Behavioral Assessment
1. Employee goes to **Evaluations** tab (`BehavioralAssessment`).
2. Self-assessment submitted (type: `SELF`).
3. Employee nominates peers via **Nominations** (manager approves).
4. Approved raters submit peer evaluations (type: `PEER`).
5. Manager submits evaluation (type: `MANAGER`).
6. Score auto-computed on the fly using weighted formula.

### 3. Technical Skill Assessment
- **Written Exam:** Employee clicks external link in `OnlineAssessments`. Admin/Manager records result manually.
- **Interview / Practical Demo:** `ManagerialInterviews` page — manager selects scheduled item and records score + comment.
- **Work Record Review:** Evidence Portal submission → manager review → `assignedScore` becomes the skill score.

### 4. Evidence Submission
1. Employee uploads file in `EvidencePortal`, links it to a skill.
2. Manager receives notification.
3. Manager reviews: APPROVE (assigns level 1–5) or REJECT.
4. Employee receives notification.
5. If approved, `assignedScore` is used as fallback skill score for technical skills.

### 5. Certification Expiry Check
Triggered on every `users` snapshot load. For each certificate with `expiryDate`:
- `EXPIRED` → diffDays ≤ 0
- `EXPIRING_SOON` → diffDays ≤ 90
- Notifications sent at **90, 60, 30 days** and on expiry.
- Manager also notified when subordinate cert expires.

### 6. Assessment Archive / Reset
Admin can bulk-archive assessments filtered by department/job profile/skill. Affected employees receive a `WARNING` notification to re-evaluate.

### 7. Assessment Management (Assessment Plans)
Admin defines **Assessment Plans** in `AssessmentManagement.tsx` (admin tab `admin-assessments` → `AdminPanel view="PLANS"`). Each plan attaches one or many skills to a `method`, a recurrence `frequency`, and a target `audience`. `getNextAssessmentDate(userId, skillId)` returns the earliest due date across every **ACTIVE** plan that covers the skill and whose audience includes the user (`isUserInPlanAudience`); a skill with no applicable plan is treated as one-time and never becomes due again. `CERTIFICATE_BASED` plans gate evidence-expiry capture via `isSkillCertificateBasedForUser`.

The previous **Assessment Engine** (annual cycle create/update + targeted reassessment reset) was removed. `assessmentCycles` reads remain only for historical appraisal labelling; the deprecated per-skill `assessmentFrequency`/`periodicInterval` fields are no longer written or read.

---

## Service Layer (store.ts)

Single exported singleton: `export const dataService = new DataService();`

**Initialization:**
```ts
await dataService.initialize(); // called once in App.tsx useEffect
```

The service uses Firestore **real-time listeners** (`onSnapshot`) for all collections. Data is stored in private in-memory arrays and exposed via synchronous getter methods for UI performance.

**Key public methods:**

| Method | Description |
|---|---|
| `initialize()` | Waits for auth state, then listeners auto-setup |
| `signUp(email, password, userData)` | Creates Firebase Auth + Firestore user doc |
| `loginWithPassword(email, password)` | Signs in + enforces PENDING/REJECTED gate |
| `getCurrentUser()` | Returns profile for current Firebase Auth user |
| `signOut()` | Firebase Auth sign out |
| `getUserSkillScore(userId, skillId)` | Core score calculation |
| `generateIndividualTrainingPlan(userId)` | Returns ITP with gap-based recommendations |
| `generateCareerPath(userId)` | Returns career progression roadmap |
| `getAssessmentHistory(viewer, targetId?)` | Merged assessments + evidences ledger |
| `getEmployeeAssessmentQueue(userId)` | Groups pending assessments by method type |
| `generateDepartmentalTNA(deptId)` | Dept-level training needs analysis |
| `isManager(user)` | True if admin/CEO or has subordinates or high OrgLevel |
| `getVisibleUsers(currentUser)` | Scoped user list (admin sees all, manager sees subtree) |
| `getSubordinates(managerId)` | Direct reports only |
| `getPeers(userId)` | Same manager or same dept/level |
| `getGeneralDeptId(deptId)` | Walks up `parentId` chain to find top-level GENERAL dept |

---

## Firestore Security Rules Summary

| Collection | Read | Write |
|---|---|---|
| `users` | Any authenticated | Owner (no role change) or Admin |
| `skills` | Any authenticated | Admin only |
| `departments` | Any authenticated | Admin only |
| `jobProfiles` | Any authenticated | Admin only |
| `projects` | Any authenticated | Admin only |
| `assessments` | Any authenticated | Creator must be `raterId`; delete = Admin only |
| `evidences` | Any authenticated | Owner creates; owner updates if PENDING; Admin full |
| `nominations` | Any authenticated | Nominator creates; Rater or Admin updates |
| `notifications` | Own `userId` only | Any auth creates; own `userId` updates/deletes |
| `assessmentCycles` | Any authenticated | Admin only |
| `scheduledAssessments` | Any authenticated | Admin only |
| `assessmentPlans` | Any authenticated | Admin only |
| `trainingCourses` | Any authenticated | Admin only |
| `activityLogs` | Any authenticated | Any auth creates; Admin updates/deletes |

**Admin check in rules:** email equals the bootstrap admin (`VITE_BOOTSTRAP_ADMIN_EMAIL`, baked into the generated `firestore.rules` by `npm run rules:build`) OR user doc has `role == 'ADMIN'`.

---

## Serialization Notes

> [!IMPORTANT]
> Three fields are stored as **JSON strings** in Firestore and must be parsed on read:

| Collection | Field | Reason |
|---|---|---|
| `users` | `certificates` | `Certificate[]` → JSON string |
| `jobProfiles` | `requirements` | `Record<OrgLevel, JobProfileSkill[]>` → JSON string |
| `skills` | `levels` | `Record<number, SkillLevel>` → JSON string |

The `persistItem` helper in `store.ts` handles serialization on write. Snapshot listeners handle deserialization on read. When writing raw Firestore updates (e.g., `updateDoc`), always `JSON.stringify` these fields.

---

## Known Patterns & Conventions

1. **Tab IDs are strings** — all navigation is `setActiveTab(string)`. Never use `window.location` or React Router.

2. **AdminPanel is monolithic** — the `view` prop controls which sub-panel is shown. New admin features go inside `AdminPanel.tsx` as conditional renders.

3. **All data mutations go through `dataService`** — never call Firestore directly from page components.

4. **`undefined` values are stripped** before `setDoc` calls (Firestore rejects undefined).

5. **Avatar upload** — images are square-cropped, resized to 200×200px, and stored as a WebP base64 data URL directly in the `users` doc (`avatarUrl` field). No Firebase Storage is used.

6. **Notification delivery** — notifications are written to Firestore synchronously after mutations (addAssessment, updateEvidenceStatus, addNomination, etc.). Dynamic notifications (pending approvals, team assessment alerts) are generated client-side in `getNotifications()` without persisting.

7. **Bulk upload** — `BulkUpload.tsx` uses SheetJS to parse Excel, maps columns to `User` fields, and calls `dataService.addUser()` for each row. Users are created with `PENDING` status.

8. **Code generation** — Skill and Job Profile codes are generated in `store.ts` (`generateSkillCode`, `generateJobProfileCode`) and stored in the doc. They are computed on the fly from snapshot data if not already stored.

9. **Proficiency definitions** live in both `constants.ts` (full descriptions) and `types.ts` (label-only `PROFICIENCY_LABELS`). Use `constants.ts` for UI display text.

10. **Department hierarchy** — `type: 'GENERAL'` is the top-level. `type: 'DEPARTMENT'` and `type: 'SECTION'` are nested via `parentId`. `getGeneralDeptId()` recursively walks up to find the root.
