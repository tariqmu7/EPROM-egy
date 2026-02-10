import React from 'react';
import { User, Role } from '../types';
import { LogOut, LayoutDashboard, ClipboardList, Users, Building, ShieldCheck, UserCircle } from 'lucide-react';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  activeTab: string;
  onSwitchTab: (tab: string) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, activeTab, onSwitchTab, children }) => {
  
  const NavItem = ({ id, label, icon: Icon }: { id: string, label: string, icon: any }) => (
    <button
      onClick={() => onSwitchTab(id)}
      className={`w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium transition-colors ${
        activeTab === id 
          ? 'bg-teal-50 text-teal-700 border-r-4 border-teal-600' 
          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <Icon size={18} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 fixed h-full z-10 hidden md:flex flex-col">
        {/* Compact Header Style */}
        <div className="h-16 px-6 border-b border-slate-100 flex items-center space-x-3">
          <img 
            src="https://d2cqpzl92y75ws.cloudfront.net/components/uploads/cms-medias/2021/10/EPROM_logo-280x115.png" 
            alt="EPROM" 
            className="h-8 w-auto object-contain"
          />
          <div>
            <h1 className="font-bold text-slate-900 leading-none">ERPOM</h1>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Competency</span>
          </div>
        </div>

        <nav className="flex-1 py-6 space-y-1 overflow-y-auto">
          {user.role === Role.ADMIN ? (
            <>
              <div className="px-4 pb-2 pt-2 text-xs font-semibold text-slate-400 uppercase">Admin Portal</div>
              <NavItem id="admin-dashboard" label="Overview" icon={LayoutDashboard} />
              <NavItem id="admin-jobs" label="Job Profiles" icon={Building} />
              <NavItem id="admin-skills" label="Skill Library" icon={ShieldCheck} />
              <NavItem id="admin-users" label="Employees" icon={Users} />
            </>
          ) : (
            <>
              <div className="px-4 pb-2 pt-2 text-xs font-semibold text-slate-400 uppercase">Employee Portal</div>
              <NavItem id="emp-dashboard" label="My Skill Gap" icon={LayoutDashboard} />
              <NavItem id="emp-assessment" label="Assessments" icon={ClipboardList} />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-3 mb-4 px-2">
             <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
                {user.avatarUrl ? <img src={user.avatarUrl} alt="avatar" /> : <UserCircle size={20} className="text-slate-500"/>}
             </div>
             <div className="overflow-hidden">
               <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
               <p className="text-xs text-slate-500 truncate">{user.email}</p>
             </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full flex items-center justify-center space-x-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-4 py-2 rounded-md text-sm transition-all shadow-sm"
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 p-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};