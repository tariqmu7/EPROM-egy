import React, { useState, useMemo } from 'react';
import { dataService } from '../services/store';
import { AssessmentCycle } from '../types';
import { Plus, Calendar, CheckCircle, XCircle, Clock } from 'lucide-react';

export const AdminCycles: React.FC = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ name: '', startDate: '', dueDate: '' });
  
  const cycles = useMemo(() => dataService.getAllCycles(), [isCreating]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    dataService.addCycle({
      name: formData.name,
      startDate: formData.startDate,
      dueDate: formData.dueDate,
      status: 'ACTIVE'
    });
    setIsCreating(false);
    setFormData({ name: '', startDate: '', dueDate: '' });
  };

  const handleCloseCycle = (cycle: AssessmentCycle) => {
    dataService.updateCycle({ ...cycle, status: 'CLOSED' });
    // Force re-render
    setFormData({ ...formData });
  };

  if (isCreating) {
    return (
      <div className="bg-white rounded-lg shadow-panel border border-slate-200 p-6">
        <h3 className="text-xl font-bold text-slate-900 mb-4">Create Assessment Cycle</h3>
        <form onSubmit={handleCreate} className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cycle Name</label>
            <input 
              required
              type="text" 
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="e.g., Q1 2026 Performance Review"
              className="w-full border border-slate-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
            <input 
              required
              type="date" 
              value={formData.startDate}
              onChange={e => setFormData({...formData, startDate: e.target.value})}
              className="w-full border border-slate-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
            <input 
              required
              type="date" 
              value={formData.dueDate}
              onChange={e => setFormData({...formData, dueDate: e.target.value})}
              className="w-full border border-slate-300 rounded-md px-3 py-2"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={() => setIsCreating(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Generate Cycle</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-6 border-b border-slate-200">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Assessment Cycles</h2>
          <p className="text-slate-700 text-sm mt-1">Manage organizational assessment campaigns</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus size={18} /> Generate New Cycle
        </button>
      </div>

      <div className="grid gap-4">
        {cycles.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-slate-200">
            <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
            <p className="text-slate-500 font-medium">No assessment cycles found.</p>
            <p className="text-slate-400 text-sm mt-1">Generate a new cycle to start assessing employees.</p>
          </div>
        ) : (
          cycles.map(cycle => (
            <div key={cycle.id} className="bg-white p-5 rounded-lg border border-slate-200 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${cycle.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                  {cycle.status === 'ACTIVE' ? <Clock size={24} /> : <CheckCircle size={24} />}
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-900">{cycle.name}</h3>
                  <div className="flex items-center gap-4 text-sm text-slate-500 mt-1">
                    <span>Start: {new Date(cycle.startDate).toLocaleDateString()}</span>
                    <span>Due: {new Date(cycle.dueDate).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${cycle.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {cycle.status}
                </span>
                {cycle.status === 'ACTIVE' && (
                  <button 
                    onClick={() => handleCloseCycle(cycle)}
                    className="text-sm text-red-600 hover:text-red-800 font-medium border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded transition-colors"
                  >
                    Close Cycle
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
