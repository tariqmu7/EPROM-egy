import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { AssessmentPortal } from './pages/AssessmentPortal';
import { AdminPanel } from './pages/AdminPanel';
import { dataService, CONFIG } from './services/store';
import { User, Role } from './types';
import { ShieldCheck, Loader2, Lock, User as UserIcon, CheckCircle } from 'lucide-react';

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
                // Don't auto-login. Show success message awaiting approval
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-500 gap-4">
        <Loader2 className="animate-spin text-teal-600" size={48} />
        <p className="font-medium animate-pulse">Connecting to ERPOM Database...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white rounded-xl shadow-2xl overflow-hidden max-w-md w-full border border-slate-200">
            <div className="bg-white p-8 text-center border-b border-slate-100">
                <img 
                    src="https://d2cqpzl92y75ws.cloudfront.net/components/uploads/cms-medias/2021/10/EPROM_logo-280x115.png" 
                    alt="EPROM Logo" 
                    className="mx-auto w-full max-w-[220px] h-auto object-contain mb-4"
                />
                <h1 className="text-xl font-bold text-slate-800">Competency Manager</h1>
                <p className="text-slate-500 text-sm mt-1">Employee Skill Management System</p>
                {CONFIG.SOURCE === 'MOCK' && <span className="inline-block mt-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-bold rounded uppercase border border-yellow-200">Mock Mode</span>}
            </div>
            
            <form onSubmit={handleAuth} className="p-8 space-y-5">
                {signupSuccess && (
                    <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex items-start gap-3 mb-4">
                        <CheckCircle size={20} className="mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                            <p className="font-bold">Account Created!</p>
                            <p>Your account is pending administrator approval. Please check back later.</p>
                        </div>
                    </div>
                )}

                <div className="flex justify-center mb-4">
                    <div className="bg-slate-100 p-1 rounded-lg flex text-sm font-medium">
                        <button 
                            type="button"
                            onClick={() => { setIsLoginMode(true); setError(''); setSignupSuccess(false); }}
                            className={`px-4 py-1.5 rounded-md transition-all ${isLoginMode ? 'bg-white shadow text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Log In
                        </button>
                        <button 
                            type="button"
                            onClick={() => { setIsLoginMode(false); setError(''); setSignupSuccess(false); }}
                            className={`px-4 py-1.5 rounded-md transition-all ${!isLoginMode ? 'bg-white shadow text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Sign Up
                        </button>
                    </div>
                </div>

                {!isLoginMode && (
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name</label>
                        <div className="relative">
                            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-slate-800"
                                placeholder="John Doe"
                                required={!isLoginMode}
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Company Email</label>
                    <div className="relative">
                        <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-slate-800"
                            placeholder="name@eprom.com"
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Password</label>
                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input 
                            type="password" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all text-slate-800"
                            placeholder="••••••••"
                            required
                        />
                    </div>
                </div>
                
                {error && <p className="text-red-500 text-xs bg-red-50 p-3 rounded border border-red-100">{error}</p>}

                <button 
                    type="submit" 
                    disabled={authLoading}
                    className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                    {authLoading && <Loader2 className="animate-spin" size={18} />}
                    {isLoginMode ? 'Access Portal' : 'Create Account'}
                </button>

                {CONFIG.SOURCE === 'MOCK' && isLoginMode && (
                    <div className="pt-4 border-t border-slate-100">
                        <p className="text-xs text-center text-slate-400">Demo Credentials (Mock Mode):</p>
                        <div className="flex flex-wrap gap-2 justify-center mt-2">
                            <span onClick={() => { setEmail('sara@erpom.com'); setPassword('any'); }} className="cursor-pointer px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 hover:bg-slate-200">Employee</span>
                            <span onClick={() => { setEmail('ahmed@erpom.com'); setPassword('any'); }} className="cursor-pointer px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 hover:bg-slate-200">Manager</span>
                            <span onClick={() => { setEmail('admin@erpom.com'); setPassword('any'); }} className="cursor-pointer px-2 py-1 bg-slate-100 rounded text-xs text-slate-600 hover:bg-slate-200">Admin</span>
                        </div>
                    </div>
                )}
            </form>
        </div>
      </div>
    );
  }

  // Router Logic based on Tab ID
  const renderContent = () => {
    switch(activeTab) {
        case 'emp-dashboard': return <EmployeeDashboard user={user} />;
        case 'emp-assessment': return <AssessmentPortal currentUser={user} />;
        case 'admin-dashboard': return <AdminPanel defaultTab="USERS" />;
        case 'admin-users': return <AdminPanel defaultTab="USERS" />;
        case 'admin-jobs': return <AdminPanel defaultTab="JOBS" />;
        case 'admin-skills': return <AdminPanel defaultTab="SKILLS" />;
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