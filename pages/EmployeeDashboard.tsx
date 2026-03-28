import React, { useMemo } from 'react';
import { User, JobProfile, Skill, IndividualTrainingPlan, ORG_HIERARCHY_ORDER, ORG_LEVEL_LABELS } from '../types';
import { dataService } from '../services/store';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, BarChart, CartesianGrid, XAxis, YAxis, Bar, Legend, Cell } from 'recharts';
import { AlertCircle, CheckCircle, Award, BookOpen, Activity, TrendingUp, Users, PlayCircle, Calendar, ArrowRight, Download, FileText, Mail, Briefcase, MapPin, User as UserIcon, ShieldCheck, GraduationCap, Target, Zap, Camera, Phone, MessageSquare, Building, BadgeCheck, Clock, XCircle, Layers, Shield, LayoutGrid, UserCheck, Building2 } from 'lucide-react';
import { auth } from '../firebase';

interface EmployeeDashboardProps {
  user: User;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = React.memo(({ user }) => {
  const jobProfile = useMemo(() => user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null, [user.jobProfileId]);
  const userLevel = user.orgLevel;
  
  // Department Hierarchy
  const depts = useMemo(() => dataService.getAllDepartments(), []);
  const directDepartment = useMemo(() => depts.find(d => d.id === user.departmentId), [depts, user.departmentId]);
  const mainDepartment = useMemo(() => {
    if (!user.departmentId) return null;
    const findRoot = (id: string): any => {
      const d = depts.find(dept => dept.id === id);
      if (!d) return null;
      if (!d.parentId) return d;
      return findRoot(d.parentId);
    };
    return findRoot(user.departmentId);
  }, [depts, user.departmentId]);

  const manager = useMemo(() => user.managerId ? dataService.getUserById(user.managerId) : null, [user.managerId]);

  const itp = useMemo(() => dataService.generateIndividualTrainingPlan(user.id), [user.id]);

  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const canEditAvatar = auth.currentUser?.uid === user.id || dataService.isManager(user); // Also let managers edit? Actually user means the employee. We'll stick to uid match. Let's just use auth.currentUser?.uid === user.id
  const isOwner = auth.currentUser?.uid === user.id;

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await dataService.uploadAvatar(user.id, file);
    } catch (err) {
      console.error(err);
      alert('Failed to upload avatar.');
    } finally {
      setIsUploading(false);
    }
  };

