import React, { useState, useMemo, useCallback } from 'react';
import { dataService } from '../services/store';
import { User, Evidence } from '../types';
import {
  CheckCircle, XCircle, FileText, Download, Eye, Clock, History,
  AlertTriangle, ShieldCheck, Users, ChevronRight, MessageSquare,
  Award, Layers, ExternalLink, X, Calendar, Hash, Link2
} from 'lucide-react';

const CERT_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  PENDING:  { label: 'Waiting for Approval', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  APPROVED: { label: 'Approved',             className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Declined',             className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
  PENDING:  'bg-amber-50  text-amber-700  border-amber-200',
};

// ── main component ────────────────────────────────────────────────────────────

type MainTab = 'EVIDENCE' | 'CERTIFICATES';
type SubTab  = 'PENDING' | 'HISTORY';

export const SupervisorApproval: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [mainTab, setMainTab]             = useState<MainTab>('EVIDENCE');
  const [subTab,  setSubTab]              = useState<SubTab>('PENDING');
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [selectedLevel,    setSelectedLevel]    = useState<number>(3);
  const [reviewerComment,  setReviewerComment]  = useState('');
  const [gapWarning,       setGapWarning]       = useState<string | null>(null);
  const [isProcessing,     setIsProcessing]     = useState(false);
  const [refreshKey,       setRefreshKey]       = useState(0);

  // Certificate modal state
  const [certAction,  setCertAction]  = useState<'APPROVE' | 'REJECT' | null>(null);
  const [certTarget,  setCertTarget]  = useState<{ userId: string; certId: string } | null>(null);
  const [certComment, setCertComment] = useState('');
  const [certDetail,  setCertDetail]  = useState<{ user: User; certificate: any } | null>(null);

  const users  = useMemo(() => dataService.getAllUsers(),  [refreshKey]);
  const skills = useMemo(() => dataService.getAllSkills(), [refreshKey]);
  const jobs   = useMemo(() => dataService.getAllJobs(),   [refreshKey]);

  // Users this supervisor can manage (direct + indirect subordinates via managerId)
  const managedUsers = useMemo(() => {
    if (currentUser.role === 'ADMIN' || currentUser.role === 'CEO') return users;
    return dataService.getVisibleUsers(currentUser).filter(u => u.id !== currentUser.id);
  }, [currentUser, users]);

  const managedUserIds = useMemo(() => new Set(managedUsers.map(u => u.id)), [managedUsers]);

  // ── Evidence ────────────────────────────────────────────────────────────────

  const allTeamEvidences = useMemo(() => {
    const all = dataService.getEvidences();
    if (currentUser.role === 'ADMIN' || currentUser.role === 'CEO') return all;
    return all.filter(e => managedUserIds.has(e.userId));
  }, [currentUser, managedUserIds, refreshKey]);

  const pendingEvidences = useMemo(
    () => allTeamEvidences.filter(e => e.status === 'PENDING'),
    [allTeamEvidences]
  );
  const historyEvidences = useMemo(
    () => allTeamEvidences
      .filter(e => e.status !== 'PENDING')
      .sort((a, b) => new Date(b.reviewedAt || 0).getTime() - new Date(a.reviewedAt || 0).getTime()),
    [allTeamEvidences]
  );

  // ── Certificates ─────────────────────────────────────────────────────────────

  const pendingCertificates = useMemo(() => {
    const result: { user: User; certificate: any }[] = [];
    managedUsers.forEach(u => {
      (u.certificates || []).forEach(c => {
        if ((c as any).status === 'PENDING') result.push({ user: u, certificate: c });
      });
    });
    return result;
  }, [managedUsers]);

  const reviewedCertificates = useMemo(() => {
    const result: { user: User; certificate: any }[] = [];
    managedUsers.forEach(u => {
      (u.certificates || []).forEach(c => {
        const s = (c as any).status;
        if (s === 'APPROVED' || s === 'REJECTED') result.push({ user: u, certificate: c });
      });
    });
    return result.sort((a, b) =>
      new Date(b.certificate.dateAchieved).getTime() - new Date(a.certificate.dateAchieved).getTime()
    );
  }, [managedUsers]);

  // ── Gap detection ────────────────────────────────────────────────────────────

  const getRequiredLevel = useCallback((evidence: Evidence): number => {
    const user = users.find(u => u.id === evidence.userId);
    if (!user?.jobProfileId || !user.orgLevel) return 0;
    const job = jobs.find(j => j.id === user.jobProfileId);
    const requirements = job?.requirements as any;
    return requirements?.[user.orgLevel]?.find((r: any) => r.skillId === evidence.skillId)?.requiredLevel ?? 0;
  }, [users, jobs]);

  // ── Actions — Evidence ───────────────────────────────────────────────────────

  const handleApprove = useCallback(async () => {
    if (!selectedEvidence || isProcessing) return;
    setIsProcessing(true);
    const required = getRequiredLevel(selectedEvidence);
    await dataService.updateEvidenceStatus(
      selectedEvidence.id, 'APPROVED', currentUser.id, selectedLevel, reviewerComment || undefined
    );
    if (required > 0 && selectedLevel < required) {
      setGapWarning(`Approved at Level ${selectedLevel}, but this skill requires Level ${required}. Training Plan updated automatically.`);
    } else {
      setGapWarning(null);
    }
    setSelectedEvidence(null);
    setReviewerComment('');
    setSelectedLevel(3);
    setIsProcessing(false);
    setRefreshKey(k => k + 1);
  }, [selectedEvidence, selectedLevel, reviewerComment, currentUser.id, getRequiredLevel, isProcessing]);

  const handleReject = useCallback(async () => {
    if (!selectedEvidence || isProcessing) return;
    setIsProcessing(true);
    const required = getRequiredLevel(selectedEvidence);
    await dataService.updateEvidenceStatus(
      selectedEvidence.id, 'REJECTED', currentUser.id, undefined, reviewerComment || undefined
    );
    setGapWarning(
      required > 0
        ? `Evidence rejected. Skill gap flagged (requires Level ${required}). Training Plan updated automatically.`
        : 'Evidence rejected. Training Plan has been reviewed.'
    );
    setSelectedEvidence(null);
    setReviewerComment('');
    setIsProcessing(false);
    setRefreshKey(k => k + 1);
  }, [selectedEvidence, reviewerComment, currentUser.id, getRequiredLevel, isProcessing]);

  // ── Actions — Certificates ───────────────────────────────────────────────────

  const commitCertAction = async () => {
    if (!certTarget || isProcessing) return;
    setIsProcessing(true);
    try {
      const user = users.find(u => u.id === certTarget.userId);
      if (user?.certificates) {
        const updatedCerts = user.certificates.map(c =>
          c.id === certTarget.certId
            ? { ...c, status: (certAction === 'APPROVE' ? 'APPROVED' : 'REJECTED') as 'APPROVED' | 'REJECTED' }
            : c
        );
        await dataService.updateUser({ ...user, certificates: updatedCerts });
        await dataService.addNotification({
          userId: certTarget.userId,
          title: `Certificate ${certAction === 'APPROVE' ? 'Approved' : 'Rejected'}`,
          message: `Your certificate was ${certAction === 'APPROVE' ? 'approved' : 'rejected'}.${certComment ? ` Note: ${certComment}` : ''}`,
          type: certAction === 'APPROVE' ? 'SUCCESS' : 'ERROR'
        });
      }
    } catch (err) {
      console.error('Certificate action failed:', err);
    } finally {
      setCertAction(null);
      setCertTarget(null);
      setCertComment('');
      setIsProcessing(false);
      setRefreshKey(k => k + 1);
    }
  };

  // ── Display helpers ──────────────────────────────────────────────────────────

  const getUserName = (id: string) => {
    const u = users.find(x => x.id === id);
    if (!u) return 'Unknown User';
    return u.employeeId ? `${u.name} (ID: ${u.employeeId})` : u.name;
  };
  const getUser = (id: string) => users.find(u => u.id === id);
  const getSkillName = (id: string) => {
    const s = skills.find(x => x.id === id);
    if (!s) return 'Unknown Skill';
    return s.status === 'PENDING' ? `${s.name} (Pending Admin Approval)` : s.name;
  };

  const activeEvidenceList = subTab === 'PENDING' ? pendingEvidences : historyEvidences;
  const activeCertList     = subTab === 'PENDING' ? pendingCertificates : reviewedCertificates;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="pb-4 border-b border-slate-300 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Supervisor Approval Workflow</h2>
          <p className="text-slate-600 text-sm mt-1">
            Reviewing submissions from <span className="font-semibold text-slate-800">{managedUsers.length}</span> team member{managedUsers.length !== 1 ? 's' : ''}
          </p>
        </div>
        {/* summary pills */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-none">
            <FileText size={14} /> {pendingEvidences.length} Evidence Pending
          </div>
          <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 text-violet-800 text-xs font-bold px-3 py-1.5 rounded-none">
            <Award size={14} /> {pendingCertificates.length} Cert Pending
          </div>
        </div>
      </div>

      {/* Gap warning banner */}
      {gapWarning && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-none px-4 py-3 text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
          <span>{gapWarning}</span>
          <button onClick={() => setGapWarning(null)} className="ml-auto text-amber-600 hover:text-amber-800 font-bold leading-none">✕</button>
        </div>
      )}

      {/* Certificate detail modal */}
      {certDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Award size={18} className="text-violet-500" />
                <span className="font-bold text-slate-900 text-sm">Certificate Details</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 border ${CERT_STATUS_LABEL[certDetail.certificate.status]?.className || CERT_STATUS_LABEL.PENDING.className}`}>
                  {CERT_STATUS_LABEL[certDetail.certificate.status]?.label || certDetail.certificate.status}
                </span>
              </div>
              <button onClick={() => setCertDetail(null)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Employee */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200">
                <Users size={16} className="text-slate-400 shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Submitted by</p>
                  <p className="text-sm font-bold text-slate-800">{certDetail.user.name}{certDetail.user.employeeId ? ` (ID: ${certDetail.user.employeeId})` : ''}</p>
                  <p className="text-[10px] text-slate-500">{certDetail.user.orgLevel}</p>
                </div>
              </div>

              {/* Certificate info grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Certificate Name</p>
                  <p className="text-sm font-bold text-slate-900">{certDetail.certificate.name}</p>
                </div>
                {certDetail.certificate.degree && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Degree / Specialization</p>
                    <p className="text-sm text-slate-700">{certDetail.certificate.degree}</p>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Issuing Institution</p>
                  <p className="text-sm text-slate-700">{certDetail.certificate.issuer}</p>
                </div>
                {certDetail.certificate.category && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Category</p>
                    <p className="text-sm text-slate-700 capitalize">{certDetail.certificate.category}</p>
                  </div>
                )}
                <div className="flex items-start gap-1.5">
                  <Calendar size={13} className="text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Issue Date</p>
                    <p className="text-sm text-slate-700">{new Date(certDetail.certificate.dateAchieved).toLocaleDateString()}</p>
                  </div>
                </div>
                {certDetail.certificate.expiryDate && (
                  <div className="flex items-start gap-1.5">
                    <Calendar size={13} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expiry Date</p>
                      <p className="text-sm text-slate-700">{new Date(certDetail.certificate.expiryDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
                {certDetail.certificate.credentialId && (
                  <div className="flex items-start gap-1.5">
                    <Hash size={13} className="text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Credential ID</p>
                      <p className="text-sm text-slate-700 font-mono">{certDetail.certificate.credentialId}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Verification link */}
              {certDetail.certificate.credentialUrl && (
                <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200">
                  <Link2 size={14} className="text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-0.5">Verification Link</p>
                    <a href={certDetail.certificate.credentialUrl} target="_blank" rel="noreferrer"
                      className="text-xs text-blue-700 font-semibold hover:underline flex items-center gap-1 truncate">
                      {certDetail.certificate.credentialUrl} <ExternalLink size={10} className="shrink-0" />
                    </a>
                  </div>
                </div>
              )}

              {/* Reviewer comment */}
              {certDetail.certificate.reviewerComment && (
                <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200">
                  <MessageSquare size={14} className="text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Manager Note</p>
                    <p className="text-sm text-slate-700">{certDetail.certificate.reviewerComment}</p>
                  </div>
                </div>
              )}

              {/* Attachment */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Attached Copy</p>
                {certDetail.certificate.fileUrl ? (
                  certDetail.certificate.fileUrl.startsWith('data:image') ? (
                    <div className="border border-slate-200 bg-slate-50 flex items-center justify-center p-2 min-h-[200px]">
                      <img src={certDetail.certificate.fileUrl} alt="Certificate" className="max-w-full max-h-[400px] object-contain" />
                    </div>
                  ) : (
                    <div className="border border-slate-200 bg-slate-50 p-6 flex flex-col items-center gap-3">
                      <FileText size={40} className="text-slate-300" />
                      <p className="text-sm font-medium text-slate-600">{certDetail.certificate.fileName || 'Certificate file'}</p>
                      <a href={certDetail.certificate.fileUrl} download={certDetail.certificate.fileName}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 transition-colors">
                        <Download size={13} /> Download File
                      </a>
                    </div>
                  )
                ) : (
                  <div className="border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-slate-400">
                    <FileText size={28} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">No file attached</p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer — actions for pending only */}
            {certDetail.certificate.status === 'PENDING' && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
                <button
                  onClick={() => { setCertTarget({ userId: certDetail.user.id, certId: certDetail.certificate.id }); setCertAction('REJECT'); setCertDetail(null); }}
                  className="px-4 py-2 text-xs font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 transition-colors"
                >Decline</button>
                <button
                  onClick={() => { setCertTarget({ userId: certDetail.user.id, certId: certDetail.certificate.id }); setCertAction('APPROVE'); setCertDetail(null); }}
                  className="px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                >Approve</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Certificate confirmation modal */}
      {certAction && certTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white border border-slate-300 shadow-xl w-full max-w-md mx-4 rounded-none">
            <div className={`p-4 border-b flex items-center gap-2 ${certAction === 'APPROVE' ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
              {certAction === 'APPROVE'
                ? <CheckCircle size={18} className="text-emerald-600" />
                : <XCircle size={18} className="text-rose-600" />}
              <span className="font-bold text-sm text-slate-900">
                {certAction === 'APPROVE' ? 'Approve Certificate' : 'Reject Certificate'}
              </span>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-700">
                {certAction === 'APPROVE'
                  ? 'This certificate will be marked as Approved and the employee will be notified.'
                  : 'This certificate will be marked as Declined. Please provide a reason below.'}
              </p>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Comment {certAction === 'REJECT' && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  rows={3}
                  value={certComment}
                  onChange={e => setCertComment(e.target.value)}
                  placeholder={certAction === 'APPROVE' ? 'Optional note…' : 'Reason for rejection…'}
                  className="w-full border border-slate-300 text-sm p-2 rounded-none focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => { setCertAction(null); setCertTarget(null); setCertComment(''); }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-300 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  onClick={commitCertAction}
                  disabled={isProcessing || (certAction === 'REJECT' && !certComment.trim())}
                  className={`px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${certAction === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
                >
                  {isProcessing ? 'Processing…' : certAction === 'APPROVE' ? 'Confirm Approval' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main tabs */}
      <div className="flex border-b border-slate-300 bg-white">
        {([['EVIDENCE', 'Evidence Review', FileText, pendingEvidences.length],
           ['CERTIFICATES', 'Certificate Approvals', Award, pendingCertificates.length]] as const).map(
          ([key, label, Icon, count]) => (
            <button
              key={key}
              onClick={() => { setMainTab(key as MainTab); setSubTab('PENDING'); setSelectedEvidence(null); }}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-bold border-b-2 transition-colors ${
                mainTab === key
                  ? 'border-slate-800 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={15} /> {label}
              {(count as number) > 0 && (
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 border border-amber-200">
                  {count as number}
                </span>
              )}
            </button>
          )
        )}
      </div>

      {/* ── EVIDENCE TAB ── */}
      {mainTab === 'EVIDENCE' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left list */}
          <div className="lg:col-span-1 flex flex-col bg-white border border-slate-300 overflow-hidden" style={{ height: 640 }}>
            {/* sub tabs */}
            <div className="flex border-b border-slate-300 bg-slate-50 shrink-0">
              {(['PENDING', 'HISTORY'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setSubTab(t); setSelectedEvidence(null); }}
                  className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                    subTab === t ? 'text-slate-900 border-b-2 border-slate-700 bg-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t === 'PENDING' ? <Clock size={13} /> : <History size={13} />}
                  {t === 'PENDING' ? 'Pending' : 'History'}
                  {t === 'PENDING' && pendingEvidences.length > 0 && (
                    <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1 py-0.5">{pendingEvidences.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* list */}
            <div className="overflow-y-auto divide-y divide-slate-100 flex-grow">
              {activeEvidenceList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                  {subTab === 'PENDING'
                    ? <><CheckCircle size={32} className="mb-3 text-emerald-400" /><p>All caught up!</p></>
                    : <><History size={32} className="mb-3 text-slate-300" /><p>No history yet.</p></>}
                </div>
              ) : (
                activeEvidenceList.map(ev => {
                  const req = getRequiredLevel(ev);
                  const hasGap = req > 0 && (ev.assignedScore ?? 0) < req && ev.status === 'APPROVED';
                  return (
                    <button
                      key={ev.id}
                      onClick={() => { setSelectedEvidence(ev); setSelectedLevel(ev.assignedScore || 3); setReviewerComment(''); }}
                      className={`w-full text-left p-4 hover:bg-slate-50 transition-colors border-l-4 ${
                        selectedEvidence?.id === ev.id ? 'bg-slate-50 border-slate-700' : 'border-transparent'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-slate-900 text-sm leading-tight">{getUserName(ev.userId)}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                          {new Date(subTab === 'PENDING' ? ev.submittedAt : ev.reviewedAt || ev.submittedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-slate-700 mb-2 truncate">{getSkillName(ev.skillId)}</div>
                      <div className="flex items-center gap-2">
                        {ev.status !== 'PENDING' ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 border rounded-none ${STATUS_PILL[ev.status]}`}>
                            {ev.status} {ev.assignedScore ? `· L${ev.assignedScore}` : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 flex items-center gap-1"><FileText size={11} />{ev.fileName}</span>
                        )}
                        {hasGap && <AlertTriangle size={12} className="text-amber-500 shrink-0" aria-label="Skill gap" />}
                        <ChevronRight size={12} className="text-slate-300 ml-auto shrink-0" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="lg:col-span-2">
            {selectedEvidence ? (
              <EvidencePanel
                evidence={selectedEvidence}
                currentUser={currentUser}
                users={users}
                skills={skills}
                jobs={jobs}
                selectedLevel={selectedLevel}
                setSelectedLevel={setSelectedLevel}
                reviewerComment={reviewerComment}
                setReviewerComment={setReviewerComment}
                isProcessing={isProcessing}
                onApprove={handleApprove}
                onReject={handleReject}
                getUserName={getUserName}
                getUser={getUser}
                getSkillName={getSkillName}
                getRequiredLevel={getRequiredLevel}
              />
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-300 h-full min-h-[400px] flex flex-col items-center justify-center text-slate-400 rounded-none">
                <Eye size={40} className="mb-3" />
                <p className="text-sm font-medium">Select an item from the queue to review</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CERTIFICATES TAB ── */}
      {mainTab === 'CERTIFICATES' && (
        <div>
          {/* sub tabs */}
          <div className="flex border-b border-slate-200 bg-white mb-4">
            {(['PENDING', 'HISTORY'] as const).map(t => (
              <button
                key={t}
                onClick={() => setSubTab(t)}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold border-b-2 transition-colors ${
                  subTab === t ? 'border-slate-700 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {t === 'PENDING' ? <Clock size={13} /> : <History size={13} />}
                {t === 'PENDING' ? `Pending (${pendingCertificates.length})` : `History (${reviewedCertificates.length})`}
              </button>
            ))}
          </div>

          {activeCertList.length === 0 ? (
            <div className="bg-white border border-slate-200 p-12 text-center text-slate-500">
              {subTab === 'PENDING'
                ? <><ShieldCheck size={36} className="mx-auto mb-3 text-emerald-400" /><p>No pending certificate approvals.</p></>
                : <><History size={36} className="mx-auto mb-3 text-slate-300" /><p>No certificate history yet.</p></>}
            </div>
          ) : (
            <div className="bg-white border border-slate-300 divide-y divide-slate-100 overflow-hidden">
              {activeCertList.map(({ user, certificate: cert }) => (
                <div
                  key={`${user.id}-${cert.id}`}
                  onClick={() => setCertDetail({ user, certificate: cert })}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors cursor-pointer group"
                >
                  {/* Employee info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm group-hover:text-blue-700 transition-colors">{user.name}</span>
                      {user.employeeId && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 font-bold">
                          ID: {user.employeeId}
                        </span>
                      )}
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 font-bold">
                        {user.orgLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1">
                      <Award size={13} className="text-violet-500 shrink-0" />
                      <span className="font-semibold text-slate-800 text-sm">{cert.name}</span>
                      {cert.degree && <span className="text-slate-500 text-xs">({cert.degree})</span>}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span><span className="font-bold text-[9px] text-slate-400 uppercase tracking-wider">Issuer:</span> {cert.issuer}</span>
                      <span><span className="font-bold text-[9px] text-slate-400 uppercase tracking-wider">Achieved:</span> {new Date(cert.dateAchieved).toLocaleDateString()}</span>
                      {cert.expiryDate && (
                        <span><span className="font-bold text-[9px] text-slate-400 uppercase tracking-wider">Expires:</span> {new Date(cert.expiryDate).toLocaleDateString()}</span>
                      )}
                      {cert.fileUrl && (
                        <span className="text-blue-600 font-bold text-[10px] flex items-center gap-1">
                          <Download size={10} /> Has Attachment
                        </span>
                      )}
                      {cert.credentialUrl && (
                        <span className="text-blue-600 font-bold text-[10px] flex items-center gap-1">
                          <ExternalLink size={10} /> Has Link
                        </span>
                      )}
                    </div>
                    {cert.reviewerComment && (
                      <div className="mt-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-none flex items-center gap-1">
                        <MessageSquare size={11} className="text-slate-400 shrink-0" />
                        {cert.reviewerComment}
                      </div>
                    )}
                  </div>

                  {/* Actions or status */}
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {subTab === 'PENDING' ? (
                      <>
                        <button
                          onClick={() => { setCertTarget({ userId: user.id, certId: cert.id }); setCertAction('REJECT'); }}
                          className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-white border border-rose-200 hover:bg-rose-50 transition-colors"
                        >Decline</button>
                        <button
                          onClick={() => { setCertTarget({ userId: user.id, certId: cert.id }); setCertAction('APPROVE'); }}
                          className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        >Approve</button>
                      </>
                    ) : (
                      <span className={`text-xs font-bold px-3 py-1.5 border ${CERT_STATUS_LABEL[cert.status]?.className || CERT_STATUS_LABEL.PENDING.className}`}>
                        {CERT_STATUS_LABEL[cert.status]?.label || cert.status}
                      </span>
                    )}
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Evidence detail panel ────────────────────────────────────────────────────

interface EvidencePanelProps {
  evidence: Evidence;
  currentUser: User;
  users: User[];
  skills: any[];
  jobs: any[];
  selectedLevel: number;
  setSelectedLevel: (n: number) => void;
  reviewerComment: string;
  setReviewerComment: (s: string) => void;
  isProcessing: boolean;
  onApprove: () => void;
  onReject: () => void;
  getUserName: (id: string) => string;
  getUser: (id: string) => User | undefined;
  getSkillName: (id: string) => string;
  getRequiredLevel: (e: Evidence) => number;
}

const EvidencePanel: React.FC<EvidencePanelProps> = ({
  evidence, currentUser, selectedLevel, setSelectedLevel,
  reviewerComment, setReviewerComment, isProcessing,
  onApprove, onReject, getUserName, getUser, getSkillName, getRequiredLevel
}) => {
  const requiredLevel = getRequiredLevel(evidence);
  const isPending     = evidence.status === 'PENDING';
  const emp           = getUser(evidence.userId);

  return (
    <div className="bg-white border border-slate-300 flex flex-col overflow-hidden min-h-[600px]">
      {/* header */}
      <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-slate-900 mb-0.5">Evidence Review</h3>
          <p className="text-sm text-slate-600 leading-snug">
            <span className="font-semibold text-slate-800">{getUserName(evidence.userId)}</span>
            {' — '}
            <span className="font-semibold text-slate-900">{getSkillName(evidence.skillId)}</span>
          </p>
          {emp && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 font-bold">{emp.orgLevel}</span>
              {requiredLevel > 0 && (
                <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 font-bold flex items-center gap-1">
                  <Layers size={9} /> Required: L{requiredLevel}
                </span>
              )}
              {evidence.assignedScore && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 border rounded-none ${
                  evidence.assignedScore >= requiredLevel ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  Awarded: L{evidence.assignedScore}
                </span>
              )}
            </div>
          )}
        </div>

        {/* status badge (history) */}
        {!isPending && (
          <span className={`shrink-0 text-xs font-bold px-3 py-1.5 border flex items-center gap-1.5 ${STATUS_PILL[evidence.status]}`}>
            {evidence.status === 'APPROVED' ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {evidence.status}
          </span>
        )}
      </div>

      <div className="p-5 flex-grow flex flex-col gap-4 overflow-y-auto">
        {/* Review history card (non-pending) */}
        {!isPending && (
          <div className="bg-slate-50 p-3 rounded-none border border-slate-200 flex items-start gap-3">
            <History size={15} className="mt-0.5 text-slate-400 shrink-0" />
            <div className="text-sm text-slate-700 space-y-0.5">
              <p>
                <span className="font-semibold">{evidence.status === 'APPROVED' ? 'Approved' : 'Rejected'}</span>
                {' by '}
                <span className="font-semibold">{getUserName(evidence.reviewedBy || '')}</span>
                {' on '}
                {evidence.reviewedAt ? new Date(evidence.reviewedAt).toLocaleString() : '—'}
              </p>
              {evidence.reviewerComment && (
                <p className="text-slate-600 flex items-center gap-1.5">
                  <MessageSquare size={12} className="text-slate-400 shrink-0" />
                  {evidence.reviewerComment}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Gap warning */}
        {isPending && requiredLevel > 0 && (
          <div className="bg-blue-50 border border-blue-200 text-blue-800 text-xs px-3 py-2 flex items-center gap-2">
            <AlertTriangle size={13} className="text-blue-500 shrink-0" />
            This skill requires <strong>Level {requiredLevel}</strong>. The level you award will be compared to this requirement.
          </div>
        )}

        {/* Employee notes */}
        <div className="bg-slate-50 p-3 border border-slate-200">
          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Employee Notes</h4>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{evidence.notes || '—'}</p>
        </div>

        {/* Attached file */}
        <div className="flex-grow flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attached File</h4>
            <a href={evidence.fileUrl} download={evidence.fileName}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1">
              <Download size={13} /> Download
            </a>
          </div>
          <div className="flex-grow bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center min-h-[220px]">
            {evidence.fileUrl.startsWith('data:image') ? (
              <img src={evidence.fileUrl} alt="Evidence" className="max-w-full max-h-full object-contain p-2" />
            ) : (
              <div className="text-center text-slate-500">
                <FileText size={40} className="mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-medium">{evidence.fileName}</p>
                <p className="text-xs text-slate-400 mt-1">Preview not available for this file type.</p>
              </div>
            )}
          </div>
        </div>

        {/* Approval controls */}
        {isPending && (
          <div className="border border-slate-200 bg-slate-50 p-4 space-y-4">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Review Decision</h4>

            {/* Level selector */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700 shrink-0">Award Level:</label>
              <select
                value={selectedLevel}
                onChange={e => setSelectedLevel(Number(e.target.value))}
                className="bg-white border border-slate-300 text-slate-900 text-sm p-1.5 rounded-none focus:outline-none focus:ring-1 focus:ring-slate-400"
              >
                {[1,2,3,4,5].map(l => (
                  <option key={l} value={l}>Level {l} — {['Awareness','Knowledge','Skill','Advanced','Expert'][l-1]}</option>
                ))}
              </select>
              {requiredLevel > 0 && selectedLevel < requiredLevel && (
                <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                  <AlertTriangle size={12} /> Below required L{requiredLevel}
                </span>
              )}
            </div>

            {/* Reviewer comment */}
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                Reviewer Comment <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={reviewerComment}
                onChange={e => setReviewerComment(e.target.value)}
                placeholder="Add feedback for the employee…"
                className="w-full border border-slate-300 text-sm p-2 rounded-none focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none bg-white"
              />
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={onReject}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <XCircle size={15} /> {isProcessing ? 'Processing…' : 'Reject'}
              </button>
              <button
                onClick={onApprove}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
              >
                <CheckCircle size={15} /> {isProcessing ? 'Processing…' : 'Approve'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
