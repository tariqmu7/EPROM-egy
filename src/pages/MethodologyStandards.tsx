import React from 'react';
import { ShieldCheck, ExternalLink, BadgeCheck, Layers } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import {
  AssessmentMethod, ASSESSMENT_METHOD_LABELS, PROFICIENCY_LABELS
} from '../types';
import { PROFICIENCY_DEFINITIONS } from '../constants';
import { ASSESSMENT_STANDARDS, METHOD_STANDARD_MAP, getStandard } from '../constants/standards';

// Read-only "Assessment Methodology & Standards" reference page. Demonstrates,
// to anyone reviewing the system, that the competency-assessment process is
// anchored to recognized international frameworks. Driven entirely by the
// shared standards registry (constants/standards.ts), kept in sync with the
// committed ASSESSMENT_METHODOLOGY.md.
export const MethodologyStandards: React.FC = () => {
  const { t } = useI18n();

  // Methods shown in the conformance matrix (exclude the company-wide appraisal
  // checklist, which isn't a per-skill method).
  const methods = (Object.keys(METHOD_STANDARD_MAP) as AssessmentMethod[])
    .filter(m => m !== 'ANNUAL_APPRAISAL');

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
          <BadgeCheck className="text-blue-700" size={26} /> {t('methodology.title')}
        </h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">{t('methodology.subtitle')}</p>
      </div>

      {/* Conformance banner */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-600 text-white rounded-sm p-6">
        <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
          <ShieldCheck size={18} /> {t('methodology.conformanceTitle')}
        </h2>
        <p className="text-sm text-blue-50 mt-2 max-w-3xl">{t('methodology.conformanceBody')}</p>
        <div className="flex flex-wrap gap-2 mt-4">
          {ASSESSMENT_STANDARDS.map(s => (
            <span key={s.id} className="text-[11px] font-bold bg-white/15 border border-white/25 px-2.5 py-1 rounded-sm">
              {s.code}
            </span>
          ))}
        </div>
      </div>

      {/* Reference frameworks */}
      <section className="space-y-3">
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
          <Layers size={14} /> {t('methodology.frameworksTitle')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ASSESSMENT_STANDARDS.map(s => (
            <div key={s.id} className="bg-white border border-slate-200 rounded-sm p-4 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 leading-tight">{s.name}</h3>
                  <p className="text-[11px] font-semibold text-blue-700 mt-0.5">{s.code}</p>
                </div>
                <span className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">{s.body}</span>
              </div>
              <p className="text-xs text-slate-600 mt-2 flex-1">{s.summary}</p>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 hover:text-blue-800 uppercase tracking-wide"
              >
                <ExternalLink size={12} /> {t('methodology.viewSource')}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Method → standard matrix */}
      <section className="space-y-3">
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('methodology.matrixTitle')}</h2>
        <div className="bg-white border border-slate-200 rounded-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">{t('methodology.matrixMethod')}</th>
                <th className="px-4 py-3 text-[11px] font-black text-slate-500 uppercase tracking-wider">{t('methodology.matrixStandards')}</th>
              </tr>
            </thead>
            <tbody>
              {methods.map(m => (
                <tr key={m} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-semibold text-slate-800">{ASSESSMENT_METHOD_LABELS[m]}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {(METHOD_STANDARD_MAP[m] || []).map(id => {
                        const s = getStandard(id);
                        return (
                          <span key={id} title={s?.name} className="text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-sm">
                            {s?.code || id}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Proficiency scale (NIH 1-5) */}
      <section className="space-y-3">
        <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest">{t('methodology.scaleTitle')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map(lvl => (
            <div key={lvl} className="bg-white border border-slate-200 rounded-sm p-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 flex items-center justify-center rounded-full bg-blue-700 text-white text-xs font-black">{lvl}</span>
                <span className="font-bold text-slate-800 text-sm">{PROFICIENCY_LABELS[lvl]}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                {(PROFICIENCY_DEFINITIONS as Record<number, { description: string }>)[lvl]?.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
