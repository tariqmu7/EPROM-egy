import React, { useMemo } from 'react';
import { User, JobProfile, Skill } from '../types';
import { dataService } from '../services/store';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, BarChart, CartesianGrid, XAxis, YAxis, Bar, Legend, Cell } from 'recharts';
import { AlertCircle, CheckCircle, Award, BookOpen, Activity, TrendingUp, Users, PlayCircle, Calendar, ArrowRight, Download, FileText, Mail, Briefcase, MapPin, User as UserIcon, ShieldCheck } from 'lucide-react';

interface EmployeeDashboardProps {
  user: User;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = React.memo(({ user }) => {
  const jobProfile = useMemo(() => user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null, [user.jobProfileId]);
  const userLevel = user.orgLevel;
  const department = useMemo(() => dataService.getAllDepartments().find(d => d.id === user.departmentId), [user.departmentId]);
  const manager = useMemo(() => user.managerId ? dataService.getCurrentUser(user.managerId) : null, [user.managerId]);

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
  
  if (levelRequirements.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-700">
             <CheckCircle size={48} className="mb-4 text-slate-500" />
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
      gap: req.requiredLevel - currentScore
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
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-700"></div>
            <div className="px-6 pb-6">
              <div className="relative -mt-16 mb-4">
                <div className="w-32 h-32 rounded-2xl border-4 border-white bg-slate-100 overflow-hidden shadow-md">
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                </div>
              </div>
              
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-slate-900">{user.name}</h2>
                <p className="text-blue-600 font-semibold">{jobProfile.title}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider border border-blue-100">
                    Level {userLevel}
                  </span>
                  <span className="bg-slate-50 text-slate-600 px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] tracking-wider border border-slate-100">
                    {user.role}
                  </span>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Mail size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Email Address</p>
                    <p className="text-sm font-medium truncate">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <MapPin size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Location</p>
                    <p className="text-sm font-medium truncate">{user.location || 'N/A'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
                    <Briefcase size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Department</p>
                    <p className="text-sm font-medium truncate">{department?.name || 'Unassigned'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-600">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400">
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
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-blue-200 hover:shadow-sm transition-all group"
                >
                  <Download size={20} className="text-slate-400 group-hover:text-blue-600 mb-2" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Export CSV</span>
                </button>
                <button 
                  onClick={handleExportPlan}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-blue-200 hover:shadow-sm transition-all group"
                >
                  <FileText size={20} className="text-slate-400 group-hover:text-blue-600 mb-2" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dev Plan</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats Mini Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Compliance</p>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold text-slate-900">
                  {skillAnalysis.length > 0 ? Math.round((compliant.length / skillAnalysis.length) * 100) : 0}%
                </span>
                <TrendingUp size={16} className="text-emerald-500 mb-1" />
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gaps</p>
              <div className="flex items-end gap-1">
                <span className="text-2xl font-bold text-slate-900">{gaps.length}</span>
                <AlertCircle size={16} className="text-amber-500 mb-1" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Content Area */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Certificates Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Award size={20} className="text-blue-600" />
                <h3 className="font-bold text-slate-900">Certificates Achieved</h3>
              </div>
              <span className="text-xs font-medium text-slate-500">{user.certificates?.length || 0} Total</span>
            </div>
            
            {user.certificates && user.certificates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {user.certificates.map(cert => (
                  <div key={cert.id} className="p-4 border border-slate-100 rounded-xl bg-slate-50/50 flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
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
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Award size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm text-slate-500 font-medium">No professional certificates recorded yet.</p>
              </div>
            )}
          </div>

          {/* Skill Profile Section */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Activity size={20} className="text-blue-600" />
                <h3 className="font-bold text-slate-900">Competency Profile</h3>
              </div>
              <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="text-slate-500">Current</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-slate-200"></div>
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
                      <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">{s.skill?.category}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-900">{s.current} / {s.required}</span>
                    </div>
                  </div>
                  <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="absolute top-0 left-0 h-full bg-slate-200 rounded-full" 
                      style={{ width: `${(s.required / 5) * 100}%` }}
                    ></div>
                    <div 
                      className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${s.current >= s.required ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                      style={{ width: `${(s.current / 5) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Plan Section */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-600" />
                <h3 className="font-bold text-slate-900">Development Roadmap</h3>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Generated</span>
            </div>
            
            <div className="p-6">
              {recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec, idx) => (
                    <div key={idx} className="group p-4 rounded-xl border border-slate-100 bg-slate-50/30 hover:bg-white hover:border-blue-100 hover:shadow-md transition-all">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${rec.isCritical ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                            {rec.isCritical ? <AlertCircle size={20} /> : <TrendingUp size={20} />}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">{rec.skillName}</h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{rec.category}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-slate-100 text-slate-600">
                            Lvl {rec.currentLevel} → {rec.targetLevel}
                          </span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-xs text-slate-600 leading-relaxed">{rec.description}</p>
                          {rec.certs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {rec.certs.map((cert, cIdx) => (
                                <span key={cIdx} className="text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Award size={10} /> {cert}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-2">
                          {rec.suggestedActions.map((action, aIdx) => {
                            const ActionIcon = action.icon;
                            return (
                              <div key={aIdx} className="flex items-center gap-3 p-2 rounded-lg bg-white border border-slate-100">
                                <div className="w-6 h-6 rounded bg-slate-50 flex items-center justify-center text-blue-600">
                                  <ActionIcon size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-bold text-slate-800 truncate">{action.label}</p>
                                  <p className="text-[9px] text-slate-400 uppercase font-bold">{action.type} • {action.duration}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} />
                  </div>
                  <h4 className="text-lg font-bold text-slate-900">Peak Performance</h4>
                  <p className="text-slate-500 text-sm mt-1">You've mastered all competencies for this level. Keep it up!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});