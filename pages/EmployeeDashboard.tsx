import React, { useMemo, useState, useEffect } from 'react';
import { User, Role, JobProfile, Skill, IndividualTrainingPlan, ORG_HIERARCHY_ORDER, ORG_LEVEL_LABELS, ScheduledAssessment, Certificate, Assessment } from '../types';
import { PROFICIENCY_DEFINITIONS } from '../constants';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { AssessmentHistoryLog } from '../components/AssessmentHistoryLog';
import { 
  AlertCircle, 
  CheckCircle, 
  Award, 
  BookOpen, 
  Activity, 
  TrendingUp, 
  Users, 
  PlayCircle, 
  Calendar, 
  ArrowRight, 
  Download, 
  FileText, 
  Briefcase, 
  MapPin, 
  User as UserIcon,
  ShieldCheck, 
  GraduationCap, 
  Target, 
  Zap, 
  MessageSquare, 
  Building, 
  BadgeCheck, 
  Clock, 
  XCircle, 
  Layers, 
  Shield, 
  LayoutGrid, 
  UserCheck, 
  Building2, 
  History as HistoryIcon, 
  Monitor,
  Video,
  FileUp,
  ClipboardCheck,
  ChevronRight,
  AlertTriangle,
  Mail,
  Phone,
  MessageCircle,
  Eye,
  Plus,
  Edit2,
  Trash2,
  X,
  ExternalLink
} from 'lucide-react';
import { auth } from '../firebase';
import { exportCompetenceStatement } from '../utils/competenceStatement';

