import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { ManagerDashboard } from './pages/ManagerDashboard';
import { AssessmentPortal } from './pages/AssessmentPortal';
import { AdminPanel } from './pages/AdminPanel';
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
                } else if (result.user.role === Role.MANAGER) {
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-400 gap-4">
        <Loader2 className="animate-spin text-blue-500" size={48} />
        <p className="font-bold tracking-widest text-xs uppercase animate-pulse">Initializing System...</p>
      </div>
    );
  }

  // --- LOGIN ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 relative p-4">
        {/* Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-400/10 rounded-full blur-[100px]"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-sky-400/10 rounded-full blur-[100px]"></div>
        </div>

        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-2xl border border-slate-200 relative z-10 animate-in zoom-in-95 duration-300">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded overflow-hidden mb-4">
                    <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRTk3oTrPWYW9cwmL9Wu21gBh0borRXsDUFsw&s" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">
                    {isLoginMode ? 'Welcome Back' : 'Join ERPOM OS'}
                </h2>
                <p className="text-slate-600 text-sm mt-2">
                    {isLoginMode ? 'Enter your credentials to access the dashboard' : 'Create your professional profile'}
                </p>
            </div>
            
            <form onSubmit={handleAuth} className="space-y-5">
                {signupSuccess && (
                    <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex items-start gap-3">
                        <CheckCircle size={20} className="mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                            <p className="font-bold">Registration Successful</p>
                            <p>Your profile is pending approval.</p>
                        </div>
                    </div>
                )}

                {!isLoginMode && (
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Full Name</label>
                        <div className="relative">
                            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-800 placeholder:text-slate-400"
                                placeholder="e.g. John Smith"
                                required={!isLoginMode}
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email Identity</label>
                    <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-800 placeholder:text-slate-400"
                            placeholder="username@eprom.com"
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-800 placeholder:text-slate-400"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                </div>
                
                {error && <p className="text-emerald-600 text-xs bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex items-center gap-2 font-medium"><ShieldCheck size={14}/> {error}</p>}

                <button 
                    type="submit" 
                    disabled={authLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 mt-4 group"
                >
                    {authLoading ? <Loader2 className="animate-spin" size={20} /> : (
                        <>
                            {isLoginMode ? 'Secure Login' : 'Create Account'}
                            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                        </>
                    )}
                </button>

                <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-100">
                    <button 
                            type="button"
                            onClick={() => { setIsLoginMode(!isLoginMode); setError(''); }}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium hover:underline"
                    >
                            {isLoginMode ? 'Need an account?' : 'Already have an account?'}
                    </button>
                    <a href="#" className="text-sm text-slate-400 hover:text-slate-600">Forgot Password?</a>
                </div>
            </form>

            {CONFIG.SOURCE === 'MOCK' && isLoginMode && (
                <div className="mt-8 p-4 bg-slate-100 rounded-lg border border-slate-200 text-center">
                    <p className="text-[10px] text-slate-400 mb-3 font-bold uppercase tracking-widest">Development Access</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                        <button onClick={() => { setEmail('sarah.ahmed@midor.com.eg'); setPassword('any'); }} className="px-3 py-1 bg-white border border-slate-200 rounded shadow-sm text-xs font-semibold text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all">Employee (Sarah)</button>
                        <button onClick={() => { setEmail('sameh.i@zohr.com.eg'); setPassword('any'); }} className="px-3 py-1 bg-white border border-slate-200 rounded shadow-sm text-xs font-semibold text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all">Manager (Sameh)</button>
                        <button onClick={() => { setEmail('admin@egpc.com.eg'); setPassword('any'); }} className="px-3 py-1 bg-white border border-slate-200 rounded shadow-sm text-xs font-semibold text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all">Admin (Mahmoud)</button>
                    </div>
                </div>
            )}
        </div>
      </div>
    );
  }

  // Router Logic
  const renderContent = () => {
    switch(activeTab) {
        case 'emp-dashboard': return <EmployeeDashboard user={user} />;
        case 'manager-dashboard': return <ManagerDashboard user={user} />;
        case 'emp-assessment': return <AssessmentPortal currentUser={user} />;
        // Admin Views - Mapped to sidebar IDs
        case 'admin-dashboard': return <AdminPanel view="OVERVIEW" onNavigate={setActiveTab} />;
        case 'admin-users': return <AdminPanel view="USERS" onNavigate={setActiveTab} />;
        case 'admin-jobs': return <AdminPanel view="JOBS" onNavigate={setActiveTab} />;
        case 'admin-skills': return <AdminPanel view="SKILLS" onNavigate={setActiveTab} />;
        case 'admin-depts': return <AdminPanel view="DEPTS" onNavigate={setActiveTab} />;
        default: return <div className="p-8 text-center text-slate-400">Section Under Construction</div>;
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