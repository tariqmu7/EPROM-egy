import React from 'react';
import { ArrowLeft } from 'lucide-react';

// --- Reusable Form Wrapper ---
export const FormPage: React.FC<{ title: string; onBack: () => void; children: React.ReactNode }> = ({ title, onBack, children }) => {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 rounded-none hover:bg-slate-200 text-slate-600 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      </div>
      <div className="bg-white rounded-sm border border-slate-300">
         {children}
      </div>
    </div>
  );
};
