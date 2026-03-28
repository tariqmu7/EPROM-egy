import React, { useMemo } from 'react';
import { User, JobProfile, Skill, IndividualTrainingPlan, ORG_HIERARCHY_ORDER, ORG_LEVEL_LABELS } from '../types';
import { dataService } from '../services/store';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, BarChart, CartesianGrid, XAxis, YAxis, Bar, Legend, Cell } from 'recharts';
import { AlertCircle, CheckCircle, Award, BookOpen, Activity, TrendingUp, Users, PlayCircle, Calendar, ArrowRight, Download, FileText, Mail, Briefcase, MapPin, User as UserIcon, ShieldCheck, GraduationCap, Target, Zap, Camera } from 'lucide-react';
import { auth } from '../firebase';

interface EmployeeDashboardProps {
  user: User;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = React.memo(({ user }) => {
  const jobProfile = useMemo(() => user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null, [user.jobProfileId]);
  const userLevel = user.orgLevel;
  const department = useMemo(() => dataService.getAllDepartments().find(d => d.id === user.departmentId), [user.departmentId]);
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
          <div className="bg-white rounded-none  border border-slate-300 overflow-hidden">
            <div className="h-32 bg-gradient-to-r from-slate-600 to-slate-700"></div>
            <div className="px-6 pb-6">
              <div className="relative -mt-16 mb-4">
                <div 
                  className={`relative w-32 h-32 rounded-none border-4 border-white bg-slate-100 overflow-hidden group ${isOwner ? 'cursor-pointer' : ''}`}
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
              
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-slate-900">{user.name}</h2>
                <p className="text-slate-800 font-semibold">{jobProfile.title}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="bg-slate-50 text-slate-900 px-2.5 py-0.5 rounded-none font-bold uppercase text-[10px] tracking-wider border border-slate-300">
                    Level {userLevel}
                  </span>
                  <span className="bg-slate-50 text-slate-600 px-2.5 py-0.5 rounded-none font-bold uppercase text-[10px] tracking-wider border border-slate-100">
                    {user.role}
                  </span>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-sm bg-slate-50 flex items-center justify-center text-slate-400">
                    <Mail size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</p>
                    <p className="text-sm font-medium truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-sm bg-slate-50 flex items-center justify-center text-slate-400">
                    <MapPin size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Location</p>
                    <p className="text-sm font-medium truncate">{user.location || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-sm bg-slate-50 flex items-center justify-center text-slate-400">
                    <Briefcase size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</p>
                    <p className="text-sm font-medium truncate">{department?.name || 'Unassigned'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-sm bg-slate-50 flex items-center justify-center text-slate-400">
                    <UserIcon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Direct Manager</p>
                    <p className="text-sm font-medium truncate">{manager?.name || 'N/A'}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 gap-3">
                <button 
                  onClick={handleExportReport}
                  className="flex flex-col items-center justify-center p-3 rounded-none border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-300 hover: transition-all group"
                >
                  <Download size={20} className="text-slate-400 group-hover:text-slate-800 mb-2" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Export CSV</span>
                </button>
                <button 
                  onClick={handleExportPlan}
                  className="flex flex-col items-center justify-center p-3 rounded-none border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-300 hover: transition-all group"
                >
                  <FileText size={20} className="text-slate-400 group-hover:text-slate-800 mb-2" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dev Plan</span>
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
          <div className="bg-white rounded-none  border border-slate-300 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <GraduationCap size={20} className="text-blue-600" />
                <h3 className="font-bold text-slate-900">Career Path & Development Plan</h3>
              </div>
            </div>
            
            <div className="p-6">
              {careerPath && careerPath.nextLevel ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-center mb-6 bg-slate-50 p-4 border border-slate-200">
                    <div>
                      <h4 className="font-bold text-slate-900 text-lg">Next Target Level: {ORG_LEVEL_LABELS[careerPath.nextLevel]}</h4>
                      <p className="text-sm text-slate-600 mt-1">Bridge the competency gaps highlighted below to reach promotional readiness.</p>
                    </div>
                    {careerPath.isReadyForPromotion && (
                      <span className="bg-emerald-100 border border-emerald-300 text-emerald-800 text-sm font-bold px-3 py-1.5 flex items-center gap-2">
                        <CheckCircle size={16} /> Ready for Promotion!
                      </span>
                    )}
                  </div>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 border-r border-slate-100">Competency Requirement</th>
                          <th className="px-4 py-3 text-center w-32 border-r border-slate-100">Required Target Level</th>
                          <th className="px-4 py-3 text-center w-32 border-r border-slate-100">Your Current Score</th>
                          <th className="px-4 py-3 text-center w-32">Development Gap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {careerPath.requirements.map(req => (
                          <tr key={req.skillId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-medium text-slate-900 border-r border-slate-100">{req.skillName}</td>
                            <td className="px-4 py-3 text-center font-bold text-slate-700 border-r border-slate-100">{req.requiredScore}</td>
                            <td className={`px-4 py-3 text-center font-bold border-r border-slate-100 ${req.currentScore >= req.requiredScore ? 'text-emerald-600' : 'text-blue-600'}`}>
                              {req.currentScore > 0 ? req.currentScore : '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {req.gap > 0 ? (
                                <span className="bg-rose-50 text-rose-700 font-bold px-2 py-1 border border-rose-200 text-xs inline-block min-w-8">
                                  {req.gap}
                                </span>
                              ) : (
                                <span className="text-emerald-500"><CheckCircle size={16} className="mx-auto" /></span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-none flex items-center justify-center mx-auto mb-4">
                    <Activity size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">Career Path Complete</h4>
                  <p className="text-slate-500 text-sm mt-1">You are currently at or above the maximum hierarchy level defined for tracking.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});