import React, { useState, useMemo, useEffect } from 'react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import { User } from '../types';
import { MessageSquare, Send, CheckCircle, User as UserIcon, AlertTriangle, Check, X } from 'lucide-react';

const UserCard = ({ user, isSelected, onClick, role, isSelf }: { user: User, isSelected: boolean, onClick: () => void, role?: string, isSelf?: boolean }) => (
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

export const AnnualAppraisal: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // Tri-state: null = not yet answered (W1.1 — no silent "all No"); true = Yes; false = No.
  const [appraisalAnswers, setAppraisalAnswers] = useState<(boolean | null)[]>([]);

  const storeVersion = useStoreData();

  // Active annual appraisal plan; falls back to built-in questions if none configured
  const annualAppraisalPlan = useMemo(() => {
    return dataService.getAllAssessmentPlans().find(
      p => p.method === 'ANNUAL_APPRAISAL' && p.status === 'ACTIVE'
    ) ?? null;
  }, [storeVersion]);

  const ANNUAL_APPRAISAL_QUESTIONS = useMemo(() => {
    if (annualAppraisalPlan?.annualAppraisalQuestions?.length) {
      return annualAppraisalPlan.annualAppraisalQuestions;
    }
    // Built-in fallback when no plan is configured
    return [
      { id: 'q1', title: "Health, Safety, and Environment (HSE) Compliance", text: "Did the employee consistently adhere to, and actively promote, all safety protocols and HSE guidelines without any recorded compliance violations this year?", weight: 10 },
      { id: 'q2', title: "Technical Execution and Quality", text: "Did the employee successfully execute their assigned technical tasks, field operations, or project deliverables to the required quality standards?", weight: 10 },
      { id: 'q3', title: "Problem Solving and Troubleshooting", text: "Did the employee demonstrate the ability to independently and safely resolve unexpected technical, mechanical, or operational challenges on-site or during project design?", weight: 10 },
      { id: 'q4', title: "Multidisciplinary Collaboration", text: "Did the employee collaborate effectively across different roles (e.g., engineers working well with technicians and management) to keep projects moving smoothly?", weight: 10 },
      { id: 'q5', title: "Operational Efficiency and Resource Management", text: "Did the employee manage company resources—such as time, field equipment, materials, or budget—efficiently and responsibly?", weight: 10 },
      { id: 'q6', title: "Adaptability Under Pressure", text: "Did the employee adapt successfully to sudden changes in project scope, shifting site conditions, or emergency operational demands?", weight: 10 },
      { id: 'q7', title: "Clear Technical Communication", text: "Did the employee consistently communicate critical project updates, technical data, and potential operational risks clearly to their supervisors and team members?", weight: 10 },
      { id: 'q8', title: "Continuous Improvement and Innovation", text: "Did the employee suggest or implement any process optimizations, cost-saving measures, or new technical approaches that benefited the team or project?", weight: 10 },
      { id: 'q9', title: "Knowledge Sharing and Mentorship", text: "Did the employee actively share their technical expertise, assist peers with complex tasks, or help guide junior staff/technicians?", weight: 10 },
      { id: 'q10', title: "Professional Development", text: "Did the employee complete required industry training and actively work to update their technical skills or certifications relevant to the energy sector?", weight: 10 }
    ];
  }, [annualAppraisalPlan]);

  const manager = useMemo(() => {
    return currentUser.managerId ? dataService.getUserById(currentUser.managerId) : undefined;
  }, [currentUser.managerId, storeVersion]);

  const peers = useMemo(() => {
    return dataService.getPeers(currentUser.id);
  }, [currentUser.id, storeVersion]);

  const subordinates = useMemo(() => {
    return dataService.getSubordinates(currentUser.id);
  }, [currentUser.id, storeVersion]);

  const departmentUsers = useMemo(() => {
    return dataService.getPublicUsers().filter(u => u.departmentId === currentUser.departmentId);
  }, [storeVersion, currentUser.departmentId]);

  const selectedEmployee = useMemo(() => {
    return departmentUsers.find(u => u.id === selectedSubjectId);
  }, [departmentUsers, selectedSubjectId]);

  const existingAppraisal = useMemo(() => {
    if (!selectedSubjectId) return null;
    return dataService.getAssessments({
      raterId: currentUser.id,
      subjectId: selectedSubjectId,
      skillId: 'annual-appraisal'
    }).find(Boolean) || null;
  }, [selectedSubjectId, currentUser.id, storeVersion]);

  useEffect(() => {
    const qCount = ANNUAL_APPRAISAL_QUESTIONS.length;
    if (existingAppraisal) {
      let answers: (boolean | null)[] = new Array(qCount).fill(null);
      let parsedFeedback = existingAppraisal.comment || '';
      if (Array.isArray(existingAppraisal.appraisalAnswers)) {
        // Preferred: structured typed field (W1.2 / C.2).
        const stored = existingAppraisal.appraisalAnswers;
        answers = Array.from({ length: qCount }, (_, i) =>
          i < stored.length ? Boolean(stored[i]) : null
        );
      } else if (parsedFeedback.startsWith('[APPRAISAL_DATA:')) {
        // Legacy read-time migration: answers packed into the comment string.
        const endIdx = parsedFeedback.indexOf(']');
        if (endIdx !== -1) {
          const data = parsedFeedback.substring(16, endIdx);
          try {
            const parsedAnswers = JSON.parse(`[${data}]`);
            if (Array.isArray(parsedAnswers)) {
              // Pad or truncate to match current question count
              answers = Array.from({ length: qCount }, (_, i) =>
                i < parsedAnswers.length ? Boolean(parsedAnswers[i]) : null
              );
            }
          } catch (e) {
            console.warn(
              `[AnnualAppraisal] Malformed APPRAISAL_DATA for appraisal ${existingAppraisal.id} — ` +
              `falling back to default answers.`,
              e
            );
          }
          parsedFeedback = parsedFeedback.substring(endIdx + 1).trim();
        }
      } else {
        // Oldest legacy format: score was count of yes answers
        answers = new Array(qCount).fill(false).map((_, i) => i < existingAppraisal.score);
      }
      setAppraisalAnswers(answers);
      setFeedback(parsedFeedback);
    } else {
      setAppraisalAnswers(new Array(qCount).fill(null));
      setFeedback('');
    }
  }, [existingAppraisal, selectedSubjectId, ANNUAL_APPRAISAL_QUESTIONS]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) return;
    // W1.1 — every appraisal row must be explicitly answered before submit.
    if (appraisalAnswers.length !== ANNUAL_APPRAISAL_QUESTIONS.length ||
        appraisalAnswers.some(a => a === null)) return;
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const isSelf = selectedSubjectId === currentUser.id;
      const isManagerOfSubject = subordinates.some(sub => sub.id === selectedSubjectId);
      const isPeerOfSubject = peers.some(p => p.id === selectedSubjectId);

      // Relationship-based type assignment (mirrors the 360° evaluation): the
      // subject picker offers four categories (self, direct reports, peers,
      // supervisor), so the final fallback is a genuine upward evaluation of
      // the rater's own supervisor — labelled UPWARD, not folded into PEER.
      const typeAssignment = isSelf
        ? 'SELF'
        : isManagerOfSubject
          ? 'MANAGER'
          : isPeerOfSubject
            ? 'PEER'
            : 'UPWARD';

      const answers = appraisalAnswers.map(a => a === true);
      const totalWeight = ANNUAL_APPRAISAL_QUESTIONS.reduce((s, q) => s + (q.weight ?? 10), 0);
      const earnedWeight = ANNUAL_APPRAISAL_QUESTIONS.reduce((s, q, i) =>
        s + (answers[i] ? (q.weight ?? 10) : 0), 0);
      const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
      await dataService.addAssessment({
        raterId: currentUser.id,
        subjectId: selectedSubjectId,
        skillId: 'annual-appraisal',
        score: score,
        comment: feedback,
        appraisalAnswers: answers,
        method: 'ANNUAL_APPRAISAL',
        type: typeAssignment
      });

      setSuccessMessage(isSelf ? 'Self-appraisal submitted successfully.' : 'Appraisal submitted successfully.');
      setSelectedSubjectId('');
      setFeedback('');
      setAppraisalAnswers(new Array(ANNUAL_APPRAISAL_QUESTIONS.length).fill(null));

      setTimeout(() => setSuccessMessage(''), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="pb-6 border-b border-slate-300">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Annual Appraisal</h2>
        <p className="text-slate-700 text-sm mt-1">Complete the yearly performance checklist for yourself and your team members.</p>
      </div>

      {successMessage && (
        <div role="status" aria-live="polite" className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-sm flex items-center gap-3">
          <CheckCircle size={20} className="text-emerald-500" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      <div className="bg-white border border-slate-300 overflow-hidden">
        <div className="p-8 border-b border-slate-200 bg-slate-50/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Select Employee for Appraisal</h3>
              <p className="text-slate-500 text-xs font-medium mt-1">Appraisals are categorized by professional relationship.</p>
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
            { title: 'Self Appraisal', users: [currentUser], role: 'Self' },
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
                  <span className="text-[10px] font-black text-slate-500">{filteredUsers.length} Found</span>
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
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Selected Employee</label>
              <div className="w-full bg-slate-100 border border-slate-300 text-slate-700 text-sm rounded-sm p-3  font-medium">
                {selectedEmployee?.name} {selectedEmployee?.id === currentUser.id ? '(Self)' : ''}
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-bold text-slate-700">Annual Appraisal Checklist</label>
                {(() => {
                  const totalWeight = ANNUAL_APPRAISAL_QUESTIONS.reduce((s, q) => s + (q.weight ?? 10), 0);
                  const earnedWeight = ANNUAL_APPRAISAL_QUESTIONS.reduce((s, q, i) =>
                    s + (appraisalAnswers[i] === true ? (q.weight ?? 10) : 0), 0);
                  const pct = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;
                  const answered = appraisalAnswers.filter(a => a !== null).length;
                  const total = ANNUAL_APPRAISAL_QUESTIONS.length;
                  const allAnswered = answered === total;
                  return (
                    <div className="flex items-center gap-2">
                      <span
                        role="status"
                        aria-live="polite"
                        className={`text-xs font-bold px-3 py-1 rounded-sm border ${
                          allAnswered
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-amber-700 bg-amber-50 border-amber-200'
                        }`}
                      >
                        {answered} of {total} answered
                      </span>
                      <span className="text-sm font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-sm border border-blue-200">
                        Weighted Score: {pct}%
                      </span>
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-1 gap-3">
                {ANNUAL_APPRAISAL_QUESTIONS.map((q, idx) => (
                  <div key={q.id ?? idx} className={`flex items-start gap-4 p-4 border rounded-sm transition-colors ${appraisalAnswers[idx] == null ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-bold text-slate-900">{idx + 1}. {q.title}</h4>
                        {q.weight !== undefined && (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 border border-blue-200 rounded-none">
                            {q.weight}%
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">{q.text}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-pressed={appraisalAnswers[idx] === true}
                        aria-label={`Yes — ${q.title}`}
                        onClick={() => {
                          const newAns = [...appraisalAnswers];
                          newAns[idx] = true;
                          setAppraisalAnswers(newAns);
                        }}
                        className={`px-4 py-2 text-xs font-bold rounded-sm border transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 ${appraisalAnswers[idx] === true ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                      >
                        <Check size={14} aria-hidden="true" /> Yes
                      </button>
                      <button
                        type="button"
                        aria-pressed={appraisalAnswers[idx] === false}
                        aria-label={`No — ${q.title}`}
                        onClick={() => {
                          const newAns = [...appraisalAnswers];
                          newAns[idx] = false;
                          setAppraisalAnswers(newAns);
                        }}
                        className={`px-4 py-2 text-xs font-bold rounded-sm border transition-colors inline-flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-1 ${appraisalAnswers[idx] === false ? 'bg-rose-500 text-white border-rose-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                      >
                        <X size={14} aria-hidden="true" /> No
                      </button>
                    </div>
                  </div>
                ))}
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
                placeholder="Provide specific examples of their behavior or performance..."
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-900 focus:border-slate-900 block p-3 "
              ></textarea>
              <p className="text-xs text-slate-600 mt-2">
                This appraisal is shared with the employee and their manager.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-300 flex justify-between items-center">
              {existingAppraisal ? (
                <p className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                  <CheckCircle size={16} /> Update your existing appraisal
                </p>
              ) : <div></div>}
              <button
                type="submit"
                disabled={isSubmitting || !selectedSubjectId || appraisalAnswers.length !== ANNUAL_APPRAISAL_QUESTIONS.length || appraisalAnswers.some(a => a === null)}
                className="bg-blue-700 hover:bg-blue-800 text-white font-medium py-3 px-8 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 "
              >
                {isSubmitting ? 'Submitting...' : existingAppraisal ? 'Update Appraisal' : 'Submit Appraisal'}
                {!isSubmitting && <Send size={18} />}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center p-8 text-slate-500 border-2 border-dashed border-slate-300 rounded-none">
            <UserIcon size={48} className="mx-auto mb-4 text-slate-300" />
            <p>Please select an employee from the view above to begin their appraisal.</p>
          </div>
        )}
      </form>
    </div>
  );
};
