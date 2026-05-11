# EPROM Competency Management System - Project Summary

## 1. Project Overview
The EPROM Competency Management System (CMS) is a comprehensive platform designed to manage, evaluate, and track employee competencies and skills within the organization. The system facilitates role-based access to various tools for skills assessment, individual development planning, and historical evaluation tracking.

## 2. Core Architecture & Stack
- **Frontend Framework**: React with TypeScript, built using Vite.
- **Styling**: Tailwind CSS for utility-first styling.
- **Icons**: `lucide-react` for consistent iconography.
- **State Management & Data**: A centralized `DataService` (`store.ts`) handles in-memory persistence mirroring the database structure, enabling cross-component reactivity and localized data simulation before syncing with a backend.
- **Routing**: Client-side state-based routing (`activeTab` state in `App.tsx` and nested components).

## 3. Database Structure & Collections
The application relies on several core data entities that represent the tables/collections in the database:
- **Users (`users`)**: Represents employees. Includes fields for `role` (ADMIN, MANAGER, EMPLOYEE, CEO), `orgLevel`, `departmentId`, and `managerId`.
- **Skills (`skills`)**: The catalog of competencies. Includes `category`, `requiredLevel`, `assessmentMethod` (e.g., `WRITTEN_EXAM`, `INTERVIEW`, `WORK_RECORD_REVIEW`, `OJT_OBSERVATION`, `PRACTICAL_DEMO`), and `requiresCertificate`.
- **Job Profiles (`jobProfiles`)**: Defines the required skills and proficiency levels for different organizational roles and hierarchy levels (`orgLevel`).
- **Assessments (`assessments`)**: Records of skill evaluations. Includes `score`, `comment`, `raterId`, `subjectId`, `skillId`, and `method`.
- **Evidences (`evidences`)**: Work records uploaded by employees to prove competency in specific skills. Can be `APPROVED` or `REJECTED` by managers/admins.
- **Assessment Cycles (`assessmentCycles`)**: Time-bound periods for annual appraisals and formal evaluations.
- **Departments (`departments`)**: Organizational structure units.
- **Projects (`projects`)**: Company projects employees might be assigned to.
- **Notifications (`notifications`)**: System alerts for users regarding pending tasks, evaluations, and approvals.
- **Activity Logs (`activityLogs`)**: Audit trails for system actions.

## 4. UI/UX Style Guide
- **Color Palette**: Predominantly uses Slate (`slate-900`, `slate-50`, etc.) for structure and text, with semantic colors (Emerald for success/completion, Amber/Red for pending/warnings, Blue for actionable buttons).
- **Typography**: Heavy use of bold, uppercase, tracking-widest text for section headers and labels to give a "premium, administrative dashboard" feel.
- **Components**: Strict use of squared corners (`rounded-none`), stark borders (`border-slate-300`), and minimalist padding (`p-6`, `p-8`) to maintain a clean, enterprise aesthetic.
- **Interactions**: Subtle `transition-all` on hovers and `animate-in fade-in` for tab switching. Scrollbars are stabilized using `scrollbar-gutter: stable`.

## 5. Workflows & Calculation Logic

### 5.1. Skill Scoring & Gap Analysis
The system calculates a user's current skill score based on their assessment history:
- **Written Exams / Interviews**: The highest or most recent assessment score is taken directly.
- **Evidence / Work Records**: The highest `assignedScore` from an `APPROVED` evidence submission.
- **360-Degree Evaluations (Behavioral)**: Uses a weighted average model:
  - Self-Evaluation: 10% weight
  - Peer-Evaluation: 30% weight
  - Manager-Evaluation: 60% weight

**Skill Gaps** are calculated by subtracting the Current Score from the Required Score (defined in the `JobProfile` for the user's `orgLevel`). If the gap is > 0, it appears in their Individual Development Plan (IDP).

### 5.2. Evaluation Hub Routing
The centralized `EvaluationsHub` routes users to specific assessment methods based on the `assessmentMethod` defined in the skill:
- **Online (Written Exams)**: Maps to `WRITTEN_EXAM`. These are generally external links (e.g., Google Forms) where scores are imported later.
- **Interviews**: Maps to `INTERVIEW` or `PRACTICAL_DEMO`. Managers use the Interview Portal to rate their subordinates.
- **360-Degree Evaluation**: Maps to `OJT_OBSERVATION`. Allows Self, Peer, and Manager behavioral reviews. Also includes the Annual Appraisal checklist.
- **Evidence Portal**: Maps to `WORK_RECORD_REVIEW` or `requiresCertificate: true`. Employees upload documents (PDFs) which managers/admins review and score.

### 5.3. Career Progression & Succession
The `DataService` can generate a Career Path by comparing a user's current skill scores against the requirements for the *next* organizational level within their General Department. It calculates "readiness" based on total gap points (e.g., 0 gaps = 'READY_NOW', 1-2 gaps = 'READY_1_2_YEARS').

### 5.4. Certifications
Employees can upload external certificates. These are tracked separately but can fulfill `requiresCertificate` skill requirements once verified.

## 6. Recent Major Refactors
- **Centralized Evaluations Hub**: Moved away from a fragmented "Assessment Routing Center" on the dashboard to a dedicated `EvaluationsHub` containing sub-tabs for each assessment method. This unified the workflow and removed redundant navigation.
- **Layout Stabilization**: Implemented `scrollbar-gutter: stable` and fixed heights to prevent layout shifts when switching between tabs with varying content lengths.
- **Evidence Filtering**: The Evidence Portal now strictly filters required competencies to only show those that specifically demand a Work Record or Certificate, reducing user confusion.
