import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { AssessmentPortal } from './pages/AssessmentPortal';
import { AdminPanel } from './pages/AdminPanel';
import { dataService, CONFIG } from './services/store';
import { User, Role } from './types';
import { ShieldCheck, Loader2, Lock, User as UserIcon, CheckCircle, ArrowRight, Activity } from 'lucide-react';

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

  const handleAuth = async (e: React.FormEvent) => {
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
  };

  const handleLogout = async () => {
    await dataService.signOut();
    setUser(null);
    setEmail('');
    setPassword('');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brand-900 text-slate-400 gap-4">
        <Loader2 className="animate-spin text-energy-teal" size={48} />
        <p className="font-bold tracking-widest text-xs uppercase animate-pulse">Initializing System...</p>
      </div>
    );
  }

  // --- LOGIN SCREEN ---
  if (!user) {
    return (
      <div className="min-h-screen flex bg-brand-900">
        
        {/* Left: Industrial Imagery */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
           <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=2532&auto=format&fit=crop')] bg-cover bg-center opacity-60 mix-blend-overlay"></div>
           <div className="absolute inset-0 bg-gradient-to-r from-brand-900 via-brand-900/80 to-transparent"></div>
           
           <div className="relative z-10 p-16 flex flex-col justify-between h-full text-white">
              <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                 <Activity size={32} className="text-energy-teal" />
              </div>
              
              <div className="space-y-6">
                <h1 className="text-5xl font-bold leading-tight">
                  Driving Excellence in <br/>
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-energy-teal to-blue-400">Oil & Gas Operations</span>
                </h1>
                <p className="text-lg text-slate-300 max-w-lg leading-relaxed">
                  Manage workforce competency, ensure safety compliance, and optimize operational performance with ERPOM's advanced analytical suite.
                </p>
                <div className="flex gap-4 pt-4">
                   <div className="px-4 py-2 bg-white/5 backdrop-blur border border-white/10 rounded-lg">
                      <p className="text-2xl font-bold">100%</p>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Compliance</p>
                   </div>
                   <div className="px-4 py-2 bg-white/5 backdrop-blur border border-white/10 rounded-lg">
                      <p className="text-2xl font-bold">ISO</p>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">Standardized</p>
                   </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 font-mono">© 2024 EPROM • Engineering for the Petroleum & Process Industries</p>
           </div>
        </div>

        {/* Right: Login Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-slate-50 relative">
            <div className="w-full max-w-md bg-white p-10 rounded-2xl shadow-2xl border border-slate-100">
                <div className="text-center mb-10">
                    <img 
                        src="https://d2cqpzl92y75ws.cloudfront.net/components/uploads/cms-medias/2021/10/EPROM_logo-280x115.png" 
                        alt="EPROM Logo" 
                        className="h-12 w-auto mx-auto mb-6"
                    />
                    <h2 className="text-2xl font-bold text-brand-900">
                        {isLoginMode ? 'Welcome Back' : 'Join the Team'}
                    </h2>
                    <p className="text-slate-500 text-sm mt-2">
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
                            <label className="block text-xs font-bold text-brand-900 uppercase tracking-wider mb-2">Full Name</label>
                            <div className="relative">
                                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="text" 
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-energy-teal focus:border-transparent outline-none transition-all text-slate-800 placeholder:text-slate-400"
                                    placeholder="e.g. John Smith"
                                    required={!isLoginMode}
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-bold text-brand-900 uppercase tracking-wider mb-2">Email Identity</label>
                        <div className="relative">
                            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-energy-teal focus:border-transparent outline-none transition-all text-slate-800 placeholder:text-slate-400"
                                placeholder="username@eprom.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-brand-900 uppercase tracking-wider mb-2">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="password" 
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white focus:ring-2 focus:ring-energy-teal focus:border-transparent outline-none transition-all text-slate-800 placeholder:text-slate-400"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>
                    
                    {error && <p className="text-energy-red text-xs bg-red-50 p-3 rounded-lg border border-red-100 flex items-center gap-2 font-medium"><ShieldCheck size={14}/> {error}</p>}

                    <button 
                        type="submit" 
                        disabled={authLoading}
                        className="w-full bg-brand-900 hover:bg-brand-800 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-900/20 mt-4 group"
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
                             className="text-sm text-brand-600 hover:text-brand-900 font-medium hover:underline"
                        >
                             {isLoginMode ? 'Need an account?' : 'Already have an account?'}
                        </button>
                        <a href="#" className="text-sm text-slate-400 hover:text-slate-600">Forgot Password?</a>
                    </div>
                </form>

                {CONFIG.SOURCE === 'MOCK' && isLoginMode && (
                    <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-100 text-center">
                        <p className="text-[10px] text-slate-400 mb-3 font-bold uppercase tracking-widest">Development Access</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            <button onClick={() => { setEmail('sara@erpom.com'); setPassword('any'); }} className="px-3 py-1 bg-white border border-slate-200 rounded shadow-sm text-xs font-semibold text-slate-600 hover:border-energy-teal hover:text-energy-teal transition-all">Employee</button>
                            <button onClick={() => { setEmail('ahmed@erpom.com'); setPassword('any'); }} className="px-3 py-1 bg-white border border-slate-200 rounded shadow-sm text-xs font-semibold text-slate-600 hover:border-energy-teal hover:text-energy-teal transition-all">Manager</button>
                            <button onClick={() => { setEmail('admin@erpom.com'); setPassword('any'); }} className="px-3 py-1 bg-white border border-slate-200 rounded shadow-sm text-xs font-semibold text-slate-600 hover:border-energy-teal hover:text-energy-teal transition-all">Admin</button>
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
    switch(activeTab) {
        case 'emp-dashboard': return <EmployeeDashboard user={user} />;
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
      onSwitchTab={setActiveTab}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;