import React, { useState } from 'react';
import { Globe, Bell, Check, Download, ShieldCheck } from 'lucide-react';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES } from '../i18n/translations';
import { Card } from '../components/ui';
import { Banner } from '../components/ui';
import { User } from '../types';
import { exportMyData } from '../utils/dataExport';

// F.1 — user preferences page. Hosts the language toggle (prerequisite for
// I18N.1) plus notification preferences, persisted to localStorage. Theme is
// scaffolded but light-only until F.6 (dark mode) lands.
const PREFS_KEY = 'eprom.prefs';

interface Prefs {
  emailNotifications: boolean;
  inAppNotifications: boolean;
}

const loadPrefs = (): Prefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { emailNotifications: true, inAppNotifications: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { emailNotifications: true, inAppNotifications: true };
};

export const SettingsPage: React.FC<{ user: User }> = ({ user }) => {
  const { t, locale, setLocale } = useI18n();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [saved, setSaved] = useState(false);

  const persist = (next: Prefs) => {
    setPrefs(next);
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="pb-6 border-b border-slate-300">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{t('settings.title')}</h2>
        <p className="text-slate-600 text-sm mt-1">{t('settings.subtitle')}</p>
      </div>

      {saved && <Banner kind="success">{t('settings.saved')}</Banner>}

      {/* Language */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Globe size={18} className="text-slate-700" aria-hidden="true" />
          <h3 className="text-lg font-bold text-slate-900">{t('settings.language')}</h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">{t('settings.languageHint')}</p>
        <div role="radiogroup" aria-label={t('settings.language')} className="flex gap-3">
          {LOCALES.map(l => (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={locale === l.code}
              onClick={() => setLocale(l.code)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold border rounded-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                locale === l.code
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {locale === l.code && <Check size={15} aria-hidden="true" />}
              {l.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Notifications */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={18} className="text-slate-700" aria-hidden="true" />
          <h3 className="text-lg font-bold text-slate-900">{t('settings.notifications')}</h3>
        </div>
        <div className="space-y-3">
          {[
            { key: 'inAppNotifications' as const, label: t('settings.notifications.inApp') },
            { key: 'emailNotifications' as const, label: t('settings.notifications.email') },
          ].map(row => (
            <label key={row.key} className="flex items-center justify-between gap-4 p-3 border border-slate-200 rounded-sm cursor-pointer hover:border-slate-300">
              <span className="text-sm font-medium text-slate-800">{row.label}</span>
              <input
                type="checkbox"
                checked={prefs[row.key]}
                onChange={(e) => persist({ ...prefs, [row.key]: e.target.checked })}
                className="h-5 w-5 accent-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              />
            </label>
          ))}
        </div>
      </Card>

      {/* ISO.6 — self-service personal data export */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} className="text-slate-700" aria-hidden="true" />
          <h3 className="text-lg font-bold text-slate-900">{t('settings.data')}</h3>
        </div>
        <p className="text-sm text-slate-600 mb-4">{t('settings.dataHint')}</p>
        <button
          type="button"
          onClick={() => exportMyData(user)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-slate-900 text-white border border-slate-900 rounded-sm transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <Download size={15} aria-hidden="true" /> {t('settings.dataDownload')}
        </button>
      </Card>
    </div>
  );
};
