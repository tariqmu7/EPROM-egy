import React from 'react';
import { Languages } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES } from '../i18n/translations';

// I18N.1 — header language switch. Cycles EN ⇄ AR and flips layout direction
// via the provider. Small footprint so it fits the existing top bar.
export const LanguageToggle: React.FC = () => {
  const { locale, setLocale } = useI18n();
  const next = locale === 'en' ? 'ar' : 'en';
  const nextLabel = LOCALES.find(l => l.code === next)?.label ?? next;
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={`Switch language to ${nextLabel}`}
      title={`Switch language to ${nextLabel}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
    >
      <Languages size={16} aria-hidden="true" />
      <span>{nextLabel}</span>
    </button>
  );
};
