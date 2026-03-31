import React, { useMemo, useState } from 'react';
import { User, Skill, JobProfile } from '../types';
import { dataService } from '../services/store';
import { 
  ExternalLink, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  BookOpen,
  ArrowRight,
  Monitor
} from 'lucide-react';

interface OnlineAssessmentsProps {
  currentUser: User;
}

export const OnlineAssessments: React.FC<OnlineAssessmentsProps> = ({ currentUser }) => {
  const [successMessage, setSuccessMessage] = useState('');

  const requiredSkills = useMemo(() => {
    if (!currentUser.jobProfileId || !currentUser.orgLevel) return [];
    
    const jobProfile = dataService.getJobProfile(currentUser.jobProfileId);
    if (!jobProfile) return [];

    const levelRequirements = jobProfile.requirements[currentUser.orgLevel] || [];
    return levelRequirements
      .map(req => dataService.getSkill(req.skillId))
      .filter((s): s is Skill => !!s && s.assessmentMethod === 'ONLINE_ASSESSMENT');
  }, [currentUser]);

  const assessments = useMemo(() => {
    return dataService.getAssessments({ subjectId: currentUser.id });
  }, [currentUser.id]);

  const getSkillStatus = (skillId: string) => {
    const latest = assessments
      .filter(a => a.skillId === skillId && a.type === 'ONLINE')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    return latest || null;
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="pb-6 border-b border-slate-300 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Online Assessments</h2>
          <p className="text-slate-700 text-sm mt-1">Access external assessment platforms and track your technical evaluation progress.</p>
        </div>
        <div className="bg-blue-50 p-2 rounded-sm border border-blue-200 flex items-center gap-2 text-sm text-blue-700 font-medium">
          <Monitor size={16} />
          <span>System Portal</span>
        </div>
      </div>

      {requiredSkills.length === 0 ? (
        <div className="bg-white border border-slate-200 p-12 text-center rounded-none shadow-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-none bg-slate-50 text-slate-400 mb-4">
            <CheckCircle size={32} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No Online Assessments Required</h3>
          <p className="text-slate-600 max-w-md mx-auto">
            Your current job profile and hierarchy level do not require any external online assessments at this time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {requiredSkills.map(skill => {
            const result = getSkillStatus(skill.id);
            const isCompleted = !!result;

            return (
              <div key={skill.id} className="bg-white border border-slate-300 overflow-hidden flex flex-col md:flex-row shadow-sm hover:border-slate-400 transition-all">
                <div className={`w-2 shrink-0 ${isCompleted ? 'bg-emerald-500' : 'bg-blue-600'}`}></div>
                
                <div className="p-6 flex-grow flex flex-col md:flex-row gap-6 items-start md:items-center">
                  <div className="flex-grow">
                    <div className="flex items-center gap-3 mb-2">
                       <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200">
                        {skill.category}
                      </span>
                      {isCompleted && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight text-emerald-600 px-2 py-0.5 bg-emerald-50 border border-emerald-100">
                          <CheckCircle size={10} /> Completed
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-1">{skill.name}</h3>
                    <p className="text-slate-600 text-sm max-w-2xl">{skill.description || 'Professional technical assessment for ' + skill.name + ' competency.'}</p>
                    
                    {skill.assessmentLink && (
                       <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 font-medium">
                          <AlertCircle size={14} className="text-amber-500" />
                          <span>Assessments take place on an external platform (e.g. Google Forms).</span>
                       </div>
                    )}
                  </div>

                  <div className="w-full md:w-64 shrink-0 flex flex-col gap-3">
                    {isCompleted ? (
                      <div className="bg-slate-50 border border-slate-200 p-4 rounded-none">
                        <div className="flex justify-between items-end mb-1">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Assessment Score</span>
                          <span className="text-2xl font-black text-slate-900">{result.score}/5</span>
                        </div>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                           <div className="bg-emerald-500 h-full" style={{ width: `${(result.score/5) * 100}%` }}></div>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 italic">Completed on {new Date(result.date).toLocaleDateString()}</p>
                      </div>
                    ) : (
                      <div className="bg-blue-50 border border-blue-100 p-4 rounded-none">
                        <div className="flex items-center gap-2 text-blue-700 mb-2">
                          <Clock size={16} />
                          <span className="text-xs font-bold uppercase tracking-wider">Status: Pending</span>
                        </div>
                        <p className="text-[11px] text-blue-600/80 leading-tight">
                          Please complete the online assessment to fulfill this competency requirement.
                        </p>
                      </div>
                    )}

                    <a
                      href={skill.assessmentLink || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wider transition-all border ${
                        skill.assessmentLink 
                        ? 'bg-slate-900 text-white hover:bg-black border-black' 
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200'
                      }`}
                    >
                      {skill.assessmentLink ? 'Begin Assessment' : 'No Link Provided'}
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Database/Integration Information */}
      <div className="bg-slate-50 border border-slate-300 p-6 rounded-none mt-12">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-sm bg-white border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
            <BookOpen size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-2">Assessment Integration Note</h4>
            <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
              EPROM CMS is structured to ingest results from external assessment providers. Once you complete an assessment, the final score and evaluator comments will be synchronized with your professional record based on your workforce identifier. This ensures your competency matrix remains updated without requiring manual evidence submission for these specific skills.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