interface EmployeeDashboardProps {
  user: User;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = React.memo(({ user }) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'IDP' | 'HISTORY' | 'CERTIFICATES' | 'CAREER'>('OVERVIEW');
  const [careerSubTab, setCareerSubTab] = useState<'PROGRESSION' | 'JOURNEY' | 'INVENTORY'>('PROGRESSION');
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // Certificate Management State
  const [editingCert, setEditingCert] = useState<Partial<Certificate> | null>(null);
  const [certDeleteId, setCertDeleteId] = useState<string | null>(null);
  const [certDetailView, setCertDetailView] = useState<any | null>(null);
  const [skillDetailView, setSkillDetailView] = useState<{ skill?: Skill; required: number; current: number; gap: number } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingCert({
          ...editingCert,
          fileUrl: reader.result as string,
          fileName: file.name
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCert) return;

    const isEdit = !!editingCert.id;
    const existingCert = isEdit ? (user.certificates || []).find(c => c.id === editingCert.id) : undefined;
    const newStatus: Certificate['status'] = existingCert?.status === 'APPROVED' ? 'PENDING' : (existingCert?.status ?? 'PENDING');

    const newCert: Certificate = {
      id: editingCert.id || crypto.randomUUID(),
      name: editingCert.name || '',
      degree: editingCert.degree || '',
      issuer: editingCert.issuer || '',
      dateAchieved: editingCert.dateAchieved || new Date().toISOString().split('T')[0],
      expiryDate: editingCert.expiryDate || '',
      noExpiry: editingCert.noExpiry || false,
      renewalDate: editingCert.renewalDate || '',
      fileUrl: editingCert.fileUrl || '',
      fileName: editingCert.fileName || '',
      credentialId: editingCert.credentialId || '',
      credentialUrl: editingCert.credentialUrl || '',
      category: editingCert.category,
      status: newStatus,
    };

    const existingCerts = user.certificates || [];
    const updatedCerts = editingCert.id 
      ? existingCerts.map(c => c.id === newCert.id ? newCert : c)
      : [...existingCerts, newCert];

    await dataService.updateUser({ ...user, certificates: updatedCerts });
    setEditingCert(null);
  };

  const handleDeleteCertificate = async (certId: string) => {
    const updatedCerts = (user.certificates || []).filter(c => c.id !== certId);
    await dataService.updateUser({ ...user, certificates: updatedCerts });
    setCertDeleteId(null);
    if (editingCert?.id === certId) setEditingCert(null);
  };

  // ISO.3 — export a branded Statement of Competence instead of printing the
  // whole dashboard chrome. Reads the computed skill analysis below (initialised
  // by render time, so the closure is safe).
  const handleExportCV = () => {
    const deptName = dataService.getAllDepartments().find(d => d.id === user.departmentId)?.name;
    exportCompetenceStatement({
      employeeName: user.name,
      employeeId: user.employeeId ? String(user.employeeId) : undefined,
      jobTitle: jobProfile?.title,
      department: deptName,
      orgLevelLabel: user.orgLevel ? ORG_LEVEL_LABELS[user.orgLevel] : undefined,
      managerName: manager?.name,
      rows: skillAnalysis
        .filter(s => s.skill)
        .map(s => ({
          code: s.skill?.code,
          name: s.skill?.name ?? '',
          required: s.required,
          current: s.current,
        })),
      appraisalScore: latestAppraisal?.score,
    });
  };

  // Re-render when Firestore listeners deliver data; storeVersion is fed
  // into every store-derived useMemo below so they recompute on arrival
  // instead of caching the empty first-render result.
  const storeVersion = useStoreData();

  const jobProfile = useMemo(() => user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null, [user.jobProfileId, storeVersion]);
  const depts = useMemo(() => dataService.getAllDepartments(), [storeVersion]);
  const manager = useMemo(() => user.managerId ? dataService.getUserById(user.managerId) : null, [user.managerId, storeVersion]);

  const skillAnalysis = useMemo(() => {
    const requirements = dataService.getEffectiveRequirements(jobProfile);
    return requirements.map(req => {
      const skillDetails = dataService.getSkill(req.skillId);
      const currentScore = dataService.getUserSkillScore(user.id, req.skillId);
      return {
        skill: skillDetails,
        required: req.requiredLevel,
        current: currentScore,
        gap: Math.max(0, req.requiredLevel - currentScore)
      };
    });
  }, [jobProfile, user.id, user.orgLevel, storeVersion]);

  const gaps = useMemo(() => skillAnalysis.filter(s => s.gap > 0), [skillAnalysis]);
  const compliant = useMemo(() => skillAnalysis.filter(s => s.gap <= 0), [skillAnalysis]);

  const annualAppraisals = useMemo(() => {
    return dataService.getAssessments({ subjectId: user.id, skillId: 'annual-appraisal' });
  }, [user.id, storeVersion]);

  // One appraisal per evaluator: an annual appraisal is rated separately by the
  // employee (SELF), peers (PEER) and the manager (MANAGER). getAssessments is
  // already sorted newest-first and de-duplicated per period, so taking the
  // first record seen per rater yields each evaluator's latest appraisal with
  // no duplicate manager/peer/self rows. Ordered Manager → Peer → Self.
  const APPRAISAL_TYPE_ORDER: Record<string, number> = { MANAGER: 0, PEER: 1, SELF: 2, UPWARD: 3 };
  const appraisalEvaluations = useMemo(() => {
    const byRater = new Map<string, Assessment>();
    for (const a of annualAppraisals) {
      if (!byRater.has(a.raterId)) byRater.set(a.raterId, a);
    }
    return [...byRater.values()].sort((x, y) =>
      (APPRAISAL_TYPE_ORDER[x.type] ?? 9) - (APPRAISAL_TYPE_ORDER[y.type] ?? 9) ||
      new Date(y.date).getTime() - new Date(x.date).getTime()
    );
  }, [annualAppraisals]);

  // The official headline score is the manager's appraisal when present,
  // otherwise the most recent evaluation of any kind.
  const latestAppraisal = useMemo(
    () => appraisalEvaluations.find(a => a.type === 'MANAGER') || appraisalEvaluations[0],
    [appraisalEvaluations]
  );

  const appraisalTypeLabel = (type: string) =>
    type === 'MANAGER' ? 'Manager Appraisal'
    : type === 'PEER' ? 'Peer Appraisal'
    : type === 'SELF' ? 'Self Appraisal'
    : type === 'UPWARD' ? 'Upward Appraisal'
    : 'Appraisal';

  const annualCycle = useMemo(() => {
    if (!latestAppraisal?.cycleId) return null;
    return dataService.getAllCycles().find(c => c.id === latestAppraisal.cycleId);
  }, [latestAppraisal, storeVersion]);

  const careerSkillMap = useMemo(() => {
    const assessments = dataService.getAssessments({ subjectId: user.id });
    const evidences = dataService.getEvidences({ userId: user.id, status: 'APPROVED' });

    const skillMap: Record<string, { 
        skill: Skill, 
        bestScore: number, 
        latestScore: number,
        history: { date: string, score: number, method: string, type: string }[]
    }> = {};
    
    const allRecords = [
        ...assessments.map(a => ({ 
            skillId: a.skillId, 
            date: a.date, 
            score: a.score, 
            method: a.method, 
            type: a.type 
        })),
        ...evidences.map(e => ({ 
            skillId: e.skillId, 
            date: e.reviewedAt || e.submittedAt, 
            score: e.assignedScore || 0, 
            method: 'WORK_RECORD_REVIEW', 
            type: 'EVIDENCE' 
        }))
    ];

    allRecords.forEach(rec => {
        if (!skillMap[rec.skillId]) {
            const skillDetails = dataService.getSkill(rec.skillId);
            if (skillDetails) {
                skillMap[rec.skillId] = {
                    skill: skillDetails,
                    bestScore: 0,
                    latestScore: 0,
                    history: []
                };
            }
        }
        
        if (skillMap[rec.skillId]) {
            skillMap[rec.skillId].history.push({
                date: rec.date,
                score: rec.score,
                method: rec.method,
                type: rec.type
            });
            if (rec.score > skillMap[rec.skillId].bestScore) skillMap[rec.skillId].bestScore = rec.score;
        }
    });

    Object.values(skillMap).forEach(entry => {
        entry.history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        entry.latestScore = entry.history[0]?.score || 0;
    });

    return Object.values(skillMap).sort((a, b) => a.skill.name.localeCompare(b.skill.name));
  }, [user.id, storeVersion]);

  // Forward-looking promotion ladder: from the employee's current org level up
  // to CEO. The engine pulls each higher rung's required skills from this user's
  // job profile, falling back to other profiles in the same General Department,
  // so a Fresh hire sees the full FR → … → GM → CEO path for their department.
  const careerPath = useMemo(() => dataService.generateCareerPath(user.id), [user.id, storeVersion]);

  // Readiness bucket → label + colour treatment used by the promotion ladder.
  const READINESS: Record<string, { label: string; badge: string; bar: string; dot: string }> = {
    READY_NOW:          { label: 'Ready Now',          badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', bar: 'bg-emerald-500', dot: 'border-emerald-500 text-emerald-600' },
    READY_1_2_YEARS:    { label: 'Ready in 1–2 Years', badge: 'bg-blue-100 text-blue-700 border-blue-200',          bar: 'bg-blue-500',    dot: 'border-blue-500 text-blue-600' },
    READY_3_5_YEARS:    { label: 'Ready in 3–5 Years', badge: 'bg-amber-100 text-amber-700 border-amber-200',       bar: 'bg-amber-500',   dot: 'border-amber-500 text-amber-600' },
    DEVELOPMENT_NEEDED: { label: 'Development Needed',  badge: 'bg-slate-100 text-slate-600 border-slate-200',       bar: 'bg-slate-400',   dot: 'border-slate-300 text-slate-500' },
  };

  const CERT_STATUS: Record<string, { label: string; cls: string }> = {
    PENDING:  { label: 'Waiting for Approval', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
    APPROVED: { label: 'Approved',             cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    REJECTED: { label: 'Declined',             cls: 'bg-red-100 text-red-700 border-red-200' },
  };

  return (
    <>
    {/* Certificate Detail Modal */}
    {certDetailView && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <Award size={16} className="text-violet-500" />
              <span className="font-bold text-slate-900 text-sm">Certificate Details</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 border ${CERT_STATUS[certDetailView.status]?.cls || CERT_STATUS.PENDING.cls}`}>
                {CERT_STATUS[certDetailView.status]?.label || certDetailView.status}
              </span>
            </div>
            <button onClick={() => setCertDetailView(null)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors rounded-none">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Certificate Name</p>
                <p className="text-sm font-bold text-slate-900">{certDetailView.name}</p>
              </div>
              {certDetailView.degree && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Degree / Specialization</p>
                  <p className="text-sm text-slate-700">{certDetailView.degree}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Issuing Institution</p>
                <p className="text-sm text-slate-700">{certDetailView.issuer}</p>
              </div>
              {certDetailView.category && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Category</p>
                  <p className="text-sm text-slate-700 capitalize">{certDetailView.category}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Issue Date</p>
                <p className="text-sm text-slate-700">{new Date(certDetailView.dateAchieved).toLocaleDateString()}</p>
              </div>
              {certDetailView.expiryDate && !certDetailView.noExpiry && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Expiry Date</p>
                  <p className="text-sm text-slate-700">{new Date(certDetailView.expiryDate).toLocaleDateString()}</p>
                </div>
              )}
              {certDetailView.noExpiry && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Validity</p>
                  <p className="text-sm text-emerald-600 font-bold">No Expiry</p>
                </div>
              )}
              {certDetailView.credentialId && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Credential ID</p>
                  <p className="text-sm text-slate-700 font-mono">{certDetailView.credentialId}</p>
                </div>
              )}
            </div>

            {certDetailView.credentialUrl && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200">
                <ExternalLink size={14} className="text-blue-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-0.5">Verification Link</p>
                  <a href={certDetailView.credentialUrl} target="_blank" rel="noreferrer"
                    className="text-xs text-blue-700 font-semibold hover:underline flex items-center gap-1 truncate">
                    {certDetailView.credentialUrl} <ExternalLink size={10} className="shrink-0" />
                  </a>
                </div>
              </div>
            )}

            {certDetailView.reviewerComment && (
              <div className="p-3 bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Manager Note</p>
                <p className="text-sm text-slate-700">{certDetailView.reviewerComment}</p>
              </div>
            )}

            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Attached Copy</p>
              {certDetailView.fileUrl ? (
                certDetailView.fileUrl.startsWith('data:image') ? (
                  <div className="border border-slate-200 bg-slate-50 flex items-center justify-center p-2 min-h-[200px]">
                    <img src={certDetailView.fileUrl} alt="Certificate" className="max-w-full max-h-[400px] object-contain" />
                  </div>
                ) : (
                  <div className="border border-slate-200 bg-slate-50 p-6 flex flex-col items-center gap-3">
                    <FileText size={40} className="text-slate-300" />
                    <p className="text-sm font-medium text-slate-600">{certDetailView.fileName || 'Certificate file'}</p>
                    <a href={certDetailView.fileUrl} download={certDetailView.fileName}
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

          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
            <button
              onClick={() => { setCertDetailView(null); setEditingCert(certDetailView); setActiveTab('CERTIFICATES'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 border border-slate-300 hover:bg-slate-100 transition-colors"
            >
              <Edit2 size={12} /> Edit
            </button>
            <button onClick={() => setCertDetailView(null)} className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Skill Requirement Detail ───────────────────────────────────────
        Click a skill in "Position Skill Requirements" to see, level by level,
        what the employee must demonstrate to reach the required proficiency,
        which certificates each level needs, and the courses that build it. */}
    {skillDetailView && (() => {
      const sd = skillDetailView;
      const skill = sd.skill;
      const courses = skill ? dataService.getCoursesForSkill(skill.id) : [];
      const COURSE_TYPE: Record<string, { label: string; cls: string }> = {
        INTERNAL: { label: 'Internal', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
        EXTERNAL: { label: 'External', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
        OJT: { label: 'On-the-Job', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
      };
      return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white border border-slate-300 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2 min-w-0">
              <TrendingUp size={16} className="text-blue-600 shrink-0" />
              <span className="font-bold text-slate-900 text-sm truncate">{skill?.name || 'Skill Requirement'}</span>
              {skill?.category && (
                <span className="text-[10px] font-bold px-2 py-0.5 border bg-slate-100 text-slate-600 border-slate-200 uppercase shrink-0">{skill.category}</span>
              )}
            </div>
            <button onClick={() => setSkillDetailView(null)} className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors rounded-none">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Current vs required snapshot */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Your Current Level</p>
                <p className={`text-2xl font-black ${sd.current >= sd.required ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {sd.current}<span className="text-sm text-slate-400 font-bold"> / 5</span>
                </p>
                <p className="text-[10px] font-bold text-slate-500 uppercase">{PROFICIENCY_DEFINITIONS[sd.current as 1|2|3|4|5]?.label || 'Not Yet Assessed'}</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Required Level</p>
                <p className="text-2xl font-black text-slate-900">{sd.required}<span className="text-sm text-slate-400 font-bold"> / 5</span></p>
                <p className="text-[10px] font-bold text-slate-500 uppercase">{PROFICIENCY_DEFINITIONS[sd.required as 1|2|3|4|5]?.label}</p>
              </div>
            </div>

            {sd.gap > 0 ? (
              <div className="p-3 bg-amber-50 border-l-4 border-amber-400 flex items-center gap-2">
                <AlertCircle size={14} className="text-amber-500 shrink-0" />
                <p className="text-xs text-amber-800 font-semibold">You need to grow <strong>{sd.gap}</strong> level{sd.gap > 1 ? 's' : ''} to meet this position's requirement.</p>
              </div>
            ) : (
              <div className="p-3 bg-emerald-50 border-l-4 border-emerald-400 flex items-center gap-2">
                <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                <p className="text-xs text-emerald-800 font-semibold">You already meet the required proficiency for this skill.</p>
              </div>
            )}

            {skill?.description && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">About This Competency</p>
                <p className="text-sm text-slate-700 leading-relaxed">{skill.description}</p>
              </div>
            )}

            {/* Level-by-level ladder up to the required level */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Proficiency Ladder — What Each Level Means</p>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(lvl => {
                  const def = PROFICIENCY_DEFINITIONS[lvl as 1|2|3|4|5];
                  const custom = skill?.levels?.[lvl];
                  const isRequired = lvl === sd.required;
                  const achieved = sd.current >= lvl;
                  const beyond = lvl > sd.required;
                  const certs = custom?.requiredCertificates?.filter(Boolean) || [];
                  return (
                    <div
                      key={lvl}
                      className={`p-3 border ${isRequired ? 'border-slate-900 bg-slate-50' : beyond ? 'border-slate-100 bg-white opacity-60' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-black ${achieved ? 'bg-emerald-500 text-white' : isRequired ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}>{lvl}</span>
                          <span className="text-xs font-black text-slate-900 uppercase tracking-tight">{def?.label}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {achieved && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase flex items-center gap-1"><CheckCircle size={9} /> Achieved</span>}
                          {isRequired && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-900 text-white uppercase flex items-center gap-1"><Target size={9} /> Required</span>}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed pl-7">{custom?.description?.trim() || def?.description}</p>
                      {certs.length > 0 && (
                        <div className="pl-7 mt-1.5 flex flex-wrap gap-1.5">
                          {certs.map((c, i) => (
                            <span key={i} className="text-[9px] font-bold px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 flex items-center gap-1">
                              <Award size={9} /> {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Courses that build this skill */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <GraduationCap size={12} /> Recommended Courses
              </p>
              {courses.length > 0 ? (
                <div className="space-y-2">
                  {courses.map(course => {
                    const ct = COURSE_TYPE[course.type] || COURSE_TYPE.INTERNAL;
                    return (
                      <div key={course.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <BookOpen size={16} className="text-blue-600 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">{course.title}</p>
                            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider truncate">{course.provider}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 border uppercase ${ct.cls}`}>{ct.label}</span>
                          {course.link && (
                            <a href={course.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800" onClick={e => e.stopPropagation()}>
                              <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-dashed border-slate-200 text-center">
                  <p className="text-xs text-slate-400 italic">
                    {sd.gap > 0
                      ? 'No catalogued course is linked to this skill yet. Speak with your manager about on-the-job training or an external certification to bridge the gap.'
                      : 'No course needed — requirement already met.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
            <button
              onClick={() => { setSkillDetailView(null); setHistorySearchTerm(skill?.name || ''); setActiveTab('HISTORY'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 border border-slate-300 hover:bg-slate-100 transition-colors"
            >
              <HistoryIcon size={12} /> View Assessment History
            </button>
            <button onClick={() => setSkillDetailView(null)} className="px-4 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
      );
    })()}
    <div className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-8 animate-in fade-in duration-500" id="printable-cv">
      
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print:hidden">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 p-6">
          {/* Identity */}
          <div className="flex items-center gap-5 min-w-0">
            <div className="relative shrink-0">
              <div className="w-20 h-20 bg-slate-100 ring-1 ring-slate-200 rounded-full overflow-hidden flex items-center justify-center">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <UserIcon size={36} className="text-slate-300" />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white p-1 rounded-full ring-2 ring-white" title="Verified profile">
                <BadgeCheck size={13} />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-1.5">
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight truncate">
                  {user.name}
                </h1>
                <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-100 uppercase tracking-widest whitespace-nowrap">
                  {user.orgLevel || 'N/A'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                {user.employeeId && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-slate-400">ID</span>
                    <span className="text-slate-700 font-bold tabular-nums">{user.employeeId}</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <Briefcase size={13} className="text-slate-400 shrink-0" />
                  <span className="truncate">{jobProfile?.title || 'No Job Profile Assigned'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-4 lg:border-l lg:border-slate-100 lg:pl-6 shrink-0">
            <div className="hidden sm:block text-right">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Direct Manager</p>
              <p className="text-sm font-bold text-slate-900 whitespace-nowrap">{(manager && (manager.role !== Role.CEO || user.role === Role.CEO)) ? `${manager.name} (ID: ${manager.employeeId})` : 'N/A'}</p>
            </div>
            <button
                onClick={handleExportCV}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-lg font-bold text-xs uppercase tracking-wide hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
                title="Export a branded Statement of Competence (ISO 9001 §7.2)"
            >
                <Download size={15} /> Competence Statement
            </button>
          </div>
        </div>
      </div>

      {/* ── Professional Identity ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 p-6 animate-in slide-in-from-top-4 duration-500 shadow-sm print:border-none print:shadow-none">
        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-2">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Professional Identity</h3>
            <span className="text-[10px] font-black text-slate-900 tracking-widest bg-slate-50 px-2 py-0.5 border border-slate-200">ID: {user.employeeId || 'PENDING'}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 gap-y-6">
            
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 flex items-center justify-center shrink-0 border border-slate-200">
                    <Mail size={18} className="text-slate-400" />
                </div>
                <div className="min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Official Email</p>
                    <p className="text-xs font-bold text-slate-800 lowercase truncate">{user.email}</p>
                </div>
            </div>

            {user.phone && (
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-50 flex items-center justify-center shrink-0 border border-slate-200">
                        <Phone size={18} className="text-slate-400" />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Mobile Phone</p>
                        <p className="text-xs font-bold text-slate-800">{user.phone}</p>
                    </div>
                </div>
            )}

            {user.whatsapp && (
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-50 flex items-center justify-center shrink-0 border border-slate-200">
                        <MessageCircle size={18} className="text-slate-400" />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">WhatsApp</p>
                        <p className="text-xs font-bold text-slate-800">{user.whatsapp}</p>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 flex items-center justify-center shrink-0 border border-slate-200">
                    <Shield size={18} className="text-slate-400" />
                </div>
                <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Hierarchy Band</p>
                    <p className="text-xs font-bold text-slate-800 uppercase">{user.orgLevel ? `${ORG_LEVEL_LABELS[user.orgLevel]} (${user.orgLevel})` : 'N/A'}</p>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 flex items-center justify-center shrink-0 border border-slate-200">
                    <Building2 size={18} className="text-slate-400" />
                </div>
                <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Department / Section</p>
                    <p className="text-xs font-bold text-slate-800 uppercase">{depts.find(d => d.id === user.departmentId)?.name || 'General Site'}</p>
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 flex items-center justify-center shrink-0 border border-slate-200">
                    <UserCheck size={18} className="text-slate-400" />
                </div>
                <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Direct Manager</p>
                    <p className="text-xs font-bold text-slate-800 uppercase">{manager?.name || 'N/A'}</p>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 flex items-center justify-center shrink-0 border border-slate-200">
                    <MapPin size={18} className="text-slate-400" />
                </div>
                <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Site Location</p>
                    <p className="text-xs font-bold text-slate-800 uppercase">{user.location || 'General Site'}</p>
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 flex items-center justify-center shrink-0 border border-slate-200">
                    <Building size={18} className="text-slate-400" />
                </div>
                <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Current Project</p>
                    <p className="text-xs font-bold text-slate-800 uppercase">{user.projectName || 'Unassigned'}</p>
                </div>
            </div>
        </div>
      </div>

      {/* ── Navigation Tabs ────────────────────────────────────────────── */}
      <div className="flex items-center gap-8 border-b border-slate-200 overflow-x-auto no-scrollbar print:hidden">
        {[
          { id: 'OVERVIEW', label: 'Dashboard Overview', icon: LayoutGrid },
          { id: 'HISTORY', label: 'Evaluation History', icon: HistoryIcon },
          { id: 'CERTIFICATES', label: 'Certificates & Credentials', icon: ShieldCheck },
          { id: 'IDP', label: 'Individual Development Plan', icon: Target },
          { id: 'CAREER', label: 'Career & Skill Profile', icon: Briefcase },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 pb-4 text-xs font-bold uppercase tracking-wide transition-all whitespace-nowrap border-b-2 ${
              activeTab === tab.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Main Content Area ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Stats & Profile Summary */}
        <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 p-6 text-white space-y-6">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 border-b border-white/10 pb-2">Readiness Metrics</h3>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Skill Compliance</p>
                        <p className="text-3xl font-black">{skillAnalysis.length > 0 ? Math.round((compliant.length / skillAnalysis.length) * 100) : 0}%</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Gap Density</p>
                        <p className="text-3xl font-black text-blue-400">{gaps.length}</p>
                    </div>
                </div>
                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Annual Appraisal</p>
                        <div className="flex items-baseline gap-1">
                            <p className="text-3xl font-black text-amber-400">{latestAppraisal ? latestAppraisal.score : '--'}</p>
                            <span className="text-xs font-bold text-slate-500">/ 10</span>
                        </div>
                    </div>
                    {latestAppraisal && (
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(latestAppraisal.date).getFullYear()}</p>
                            <p className="text-[9px] text-slate-500 uppercase">{annualCycle?.name || 'Evaluation'}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Right Column: Dynamic View */}
        <div className="lg:col-span-8">
            
            {activeTab === 'HISTORY' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                    <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                        <HistoryIcon className="absolute -right-8 -bottom-8 w-48 h-48 opacity-10" />
                        <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Evaluation History Ledger</h2>
                        <p className="text-slate-400 text-sm max-w-xl">
                            Permanent registry of all technical interviews, written exams, and evidence-based reviews.
                        </p>
                    </div>
                    <AssessmentHistoryLog currentUser={user} initialSearchTerm={historySearchTerm} />
                </div>
            )}

            {activeTab === 'OVERVIEW' && (
                <div className="space-y-6">
                    <div className="bg-white border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-2">
                            <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-2">
                                <Award size={18} className="text-amber-500" /> Annual Appraisal
                            </h3>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 border border-slate-200 uppercase">
                                {latestAppraisal ? new Date(latestAppraisal.date).getFullYear() : new Date().getFullYear()}
                            </span>
                        </div>
                        {latestAppraisal ? (
                            <div className="space-y-6">
                                <div className="text-center py-4">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Score</p>
                                    <div className="text-5xl font-black text-slate-900">
                                        {latestAppraisal.score} <span className="text-xl text-slate-400">/ 10</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 bg-slate-50 border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <Calendar size={12} /> Evaluation Period
                                        </p>
                                        <p className="text-xs font-bold text-slate-800">
                                            {annualCycle ? `${new Date(annualCycle.startDate).toLocaleDateString()} - ${new Date(annualCycle.dueDate).toLocaleDateString()}` : 'Date Not Specified'}
                                        </p>
                                    </div>
                                    <div className="p-4 bg-slate-50 border border-slate-100">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <Clock size={12} /> Completed On
                                        </p>
                                        <p className="text-xs font-bold text-slate-800">{new Date(latestAppraisal.date).toLocaleDateString()}</p>
                                    </div>
                                </div>
                                {latestAppraisal.comment && !latestAppraisal.comment.startsWith('[APPRAISAL_DATA:') && (
                                    <div className="p-4 bg-slate-50 border-l-4 border-slate-900">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Remarks</p>
                                        <p className="text-xs text-slate-700 italic">{latestAppraisal.comment}</p>
                                    </div>
                                )}
                                {appraisalEvaluations.length > 0 && (
                                    <div className="pt-6 border-t border-slate-100">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Evaluations</h4>
                                        <div className="space-y-2">
                                            {appraisalEvaluations.map((appraisal) => {
                                                const evaluator = appraisal.raterId === user.id ? user : dataService.getUserById(appraisal.raterId);
                                                return (
                                                <div key={appraisal.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 hover:border-slate-300 transition-colors group cursor-pointer" onClick={() => { setHistorySearchTerm('Annual Appraisal'); setActiveTab('HISTORY'); }}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-none bg-white border border-slate-200 flex items-center justify-center">
                                                            <span className="text-[10px] font-black text-slate-700">{new Date(appraisal.date).getFullYear()}</span>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-800 uppercase">{appraisalTypeLabel(appraisal.type)} · {appraisal.score} / 10</p>
                                                            <p className="text-[9px] text-slate-500 font-bold tracking-widest uppercase">{evaluator?.name || 'System'} — {new Date(appraisal.date).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-slate-400 group-hover:text-blue-600 transition-colors">
                                                        <Eye size={14} />
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-slate-400">
                                <AlertCircle size={24} className="mx-auto mb-2 opacity-20" />
                                <p className="text-xs font-medium italic">No annual appraisal recorded.</p>
                            </div>
                        )}
                    </div>
                            <div className="bg-white border border-slate-200 p-6">
                                <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-2">
                                    <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-2">
                                        <TrendingUp size={18} className="text-blue-600" /> Position Skill Requirements
                                    </h3>
                                    <button onClick={() => { setHistorySearchTerm(''); setActiveTab('HISTORY'); }} className="text-[10px] font-bold text-blue-600 hover:underline uppercase">View Full History</button>
                                </div>
                                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                                    {skillAnalysis.map((item, idx) => (
                                        <div
                                            key={idx}
                                            onClick={() => setSkillDetailView(item)}
                                            className="space-y-2 cursor-pointer group p-3 hover:bg-slate-50 transition-colors border border-slate-100 hover:border-slate-300"
                                        >
                                            <div className="flex justify-between items-center">
                                                <span className="text-[11px] font-bold text-slate-800 uppercase group-hover:text-blue-600 transition-colors flex items-center gap-2">
                                                    {item.skill?.name}
                                                    <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-600" />
                                                </span>
                                                <span className="text-[10px] font-black text-slate-600">
                                                    <span className={item.current >= item.required ? 'text-emerald-600' : 'text-amber-600'}>Score: {item.current}</span> / {item.required} Required
                                                </span>
                                            </div>
                                            <div className="h-1.5 bg-slate-200 w-full relative">
                                                {/* Required Marker */}
                                                <div className="absolute top-0 bottom-0 bg-slate-900 w-0.5 z-10" style={{ left: `${(item.required / 5) * 100}%` }}></div>
                                                {/* Current Score Bar */}
                                                <div className={`h-full absolute left-0 top-0 transition-all duration-1000 ${item.current >= item.required ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${(item.current / 5) * 100}%` }}></div>
                                            </div>
                                        </div>
                                    ))}
                                    {skillAnalysis.length === 0 && (
                                        <p className="text-xs text-slate-400 italic py-4">No specific skill requirements defined for this position.</p>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white border border-slate-200 p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-2">
                                        <ShieldCheck size={18} className="text-emerald-500" /> Professional Certificates
                                    </h3>
                                    <button onClick={() => setActiveTab('CERTIFICATES')} className="text-[10px] font-bold text-blue-600 hover:underline uppercase flex items-center gap-1">
                                        <Edit2 size={12} /> Manage
                                    </button>
                                </div>
                                <div className="space-y-4">
                                    {user.certificates && user.certificates.length > 0 ? user.certificates.slice(0, 3).map(cert => {
                                        const sInfo = { PENDING: { label: 'Waiting for Approval', cls: 'bg-amber-100 text-amber-700 border-amber-200' }, APPROVED: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }, REJECTED: { label: 'Declined', cls: 'bg-red-100 text-red-700 border-red-200' } }[cert.status as string] || { label: 'Waiting for Approval', cls: 'bg-amber-100 text-amber-700 border-amber-200' };
                                        return (
                                        <div key={cert.id} onClick={() => setCertDetailView(cert)} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 hover:border-blue-300 transition-colors cursor-pointer group">
                                            <div className="flex items-center gap-3">
                                                <Award size={16} className="text-slate-400" />
                                                <div>
                                                    <p className="text-xs font-bold text-slate-800 uppercase group-hover:text-blue-700 transition-colors">{cert.name}</p>
                                                    <p className="text-[9px] text-slate-500 font-bold tracking-tighter uppercase">{cert.issuer}</p>
                                                </div>
                                            </div>
                                            <span className={`text-[9px] font-bold px-2 py-0.5 border ${sInfo.cls}`}>{sInfo.label}</span>
                                        </div>
                                        );
                                    }) : (
                                        <p className="text-xs text-slate-400 italic py-4">No certificates currently on record.</p>
                                    )}
                                </div>
                            </div>
                </div>
            )}

            {activeTab === 'IDP' && (
                 <div className="bg-white border border-slate-200 overflow-hidden animate-in slide-in-from-right-4 duration-500">
                    <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex items-center gap-3 mb-2">
                            <Target size={24} className="text-slate-900" />
                            <h2 className="text-xl font-black uppercase tracking-tight">Individual Development Plan</h2>
                        </div>
                        <p className="text-slate-500 text-xs font-medium">Auto-generated roadmap to bridge competency gaps based on current job requirements.</p>
                    </div>
                    <div className="p-8">
                        {gaps.length > 0 ? (
                            <div className="space-y-8">
                                {gaps.map((gap, idx) => (
                                    <div key={idx} className="flex gap-6 relative">
                                        {idx !== gaps.length - 1 && <div className="absolute left-[11px] top-6 bottom-0 w-0.5 bg-slate-100"></div>}
                                        <div className="w-6 h-6 rounded-none bg-slate-900 text-white flex items-center justify-center text-[10px] font-black z-10 shrink-0">
                                            {idx + 1}
                                        </div>
                                        <div className="space-y-3 pb-8">
                                            <div>
                                                <h4 className="font-black text-slate-900 uppercase text-sm tracking-tight">{gap.skill?.name}</h4>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{gap.skill?.category}</p>
                                            </div>
                                            <div className="p-4 bg-slate-50 border border-slate-100 rounded-none space-y-3">
                                                <div className="flex items-center gap-2">
                                                    <BookOpen size={14} className="text-blue-600" />
                                                    <p className="text-xs font-bold text-slate-700">Recommended Action:</p>
                                                </div>
                                                <p className="text-xs text-slate-600 leading-relaxed italic">
                                                    {gap.gap >= 2 
                                                        ? "Requires specialized external training module and technical certification." 
                                                        : "On-the-job mentorship with department lead and internal knowledge transfer."}
                                                </p>
                                                <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                                                    <span className="text-[10px] font-black uppercase text-slate-400">Status: Pending Verification</span>
                                                    <button className="text-[10px] font-black uppercase text-blue-600 hover:underline">Request Support</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <CheckCircle size={48} className="text-emerald-500 mx-auto mb-4" />
                                <h4 className="text-lg font-black uppercase tracking-tight">Full Compliance Achieved</h4>
                                <p className="text-slate-500 text-sm mt-2">You currently meet all required proficiency levels for your Job Profile.</p>
                            </div>
                        )}
                    </div>
                 </div>
            )}



            {activeTab === 'CERTIFICATES' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                    <div className="bg-emerald-900 p-8 text-white relative overflow-hidden">
                        <ShieldCheck className="absolute -right-8 -bottom-8 w-48 h-48 opacity-10" />
                        <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Certificates & Credentials</h2>
                        <p className="text-emerald-200 text-sm max-w-xl">
                            Manage your professional certifications, academic degrees, and upload digital copies for managerial approval.
                        </p>
                    </div>

                    <div className="space-y-4">
                        {!editingCert && (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-xs font-black uppercase text-slate-700 tracking-widest">Your Records</h4>
                                <button onClick={() => setEditingCert({})} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 uppercase hover:underline">
                                    <Plus size={12} /> Add New
                                </button>
                            </div>
                            {user.certificates && user.certificates.length > 0 ? (
                                <div className="space-y-3">
                                    {user.certificates.map((cert: any) => {
                                        const isExpiringSoon = cert.expiryDate && !cert.noExpiry && (() => {
                                            const days = (new Date(cert.expiryDate!).getTime() - Date.now()) / 86400000;
                                            return days > 0 && days <= 90;
                                        })();
                                        const isExpired = cert.expiryDate && !cert.noExpiry && new Date(cert.expiryDate) < new Date();
                                        const categoryColors: Record<string, string> = {
                                            PROFESSIONAL: 'bg-blue-50 text-blue-700 border-blue-200',
                                            ACADEMIC: 'bg-purple-50 text-purple-700 border-purple-200',
                                            TECHNICAL: 'bg-cyan-50 text-cyan-700 border-cyan-200',
                                            SAFETY: 'bg-orange-50 text-orange-700 border-orange-200',
                                            LANGUAGE: 'bg-pink-50 text-pink-700 border-pink-200',
                                            OTHER: 'bg-slate-50 text-slate-600 border-slate-200',
                                        };
                                        const statusInfo = CERT_STATUS[cert.status as string] || CERT_STATUS.PENDING;
                                        const isEditingThis = (editingCert as any)?.id === cert.id;
                                        return (
                                            <div
                                              key={cert.id}
                                              onClick={() => setCertDetailView(cert)}
                                              className={`p-4 bg-white border transition-colors cursor-pointer group ${isEditingThis ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200 hover:border-blue-400 hover:shadow-sm'} ${isExpired ? 'border-l-4 border-l-red-400' : isExpiringSoon ? 'border-l-4 border-l-amber-400' : ''}`}
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex-1 min-w-0 pr-2">
                                                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                                            <h5 className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{cert.name}</h5>
                                                            {cert.fileUrl && <FileUp size={11} className="text-slate-400 shrink-0" />}
                                                            {cert.credentialUrl && <ExternalLink size={11} className="text-blue-400 shrink-0" />}
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider truncate">{cert.issuer}</p>
                                                        {cert.credentialId && <p className="text-[10px] text-slate-400 mt-0.5">ID: {cert.credentialId}</p>}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className={`text-[9px] font-bold px-2 py-0.5 border ${statusInfo.cls}`}>
                                                            {statusInfo.label}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        {cert.category && (
                                                            <span className={`text-[9px] font-bold px-2 py-0.5 border uppercase tracking-wide ${categoryColors[cert.category] || categoryColors.OTHER}`}>
                                                                {cert.category}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-slate-400">Issued: {new Date(cert.dateAchieved).toLocaleDateString()}</span>
                                                        {cert.noExpiry ? (
                                                            <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 border border-emerald-100">NO EXPIRY</span>
                                                        ) : cert.expiryDate ? (
                                                            <span className={`text-[9px] font-bold px-2 py-0.5 border ${isExpired ? 'bg-red-50 text-red-600 border-red-200' : isExpiringSoon ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                                {isExpired ? 'EXPIRED' : isExpiringSoon ? `EXPIRING ${new Date(cert.expiryDate).toLocaleDateString()}` : `EXP: ${new Date(cert.expiryDate).toLocaleDateString()}`}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                        <button onClick={() => setEditingCert(cert)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Edit">
                                                            <Edit2 size={12} />
                                                        </button>
                                                        <button onClick={() => setCertDeleteId(cert.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                                {certDeleteId === cert.id && (
                                                    <div className="mt-3 p-3 bg-red-50 border border-red-200 flex items-center justify-between gap-3" onClick={e => e.stopPropagation()}>
                                                        <p className="text-[10px] font-bold text-red-700 uppercase">Delete this certificate?</p>
                                                        <div className="flex gap-2">
                                                            <button onClick={() => setCertDeleteId(null)} className="text-[9px] font-bold uppercase px-2 py-1 border border-slate-300 text-slate-600 hover:bg-slate-100">Cancel</button>
                                                            <button onClick={() => handleDeleteCertificate(cert.id)} className="text-[9px] font-bold uppercase px-2 py-1 bg-red-600 text-white hover:bg-red-700">Confirm Delete</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="text-center py-12 bg-white border border-dashed border-slate-300 text-slate-400 flex flex-col items-center gap-3">
                                    <ShieldCheck size={32} className="text-slate-300" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">No certificates yet</p>
                                        <p className="text-[10px] text-slate-400 mt-1">Click "Add New" to record your first certificate or credential.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        )}

                        {editingCert && (
                            <div className="bg-white border border-slate-200 p-6">
                                <h4 className="text-xs font-black uppercase text-slate-700 tracking-widest mb-4 border-b border-slate-100 pb-2">
                                    {editingCert.id ? 'Edit Certificate' : 'New Certificate'}
                                </h4>
                                <form onSubmit={handleSaveCertificate} className="space-y-4">
                                    {/* Category */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Category</label>
                                        <select value={editingCert.category || ''} onChange={e => setEditingCert({...editingCert, category: (e.target.value || undefined) as Certificate['category']})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500">
                                            <option value="">— Select category —</option>
                                            <option value="PROFESSIONAL">Professional</option>
                                            <option value="ACADEMIC">Academic / Degree</option>
                                            <option value="TECHNICAL">Technical</option>
                                            <option value="SAFETY">Safety & Compliance</option>
                                            <option value="LANGUAGE">Language</option>
                                            <option value="OTHER">Other</option>
                                        </select>
                                    </div>

                                    {/* Name */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Certificate / Credential Name *</label>
                                        <input required type="text" value={editingCert.name || ''} onChange={e => setEditingCert({...editingCert, name: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" placeholder="As it appears on the certificate" />
                                    </div>

                                    {/* Issuer */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Issuing Institution / University *</label>
                                        <input required type="text" value={editingCert.issuer || ''} onChange={e => setEditingCert({...editingCert, issuer: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" />
                                    </div>

                                    {/* Degree */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Degree / Specialization (Optional)</label>
                                        <input type="text" value={editingCert.degree || ''} onChange={e => setEditingCert({...editingCert, degree: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" placeholder="e.g., BSc Petroleum Engineering, PMP" />
                                    </div>

                                    {/* Credential ID */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Credential ID / License Number</label>
                                        <input type="text" value={editingCert.credentialId || ''} onChange={e => setEditingCert({...editingCert, credentialId: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" placeholder="e.g., CER-2024-00123" />
                                    </div>

                                    {/* Dates */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Issue Date *</label>
                                            <input required type="date" value={editingCert.dateAchieved || ''} onChange={e => setEditingCert({...editingCert, dateAchieved: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Expiry Date</label>
                                            <input type="date" disabled={!!editingCert.noExpiry} value={editingCert.expiryDate || ''} onChange={e => setEditingCert({...editingCert, expiryDate: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500 disabled:opacity-40 disabled:cursor-not-allowed" />
                                        </div>
                                    </div>

                                    {/* No expiry toggle */}
                                    <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input type="checkbox" checked={!!editingCert.noExpiry} onChange={e => setEditingCert({...editingCert, noExpiry: e.target.checked, expiryDate: e.target.checked ? '' : editingCert.expiryDate})} className="w-3.5 h-3.5 accent-emerald-600" />
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">This credential does not expire</span>
                                    </label>

                                    {/* Renewal */}
                                    {!editingCert.noExpiry && (
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Renewal Date (If Applicable)</label>
                                            <input type="date" value={editingCert.renewalDate || ''} onChange={e => setEditingCert({...editingCert, renewalDate: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" />
                                        </div>
                                    )}

                                    {/* Credential URL */}
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Verification URL (Optional)</label>
                                        <input type="url" value={editingCert.credentialUrl || ''} onChange={e => setEditingCert({...editingCert, credentialUrl: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" placeholder="https://www.credly.com/badges/..." />
                                    </div>

                                    {/* File upload */}
                                    <div className="border border-slate-300 p-4 bg-slate-50 relative">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <FileUp size={12} /> Digital Copy (PDF or Image)
                                        </label>
                                        <input
                                            type="file"
                                            onChange={handleFileUpload}
                                            accept=".pdf,image/*"
                                            className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:border-0 file:text-xs file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        />
                                        {editingCert.fileName && (
                                            <p className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1">
                                                <CheckCircle size={12} /> {editingCert.fileName}
                                            </p>
                                        )}
                                    </div>

                                    <div className="pt-4 flex justify-between items-center gap-2">
                                        {editingCert.id && (
                                            <button type="button" onClick={() => setCertDeleteId(editingCert.id ?? null)} className="px-3 py-2 border border-red-200 text-red-500 text-[10px] font-bold uppercase tracking-widest hover:bg-red-50 flex items-center gap-1">
                                                <Trash2 size={11} /> Delete
                                            </button>
                                        )}
                                        <div className="flex gap-2 ml-auto">
                                            <button type="button" onClick={() => setEditingCert(null)} className="px-4 py-2 border border-slate-300 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50">Cancel</button>
                                            <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700">Submit for Approval</button>
                                        </div>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'CAREER' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                    <div className="bg-blue-900 p-8 text-white relative overflow-hidden">
                        <Briefcase className="absolute -right-8 -bottom-8 w-48 h-48 opacity-10" />
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                            <div>
                                <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Professional Career & Skill Ledger</h2>
                                <p className="text-blue-200 text-sm max-w-xl">
                                    A comprehensive record of your skills, evaluations, and professional journey across all roles within EPROM.
                                </p>
                            </div>
                            <button 
                                onClick={handleExportCV}
                                className="bg-white text-blue-900 px-6 py-3 font-black uppercase tracking-widest text-xs flex items-center gap-2 hover:bg-blue-50 transition-all shadow-lg shrink-0"
                            >
                                <FileText size={16} /> Export Competence Statement
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Sub-Tabs Navigation */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 bg-slate-50/50 p-1 gap-4">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setCareerSubTab('PROGRESSION')}
                                    className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest transition-all ${
                                        careerSubTab === 'PROGRESSION'
                                        ? 'bg-white text-blue-900 shadow-sm border-b-2 border-blue-900'
                                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    <TrendingUp size={16} /> Promotion Ladder
                                </button>
                                <button
                                    onClick={() => setCareerSubTab('JOURNEY')}
                                    className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest transition-all ${
                                        careerSubTab === 'JOURNEY'
                                        ? 'bg-white text-blue-900 shadow-sm border-b-2 border-blue-900'
                                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    <HistoryIcon size={16} /> Professional Journey
                                </button>
                                <button 
                                    onClick={() => setCareerSubTab('INVENTORY')}
                                    className={`flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest transition-all ${
                                        careerSubTab === 'INVENTORY' 
                                        ? 'bg-white text-blue-900 shadow-sm border-b-2 border-blue-900' 
                                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                    }`}
                                >
                                    <Layers size={16} /> Skill Inventory (All-Time)
                                </button>
                            </div>

                            {careerSubTab === 'INVENTORY' && (
                                <div className="flex gap-2 px-4">
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 border border-emerald-100 uppercase tracking-tighter">
                                        <CheckCircle size={10} /> Certified
                                    </span>
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-3 py-1 border border-blue-100 uppercase tracking-tighter">
                                        <TrendingUp size={10} /> Evaluated
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Sub-Tab Content */}
                        <div className="animate-in fade-in zoom-in-95 duration-300">
                            {careerSubTab === 'PROGRESSION' ? (
                                <div className="space-y-6 max-w-4xl mx-auto py-8">
                                    <div className="bg-slate-50 border border-slate-200 p-6">
                                        <div className="flex items-start gap-3">
                                            <Target size={20} className="text-blue-700 shrink-0 mt-0.5" />
                                            <div>
                                                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wide">Your Path to the Top</h4>
                                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                                    Every rung from your current position up to General Manager — and the exact
                                                    competencies you must reach to be ready for each promotion within{' '}
                                                    <span className="font-bold text-slate-700">{depts.find(d => d.id === user.departmentId)?.name || 'your department'}</span>.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {!careerPath || careerPath.roadmap.length === 0 ? (
                                        <div className="p-12 bg-slate-50 border-2 border-dashed border-slate-200 text-center">
                                            <Award size={48} className="mx-auto mb-4 text-slate-200" />
                                            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                                                {user.orgLevel === 'CEO' ? 'You have reached the top of the hierarchy.' : 'No promotion path is mapped yet.'}
                                            </p>
                                            <p className="text-xs text-slate-400 mt-1">
                                                {user.orgLevel === 'CEO'
                                                    ? 'There are no higher positions to progress toward.'
                                                    : 'Promotion requirements for the levels above you have not been configured for your department yet.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="relative pl-12 space-y-8">
                                            <div className="absolute left-[21px] top-4 bottom-4 w-1 bg-gradient-to-b from-slate-200 via-slate-200 to-blue-600"></div>

                                            {/* Top of ladder (GM/CEO) first, descending to the nearest promotion */}
                                            {[...careerPath.roadmap].reverse().map((rung) => {
                                                const r = READINESS[rung.readinessStatus] || READINESS.DEVELOPMENT_NEEDED;
                                                const total = rung.requirements.length;
                                                const met = rung.requirements.filter(req => req.gap <= 0).length;
                                                const pct = total > 0 ? Math.round((met / total) * 100) : 0;
                                                const isNextStep = rung.level === careerPath.roadmap[0].level;
                                                return (
                                                    <div key={rung.level} className="relative group">
                                                        <div className={`absolute -left-12 top-0 w-11 h-11 bg-white border-4 rounded-none shadow-sm flex items-center justify-center z-10 ${r.dot}`}>
                                                            <span className="text-[10px] font-black">{rung.level}</span>
                                                        </div>
                                                        <div className="bg-white p-6 border border-slate-200 shadow-sm">
                                                            <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                                                                <div>
                                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{isNextStep ? 'Next Step Up' : 'Future Milestone'}</p>
                                                                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">{ORG_LEVEL_LABELS[rung.level]}</h4>
                                                                </div>
                                                                <span className={`text-[10px] font-black px-3 py-1 border uppercase tracking-wider ${r.badge}`}>{r.label}</span>
                                                            </div>

                                                            {!rung.isDefined || total === 0 ? (
                                                                <p className="text-xs text-slate-400 italic py-2">
                                                                    Promotion requirements for this level have not been defined for your department yet.
                                                                </p>
                                                            ) : (
                                                                <>
                                                                    <div className="flex items-center gap-3 mb-4">
                                                                        <div className="flex-1 h-2 bg-slate-100 overflow-hidden">
                                                                            <div className={`h-full ${r.bar} transition-all`} style={{ width: `${pct}%` }}></div>
                                                                        </div>
                                                                        <span className="text-[10px] font-black text-slate-500 uppercase whitespace-nowrap">{met}/{total} Skills Met</span>
                                                                    </div>
                                                                    <div className="space-y-2">
                                                                        {rung.requirements.map((req) => {
                                                                            const done = req.gap <= 0;
                                                                            return (
                                                                                <div key={req.skillId} className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-100">
                                                                                    <div className="flex items-center gap-2 min-w-0">
                                                                                        {done
                                                                                            ? <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                                                                                            : <AlertTriangle size={14} className="text-amber-500 shrink-0" />}
                                                                                        <span className="text-xs font-bold text-slate-700 truncate">{req.skillName}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                                        <span className={`text-[11px] font-black ${done ? 'text-emerald-600' : 'text-slate-700'}`}>{req.currentScore}</span>
                                                                                        <ArrowRight size={11} className="text-slate-300" />
                                                                                        <span className="text-[11px] font-black text-blue-700">{req.requiredScore}</span>
                                                                                        {!done && (
                                                                                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 uppercase">+{req.gap}</span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* Current position anchor at the foot of the ladder */}
                                            <div className="relative">
                                                <div className="absolute -left-12 top-0 w-11 h-11 bg-blue-600 border-4 border-blue-600 rounded-none shadow-md flex items-center justify-center z-10">
                                                    <UserIcon size={16} className="text-white" />
                                                </div>
                                                <div className="bg-blue-50 p-6 border border-blue-200 border-l-4 border-l-blue-600">
                                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">You Are Here</p>
                                                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                                                        {user.orgLevel ? ORG_LEVEL_LABELS[user.orgLevel] : 'Current Position'}
                                                    </h4>
                                                    <p className="text-xs text-slate-500 mt-1">{jobProfile?.title || 'Current role'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : careerSubTab === 'JOURNEY' ? (
                                <div className="space-y-6 max-w-4xl mx-auto py-8">
                                    <div className="relative pl-12 space-y-12">
                                        <div className="absolute left-[21px] top-4 bottom-4 w-1 bg-gradient-to-b from-blue-600 via-slate-200 to-slate-200"></div>
                                        
                                        {/* Current Position */}
                                        <div className="relative group">
                                            <div className="absolute -left-12 top-0 w-11 h-11 bg-white border-4 border-blue-600 rounded-none shadow-md flex items-center justify-center z-10 group-hover:scale-110 transition-transform">
                                                <Briefcase size={18} className="text-blue-600" />
                                            </div>
                                            <div className="bg-white p-6 border border-slate-200 border-l-4 border-l-blue-600 shadow-sm">
                                                <div className="flex justify-between items-start mb-2">
                                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">Active Role / Primary Designation</p>
                                                    <span className="text-[10px] font-bold text-slate-400">Since {user.careerHistory?.[0]?.startDate ? new Date(user.careerHistory[0].startDate).toLocaleDateString() : 'Initial Start'}</span>
                                                </div>
                                                <h4 className="text-2xl font-black text-slate-900 uppercase leading-none mb-2 tracking-tight">{jobProfile?.title || 'Position Asset'}</h4>
                                                <div className="flex items-center gap-4">
                                                    <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{depts.find(d => d.id === user.departmentId)?.name}</p>
                                                    <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                    <p className="text-xs text-slate-400">{user.projectName || 'General Site'}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Historical Roles */}
                                        {user.careerHistory?.slice(1).map((entry, idx) => (
                                            <div key={idx} className="relative group opacity-80 hover:opacity-100 transition-all">
                                                <div className="absolute -left-12 top-0 w-11 h-11 bg-white border-4 border-slate-300 rounded-none shadow-sm flex items-center justify-center z-10 group-hover:border-slate-900 transition-colors">
                                                    <HistoryIcon size={18} className="text-slate-400 group-hover:text-slate-900 transition-colors" />
                                                </div>
                                                <div className="bg-slate-50 p-6 border border-slate-200 hover:bg-white hover:border-slate-300 transition-all">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Previous Professional Assignment</p>
                                                        <p className="text-[10px] font-bold text-slate-400">
                                                            {new Date(entry.startDate).toLocaleDateString()} - {entry.endDate ? new Date(entry.endDate).toLocaleDateString() : 'Promotion/Transfer'}
                                                        </p>
                                                    </div>
                                                    <h4 className="text-xl font-black text-slate-700 uppercase leading-none mb-2 tracking-tight">{entry.jobTitle}</h4>
                                                    <div className="flex items-center gap-4">
                                                        <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">{depts.find(d => d.id === entry.departmentId)?.name}</p>
                                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                                        <p className="text-xs text-slate-400">{entry.reason}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        
                                        {(!user.careerHistory || user.careerHistory.length <= 1) && (
                                            <div className="p-12 bg-slate-50 border-2 border-dashed border-slate-200 text-center">
                                                <Activity size={48} className="mx-auto mb-4 text-slate-200" />
                                                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No historical transfer data recorded.</p>
                                                <p className="text-xs text-slate-400 mt-1">Your career timeline will populate as you grow within the company.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 py-8">
                                    <div className="space-y-4">
                                        {careerSkillMap.map((entry) => (
                                            <div key={entry.skill.id} className="bg-white border border-slate-200 hover:border-blue-900 transition-all shadow-sm hover:shadow-md group relative overflow-hidden flex flex-col lg:flex-row items-stretch">
                                                {/* Skill Identifier */}
                                                <div className="p-6 lg:w-1/3 border-b lg:border-b-0 lg:border-r border-slate-100 flex flex-col justify-center">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em]">{entry.skill.category}</p>
                                                        <span className="text-[10px] font-bold text-slate-300">#{entry.skill.id.slice(0, 8)}</span>
                                                    </div>
                                                    <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight leading-tight group-hover:text-blue-900 transition-colors">
                                                        {entry.skill.name}
                                                    </h4>
                                                </div>

                                                {/* Peak Performance Metric */}
                                                <div className="p-6 lg:w-48 bg-slate-50/50 flex flex-col items-center justify-center border-b lg:border-b-0 lg:border-r border-slate-100">
                                                    <div className="relative">
                                                        <p className="text-5xl font-black text-slate-900 leading-none">
                                                            {entry.bestScore}
                                                            <span className="text-lg text-slate-300 ml-1">/5</span>
                                                        </p>
                                                    </div>
                                                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-2">Peak Attained</p>
                                                </div>

                                                {/* Evaluation Ledger (Full History) */}
                                                <div className="p-6 flex-1 bg-white">
                                                    <div className="flex items-center justify-between mb-4">
                                                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                            <Activity size={12} /> Assessment Timeline ({entry.history.length} Records)
                                                        </h5>
                                                        <div className="h-px flex-1 bg-slate-100 mx-4 hidden sm:block"></div>
                                                    </div>
                                                    
                                                    <div className="flex flex-wrap gap-2">
                                                        {entry.history.map((h, i) => (
                                                            <div 
                                                                key={i} 
                                                                className="flex flex-col items-center justify-center px-4 py-2 bg-white border border-slate-100 shadow-sm hover:border-blue-200 transition-all min-w-[80px]"
                                                                title={`${h.method} - ${h.type}`}
                                                            >
                                                                <span className={`text-lg font-black ${h.score >= 3 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                                    {h.score}
                                                                </span>
                                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                                                                    {new Date(h.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Visual Accent */}
                                                <div className="absolute top-0 right-0 w-1.5 h-full bg-slate-100 group-hover:bg-blue-900 transition-colors"></div>
                                            </div>
                                        ))}
                                    </div>

                                    {careerSkillMap.length === 0 && (
                                        <div className="text-center py-24 bg-slate-50 border-2 border-dashed border-slate-200 text-slate-400">
                                            <Layers size={64} className="mx-auto mb-6 opacity-10" />
                                            <p className="text-lg font-black uppercase tracking-[0.2em] mb-2">Inventory Ledger Empty</p>
                                            <p className="text-sm italic max-w-md mx-auto">No standardized evaluation records or approved work evidences were found across your professional tenure.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
      </div>
      
      {/* Print-only CSS for Professional CV */}
      <style>{`
        @media print {
            body * { visibility: hidden; }
            #printable-cv, #printable-cv * { visibility: visible; }
            #printable-cv {
                position: absolute;
                left: 0;
                top: 0;
                width: 100%;
                background: white;
                color: black;
                padding: 40px;
            }
            .no-print { display: none !important; }
        }
      `}</style>
    </div>
    </>
  );
});