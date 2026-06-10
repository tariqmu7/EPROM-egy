// ISO.6 — self-service "Download my data". A data subject can export their own
// profile, assessment history, submitted evidence and generated plans as a
// single JSON file. Fully client-side; only the requesting user's own records
// are gathered (no other employees' PII), and free-text answers are included so
// the export is a complete personal record. Avatar bytes are intentionally
// omitted to keep the file small.

import { dataService } from '../services/store';
import { ORG_LEVEL_LABELS, PROFICIENCY_LABELS, User } from '../types';

const skillName = (skillId: string): string => {
  if (skillId === 'annual-appraisal') return 'Annual Appraisal';
  return dataService.getSkill(skillId)?.name ?? skillId;
};

export function buildMyDataExport(user: User): Record<string, unknown> {
  const deptName = dataService.getAllDepartments().find(d => d.id === user.departmentId)?.name;
  const jobProfile = user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null;
  const manager = user.managerId ? dataService.getUserById(user.managerId) : null;

  // Assessments where this user is the subject (the records held about them).
  const assessments = dataService.getAssessments({ subjectId: user.id }).map(a => ({
    skill: skillName(a.skillId),
    type: a.type,
    method: a.method,
    score: a.score,
    comment: a.comment,
    appraisalAnswers: a.appraisalAnswers,
    date: a.date,
    cycleId: a.cycleId,
  }));

  const evidence = dataService.getEvidences({ userId: user.id }).map(e => ({
    skill: skillName(e.skillId),
    fileName: e.fileName,
    notes: e.notes,
    status: e.status,
    assignedScore: e.assignedScore,
    submittedAt: e.submittedAt,
    reviewedAt: e.reviewedAt,
    reviewerComment: e.reviewerComment,
    expiryDate: e.expiryDate,
  }));

  const itp = dataService.generateIndividualTrainingPlan(user.id);
  const careerPath = dataService.generateCareerPath(user.id);

  return {
    exportMeta: {
      generatedAt: new Date().toISOString(),
      system: 'EPROM Competency Management System',
      note: 'Self-service personal data export (ISO 9001 §7.2 records / data-subject access).',
      proficiencyScale: PROFICIENCY_LABELS,
    },
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      whatsapp: user.whatsapp,
      employeeId: user.employeeId,
      role: user.role,
      orgLevel: user.orgLevel ? `${user.orgLevel} — ${ORG_LEVEL_LABELS[user.orgLevel]}` : undefined,
      jobTitle: jobProfile?.title,
      department: deptName,
      manager: manager?.name,
      location: user.location,
      projectName: user.projectName,
      certificates: user.certificates,
      careerHistory: user.careerHistory,
    },
    assessments,
    evidence,
    individualTrainingPlan: itp,
    careerProgression: careerPath,
  };
}

export function exportMyData(user: User): void {
  const data = buildMyDataExport(user);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const safeName = user.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '');
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement('a');
  a.href = url;
  a.download = `eprom-my-data-${safeName || user.id}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
