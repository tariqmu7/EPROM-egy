import React from 'react';
import { User, Role } from '../types';
import { LogOut, LayoutDashboard, ClipboardList, ShieldCheck, UserCircle, Users, Building2, Briefcase } from 'lucide-react';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  activeTab: string;
  onSwitchTab: (tab: string) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, activeTab, onSwitchTab, children }) => {
  
  const NavItem = ({ id, label, icon: Icon }: { id: string, label: string, icon: any }) => {
    const isActive = activeTab === id;
    return (
      <button
        onClick={() => onSwitchTab(id)}
        className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-all duration-200 rounded-md group whitespace-nowrap flex-shrink-0 ${
          isActive 
            ? 'text-teal-700 bg-teal-50 shadow-sm border border-teal-100' 
            : 'text-slate-500 hover:text-teal-600 hover:bg-slate-50'
        }`}
      >
        <Icon size={18} className={`${isActive ? 'text-teal-600' : 'text-slate-400 group-hover:text-teal-500'}`} />
        <span className="hidden md:inline">{label}</span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navbar - Modern Style */}
      <header className="bg-white border-b border-slate-200 shadow-sm z-50 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            
            {/* Logo Section */}
            <div className="flex items-center gap-3 flex-shrink-0">
               <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center p-1 border border-slate-200">
                    <div className="w-full h-full rounded border-2 border-teal-500 flex items-center justify-center">
                        <div className="w-2 h-2 bg-sky-500 rounded-full"></div>
                    </div>
               </div>
               <div className="hidden lg:flex flex-col">
                 <span className="font-bold text-xl tracking-tight leading-none text-slate-900">ERPOM</span>
                 <span className="text-[10px] text-teal-600 font-bold uppercase tracking-widest mt-0.5">Competency OS</span>
               </div>
            </div>

            {/* Main Navigation */}
            <nav className="hidden md:flex items-center gap-2 overflow-x-auto no-scrollbar mx-4">
              {user.role === Role.ADMIN ? (
                <>
                  <NavItem id="admin-dashboard" label="Overview" icon={LayoutDashboard} />
                  <NavItem id="admin-users" label="Workforce" icon={Users} />
                  <NavItem id="admin-jobs" label="Job Profiles" icon={Briefcase} />
                  <NavItem id="admin-skills" label="Skill Library" icon={ShieldCheck} />
                  <NavItem id="admin-depts" label="Departments" icon={Building2} />
                </>
              ) : (
                <>
                  <NavItem id="emp-dashboard" label="My Dashboard" icon={LayoutDashboard} />
                  {user.role === Role.MANAGER && (
                    <NavItem id="manager-dashboard" label="My Team" icon={Users} />
                  )}
                  <NavItem id="emp-assessment" label="Assessments" icon={ClipboardList} />
                </>
              )}
            </nav>

            {/* Right Side Actions */}
            <div className="flex items-center gap-4 lg:gap-6 flex-shrink-0">
              {/* User Profile */}
              <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
                <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-slate-900 leading-none">{user.name}</p>
                    <p className="text-[10px] text-slate-500 uppercase mt-1">{user.role}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm text-slate-500">
                    {user.avatarUrl ? <img src={user.avatarUrl} alt="avatar" /> : <UserCircle size={24} />}
                </div>
                <button 
                  onClick={onLogout}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
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