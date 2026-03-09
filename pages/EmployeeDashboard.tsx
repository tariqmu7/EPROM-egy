import React, { useMemo } from 'react';
import { User, JobProfile, Skill } from '../types';
import { dataService } from '../services/store';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, BarChart, CartesianGrid, XAxis, YAxis, Bar, Legend, Cell } from 'recharts';
import { AlertCircle, CheckCircle, Award, BookOpen, Activity, TrendingUp, Users, PlayCircle, Calendar, ArrowRight, Download, FileText } from 'lucide-react';

interface EmployeeDashboardProps {
  user: User;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = React.memo(({ user }) => {
  const jobProfile = useMemo(() => user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null, [user.jobProfileId]);
  const userLevel = user.orgLevel;

  if (!jobProfile) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-600">
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

  const chartData = useMemo(() => skillAnalysis.map(s => ({
    subject: s.skill?.name || 'Unknown',
    Required: s.required,
    Current: s.current,
    fullMark: 5,
  })), [skillAnalysis]);

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
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Competency Dashboard</h2>
          <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
             <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold uppercase text-[10px] tracking-wider">{userLevel}</span>
             <span>{jobProfile.title}</span>
             <span className="text-slate-300">•</span>
             <span>{dataService.getAllDepartments().find(d => d.id === user.departmentId)?.name}</span>
          </div>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={handleExportReport}
                className="whitespace-nowrap bg-white border border-slate-200 hover:border-blue-500 text-slate-600 px-4 py-2 rounded shadow-sm text-sm font-medium transition-all flex items-center gap-2"
            >
                <Download size={16} /> Export Report
            </button>
            <button 
                onClick={handleExportPlan}
                className="whitespace-nowrap bg-blue-600 text-white px-4 py-2 rounded shadow-sm text-sm font-bold hover:bg-blue-700 transition-all flex items-center gap-2"
            >
                <FileText size={16} /> Development Plan
            </button>
        </div>
      </div>

      {/* KPI Cards - Industrial Style */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md border-t-4 border-blue-500">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Compliance Rate</p>
              <h3 className="text-4xl font-bold text-slate-900 mt-1">
                {skillAnalysis.length > 0 ? Math.round((compliant.length / skillAnalysis.length) * 100) : 0}<span className="text-xl text-slate-400 font-normal">%</span>
              </h3>
            </div>
            <div className="p-2 bg-slate-100 rounded-full text-blue-600">
              <CheckCircle size={24} />
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
             <div className="bg-blue-500 h-full" style={{ width: `${skillAnalysis.length > 0 ? (compliant.length / skillAnalysis.length) * 100 : 0}%` }}></div>
          </div>
          <p className="text-xs text-slate-500 mt-3 font-medium flex items-center gap-1">
             <span className="text-blue-600">●</span> {compliant.length} skills fully compliant
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-panel border-t-4 border-emerald-500">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Critical Gaps</p>
              <h3 className="text-4xl font-bold text-slate-900 mt-1">{gaps.length}</h3>
            </div>
            <div className="p-2 bg-slate-100 rounded-full text-emerald-500">
              <AlertCircle size={24} />
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
             <div className="bg-emerald-500 h-full" style={{ width: `${skillAnalysis.length > 0 ? (gaps.length / skillAnalysis.length) * 100 : 0}%` }}></div>
          </div>
          <p className="text-xs text-slate-500 mt-3 font-medium flex items-center gap-1">
             <span className="text-emerald-500">●</span> Requires immediate action
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-panel border-t-4 border-cyan-400">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Certifications Needed</p>
              <h3 className="text-4xl font-bold text-slate-900 mt-1">
                {recommendations.reduce((acc, curr) => acc + curr.certs.length, 0)}
              </h3>
            </div>
            <div className="p-2 bg-slate-50 rounded-full text-cyan-400">
              <Award size={24} />
            </div>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
             <div className="bg-cyan-400 h-full" style={{ width: `${Math.min(recommendations.reduce((acc, curr) => acc + curr.certs.length, 0) * 10, 100)}%` }}></div>
          </div>
           <p className="text-xs text-slate-500 mt-3 font-medium flex items-center gap-1">
             <span className="text-cyan-400">●</span> To reach next level
          </p>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="bg-white rounded-lg shadow-panel border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h4 className="font-bold text-slate-900">Action Plan & Recommendations</h4>
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Generated by Oriens Engine</span>
        </div>
        <div className="divide-y divide-slate-100">
          {recommendations.length > 0 ? (
            recommendations.map((rec, idx) => (
              <div key={idx} className="p-6 hover:bg-slate-50 transition-colors group">
                 <div className="flex flex-col md:flex-row gap-6 mb-4">
                     <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                           {rec.isCritical ? (
                               <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide flex items-center gap-1">
                                   <AlertCircle size={10} /> Critical Gap
                               </span>
                           ) : (
                               <span className="bg-cyan-50 text-cyan-700 border border-cyan-100 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide flex items-center gap-1">
                                   <TrendingUp size={10} /> Development Area
                               </span>
                           )}
                           <span className="text-slate-300">|</span>
                           <h5 className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors">{rec.skillName}</h5>
                        </div>
                        <p className="text-sm text-slate-600 mb-4 leading-relaxed max-w-3xl">
                            <span className="font-semibold text-slate-900">Goal:</span> Reach Level {rec.targetLevel} - {rec.description}
                        </p>
                        
                        {rec.certs.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              {rec.certs.map((cert, cIdx) => (
                                <span key={cIdx} className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                                  <Award size={12} className="text-cyan-500" />
                                  {cert}
                                </span>
                              ))}
                            </div>
                        )}
                     </div>
                     <div className="flex items-start justify-end">
                        <div className="text-right">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Gap Size</div>
                            <div className="text-2xl font-bold text-slate-900">{rec.gapSize} <span className="text-sm font-normal text-slate-400">Levels</span></div>
                        </div>
                     </div>
                 </div>

                 {/* Action Items */}
                 <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                    <h6 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Activity size={12} /> Recommended Actions
                    </h6>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {rec.suggestedActions.map((action, aIdx) => (
                            <div key={aIdx} className="bg-white p-3 rounded border border-slate-200 flex items-center justify-between hover:border-blue-300 transition-colors cursor-pointer group/action">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded bg-blue-50 text-blue-600 flex items-center justify-center group-hover/action:bg-blue-600 group-hover/action:text-white transition-colors">
                                        <action.icon size={16} />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{action.type}</div>
                                        <div className="text-sm font-semibold text-slate-700">{action.label}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100 flex items-center gap-1">
                                        <Calendar size={10} /> {action.duration}
                                    </span>
                                    <ArrowRight size={14} className="text-slate-300 group-hover/action:text-blue-500" />
                                </div>
                            </div>
                        ))}
                    </div>
                 </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center">
              <div className="mx-auto w-12 h-12 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4 border border-green-100">
                <CheckCircle size={24} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">100% Compliant</h3>
              <p className="text-slate-500 text-sm mt-1">Excellent work. You meet all competency requirements for your current role.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});