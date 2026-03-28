import React, { useState, useMemo } from 'react';
import { PlayCircle, ShieldAlert, Archive, CheckCircle, RefreshCw, Calendar, Users, Briefcase, Activity } from 'lucide-react';
import { dataService } from '../services/store';

export const AdminCycles: React.FC = () => {
  const [successMessage, setSuccessMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Archiving Filters
  const [selectedDept, setSelectedDept] = useState<string>('ALL');
  const [selectedJob, setSelectedJob] = useState<string>('ALL');
  const [selectedSkill, setSelectedSkill] = useState<string>('ALL');

  const departments = useMemo(() => dataService.getAllDepartments(), []);
  const jobs = useMemo(() => dataService.getAllJobs().filter(j => selectedDept === 'ALL' ? true : j.departmentId === selectedDept), [selectedDept]);
  const skills = useMemo(() => dataService.getAllSkills(), []);

  const activeCycle = useMemo(() => dataService.getActiveCycle(), []);
  // Use length of all cycles purely for logging purposes
  const allCyclesCount = dataService.getAllCycles().length;

  const handleTriggerAnnual360 = async () => {
    if (!window.confirm("Are you sure you want to initiate a new Annual 360 Evaluation? This will send a notification to all employees in the system.")) return;
    
    setIsProcessing(true);
    try {
      const year = new Date().getFullYear();
      await dataService.addCycle({
        name: `${year} Annual 360 Evaluation`,
        startDate: new Date().toISOString(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
        status: 'ACTIVE'
      });
      setSuccessMessage('Annual 360 Evaluation has been successfully initiated.');
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (e) {
      console.error(e);
      alert('Failed to initiate cycle');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTargetedReset = async () => {
    // Generate confirmation text
    const dName = selectedDept === 'ALL' ? 'All Departments' : departments.find(d => d.id === selectedDept)?.name;
    const jName = selectedJob === 'ALL' ? 'All Job Profiles' : jobs.find(j => j.id === selectedJob)?.title;
    const sName = selectedSkill === 'ALL' ? 'All Skills' : skills.find(s => s.id === selectedSkill)?.name;

    const confirmMsg = `WARNING: You are about to ARCHIVE existing skills assessments for:\n\n` +
                       `- Department: ${dName}\n` +
                       `- Job Profile: ${jName}\n` +
                       `- Skill: ${sName}\n\n` +
                       `This will enforce these users to retake their evaluations to be compliant. Are you sure?`;

    if (!window.confirm(confirmMsg)) return;

    setIsProcessing(true);
    try {
      const affectedCount = await dataService.archiveAssessments({
        departmentId: selectedDept === 'ALL' ? undefined : selectedDept,
        jobProfileId: selectedJob === 'ALL' ? undefined : selectedJob,
        skillId: selectedSkill === 'ALL' ? undefined : selectedSkill
      });

      setSuccessMessage(`Success: ${affectedCount} assessments were archived. Affected users have been notified.`);
      
      // Reset Selectors
      setSelectedDept('ALL');
      setSelectedJob('ALL');
      setSelectedSkill('ALL');
      
      setTimeout(() => setSuccessMessage(''), 5000);
    } catch (e) {
      console.error(e);
      alert('Failed to archive assessments.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="pb-6 border-b border-slate-300 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Assessment Engine</h2>
          <p className="text-slate-700 text-sm mt-1">Manage global 360 evaluations and enforce targeted reassessment protocols.</p>
        </div>
        <div className="bg-slate-100 p-2 rounded-sm border border-slate-300 flex items-center gap-2 text-sm text-slate-600 font-medium">
          <ShieldAlert size={16} />
          <span>Admin Controls</span>
        </div>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-sm flex items-center gap-3 animate-fade-in shadow-sm">
          <CheckCircle size={20} className="text-emerald-500" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Panel 1: Global Annual 360 Evaluation */}
        <div className="bg-white rounded-none border border-slate-300 overflow-hidden flex flex-col shadow-sm">
          <div className="h-2 bg-blue-600"></div>
          <div className="p-6 flex-grow">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-sm flex items-center justify-center bg-blue-50 text-blue-700">
                <Calendar size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 leading-tight">Annual 360 Evaluation</h3>
                <p className="text-sm font-medium text-slate-500">Global Assessment Tracker</p>
              </div>
            </div>
            
            <p className="text-slate-700 text-sm mb-6 pb-6 border-b border-slate-100">
              Initiate the once-a-year comprehensive 360-degree evaluation across the entire organization. This triggers tasks for all employees to complete Self, Peer, and Managerial assessments.
            </p>

            <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm mb-6">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current System Status</h4>
              {activeCycle ? (
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{activeCycle.name} <span className="text-emerald-600 ml-1">(ACTIVE)</span></p>
                    <p className="text-xs text-slate-500 mt-1">Due Date: {new Date(activeCycle.dueDate).toLocaleDateString()}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-slate-300"></div>
                  <div>
                    <p className="text-sm font-bold text-slate-600">No Active Evaluation Cycle</p>
                    <p className="text-xs text-slate-500 mt-0.5">Ready to initiate the next cycle. Historical Cycles: {allCyclesCount}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-slate-50 p-4 border-t border-slate-200">
            <button 
              onClick={handleTriggerAnnual360}
              disabled={isProcessing || activeCycle !== undefined}
              className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-none text-sm font-bold uppercase tracking-wider transition-colors ${
                activeCycle !== undefined 
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed border border-slate-300' 
                : 'bg-blue-600 text-white hover:bg-blue-700 border border-blue-700'
              }`}
            >
              {isProcessing ? 'Processing System...' : activeCycle ? 'Cycle Currently Active' : 'Initiate Annual 360 Evaluation'}
            </button>
          </div>
        </div>

        {/* Panel 2: Targeted Reassessment Engine */}
        <div className="bg-white rounded-none border border-slate-300 overflow-hidden flex flex-col shadow-sm">
          <div className="h-2 bg-amber-500"></div>
          <div className="p-6 flex-grow">
             <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 rounded-sm flex items-center justify-center bg-amber-50 text-amber-600">
                <RefreshCw size={24} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 leading-tight">Targeted Verification Reset</h3>
                <p className="text-sm font-medium text-slate-500">Conditional Compliance Enforcement</p>
              </div>
            </div>
            
            <p className="text-slate-700 text-sm mb-6 pb-6 border-b border-slate-100">
              Selectively archive existing evaluations for specific departments, job profiles, or skills. This instantly forces the targeted cohort into a "Gap" status, requiring fresh evaluations to re-establish competency compliance.
            </p>

            <div className="space-y-4">
               <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Users size={14} className="text-slate-400"/> Filter By Department
                  </label>
                  <select 
                    value={selectedDept}
                    onChange={(e) => {
                      setSelectedDept(e.target.value);
                      setSelectedJob('ALL'); // Reset Job Profile filter on dept change
                    }}
                    className="w-full text-sm border border-slate-300 bg-slate-50 rounded-none px-3 py-2.5 focus:ring-0 focus:border-amber-500"
                  >
                    <option value="ALL">-- ALL DEPARTMENTS --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
               </div>

               <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Briefcase size={14} className="text-slate-400"/> Filter By Job Profile
                  </label>
                  <select 
                    value={selectedJob}
                    onChange={(e) => setSelectedJob(e.target.value)}
                    className="w-full text-sm border border-slate-300 bg-slate-50 rounded-none px-3 py-2.5 focus:ring-0 focus:border-amber-500"
                  >
                    <option value="ALL">-- ALL JOB PROFILES --</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>{j.title}</option>
                    ))}
                  </select>
               </div>

               <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Activity size={14} className="text-slate-400"/> Target Specific Skill
                  </label>
                  <select 
                    value={selectedSkill}
                    onChange={(e) => setSelectedSkill(e.target.value)}
                    className="w-full text-sm border border-slate-300 bg-slate-50 rounded-none px-3 py-2.5 focus:ring-0 focus:border-amber-500"
                  >
                    <option value="ALL">-- ENTIRE SKILL MATRIX --</option>
                    {skills.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                    ))}
                  </select>
               </div>
            </div>
          </div>
          
          <div className="bg-slate-50 p-4 border-t border-slate-200">
            <button 
              onClick={handleTargetedReset}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-none text-sm font-bold uppercase tracking-wider border border-amber-600 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800 transition-colors"
            >
              {isProcessing ? 'Processing System...' : 'ARCHIVE & RESET SELECTION'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
