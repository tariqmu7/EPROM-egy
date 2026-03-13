import React, { useState, useMemo, useCallback } from 'react';
import { User, Role, JobProfile, OrgLevel } from '../types';
import { dataService } from '../services/store';
import { EmployeeDashboard } from './EmployeeDashboard';
import { CompetencyMatrix } from './CompetencyMatrix';
import { SupervisorApproval } from './SupervisorApproval';
import { Users, ChevronRight, AlertCircle, CheckCircle, TrendingUp, ArrowLeft, Briefcase, BarChart2, Shield, Search, Award, Mail } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

interface ManagerDashboardProps {
  user: User;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = React.memo(({ user }) => {
  const [selectedMember, setSelectedMember] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<'TEAM' | 'JOBS' | 'TALENT_SEARCH' | 'MATRIX' | 'APPROVALS'>('TEAM');
  const [searchQuery, setSearchQuery] = useState('');
  
  const subordinates = useMemo(() => dataService.getSubordinates(user.id), [user.id]);
  
  // Check if user has access to Talent Search (DH and above)
  const canSearchTalent = useMemo(() => {
    const searchLevels: OrgLevel[] = ['GM', 'GAM', 'DM', 'DH'];
    return searchLevels.includes(user.orgLevel as OrgLevel) || user.role === Role.ADMIN;
  }, [user.orgLevel, user.role]);

  // Get jobs managed by this manager (based on department)
  // In a real app, we might have a more direct link, but here we use departmentId
  const managedJobs = useMemo(() => dataService.getAllJobs().filter(job => job.departmentId === user.departmentId), [user.departmentId]);

  const getMemberStats = useCallback((member: User) => {
    const jobProfile = member.jobProfileId ? dataService.getJobProfile(member.jobProfileId) : null;
    if (!jobProfile || !member.orgLevel) return { compliance: 0, gaps: 0 };

    const requirements = jobProfile.requirements[member.orgLevel] || [];
    if (requirements.length === 0) return { compliance: 0, gaps: 0 };

    const analysis = requirements.map(req => {
        const score = dataService.getUserSkillScore(member.id, req.skillId);
        return { gap: req.requiredLevel - score };
    });

    const gaps = analysis.filter(a => a.gap > 0).length;
    const compliant = analysis.filter(a => a.gap <= 0).length;
    const compliance = Math.round((compliant / analysis.length) * 100);

    return { compliance, gaps };
  }, []);

  if (selectedMember) {
    return (
      <div className="animate-in slide-in-from-right duration-300">
        <button 
          onClick={() => setSelectedMember(null)}
          className="mb-6 flex items-center gap-2 text-slate-600 hover:text-blue-700 transition-colors font-medium text-sm"
        >
          <ArrowLeft size={16} /> Back to Team Overview
        </button>
        <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 mb-6 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-white border border-slate-200 overflow-hidden shadow-sm">
                <img src={selectedMember.avatarUrl} alt={selectedMember.name} className="w-full h-full object-cover" />
            </div>
            <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedMember.name}</h3>
                <p className="text-sm text-slate-700">{dataService.getJobProfile(selectedMember.jobProfileId || '')?.title || 'No Job Profile'}</p>
            </div>
            <div className="ml-auto">
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                    Viewing Profile
                </span>
            </div>
        </div>
        <EmployeeDashboard user={selectedMember} />
      </div>
    );
  }

  const renderJobProfiles = () => {
    return (
        <div className="space-y-8">
            {managedJobs.map(job => {
                // Get employees in this job
                const employeesInJob = subordinates.filter(sub => sub.jobProfileId === job.id);
                
                // Calculate stats for chart
                const chartData = employeesInJob.map(emp => {
                    const stats = getMemberStats(emp);
                    return {
                        name: emp.name.split(' ')[0], // First name for chart
                        Compliance: stats.compliance,
                        Gaps: stats.gaps
                    };
                });

                return (
                    <div key={job.id} className="bg-white rounded-lg shadow-md border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                                    <Briefcase size={20} className="text-blue-700" />
                                    {job.title}
                                </h3>
                                <p className="text-slate-700 text-sm mt-1">{job.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide flex items-center gap-1">
                                    <Users size={14} /> {employeesInJob.length} Active
                                </span>
                            </div>
                        </div>
                        
                        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Requirements Section */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Shield size={16} className="text-slate-600" /> Competency Requirements
                                </h4>
                                <div className="space-y-4">
                                    {Object.entries(job.requirements).map(([level, reqs]) => (
                                        <div key={level} className="bg-slate-100 rounded-lg p-4 border border-slate-100">
                                            <div className="flex items-center justify-between mb-3">
                                                <span className="text-xs font-bold bg-white border border-slate-200 px-2 py-1 rounded text-slate-700">Level: {level}</span>
                                                <span className="text-[10px] text-slate-600 uppercase font-semibold">{reqs.length} Skills Required</span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {reqs.map((req, idx) => {
                                                    const skill = dataService.getSkill(req.skillId);
                                                    return (
                                                        <div key={idx} className="text-xs bg-white border border-slate-200 px-2 py-1 rounded text-slate-600 flex items-center gap-1" title={`Required Level: ${req.requiredLevel}`}>
                                                            <span>{skill?.name}</span>
                                                            <span className="bg-blue-50 text-blue-700 px-1 rounded font-bold text-[10px]">L{req.requiredLevel}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Team Stats List */}
                            <div>
                                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Users size={16} className="text-slate-600" /> Current Team Status
                                </h4>
                                {employeesInJob.length > 0 ? (
                                    <div className="bg-slate-50 rounded-lg border border-slate-100 p-4 space-y-3">
                                        {employeesInJob.map(emp => {
                                            const stats = getMemberStats(emp);
                                            return (
                                                <div key={emp.id} className="bg-white p-3 rounded border border-slate-200 shadow-sm hover:border-blue-300 transition-colors cursor-pointer" onClick={() => setSelectedMember(emp)}>
                                                    <div className="flex justify-between items-center mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                                                                <img src={emp.avatarUrl} alt={emp.name} className="w-full h-full object-cover" />
                                                            </div>
                                                            <div>
                                                                <div className="text-sm font-bold text-slate-700 leading-none">{emp.name}</div>
                                                                <div className="text-[10px] text-slate-600 mt-0.5">
                                                                    {stats.gaps} Gaps • ITP Generated
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xs font-bold ${stats.compliance >= 80 ? 'text-green-700' : stats.compliance >= 50 ? 'text-cyan-700' : 'text-emerald-700'}`}>
                                                            {stats.compliance}%
                                                        </span>
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full ${stats.compliance >= 80 ? 'bg-green-500' : stats.compliance >= 50 ? 'bg-cyan-500' : 'bg-emerald-500'}`} 
                                                            style={{ width: `${stats.compliance}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="h-64 w-full bg-slate-50 rounded-lg border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-600">
                                        <Users size={32} className="mb-2 opacity-50" />
                                        <p className="text-sm font-medium">No team members in this role yet.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
            
            {managedJobs.length === 0 && (
                <div className="p-12 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <Briefcase size={48} className="mx-auto text-slate-500 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900">No Job Profiles Found</h3>
                    <p className="text-slate-700 text-sm mt-1">There are no job profiles associated with your department.</p>
                </div>
            )}
        </div>
    );
  };

  const renderTalentSearch = () => {
    const allUsers = dataService.getAllUsers();
    
    const filteredUsers = allUsers.filter(u => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      
      const dept = dataService.getAllDepartments().find(d => d.id === u.departmentId)?.name.toLowerCase() || '';
      const job = dataService.getJobProfile(u.jobProfileId || '')?.title.toLowerCase() || '';
      const certs = (u.certificates || []).map(c => c.name.toLowerCase()).join(' ');
      const loc = (u.location || '').toLowerCase();
      
      return (
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query) ||
        dept.includes(query) ||
        job.includes(query) ||
        certs.includes(query) ||
        loc.includes(query)
      );
    });

    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input 
                type="text" 
                placeholder="Search by name, department, job title, certificates, or location..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              />
            </div>
            <div className="text-sm text-slate-500 font-medium whitespace-nowrap">
              {filteredUsers.length} results found
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredUsers.map(u => {
            const dept = dataService.getAllDepartments().find(d => d.id === u.departmentId);
            const job = dataService.getJobProfile(u.jobProfileId || '');
            
            return (
              <div key={u.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col h-full">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                    <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-lg truncate">{u.name}</h3>
                    <p className="text-slate-600 text-sm truncate">{job?.title || 'No Job Profile'}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-slate-500 text-xs truncate">{dept?.name || 'No Department'}</span>
                      <span className="text-slate-300">•</span>
                      <span className="text-blue-600 font-bold text-[10px] uppercase tracking-wider bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">{u.location || 'N/A'}</span>
                    </div>
                  </div>
                  <a 
                    href={`mailto:${u.email}`}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors flex-shrink-0"
                    title="Contact Employee"
                  >
                    <Mail size={20} />
                  </a>
                </div>
                
                <div className="mt-auto pt-4 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Award size={14} className="text-blue-600" /> Certificates Achieved
                  </h4>
                  {u.certificates && u.certificates.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {u.certificates.map(cert => (
                        <div key={cert.id} className="bg-blue-50 border border-blue-100 text-blue-800 px-2.5 py-1.5 rounded text-xs">
                          <span className="font-semibold">{cert.name}</span>
                          <span className="text-blue-600/70 ml-1">({new Date(cert.dateAchieved).getFullYear()})</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 italic">No certificates recorded.</p>
                  )}
                </div>
              </div>
            );
          })}
          
          {filteredUsers.length === 0 && (
            <div className="col-span-full p-12 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
              <Search size={48} className="mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-medium text-slate-900">No Matches Found</h3>
              <p className="text-slate-600 text-sm mt-1">Try adjusting your search terms to find the right talent.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Manager Dashboard</h2>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-600">
             <Users size={14} className="text-blue-700" />
             <span>Managing {subordinates.length} Team Members across {managedJobs.length} Roles</span>
          </div>
        </div>
        
        {/* View Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
                onClick={() => setActiveView('TEAM')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeView === 'TEAM' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-700'}`}
            >
                Team Overview
            </button>
            <button 
                onClick={() => setActiveView('JOBS')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeView === 'JOBS' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-700'}`}
            >
                Job Profiles
            </button>
            <button 
                onClick={() => setActiveView('MATRIX')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeView === 'MATRIX' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-700'}`}
            >
                Matrix
            </button>
            <button 
                onClick={() => setActiveView('APPROVALS')}
                className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeView === 'APPROVALS' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-700'}`}
            >
                Approvals
            </button>
            {canSearchTalent && (
                <button 
                    onClick={() => setActiveView('TALENT_SEARCH')}
                    className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${activeView === 'TALENT_SEARCH' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-700 hover:text-slate-700'}`}
                >
                    Talent Search
                </button>
            )}
        </div>
      </div>

      {activeView === 'TEAM' ? (
        /* Team Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subordinates.map(member => {
                const stats = getMemberStats(member);
                const jobTitle = dataService.getJobProfile(member.jobProfileId || '')?.title || 'Unassigned';
                
                return (
                    <div 
                        key={member.id} 
                        onClick={() => setSelectedMember(member)}
                        className="bg-white rounded-lg shadow-panel border border-slate-100 p-6 cursor-pointer hover:border-blue-400 hover:shadow-lg transition-all group relative overflow-hidden"
                    >
                        <div className="absolute top-0 left-0 w-1 h-full bg-slate-200 group-hover:bg-blue-500 transition-colors"></div>
                        
                        <div className="flex items-start justify-between mb-4 pl-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 overflow-hidden">
                                    <img src={member.avatarUrl} alt={member.name} className="w-full h-full object-cover" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900 leading-tight group-hover:text-blue-700 transition-colors">{member.name}</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-xs text-slate-700">{jobTitle}</p>
                                        <span className="text-slate-300">•</span>
                                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-tight">ITP Active</span>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-slate-50 p-1.5 rounded-full text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-700 transition-colors">
                                <ChevronRight size={18} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pl-3 mt-6">
                            <div className="bg-slate-50 rounded p-3 border border-slate-100">
                                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Compliance</div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className={`text-lg font-bold ${stats.compliance >= 80 ? 'text-green-700' : stats.compliance >= 50 ? 'text-cyan-700' : 'text-emerald-700'}`}>
                                        {stats.compliance}%
                                    </span>
                                    {stats.compliance >= 80 ? <CheckCircle size={14} className="text-green-700"/> : <TrendingUp size={14} className="text-cyan-700"/>}
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                    <div 
                                        className={`h-full rounded-full ${stats.compliance >= 80 ? 'bg-green-500' : stats.compliance >= 50 ? 'bg-cyan-500' : 'bg-emerald-500'}`} 
                                        style={{ width: `${stats.compliance}%` }}
                                    ></div>
                                </div>
                            </div>
                            <div className="bg-slate-50 rounded p-3 border border-slate-100">
                                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">Critical Gaps</div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-lg font-bold ${stats.gaps === 0 ? 'text-slate-700' : 'text-emerald-700'}`}>
                                        {stats.gaps}
                                    </span>
                                    {stats.gaps > 0 && <AlertCircle size={14} className="text-emerald-700"/>}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}

            {subordinates.length === 0 && (
                <div className="col-span-full p-12 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                    <Users size={48} className="mx-auto text-slate-500 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900">No Team Members Found</h3>
                    <p className="text-slate-700 text-sm mt-1">You don't have any direct reports assigned to you yet.</p>
                </div>
            )}
        </div>
      ) : activeView === 'JOBS' ? (
        /* Job Profiles View */
        renderJobProfiles()
      ) : activeView === 'MATRIX' ? (
        /* Matrix View */
        <CompetencyMatrix currentUser={user} />
      ) : activeView === 'APPROVALS' ? (
        /* Approvals View */
        <SupervisorApproval currentUser={user} />
      ) : (
        /* Talent Search View */
        renderTalentSearch()
      )}
    </div>
  );
});
