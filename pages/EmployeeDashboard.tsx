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
  MessageCircle
} from 'lucide-react';
import { auth } from '../firebase';

interface EmployeeDashboardProps {
  user: User;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = React.memo(({ user }) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'ASSESSMENTS' | 'IDP' | 'CAREER' | 'HISTORY'>('OVERVIEW');
  const [assessmentQueue, setAssessmentQueue] = useState<any>(null);

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
          { id: 'IDP', label: 'Individual Development Plan', icon: Target },
          { id: 'CAREER', label: 'Career Progression', icon: GraduationCap },
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
                        <p className="text-3xl font-black text-amber-500">{gaps.length}</p>
                    </div>
                </div>
                <div className="pt-4 border-t border-white/10">
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Succession Pipeline</p>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/10">
                            <div className="h-full bg-blue-500" style={{ width: '40%' }}></div>
                        </div>
                        <span className="text-[10px] font-black uppercase">Developing</span>
                    </div>
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
                    <AssessmentHistoryLog currentUser={user} />
                </div>
            )}

            {activeTab === 'OVERVIEW' && (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="bg-white border border-slate-200 p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-2">
                                    <ShieldCheck size={18} className="text-emerald-500" /> Professional Certificates
                                </h3>
                                <button className="text-[10px] font-bold text-blue-600 hover:underline uppercase">Manage</button>
                            </div>
                            <div className="space-y-4">
                                {user.certificates && user.certificates.length > 0 ? user.certificates.slice(0, 3).map(cert => (
                                    <div key={cert.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100">
                                        <div className="flex items-center gap-3">
                                            <Award size={16} className="text-slate-400" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-800 uppercase">{cert.name}</p>
                                                <p className="text-[9px] text-slate-500 font-bold tracking-tighter uppercase">{cert.issuer}</p>
                                            </div>
                                        </div>
                                        <BadgeCheck size={16} className="text-emerald-500" />
                                    </div>
                                )) : (
                                    <p className="text-xs text-slate-400 italic py-4">No certificates currently on record.</p>
                                )}
                            </div>
                         </div>

                         <div className="bg-white border border-slate-200 p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest flex items-center gap-2">
                                    <TrendingUp size={18} className="text-blue-600" /> Active Skill Gaps
                                </h3>
                                <button className="text-[10px] font-bold text-blue-600 hover:underline uppercase">View Plan</button>
                            </div>
                            <div className="space-y-4">
                                {gaps.slice(0, 4).map((gap, idx) => (
                                    <div key={idx} className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-[11px] font-bold text-slate-800 uppercase">{gap.skill?.name}</span>
                                            <span className="text-[10px] font-black text-amber-600">-{gap.gap} Level</span>
                                        </div>
                                        <div className="h-1 bg-slate-100">
                                            <div className="h-full bg-amber-400" style={{ width: `${(gap.current / gap.required) * 100}%` }}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
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

            {activeTab === 'CAREER' && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                    <div className="bg-slate-900 p-8 text-white">
                        <GraduationCap size={32} className="mb-4 text-blue-400" />
                        <h2 className="text-2xl font-black uppercase tracking-tight mb-2">Succession Roadmap</h2>
                        <p className="text-slate-400 text-sm max-w-xl">
                            Visualizing your professional trajectory within the EPROM organizational hierarchy.
                        </p>
                    </div>
                    
                    <div className="space-y-6">
                        {ORG_HIERARCHY_ORDER.slice(0, ORG_HIERARCHY_ORDER.indexOf(user.orgLevel || 'FR') + 1).reverse().map((level, idx) => {
                            const isCurrent = level === user.orgLevel;
                            const isPast = ORG_HIERARCHY_ORDER.indexOf(level) > ORG_HIERARCHY_ORDER.indexOf(user.orgLevel || 'FR');
                            
                            return (
                                <div key={level} className={`p-6 border-l-4 transition-all ${isCurrent ? 'bg-blue-50 border-blue-600' : 'bg-white border-slate-200 opacity-60'}`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 flex items-center justify-center font-black text-xs border ${isCurrent ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-200'}`}>
                                                L{ORG_HIERARCHY_ORDER.indexOf(level)}
                                            </div>
                                            <div>
                                                <h4 className={`font-black uppercase text-sm tracking-tight ${isCurrent ? 'text-blue-900' : 'text-slate-900'}`}>
                                                    {ORG_LEVEL_LABELS[level]}
                                                </h4>
                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{isCurrent ? 'Current Assignment' : 'Historical Milestone'}</p>
                                            </div>
                                        </div>
                                        {isCurrent && <BadgeCheck className="text-blue-600" />}
                                    </div>
                                </div>
                            );
                        })}
                        
                        <div className="p-8 border-2 border-dashed border-slate-300 text-center space-y-4">
                             <TrendingUp className="text-slate-300 mx-auto" size={32} />
                             <div>
                                <h4 className="font-black uppercase text-slate-400 text-sm tracking-widest">Next Career Target</h4>
                                <p className="text-slate-400 text-xs italic">Complete the assessment queue to unlock the next level requirements.</p>
                             </div>
                             <button className="px-6 py-2 bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest cursor-not-allowed">Locked</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
});