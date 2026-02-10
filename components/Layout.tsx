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
            ? 'text-white bg-white/10 shadow-inner' 
            : 'text-slate-300 hover:text-white hover:bg-white/5'
        }`}
      >
        <Icon size={18} className={`${isActive ? 'text-energy-teal' : 'text-slate-400 group-hover:text-energy-teal'}`} />
        <span className="hidden md:inline">{label}</span>
        {isActive && (
          <div className="absolute bottom-0 left-0 w-full h-0.5 bg-energy-teal rounded-full" />
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navbar - Command Center Style */}
      <header className="bg-brand-900 text-white shadow-lg z-50 relative sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            
            {/* Logo Section */}
            <div className="flex items-center gap-4 flex-shrink-0">
               <div className="w-10 h-10 bg-white rounded flex items-center justify-center p-1 shadow-lg shadow-energy-teal/20">
                 <img 
                    src="https://d2cqpzl92y75ws.cloudfront.net/components/uploads/cms-medias/2021/10/EPROM_logo-280x115.png" 
                    alt="EPROM" 
                    className="w-full h-auto object-contain"
                  />
              </div>
              <div className="hidden lg:flex flex-col">
                <span className="font-bold text-xl tracking-tight leading-none text-white">ERPOM</span>
                <span className="text-[10px] text-energy-teal font-bold uppercase tracking-widest mt-0.5">Competency OS</span>
              </div>
            </div>

            {/* Main Navigation */}
            <nav className="hidden md:flex items-center gap-1 overflow-x-auto no-scrollbar mx-4">
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
                  <NavItem id="emp-dashboard" label="Dashboard" icon={LayoutDashboard} />
                  <NavItem id="emp-assessment" label="Assessments" icon={ClipboardList} />
                </>
              )}
            </nav>

            {/* Right Side Actions */}
            <div className="flex items-center gap-4 lg:gap-6 flex-shrink-0">
              {/* User Profile */}
              <div className="flex items-center gap-3 pl-6 border-l border-brand-800">
                <div className="text-right hidden sm:block">
                    <p className="text-sm font-bold text-white leading-none">{user.name}</p>
                    <p className="text-[10px] text-slate-400 uppercase mt-1">{user.role}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-brand-700 border-2 border-brand-600 flex items-center justify-center overflow-hidden shadow-lg">
                    {user.avatarUrl ? <img src={user.avatarUrl} alt="avatar" /> : <UserCircle size={24} className="text-slate-400"/>}
                </div>
                <button 
                  onClick={onLogout}
                  className="p-2 text-slate-400 hover:text-energy-red hover:bg-white/5 rounded-full transition-colors"
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