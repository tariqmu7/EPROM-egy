import React, { useState } from 'react';
import { User, JobProfile } from '../types';
import { dataService } from '../services/store';
import { UserCircle, Send, Star, Info, ChevronUp, ChevronDown, Check, Clock, History, FileText } from 'lucide-react';

interface AssessmentPortalProps {
  currentUser: User;
}

export const AssessmentPortal: React.FC<AssessmentPortalProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'SELF' | 'PEER' | 'SUBORDINATE'>('SELF');
  const [viewMode, setViewMode] = useState<'ASSESS' | 'HISTORY'>('ASSESS');
  
  const [selectedSubject, setSelectedSubject] = useState<User | null>(activeTab === 'SELF' ? currentUser : null);
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  // Determine selectable users based on tab
  const getSubjects = () => {
    switch(activeTab) {
      case 'SELF': return [currentUser];
      case 'PEER': return dataService.getPeers(currentUser.id);
      case 'SUBORDINATE': return dataService.getSubordinates(currentUser.id);
      default: return [];
    }
  };

  const subjects = getSubjects();

  // Reset when tab changes
  React.useEffect(() => {
    if (activeTab === 'SELF') {
      setSelectedSubject(currentUser);
    } else {
      setSelectedSubject(null);
    }
    setRatings({});
    setSubmitted(false);
    setViewMode('ASSESS'); // Default to assessment view on tab switch
  }, [activeTab, currentUser]);

  const subjectJobProfile = selectedSubject?.jobProfileId ? dataService.getJobProfile(selectedSubject.jobProfileId) : null;
  const subjectLevel = selectedSubject?.orgLevel;
  
  // Get skills relevant to the subject's specific level
  const applicableSkills = (subjectJobProfile && subjectLevel) 
    ? subjectJobProfile.requirements[subjectLevel] || [] 
    : [];

  // Fetch History Logic
  const getHistoryData = () => {
    if (activeTab === 'SELF') {
        // Show assessments received by me (from myself or managers)
        return dataService.getAssessments({ subjectId: currentUser.id });
    } else {
        // Show assessments I gave to others
        // If subject selected, filter by that subject, else show all my outgoing
        return dataService.getAssessments({ 
            raterId: currentUser.id, 
            subjectId: selectedSubject?.id 
        });
    }
  };

  const historyData = getHistoryData();

  const handleRatingChange = (skillId: string, rating: number) => {
    setRatings(prev => ({ ...prev, [skillId]: rating }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject) return;

    Object.entries(ratings).forEach(([skillId, score]) => {
      dataService.addAssessment({
        raterId: currentUser.id,
        subjectId: selectedSubject.id,
        skillId: skillId,
        score: score as number,
        comment: 'Questionnaire Assessment Submission',
        type: activeTab === 'SUBORDINATE' ? 'MANAGER' : activeTab === 'SELF' ? 'SELF' : 'PEER'
      });
    });

    setSubmitted(true);
    // Reset after delay
    setTimeout(() => {
        setSubmitted(false);
        setRatings({});
        if(activeTab !== 'SELF') setSelectedSubject(null);
        setViewMode('HISTORY'); // Switch to history to show the new record
    }, 2000);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* Top Header & Tab Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Competency Assessment</h2>
          <p className="text-slate-500 text-sm">Evaluate performance using behavioral questionnaires</p>
        </div>
        <div className="flex gap-4">
             {/* Main Context Tabs */}
            <div className="bg-white rounded-lg p-1 flex shadow-sm border border-slate-200">
            {(['SELF', 'PEER', 'SUBORDINATE'] as const).map(tab => (
                <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                }`}
                >
                {tab === 'SELF' ? 'Self Review' : tab === 'PEER' ? 'Peer Review' : 'Subordinates'}
                </button>
            ))}
            </div>
            
            {/* View Mode Toggle */}
            <div className="bg-white rounded-lg p-1 flex shadow-sm border border-slate-200">
                <button 
                    onClick={() => setViewMode('ASSESS')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'ASSESS' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}`}
                >
                    <FileText size={16}/> New
                </button>
                <button 
                    onClick={() => setViewMode('HISTORY')}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${viewMode === 'HISTORY' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}`}
                >
                    <History size={16}/> History
                </button>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column: Subject Selection (Hidden for Self) */}
        {activeTab !== 'SELF' && (
          <div className="md:col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-fit sticky top-6">
            <h3 className="font-semibold text-slate-700 mb-4 px-2">Select Employee</h3>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {subjects.length > 0 ? subjects.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => { setSelectedSubject(sub); setRatings({}); setSubmitted(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left ${
                    selectedSubject?.id === sub.id ? 'bg-teal-50 border border-teal-200' : 'hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {sub.avatarUrl ? <img src={sub.avatarUrl} alt="" className="w-full h-full object-cover"/> : <UserCircle size={20} className="text-slate-500"/>}
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${selectedSubject?.id === sub.id ? 'text-teal-900' : 'text-slate-700'}`}>{sub.name}</p>
                    <p className="text-xs text-slate-500 truncate">{sub.email}</p>
                  </div>
                </button>
              )) : (
                <div className="p-4 text-center text-sm text-slate-400">No employees found for this category.</div>
              )}
            </div>
          </div>
        )}

        {/* Right Column: Content Area */}
        <div className={`${activeTab === 'SELF' ? 'md:col-span-12' : 'md:col-span-8'}`}>
          {selectedSubject ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 min-h-[500px]">
              
              {/* Header inside the card */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-bold text-slate-900">
                        {viewMode === 'ASSESS' ? 'New Assessment for:' : 'Assessment History:'} {selectedSubject.name}
                    </h3>
                    <p className="text-slate-500 text-sm mt-1">
                        {subjectJobProfile?.title || 'No Job Profile'} • Level: <span className="font-semibold">{subjectLevel || 'N/A'}</span>
                    </p>
                </div>
                {viewMode === 'ASSESS' && (
                    <span className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full border border-blue-100">
                        Questionnaire Mode
                    </span>
                )}
              </div>

              {/* VIEW: NEW ASSESSMENT (Questionnaire) */}
              {viewMode === 'ASSESS' && (
                  <div className="p-6">
                    {submitted ? (
                        <div className="flex flex-col items-center justify-center py-12 text-teal-600 animate-fade-in">
                        <div className="bg-teal-100 p-4 rounded-full mb-4">
                            <Send size={32} />
                        </div>
                        <h4 className="text-xl font-bold">Assessment Submitted Successfully!</h4>
                        <p className="text-slate-500 text-sm mt-2">Redirecting to history...</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                        {subjectJobProfile && subjectLevel ? (
                            applicableSkills.length > 0 ? (
                            <div className="space-y-10">
                            {applicableSkills.map((req, idx) => {
                                const skillData = dataService.getSkill(req.skillId);
                                if (!skillData) return null;
                                const currentRating = ratings[req.skillId];

                                return (
                                <div key={req.skillId} className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{animationDelay: `${idx * 100}ms`}}>
                                    <div className="mb-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">{skillData.category}</span>
                                            <span className="text-xs font-medium text-slate-400">Target Level: {req.requiredLevel}</span>
                                        </div>
                                        <h4 className="text-lg font-bold text-slate-800 flex items-start gap-2">
                                            <span className="text-teal-600 mt-1">Q{idx+1}.</span> 
                                            {skillData.assessmentQuestion || `Select the statement that best matches the employee's proficiency in "${skillData.name}".`}
                                        </h4>
                                    </div>

                                    {/* Behavioral Options (BARS) */}
                                    <div className="space-y-3 pl-4 border-l-2 border-slate-100 ml-2">
                                        {[1, 2, 3, 4, 5].map(level => {
                                            const isSelected = currentRating === level;
                                            const isTarget = req.requiredLevel === level;
                                            
                                            return (
                                                <label 
                                                    key={level}
                                                    className={`relative flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                                                        isSelected 
                                                        ? 'bg-teal-50 border-teal-500 ring-1 ring-teal-500 z-10' 
                                                        : 'bg-white border-slate-200 hover:border-teal-200'
                                                    }`}
                                                >
                                                    <input 
                                                        type="radio" 
                                                        name={`skill-${req.skillId}`}
                                                        value={level}
                                                        checked={isSelected}
                                                        onChange={() => handleRatingChange(req.skillId, level)}
                                                        className="mt-1 w-4 h-4 text-teal-600 focus:ring-teal-500 border-gray-300"
                                                    />
                                                    <div className="flex-1">
                                                        <div className="flex justify-between">
                                                            <span className={`text-sm font-bold ${isSelected ? 'text-teal-800' : 'text-slate-700'}`}>Level {level}</span>
                                                            {isTarget && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">Target</span>}
                                                        </div>
                                                        <p className={`text-sm mt-1 ${isSelected ? 'text-teal-700' : 'text-slate-500'}`}>
                                                            {skillData.levels[level]?.description || 'No description available.'}
                                                        </p>
                                                    </div>
                                                    {isSelected && <Check size={20} className="text-teal-600 absolute right-4 top-4" />}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                                );
                            })}
                            
                            <div className="pt-6 border-t border-slate-100 flex justify-end sticky bottom-0 bg-white p-4 -mx-4 -mb-4 rounded-b-xl shadow-inner">
                                <button 
                                    type="submit"
                                    disabled={Object.keys(ratings).length !== applicableSkills.length}
                                    className="bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-8 py-3 rounded-lg font-bold shadow-lg shadow-teal-200/50 transition-all flex items-center gap-2"
                                >
                                    <Send size={18} />
                                    Submit Evaluation
                                </button>
                            </div>
                            </div>
                            ) : (
                                <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                                    No competency requirements found for this user's specific level ({subjectLevel}).
                                </div>
                            )
                        ) : (
                            <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                            {subjectJobProfile ? "User has no assigned Hierarchy Level." : "No job profile assigned to this user."} Cannot perform assessment.
                            </div>
                        )}
                        </form>
                    )}
                  </div>
              )}

              {/* VIEW: HISTORY */}
              {viewMode === 'HISTORY' && (
                  <div className="flex flex-col h-full">
                      {historyData.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                                    <tr>
                                        <th className="p-4">Date</th>
                                        <th className="p-4">{activeTab === 'SELF' ? 'Evaluator' : 'Subject'}</th>
                                        <th className="p-4">Skill</th>
                                        <th className="p-4">Rating</th>
                                        <th className="p-4">Assessment Type</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {historyData.map(record => {
                                        const skillName = dataService.getSkill(record.skillId)?.name || 'Unknown Skill';
                                        const otherParty = activeTab === 'SELF' 
                                            ? dataService.getAllUsers().find(u => u.id === record.raterId)?.name 
                                            : dataService.getAllUsers().find(u => u.id === record.subjectId)?.name;

                                        return (
                                            <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="p-4 text-slate-500">
                                                    <div className="flex items-center gap-2">
                                                        <Clock size={14}/> {new Date(record.date).toLocaleDateString()}
                                                    </div>
                                                </td>
                                                <td className="p-4 font-medium text-slate-800">{otherParty || 'Unknown'}</td>
                                                <td className="p-4 text-slate-700">{skillName}</td>
                                                <td className="p-4">
                                                    <span className={`inline-block w-8 h-8 rounded-full text-center leading-8 font-bold text-xs ${
                                                        record.score >= 4 ? 'bg-green-100 text-green-700' :
                                                        record.score >= 3 ? 'bg-blue-100 text-blue-700' :
                                                        'bg-amber-100 text-amber-700'
                                                    }`}>
                                                        {record.score}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-semibold">
                                                        {record.type}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                      ) : (
                          <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400">
                              <History size={48} className="mb-4 opacity-20"/>
                              <p>No assessment history found.</p>
                          </div>
                      )}
                  </div>
              )}

            </div>
          ) : (
             <div className="h-full flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-400 p-12">
                <UserCircle size={48} className="mb-4 opacity-50" />
                <p>Select a person from the list to begin.</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};