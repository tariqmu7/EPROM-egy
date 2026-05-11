import React, { useState } from 'react';
import { User } from '../types';
import { OnlineAssessments } from './OnlineAssessments';
import { ManagerialInterviews } from './ManagerialInterviews';
import { BehavioralAssessment } from './BehavioralAssessment';
import { EvidencePortal } from './EvidencePortal';
import { Monitor, MessageSquare, Star, UploadCloud } from 'lucide-react';

type EvalTab = 'online' | 'interviews' | '360' | 'evidence';

interface Props {
  currentUser: User;
  initialTab?: EvalTab;
}

const TABS: { id: EvalTab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'online',     label: 'Online',     icon: Monitor,       description: 'Written exams via external platforms' },
  { id: 'interviews', label: 'Interviews', icon: MessageSquare, description: 'Interviews & practical demos' },
  { id: '360',        label: '360°',       icon: Star,          description: 'Self, peer & manager evaluation' },
  { id: 'evidence',   label: 'Evidence',   icon: UploadCloud,   description: 'Upload proof & work records' },
];

export const EvaluationsHub: React.FC<Props> = ({ currentUser, initialTab = 'online' }) => {
  const [activeTab, setActiveTab] = useState<EvalTab>(initialTab);

  const renderContent = () => {
    switch (activeTab) {
      case 'online':     return <OnlineAssessments currentUser={currentUser} />;
      case 'interviews': return <ManagerialInterviews currentUser={currentUser} />;
      case '360':        return <BehavioralAssessment currentUser={currentUser} />;
      case 'evidence':   return <EvidencePortal currentUser={currentUser} />;
    }
  };

  return (
    <div className="space-y-4">

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Evaluations</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Select an evaluation method to view your assessments and submissions.
        </p>
      </div>

      {/* Sub-Tab Bar + Content — unified card */}
      <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">

        {/* Fixed-height tab strip — h-14 keeps every tab identical regardless of label length */}
        <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
          {TABS.map(({ id, label, icon: Icon, description }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{ height: '3.5rem' /* 56px — fixed, never stretches */ }}
                className={`relative flex items-center gap-2 px-4 w-full transition-colors duration-150 group overflow-hidden
                  ${isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                  }`}
              >
                {/* Active bottom bar */}
                <span
                  className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all duration-150 ${
                    isActive ? 'bg-blue-600' : 'bg-transparent'
                  }`}
                />

                <Icon
                  size={15}
                  className={`flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}
                />

                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-[11px] font-bold uppercase tracking-wide leading-none truncate w-full">
                    {label}
                  </span>
                  <span className={`text-[10px] leading-tight truncate w-full mt-0.5 hidden sm:block ${
                    isActive ? 'text-blue-400' : 'text-slate-400'
                  }`}>
                    {description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Content — p-8 so child page headers aren't flush against the tab bar border */}
        <div className="p-8 pt-10">
          <div key={activeTab} className="animate-in fade-in duration-200">
            {renderContent()}
          </div>
        </div>

      </div>
    </div>
  );
};
