import React, { useMemo, useState } from 'react';
import { User, Skill, Evidence, ASSESSOR_ROLE_LABELS } from '../types';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import {
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  BookOpen,
  Monitor,
  Upload,
  FileText,
  XCircle,
  ShieldCheck
} from 'lucide-react';

interface OnlineAssessmentsProps {
  currentUser: User;
}

const readFileAsDataURL = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

export const OnlineAssessments: React.FC<OnlineAssessmentsProps> = ({ currentUser }) => {
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  // Per-skill upload form state
  const [activeUploadSkillId, setActiveUploadSkillId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const storeVersion = useStoreData();

  const requiredSkills = useMemo(() => {
    if (!currentUser.jobProfileId || !currentUser.orgLevel) return [];

    const jobProfile = dataService.getJobProfile(currentUser.jobProfileId);
    if (!jobProfile) return [];

    const levelRequirements = dataService.getEffectiveRequirements(jobProfile);
    return levelRequirements
      .map(req => ({ skill: dataService.getSkill(req.skillId), requiredLevel: req.requiredLevel }))
      .filter((r): r is { skill: Skill; requiredLevel: number } =>
        !!r.skill && dataService.skillHasMethod(r.skill.id, 'WRITTEN_EXAM'));
  }, [currentUser, storeVersion]);

  const myEvidences = useMemo(
    () => dataService.getEvidences({ userId: currentUser.id }),
    [currentUser.id, storeVersion]
  );

  // The latest result submission (evidence) for an exam skill.
  const getLatestSubmission = (skillId: string): Evidence | null => {
    return myEvidences
      .filter(e => e.skillId === skillId)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())[0] || null;
  };

  // The assessor configured on the WRITTEN_EXAM method block, if any.
  const getAssessorLabel = (skillId: string): string | null => {
    const exam = dataService
      .getApplicableMethodsForUserSkill(currentUser.id, skillId)
      .find(m => m.method === 'WRITTEN_EXAM' && m.assessorRole);
    return exam?.assessorRole ? ASSESSOR_ROLE_LABELS[exam.assessorRole] : null;
  };

  const resetForm = () => {
    setActiveUploadSkillId('');
    setFile(null);
    setNotes('');
    setExpiryDate('');
  };

  const handleSubmit = async (skillId: string) => {
    if (isSubmitting || !file) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const base64String = await readFileAsDataURL(file);
      const isCertBased = dataService.isSkillCertificateBasedForUser(currentUser.id, skillId);
      await dataService.addEvidence({
        userId: currentUser.id,
        skillId,
        fileUrl: base64String,
        fileName: file.name,
        notes: notes.trim() || 'Written examination result submitted for verification.',
        ...(isCertBased && expiryDate ? { expiryDate } : {})
      });
      setSuccessMessage('Result submitted. Your manager / assessor will review and confirm your score.');
      resetForm();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error('Failed to submit exam result:', err);
      setErrorMessage('Could not submit your result. Please check the file and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="pb-6 border-b border-slate-300 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Written Examinations</h2>
          <p className="text-slate-700 text-sm mt-1">Take your exam on the external platform, then upload your result screenshot or certificate for verification.</p>
        </div>
        <div className="bg-blue-50 p-2 rounded-sm border border-blue-200 flex items-center gap-2 text-sm text-blue-700 font-medium">
          <Monitor size={16} />
          <span>System Portal</span>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-sm flex items-center gap-3">
          <CheckCircle size={20} className="text-emerald-500" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-sm flex items-start justify-between gap-3" role="alert">
          <div className="flex items-center gap-3">
            <XCircle size={20} className="text-rose-500 shrink-0" />
            <p className="font-medium">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage('')} className="shrink-0 text-rose-600 hover:text-rose-900" aria-label="Dismiss error">✕</button>
        </div>
      )}

      {requiredSkills.length === 0 ? (
        <div className="bg-white border border-slate-200 p-12 text-center rounded-none shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-none bg-slate-50 text-slate-400 mb-4">
            <CheckCircle size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No Written Examinations Required</h3>
          <p className="text-slate-600 max-w-md mx-auto">
            Your current job profile and hierarchy level do not require any external written examinations at this time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {requiredSkills.map(({ skill, requiredLevel }) => {
            const submission = getLatestSubmission(skill.id);
            const currentScore = dataService.getUserSkillScore(currentUser.id, skill.id);
            const nextDate = dataService.getNextAssessmentDate(currentUser.id, skill.id);
            const isExpired = nextDate ? new Date() >= nextDate : false;
            const assessmentLink = dataService.getSkillAssessmentLink(skill.id);
            const assessorLabel = getAssessorLabel(skill.id);
            const isCertBased = dataService.isSkillCertificateBasedForUser(currentUser.id, skill.id);

            const status: 'APPROVED' | 'RENEWAL_DUE' | 'PENDING_REVIEW' | 'REJECTED' | 'NOT_STARTED' =
              submission?.status === 'APPROVED'
                ? (isExpired ? 'RENEWAL_DUE' : 'APPROVED')
                : submission?.status === 'PENDING'
                  ? 'PENDING_REVIEW'
                  : submission?.status === 'REJECTED'
                    ? 'REJECTED'
                    : 'NOT_STARTED';

            const meetsRequirement = currentScore >= requiredLevel;
            const gap = Math.max(requiredLevel - currentScore, 0);
            const isUploadOpen = activeUploadSkillId === skill.id;

            const accent =
              status === 'APPROVED' ? 'bg-emerald-500'
              : status === 'RENEWAL_DUE' ? 'bg-amber-500'
              : status === 'PENDING_REVIEW' ? 'bg-violet-500'
              : status === 'REJECTED' ? 'bg-rose-500'
              : 'bg-blue-600';

            return (
              <div key={skill.id} className="bg-white border border-slate-300 overflow-hidden flex flex-col md:flex-row shadow-sm hover:border-slate-400 transition-all">
                <div className={`w-2 shrink-0 ${accent}`}></div>

                <div className="p-6 flex-grow flex flex-col md:flex-row gap-6 items-start">
                  <div className="flex-grow min-w-0">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {skill.code && (
                        <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                          {skill.code}
                        </span>
                      )}
                      <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                        {skill.category}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                        Target: L{requiredLevel}
                      </span>
                      {status === 'APPROVED' && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight text-emerald-600 px-2 py-0.5 bg-emerald-50 border border-emerald-100 whitespace-nowrap">
                          <CheckCircle size={10} /> Verified
                        </span>
                      )}
                      {status === 'PENDING_REVIEW' && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight text-violet-700 px-2 py-0.5 bg-violet-50 border border-violet-200 whitespace-nowrap">
                          <Clock size={10} /> Awaiting Approval
                        </span>
                      )}
                      {status === 'RENEWAL_DUE' && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight text-amber-700 px-2 py-0.5 bg-amber-50 border border-amber-200 whitespace-nowrap">
                          <Clock size={10} /> Renewal Due
                        </span>
                      )}
                      {status === 'REJECTED' && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight text-rose-700 px-2 py-0.5 bg-rose-50 border border-rose-200 whitespace-nowrap">
                          <XCircle size={10} /> Result Declined
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-1">{skill.name}</h3>
                    <p className="text-slate-600 text-sm max-w-2xl">{skill.description || 'Professional written examination for ' + skill.name + ' competency.'}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 font-medium">
                      {assessmentLink && (
                        <span className="flex items-center gap-1.5">
                          <AlertCircle size={14} className="text-amber-500" />
                          Examinations take place on an external platform (e.g. Google Forms).
                        </span>
                      )}
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-slate-400" />
                        Reviewed by your {assessorLabel || 'manager'}.
                      </span>
                    </div>

                    {/* Rejection feedback */}
                    {status === 'REJECTED' && submission?.reviewerComment && (
                      <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2">
                        <span className="font-bold uppercase tracking-wider text-[10px]">Reviewer note:</span> {submission.reviewerComment}
                      </div>
                    )}
                  </div>

                  <div className="w-full md:w-72 shrink-0 flex flex-col gap-3">
                    {/* Score / gap card */}
                    {(status === 'APPROVED' || status === 'RENEWAL_DUE') && submission ? (
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-none">
                        <div className="flex justify-between items-end mb-1">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Awarded Level</span>
                          <span className="text-2xl font-black text-slate-900">{currentScore}/5</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                          <div className={`h-full ${meetsRequirement ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${(currentScore / 5) * 100}%` }}></div>
                        </div>
                        <p className={`text-[11px] mt-2 font-medium ${meetsRequirement ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {meetsRequirement
                            ? `Meets the required Level ${requiredLevel}.`
                            : `Gap of ${gap} level${gap > 1 ? 's' : ''} to reach required Level ${requiredLevel}.`}
                        </p>
                        {submission.reviewedAt && (
                          <p className="text-[10px] text-slate-500 mt-1 italic">Verified on {new Date(submission.reviewedAt).toLocaleDateString()}</p>
                        )}
                      </div>
                    ) : status === 'PENDING_REVIEW' ? (
                      <div className="bg-violet-50 border border-violet-200 p-4 rounded-none">
                        <div className="flex items-center gap-2 text-violet-800 mb-2">
                          <Clock size={16} />
                          <span className="text-xs font-bold uppercase tracking-wider">Awaiting Approval</span>
                        </div>
                        <p className="text-[11px] text-violet-700/90 leading-tight">
                          Your result is with your {assessorLabel || 'manager'} for verification. Your score is confirmed once approved.
                        </p>
                      </div>
                    ) : (
                      <div className={`${status === 'REJECTED' ? 'bg-rose-50 border-rose-200' : 'bg-blue-50 border-blue-100'} border p-4 rounded-none`}>
                        <div className={`flex items-center gap-2 mb-2 ${status === 'REJECTED' ? 'text-rose-700' : 'text-blue-700'}`}>
                          <Clock size={16} />
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {status === 'REJECTED' ? 'Resubmission Needed' : 'Status: Pending'}
                          </span>
                        </div>
                        <p className={`text-[11px] leading-tight ${status === 'REJECTED' ? 'text-rose-600/90' : 'text-blue-600/80'}`}>
                          {status === 'REJECTED'
                            ? 'Your previous result was declined. Retake the exam if needed and upload a new result.'
                            : 'Complete the written examination, then upload your result to fulfil this competency.'}
                        </p>
                      </div>
                    )}

                    {/* Begin exam */}
                    <a
                      href={assessmentLink || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider transition-all border ${
                        assessmentLink
                          ? 'bg-slate-900 text-white hover:bg-black border-black'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200'
                      }`}
                    >
                      {assessmentLink ? 'Begin Examination' : 'No Link Provided'}
                      <ExternalLink size={16} />
                    </a>

                    {/* Upload result toggle / form */}
                    {!isUploadOpen ? (
                      status !== 'PENDING_REVIEW' && (
                        <button
                          onClick={() => { resetForm(); setActiveUploadSkillId(skill.id); }}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold uppercase tracking-wider border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Upload size={15} />
                          {status === 'APPROVED' || status === 'RENEWAL_DUE' ? 'Upload New Result' : 'Upload Result'}
                        </button>
                      )
                    ) : (
                      <div className="border border-slate-300 bg-slate-50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Upload Exam Result / Certificate</span>
                          <button onClick={resetForm} className="text-slate-400 hover:text-slate-700" aria-label="Cancel upload"><XCircle size={15} /></button>
                        </div>

                        <label htmlFor={`file-${skill.id}`} className="flex flex-col items-center justify-center w-full h-24 border-2 border-slate-300 border-dashed cursor-pointer bg-white hover:bg-slate-50">
                          <FileText className="w-6 h-6 mb-1 text-slate-400" />
                          <p className="text-xs text-slate-500"><span className="font-semibold">Click to upload</span> screenshot / PDF</p>
                          <input id={`file-${skill.id}`} type="file" className="hidden" accept="image/*,.pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                        </label>
                        {file && <p className="text-xs text-slate-800 font-medium flex items-center gap-1.5"><CheckCircle size={13} className="text-emerald-500" /> {file.name}</p>}

                        {isCertBased && (
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Certificate Expiry Date</label>
                            <input
                              type="date"
                              value={expiryDate}
                              onChange={e => setExpiryDate(e.target.value)}
                              className="w-full bg-white border border-slate-300 text-slate-900 text-sm p-2 focus:outline-none focus:ring-1 focus:ring-slate-400"
                            />
                          </div>
                        )}

                        <textarea
                          rows={2}
                          value={notes}
                          onChange={e => setNotes(e.target.value)}
                          placeholder="Optional note (e.g. score received, exam date)…"
                          className="w-full bg-white border border-slate-300 text-slate-900 text-sm p-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-400"
                        />

                        <button
                          onClick={() => handleSubmit(skill.id)}
                          disabled={isSubmitting || !file}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold uppercase tracking-wider bg-slate-800 text-white hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? 'Submitting…' : 'Submit for Approval'}
                          {!isSubmitting && <Upload size={15} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Database/Integration Information */}
      <div className="bg-slate-50 border border-slate-300 p-6 rounded-none mt-12">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-sm bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">How Written Exam Verification Works</h4>
            <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
              After completing an exam on the external platform, upload the result that was sent to you (a screenshot) or your certificate.
              Your manager or the designated assessor reviews the submission in the Approval workflow and confirms the proficiency level you earned.
              Once approved, that level updates your competency record and closes the skill gap automatically.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
