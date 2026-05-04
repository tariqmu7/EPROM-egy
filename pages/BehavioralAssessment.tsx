import React, { useState, useMemo, useEffect } from 'react';
import { dataService } from '../services/store';
import { User, Skill } from '../types';
import { Star, MessageSquare, Send, CheckCircle, User as UserIcon, Search, AlertTriangle } from 'lucide-react';

const UserCard = ({ user, isSelected, onClick, role, isSelf }: { user: User, isSelected: boolean, onClick: () => void, role?: string, isSelf?: boolean }) => {
  const jobProfile = user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null;
  
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center p-4 border-2 transition-all group relative ${
        isSelected 
          ? 'border-slate-900 bg-slate-900 text-white shadow-xl -translate-y-1' 
          : 'border-slate-200 bg-white hover:border-slate-400 text-slate-800'
      }`}
    >
      <div className={`w-12 h-12 flex items-center justify-center text-xl font-black mb-3 ${
        isSelected ? 'bg-white text-slate-900' : (isSelf ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:text-slate-600')
      }`}>
        {user.name.charAt(0)}
      </div>
      <div className="text-[11px] font-black uppercase tracking-tight text-center w-full leading-tight mb-1">
        {user.name}
      </div>
      {user.employeeId && (
        <div className={`text-[10px] font-bold ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
          ID: {user.employeeId}
        </div>
      )}
      {role && (
        <div className={`absolute -top-2 -right-2 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border ${
          isSelected ? 'bg-blue-500 border-blue-400 text-white' : 'bg-white border-slate-200 text-slate-500'
        }`}>
          {role}
        </div>
      )}
    </button>
  );
};

