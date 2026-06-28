import React, { useState } from 'react';
import { User } from '../types';
import { OnlineAssessments } from './OnlineAssessments';
import { ManagerialInterviews } from './ManagerialInterviews';
import { BehavioralAssessment } from './BehavioralAssessment';
import { AnnualAppraisal } from './AnnualAppraisal';
import { EvidencePortal } from './EvidencePortal';
import { Monitor, MessageSquare, Star, UploadCloud, ClipboardCheck } from 'lucide-react';

type EvalTab = 'online' | 'interviews' | '360' | 'appraisal' | 'evidence';

interface Props {
  currentUser: User;
  initialTab?: EvalTab;
}

const TABS: { id: EvalTab; label: string; icon: React.ElementType; description: string }[] = [
  { id: 'online',     label: 'Online',     icon: Monitor,       description: 'Written exams via external platforms' },
  { id: 'interviews', label: 'Interviews', icon: MessageSquare, description: 'Interviews & practical demos' },
  { id: '360',        label: '360°',       icon: Star,          description: 'Self, peer & manager evaluation' },
  { id: 'appraisal',  label: 'Appraisal',  icon: ClipboardCheck, description: 'Annual performance checklist' },
  { id: 'evidence',   label: 'Evidence',   icon: UploadCloud,   description: 'Upload proof & work records' },
];

export const EvaluationsHub: React.FC<Props> = ({ currentUser, initialTab = 'online' }) => {
  const [activeTab, setActiveTab] = useState<EvalTab>(initialTab);

  const renderContent = () => {
    switch (activeTab) {
      case 'online':     return <OnlineAssessments currentUser={currentUser} />;
      case 'interviews': return <ManagerialInterviews currentUser={currentUser} />;
      case '360':        return <BehavioralAssessment currentUser={currentUser} />;
      case 'appraisal':  return <AnnualAppraisal currentUser={currentUser} />;
      case 'evidence':   return <EvidencePortal currentUser={currentUser} />;
    }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto">

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight">Evaluations</h1>
        <p className="text-sm text-slate-500 mt-1">
          Select an evaluation method to view your assessments and submissions.
        </p>
      </div>

      {/* Sub-Tab Bar + Content — unified card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500" />

        {/* Tab strip — fixed height keeps every tab identical regardless of label length */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-2 border-b border-slate-100 bg-slate-50/50">
          {TABS.map(({ id, label, icon: Icon, description }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`relative flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-150 group
                  ${isActive
                    ? 'bg-white shadow-sm ring-1 ring-blue-100'
                    : 'hover:bg-white/70'
                  }`}
              >
                <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:text-slate-600'
                }`}>
                  <Icon size={17} />
                </div>

                <div className="flex flex-col overflow-hidden">
                  <span className={`text-[11px] font-black uppercase tracking-wide leading-none truncate ${
                    isActive ? 'text-blue-700' : 'text-slate-600'
                  }`}>
                    {label}
                  </span>
                  <span className={`text-[10px] leading-tight truncate mt-1 hidden sm:block ${
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
        <div className="p-6 md:p-8">
          <div key={activeTab} className="animate-in fade-in duration-200">
            {renderContent()}
          </div>
        </div>

      </div>
    </div>
  );
};
