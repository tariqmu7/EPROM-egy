import React, { memo } from 'react';
import { User, Role } from '../types';
import { LogOut, LayoutDashboard, ClipboardList, ShieldCheck, UserCircle, Users, Building2, Briefcase } from 'lucide-react';

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
          : 'text-slate-600 hover:text-blue-600 hover:bg-slate-100'
      }`}
    >
      <Icon size={18} className={`${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-blue-500'}`} />
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
            <div className="flex items-center gap-3 flex-shrink-0">
               <div className="w-12 h-12 rounded overflow-hidden flex items-center justify-center">
                    <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRTk3oTrPWYW9cwmL9Wu21gBh0borRXsDUFsw&s" alt="Logo" className="w-full h-full object-contain" />
               </div>
               <div className="hidden lg:flex flex-col">
                 <span className="font-bold text-xl tracking-tight leading-none text-slate-900">Oriens</span>
                 <span className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mt-0.5">Competency OS</span>
               </div>
            </div>

            {/* Main Navigation */}
            <nav className="hidden md:flex items-center gap-2 overflow-x-auto no-scrollbar mx-4">
              {user.role === Role.ADMIN ? (
                <>
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="admin-dashboard" label="Overview" icon={LayoutDashboard} />
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="admin-users" label="Workforce" icon={Users} />
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="admin-jobs" label="Job Profiles" icon={Briefcase} />
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="admin-skills" label="Skill Library" icon={ShieldCheck} />
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="admin-depts" label="Departments" icon={Building2} />
                </>
              ) : (
                <>
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="emp-dashboard" label="My Dashboard" icon={LayoutDashboard} />
                  {user.role === Role.MANAGER && (
                    <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="manager-dashboard" label="My Team" icon={Users} />
                  )}
                  <NavItem activeTab={activeTab} onSwitchTab={onSwitchTab} id="emp-assessment" label="Assessments" icon={ClipboardList} />
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
                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors"
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