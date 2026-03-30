import React, { useState, useMemo, useEffect } from 'react';
import { dataService } from '../services/store';
import { User, Skill } from '../types';
import { Star, MessageSquare, Send, CheckCircle, User as UserIcon } from 'lucide-react';

const UserCard = ({ user, isSelected, onClick, role, isSelf }: { user: User, isSelected: boolean, onClick: () => void, role?: string, isSelf?: boolean }) => {
  const jobProfile = user.jobProfileId ? dataService.getJobProfile(user.jobProfileId) : null;
  
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center p-3 rounded-none border-2 transition-all w-32 flex-shrink-0 ${isSelected ? 'border-slate-900 bg-slate-50  scale-105' : 'border-slate-300 bg-white hover:border-slate-300 hover:'}`}
    >
      <div className={`w-10 h-10 rounded-none flex items-center justify-center text-lg font-bold mb-2 ${isSelf ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
        {user.name.charAt(0)}
      </div>
      <div className="text-xs font-bold text-slate-800 text-center w-full leading-tight mb-1" title={user.name}>{user.name}</div>
      {jobProfile && <div className="text-[9px] text-slate-500 text-center leading-tight mb-1 line-clamp-2" title={jobProfile.title}>{jobProfile.title}</div>}
      {role && <div className="text-[9px] font-bold text-slate-800 uppercase mt-auto pt-1">{role}</div>}
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

  const users = useMemo(() => dataService.getAllUsers(), []);
  
  // The selection of the employee must be related to the same department of the user who will do the evaluation
  const departmentUsers = useMemo(() => {
    return users.filter(u => u.departmentId === currentUser.departmentId);
  }, [users, currentUser.departmentId]);

  const manager = useMemo(() => {
    return departmentUsers.find(u => u.id === currentUser.managerId);
  }, [departmentUsers, currentUser.managerId]);

  const peers = useMemo(() => {
    return departmentUsers.filter(u => u.managerId === currentUser.managerId && u.id !== currentUser.id);
  }, [departmentUsers, currentUser.managerId, currentUser.id]);

  const subordinates = useMemo(() => {
    return departmentUsers.filter(u => u.managerId === currentUser.id);
  }, [departmentUsers, currentUser.id]);

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

  useEffect(() => {
    if (existingAssessment) {
      setRating(existingAssessment.score);
      setFeedback(existingAssessment.comment || '');
    } else {
      setRating(0);
      setFeedback('');
    }
  }, [existingAssessment, selectedSubjectId, selectedSkillId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId || !selectedSkillId || rating === 0) return;

    setIsSubmitting(true);

    // Simulate network request
    setTimeout(async () => {
      const isSelf = selectedSubjectId === currentUser.id;
        const isManager = selectedEmployee?.managerId === currentUser.id;
        
        await dataService.addAssessment({
          raterId: currentUser.id, // We store it, but UI can hide it
          subjectId: selectedSubjectId,
          skillId: selectedSkillId,
          score: rating,
          comment: feedback,
          type: isSelf ? 'SELF' : (isManager ? 'MANAGER' : 'PEER')
        });

      setSuccessMessage(isSelf ? 'Self-evaluation submitted successfully.' : 'Feedback submitted successfully.');
      setSelectedSubjectId('');
      setSelectedSkillId('');
      setRating(0);
      setFeedback('');
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

      <div className="bg-white p-8 rounded-none  border border-slate-300">
        <div className="mb-10">
          <label className="block text-sm font-bold text-slate-700 mb-4 text-center">Select Employee for 360° Evaluation</label>
          
          <div className="flex flex-col items-center gap-6 bg-slate-50 p-8 rounded-none border border-slate-300 overflow-x-auto no-scrollbar">
            {/* Manager */}
            {manager && (
              <div className="flex flex-col items-center">
                <UserCard user={manager} isSelected={selectedSubjectId === manager.id} onClick={() => setSelectedSubjectId(manager.id)} role="Manager" />
                <div className="h-8 w-px bg-slate-300 mt-2"></div>
              </div>
            )}

            {/* Middle Row: Peers and Self */}
            <div className="flex items-center justify-center gap-2 min-w-max">
              {/* Peers (Left) */}
              {peers.slice(0, Math.ceil(peers.length / 2)).map(peer => (
                <div key={peer.id} className="flex items-center gap-2">
                  <UserCard user={peer} isSelected={selectedSubjectId === peer.id} onClick={() => setSelectedSubjectId(peer.id)} role="Peer" />
                  <div className="w-4 h-px bg-slate-300"></div>
                </div>
              ))}

              {/* Self */}
              <div className="relative">
                <div className="absolute -top-2 -left-2 -right-2 -bottom-2 bg-slate-200 rounded-none border-2 border-slate-300 z-0"></div>
                <div className="relative z-10">
                  <UserCard user={currentUser} isSelected={selectedSubjectId === currentUser.id} onClick={() => setSelectedSubjectId(currentUser.id)} role="Self" isSelf />
                </div>
              </div>

              {/* Peers (Right) */}
              {peers.slice(Math.ceil(peers.length / 2)).map(peer => (
                <div key={peer.id} className="flex items-center gap-2">
                  <div className="w-4 h-px bg-slate-300"></div>
                  <UserCard user={peer} isSelected={selectedSubjectId === peer.id} onClick={() => setSelectedSubjectId(peer.id)} role="Peer" />
                </div>
              ))}
            </div>

            {/* Subordinates */}
            {subordinates.length > 0 && (
              <div className="flex flex-col items-center w-full min-w-max">
                <div className="h-8 w-px bg-slate-300 mb-2"></div>
                <div className="flex justify-center gap-6">
                  {subordinates.map(sub => (
                    <UserCard key={sub.id} user={sub} isSelected={selectedSubjectId === sub.id} onClick={() => setSelectedSubjectId(sub.id)} role="Team" />
                  ))}
                </div>
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
                  <label className="block text-sm font-bold text-slate-700 mb-2">Behavioral Competency</label>
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
                    <p className="text-xs text-slate-600 mt-1">No behavioral competencies found for this department.</p>
                  )}
                </div>
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

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                  <MessageSquare size={16} className="text-slate-400" />
                  Feedback (Optional)
                </label>
                <textarea 
                  rows={4}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Provide specific examples of their behavior..."
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-3 "
                ></textarea>
                <p className="text-xs text-slate-500 mt-2">Feedback will be shared with the employee and their manager.</p>
              </div>

              <div className="pt-4 border-t border-slate-300 flex justify-between items-center">
                {existingAssessment && (
                  <p className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                    <CheckCircle size={16} /> Update your existing evaluation
                  </p>
                )}
                {!existingAssessment && <div></div>}
                <button 
                  type="submit" 
                  disabled={isSubmitting || !selectedSubjectId || !selectedSkillId || rating === 0}
                  className="bg-blue-700 hover:bg-blue-800 text-white font-medium py-3 px-8 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 "
                >
                  {isSubmitting ? 'Submitting...' : existingAssessment ? 'Update Evaluation' : 'Submit Evaluation'}
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
    </div>
  );
};
