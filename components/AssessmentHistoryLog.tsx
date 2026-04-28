import React, { useState, useMemo } from 'react';
import { User, Role } from '../types';
import { dataService } from '../services/store';
import { 
  History, 
  Search, 
  Filter, 
  ChevronRight, 
  Eye, 
  Calendar, 
  User as UserIcon, 
  Target, 
  Award, 
  MessageSquare,
  ArrowUpRight,
  Clock,
  XCircle,
  CheckCircle,
  FileText
} from 'lucide-react';

interface AssessmentHistoryLogProps {
  currentUser: User;
  targetUserId?: string; // If provided, shows history for this specific user
}

export const AssessmentHistoryLog: React.FC<AssessmentHistoryLogProps> = ({ currentUser, targetUserId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const history = useMemo(() => {
    return dataService.getAssessmentHistory(currentUser, targetUserId);
  }, [currentUser, targetUserId]);

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const skill = dataService.getSkill(item.skillId);
      const matchesSearch = !searchTerm || 
        skill?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dataService.getUserById(item.raterId)?.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesMethod = methodFilter === 'ALL' || item.method === methodFilter;

      return matchesSearch && matchesMethod;
    });
  }, [history, searchTerm, methodFilter]);

  const methods = ['ALL', 'WRITTEN_EXAM', 'PRACTICAL_DEMO', 'INTERVIEW', 'OJT_OBSERVATION', 'WORK_RECORD_REVIEW'];

  return (
    <div className="space-y-6">
      {/* ── Filter Bar ────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text"
              placeholder="Search by skill or assessor..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-300 text-sm focus:ring-2 focus:ring-slate-900 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Filter size={18} className="text-slate-400" />
            <select 
              className="bg-slate-50 border border-slate-300 text-sm py-2 px-3 focus:ring-2 focus:ring-slate-900 outline-none"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
            >
              {methods.map(m => (
                <option key={m} value={m}>{m?.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {filteredHistory.length} Records Found
        </div>
      </div>

      {/* ── History Table ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Evaluation Method</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Skill / Competency</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Assessor</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-center">Score</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredHistory.map((item) => {
                const skill = dataService.getSkill(item.skillId);
                const rater = dataService.getUserById(item.raterId);
                
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                            <Calendar size={14} className="text-slate-400" />
                            {new Date(item.date).toLocaleDateString()}
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <span className={`text-[10px] font-black px-2 py-0.5 border uppercase tracking-tighter ${
                            item.method === 'WRITTEN_EXAM' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                            item.method === 'INTERVIEW' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                            item.method === 'WORK_RECORD_REVIEW' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                            {item.method?.replace(/_/g, ' ') || 'EVALUATION'}
                        </span>
                    </td>
                    <td className="px-6 py-4">
                        <div className="space-y-1">
                            <p className="text-sm font-black text-slate-900 leading-tight uppercase tracking-tight">{skill?.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{skill?.category}</p>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-slate-100 flex items-center justify-center text-[10px] font-black border border-slate-200">
                                {rater?.name.charAt(0)}
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-800">{rater?.name || 'System'}</p>
                                <p className="text-[9px] text-slate-500 font-bold uppercase">Assessor</p>
                            </div>
                        </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                        {item.status === 'REJECTED' ? (
                            <span className="text-red-500 font-black text-xs uppercase flex items-center justify-center gap-1">
                                <XCircle size={14} /> Failed
                            </span>
                        ) : (
                            <span className="text-slate-900 font-black text-sm">L{item.score}</span>
                        )}
                    </td>
                    <td className="px-6 py-4 text-right">
                        <button 
                            onClick={() => setSelectedItem(item)}
                            className="inline-flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors"
                        >
                            View Feedback <ArrowUpRight size={14} />
                        </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredHistory.length === 0 && (
            <div className="p-12 text-center text-slate-400 italic text-sm">
                No historical records found matching your criteria.
            </div>
          )}
        </div>
      </div>

      {/* ── Feedback Modal Overlay ────────────────────────────────────── */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white max-w-2xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <MessageSquare size={20} className="text-blue-400" />
                        <h3 className="text-lg font-black uppercase tracking-tight">Evaluation Feedback</h3>
                    </div>
                    <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white transition-colors">
                        <XCircle size={24} />
                    </button>
                </div>
                <div className="p-8 space-y-8">
                    <div className="grid grid-cols-2 gap-8 border-b border-slate-100 pb-8">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Evaluated Skill</p>
                            <p className="text-base font-black text-slate-900 uppercase tracking-tight">{dataService.getSkill(selectedItem.skillId)?.name}</p>
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Achieved Result</p>
                            <p className={`text-base font-black ${selectedItem.status === 'REJECTED' ? 'text-red-600' : 'text-emerald-600'}`}>
                                {selectedItem.status === 'REJECTED' ? 'REJECTED / FAIL' : `LEVEL ${selectedItem.score} SUCCESS`}
                            </p>
                        </div>
                    </div>
                    
                    <div className="space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detailed Assessor Comments</p>
                        <div className="p-6 bg-slate-50 border-l-4 border-slate-900 relative">
                            <span className="absolute -top-3 -left-2 text-4xl text-slate-200 font-serif">"</span>
                            <p className="text-slate-700 italic leading-relaxed text-sm">
                                {selectedItem.comment || "No detailed feedback was provided for this evaluation."}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 flex items-center justify-center font-black border border-slate-200">
                                {dataService.getUserById(selectedItem.raterId)?.name.charAt(0)}
                            </div>
                            <div>
                                <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{dataService.getUserById(selectedItem.raterId)?.name}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Evaluation Date: {new Date(selectedItem.date).toLocaleDateString()}</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => setSelectedItem(null)}
                            className="px-6 py-2 bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all"
                        >
                            Close Record
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
