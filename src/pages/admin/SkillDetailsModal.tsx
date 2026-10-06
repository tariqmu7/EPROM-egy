import React from 'react';
import { dataService } from '../../services/store';
import { Skill, SkillLevel, TrainingCourse, PROFICIENCY_LABELS, TRAINING_COURSE_TYPE_LABELS, ASSESSMENT_METHOD_LABELS, ASSESSMENT_FREQUENCY_LABELS } from '../../types';
import { PROFICIENCY_DEFINITIONS } from '../../constants';
import { Users, ChevronRight, X, Layers, Activity, Calendar, Link2, BookOpen, Clock, Ban } from 'lucide-react';
import { resolveRequiredCourses } from '../../utils/requiredCourses';

// A level's required certificates as catalogue courses: blue = in the
// catalogue, amber = requested and awaiting approval, red = request rejected,
// grey = an old typed name with no catalogue course behind it.
const RequiredCertificateChips: React.FC<{ level: SkillLevel }> = ({ level }) => {
    const courses = dataService.getAllTrainingCourses(true);
    const { courseIds, unmatched } = resolveRequiredCourses(level.requiredCertificates || [], courses, level.requiredCourseIds || []);
    const linked = courseIds.map(id => courses.find(c => c.id === id)).filter((c): c is TrainingCourse => !!c);
    if (linked.length === 0 && unmatched.length === 0) return null;
    return (
        <div className="mt-3">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Required certificates</p>
            <div className="flex flex-wrap gap-2">
                {linked.map(c => {
                    const tone = c.status === 'PENDING' ? 'bg-amber-50 text-amber-900 border-amber-300'
                        : c.status === 'REJECTED' ? 'bg-rose-50 text-rose-800 border-rose-200'
                        : c.isArchived ? 'bg-slate-50 text-slate-500 border-slate-200'
                        : 'bg-blue-50 text-blue-800 border-blue-100';
                    const detail = [c.code, c.provider, TRAINING_COURSE_TYPE_LABELS[c.type], c.durationHours ? `${c.durationHours} h` : ''].filter(Boolean).join(' · ');
                    return (
                        <span key={c.id} className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] border ${tone}`}
                            title={c.status === 'REJECTED' && c.reviewNote ? `Request rejected: ${c.reviewNote}` : detail || undefined}>
                            <BookOpen size={11} />
                            <span className="font-bold">{c.title}</span>
                            {detail && <span className="text-[10px] opacity-70">{detail}</span>}
                            {c.status === 'PENDING' && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase"><Clock size={9} /> Awaiting approval</span>}
                            {c.status === 'REJECTED' && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase"><Ban size={9} /> Request rejected</span>}
                            {c.isArchived && <span className="text-[9px] font-bold uppercase">Archived</span>}
                        </span>
                    );
                })}
                {unmatched.map(name => (
                    <span key={name} className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] border border-slate-300 bg-slate-100 text-slate-700"
                        title="Typed before the catalogue pick-list existed — not linked to any course. Edit the skill to pick or request the course.">
                        <Ban size={11} className="text-slate-400" />
                        <span className="font-bold">{name}</span>
                        <span className="text-[9px] font-bold uppercase text-slate-500">Not in catalogue</span>
                    </span>
                ))}
            </div>
        </div>
    );
};

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
                                        {lvlData && <RequiredCertificateChips level={lvlData} />}
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
