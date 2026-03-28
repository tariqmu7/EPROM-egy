import React, { useMemo, useState } from 'react';
import { dataService } from '../services/store';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from 'recharts';
import { Activity, TrendingUp, Users, Building2 } from 'lucide-react';

export const AdminAnalytics: React.FC = () => {
  const [selectedDeptId, setSelectedDeptId] = useState<string>('ALL');

  const depts = useMemo(() => dataService.getAllDepartments(), []);
  const users = useMemo(() => dataService.getAllUsers(), []);
  const jobs = useMemo(() => dataService.getAllJobs(), []);
  
  // Fetch all assessments
  const allAssessments = useMemo(() => {
    // We need to get all assessments. We can just call getAssessments with empty filter
    return dataService.getAssessments({});
  }, []);

  const trendData = useMemo(() => {
    // Filter users by department if selected
    const relevantUsers = selectedDeptId === 'ALL' 
      ? users 
      : users.filter(u => u.departmentId === selectedDeptId);
      
    const relevantUserIds = new Set(relevantUsers.map(u => u.id));
    
    const relevantAssessments = allAssessments.filter(a => relevantUserIds.has(a.subjectId))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (relevantAssessments.length === 0) return [];

    const months = new Set<string>();
    relevantAssessments.forEach(a => {
      const d = new Date(a.date);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });

    const sortedMonths = Array.from(months).sort();
    const data = [];
    
    // We need to track the latest score for each user-skill combination
    const currentScores: Record<string, Record<string, number>> = {}; // userId -> skillId -> score

    for (const month of sortedMonths) {
      const monthAssessments = relevantAssessments.filter(a => {
        const d = new Date(a.date);
        const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return m === month;
      });

      monthAssessments.forEach(a => {
        if (!currentScores[a.subjectId]) currentScores[a.subjectId] = {};
        currentScores[a.subjectId][a.skillId] = a.score;
      });

      let totalGap = 0;
      let count = 0;

      // Calculate gap for all relevant users based on their current scores and job profile
      relevantUsers.forEach(user => {
        if (!user.jobProfileId || !user.orgLevel) return;
        const jobProfile = jobs.find(j => j.id === user.jobProfileId);
        if (!jobProfile) return;
        
        const levelRequirements = jobProfile.requirements[user.orgLevel] || [];
        const userScores = currentScores[user.id] || {};
        
        if (Array.isArray(levelRequirements)) {
          levelRequirements.forEach(req => {
            const score = userScores[req.skillId] || 0;
            const gap = Math.max(0, req.requiredLevel - score);
            totalGap += gap;
            count++;
          });
        }
      });

      const avgGap = count > 0 ? (totalGap / count).toFixed(2) : 0;
      const [year, m] = month.split('-');
      const date = new Date(parseInt(year), parseInt(m) - 1);
      const monthLabel = date.toLocaleString('default', { month: 'short', year: 'numeric' });

      data.push({
        name: monthLabel,
        'Average Gap': parseFloat(avgGap as string)
      });
    }

    return data;
  }, [selectedDeptId, users, allAssessments, jobs]);

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 rounded-none ">
          <p className="font-bold text-white text-xs mb-2">{label}</p>
          {payload.map((p: any, idx: number) => (
             <div key={idx} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-none" style={{background: p.color}}></div>
                <span className="text-slate-400">{p.name}:</span>
                <span className="font-bold text-white">{p.value}</span>
             </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-6 border-b border-slate-300 gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Organization Analytics</h2>
          <p className="text-slate-700 text-sm mt-1">Skill gap trends and workforce insights</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Filter by Department:</label>
          <select 
            value={selectedDeptId}
            onChange={(e) => setSelectedDeptId(e.target.value)}
            className="bg-white border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-2.5 "
          >
            <option value="ALL">All Departments</option>
            {depts.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-sm  border border-slate-300 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-sm flex items-center justify-center">
            <Users size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Analyzed Users</p>
            <h3 className="text-2xl font-bold text-slate-900">
              {selectedDeptId === 'ALL' ? users.length : users.filter(u => u.departmentId === selectedDeptId).length}
            </h3>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-sm  border border-slate-300 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-sm flex items-center justify-center">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Assessments</p>
            <h3 className="text-2xl font-bold text-slate-900">
              {selectedDeptId === 'ALL' ? allAssessments.length : allAssessments.filter(a => users.find(u => u.id === a.subjectId)?.departmentId === selectedDeptId).length}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-sm  border border-slate-300 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-sm flex items-center justify-center">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Avg Gap</p>
            <h3 className="text-2xl font-bold text-slate-900">
              {trendData.length > 0 ? trendData[trendData.length - 1]['Average Gap'] : 0}
            </h3>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-sm  border border-slate-300">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp size={20} className="text-slate-900" />
          <h4 className="font-bold text-slate-900">Skill Gap Trend Over Time</h4>
        </div>
        
        {trendData.length > 0 ? (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="Average Gap" 
                  name="Average Skill Gap"
                  stroke="#3b82f6" 
                  strokeWidth={3} 
                  dot={{ r: 4, strokeWidth: 2 }} 
                  activeDot={{ r: 6 }} 
                  animationDuration={1500}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-80 flex flex-col items-center justify-center text-slate-500">
            <Activity size={48} className="mb-4 text-slate-300" />
            <p>No assessment data available for the selected criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};
