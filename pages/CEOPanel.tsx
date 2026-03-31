import React, { useState, useMemo } from 'react';
import { User, Role, Department, Skill, JobProfile, ORG_LEVEL_LABELS, OrgLevel } from '../types';
import { dataService } from '../services/store';
import { Search, Users, ShieldCheck, Briefcase, Award, ChevronRight, Activity, Filter, LayoutGrid, List, FileSpreadsheet, UserCircle, MapPin, Building2 } from 'lucide-react';

interface CEOPanelProps {
  currentUser: User;
  onViewProfile?: (userId: string) => void;
}

export const CEOPanel: React.FC<CEOPanelProps> = ({ currentUser, onViewProfile }) => {
  const [searchTerm, setSearchTerm] = useState('');
  // All other filters are now unified into searchTerm for maximum scalability
  
  const users = dataService.getAllUsers();
  const depts = dataService.getAllDepartments();
  const skills = dataService.getAllSkills();
  const jobs = dataService.getAllJobs();

  // Metrics
  const metrics = useMemo(() => {
    const activeUsers = users.filter(u => u.status === 'ACTIVE');
    const totalSkillsIdentified = skills.length;
    
    // Average compliance across all active users
    let totalCompliant = 0;
    let totalChecked = 0;
    
    activeUsers.forEach(u => {
      const itp = dataService.generateIndividualTrainingPlan(u.id);
      if (itp) {
        // Simple heuristic: compliance = (total requirements - total gaps) / total requirements
        const job = jobs.find(j => j.id === u.jobProfileId);
        const level = u.orgLevel as OrgLevel;
        const reqs = (job && level) ? (job.requirements[level] || []) : [];
        totalChecked += reqs.length;
        totalCompliant += (reqs.length - itp.recommendations.length);
      }
    });

    const complianceRate = totalChecked > 0 ? Math.round((totalCompliant / totalChecked) * 100) : 0;

    return [
      { label: 'Total Workforce', value: activeUsers.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: 'Avg. Compliance', value: `${complianceRate}%`, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
      { label: 'Skill Repository', value: totalSkillsIdentified, icon: Activity, color: 'text-indigo-600', bg: 'bg-indigo-50' },
      { label: 'General Depts', value: depts.filter(d => d.type === 'GENERAL').length, icon: Building2, color: 'text-amber-600', bg: 'bg-amber-50' }
    ];
  }, [users, skills, depts, jobs]);

  const filteredPersonnel = useMemo(() => {
    if (searchTerm === '') return users.sort((a, b) => a.name.localeCompare(b.name));

    const term = searchTerm.toLowerCase();

    // 1. Pre-calculate matching metadata for the search term
    const matchingSkillIds = skills.filter(s => s.name.toLowerCase().includes(term)).map(s => s.id);
    const matchingDeptIds = depts.filter(d => d.name.toLowerCase().includes(term)).map(d => d.id);
    
    // 2. Pre-calculate matching levels (e.g., searching "GM" or "General Manager")
    const matchingLevels = Object.entries(ORG_LEVEL_LABELS)
      .filter(([key, label]) => key.toLowerCase().includes(term) || label.toLowerCase().includes(term))
      .map(([key]) => key);

    return users.filter(u => {
      // Profile Search (Name, Email, Phone)
      const matchesText = u.name.toLowerCase().includes(term) || 
                          u.email.toLowerCase().includes(term) ||
                          (u.phone && u.phone.includes(term));
      
      // Hierarchy & Placement Search (Dept, Level, Location, Project)
      const matchesDept = matchingDeptIds.includes(u.departmentId) || (u.generalDepartmentId && matchingDeptIds.includes(u.generalDepartmentId));
      const matchesLevel = matchingLevels.includes(u.orgLevel || '');
      const matchesProject = (u.projectName && u.projectName.toLowerCase().includes(term)) || 
                             (u.location && u.location.toLowerCase().includes(term));
      
      // Talent Search (Certificates & Skills)
      const matchesCert = u.certificates?.some(c => c.name.toLowerCase().includes(term)) || false;
      const matchesDeepSkill = matchingSkillIds.length > 0 && matchingSkillIds.some(sid => dataService.getUserSkillScore(u.id, sid) > 0);

      return matchesText || matchesDept || matchesLevel || matchesProject || matchesCert || matchesDeepSkill;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [users, searchTerm, skills, depts]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header Banner */}
      <div className="relative overflow-hidden bg-slate-900 p-8 rounded-none border border-slate-800 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-20 -mr-20 h-80 w-80 rounded-none bg-blue-500/10 blur-[100px]"></div>
        <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-80 w-80 rounded-none bg-indigo-500/10 blur-[100px]"></div>
        
        <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="px-3 py-1 bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-500/20 rounded-none">
                Executive Overview
              </div>
              <span className="w-1.5 h-1.5 rounded-none bg-slate-700"></span>
              <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Global Workforce Intelligence</span>
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight">CEO Workforce Dashboard</h1>
            <p className="text-slate-400 mt-2 max-w-2xl text-lg font-medium leading-relaxed">
              Real-time visualization of organizational capability, skill availability, and talent distribution across all EPROM entities.
            </p>
          </div>
          
          <div className="flex gap-4">
             <div className="bg-white/5 backdrop-blur-md p-6 border border-white/10 rounded-none shadow-xl min-w-[200px]">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                  <Activity size={14} className="text-blue-500"/> System Health
                </p>
                <div className="flex items-end gap-3">
                   <span className="text-3xl font-black text-white">98.4%</span>
                   <span className="text-xs font-bold text-emerald-500 pb-1 mb-1">Live</span>
                </div>
                <div className="w-full bg-slate-800 h-1 mt-4">
                   <div className="bg-blue-500 h-full w-[98.4%]"></div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white p-6 border border-slate-200 rounded-none shadow-sm hover: transition-all group overflow-hidden relative text-left">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
              <m.icon size={48} className={m.color} />
            </div>
            <div className="flex items-center gap-3 mb-4 text-left">
              <div className={`p-3 rounded-none ${m.bg} ${m.color}`}>
                <m.icon size={24} />
              </div>
              <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{m.label}</span>
            </div>
            <div className="text-3xl font-black text-slate-900">{m.value}</div>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-emerald-600">
               <Activity size={12} />
               <span>Real-time Update</span>
            </div>
          </div>
        ))}
      </div>

      {/* Advanced Global Discovery */}
      <div className="bg-white border border-slate-200 p-8 shadow-sm text-left relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-slate-50 rounded-none -mt-32 -mr-16 blur-3xl opacity-50"></div>
        <div className="relative z-10">
          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 text-left">Talent Command Search</label>
          <div className="relative flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" size={24}/>
              <input 
                type="text" 
                placeholder="Search by name, dept, skill, level, project, location, or phone..." 
                className="w-full pl-16 pr-6 py-5 bg-slate-50 text-slate-900 border border-slate-200 rounded-none focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all placeholder:text-slate-400 text-lg font-bold shadow-inner" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="px-8 py-5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all font-black text-xs uppercase tracking-widest shadow-sm"
              >
                Reset Search
              </button>
            )}
          </div>
          <p className="mt-4 text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-2">
            <Activity size={12} className="text-blue-500" />
            Global index updated: Cross-referencing {users.length} profiles across {depts.length} department domains.
          </p>
        </div>
      </div>

      {/* Workforce Directory */}
      <div className="bg-white border border-slate-200 shadow-sm overflow-hidden text-left">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
           <div className="flex items-center gap-3">
              <Users size={20} className="text-blue-600" />
              <h3 className="text-xl font-bold text-slate-900 uppercase tracking-tight">Organization Directory</h3>
              <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-black rounded-none">
                 {filteredPersonnel.length} Matched Employees
              </span>
           </div>
           <div className="flex gap-2">
              <button className="p-2 border border-slate-300 text-slate-600 hover:bg-slate-50"><LayoutGrid size={18}/></button>
              <button className="p-2 bg-slate-900 text-white border border-slate-900"><List size={18}/></button>
           </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-white text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] border-b border-slate-100">
              <tr>
                <th className="px-8 py-5">Personnel</th>
                <th className="px-6 py-5">Placement</th>
                <th className="px-6 py-5">Hierarchy</th>
                <th className="px-6 py-5">Core Proficiency</th>
                <th className="px-8 py-5 text-right">Insight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredPersonnel.length > 0 ? filteredPersonnel.map(person => {
                const dept = depts.find(d => d.id === person.departmentId);
                const genDept = depts.find(d => d.id === (person.generalDepartmentId || dataService.getGeneralDeptId(person.departmentId)));
                
                return (
                  <tr key={person.id} className="hover:bg-slate-50 group transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-100 border border-slate-200 rounded-none flex items-center justify-center text-slate-900 font-black text-lg group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
                          {person.avatarUrl ? <img src={person.avatarUrl} alt="" className="w-full h-full object-cover"/> : person.name[0]}
                        </div>
                        <div>
                          <div className="text-base font-black text-slate-900 uppercase tracking-tight leading-none mb-1">{person.name}</div>
                          <div className="text-xs text-slate-500 font-medium">{person.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-black text-slate-900 uppercase tracking-tight leading-tight">{genDept?.name || 'Unassigned'}</span>
                        <div className="flex flex-col gap-1 mt-1">
                           {(() => {
                              if (!dept) return <span className="text-[10px] font-bold text-slate-400 uppercase italic">Unassigned</span>;
                              const parentDept = dept.parentId ? depts.find(d => d.id === dept.parentId) : null;
                              const isGenDirect = dept.id === genDept?.id;
                              
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                   <Building2 size={12} className="text-blue-600 shrink-0" />
                                   {parentDept && parentDept.id !== genDept?.id && (
                                      <>
                                         <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{parentDept.name}</span>
                                         <ChevronRight size={10} className="text-slate-300" />
                                      </>
                                   )}
                                   <span className={`text-[11px] uppercase tracking-tight font-black ${isGenDirect ? 'text-slate-400 italic' : 'text-slate-700'}`}>
                                      {isGenDirect ? 'Direct Group' : dept.name}
                                   </span>
                                </div>
                              );
                           })()}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{person.role}</span>
                        <span className="inline-block w-fit px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black border border-blue-100 uppercase">
                          {person.orgLevel ? ORG_LEVEL_LABELS[person.orgLevel] : 'N/A'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                       <div className="flex flex-col gap-2 w-48">
                          <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                             <span>Skill Coverage</span>
                             <span>
                                {(() => {
                                   const job = jobs.find(j => j.id === person.jobProfileId);
                                   const level = person.orgLevel as OrgLevel;
                                   const reqs = (job && level) ? (job.requirements[level] || []) : [];
                                   if (reqs.length === 0) return '0%';
                                   const itp = dataService.generateIndividualTrainingPlan(person.id);
                                   const gaps = itp?.recommendations.length || 0;
                                   const coverage = reqs.length > 0 ? Math.round(((reqs.length - gaps) / reqs.length) * 100) : 0;
                                   return `${coverage}%`;
                                })()}
                             </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-100 rounded-none overflow-hidden">
                             <div 
                                className="h-full bg-blue-600 transition-all duration-1000"
                                style={{
                                   width: (() => {
                                      const job = jobs.find(j => j.id === person.jobProfileId);
                                      const level = person.orgLevel as OrgLevel;
                                      const reqs = (job && level) ? (job.requirements[level] || []) : [];
                                      if (reqs.length === 0) return '0%';
                                      const itp = dataService.generateIndividualTrainingPlan(person.id);
                                      const gaps = itp?.recommendations.length || 0;
                                      return `${Math.round(((reqs.length - gaps) / reqs.length) * 100)}%`;
                                   })()
                                }}
                             ></div>
                          </div>
                       </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button 
                        onClick={() => onViewProfile?.(person.id)}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-900 text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                      >
                         View Profile <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                   <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                         <Search size={48} className="text-slate-200" />
                         <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No personnel matched your current intelligence filters</p>
                         <button 
                          onClick={() => setSearchTerm('')}
                          className="text-blue-700 font-black text-[10px] uppercase tracking-[0.2em] hover:underline"
                         >
                            Clear All Parameters
                         </button>
                      </div>
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