export const BehavioralAssessment: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [evalType, setEvalType] = useState<'OTHER_SKILLS' | 'ANNUAL_APPRAISAL'>('OTHER_SKILLS');
  const [appraisalAnswers, setAppraisalAnswers] = useState<boolean[]>(new Array(10).fill(false));

  const ANNUAL_APPRAISAL_QUESTIONS = useMemo(() => [
    { title: "Health, Safety, and Environment (HSE) Compliance", text: "Did the employee consistently adhere to, and actively promote, all safety protocols and HSE guidelines without any recorded compliance violations this year?" },
    { title: "Technical Execution and Quality", text: "Did the employee successfully execute their assigned technical tasks, field operations, or project deliverables to the required quality standards?" },
    { title: "Problem Solving and Troubleshooting", text: "Did the employee demonstrate the ability to independently and safely resolve unexpected technical, mechanical, or operational challenges on-site or during project design?" },
    { title: "Multidisciplinary Collaboration", text: "Did the employee collaborate effectively across different roles (e.g., engineers working well with technicians and management) to keep projects moving smoothly?" },
    { title: "Operational Efficiency and Resource Management", text: "Did the employee manage company resources—such as time, field equipment, materials, or budget—efficiently and responsibly?" },
    { title: "Adaptability Under Pressure", text: "Did the employee adapt successfully to sudden changes in project scope, shifting site conditions, or emergency operational demands?" },
    { title: "Clear Technical Communication", text: "Did the employee consistently communicate critical project updates, technical data, and potential operational risks clearly to their supervisors and team members?" },
    { title: "Continuous Improvement and Innovation", text: "Did the employee suggest or implement any process optimizations, cost-saving measures, or new technical approaches that benefited the team or project?" },
    { title: "Knowledge Sharing and Mentorship", text: "Did the employee actively share their technical expertise, assist peers with complex tasks, or help guide junior staff/technicians?" },
    { title: "Professional Development", text: "Did the employee complete required industry training and actively work to update their technical skills or certifications relevant to the energy sector?" }
  ], []);

  const users = useMemo(() => dataService.getPublicUsers(), []);
  
  // The selection of the employee must be related to the same department of the user who will do the evaluation
  const departmentUsers = useMemo(() => {
    return users.filter(u => u.departmentId === currentUser.departmentId);
  }, [users, currentUser.departmentId]);

  const manager = useMemo(() => {
    return currentUser.managerId ? dataService.getUserById(currentUser.managerId) : undefined;
  }, [currentUser.managerId]);

  const peers = useMemo(() => {
    return dataService.getPeers(currentUser.id);
  }, [currentUser.id]);

  const subordinates = useMemo(() => {
    return dataService.getSubordinates(currentUser.id);
  }, [currentUser.id]);

  const selectedEmployee = useMemo(() => {
    return departmentUsers.find(u => u.id === selectedSubjectId);
  }, [departmentUsers, selectedSubjectId]);

  // The selection of behavioral competency must be related to the department of selected employee
  const availableSkills = useMemo(() => {
    if (!selectedEmployee) return [];
    
    const department = dataService.getAllDepartments().find(d => d.id === selectedEmployee.departmentId);
    const jobProfile = selectedEmployee.jobProfileId ? dataService.getJobProfile(selectedEmployee.jobProfileId) : null;
    const orgLevel = selectedEmployee.orgLevel;

    // 1. Get behavioral skills from Department defaults
    const deptSkillIds = department?.behavioralSkillIds || [];
    
    // 2. Get skills from Job Profile requirements for this specific Hierarchy Level (orgLevel)
    const jobSkillIds = (jobProfile && orgLevel) 
      ? (jobProfile.requirements[orgLevel] || []).map(req => req.skillId)
      : [];

    // 3. Combine and deduplicate skill IDs
    const allRelevantSkillIds = Array.from(new Set([...deptSkillIds, ...jobSkillIds]));
    
    // 4. Filter for relevant categories
    const targetCategories = ['Behavioral', 'Management', 'Soft Skills'];
    
    return dataService.getAllSkills().filter(s => 
      targetCategories.includes(s.category) && 
      allRelevantSkillIds.includes(s.id)
    );
  }, [selectedEmployee]);

  const existingAssessment = useMemo(() => {
    if (!selectedSubjectId || !selectedSkillId) return null;
    return dataService.getAssessments({ 
      raterId: currentUser.id, 
      subjectId: selectedSubjectId, 
      skillId: selectedSkillId 
    }).find(Boolean) || null;
  }, [selectedSubjectId, selectedSkillId, currentUser.id]);

  const existingAppraisal = useMemo(() => {
    if (!selectedSubjectId) return null;
    return dataService.getAssessments({
      raterId: currentUser.id,
      subjectId: selectedSubjectId,
      skillId: 'annual-appraisal'
    }).find(Boolean) || null;
  }, [selectedSubjectId, currentUser.id]);

  useEffect(() => {
    if (evalType === 'OTHER_SKILLS') {
      if (existingAssessment) {
        setRating(existingAssessment.score);
        setFeedback(existingAssessment.comment || '');
      } else {
        setRating(0);
        setFeedback('');
      }
    } else {
      if (existingAppraisal) {
        let answers = new Array(10).fill(false);
        let parsedFeedback = existingAppraisal.comment || '';
        if (parsedFeedback.startsWith('[APPRAISAL_DATA:')) {
            const endIdx = parsedFeedback.indexOf(']');
            if (endIdx !== -1) {
                const data = parsedFeedback.substring(16, endIdx);
                try {
                    const parsedAnswers = JSON.parse(`[${data}]`);
                    if (Array.isArray(parsedAnswers) && parsedAnswers.length === 10) {
                        answers = parsedAnswers;
                    }
                } catch (e) {}
                parsedFeedback = parsedFeedback.substring(endIdx + 1).trim();
            }
        } else {
            answers = new Array(10).fill(false).map((_, i) => i < existingAppraisal.score);
        }
        setAppraisalAnswers(answers);
        setFeedback(parsedFeedback);
      } else {
        setAppraisalAnswers(new Array(10).fill(false));
        setFeedback('');
      }
    }
  }, [evalType, existingAssessment, existingAppraisal, selectedSubjectId, selectedSkillId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (evalType === 'OTHER_SKILLS' && (!selectedSubjectId || !selectedSkillId || rating === 0)) return;
    if (evalType === 'ANNUAL_APPRAISAL' && !selectedSubjectId) return;

    setIsSubmitting(true);

    // Simulate network request
    setTimeout(async () => {
        const isSelf = selectedSubjectId === currentUser.id;
        const isManagerOfSubject = subordinates.some(sub => sub.id === selectedSubjectId);
        const isPeerOfSubject = peers.some(p => p.id === selectedSubjectId);
        
        // Relationship-based type assignment
        // If not self, not subordinate (manager role), and not peer, it is an 'OTHER' or 'MANAGER' 
        // evaluation from a subordinate perspective. We'll label as PEER only if they are true peers.
        const typeAssignment = isSelf ? 'SELF' : (isManagerOfSubject ? 'MANAGER' : (isPeerOfSubject ? 'PEER' : 'PEER'));

        if (evalType === 'ANNUAL_APPRAISAL') {
          const score = appraisalAnswers.filter(a => a).length;
          const commentData = `[APPRAISAL_DATA:${appraisalAnswers.join(',')}]\n${feedback}`;
          await dataService.addAssessment({
            raterId: currentUser.id,
            subjectId: selectedSubjectId,
            skillId: 'annual-appraisal',
            score: score,
            comment: commentData,
            method: 'OJT_OBSERVATION',
            type: typeAssignment
          });
        } else {
          await dataService.addAssessment({
            raterId: currentUser.id,
            subjectId: selectedSubjectId,
            skillId: selectedSkillId,
            score: rating,
            comment: feedback,
            method: 'OJT_OBSERVATION',
            type: typeAssignment 
          });
        }

      setSuccessMessage(isSelf ? 'Self-evaluation submitted successfully.' : 'Feedback submitted successfully.');
      setSelectedSubjectId('');
      setSelectedSkillId('');
      setRating(0);
      setFeedback('');
      setAppraisalAnswers(new Array(10).fill(false));
      setIsSubmitting(false);

      setTimeout(() => setSuccessMessage(''), 3000);
    }, 500);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="pb-6 border-b border-slate-300">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">360-Degree Evaluation</h2>
        <p className="text-slate-700 text-sm mt-1">Submit behavioral feedback for yourself and your team members.</p>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-sm flex items-center gap-3">
          <CheckCircle size={20} className="text-emerald-500" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      <div className="bg-white border border-slate-300 overflow-hidden">
        <div className="p-8 border-b border-slate-200 bg-slate-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Select Employee for 360° Evaluation</h3>
              <p className="text-slate-500 text-xs font-medium mt-1">Evaluations are categorized by professional relationship.</p>
            </div>
            <div className="relative max-w-xs w-full">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text"
                placeholder="Search team members..."
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 text-sm focus:ring-2 focus:ring-slate-900 outline-none transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>
        
        <div className="p-8 space-y-12">
          {/* Relationship Categories */}
          {[
            { title: 'My Supervisor', users: manager ? [manager] : [], role: 'Supervisor' },
            { title: 'Self Evaluation', users: [currentUser], role: 'Self' },
            { title: 'My Colleagues (Peers)', users: peers, role: 'Peer' },
            { title: 'My Direct Reports', users: subordinates, role: 'Team' }
          ].map((category, idx) => {
            const filteredUsers = category.users.filter(u => 
              u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              u.employeeId?.toString().includes(searchTerm)
            );

            if (filteredUsers.length === 0) return null;

            return (
              <div key={idx} className="space-y-4">
                <div className="flex items-center gap-4">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] whitespace-nowrap">{category.title}</h4>
                  <div className="h-px bg-slate-200 flex-1"></div>
                  <span className="text-[10px] font-black text-slate-300">{filteredUsers.length} Found</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {filteredUsers.map(user => (
                    <UserCard 
                      key={user.id} 
                      user={user} 
                      isSelected={selectedSubjectId === user.id} 
                      onClick={() => setSelectedSubjectId(user.id)} 
                      role={category.role}
                      isSelf={user.id === currentUser.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {searchTerm && !manager && peers.length === 0 && subordinates.length === 0 && (
            <div className="py-12 text-center">
              <AlertTriangle className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500 font-medium italic">No employees found matching "{searchTerm}"</p>
            </div>
          )}
        </div>
      </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {selectedSubjectId ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Selected Employee</label>
                  <div className="w-full bg-slate-100 border border-slate-300 text-slate-700 text-sm rounded-sm p-3  font-medium">
                    {selectedEmployee?.name} {selectedEmployee?.id === currentUser.id ? '(Self)' : ''}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Evaluation Type</label>
                  <div className="flex bg-slate-100 border border-slate-300 rounded-sm overflow-hidden p-1">
                    <button
                      type="button"
                      onClick={() => setEvalType('OTHER_SKILLS')}
                      className={`flex-1 py-2 px-4 text-sm font-bold transition-colors rounded-sm ${
                        evalType === 'OTHER_SKILLS' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Other Skills Evaluation
                    </button>
                    <button
                      type="button"
                      onClick={() => setEvalType('ANNUAL_APPRAISAL')}
                      className={`flex-1 py-2 px-4 text-sm font-bold transition-colors rounded-sm ${
                        evalType === 'ANNUAL_APPRAISAL' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      Annual Appraisal
                    </button>
                  </div>
                </div>
              </div>

              {evalType === 'OTHER_SKILLS' ? (
                <>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Other Skills Evaluation</label>
                    <select 
                      required
                      value={selectedSkillId}
                      onChange={(e) => setSelectedSkillId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-3 "
                    >
                      <option value="" disabled>Select behavior to evaluate...</option>
                      {availableSkills.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {availableSkills.length === 0 && (
                      <p className="text-xs text-slate-600 mt-1">No other skills evaluations found for this department.</p>
                    )}
                  </div>

                  {selectedSkillId && (
                    <div className="bg-slate-50 p-4 rounded-sm border border-slate-300">
                      <p className="text-sm text-slate-800 font-medium italic">
                        "{availableSkills.find(s => s.id === selectedSkillId)?.assessmentQuestion}"
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-3">Rating (1-5 Stars)</label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          className="focus:outline-none transition-transform hover:scale-110"
                        >
                          <Star 
                            size={32} 
                            className={`${(hoverRating || rating) >= star ? 'text-slate-400 fill-slate-400' : 'text-slate-300'} transition-colors`} 
                          />
                        </button>
                      ))}
                      <span className="ml-4 text-sm font-medium text-slate-500">
                        {rating === 0 ? 'Select a rating' : rating === 1 ? 'Poor' : rating === 2 ? 'Needs Improvement' : rating === 3 ? 'Meets Expectations' : rating === 4 ? 'Exceeds Expectations' : 'Outstanding'}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-slate-700">Annual Appraisal Checklist</label>
                    <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-sm border border-blue-200">
                      Score: {appraisalAnswers.filter(Boolean).length} / 10
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {ANNUAL_APPRAISAL_QUESTIONS.map((q, idx) => (
                      <div key={idx} className="flex items-start gap-4 p-4 border border-slate-200 rounded-sm bg-white hover:border-slate-300 transition-colors">
                        <div className="flex-1">
                          <h4 className="text-sm font-bold text-slate-900 mb-1">{idx + 1}. {q.title}</h4>
                          <p className="text-xs text-slate-600">{q.text}</p>
                        </div>
                        <div className="flex items-center gap-3">
                           <button
                             type="button"
                             onClick={() => {
                               const newAns = [...appraisalAnswers];
                               newAns[idx] = true;
                               setAppraisalAnswers(newAns);
                             }}
                             className={`px-4 py-2 text-xs font-bold rounded-sm border transition-colors ${appraisalAnswers[idx] === true ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                           >
                             Yes
                           </button>
                           <button
                             type="button"
                             onClick={() => {
                               const newAns = [...appraisalAnswers];
                               newAns[idx] = false;
                               setAppraisalAnswers(newAns);
                             }}
                             className={`px-4 py-2 text-xs font-bold rounded-sm border transition-colors ${appraisalAnswers[idx] === false ? 'bg-rose-500 text-white border-rose-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                           >
                             No
                           </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <MessageSquare size={16} className="text-slate-400" />
                  Feedback (Optional)
                </label>
                <textarea 
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Provide specific examples of their behavior or performance..."
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-3 "
                ></textarea>
                <p className="text-xs text-slate-500 mt-2">Feedback will be shared with the employee and their manager.</p>
              </div>

              <div className="pt-4 border-t border-slate-300 flex justify-between items-center">
                {((evalType === 'OTHER_SKILLS' && existingAssessment) || (evalType === 'ANNUAL_APPRAISAL' && existingAppraisal)) ? (
                  <p className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle size={16} /> Update your existing evaluation
                  </p>
                ) : <div></div>}
                <button 
                  type="submit" 
                  disabled={isSubmitting || !selectedSubjectId || (evalType === 'OTHER_SKILLS' && (!selectedSkillId || rating === 0))}
                  className="bg-blue-700 hover:bg-blue-800 text-white font-medium py-3 px-8 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 "
                >
                  {isSubmitting ? 'Submitting...' : ((evalType === 'OTHER_SKILLS' && existingAssessment) || (evalType === 'ANNUAL_APPRAISAL' && existingAppraisal)) ? 'Update Evaluation' : 'Submit Evaluation'}
                  {!isSubmitting && <Send size={18} />}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center p-8 text-slate-500 border-2 border-dashed border-slate-300 rounded-none">
              <UserIcon size={48} className="mx-auto mb-4 text-slate-300" />
              <p>Please select an employee from the 360° view above to begin their evaluation.</p>
            </div>
          )}
        </form>
      </div>
    );
};
