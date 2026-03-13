import React, { memo } from 'react';
import { User, Role, ORG_LEVEL_LABELS } from '../types';
import { Logo } from './Logo';
import { dataService } from '../services/store';
import { LogOut, LayoutDashboard, ClipboardList, ShieldCheck, UserCircle, Users, Building2, Briefcase, Activity, Calendar, Grid, UploadCloud, CheckSquare, Star } from 'lucide-react';
import { NotificationBell } from './NotificationBell';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  activeTab: string;
  onSwitchTab: (tab: string) => void;
  children: React.ReactNode;
}

const NavItem = memo(({ id, label, icon: Icon, activeTab, onSwitchTab }: { id: string, label: string, icon: any, activeTab: string, onSwitchTab: (tab: string) => void }) => {
  const isActive = activeTab === id;
  return (
    <button
      onClick={() => onSwitchTab(id)}
      className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 rounded-md group whitespace-nowrap flex-shrink-0 ${
        isActive 
          ? 'text-blue-700 bg-blue-50 shadow-sm border border-blue-100' 
          : 'text-slate-600 hover:text-blue-700 hover:bg-slate-100'
      }`}
    >
      <Icon size={18} className={`${isActive ? 'text-blue-700' : 'text-slate-600 group-hover:text-blue-700'}`} />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
});

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, activeTab, onSwitchTab, children }) => {
  
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Navbar - Modern Style */}
      <header className="bg-white border-b border-slate-200 shadow-sm z-50 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            
            {/* Logo Section */}
            <div className="flex items-center gap-4 flex-shrink-0">
               <div className="w-16 h-16 rounded-xl overflow-hidden flex items-center justify-center py-1">
                    <Logo className="w-full h-full" />
               </div>
               <div className="hidden lg:flex flex-col">
                 <span className="font-bold text-lg tracking-tight leading-none text-slate-900">EPROM CMS</span>
                 <span className="text-[10px] text-blue-700 font-bold uppercase tracking-widest mt-1">EPROM Competency program</span>
               </div>
            </div>

            {/* Main Navigation */}
            <nav className="hidden md:flex items-center gap-2 mx-4">
              {user.role === Role.ADMIN ? (
                <>
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="admin-dashboard" label="Overview" icon={LayoutDashboard} />
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="admin-analytics" label="Analytics" icon={Activity} />
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="admin-cycles" label="Cycles" icon={Calendar} />
                  <div className="ml-2">
                    <NotificationBell user={user} onNavigate={onSwitchTab} />
                  </div>
                </>
              ) : (
                <>
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="emp-dashboard" label="My Profile" icon={LayoutDashboard} />
                  {dataService.isManager(user) && (
                    <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="manager-dashboard" label="My Team" icon={Users} />
                  )}
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="emp-assessment" label="Evaluations" icon={Star} />
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="evidence-portal" label="Evidence" icon={UploadCloud} />
                </>
              )}
            </nav>

            {/* Right Side Actions */}
            <div className="flex items-center gap-4 lg:gap-6 flex-shrink-0">
              
              {user.role !== Role.ADMIN && <NotificationBell user={user} onNavigate={onSwitchTab} />}

              {/* User Profile */}
              <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
                <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-slate-900 leading-none">{user.name}</p>
                    <p className="text-[10px] text-slate-700 uppercase mt-1">
                        {user.role === Role.ADMIN ? 'Administrator' : (user.orgLevel ? ORG_LEVEL_LABELS[user.orgLevel] : 'Employee')}
                    </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm text-slate-700">
                    {user.avatarUrl ? <img src={user.avatarUrl} alt="avatar" /> : <UserCircle size={24} />}
                </div>
                <button 
                  onClick={onLogout}
                  className="p-2 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-full transition-colors"
                  title="Sign Out"
                >
                  <LogOut size={18} />
                </button>
              </div>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
         {children}
      </main>
    </div>
  );
};