  if (!jobProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-600">
         <Activity size={48} className="mb-4 text-slate-500" />
         <p className="font-medium">No Job Profile assigned. Contact Administration.</p>
      </div>
    );
  }

  if (!userLevel) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-700">
        <Activity size={48} className="mb-4 text-slate-500" />
        <p className="font-medium">No Organization Level assigned. Contact Administration.</p>
      </div>
    );
  }

  const levelRequirements = jobProfile.requirements[userLevel] || [];
  
  if (!Array.isArray(levelRequirements) || levelRequirements.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-700">
             <CheckCircle size={48} className="mb-4 text-emerald-500" />
            <p className="font-medium">No specific competency requirements defined for level: <span className="font-bold text-slate-700">{userLevel}</span>.</p>
        </div>
      );
  }

  // Calculate Gaps
  const skillAnalysis = useMemo(() => levelRequirements.map(req => {
    const skillDetails = dataService.getSkill(req.skillId);
    const currentScore = dataService.getUserSkillScore(user.id, req.skillId);
    return {
      skill: skillDetails,
      required: req.requiredLevel,
      current: currentScore,
      gap: Math.max(0, req.requiredLevel - currentScore)
    };
  }), [levelRequirements, user.id]);

  const gaps = useMemo(() => skillAnalysis.filter(s => s.gap > 0), [skillAnalysis]);
  const compliant = useMemo(() => skillAnalysis.filter(s => s.gap <= 0), [skillAnalysis]);

  const recommendations = useMemo(() => gaps.map(g => {
    const nextLevel = g.current + 1;
    const levelDetails = g.skill?.levels[nextLevel <= 5 ? nextLevel : 5];
    const isCritical = g.gap > 1;

    // Mock specific actions based on skill category
    const actions = [];
    if (g.skill?.category === 'Safety') {
        actions.push({ type: 'TRAINING', label: 'HSE Advanced Module', duration: '2 Days', icon: BookOpen });
        actions.push({ type: 'OJT', label: 'Site Safety Walkthrough', duration: '4 Hours', icon: Activity });
    } else if (g.skill?.category === 'Technical') {
        actions.push({ type: 'TRAINING', label: 'Technical Certification Course', duration: '5 Days', icon: PlayCircle });
        actions.push({ type: 'MENTORING', label: 'Shadow Senior Engineer', duration: '1 Week', icon: Users });
    } else {
        actions.push({ type: 'READING', label: 'Management SOPs', duration: '2 Hours', icon: BookOpen });
    }

    return {
      skillName: g.skill?.name,
      category: g.skill?.category,
      currentLevel: g.current,
      targetLevel: nextLevel,
      gapSize: g.gap,
      isCritical,
      certs: levelDetails?.requiredCertificates || [],
      description: levelDetails?.description,
      suggestedActions: actions
    };
  }), [gaps]);

  const careerPath = useMemo(() => dataService.generateCareerPath(user.id), [user.id]);

  // Export Handlers
  const handleExportReport = () => {
    const headers = ['Skill Name', 'Category', 'Required Level', 'Current Level', 'Gap', 'Status'];
    const rows = skillAnalysis.map(s => [
      s.skill?.name || 'Unknown',
      s.skill?.category || 'Unknown',
      s.required.toString(),
      s.current.toString(),
      s.gap.toString(),
      s.gap > 0 ? 'Gap' : 'Compliant'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Competency_Report_${user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportPlan = () => {
    const headers = ['Skill', 'Target Level', 'Gap Size', 'Action Type', 'Action Item', 'Duration'];
    const rows: string[][] = [];

    recommendations.forEach(rec => {
        rec.suggestedActions.forEach(action => {
            rows.push([
                rec.skillName || 'Unknown',
                rec.targetLevel.toString(),
                rec.gapSize.toString(),
                action.type,
                action.label,
                action.duration
            ]);
        });
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Development_Plan_${user.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Profile Info */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-none border border-slate-300 overflow-hidden shadow-sm">
            {/* Header / Avatar */}
            <div className="h-32 bg-slate-900 flex items-end justify-end p-4">
              <div className="flex gap-2 mb-2">
                {user.status === 'ACTIVE' ? (
                  <span className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-3 py-1 border border-emerald-500/20 backdrop-blur-md uppercase tracking-widest flex items-center gap-1.5">
                    <BadgeCheck size={12} /> Active
                  </span>
                ) : user.status === 'REJECTED' ? (
                  <span className="bg-red-500/10 text-red-400 text-[10px] font-bold px-3 py-1 border border-red-500/20 backdrop-blur-md uppercase tracking-widest flex items-center gap-1.5">
                    <XCircle size={12} /> Deactivated
                  </span>
                ) : (
                  <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-3 py-1 border border-amber-500/20 backdrop-blur-md uppercase tracking-widest flex items-center gap-1.5">
                    <Clock size={12} /> Pending Approval
                  </span>
                )}
              </div>
            </div>
            
            <div className="px-8 pb-8">
              <div className="relative -mt-16 mb-6">
                <div 
                  className={`relative w-32 h-32 rounded-none border-4 border-white bg-slate-100 overflow-hidden group shadow-lg ${isOwner ? 'cursor-pointer' : ''}`}
                  onClick={() => isOwner && fileInputRef.current?.click()}
                >
                  <img src={user.avatarUrl} alt={user.name} className={`w-full h-full object-cover transition-opacity ${isUploading ? 'opacity-50' : 'opacity-100'}`} />
                  
                  {isOwner && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera size={24} className="text-white" />
                    </div>
                  )}
                  {isUploading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>
                {isOwner && (
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    ref={fileInputRef} 
                    onChange={handleAvatarUpload} 
                  />
                )}
              </div>
              
              <div className="space-y-1 mb-8">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">{user.name}</h2>
                <div className="flex items-center gap-2 text-slate-600 font-bold uppercase text-[11px] tracking-widest">
                  <Briefcase size={14} className="text-slate-400" /> {jobProfile?.title || 'No Job Profile Asset'}
                </div>
              </div>

              {/* Information Sections */}
              <div className="space-y-8">
                {/* 1. Professional Assignment */}
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 border-b border-slate-100 pb-2">Professional Assignment</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between bg-slate-50 p-3 border border-slate-100">
                      <div className="flex items-center gap-3">
                        <Layers size={16} className="text-blue-600" />
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">Hierarchy</span>
                      </div>
                      <span className="bg-blue-600 text-white px-2 py-0.5 text-[10px] font-black tracking-widest">{userLevel}</span>
                    </div>
                    <div className="flex items-center justify-between bg-slate-50 p-3 border border-slate-100">
                      <div className="flex items-center gap-3">
                        <Shield size={16} className="text-slate-500" />
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-widest">System Role</span>
                      </div>
                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{user.role}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Contact Information */}
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 border-b border-slate-100 pb-2">Contact Information</h4>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 group cursor-pointer hover:bg-slate-50 p-1 transition-colors">
                      <div className="w-8 h-8 bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                        <Mail size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Email</p>
                        <p className="text-sm font-bold text-slate-800 truncate">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 group cursor-pointer hover:bg-slate-50 p-1 transition-colors">
                      <div className="w-8 h-8 bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                        <Phone size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Phone</p>
                        <p className="text-sm font-bold text-slate-800 truncate">{user.phone || 'Not Provided'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 group cursor-pointer hover:bg-slate-50 p-1 transition-colors">
                      <div className="w-8 h-8 bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                        <MessageSquare size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">WhatsApp</p>
                        <p className="text-sm font-bold text-emerald-700 truncate">{user.whatsapp || 'Not Provided'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Organizational Chart */}
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 border-b border-slate-100 pb-2">Organizational Chart</h4>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                        <Building size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Main Department</p>
                        <p className="text-sm font-bold text-slate-800 truncate uppercase">{mainDepartment?.name || 'Unassigned'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                        <LayoutGrid size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Direct Section</p>
                        <p className="text-sm font-bold text-slate-800 truncate uppercase">{directDepartment?.name || 'No Direct Section'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                        <UserCheck size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Direct Manager</p>
                        <p className="text-sm font-bold text-slate-800 truncate uppercase">{manager?.name || 'No Direct Manager'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. Project Assignment */}
                <div>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 border-b border-slate-100 pb-2">Project Assignment</h4>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                        <Building2 size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Project Name</p>
                        <p className="text-sm font-bold text-slate-800 truncate uppercase">{user.projectName || 'Unassigned'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-8 h-8 bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                        <MapPin size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Project Location</p>
                        <p className="text-sm font-bold text-slate-800 truncate uppercase">{user.location || 'Site Location General'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-10 pt-8 border-t border-slate-100 grid grid-cols-2 gap-4">
                <button 
                  onClick={handleExportReport}
                  className="flex items-center justify-center gap-3 p-3 bg-white border border-slate-200 text-slate-600 hover:border-slate-400 hover:text-slate-900 transition-all font-bold uppercase text-[9px] tracking-widest"
                >
                  <Download size={14} /> Full Report
                </button>
                <button 
                  onClick={handleExportPlan}
                  className="flex items-center justify-center gap-3 p-3 bg-slate-900 text-white hover:bg-slate-800 transition-all font-bold uppercase text-[9px] tracking-widest"
                >
                  <FileText size={14} /> Dev Plan
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats Mini Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-none  border border-slate-300">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Compliance</p>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold text-slate-900">
                  {skillAnalysis.length > 0 ? Math.round((compliant.length / skillAnalysis.length) * 100) : 0}%
                </span>
                <TrendingUp size={16} className="text-emerald-500 mb-1" />
              </div>
            </div>
            <div className="bg-white p-4 rounded-none  border border-slate-300">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gaps</p>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold text-slate-900">{gaps.length}</span>
                <AlertCircle size={16} className="text-slate-500 mb-1" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Content Area */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Certificates Section */}
          <div className="bg-white p-6 rounded-none  border border-slate-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Award size={20} className="text-slate-800" />
                <h3 className="font-bold text-slate-900">Certificates Achieved</h3>
              </div>
              <span className="text-xs font-medium text-slate-500">{user.certificates?.length || 0} Total</span>
            </div>
            
            {user.certificates && user.certificates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {user.certificates.map(cert => (
                  <div key={cert.id} className="p-4 border border-slate-100 rounded-none bg-slate-50/50 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-sm bg-slate-200 flex items-center justify-center text-slate-800 shrink-0">
                      <ShieldCheck size={20} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 text-sm truncate">{cert.name}</h4>
                      <p className="text-xs text-slate-500 font-medium">{cert.issuer}</p>
                      <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">{new Date(cert.dateAchieved).getFullYear()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-none border border-dashed border-slate-300">
                <Award size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-500 font-medium">No professional certificates recorded yet.</p>
              </div>
            )}
          </div>

          {/* Job Fit Analysis Section */}
          <div className="bg-white p-6 rounded-none  border border-slate-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Target size={20} className="text-blue-600" />
                <h3 className="font-bold text-slate-900">Job Fit Analysis</h3>
              </div>
              <div className="px-3 py-1 rounded-none bg-slate-50 text-slate-700 text-xs font-bold border border-slate-100">
                {skillAnalysis.length > 0 ? Math.round((compliant.length / skillAnalysis.length) * 100) : 0}% Match
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-none bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-500">
                  <ShieldCheck size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Certificates</span>
                </div>
                <p className="text-xl font-bold text-slate-900">{user.certificates?.length || 0}</p>
                <p className="text-[10px] text-slate-500 mt-1">Professional Validations</p>
              </div>
              <div className="p-4 rounded-none bg-slate-50 border border-slate-100">
                <div className="flex items-center gap-2 mb-2 text-slate-500">
                  <Zap size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Assessments</span>
                </div>
                <p className="text-xl font-bold text-slate-900">{dataService.getAssessments({ subjectId: user.id }).length}</p>
                <p className="text-[10px] text-slate-500 mt-1">Measurable Evaluations</p>
              </div>
            </div>
          </div>

          {/* Skill Profile Section */}
          <div className="bg-white p-6 rounded-none  border border-slate-300">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={20} className="text-slate-800" />
                <h3 className="font-bold text-slate-900">Competency Profile</h3>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-none bg-slate-800"></div>
                  <span className="text-slate-500">Current</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-none bg-slate-200"></div>
                  <span className="text-slate-500">Target</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {skillAnalysis.map((s, idx) => (
                <div key={idx} className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">{s.skill?.name}</h4>
                      <p className="text-[10px] font-bold text-slate-800 uppercase tracking-wider">{s.skill?.category}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-900">{s.current} / {s.required}</span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-slate-100 rounded-none overflow-hidden">
                    <div 
                      className="absolute top-0 left-0 h-full bg-slate-200 rounded-none" 
                      style={{ width: `${(s.required / 5) * 100}%` }}
                    ></div>
                    <div 
                      className={`absolute top-0 left-0 h-full rounded-none transition-all duration-500 ${s.current >= s.required ? 'bg-emerald-500' : 'bg-blue-600'}`} 
                      style={{ width: `${(s.current / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Individual Training Plan (ITP) Section */}
          <div className="bg-white rounded-none  border border-slate-300 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <TrendingUp size={20} className="text-slate-800" />
                <h3 className="font-bold text-slate-900">Individual Training Plan (ITP)</h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Plan ID: {itp?.userId.split('_')[1] || 'NEW'}</span>
                <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-none uppercase tracking-wider">Active</span>
              </div>
            </div>
            
            <div className="p-6">
              {itp && itp.recommendations.length > 0 ? (
                <div className="space-y-6">
                  {itp.recommendations.map((rec, idx) => (
                    <div key={idx} className="relative pl-6 border-l-2 border-slate-100 pb-6 last:pb-0">
                      <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-none border-2 border-white  ${rec.priority === 'HIGH' ? 'bg-emerald-500' : 'bg-blue-600'}`}></div>
                      
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900">{rec.skillName}</h4>
                            {rec.priority === 'HIGH' && (
                              <span className="bg-slate-50 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-none border border-slate-100 uppercase tracking-tighter">Critical Gap</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">Recommendation: {rec.recommendation}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gap: {rec.gap}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 text-slate-600 rounded-none flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">No Training Required</h4>
                  <p className="text-slate-500 text-sm mt-1">You currently meet all competency requirements for your role.</p>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-center">
               <p className="text-[10px] text-slate-400 font-medium italic">Generated based on latest job profile and assessment data on {itp ? new Date(itp.generatedAt).toLocaleDateString() : 'N/A'}</p>
            </div>
          </div>

          {/* Career Path & Development Plan Section */}
          <div className="bg-white rounded-none border border-slate-300 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <GraduationCap size={20} className="text-blue-600" />
                <h3 className="font-bold text-slate-900 uppercase tracking-tight">Career Path and Development Plan</h3>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Succession Readiness</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black text-slate-900">
                    {(() => {
                      const totalSteps = ORG_HIERARCHY_ORDER.indexOf(user.orgLevel || 'FR');
                      const completedSteps = careerPath?.roadmap.filter(r => r.isReady).length || 0;
                      return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 100;
                    })()}%
                  </span>
                  <div className="w-24 h-2 bg-slate-100 rounded-none overflow-hidden border border-slate-200">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-1000" 
                      style={{ width: `${(() => {
                        const totalSteps = ORG_HIERARCHY_ORDER.indexOf(user.orgLevel || 'FR');
                        const completedSteps = careerPath?.roadmap.filter(r => r.isReady).length || 0;
                        return totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 100;
                      })()}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-8">
              {careerPath && careerPath.roadmap.length > 0 ? (
                <div className="relative space-y-12">
                  {/* Vertical Line */}
                  <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100"></div>

                  {careerPath.roadmap.map((milestone, mIdx) => {
                    const isNextTarget = mIdx === 0;
                    const isReady = milestone.isReady;
                    const isDefined = milestone.isDefined;

                    return (
                      <div key={milestone.level} className="relative pl-12">
                        {/* Milestone Marker */}
                        <div className={`absolute left-0 top-0 w-10 h-10 rounded-none border-2 flex items-center justify-center z-10 transition-all duration-500 bg-white ${
                          isReady ? 'border-emerald-500 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' : 
                          isNextTarget ? 'border-blue-600 text-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.2)]' : 
                          'border-slate-200 text-slate-300'
                        }`}>
                          {isReady ? <BadgeCheck size={20} /> : <Target size={18} />}
                        </div>

                        <div className={`p-6 border transition-all duration-500 ${
                          isNextTarget ? 'bg-slate-50 border-blue-200 shadow-sm' : 
                          'bg-white border-slate-100'
                        }`}>
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                            <div>
                              <div className="flex items-center gap-3 mb-1">
                                <h4 className={`text-lg font-black tracking-tight uppercase ${isNextTarget ? 'text-slate-900' : 'text-slate-600'}`}>
                                  {ORG_LEVEL_LABELS[milestone.level]}
                                </h4>
                                {isReady && (
                                  <span className="bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 uppercase tracking-widest">Readiness Verified</span>
                                )}
                                {isNextTarget && !isReady && (
                                  <span className="bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 uppercase tracking-widest animate-pulse">Current Target</span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 font-medium tracking-wide">
                                {isDefined ? `Official competency standards for ${ORG_LEVEL_LABELS[milestone.level]} within your General Department track.` : `Future succession benchmark for the General Department management path.`}
                              </p>
                            </div>
                            {!isReady && isDefined && (
                              <div className="bg-white px-4 py-2 border border-slate-200 flex flex-col items-center shrink-0">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Total Gaps</span>
                                <span className="text-lg font-black text-rose-600">{milestone.requirements.filter(r => r.gap > 0).length}</span>
                              </div>
                            )}
                          </div>

                          {isDefined ? (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="text-[10px] font-black text-slate-400 uppercase bg-white border-b border-slate-100">
                                  <tr>
                                    <th className="px-4 py-2">Competency Requirement</th>
                                    <th className="px-4 py-2 text-center w-24">Target</th>
                                    <th className="px-4 py-2 text-center w-24">Current</th>
                                    <th className="px-4 py-2 text-center w-24">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                  {milestone.requirements.map(req => (
                                    <tr key={req.skillId} className="group hover:bg-slate-100/50 transition-colors">
                                      <td className="px-4 py-3 font-bold text-slate-700">{req.skillName}</td>
                                      <td className="px-4 py-3 text-center font-black text-slate-900">{req.requiredScore}</td>
                                      <td className={`px-4 py-3 text-center font-black ${req.currentScore >= req.requiredScore ? 'text-emerald-600' : 'text-blue-600'}`}>
                                        {req.currentScore || '-'}
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        {req.gap > 0 ? (
                                          <div className="flex flex-col items-center">
                                            <span className="text-rose-600 font-black">-{req.gap}</span>
                                          </div>
                                        ) : (
                                          <CheckCircle size={14} className="mx-auto text-emerald-500" />
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="py-4 px-4 bg-slate-50 border border-dashed border-slate-200 text-center">
                              <p className="text-xs text-slate-400 font-medium italic">General competency framework applies. Specific technical requirements not yet mapped for this level.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <div className="w-20 h-20 bg-slate-50 text-slate-400 rounded-none flex items-center justify-center mx-auto mb-6">
                    <BadgeCheck size={40} />
                  </div>
                  <h4 className="text-xl font-black text-slate-900 uppercase tracking-tight">Executive Status Achieved</h4>
                  <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">You have reached the General Manager level. Your journey now focuses on organizational strategic goals and leadership excellence.</p>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-200">
               <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">Official Succession Analysis & Development Path</p>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 border-2 border-emerald-500 bg-white"></div>
                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Ready</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 border-2 border-blue-600 bg-white"></div>
                       <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter">Current Target</span>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});