import React, { useState } from 'react';
import { Activity, Calendar, Zap, Users, Settings, PlayCircle, CheckCircle, Save, Edit3 } from 'lucide-react';

export const AdminCycles: React.FC = () => {
  const [activeCycle, setActiveCycle] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const [configs, setConfigs] = useState<Record<string, any>>({
    'baseline': {
      triggers: ['New Hire', 'Role Transfer', 'Facility Change']
    },
    'time-based': {
      highRiskDuration: 1,
      mediumRiskDuration: 3
    },
    'event-driven': {
      triggers: ['Post-Incident', 'New Equipment/SOPs', 'Prolonged Absence (>6mo)']
    },
    'behavioral': {
      duration: 1,
      tiedTo: 'Annual Performance Review'
    }
  });

  const handleTrigger = (cycleName: string) => {
    setActiveCycle(cycleName);
    setTimeout(() => {
      setSuccessMessage(`${cycleName} has been successfully triggered.`);
      setActiveCycle(null);
      setTimeout(() => setSuccessMessage(''), 3000);
    }, 1000);
  };

  const handleSaveConfig = (id: string) => {
    setEditingId(null);
    setSuccessMessage(`Configuration for ${cycles.find(c => c.id === id)?.name} saved.`);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const cycles = [
    {
      id: 'baseline',
      name: 'The Baseline Assessment (Initial)',
      icon: Activity,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      when: 'Upon hiring, transferring to a new role, or moving to a new facility.',
      goal: 'Establish the baseline. You cannot manage what you have not measured. Even a 20-year veteran gets a baseline assessment to prove they meet your site\'s specific standards, not just their previous employer\'s.'
    },
    {
      id: 'time-based',
      name: 'The Time-Based Cycle (The Matrix Standard)',
      icon: Calendar,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      when: 'Automated tracking based on criticality (High-Risk: 1-2 years, Medium-Risk: 3 years).',
      goal: 'Ensure continuous compliance. High-Risk tasks (e.g., PTW, LOTO, Confined Space) require frequent reassessment. Medium-Risk tasks (e.g., Pump alignment, RCA) are retained well if done regularly.'
    },
    {
      id: 'event-driven',
      name: 'The Event-Driven Assessment (Triggered)',
      icon: Zap,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      when: 'Post-Incident, New Equipment/SOPs, or Prolonged Absence (6-12 months).',
      goal: 'Immediate reassessment based on specific events. Resets the clock before the standard 3-year mark to ensure safety and compliance after critical changes or incidents.'
    },
    {
      id: 'behavioral',
      name: 'The Behavioral Cycle (360-Degree Evaluation)',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      when: 'Annually (often tied to standard performance review periods).',
      goal: 'Measure safety culture, teamwork, and communication. Lighter to execute than technical evidence, done yearly to track trends in leadership and attitude.'
    }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="pb-6 border-b border-slate-200 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Evaluation Cycles Settings</h2>
          <p className="text-slate-700 text-sm mt-1">Configure and trigger the 4 Standard Evaluation Cycles.</p>
        </div>
        <div className="bg-slate-100 p-2 rounded-lg border border-slate-200 flex items-center gap-2 text-sm text-slate-600 font-medium">
          <Settings size={16} />
          <span>System Configured</span>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-3 animate-fade-in">
          <CheckCircle size={20} className="text-emerald-600" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {cycles.map((cycle) => {
          const Icon = cycle.icon;
          return (
            <div key={cycle.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
              <div className="p-6 flex-grow">
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${cycle.bgColor} ${cycle.color}`}>
                    <Icon size={24} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">{cycle.name}</h3>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">When it happens</h4>
                    <p className="text-sm text-slate-700">{cycle.when}</p>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">The Goal</h4>
                    <p className="text-sm text-slate-700">{cycle.goal}</p>
                  </div>
                </div>

                {/* Configuration Section */}
                <div className="mt-6 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1">
                      <Settings size={14} /> Configuration
                    </h4>
                    {editingId !== cycle.id ? (
                      <button onClick={() => setEditingId(cycle.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                        <Edit3 size={12} /> Edit
                      </button>
                    ) : (
                      <button onClick={() => handleSaveConfig(cycle.id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1">
                        <Save size={12} /> Save
                      </button>
                    )}
                  </div>

                  {cycle.id === 'baseline' && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-600">Automatic Triggers (comma separated)</label>
                      <input 
                        type="text" 
                        disabled={editingId !== cycle.id}
                        value={configs['baseline'].triggers.join(', ')}
                        onChange={(e) => setConfigs({...configs, baseline: { triggers: e.target.value.split(',').map(s => s.trim()) }})}
                        className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </div>
                  )}

                  {cycle.id === 'time-based' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600">High-Risk (Years)</label>
                        <input 
                          type="number" 
                          disabled={editingId !== cycle.id}
                          value={configs['time-based'].highRiskDuration}
                          onChange={(e) => setConfigs({...configs, 'time-based': { ...configs['time-based'], highRiskDuration: parseInt(e.target.value) }})}
                          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Medium-Risk (Years)</label>
                        <input 
                          type="number" 
                          disabled={editingId !== cycle.id}
                          value={configs['time-based'].mediumRiskDuration}
                          onChange={(e) => setConfigs({...configs, 'time-based': { ...configs['time-based'], mediumRiskDuration: parseInt(e.target.value) }})}
                          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </div>
                    </div>
                  )}

                  {cycle.id === 'event-driven' && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-600">Manual Triggers (comma separated)</label>
                      <input 
                        type="text" 
                        disabled={editingId !== cycle.id}
                        value={configs['event-driven'].triggers.join(', ')}
                        onChange={(e) => setConfigs({...configs, 'event-driven': { triggers: e.target.value.split(',').map(s => s.trim()) }})}
                        className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </div>
                  )}

                  {cycle.id === 'behavioral' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Frequency (Years)</label>
                        <input 
                          type="number" 
                          disabled={editingId !== cycle.id}
                          value={configs['behavioral'].duration}
                          onChange={(e) => setConfigs({...configs, 'behavioral': { ...configs['behavioral'], duration: parseInt(e.target.value) }})}
                          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Tied To</label>
                        <input 
                          type="text" 
                          disabled={editingId !== cycle.id}
                          value={configs['behavioral'].tiedTo}
                          onChange={(e) => setConfigs({...configs, 'behavioral': { ...configs['behavioral'], tiedTo: e.target.value }})}
                          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 disabled:bg-slate-50 disabled:text-slate-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end">
                <button 
                  onClick={() => handleTrigger(cycle.name)}
                  disabled={activeCycle === cycle.name}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 hover:text-slate-900 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {activeCycle === cycle.name ? (
                    <>Processing...</>
                  ) : (
                    <>
                      <PlayCircle size={16} className={cycle.color} />
                      Trigger Cycle
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
