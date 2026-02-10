import React from 'react';
import { User, JobProfile, Skill } from '../types';
import { dataService } from '../services/store';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip, BarChart, CartesianGrid, XAxis, YAxis, Bar, Legend } from 'recharts';
import { AlertCircle, CheckCircle, Award, BookOpen } from 'lucide-react';

interface EmployeeDashboardProps {
  user: User;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({ user }) => {
  const jobProfile = user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null;
  const userLevel = user.orgLevel;

  if (!jobProfile) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        No Job Profile assigned. Contact Admin.
      </div>
    );
  }

  if (!userLevel) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        You are not assigned to an organization level. Contact Admin to assign your position level.
      </div>
    );
  }

  // Get specific requirements for this user's level
  const levelRequirements = jobProfile.requirements[userLevel] || [];

  if (levelRequirements.length === 0) {
      return (
        <div className="flex items-center justify-center h-full text-slate-500">
            No specific competency requirements defined for your level ({userLevel}).
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

  // Recommendations based on gaps
  const recommendations = gaps.map(g => {
    // Ideally, we look at the level ABOVE current to find next step
    const nextLevel = g.current + 1;
    const levelDetails = g.skill?.levels[nextLevel <= 5 ? nextLevel : 5];
    return {
      skillName: g.skill?.name,
      targetLevel: nextLevel,
      certs: levelDetails?.requiredCertificates || [],
      description: levelDetails?.description
    };
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-slate-900">Competency Dashboard</h2>
        <p className="text-slate-500 mt-1">
          {jobProfile.title} <span className="mx-2">•</span> {dataService.getAllDepartments().find(d => d.id === user.departmentId)?.name} <span className="mx-2">•</span> Level: {userLevel}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Compliance Rate</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2">
                {Math.round((compliant.length / skillAnalysis.length) * 100)}%
              </h3>
            </div>
            <div className={`p-2 rounded-lg ${gaps.length === 0 ? 'bg-teal-100 text-teal-600' : 'bg-amber-100 text-amber-600'}`}>
              <CheckCircle size={24} />
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-4">{compliant.length} of {skillAnalysis.length} skills match required levels</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Skill Gaps</p>
              <h3 className="text-3xl font-bold text-red-600 mt-2">{gaps.length}</h3>
            </div>
            <div className="p-2 rounded-lg bg-red-100 text-red-600">
              <AlertCircle size={24} />
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-4">Skills requiring immediate attention</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase">Recommended Certs</p>
              <h3 className="text-3xl font-bold text-blue-600 mt-2">
                {recommendations.reduce((acc, curr) => acc + curr.certs.length, 0)}
              </h3>
            </div>
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <Award size={24} />
            </div>
          </div>
          <p className="text-sm text-slate-500 mt-4">To close current gaps</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Radar Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h4 className="text-lg font-bold text-slate-800 mb-6">Skill Profile Visualization</h4>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{fontSize: 12}} />
                <PolarRadiusAxis angle={30} domain={[0, 5]} />
                <Radar name="Current" dataKey="Current" stroke="#0d9488" fill="#14b8a6" fillOpacity={0.4} />
                <Radar name="Required" dataKey="Required" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
                <Legend />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Gap Bar Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h4 className="text-lg font-bold text-slate-800 mb-6">Gap Analysis Detail</h4>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} />
                <XAxis type="number" domain={[0, 5]} hide />
                <YAxis dataKey="subject" type="category" width={100} tick={{fontSize: 11}} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Current" fill="#14b8a6" name="Current Level" barSize={20} radius={[0, 4, 4, 0]} />
                <Bar dataKey="Required" fill="#ef4444" name="Target Level" barSize={20} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recommendations List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h4 className="text-lg font-bold text-slate-800">Action Plan & Recommendations</h4>
        </div>
        <div className="divide-y divide-slate-100">
          {recommendations.length > 0 ? (
            recommendations.map((rec, idx) => (
              <div key={idx} className="p-6 flex flex-col md:flex-row gap-6 hover:bg-slate-50 transition-colors">
                 <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                       <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded">Gap Detected</span>
                       <h5 className="font-bold text-slate-900">{rec.skillName}</h5>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">Target Level {rec.targetLevel}: {rec.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {rec.certs.map((cert, cIdx) => (
                        <span key={cIdx} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium border border-blue-100">
                          <Award size={14} />
                          {cert}
                        </span>
                      ))}
                    </div>
                 </div>
                 <div className="flex items-center">
                    <button className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 shadow-sm shadow-teal-200">
                      <BookOpen size={16} />
                      <span>Enroll in Course</span>
                    </button>
                 </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center">
              <div className="mx-auto w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4">
                <CheckCircle size={24} />
              </div>
              <h3 className="text-lg font-medium text-slate-900">You are fully compliant!</h3>
              <p className="text-slate-500">No skill gaps detected for your current job profile.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};