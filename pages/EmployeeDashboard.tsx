import React from 'react';
import { User, JobProfile, Skill } from '../types';
import { dataService } from '../services/store';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, BarChart, CartesianGrid, XAxis, YAxis, Bar, Legend } from 'recharts';
import { AlertCircle, CheckCircle, Award, BookOpen, Activity, TrendingUp } from 'lucide-react';

interface EmployeeDashboardProps {
  user: User;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ user }) => {
  const jobProfile = user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null;
  const userLevel = user.orgLevel;

  if (!jobProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
         <Activity size={48} className="mb-4 text-slate-300" />
         <p className="font-medium">No Job Profile assigned. Contact Administration.</p>
      </div>
    );
  }

  if (!userLevel) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
        <Activity size={48} className="mb-4 text-slate-300" />
        <p className="font-medium">No Organization Level assigned. Contact Administration.</p>
      </div>
    );
  }

  const levelRequirements = jobProfile.requirements[userLevel] || [];
  
  if (levelRequirements.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
             <CheckCircle size={48} className="mb-4 text-slate-300" />
            <p className="font-medium">No specific competency requirements defined for level: <span className="font-bold text-slate-700">{userLevel}</span>.</p>
        </div>
      );
  }

  // Calculate Gaps
  const skillAnalysis = levelRequirements.map(req => {
    const skillDetails = dataService.getSkill(req.skillId);
    const currentScore = dataService.getUserSkillScore(user.id, req.skillId);
    return {
      skill: skillDetails,
      required: req.requiredLevel,
      current: currentScore,
      gap: req.requiredLevel - currentScore
    };
  });

  const chartData = skillAnalysis.map(s => ({
    subject: s.skill?.name || 'Unknown',
    Required: s.required,
    Current: s.current,
    fullMark: 5,
  }));

  const gaps = skillAnalysis.filter(s => s.gap > 0);
  const compliant = skillAnalysis.filter(s => s.gap <= 0);

  const recommendations = gaps.map(g => {
    const nextLevel = g.current + 1;
    const levelDetails = g.skill?.levels[nextLevel <= 5 ? nextLevel : 5];
    return {
      skillName: g.skill?.name,
      targetLevel: nextLevel,
      certs: levelDetails?.requiredCertificates || [],
      description: levelDetails?.description
    };
  });

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-brand-900 border border-brand-700 p-3 rounded shadow-xl">
          <p className="font-bold text-white text-xs mb-2">{label}</p>
          {payload.map((p: any, idx: number) => (
             <div key={idx} className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full" style={{background: p.color}}></div>
                <span className="text-slate-300">{p.name}:</span>
                <span className="font-bold text-white">{p.value}</span>
             </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6">
        <div>
          <h2 className="text-3xl font-bold text-brand-900 tracking-tight">Competency Dashboard</h2>
          <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
             <span className="bg-brand-100 text-brand-700 px-2 py-0.5 rounded font-bold uppercase text-[10px] tracking-wider">{userLevel}</span>
             <span>{jobProfile.title}</span>
             <span className="text-slate-300">•</span>
             <span>{dataService.getAllDepartments().find(d => d.id === user.departmentId)?.name}</span>
          </div>
        </div>
        <div className="flex gap-2">
            <button className="bg-white border border-slate-200 hover:border-brand-500 text-slate-600 px-4 py-2 rounded shadow-sm text-sm font-medium transition-all">Export Report</button>
            <button className="bg-brand-900 text-white px-4 py-2 rounded shadow-sm text-sm font-bold hover:bg-brand-800 transition-all">Development Plan</button>
        </div>
      </div>

      {/* KPI Cards - Industrial Style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-panel border-t-4 border-energy-teal">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance Rate</p>
              <h3 className="text-4xl font-bold text-brand-900 mt-1">
                {Math.round((compliant.length / skillAnalysis.length) * 100)}<span className="text-xl text-slate-400 font-normal">%</span>
              </h3>
            </div>
            <div className="p-2 bg-slate-50 rounded-full text-energy-teal">
              <CheckCircle size={24} />
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
             <div className="bg-energy-teal h-full" style={{ width: `${(compliant.length / skillAnalysis.length) * 100}%` }}></div>
          </div>
          <p className="text-xs text-slate-500 mt-3 font-medium flex items-center gap-1">
             <span className="text-energy-teal">●</span> {compliant.length} skills fully compliant
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-panel border-t-4 border-energy-red">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Critical Gaps</p>
              <h3 className="text-4xl font-bold text-brand-900 mt-1">{gaps.length}</h3>
            </div>
            <div className="p-2 bg-slate-50 rounded-full text-energy-red">
              <AlertCircle size={24} />
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
             <div className="bg-energy-red h-full" style={{ width: `${(gaps.length / skillAnalysis.length) * 100}%` }}></div>
          </div>
          <p className="text-xs text-slate-500 mt-3 font-medium flex items-center gap-1">
             <span className="text-energy-red">●</span> Requires immediate action
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-panel border-t-4 border-energy-gold">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Certifications Needed</p>
              <h3 className="text-4xl font-bold text-brand-900 mt-1">
                {recommendations.reduce((acc, curr) => acc + curr.certs.length, 0)}
              </h3>
            </div>
            <div className="p-2 bg-slate-50 rounded-full text-energy-gold">
              <Award size={24} />
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
             <div className="bg-energy-gold h-full" style={{ width: '60%' }}></div>
          </div>
           <p className="text-xs text-slate-500 mt-3 font-medium flex items-center gap-1">
             <span className="text-energy-gold">●</span> To reach next level
          </p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Radar Chart */}
        <div className="bg-white p-6 rounded-lg shadow-panel border border-slate-100">
          <div className="flex items-center justify-between mb-6">
             <h4 className="font-bold text-brand-900 flex items-center gap-2">
                <Activity size={18} className="text-energy-teal"/> Skill Profile Visualization
             </h4>
          </div>
          <div className="h-80 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={chartData}>
                <PolarGrid gridType="polygon" stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{fontSize: 11, fill: '#64748b', fontWeight: 600}} />
                <PolarRadiusAxis angle={30} domain={[0, 5]} tick={false} axisLine={false} />
                <Radar name="Current" dataKey="Current" stroke="#0d9488" strokeWidth={2} fill="#0d9488" fillOpacity={0.4} />
                <Radar name="Required" dataKey="Required" stroke="#0f172a" strokeWidth={2} fill="transparent" strokeDasharray="4 4" />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{paddingTop: '10px', fontSize: '12px'}} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Gap Bar Chart */}
        <div className="bg-white p-6 rounded-lg shadow-panel border border-slate-100">
           <div className="flex items-center justify-between mb-6">
             <h4 className="font-bold text-brand-900 flex items-center gap-2">
                <TrendingUp size={18} className="text-energy-teal"/> Gap Analysis Detail
             </h4>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 5]} hide />
                <YAxis dataKey="subject" type="category" width={120} tick={{fontSize: 11, fill: '#475569', fontWeight: 500}} interval={0} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{paddingTop: '10px', fontSize: '12px'}} />
                <Bar dataKey="Current" fill="#0d9488" name="Current Level" barSize={12} radius={[0, 4, 4, 0]} />
                <Bar dataKey="Required" fill="#cbd5e1" name="Target Level" barSize={12} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="bg-white rounded-lg shadow-panel border border-slate-100 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h4 className="font-bold text-brand-900">Action Plan & Recommendations</h4>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Generated by ERPOM Engine</span>
        </div>
        <div className="divide-y divide-slate-100">
          {recommendations.length > 0 ? (
            recommendations.map((rec, idx) => (
              <div key={idx} className="p-5 flex flex-col md:flex-row gap-6 hover:bg-slate-50 transition-colors group">
                 <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                       <span className="bg-red-50 text-red-700 border border-red-100 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide">Gap Detected</span>
                       <h5 className="font-bold text-brand-900 text-sm group-hover:text-energy-teal transition-colors">{rec.skillName}</h5>
                    </div>
                    <p className="text-sm text-slate-600 mb-3 leading-relaxed">Targeting Level {rec.targetLevel}: {rec.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {rec.certs.map((cert, cIdx) => (
                        <span key={cIdx} className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                          <Award size={12} className="text-energy-gold" />
                          {cert}
                        </span>
                      ))}
                    </div>
                 </div>
                 <div className="flex items-center">
                    <button className="bg-white hover:bg-brand-900 hover:text-white border border-slate-300 text-slate-700 px-4 py-2 rounded text-xs font-bold uppercase tracking-wide transition-all shadow-sm">
                      Enroll Module
                    </button>
                 </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center">
              <div className="mx-auto w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4 border border-green-100">
                <CheckCircle size={24} />
              </div>
              <h3 className="text-lg font-bold text-brand-900">100% Compliant</h3>
              <p className="text-slate-500 text-sm mt-1">Excellent work. You meet all competency requirements for your current role.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};