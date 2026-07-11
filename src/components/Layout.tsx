import React, { memo, useState, useRef, useEffect } from 'react';
import { User, Role, ORG_LEVEL_LABELS } from '../types';
import { Logo } from './Logo';
import { dataService } from '../services/store';
import { LogOut, LayoutDashboard, ShieldCheck, BadgeCheck, UserCircle, Users, Building2, Briefcase, Activity, Grid, UploadCloud, CheckSquare, Star, Monitor, MessageSquare, Menu, X, Settings, Languages, ChevronDown, LucideIcon } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useI18n } from '../i18n/I18nContext';
import { LOCALES } from '../i18n/translations';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  activeTab: string;
  onSwitchTab: (tab: string) => void;
  children: React.ReactNode;
}

const EVAL_TABS = new Set(['evaluations', 'online-assessments', 'interviews', 'emp-assessment', 'emp-appraisal', 'evidence-portal']);

const NavItem = memo(({ id, label, icon: Icon, activeTab, onSwitchTab }: { id: string, label: string, icon: LucideIcon, activeTab: string, onSwitchTab: (tab: string) => void }) => {
  const isActive = activeTab === id || (id === 'evaluations' && EVAL_TABS.has(activeTab));
  return (
    <button
      onClick={() => onSwitchTab(id)}
      className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 rounded-sm group whitespace-nowrap flex-shrink-0 ${
        isActive 
          ? 'text-blue-700 bg-blue-50 border border-blue-200' 
          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
      }`}
    >
      <Icon size={18} className={`${isActive ? 'text-blue-700' : 'text-slate-600 group-hover:text-blue-700'}`} />
      <span>{label}</span>
    </button>
  );
});

const NavDropdown = memo(({ navTabs, activeTab, onSwitchTab }: {
  navTabs: { id: string; label: string; icon: LucideIcon }[];
  activeTab: string;
  onSwitchTab: (tab: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { locale, setLocale, t } = useI18n();
  const next = locale === 'en' ? 'ar' : 'en';
  const nextLabel = LOCALES.find(l => l.code === next)?.label ?? next;
  const isAnyActive = navTabs.some(tab => tab.id === activeTab);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 rounded-sm group whitespace-nowrap flex-shrink-0 ${
          isAnyActive
            ? 'text-blue-700 bg-blue-50 border border-blue-200'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
        }`}
      >
        <span>{t('nav.more')}</span>
        <ChevronDown size={14} className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute end-0 mt-1 w-52 bg-white border border-slate-200 rounded-sm shadow-lg z-50 py-1">
          {navTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { onSwitchTab(tab.id); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'text-blue-700 bg-blue-50' : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={16} className={isActive ? 'text-blue-700' : 'text-slate-500'} />
                {tab.label}
              </button>
            );
          })}
          <div className="border-t border-slate-100 my-1" />
          <button
            type="button"
            onClick={() => { setLocale(next); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <Languages size={16} className="text-slate-500" />
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
});

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, activeTab, onSwitchTab, children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { t } = useI18n();

  const handleMobileNav = (tab: string) => {
    onSwitchTab(tab);
    setMobileMenuOpen(false);
  };

  // C.6 — nav model defined once, rendered for both desktop and mobile.
  const navItems: { id: string; label: string; icon: LucideIcon }[] =
    user.role === Role.ADMIN
      ? [
          { id: 'admin-dashboard', label: t('nav.overview'), icon: LayoutDashboard },
          { id: 'admin-analytics', label: t('nav.analytics'), icon: Activity },
          { id: 'admin-appraisal', label: t('nav.appraisal'), icon: CheckSquare },
        ]
      : user.role === Role.CEO
      ? [
          { id: 'ceo-dashboard', label: t('nav.organization'), icon: LayoutDashboard },
          { id: 'admin-depts', label: t('nav.orgStructure'), icon: Building2 },
          { id: 'emp-dashboard', label: t('nav.myProfile'), icon: UserCircle },
        ]
      : [
          { id: 'emp-dashboard', label: t('nav.myProfile'), icon: LayoutDashboard },
          ...(dataService.isManager(user)
            ? [{ id: 'manager-dashboard', label: t('nav.myTeam'), icon: Users }]
            : []),
          { id: 'evaluations', label: t('nav.evaluations'), icon: Star },
        ];

  // Items that go inside the combined dropdown button
  const dropdownTabs: { id: string; label: string; icon: LucideIcon }[] = [
    ...(user.role === Role.ADMIN ? [{ id: 'admin-audit', label: t('nav.auditTrail'), icon: ShieldCheck }] : []),
    { id: 'methodology', label: t('nav.methodology'), icon: BadgeCheck },
    { id: 'settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* AX.4 — skip link: visually hidden until focused, jumps past the header. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-slate-900 focus:text-white focus:rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        {t('nav.skipToContent')}
      </a>
      {/* Top Navbar - Modern Style */}
      <header className="bg-white border-b border-slate-300  z-50 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            
            {/* Logo Section */}
            <div className="flex items-center gap-4 flex-shrink-0">
               <div className="w-16 h-16 rounded-none overflow-hidden flex items-center justify-center py-1">
                    <Logo className="w-full h-full" />
               </div>
               <div className="hidden lg:flex flex-col">
                 <span className="font-bold text-lg tracking-tight leading-none text-slate-900">{t('app.name')}</span>
                 <span className="text-xs text-slate-900 font-bold uppercase tracking-widest mt-1">{t('app.tagline')}</span>
               </div>
            </div>

            {/* Main Navigation */}
            <nav className="hidden md:flex items-center gap-2 mx-4" aria-label="Primary">
              {navItems.map(item => (
                <NavItem key={item.id} activeTab={activeTab} onSwitchTab={onSwitchTab} id={item.id} label={item.label} icon={item.icon} />
              ))}
              <NavDropdown navTabs={dropdownTabs} activeTab={activeTab} onSwitchTab={onSwitchTab} />
            </nav>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-sm"
              onClick={() => setMobileMenuOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>

            {/* Right Side Actions */}
            <div className="flex items-center gap-4 lg:gap-6 flex-shrink-0">

              {user.role !== Role.ADMIN && <NotificationBell user={user} onNavigate={onSwitchTab} />}

              {/* User Profile */}
              <div className="flex items-center gap-3 pl-6 border-l border-slate-300">
                <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-slate-900 leading-none">{user.name}</p>
                    <p className="text-xs text-slate-700 uppercase mt-1">
                        {user.role === Role.ADMIN ? t('role.administrator') : (user.role === Role.CEO ? t('role.ceo') : (user.orgLevel ? ORG_LEVEL_LABELS[user.orgLevel] : t('role.employee')))}
                    </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center overflow-hidden text-slate-700">
                    {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} /> : <UserCircle size={24} />}
                </div>
                <button
                  onClick={onLogout}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-sm transition-colors"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">{t('nav.signOut')}</span>
                </button>
              </div>
            </div>

          </div>
        </div>
        {/* Mobile nav drawer */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-slate-200 bg-white px-4 py-3 flex flex-col gap-1" aria-label="Primary">
            {navItems.map(item => (
              <NavItem key={item.id} activeTab={activeTab} onSwitchTab={handleMobileNav} id={item.id} label={item.label} icon={item.icon} />
            ))}
            {dropdownTabs.map(item => (
              <NavItem key={item.id} activeTab={activeTab} onSwitchTab={handleMobileNav} id={item.id} label={item.label} icon={item.icon} />
            ))}
          </nav>
        )}
      </header>

      {/* Main Content Body */}
      <main id="main-content" tabIndex={-1} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
         {children}
      </main>
    </div>
  );
};