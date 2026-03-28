import React, { useState, useMemo } from 'react';
import { dataService } from '../services/store';
import { User, Evidence } from '../types';
import { CheckCircle, XCircle, FileText, Download, Eye, Clock, History } from 'lucide-react';

export const SupervisorApproval: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [isViewing, setIsViewing] = useState(false);
  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [selectedLevel, setSelectedLevel] = useState<number>(3);

  const users = useMemo(() => dataService.getAllUsers(), []);
  const skills = useMemo(() => dataService.getAllSkills(), []);
  
  // Get all evidence for users managed by this supervisor
  const allTeamEvidences = useMemo(() => {
    const allEvidences = dataService.getEvidences();
    if (currentUser.role === 'ADMIN') return allEvidences;
    
    // Only show evidence for direct reports
    const myReports = users.filter(u => u.managerId === currentUser.id);
    const myReportIds = new Set(myReports.map(u => u.id));
    
    return allEvidences.filter(e => myReportIds.has(e.userId));
  }, [currentUser, users]);

  const pendingEvidences = useMemo(() => allTeamEvidences.filter(e => e.status === 'PENDING'), [allTeamEvidences]);
  const historyEvidences = useMemo(() => allTeamEvidences.filter(e => e.status !== 'PENDING').sort((a, b) => new Date(b.reviewedAt || 0).getTime() - new Date(a.reviewedAt || 0).getTime()), [allTeamEvidences]);

  const handleApprove = async (id: string) => {
    await dataService.updateEvidenceStatus(id, 'APPROVED', currentUser.id, selectedLevel);
    setSelectedEvidence(null);
    setIsViewing(false);
    setSelectedLevel(3); // Reset to default
  };

  const handleReject = async (id: string) => {
    await dataService.updateEvidenceStatus(id, 'REJECTED', currentUser.id);
    setSelectedEvidence(null);
    setIsViewing(false);
  };

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown User';
  const getSkillName = (id: string) => {
    const skill = skills.find(s => s.id === id);
    if (!skill) return 'Unknown Skill';
    return skill.status === 'PENDING' ? `${skill.name} (Pending Admin Approval)` : skill.name;
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="pb-6 border-b border-slate-300">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Supervisor Approval Workflow</h2>
        <p className="text-slate-700 text-sm mt-1">Review and verify technical evidence submitted by your team.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-none  border border-slate-300 overflow-hidden flex flex-col h-[600px]">
            <div className="flex border-b border-slate-300 bg-slate-50">
              <button
                onClick={() => { setActiveTab('PENDING'); setSelectedEvidence(null); setIsViewing(false); }}
                className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'PENDING' ? 'text-slate-900 border-b-2 border-slate-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Clock size={16} /> Pending
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-none">{pendingEvidences.length}</span>
              </button>
              <button
                onClick={() => { setActiveTab('HISTORY'); setSelectedEvidence(null); setIsViewing(false); }}
                className={`flex-1 py-3 px-4 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${activeTab === 'HISTORY' ? 'text-slate-900 border-b-2 border-slate-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <History size={16} /> History
              </button>
            </div>
            <div className="divide-y divide-slate-100 flex-grow overflow-y-auto">
              {activeTab === 'PENDING' ? (
                <>
                  {pendingEvidences.map(evidence => (
                    <button
                      key={evidence.id}
                      onClick={() => { setSelectedEvidence(evidence); setIsViewing(true); }}
                      className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selectedEvidence?.id === evidence.id ? 'bg-slate-50 border-l-4 border-slate-600' : 'border-l-4 border-transparent'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-slate-900 text-sm">{getUserName(evidence.userId)}</span>
                        <span className="text-xs text-slate-500">{new Date(evidence.submittedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-xs font-medium text-slate-900 mb-2 truncate">{getSkillName(evidence.skillId)}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <FileText size={14} />
                        <span className="truncate">{evidence.fileName}</span>
                      </div>
                    </button>
                  ))}
                  {pendingEvidences.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      <CheckCircle size={32} className="mx-auto mb-3 text-emerald-500" />
                      <p>All caught up! No pending evidence.</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {historyEvidences.map(evidence => (
                    <button
                      key={evidence.id}
                      onClick={() => { setSelectedEvidence(evidence); setIsViewing(true); }}
                      className={`w-full text-left p-4 hover:bg-slate-50 transition-colors ${selectedEvidence?.id === evidence.id ? 'bg-slate-50 border-l-4 border-slate-600' : 'border-l-4 border-transparent'}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-semibold text-slate-900 text-sm">{getUserName(evidence.userId)}</span>
                        <span className="text-xs text-slate-500">{evidence.reviewedAt ? new Date(evidence.reviewedAt).toLocaleDateString() : ''}</span>
                      </div>
                      <div className="text-xs font-medium text-slate-700 mb-2 truncate">{getSkillName(evidence.skillId)}</div>
                      <div className="flex items-center gap-2 text-xs">
                        {evidence.status === 'APPROVED' ? (
                          <span className="flex items-center gap-1 text-emerald-600 font-medium"><CheckCircle size={14} /> Approved</span>
                        ) : (
                          <span className="flex items-center gap-1 text-rose-600 font-medium"><XCircle size={14} /> Rejected</span>
                        )}
                      </div>
                    </button>
                  ))}
                  {historyEvidences.length === 0 && (
                    <div className="p-8 text-center text-slate-500">
                      <History size={32} className="mx-auto mb-3 text-slate-300" />
                      <p>No review history available.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {isViewing && selectedEvidence ? (
            <div className="bg-white rounded-none  border border-slate-300 overflow-hidden flex flex-col h-full min-h-[600px]">
              <div className="p-6 border-b border-slate-300 flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-1">Evidence Review</h3>
                  <p className="text-sm text-slate-600">
                    Submitted by <span className="font-semibold">{getUserName(selectedEvidence.userId)}</span> for <span className="font-semibold text-slate-900">{getSkillName(selectedEvidence.skillId)}</span>
                  </p>
                </div>
                {selectedEvidence.status === 'PENDING' ? (
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-slate-700">Award Level:</label>
                      <select 
                        value={selectedLevel}
                        onChange={(e) => setSelectedLevel(Number(e.target.value))}
                        className="bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-sm focus:ring-slate-500 focus:border-slate-500 p-1.5"
                      >
                        <option value={1}>Level 1 (Awareness)</option>
                        <option value={2}>Level 2 (Basic)</option>
                        <option value={3}>Level 3 (Skill)</option>
                        <option value={4}>Level 4 (Mastery)</option>
                        <option value={5}>Level 5 (Expert)</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleReject(selectedEvidence.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-sm text-sm font-medium transition-colors"
                      >
                        <XCircle size={16} /> Reject (Gap)
                      </button>
                      <button 
                        onClick={() => handleApprove(selectedEvidence.id)}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-sm text-sm font-medium transition-colors "
                      >
                        <CheckCircle size={16} /> Approve
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`px-4 py-2 rounded-sm text-sm font-bold flex items-center gap-2 ${selectedEvidence.status === 'APPROVED' ? 'bg-slate-100 text-slate-800' : 'bg-slate-100 text-slate-800'}`}>
                    {selectedEvidence.status === 'APPROVED' ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    {selectedEvidence.status}
                  </div>
                )}
              </div>

              <div className="p-6 flex-grow flex flex-col gap-6">
                {selectedEvidence.status !== 'PENDING' && (
                  <div className="bg-slate-50 p-4 rounded-sm border border-slate-300 flex items-start gap-3">
                    <div className="mt-0.5">
                      <History size={18} className="text-slate-400" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Review History</h4>
                      <p className="text-sm text-slate-700">
                        This evidence was <span className="font-bold">{selectedEvidence.status.toLowerCase()}</span> by <span className="font-semibold">{getUserName(selectedEvidence.reviewedBy || '')}</span> on {selectedEvidence.reviewedAt ? new Date(selectedEvidence.reviewedAt).toLocaleString() : 'Unknown Date'}.
                      </p>
                    </div>
                  </div>
                )}

                <div className="bg-slate-50 p-4 rounded-sm border border-slate-300">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Employee Notes</h4>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap">{selectedEvidence.notes}</p>
                </div>

                <div className="flex-grow flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attached File</h4>
                    <a href={selectedEvidence.fileUrl} download={selectedEvidence.fileName} className="text-slate-800 hover:text-slate-800 text-xs font-medium flex items-center gap-1">
                      <Download size={14} /> Download
                    </a>
                  </div>
                  <div className="flex-grow bg-slate-100 rounded-sm border border-slate-300 overflow-hidden flex items-center justify-center min-h-[300px]">
                    {selectedEvidence.fileUrl.startsWith('data:image') ? (
                      <img src={selectedEvidence.fileUrl} alt="Evidence" className="max-w-full max-h-full object-contain p-2" />
                    ) : (
                      <div className="text-center text-slate-500">
                        <FileText size={48} className="mx-auto mb-3 text-slate-400" />
                        <p className="font-medium">{selectedEvidence.fileName}</p>
                        <p className="text-xs mt-1">Preview not available for this file type.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-none border border-slate-300 border-dashed h-full min-h-[400px] flex flex-col items-center justify-center text-slate-500">
              <Eye size={48} className="mb-4 text-slate-300" />
              <p className="text-lg font-medium text-slate-600">Select an item from the queue to review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
