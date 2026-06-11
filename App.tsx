import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { useStoreData } from './hooks/useStoreData';
import { Layout } from './components/Layout';

// A3.5: Code-split heavy page bundles — each loads only when first visited.
const EmployeeDashboard = lazy(() => import('./pages/EmployeeDashboard').then(m => ({ default: m.EmployeeDashboard })));
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard').then(m => ({ default: m.ManagerDashboard })));
const AdminPanel = lazy(() => import('./pages/AdminPanel').then(m => ({ default: m.AdminPanel })));
const CEOPanel = lazy(() => import('./pages/CEOPanel').then(m => ({ default: m.CEOPanel })));
const EvaluationsHub = lazy(() => import('./pages/EvaluationsHub').then(m => ({ default: m.EvaluationsHub })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
import { Logo } from './components/Logo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { dataService, CONFIG, isBootstrapAdminEmail } from './services/store';
// Note: OnlineAssessments, ManagerialInterviews, EvidencePortal, BehavioralAssessment
// are rendered via EvaluationsHub (lazy-loaded above) — no direct import needed.
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { User, Role } from './types';
import { ShieldCheck, Loader2, Lock, User as UserIcon, CheckCircle, ArrowRight, Activity, X, ArrowLeft, Clock } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);
    const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  
  const [activeTab, setActiveTab] = useState('emp-dashboard');
  const [tabKey, setTabKey] = useState(0);
  const [error, setError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // A5.3: Subscribe to store so permission errors surface in the UI.
  useStoreData();
  const permissionError = dataService.getPermissionError();

  // Initialize Data Service and listen for auth state changes
  useEffect(() => {
    let mounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!mounted) return;

      if (firebaseUser) {
        // The throwaway auto-session from a pending sign-up is torn down
        // inside signUp(); don't chase it with a getCurrentUser/signOut
        // round-trip that just flickers the UI. signUp drives the result.
        if (dataService.isSignUpInProgress()) {
          if (mounted) setIsLoading(false);
          return;
        }
        try {
          await dataService.initialize();
          const currentUser = await dataService.getCurrentUser();
          if (mounted && currentUser) {
            setUser(currentUser);
            if (currentUser.role === Role.ADMIN) {
              setActiveTab('admin-dashboard');
            } else if (currentUser.role === Role.CEO) {
              setActiveTab('ceo-dashboard');
            } else if (dataService.isManager(currentUser)) {
              setActiveTab('manager-dashboard');
            } else {
              setActiveTab('emp-dashboard');
            }
          } else if (mounted) {
            setUser(null);
          }
        } catch (err) {
          console.error('Auth init error:', err);
          if (mounted) setUser(null);
        }
      } else {
        if (mounted) setUser(null);
      }

      if (mounted) setIsLoading(false);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetSuccess(false);
    setAuthLoading(true);

    try {
        if (isForgotPassword) {
            const result = await dataService.resetPassword(email);
            if (result.success) {
                setResetSuccess(true);
                setIsForgotPassword(false);
            } else {
                setError(result.error || 'Failed to send reset email');
            }
        } else if (isLoginMode) {
            const result = await dataService.loginWithPassword(email, password);
            if (result.user) {
                setUser(result.user);
                // Set default tab based on role
                if (result.user.role === Role.ADMIN) {
                    setActiveTab('admin-dashboard');
                } else if (result.user.role === Role.CEO) {
                    setActiveTab('ceo-dashboard');
                } else if (dataService.isManager(result.user)) {
                    setActiveTab('manager-dashboard');
                } else {
                    setActiveTab('emp-dashboard');
                }
            } else if ('pending' in result && result.pending) {
                // PENDING users are signed out inside loginWithPassword (no
                // live session); show a dedicated waiting screen instead of
                // bouncing back to the login form with a terse error.
                setPendingApproval(true);
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
    setTabKey(k => k + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-slate-600 gap-4">
        <Loader2 className="animate-spin text-slate-900" size={48} />
        <p className="font-bold tracking-widest text-xs uppercase animate-pulse">Initializing System...</p>
      </div>
    );
  }

  // --- PENDING APPROVAL ---
  // Shown when a PENDING user signs in. They are already signed out (no live
  // session); this is a terminal, unauthenticated screen reached before any
  // dashboard can render, so there is no jarring authenticated flash.
  if (pendingApproval) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-md text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-4 mb-12 justify-center">
            <div className="w-20 h-20 rounded-none overflow-hidden flex items-center justify-center bg-white border border-slate-300 p-2">
              <Logo className="w-full h-full" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold text-3xl tracking-tight leading-none text-slate-900">EPROM CMS</span>
              <span className="text-xs text-slate-900 font-bold uppercase tracking-widest mt-1">EPROM Competency program</span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-10">
            <div className="w-16 h-16 mx-auto mb-6 rounded-none flex items-center justify-center bg-amber-100 text-amber-700 border border-amber-200">
              <Clock size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-3">
              Account Pending Approval
            </h2>
            <p className="text-slate-600 leading-relaxed mb-8">
              Your account has been created but is awaiting administrator
              approval. You will be able to sign in once an administrator
              activates your profile. Please check back later or contact your
              system administrator.
            </p>
            <button
              type="button"
              onClick={() => {
                setPendingApproval(false);
                setEmail('');
                setPassword('');
                setError('');
                setIsLoginMode(true);
                setIsForgotPassword(false);
              }}
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-3 rounded-none transition-all flex items-center justify-center gap-2 group"
            >
              <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform opacity-70" />
              Back to Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- LOGIN ---
  if (!user) {
    return (
      <div className="min-h-screen flex bg-slate-50">
        {/* Left Side - Branding (Hidden on mobile) */}
        <div className="hidden lg:flex lg:w-1/2 bg-blue-900 relative overflow-hidden flex-col justify-between p-12">
            <div className="absolute inset-0 z-0">
                <img src="https://images.unsplash.com/photo-1581094794329-c8112a89af12?q=80&w=2070&auto=format&fit=crop" alt="Industrial Background" className="w-full h-full object-cover opacity-20" />
                <div className="absolute inset-0 bg-gradient-to-t from-blue-900 via-blue-900/60 to-transparent"></div>
            </div>
            
            <div className="relative z-10">
                <div className="flex items-center gap-4 mb-12">
                   <div className="w-20 h-20 rounded-none overflow-hidden flex items-center justify-center bg-white p-2">
                        <Logo className="w-full h-full" />
                   </div>
                   <div className="flex flex-col">
                     <span className="font-bold text-3xl tracking-tight leading-none text-white">EPROM CMS</span>
                     <span className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">EPROM Competency program</span>
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
                        <CheckCircle size={16} className="text-emerald-500" />
                        <span>Skill Gap Analysis</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <CheckCircle size={16} className="text-emerald-500" />
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
                   <div className="w-20 h-20 rounded-none overflow-hidden flex items-center justify-center bg-white  border border-slate-300 p-2">
                        <Logo className="w-full h-full" />
                   </div>
                   <div className="flex flex-col text-left">
                     <span className="font-bold text-3xl tracking-tight leading-none text-slate-900">EPROM CMS</span>
                     <span className="text-xs text-slate-900 font-bold uppercase tracking-widest mt-1">EPROM Competency program</span>
                   </div>
                </div>

                <div className="mb-10">
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
                        {isForgotPassword ? 'Reset Password' : isLoginMode ? 'Welcome back' : 'Create an account'}
                    </h2>
                    <p className="text-slate-700 mt-2">
                        {isForgotPassword 
                            ? 'Enter your email and we will send you a reset link.' 
                            : isLoginMode 
                                ? 'Enter your details to access your dashboard.' 
                                : 'Join EPROM CMS to manage your professional profile. If your profile was added by your administrator, sign up here with your work email to set your password and activate your account.'}
                    </p>
                </div>
                
                <form onSubmit={handleAuth} className="space-y-5">
                    {signupSuccess && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-none flex items-start gap-3">
                            <CheckCircle size={20} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                            <div className="text-sm">
                                <p className="font-bold">Registration Successful</p>
                                <p className="text-slate-700 mt-1">
                                    {isBootstrapAdminEmail(email)
                                        ? 'Admin account created. You can now sign in.'
                                        : 'Your profile is pending administrator approval (if new) or activated successfully (if pre-existing).'}
                                </p>
                            </div>
                        </div>
                    )}
                    
                    {resetSuccess && (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-none flex items-start gap-3">
                            <CheckCircle size={20} className="mt-0.5 flex-shrink-0 text-emerald-500" />
                            <div className="text-sm">
                                <p className="font-bold">Reset Email Sent</p>
                                <p className="text-slate-700 mt-1">
                                    If an account exists for {email}, a password reset link has been sent.
                                </p>
                            </div>
                        </div>
                    )}

                    {!isLoginMode && !isForgotPassword && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                            <div className="relative">
                                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                                <input 
                                    type="text" 
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 rounded-none border border-slate-300 bg-white focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 outline-none transition-all text-slate-900 placeholder:text-slate-600 "
                                    placeholder="e.g. John Smith"
                                    required={!isLoginMode && !isForgotPassword}
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
                                className="w-full pl-10 pr-4 py-3 rounded-none border border-slate-300 bg-white focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 outline-none transition-all text-slate-900 placeholder:text-slate-600 "
                                placeholder="name@company.com"
                                required
                            />
                        </div>
                    </div>

                    {!isForgotPassword && (
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-sm font-medium text-slate-700">Password</label>
                                {isLoginMode && (
                                    <button type="button" onClick={() => { setIsForgotPassword(true); setError(''); setResetSuccess(false); }} className="text-sm text-slate-900 hover:underline font-medium">Forgot password?</button>
                                )}
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
                                <input 
                                    type="password" 
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 rounded-none border border-slate-300 bg-white focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900 outline-none transition-all text-slate-900 placeholder:text-slate-600 "
                                    placeholder="••••••••"
                                    required={!isForgotPassword}
                                />
                            </div>
                        </div>
                    )}
                    
                    {error && (
                        <div className="bg-slate-50 border border-slate-100 text-slate-600 p-3 rounded-none text-sm flex items-center gap-2 font-medium">
                            <ShieldCheck size={16}/> {error}
                        </div>
                    )}

                    <button 
                        type="submit" 
                        disabled={authLoading}
                        className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-3 rounded-none transition-all flex items-center justify-center gap-2 mt-6 group disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {authLoading ? <Loader2 className="animate-spin" size={20} /> : (
                            <>
                                {isForgotPassword ? 'Send Reset Link' : isLoginMode ? 'Sign in' : 'Create account'}
                                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform opacity-70" />
                            </>
                        )}
                    </button>

                    <div className="text-center mt-8 gap-4 flex flex-col">
                        {isForgotPassword ? (
                            <button 
                                type="button"
                                onClick={() => { setIsForgotPassword(false); setIsLoginMode(true); setError(''); }}
                                className="text-sm text-slate-900 font-semibold hover:underline"
                            >
                                Back to Sign in
                            </button>
                        ) : (
                            <div>
                                <span className="text-slate-700 text-sm">
                                    {isLoginMode ? "Don't have an account? " : "Already have an account? "}
                                </span>
                                <button 
                                    type="button"
                                    onClick={() => { setIsLoginMode(!isLoginMode); setError(''); setIsForgotPassword(false); }}
                                    className="text-sm text-slate-900 font-semibold hover:underline"
                                >
                                    {isLoginMode ? 'Sign up' : 'Sign in'}
                                </button>
                            </div>
                        )}
                    </div>
                </form>

                {import.meta.env.DEV && CONFIG.SOURCE === 'MOCK' && isLoginMode && (
                    <div className="mt-12 pt-8 border-t border-slate-300">
                        <p className="text-[10px] text-slate-600 mb-4 font-bold uppercase tracking-widest text-center">Development Access</p>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => { setEmail('sarah.ahmed@midor.com.eg'); setPassword('any'); }} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-none  text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all flex justify-between items-center">
                                <span>Employee</span>
                                <span className="text-slate-600 text-xs">Sarah</span>
                            </button>
                            <button onClick={() => { setEmail('sameh.i@zohr.com.eg'); setPassword('any'); }} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-none  text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all flex justify-between items-center">
                                <span>Manager (SH)</span>
                                <span className="text-slate-600 text-xs">Sameh</span>
                            </button>
                            <button onClick={() => { setEmail('admin@egpc.com.eg'); setPassword('any'); }} className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-none  text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all flex justify-between items-center">
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
    // ADMIN can access every admin-* route; CEO is restricted to admin-depts (Org Structure) only
    const isCeoOrgStructureAccess = user.role === Role.CEO && activeTab === 'admin-depts';
    if (activeTab.startsWith('admin-') && user.role !== Role.ADMIN && !isCeoOrgStructureAccess) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] p-12 text-center animate-fade-in">
          <div className="bg-slate-50 text-slate-500 p-6 rounded-none mb-6">
            <Lock size={48} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Access Denied</h2>
          <p className="text-slate-600 max-w-md mb-8">
            You do not have the required permissions to view this administration page. Please contact your system administrator if you believe this is an error.
          </p>
          <button 
            onClick={() => setActiveTab('emp-dashboard')}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-sm font-medium hover:bg-blue-800 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }

    if ((activeTab === 'manager-dashboard' || activeTab === 'manager-approvals') && !dataService.isManager(user)) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] p-12 text-center animate-fade-in">
          <div className="bg-slate-50 text-slate-500 p-6 rounded-none mb-6">
            <Lock size={48} />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-3">Managerial Access Required</h2>
          <p className="text-slate-600 max-w-md mb-8">
            This section is restricted to managers or employees who have directly reporting subordinates.
          </p>
          <button 
            onClick={() => setActiveTab('emp-dashboard')}
            className="bg-blue-700 text-white px-6 py-2.5 rounded-sm font-medium hover:bg-blue-800 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      );
    }

    switch(activeTab) {
        case 'emp-dashboard': return <EmployeeDashboard user={user} />;
        case 'ceo-dashboard': return (
            <CEOPanel 
                currentUser={user} 
                onViewProfile={(id) => {
                    setSelectedProfileUserId(id);
                    setActiveTab('ceo-view-profile');
                }} 
            />
        );
        case 'ceo-view-profile': {
            const targetUser = dataService.getUserById(selectedProfileUserId || '');
            if (!targetUser) return (
                <CEOPanel 
                    currentUser={user} 
                    onViewProfile={(id) => {
                        setSelectedProfileUserId(id);
                        setActiveTab('ceo-view-profile');
                    }} 
                />
            );
            return (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <button 
                        onClick={() => setActiveTab('ceo-dashboard')}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest hover:bg-slate-900 hover:text-white transition-all shadow-sm"
                    >
                        <ArrowLeft size={14} /> Back to Dashboard
                    </button>
                    <EmployeeDashboard user={targetUser} />
                </div>
            );
        }
        case 'manager-dashboard': return <ManagerDashboard user={user} />;
        case 'manager-approvals': return <ManagerDashboard user={user} initialView="APPROVALS" />;
        case 'evaluations': return <EvaluationsHub currentUser={user} />;
        // Legacy deep-link cases — open hub with correct sub-tab pre-selected
        case 'online-assessments': return <EvaluationsHub currentUser={user} initialTab="online" />;
        case 'interviews': return <EvaluationsHub currentUser={user} initialTab="interviews" />;
        case 'emp-assessment': return <EvaluationsHub currentUser={user} initialTab="360" />;
        case 'evidence-portal': return <EvaluationsHub currentUser={user} initialTab="evidence" />;
        // Admin Views - Mapped to sidebar IDs
        case 'admin-dashboard': return <AdminPanel view="OVERVIEW" onNavigate={setActiveTab} />;
        case 'admin-analytics': return <AdminPanel view="ANALYTICS" onNavigate={setActiveTab} />;
        case 'admin-assessments': return <AdminPanel view="PLANS" onNavigate={setActiveTab} />;
        case 'admin-instructions': return <AdminPanel view="INSTRUCTIONS" onNavigate={setActiveTab} />;
        case 'admin-audit': return <AdminPanel view="AUDIT" onNavigate={setActiveTab} />;
        case 'admin-users': return <AdminPanel view="USERS" onNavigate={setActiveTab} />;
        case 'admin-jobs': return <AdminPanel view="JOBS" onNavigate={setActiveTab} />;
        case 'admin-skills': return <AdminPanel view="SKILLS" onNavigate={setActiveTab} />;
        case 'admin-depts': return <AdminPanel view="DEPTS" onNavigate={setActiveTab} />;
        case 'settings': return <SettingsPage user={user} />;
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
      {permissionError && (
        <div className="bg-rose-50 border-b border-rose-200 text-rose-800 px-4 py-3 flex items-start justify-between gap-3" role="alert">
          <span><strong className="font-bold">Permission Denied: </strong>{permissionError}</span>
          <button onClick={() => dataService.clearPermissionError()} className="shrink-0 text-rose-600 hover:text-rose-900" aria-label="Dismiss">✕</button>
        </div>
      )}
      <ErrorBoundary>
        <Suspense fallback={
          <div className="flex items-center justify-center h-[60vh]">
            <Loader2 className="animate-spin text-slate-400" size={36} />
          </div>
        }>
          <div key={tabKey}>
            {renderContent()}
          </div>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
};

export default App;