import React, { useMemo, useState, useEffect } from 'react';
import { User, Role, JobProfile, Skill, IndividualTrainingPlan, ORG_HIERARCHY_ORDER, ORG_LEVEL_LABELS, ScheduledAssessment } from '../types';
import { dataService } from '../services/store';
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
  X
} from 'lucide-react';
import { auth } from '../firebase';

interface EmployeeDashboardProps {
  user: User;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = React.memo(({ user }) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ASSESSMENTS' | 'IDP' | 'HISTORY' | 'CERTIFICATES'>('OVERVIEW');
  const [assessmentQueue, setAssessmentQueue] = useState<any>(null);
  const [historySearchTerm, setHistorySearchTerm] = useState('');

  // Certificate Management State
  const [editingCert, setEditingCert] = useState<Partial<any> | null>(null);

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

    const newCert = {
      id: editingCert.id || crypto.randomUUID(),
      name: editingCert.name || '',
      degree: editingCert.degree || '',
      issuer: editingCert.issuer || '',
      dateAchieved: editingCert.dateAchieved || new Date().toISOString().split('T')[0],
      expiryDate: editingCert.expiryDate || '',
      renewalDate: editingCert.renewalDate || '',
      fileUrl: editingCert.fileUrl || '',
      fileName: editingCert.fileName || '',
      status: 'PENDING' as const
    };

    const existingCerts = user.certificates || [];
    const updatedCerts = editingCert.id 
      ? existingCerts.map(c => c.id === newCert.id ? newCert : c)
      : [...existingCerts, newCert];

    await dataService.updateUser({ ...user, certificates: updatedCerts });
    setEditingCert(null);
  };

  const jobProfile = useMemo(() => user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null, [user.jobProfileId]);
  const depts = useMemo(() => dataService.getAllDepartments(), []);
  const manager = useMemo(() => user.managerId ? dataService.getUserById(user.managerId) : null, [user.managerId]);
  
  useEffect(() => {
    const queue = dataService.getEmployeeAssessmentQueue(user.id);
    setAssessmentQueue(queue);
  }, [user.id]);

  const skillAnalysis = useMemo(() => {
    const requirements = jobProfile && user.orgLevel ? (jobProfile.requirements[user.orgLevel] || []) : [];
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
  }, [jobProfile, user.id, user.orgLevel]);

  const gaps = useMemo(() => skillAnalysis.filter(s => s.gap > 0), [skillAnalysis]);
  const compliant = useMemo(() => skillAnalysis.filter(s => s.gap <= 0), [skillAnalysis]);

  const annualAppraisals = useMemo(() => {
    return dataService.getAssessments({ subjectId: user.id, skillId: 'annual-appraisal' });
  }, [user.id]);
  const latestAppraisal = annualAppraisals[0];

  const annualCycle = useMemo(() => {
    return dataService.getAllCycles().find(c => c.name.includes('Annual Appraisal') || c.name.includes('Annual 360 Evaluation'));
  }, []);

