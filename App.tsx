import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { ManagerDashboard } from './pages/ManagerDashboard';
import { AdminPanel } from './pages/AdminPanel';
import { CompetencyMatrix } from './pages/CompetencyMatrix';
import { EvidencePortal } from './pages/EvidencePortal';
import { SupervisorApproval } from './pages/SupervisorApproval';
import { BehavioralAssessment } from './pages/BehavioralAssessment';
import { Logo } from './components/Logo';
import { dataService, CONFIG } from './services/store';
import { User, Role } from './types';
import { ShieldCheck, Loader2, Lock, User as UserIcon, CheckCircle, ArrowRight, Activity, X } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  
  // Auth State
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);
  
  const [activeTab, setActiveTab] = useState('emp-dashboard');
  const [error, setError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize Data Service
  useEffect(() => {
    const init = async () => {
      await dataService.initialize();
      setIsLoading(false);
    };
    init();
  }, []);

  const handleAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAuthLoading(true);

    try {
        if (isLoginMode) {
            const result = await dataService.loginWithPassword(email, password);
            if (result.user) {
                setUser(result.user);
                // Set default tab based on role
                if (result.user.role === Role.ADMIN) {
                    setActiveTab('admin-dashboard');
                } else if (dataService.isManager(result.user)) {
                    setActiveTab('manager-dashboard');
                } else {
                    setActiveTab('emp-dashboard');
                }
            } else {
                setError(result.error || 'Login failed');
            }
        } else {
            // Sign Up
            const result = await dataService.signUp(email, password, { name: fullName });
            if (result.user) {
                setSignupSuccess(true);
                setIsLoginMode(true);
                setPassword('');
            } else {
                setError(result.error || 'Sign up failed');
            }
        }
    } catch (err) {
        setError('An unexpected error occurred');
        console.error(err);
    } finally {
        setAuthLoading(false);
    }
  }, [isLoginMode, email, password, fullName]);

  const handleLogout = useCallback(async () => {
    await dataService.signOut();
    setUser(null);
    setEmail('');
    setPassword('');
  }, []);

  const handleSwitchTab = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-600 gap-4">
        <Loader2 className="animate-spin text-blue-700" size={48} />
        <p className="font-bold tracking-widest text-xs uppercase animate-pulse">Initializing System...</p>
      </div>
    );
  }

  // --- LOGIN ---
  if (!user) {
    return (
      <div className="min-h-screen flex bg-slate-50">
        {/* Left Side - Branding (Hidden on mobile) */}
        <div className="hidden lg:flex lg:w-1/2 bg-slate-900 relative overflow-hidden flex-col justify-between p-12">
            <div className="absolute inset-0 z-0">
                <img src="https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=2070&auto=format&fit=crop" alt="Industrial Background" className="w-full h-full object-cover opacity-20" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent"></div>
            </div>
            
            <div className="relative z-10">
                <div className="flex items-center gap-4 mb-12">
                   <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center bg-white p-2">
                        <Logo className="w-full h-full" />
                   </div>
                   <div className="flex flex-col">
                     <span className="font-bold text-3xl tracking-tight leading-none text-white">EPROM CMS</span>
                     <span className="text-xs text-blue-400 font-bold uppercase tracking-widest mt-1">EPROM Competency program</span>
                   </div>
                </div>
            </div>

            <div className="relative z-10 max-w-lg">
                <h1 className="text-4xl font-bold text-white mb-6 leading-tight">
                    Empowering the Energy Sector Workforce
                </h1>
                <p className="text-slate-500 text-lg mb-8 leading-relaxed">
                    A comprehensive competency management system featuring skill gap analysis dashboards, 360-degree assessments, and intelligent job profiling.
                </p>
                <div className="flex items-center gap-4 text-sm font-medium text-slate-600">
                    <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-blue-400" />
                        <span>Skill Gap Analysis</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-blue-400" />
                        <span>360° Assessments</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Side - Auth Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 relative">
            <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Mobile Logo */}
                <div className="flex lg:hidden items-center gap-4 mb-10 justify-center">
                   <div className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center bg-white shadow-sm border border-slate-200 p-2">
                        <Logo className="w-full h-full" />
                   </div>
                   <div className="flex flex-col text-left">
                     <span className="font-bold text-3xl tracking-tight leading-none text-slate-900">EPROM CMS</span>
                     <span className="text-xs text-blue-700 font-bold uppercase tracking-widest mt-1">EPROM Competency program</span>
                   </div>
                </div>

                <div className="mb-10">
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
                        {isLoginMode ? 'Welcome back' : 'Create an account'}
                    </h2>
                    <p className="text-slate-700 mt-2">
                        {isLoginMode ? 'Enter your details to access your dashboard.' : 'Join EPROM CMS to manage your professional profile.'}
                    </p>
                </div>
                
                <form onSubmit={handleAuth} className="space-y-5">
                    {signupSuccess && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-start gap-3">
                            <CheckCircle size={20} className="mt-0.5 flex-shrink-0 text-emerald-700" />
                            <div className="text-sm">
                                <p className="font-bold">Registration Successful</p>
                                <p className="text-emerald-700 mt-1">Your profile is pending approval.</p>
                            </div>
                        </div>
                    )}

                    {!isLoginMode && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                            <div className="relative">
                                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                                <input 
                                    type="text" 
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-900 placeholder:text-slate-600 shadow-sm"
                                    placeholder="e.g. John Smith"
                                    required={!isLoginMode}
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                        <div className="relative">
                            <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-900 placeholder:text-slate-600 shadow-sm"
                                placeholder="name@company.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-sm font-medium text-slate-700">Password</label>
                            {isLoginMode && (
                                <a href="#" className="text-sm text-blue-700 hover:text-blue-700 font-medium">Forgot password?</a>
                            )}
                        </div>
                        <div className="relative">
                            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-slate-900 placeholder:text-slate-600 shadow-sm"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>
                    
                    {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-sm flex items-center gap-2 font-medium">
                            <ShieldCheck size={16}/> {error}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={authLoading}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 mt-6 group disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {authLoading ? <Loader2 className="animate-spin" size={20} /> : (
                            <>
                                {isLoginMode ? 'Sign in' : 'Create account'}
                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform opacity-70" />
                            </>
                        )}
                    </button>

                    <div className="text-center mt-8">
                        <span className="text-slate-700 text-sm">
                            {isLoginMode ? "Don't have an account? " : "Already have an account? "}
                        </span>
                        <button 
                            type="button"
                            onClick={() => { setIsLoginMode(!isLoginMode); setError(''); }}
                            className="text-sm text-slate-900 font-semibold hover:underline"
                        >
                            {isLoginMode ? 'Sign up' : 'Sign in'}
                        </button>
                    </div>
                </form>

                {CONFIG.SOURCE === 'MOCK' && isLoginMode && (
                    <div className="mt-12 pt-8 border-t border-slate-200">
                        <p className="text-[10px] text-slate-600 mb-4 font-bold uppercase tracking-widest text-center">Development Access</p>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => { setEmail('sarah.ahmed@midor.com.eg'); setPassword('any'); }} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all flex justify-between items-center">
                                <span>Employee</span>
                                <span className="text-slate-600 text-xs">Sarah</span>
                            </button>
                            <button onClick={() => { setEmail('sameh.i@zohr.com.eg'); setPassword('any'); }} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all flex justify-between items-center">
                                <span>Manager (DH)</span>
                                <span className="text-slate-600 text-xs">Sameh</span>
                            </button>
                            <button onClick={() => { setEmail('admin@egpc.com.eg'); setPassword('any'); }} className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all flex justify-between items-center">
                                <span>Admin</span>
                                <span className="text-slate-600 text-xs">Mahmoud</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    );
  }

  // Router Logic
  const renderContent = () => {
    // Role Validation
    if (activeTab.startsWith('admin-') && user.role !== Role.ADMIN) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] p-12 text-center animate-fade-in">
          <div className="bg-red-50 text-red-500 p-6 rounded-full mb-6">
            <Lock size={48} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Access Denied</h2>
          <p className="text-slate-600 max-w-md mb-8">
            You do not have the required permissions to view this administration page. Please contact your system administrator if you believe this is an error.
          </p>
          <button 
            onClick={() => setActiveTab('emp-dashboard')}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }

    if (activeTab === 'manager-dashboard' && !dataService.isManager(user)) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] p-12 text-center animate-fade-in">
          <div className="bg-orange-50 text-orange-500 p-6 rounded-full mb-6">
            <Lock size={48} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Managerial Access Required</h2>
          <p className="text-slate-600 max-w-md mb-8">
            This section is restricted to employees with managerial hierarchy levels (Department Head and above).
          </p>
          <button 
            onClick={() => setActiveTab('emp-dashboard')}
            className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }

    switch(activeTab) {
        case 'emp-dashboard': return <EmployeeDashboard user={user} />;
        case 'manager-dashboard': return <ManagerDashboard user={user} />;
        case 'emp-assessment': return <BehavioralAssessment currentUser={user} />;
        case 'competency-matrix': return <CompetencyMatrix currentUser={user} />;
        case 'evidence-portal': return <EvidencePortal currentUser={user} />;
        case 'supervisor-approval': return <SupervisorApproval currentUser={user} />;
        // Admin Views - Mapped to sidebar IDs
        case 'admin-dashboard': return <AdminPanel view="OVERVIEW" onNavigate={setActiveTab} />;
        case 'admin-analytics': return <AdminPanel view="ANALYTICS" onNavigate={setActiveTab} />;
        case 'admin-cycles': return <AdminPanel view="CYCLES" onNavigate={setActiveTab} />;
        case 'admin-users': return <AdminPanel view="USERS" onNavigate={setActiveTab} />;
        case 'admin-jobs': return <AdminPanel view="JOBS" onNavigate={setActiveTab} />;
        case 'admin-skills': return <AdminPanel view="SKILLS" onNavigate={setActiveTab} />;
        case 'admin-depts': return <AdminPanel view="DEPTS" onNavigate={setActiveTab} />;
        default: return <div className="p-8 text-center text-slate-600">Section Under Construction</div>;
    }
  };

  return (
    <Layout 
      user={user} 
      onLogout={handleLogout} 
      activeTab={activeTab} 
      onSwitchTab={handleSwitchTab}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;