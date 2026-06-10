import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DICTIONARIES, LOCALES, Locale } from './translations';

// I18N.1 / I18N.2 / I18N.3 — lightweight i18n provider (no external dep).
// Holds the active locale, persists it, sets <html lang/dir>, exposes a t()
// lookup and locale-bound date/number formatters.

interface I18nValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (value: string | number | Date, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, opts?: Intl.NumberFormatOptions) => string;
}

const STORAGE_KEY = 'eprom.locale';
const I18nContext = createContext<I18nValue | null>(null);

const localeOf = (code: Locale) => LOCALES.find(l => l.code === code) ?? LOCALES[0];

// Map app locale to a BCP-47 tag for Intl (Egyptian Arabic / UK English).
const INTL_TAG: Record<Locale, string> = { en: 'en-GB', ar: 'ar-EG' };

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as Locale | null;
    return stored && DICTIONARIES[stored] ? stored : 'en';
  });

  const dir = localeOf(locale).dir;

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('lang', locale);
    el.setAttribute('dir', dir);
  }, [locale, dir]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => {
    let str = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return str;
  }, [locale]);

  const formatDate = useCallback((value: string | number | Date, opts?: Intl.DateTimeFormatOptions) => {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat(INTL_TAG[locale], opts ?? { year: 'numeric', month: 'short', day: '2-digit' }).format(d);
  }, [locale]);

  const formatNumber = useCallback((value: number, opts?: Intl.NumberFormatOptions) => {
    return new Intl.NumberFormat(INTL_TAG[locale], opts).format(value);
  }, [locale]);

  const value = useMemo<I18nValue>(() => ({ locale, dir, setLocale, t, formatDate, formatNumber }),
    [locale, dir, setLocale, t, formatDate, formatNumber]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = (): I18nValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};
