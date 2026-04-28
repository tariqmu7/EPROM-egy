import React, { useState, useMemo } from 'react';
import { dataService } from '../services/store';
import { User, Role } from '../types';
import { CheckCircle, AlertTriangle, Clock } from 'lucide-react';

export const CompetencyMatrix: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');

  // ── Static reference data ────────────────────────────────────────────────
  const depts = useMemo(() => dataService.getAllDepartments(), []);
  const users = useMemo(
    () =>
      currentUser.role === Role.CEO
        ? dataService.getAllUsers()
        : dataService.getPublicUsers(),
    [currentUser.role]
  );
  const jobs  = useMemo(() => dataService.getAllJobs(),   []);
  const skills = useMemo(() => dataService.getAllSkills(), []);

  // ── Filtered users visible to this viewer ────────────────────────────────
  const relevantUsers = useMemo(() => {
    let filtered = dataService.getVisibleUsers(currentUser);
    if (selectedDeptId !== 'ALL') {
      filtered = filtered.filter((u: User) => u.departmentId === selectedDeptId);
    }
    return filtered;
  }, [currentUser, selectedDeptId]);

  // ── Pre-compute: union of all required skill IDs for visible users ───────
  const requiredSkillIds = useMemo(() => {
    const ids = new Set<string>();
    relevantUsers.forEach((user: User) => {
      if (user.jobProfileId && user.orgLevel) {
        const job = jobs.find(j => j.id === user.jobProfileId);
        const requirements = job?.requirements as any;
        requirements?.[user.orgLevel]?.forEach((req: any) => ids.add(req.skillId));
      }
    });
    return ids; // keep as Set for O(1) lookups below
  }, [relevantUsers, jobs]);

  const relevantSkills = useMemo(
    () => skills.filter(s => requiredSkillIds.has(s.id)),
    [skills, requiredSkillIds]
  );

  // ── O(1) score lookup map: userId → skillId → weighted score ────────────
  //    Uses the canonical dataService.getUserSkillScore (360/evidence/online/interview
  //    weights are all handled there — no duplicate logic here).
  const scoreMap = useMemo<Record<string, Record<string, number>>>(() => {
    const map: Record<string, Record<string, number>> = {};
    relevantUsers.forEach((user: User) => {
      map[user.id] = {};
      relevantSkills.forEach(skill => {
        map[user.id][skill.id] = dataService.getUserSkillScore(user.id, skill.id);
      });
    });
    return map;
  }, [relevantUsers, relevantSkills]);

  // ── Pending evidence set: "userId::skillId" for O(1) lookups ────────────
  const pendingEvidenceKeys = useMemo(() => {
    const keys = new Set<string>();
    const allEvidences = dataService.getEvidences({ status: 'PENDING' });
    allEvidences.forEach(e => keys.add(`${e.userId}::${e.skillId}`));
    return keys;
  }, []); // refreshed whenever the component re-renders from snapshot updates

  // ── Cell status (O(1) using pre-computed maps) ───────────────────────────
  const getCellStatus = (userId: string, skillId: string, requiredLevel: number): 'VERIFIED' | 'PENDING' | 'GAP' => {
    if (pendingEvidenceKeys.has(`${userId}::${skillId}`)) return 'PENDING';
    const score = scoreMap[userId]?.[skillId] ?? 0;
    return score >= requiredLevel ? 'VERIFIED' : 'GAP';
  };

  // ── Column rollup status ─────────────────────────────────────────────────
  const COLUMNS = [
    { id: 'technical',          label: 'Technical',           categories: ['Technical'] },
    { id: 'safety',             label: 'Safety',              categories: ['Safety'] },
    { id: 'behavior_management',label: 'Behavior/Management', categories: ['Behavioral', 'Management'] },
  ];

  const getColumnStatus = (user: User, categories: string[]) => {
    const job  = jobs.find(j => j.id === user.jobProfileId);
    const reqs = (job && user.orgLevel ? job.requirements[user.orgLevel] : null) ?? [];

    const relevantReqs = reqs.filter(r => {
      const skill = skills.find(s => s.id === r.skillId);
      return skill && categories.includes(skill.category);
    });

    if (relevantReqs.length === 0) return 'N/A';

    let hasGap     = false;
    let hasPending = false;

    for (const req of relevantReqs) {
      const status = getCellStatus(user.id, req.skillId, req.requiredLevel);
      if (status === 'GAP')     hasGap     = true;
      if (status === 'PENDING') hasPending = true;
    }

    if (hasGap)     return 'GAP';
    if (hasPending) return 'PENDING';
    return 'VERIFIED';
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-300 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Competency Matrix</h2>
          <p className="text-slate-700 text-sm mt-1">Real-time view of workforce readiness</p>
        </div>
        {currentUser.role === 'ADMIN' && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Department:</label>
            <select
              value={selectedDeptId}
              onChange={e => setSelectedDeptId(e.target.value)}
              className="bg-white border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-2.5"
            >
              <option value="ALL">All Departments</option>
              {depts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="bg-white rounded-none border border-slate-300 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-300">
              <tr>
                <th scope="col" className="px-6 py-4 font-semibold sticky left-0 bg-slate-50 z-10 border-r border-slate-300">
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
              {relevantUsers.map((user: User, index: number) => {
                const job = jobs.find(j => j.id === user.jobProfileId);

                return (
                  <tr key={user.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td
                      className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap sticky left-0 z-10 border-r border-slate-300"
                      style={{ backgroundColor: index % 2 === 0 ? 'white' : '#f8fafc' }}
                    >
                      <div className="flex items-center gap-3">
                        <img src={user.avatarUrl} alt={user.name} className="w-8 h-8 rounded-none" />
                        <div>
                          <div className="font-semibold">{user.name} {user.employeeId && <span className="text-slate-400 text-[10px] ml-1">#{user.employeeId}</span>}</div>
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
                      let icon    = null;
                      let label   = '';

                      if (status === 'VERIFIED') {
                        bgColor = 'bg-slate-100 text-slate-800 border-slate-200';
                        icon    = <CheckCircle size={14} />;
                        label   = 'Verified Safe';
                      } else if (status === 'PENDING') {
                        bgColor = 'bg-slate-100 text-slate-800 border-slate-200';
                        icon    = <Clock size={14} />;
                        label   = 'Pending Review';
                      } else {
                        bgColor = 'bg-rose-100 text-rose-800 border-rose-200';
                        icon    = <AlertTriangle size={14} />;
                        label   = 'Gap / Risk';
                      }

                      return (
                        <td key={col.id} className="px-6 py-4 text-center">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-medium border ${bgColor}`}>
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
