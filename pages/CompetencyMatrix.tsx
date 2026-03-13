import React, { useState, useMemo } from 'react';
import { dataService } from '../services/store';
import { User, Skill, JobProfile } from '../types';
import { CheckCircle, AlertTriangle, Clock } from 'lucide-react';

export const CompetencyMatrix: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');

  const depts = useMemo(() => dataService.getAllDepartments(), []);
  const users = useMemo(() => dataService.getAllUsers(), []);
  const jobs = useMemo(() => dataService.getAllJobs(), []);
  const skills = useMemo(() => dataService.getAllSkills(), []);
  const assessments = useMemo(() => dataService.getAssessments({}), []);
  const evidences = useMemo(() => dataService.getEvidences({}), []);

  const relevantUsers = useMemo(() => {
    let filtered = users;
    if (selectedDeptId !== 'ALL') {
      filtered = filtered.filter(u => u.departmentId === selectedDeptId);
    }
    
    if (currentUser.role === 'ADMIN') {
      return filtered;
    }

    if (dataService.isManager(currentUser)) {
      filtered = filtered.filter(u => u.managerId === currentUser.id || u.id === currentUser.id);
    } else {
      filtered = filtered.filter(u => u.id === currentUser.id);
    }
    
    return filtered;
  }, [users, selectedDeptId, currentUser]);

  // Determine all required skills for the relevant users
  const requiredSkillIds = useMemo(() => {
    const ids = new Set<string>();
    relevantUsers.forEach(user => {
      if (user.jobProfileId && user.orgLevel) {
        const job = jobs.find(j => j.id === user.jobProfileId);
        if (job && job.requirements[user.orgLevel]) {
          job.requirements[user.orgLevel]!.forEach(req => ids.add(req.skillId));
        }
      }
    });
    return Array.from(ids);
  }, [relevantUsers, jobs]);

  const relevantSkills = useMemo(() => {
    return skills.filter(s => requiredSkillIds.includes(s.id));
  }, [skills, requiredSkillIds]);

  const COLUMNS = [
    { id: 'technical', label: 'Technical', categories: ['Technical'] },
    { id: 'safety', label: 'Safety', categories: ['Safety'] },
    { id: 'behavior_management', label: 'Behavior/Management', categories: ['Behavioral', 'Management'] }
  ];

  const getCellStatus = (userId: string, skillId: string, requiredLevel: number) => {
    // Check for pending evidence
    const pendingEvidence = evidences.find(e => e.userId === userId && e.skillId === skillId && e.status === 'PENDING');
    if (pendingEvidence) return 'PENDING';

    // Check latest assessment
    const userAssessments = assessments.filter(a => a.subjectId === userId && a.skillId === skillId);
    if (userAssessments.length === 0) return 'GAP';

    // Sort by date descending
    userAssessments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latestScore = userAssessments[0].score;

    if (latestScore >= requiredLevel) return 'VERIFIED';
    return 'GAP';
  };

  const getColumnStatus = (user: User, categories: string[]) => {
    const job = jobs.find(j => j.id === user.jobProfileId);
    const reqs = job && user.orgLevel ? job.requirements[user.orgLevel] || [] : [];
    
    const relevantReqs = reqs.filter(r => {
      const skill = skills.find(s => s.id === r.skillId);
      return skill && categories.includes(skill.category);
    });

    if (relevantReqs.length === 0) return 'N/A';

    let hasGap = false;
    let hasPending = false;

    for (const req of relevantReqs) {
      const status = getCellStatus(user.id, req.skillId, req.requiredLevel);
      if (status === 'GAP') hasGap = true;
      if (status === 'PENDING') hasPending = true;
    }

    if (hasGap) return 'GAP';
    if (hasPending) return 'PENDING';
    return 'VERIFIED';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-200 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Competency Matrix</h2>
          <p className="text-slate-700 text-sm mt-1">Real-time view of workforce readiness</p>
        </div>
        {currentUser.role === 'ADMIN' && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Department:</label>
            <select 
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="bg-white border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 shadow-sm"
            >
              <option value="ALL">All Departments</option>
              {depts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th scope="col" className="px-6 py-4 font-semibold sticky left-0 bg-slate-50 z-10 border-r border-slate-200">
                  Employee
                </th>
                {COLUMNS.map(col => (
                  <th key={col.id} scope="col" className="px-6 py-4 font-semibold text-center min-w-[200px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className="truncate w-full block" title={col.label}>{col.label}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relevantUsers.map((user, index) => {
                const job = jobs.find(j => j.id === user.jobProfileId);

                return (
                  <tr key={user.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap sticky left-0 z-10 border-r border-slate-200" style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8fafc' }}>
                      <div className="flex items-center gap-3">
                        <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-full" />
                        <div>
                          <div className="font-semibold">{user.name}</div>
                          <div className="text-xs text-slate-500">{job?.title || 'No Profile'}</div>
                        </div>
                      </div>
                    </td>
                    {COLUMNS.map(col => {
                      const status = getColumnStatus(user, col.categories);

                      if (status === 'N/A') {
                        return <td key={col.id} className="px-6 py-4 text-center text-slate-300">-</td>;
                      }

                      let bgColor = '';
                      let icon = null;
                      let label = '';

                      if (status === 'VERIFIED') {
                        bgColor = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                        icon = <CheckCircle size={14} />;
                        label = 'Verified Safe';
                      } else if (status === 'PENDING') {
                        bgColor = 'bg-amber-100 text-amber-800 border-amber-200';
                        icon = <Clock size={14} />;
                        label = 'Pending Review';
                      } else {
                        bgColor = 'bg-rose-100 text-rose-800 border-rose-200';
                        icon = <AlertTriangle size={14} />;
                        label = 'Gap / Risk';
                      }

                      return (
                        <td key={col.id} className="px-6 py-4 text-center">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${bgColor}`}>
                            {icon}
                            <span>{label}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {relevantUsers.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 1} className="px-6 py-8 text-center text-slate-500">
                    No employees found for the selected criteria.
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
