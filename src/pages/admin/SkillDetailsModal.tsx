import React from 'react';
import { dataService } from '../../services/store';
import { Skill, PROFICIENCY_LABELS, ASSESSMENT_METHOD_LABELS, ASSESSMENT_FREQUENCY_LABELS } from '../../types';
import { PROFICIENCY_DEFINITIONS } from '../../constants';
import { Users, ChevronRight, ShieldCheck, X, Layers, Activity, Calendar, Link2 } from 'lucide-react';

// --- Skill Details Modal ---
export const SkillDetailsModal: React.FC<{ skill: Skill; onClose: () => void }> = ({ skill, onClose }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-none shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{skill.name}</h3>
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-widest rounded-none border border-slate-200">
                                {skill.category}
                            </span>
                        </div>
                        <p className="text-slate-500 text-sm font-medium tracking-tight italic">
                            {skill.subcategory || 'General Competency'}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-8">
                    <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Layers size={14} /> Proficiency Levels
                        </h4>
                        <div className="grid gap-4">
                            {[1, 2, 3, 4, 5].map((level) => {
                                const lvlData = skill.levels[level];
                                // @ts-expect-error numeric index not in type
                                const genericDef = PROFICIENCY_DEFINITIONS[level];
                                return (
                                    <div key={level} className="relative pl-6 border-l-2 border-slate-200 hover:border-slate-900 transition-colors group">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 bg-white border-2 border-slate-200 group-hover:border-slate-900 flex items-center justify-center text-[8px] font-black text-slate-400 group-hover:text-slate-900 transition-colors">
                                            {level}
                                        </div>
                                        <div className="mb-2">
                                            <span className="text-sm font-black text-slate-900 uppercase tracking-tight">Level {level}: {PROFICIENCY_LABELS[level]}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-2 leading-relaxed">
                                            {genericDef?.description}
                                        </p>
                                        <div className="text-sm text-slate-700 font-medium leading-relaxed bg-slate-50 p-3 border border-slate-100">
                                            {lvlData?.description || <span className="text-slate-400 italic">No specific description provided for this skill level.</span>}
                                        </div>
                                        {lvlData?.requiredCertificates && lvlData.requiredCertificates.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {lvlData.requiredCertificates.map((cert, idx) => (
                                                    <span key={idx} className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wider border border-blue-100">
                                                        <ShieldCheck size={10} /> {cert}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100 space-y-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Activity size={14} /> Assessment Methodology
                        </h4>
                        {(() => {
                          const methods = dataService.getSkillAssessmentMethods(skill.id);
                          if (methods.length === 0) {
                            return (
                              <div className="bg-slate-50 p-6 border border-slate-200 text-sm text-slate-500 italic">
                                No assessment method defined — scored as 360° / OJT by default.
                              </div>
                            );
                          }
                          return methods.map((m, mi) => (
                            <div key={m.id || mi} className="bg-slate-50 p-6 border border-slate-200 space-y-6">
                                <div className="flex justify-between items-start gap-4 pb-4 border-b border-slate-200/60">
                                    <div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Method {mi + 1}</span>
                                        {m.assessmentQuestion && <span className="text-xs text-slate-600 italic">{m.assessmentQuestion}</span>}
                                    </div>
                                    <span className="text-xs font-black text-blue-700 uppercase tracking-widest bg-blue-50 px-2 py-1 border border-blue-100 whitespace-nowrap">{ASSESSMENT_METHOD_LABELS[m.method]}</span>
                                </div>

                                <div className="flex flex-wrap gap-4 pb-4 border-b border-slate-200/60 text-[11px]">
                                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                                        <Calendar size={12} className="text-slate-400" />
                                        <span className="font-bold text-slate-500 uppercase tracking-widest">When:</span> {ASSESSMENT_FREQUENCY_LABELS[m.frequency]}
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                                        <Users size={12} className="text-slate-400" />
                                        <span className="font-bold text-slate-500 uppercase tracking-widest">Who:</span> {m.audience.replace(/_/g, ' ')}
                                    </span>
                                </div>

                                {m.assessmentLink && (
                                    <div className="flex justify-between items-center pb-4 border-b border-slate-200/60">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Link2 size={12} /> Link</span>
                                        <a href={m.assessmentLink} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-blue-700 hover:underline flex items-center gap-1">
                                            Open Resource <ChevronRight size={12} />
                                        </a>
                                    </div>
                                )}

                                {m.questions && m.questions.length > 0 && (
                                    <div className="space-y-3">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Question Bank</p>
                                        <div className="space-y-3">
                                            {m.questions.map((q, i) => (
                                                <div key={q.id} className="text-sm bg-white p-4 border border-slate-200">
                                                    <p className="font-bold text-slate-900 mb-2">{i+1}. {q.text}</p>
                                                    {q.expectedCriteria && <p className="text-[10px] text-slate-500 uppercase font-bold bg-slate-50 p-2 border-l-2 border-slate-300">Guide: {q.expectedCriteria}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                          ));
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
};
