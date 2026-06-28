import React, { useMemo, useState } from 'react';
import { User, Skill, Role, EvaluationQuestion } from '../types';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import {
  Users, 
  MessageSquare, 
  CheckCircle, 
  Clock, 
  Calendar,
  User as UserIcon,
  ChevronRight,
  ClipboardCheck,
  Search,
  ArrowRight,
  ShieldAlert,
  ListChecks,
  HelpCircle
} from 'lucide-react';

interface ManagerialInterviewsProps {
  currentUser: User;
}

export const ManagerialInterviews: React.FC<ManagerialInterviewsProps> = ({ currentUser }) => {
  const [selectedSubordinateId, setSelectedSubordinateId] = useState<string | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [score, setScore] = useState<number>(3);
  // Per-question interview ratings (1-5), keyed by question id. Used when the
  // skill defines predefined Evaluation Guide questions; the overall score is
  // then derived from these instead of a single manual rating.
  const [questionRatings, setQuestionRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const storeVersion = useStoreData();

  const isManager = useMemo(() => dataService.isManager(currentUser), [currentUser, storeVersion]);
  const subordinates = useMemo(() => dataService.getSubordinates(currentUser.id), [currentUser.id, storeVersion]);
  
  const selectedSubordinate = useMemo(() => 
    subordinates.find(s => s.id === selectedSubordinateId), 
    [subordinates, selectedSubordinateId]
  );

  const getInterviewSkills = (user: User) => {
    if (!user.jobProfileId || !user.orgLevel) return [];
    
    const jobProfile = dataService.getJobProfile(user.jobProfileId);
    if (!jobProfile) return [];

    const levelRequirements = dataService.getEffectiveRequirements(jobProfile);
    return levelRequirements
      .map(req => dataService.getSkill(req.skillId))
      .filter((s): s is Skill => !!s && (dataService.skillHasMethod(s.id, 'INTERVIEW') || dataService.skillHasMethod(s.id, 'PRACTICAL_DEMO')));
  };

  const myInterviewSkills = useMemo(() => getInterviewSkills(currentUser), [currentUser, storeVersion]);
  const subordinateInterviewSkills = useMemo(() =>
    selectedSubordinate ? getInterviewSkills(selectedSubordinate) : [],
    [selectedSubordinate, storeVersion]
  );

  // Predefined interview questions for the selected subordinate + skill, pulled
  // from the skill library's INTERVIEW / PRACTICAL_DEMO method blocks (audience-
  // filtered for this employee). Gives the interviewer a structured script to
  // evaluate against.
  const interviewGuide = useMemo(() => {
    if (!selectedSubordinateId || !selectedSkillId) return { prompts: [] as string[], questions: [] as EvaluationQuestion[] };
    const blocks = dataService
      .getApplicableMethodsForUserSkill(selectedSubordinateId, selectedSkillId)
      .filter(m => m.method === 'INTERVIEW' || m.method === 'PRACTICAL_DEMO');
    const prompts = blocks
      .map(b => b.assessmentQuestion?.trim())
      .filter((p): p is string => !!p);
    const seen = new Set<string>();
    const questions: EvaluationQuestion[] = [];
    for (const b of blocks) {
      for (const q of b.questions || []) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        questions.push(q);
      }
    }
    return { prompts: Array.from(new Set(prompts)), questions };
  }, [selectedSubordinateId, selectedSkillId, storeVersion]);

  // When a skill has predefined questions, the overall interview score is the
  // weight-aware average of the per-question ratings (rounded to one decimal).
  // Falls back to a simple average when no weights are configured.
  const hasGuideQuestions = interviewGuide.questions.length > 0;
  const ratedCount = interviewGuide.questions.filter(q => !!questionRatings[q.id]).length;
  const computedScore = useMemo(() => {
    if (!hasGuideQuestions) return null;
    const rated = interviewGuide.questions.filter(q => !!questionRatings[q.id]);
    if (rated.length === 0) return 0;
    const totalWeight = rated.reduce((sum, q) => sum + (q.weight && q.weight > 0 ? q.weight : 1), 0);
    const weighted = rated.reduce((sum, q) => sum + questionRatings[q.id] * (q.weight && q.weight > 0 ? q.weight : 1), 0);
    return Math.round((weighted / totalWeight) * 10) / 10;
  }, [hasGuideQuestions, interviewGuide.questions, questionRatings]);

  const selectSkill = (skillId: string | null) => {
    setSelectedSkillId(skillId);
    setQuestionRatings({});
    setScore(3);
  };

  const getSkillStatus = (userId: string, skillId: string) => {
    const assessments = dataService.getAssessments({ subjectId: userId, skillId });
    return assessments
      .filter(a => a.type === 'INTERVIEW')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;
  };

  const handleSaveInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubordinateId || !selectedSkillId) return;

    // When the skill has predefined questions, every one must be rated and the
    // overall score is derived from them; otherwise fall back to the single rating.
    let finalScore = score;
    let questionScores: { questionId: string; score: number }[] | undefined;
    if (hasGuideQuestions) {
      if (ratedCount < interviewGuide.questions.length) {
        alert('Please rate every question before submitting.');
        return;
      }
      finalScore = computedScore ?? 0;
      questionScores = interviewGuide.questions.map(q => ({ questionId: q.id, score: questionRatings[q.id] }));
    }

    setIsSubmitting(true);
    try {
      await dataService.addAssessment({
        raterId: currentUser.id,
        subjectId: selectedSubordinateId,
        skillId: selectedSkillId,
        score: finalScore,
        comment,
        method: 'INTERVIEW',
        type: 'INTERVIEW',
        ...(questionScores ? { questionScores } : {}),
      });

      setSuccessMessage('Interview result recorded successfully.');
      setSelectedSkillId(null);
      setComment('');
      setScore(3);
      setQuestionRatings({});

      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error(err);
      alert('Failed to save interview result.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isManager) {
    return (
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="pb-6 border-b border-slate-300">
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Managerial Interviews</h2>
          <p className="text-slate-700 text-sm mt-1">Review your technical interview requirements and evaluation results.</p>
        </div>

        {myInterviewSkills.length === 0 ? (
          <div className="bg-white border border-slate-200 p-12 text-center rounded-none shadow-sm">
             <div className="inline-flex items-center justify-center w-16 h-16 rounded-none bg-slate-50 text-slate-400 mb-4">
              <CheckCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">No Interviews Required</h3>
            <p className="text-slate-600 max-w-md mx-auto">
              Your current role does not require any technical or leadership interviews at this time.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {myInterviewSkills.map(skill => {
              const result = getSkillStatus(currentUser.id, skill.id);
              const nextDate = dataService.getNextAssessmentDate(currentUser.id, skill.id);
              const isExpired = nextDate ? new Date() >= nextDate : false;
              const isCompleted = !!result && !isExpired;
              const isRenewalDue = !!result && isExpired;

              return (
                <div key={skill.id} className={`bg-white border ${isRenewalDue ? 'border-amber-300' : 'border-slate-300'} p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-400 transition-colors shadow-sm`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {skill.code && (
                        <span className="text-[10px] font-black uppercase tracking-wide text-blue-600 font-bold whitespace-nowrap">{skill.code}</span>
                      )}
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500 whitespace-nowrap">{skill.category}</span>
                      {isCompleted && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight text-emerald-600 px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 whitespace-nowrap">
                          <CheckCircle size={10} /> Completed
                        </span>
                      )}
                      {isRenewalDue && (
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-tight text-amber-700 px-1.5 py-0.5 bg-amber-50 border border-amber-200 whitespace-nowrap">
                          <Clock size={10} /> Renewal Due
                        </span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">{skill.name}</h3>
                    <p className="text-xs text-slate-600 mt-1 max-w-md">{skill.description || 'Structured technical interview with your direct supervisor.'}</p>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    {isCompleted ? (
                      <div className="text-right">
                        <div className="text-2xl font-black text-slate-900 leading-none">{result?.score}/5</div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mt-1">Interview Score</div>
                      </div>
                    ) : isRenewalDue ? (
                      <div className="text-right flex items-center gap-3">
                        <div className="flex items-center gap-2 text-amber-600">
                          <Clock size={18} />
                          <span className="text-xs font-bold uppercase tracking-wider">Renewal Due</span>
                        </div>
                        <div className="border-l border-slate-200 pl-3">
                          <div className="text-xl font-black text-slate-400 leading-none">{result?.score}/5</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1">Old Score</div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-amber-600">
                        <Clock size={16} />
                        <span className="text-xs font-bold uppercase tracking-wider">Pending</span>
                      </div>
                    )}
                    <ChevronRight size={20} className="text-slate-300" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-20">
      <div className="pb-6 border-b border-slate-300 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Interview Portal</h2>
          <p className="text-slate-700 text-sm mt-1">Conduct and record technical interviews for your reporting team members.</p>
        </div>
        <div className="bg-slate-900 p-2 rounded-sm border border-black flex items-center gap-2 text-sm text-white font-medium">
          <MessageSquare size={16} />
          <span>Managerial Interface</span>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-none flex items-center gap-3 animate-in fade-in duration-300">
          <CheckCircle size={20} className="text-emerald-500" />
          <p className="font-bold text-sm tracking-tight">{successMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: Subordinates list */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-xs font-black text-slate-900 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            <Users size={14} /> My Reporting Team
          </h3>
          <div className="bg-white border border-slate-300  divide-y divide-slate-100 overflow-hidden shadow-sm">
            {subordinates.map(sub => (
              <button
                key={sub.id}
                onClick={() => { setSelectedSubordinateId(sub.id); selectSkill(null); }}
                className={`w-full text-left p-4 flex items-center gap-4 transition-all ${selectedSubordinateId === sub.id ? 'bg-slate-50 border-l-4 border-slate-900' : 'hover:bg-slate-50 border-l-4 border-transparent'}`}
              >
                <div className="w-10 h-10 rounded-none bg-slate-100 border border-slate-300 flex-shrink-0 overflow-hidden">
                  <img src={sub.avatarUrl} alt={sub.name} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900 text-sm truncate">{sub.name}</div>
                  <div className="text-[10px] text-slate-600 font-medium truncate uppercase tracking-tight">
                    {dataService.getJobProfile(sub.jobProfileId || '')?.title || 'No Role'}
                  </div>
                </div>
                <ChevronRight size={18} className={`${selectedSubordinateId === sub.id ? 'text-slate-900 translate-x-1' : 'text-slate-300'} transition-all`} />
              </button>
            ))}
            {subordinates.length === 0 && (
              <div className="p-8 text-center text-slate-500 italic text-sm">
                No active reporting lines found.
              </div>
            )}
          </div>
        </div>

        {/* Right column: Interview Form */}
        <div className="lg:col-span-2">
          {!selectedSubordinate ? (
            <div className="bg-slate-50 border border-slate-300 border-dashed h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 rounded-none">
              <UserIcon size={48} className="mb-4 text-slate-300" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">Select a Team Member</h3>
              <p className="text-slate-600 max-w-xs text-sm">
                Choose a subordinate from the list to begin conducting their required technical or managerial interviews.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-300 shadow-sm rounded-none h-full flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="p-6 border-b border-slate-300 bg-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-none border border-slate-300 overflow-hidden bg-white">
                      <img src={selectedSubordinate.avatarUrl} alt={selectedSubordinate.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-lg leading-tight uppercase tracking-tight">{selectedSubordinate.name}</h4>
                      <div className="text-xs text-slate-600 mt-0.5">Hierarchy Level: <span className="font-bold text-slate-900">{selectedSubordinate.orgLevel}</span></div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide block mb-1">Interview Requirements</span>
                    <span className="text-sm font-bold text-slate-900">{subordinateInterviewSkills.length} Total Skills</span>
                  </div>
               </div>

               <div className="p-6 flex-grow ">
                  <h5 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <ClipboardCheck size={14} className="text-slate-400" /> Select Skill to Evaluate
                  </h5>
                  
                  <div className="grid grid-cols-1 gap-4 mb-8">
                    {subordinateInterviewSkills.map(skill => {
                      const result = getSkillStatus(selectedSubordinate.id, skill.id);
                      const isSelected = selectedSkillId === skill.id;
                      
                      return (
                        <div 
                          key={skill.id}
                          className={`p-4 border transition-all cursor-pointer relative ${isSelected ? 'border-slate-900 bg-slate-50 shadow-md ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-300'}`}
                          onClick={() => selectSkill(skill.id)}
                        >
                          {isSelected && <div className="absolute top-0 right-0 p-1 bg-slate-900 text-white"><CheckCircle size={14} /></div>}
                          <div className="flex justify-between items-start gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap gap-2 mb-1">
                                {skill.code && (
                                  <span className="text-[10px] font-black uppercase text-blue-600 tracking-wide whitespace-nowrap">
                                    {skill.code}
                                  </span>
                                )}
                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wide whitespace-nowrap">
                                  {skill.category}
                                </span>
                              </div>
                              <h6 className="font-bold text-slate-900 truncate">{skill.name}</h6>
                            </div>
                            {result ? (
                              <div className="text-right shrink-0">
                                <span className="text-lg font-black text-slate-900">{result.score}/5</span>
                                <span className="text-[9px] font-black uppercase block text-emerald-600 mt-1 whitespace-nowrap">Verified</span>
                              </div>
                            ) : (
                              <span className="text-[9px] font-black uppercase text-amber-600 px-1.5 py-0.5 border border-amber-200 shrink-0 whitespace-nowrap">Pending Interview</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {subordinateInterviewSkills.length === 0 && (
                      <div className="bg-slate-50 border border-slate-200 p-8 text-center text-slate-500 rounded-none italic text-sm">
                        This employee has no skills requiring a managerial interview at their current level.
                      </div>
                    )}
                  </div>

                  {selectedSkillId && (
                    <form onSubmit={handleSaveInterview} className="space-y-6 pt-6 border-t border-slate-100 animate-in slide-in-from-bottom-4 duration-300">
                      <div className="bg-slate-900 p-4 rounded-none text-white flex items-center gap-3">
                        <ShieldAlert size={20} className="text-blue-400" />
                        <div>
                          <p className="text-xs font-bold uppercase tracking-tight">Conducting Active Interview</p>
                          <p className="text-sm font-medium">{subordinateInterviewSkills.find(s => s.id === selectedSkillId)?.name}</p>
                        </div>
                      </div>

                      {(interviewGuide.prompts.length > 0 || interviewGuide.questions.length > 0) ? (
                        <div className="border border-slate-300 bg-slate-50">
                          <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-2">
                            <ListChecks size={16} className="text-blue-600" />
                            <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Evaluation Guide — Predefined Questions</span>
                          </div>
                          <div className="p-4 space-y-4">
                            {interviewGuide.prompts.map((prompt, i) => (
                              <p key={`prompt-${i}`} className="text-sm text-slate-700 italic leading-relaxed">{prompt}</p>
                            ))}
                            {interviewGuide.questions.length > 0 && (
                              <ol className="space-y-4">
                                {interviewGuide.questions.map((q, i) => (
                                  <li key={q.id} className="flex gap-3 pb-4 border-b border-slate-200 last:border-b-0 last:pb-0">
                                    <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-slate-900 text-white text-[11px] font-black">{i + 1}</span>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          {q.title && <div className="text-xs font-black text-slate-900 uppercase tracking-tight">{q.title}</div>}
                                          <p className="text-sm text-slate-800 font-medium leading-snug">{q.text}</p>
                                        </div>
                                        {q.weight && q.weight > 0 && (
                                          <span className="flex-shrink-0 text-[9px] font-black uppercase tracking-tight text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5">Weight {q.weight}%</span>
                                        )}
                                      </div>
                                      {q.expectedCriteria && (
                                        <p className="text-xs text-slate-500 mt-1 flex items-start gap-1.5">
                                          <HelpCircle size={12} className="mt-0.5 flex-shrink-0 text-emerald-600" />
                                          <span><span className="font-bold uppercase tracking-tight text-emerald-700">Look for: </span>{q.expectedCriteria}</span>
                                        </p>
                                      )}
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">Rate</span>
                                        {[1, 2, 3, 4, 5].map(num => (
                                          <button
                                            key={num}
                                            type="button"
                                            onClick={() => setQuestionRatings(prev => ({ ...prev, [q.id]: num }))}
                                            className={`w-8 h-8 flex items-center justify-center font-black text-sm transition-all border ${questionRatings[q.id] === num ? 'bg-slate-900 text-white border-black scale-110 shadow' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}
                                          >
                                            {num}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="border border-slate-200 border-dashed bg-slate-50 px-4 py-3 flex items-center gap-2 text-slate-500">
                          <HelpCircle size={14} />
                          <span className="text-xs italic">No predefined questions configured for this skill. Conduct the interview based on the required proficiency level.</span>
                        </div>
                      )}

                      {hasGuideQuestions ? (
                        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Interview Rating</p>
                            <p className="text-xs text-slate-300 mt-0.5">
                              {interviewGuide.questions.some(q => q.weight && q.weight > 0)
                                ? 'Weighted average of the per-question ratings.'
                                : 'Average of the per-question ratings.'}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="text-3xl font-black leading-none">{ratedCount === interviewGuide.questions.length ? computedScore : '—'}<span className="text-lg text-slate-400">/5</span></div>
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-1">{ratedCount}/{interviewGuide.questions.length} Questions Rated</div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-black text-slate-900 uppercase tracking-widest mb-3">Interview Result (1-5)</label>
                          <div className="flex gap-4">
                            {[1, 2, 3, 4, 5].map(num => (
                              <button
                                key={num}
                                type="button"
                                onClick={() => setScore(num)}
                                className={`w-12 h-12 flex items-center justify-center font-black text-lg transition-all border ${score === num ? 'bg-slate-900 text-white border-black scale-110 shadow-lg' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-500'}`}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                          <div className="flex justify-between mt-2 px-1">
                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Unsatisfactory</span>
                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Mastery</span>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-black text-slate-900 uppercase tracking-widest mb-3">Interviewer Comments & Notes</label>
                        <textarea
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          className="w-full bg-white border border-slate-300 p-4 text-slate-900 text-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 outline-none min-h-[120px] rounded-none"
                          placeholder="Provide specific details about the candidate's performance, technical knowledge, and any gaps identified during the interview..."
                          required
                        />
                      </div>

                      <div className="flex gap-3">
                         <button
                           type="button"
                           onClick={() => selectSkill(null)}
                           className="px-6 py-3 border border-slate-300 text-slate-600 font-bold uppercase tracking-wider text-xs hover:bg-slate-50 transition-all"
                         >
                           Cancel
                         </button>
                         <button
                          type="submit"
                          disabled={isSubmitting || (hasGuideQuestions && ratedCount < interviewGuide.questions.length)}
                          className="flex-grow bg-blue-700 hover:bg-blue-800 text-white font-bold py-3 uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? 'Recording...' : 'Update Assessment Result'}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </form>
                  )}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