  const renderAssessmentSection = (title: string, items: any[], icon: any, actionLabel: string, colorClass: string) => (
    <div className="bg-white border border-slate-200 overflow-hidden">
      <div className={`p-4 border-b border-slate-100 flex items-center justify-between ${colorClass}`}>
        <div className="flex items-center gap-2">
          {React.createElement(icon, { size: 18, className: "text-slate-800" })}
          <h3 className="font-bold text-slate-900 uppercase tracking-tight text-sm">{title}</h3>
        </div>
        <span className="bg-white/50 px-2 py-0.5 rounded-none text-[10px] font-black border border-black/10">{items.length} Pending</span>
      </div>
      <div className="divide-y divide-slate-100">
        {items.length > 0 ? items.map((item, idx) => (
          <div key={idx} className="p-4 hover:bg-slate-50 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">{item.skill.name}</h4>
                <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Target size={10} /> Target: Level {item.requiredLevel}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                        <Clock size={10} /> {item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString() : 'Scheduling...'}
                    </span>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-[9px] font-black px-1.5 py-0.5 border ${item.status === 'OVERDUE' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {item.status}
                </span>
              </div>
            </div>
            {item.assessorId && (
                <p className="text-[10px] text-slate-500 mb-3 flex items-center gap-1">
                    <UserCheck size={10} /> Assessor: {dataService.getUserById(item.assessorId)?.name || 'TBD'}
                </p>
            )}
            {item.status === 'COMPLETED' ? (
                <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-none">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Achieved Proficiency</span>
                        <span className="text-sm font-black text-emerald-900">Level {item.achievedScore}</span>
                    </div>
                    {item.comment && (
                        <blockquote className="text-[11px] text-slate-600 italic border-l-2 border-emerald-200 pl-3 py-1 bg-white/50">
                            "{item.comment}"
                        </blockquote>
                    )}
                </div>
            ) : (
                <button className="w-full mt-2 py-2 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                    {actionLabel} <ChevronRight size={12} />
                </button>
            )}
          </div>
        )) : (
          <div className="p-8 text-center text-slate-400">
            <CheckCircle size={24} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs font-medium italic">No pending tasks in this category.</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500">
      
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-200 pb-8">
        <div className="flex items-center gap-6">
          <div className="relative group">
            <div className="w-24 h-24 bg-slate-100 border border-slate-300 rounded-none overflow-hidden flex items-center justify-center relative">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <UserIcon size={40} className="text-slate-300" />
              )}
            </div>
            <div className="absolute -bottom-2 -right-2 bg-slate-900 text-white p-1.5 border-2 border-white">
              <BadgeCheck size={14} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">
                    {user.name} {user.employeeId && <span className="text-slate-400 font-medium ml-2">ID: {user.employeeId}</span>}
                </h1>
                <span className="bg-blue-50 text-blue-700 text-[10px] font-black px-2 py-0.5 border border-blue-100 uppercase tracking-widest">
                    {user.orgLevel || 'N/A'}
                </span>
            </div>
            <p className="text-slate-500 font-bold uppercase text-xs tracking-widest flex items-center gap-2">
              <Briefcase size={14} className="text-slate-400" /> {jobProfile?.title || 'No Job Profile Asset'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
            <div className="text-right mr-4 hidden md:block">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Direct Manager</p>
                <p className="text-sm font-bold text-slate-900">{(manager && (manager.role !== Role.CEO || user.role === Role.CEO)) ? `${manager.name} (ID: ${manager.employeeId})` : 'N/A'}</p>
            </div>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-white border-2 border-slate-900 text-slate-900 font-black uppercase text-xs tracking-widest hover:bg-slate-900 hover:text-white transition-all">
                <Download size={16} /> Export CV
            </button>
        </div>
      </div>

      {/* ── Professional Identity ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 p-6 animate-in slide-in-from-top-4 duration-500 shadow-sm">
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
      <div className="flex items-center gap-8 border-b border-slate-200 overflow-x-auto no-scrollbar">
        {[
          { id: 'OVERVIEW', label: 'Dashboard Overview', icon: LayoutGrid },
          { id: 'ASSESSMENTS', label: 'Assessment Queue', icon: Zap },
          { id: 'HISTORY', label: 'Evaluation History', icon: HistoryIcon },
          { id: 'CERTIFICATES', label: 'Certificates & Credentials', icon: ShieldCheck },
          { id: 'IDP', label: 'Individual Development Plan', icon: Target },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 pb-4 text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap border-b-2 ${
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
            
            {activeTab === 'ASSESSMENTS' && assessmentQueue && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                    <div className="bg-blue-900 p-8 text-white relative overflow-hidden">
                        <Zap className="absolute -right-8 -bottom-8 w-48 h-48 opacity-10" />
                        <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Assessment Routing Center</h2>
                        <p className="text-blue-200 text-sm max-w-xl">
                            All pending competencies are routed here based on their evaluation method. Complete your scheduled tasks to update your matrix profile.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {renderAssessmentSection(
                            "Written Examinations Center", 
                            assessmentQueue.writtenExams, 
                            Monitor, 
                            "Take Exam", 
                            "bg-amber-50"
                        )}
                        {renderAssessmentSection(
                            "Managerial Interviews", 
                            assessmentQueue.managerialInterviews, 
                            Users, 
                            "Join Interview", 
                            "bg-indigo-50"
                        )}
                        {renderAssessmentSection(
                            "360-Degree Evaluation", 
                            assessmentQueue.evaluations360, 
                            Activity, 
                            "Review Request", 
                            "bg-emerald-50"
                        )}
                        {renderAssessmentSection(
                            "Work Record & Evidence Portal", 
                            assessmentQueue.workRecords, 
                            FileUp, 
                            "Upload Evidence", 
                            "bg-blue-50"
                        )}
                    </div>
                </div>
            )}

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
                                {annualAppraisals.length > 1 && (
                                    <div className="pt-6 border-t border-slate-100">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Historical Record</h4>
                                        <div className="space-y-2">
                                            {annualAppraisals.slice(1).map((appraisal, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 hover:border-slate-300 transition-colors group cursor-pointer" onClick={() => { setHistorySearchTerm('Annual Appraisal'); setActiveTab('HISTORY'); }}>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-none bg-white border border-slate-200 flex items-center justify-center">
                                                            <span className="text-[10px] font-black text-slate-700">{new Date(appraisal.date).getFullYear()}</span>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-800 uppercase">Score: {appraisal.score} / 10</p>
                                                            <p className="text-[9px] text-slate-500 font-bold tracking-widest uppercase">{new Date(appraisal.date).toLocaleDateString()}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-slate-400 group-hover:text-blue-600 transition-colors">
                                                        <Eye size={14} />
                                                    </div>
                                                </div>
                                            ))}
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
                                            onClick={() => {
                                                setHistorySearchTerm(item.skill?.name || '');
                                                setActiveTab('HISTORY');
                                            }}
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
                                    {user.certificates && user.certificates.length > 0 ? user.certificates.slice(0, 3).map(cert => (
                                        <div key={cert.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 relative group">
                                            <div className="flex items-center gap-3">
                                                <Award size={16} className="text-slate-400" />
                                                <div>
                                                    <p className="text-xs font-bold text-slate-800 uppercase">{cert.name}</p>
                                                    <p className="text-[9px] text-slate-500 font-bold tracking-tighter uppercase">{cert.issuer}</p>
                                                </div>
                                            </div>
                                            {/* Status Badge */}
                                            {/* @ts-ignore */}
                                            {cert.status === 'PENDING' ? (
                                                <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 border border-amber-200">PENDING</span>
                                            ) : cert.status === 'REJECTED' ? (
                                                <span className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-0.5 border border-red-200">REJECTED</span>
                                            ) : (
                                                <BadgeCheck size={16} className="text-emerald-500" />
                                            )}
                                        </div>
                                    )) : (
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

                    <div className="flex gap-6 flex-col md:flex-row">
                        {/* Left: Certificate List */}
                        <div className="flex-1 space-y-4">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-xs font-black uppercase text-slate-700 tracking-widest">Your Records</h4>
                                <button onClick={() => setEditingCert({})} className="flex items-center gap-1 text-[10px] font-bold text-blue-600 uppercase hover:underline">
                                    <Plus size={12} /> Add New
                                </button>
                            </div>
                            {user.certificates && user.certificates.length > 0 ? (
                                <div className="space-y-3">
                                    {user.certificates.map(cert => (
                                        <div key={cert.id} className="p-4 bg-white border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer" onClick={() => setEditingCert(cert)}>
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h5 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                                        {cert.name} 
                                                        {cert.fileUrl && <FileUp size={12} className="text-slate-400" />}
                                                    </h5>
                                                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{cert.issuer}</p>
                                                </div>
                                                {/* @ts-ignore */}
                                                {cert.status === 'PENDING' ? (
                                                    <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 border border-amber-200">PENDING</span>
                                                ) : cert.status === 'REJECTED' ? (
                                                    <span className="text-[9px] font-bold bg-red-100 text-red-700 px-2 py-0.5 border border-red-200">REJECTED</span>
                                                ) : (
                                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 border border-emerald-200">APPROVED</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-400">Achieved: {new Date(cert.dateAchieved).toLocaleDateString()}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 bg-white border border-slate-200 text-slate-400">
                                    <p className="text-xs font-medium italic">No certificates recorded.</p>
                                </div>
                            )}
                        </div>

                        {/* Right: Editor Form */}
                        {editingCert && (
                            <div className="flex-1 bg-white border border-slate-200 p-6 h-fit sticky top-6">
                                <h4 className="text-xs font-black uppercase text-slate-700 tracking-widest mb-4 border-b border-slate-100 pb-2">
                                    {editingCert.id ? 'Edit Certificate' : 'New Certificate'}
                                </h4>
                                <form onSubmit={handleSaveCertificate} className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Certificate Name *</label>
                                        <input required type="text" value={editingCert.name || ''} onChange={e => setEditingCert({...editingCert, name: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" placeholder="As it appears on the certificate" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Issuing Institution / University *</label>
                                        <input required type="text" value={editingCert.issuer || ''} onChange={e => setEditingCert({...editingCert, issuer: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Degree (Optional)</label>
                                        <input type="text" value={editingCert.degree || ''} onChange={e => setEditingCert({...editingCert, degree: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" placeholder="e.g., BSc, MSc" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Issue Date *</label>
                                            <input required type="date" value={editingCert.dateAchieved || ''} onChange={e => setEditingCert({...editingCert, dateAchieved: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Expiry Date</label>
                                            <input type="date" value={editingCert.expiryDate || ''} onChange={e => setEditingCert({...editingCert, expiryDate: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Renewal Date (If Applicable)</label>
                                        <input type="date" value={editingCert.renewalDate || ''} onChange={e => setEditingCert({...editingCert, renewalDate: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" />
                                    </div>
                                    
                                    <div className="border border-slate-300 p-4 bg-slate-50 relative">
                                        <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <FileUp size={12} /> Digital Copy
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

                                    <div className="pt-4 flex justify-end gap-2">
                                        <button type="button" onClick={() => setEditingCert(null)} className="px-4 py-2 border border-slate-300 text-slate-600 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50">Cancel</button>
                                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-blue-700">Submit for Approval</button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
});