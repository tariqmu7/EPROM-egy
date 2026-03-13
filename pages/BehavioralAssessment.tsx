import React, { useState, useMemo } from 'react';
import { dataService } from '../services/store';
import { User, Skill } from '../types';
import { Star, MessageSquare, Send, CheckCircle } from 'lucide-react';

export const BehavioralAssessment: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const users = useMemo(() => dataService.getAllUsers(), []);
  const skills = useMemo(() => dataService.getAllSkills().filter(s => s.category === 'Behavioral'), []);
  
  // Include self and peers
  const evaluatees = useMemo(() => {
    const others = users.filter(u => u.id !== currentUser.id);
    return [currentUser, ...others];
  }, [users, currentUser]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId || !selectedSkillId || rating === 0) return;

    setIsSubmitting(true);

    // Simulate network request
    setTimeout(() => {
      const isSelf = selectedSubjectId === currentUser.id;
      dataService.addAssessment({
        raterId: currentUser.id, // We store it, but UI can hide it
        subjectId: selectedSubjectId,
        skillId: selectedSkillId,
        score: rating,
        comment: feedback,
        type: isSelf ? 'SELF' : 'PEER'
      });

      setSuccessMessage(isSelf ? 'Self-evaluation submitted successfully.' : 'Anonymous feedback submitted successfully.');
      setSelectedSubjectId('');
      setSelectedSkillId('');
      setRating(0);
      setFeedback('');
      setIsSubmitting(false);

      setTimeout(() => setSuccessMessage(''), 3000);
    }, 500);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="pb-6 border-b border-slate-200">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">360-Degree Evaluation</h2>
        <p className="text-slate-700 text-sm mt-1">Submit behavioral feedback for yourself and your peers.</p>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-3">
          <CheckCircle size={20} className="text-emerald-600" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Select Employee</label>
              <select 
                required
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-3 shadow-sm"
              >
                <option value="" disabled>Choose an employee...</option>
                {evaluatees.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.id === currentUser.id ? '(Self)' : `(${p.departmentId})`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Behavioral Competency</label>
              <select 
                required
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-3 shadow-sm"
              >
                <option value="" disabled>Select behavior to evaluate...</option>
                {skills.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {selectedSkillId && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
              <p className="text-sm text-blue-800 font-medium italic">
                "{skills.find(s => s.id === selectedSkillId)?.assessmentQuestion}"
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
                    className={`${(hoverRating || rating) >= star ? 'text-amber-400 fill-amber-400' : 'text-slate-300'} transition-colors`} 
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
              Anonymous Feedback (Optional)
            </label>
            <textarea 
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Provide specific examples of their behavior..."
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-3 shadow-sm"
            ></textarea>
            <p className="text-xs text-slate-500 mt-2">Feedback for peers will be shared anonymously with the employee and their manager.</p>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button 
              type="submit" 
              disabled={isSubmitting || !selectedSubjectId || !selectedSkillId || rating === 0}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 px-8 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Evaluation'}
              {!isSubmitting && <Send size={18} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
