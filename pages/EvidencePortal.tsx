import React, { useState, useMemo } from 'react';
import { dataService } from '../services/store';
import { User, JobProfile, Skill } from '../types';
import { Upload, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react';

export const EvidencePortal: React.FC<{ currentUser: User }> = ({ currentUser }) => {
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');
  const [newSkillName, setNewSkillName] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const jobs = useMemo(() => dataService.getAllJobs(), []);
  const skills = useMemo(() => dataService.getAllSkills(), []);
  const myEvidences = useMemo(() => dataService.getEvidences({ userId: currentUser.id }), [currentUser.id]);

  const myJobProfile = useMemo(() => {
    return jobs.find(j => j.id === currentUser.jobProfileId);
  }, [jobs, currentUser.jobProfileId]);

  const myRequiredSkills = useMemo(() => {
    if (!myJobProfile || !currentUser.orgLevel) return [];
    const reqs = myJobProfile.requirements[currentUser.orgLevel] || [];
    return reqs.map(req => {
      const skill = skills.find(s => s.id === req.skillId);
      return { ...req, skill };
    }).filter(r => r.skill !== undefined) as { skillId: string, requiredLevel: number, skill: Skill }[];
  }, [myJobProfile, currentUser.orgLevel, skills]);

  const otherSkills = useMemo(() => {
    const requiredSkillIds = new Set(myRequiredSkills.map(r => r.skillId));
    return skills.filter(s => !requiredSkillIds.has(s.id));
  }, [skills, myRequiredSkills]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSkillId || !file) return;
    if (selectedSkillId === 'NEW_SKILL' && !newSkillName.trim()) return;

    setIsSubmitting(true);

    // Simulate file upload by reading as data URL
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      
      let finalSkillId = selectedSkillId;
      
      if (selectedSkillId === 'NEW_SKILL') {
        const existingSkill = skills.find(s => s.name.toLowerCase() === newSkillName.trim().toLowerCase());
        
        if (existingSkill) {
          finalSkillId = existingSkill.id;
        } else {
          const newSkill: Skill = {
            id: 's_custom_' + Date.now(),
            name: newSkillName.trim(),
            category: 'Other',
            levels: {
              1: { level: 1, description: 'Awareness', requiredCertificates: [] },
              2: { level: 2, description: 'Basic', requiredCertificates: [] },
              3: { level: 3, description: 'Skill', requiredCertificates: [] },
              4: { level: 4, description: 'Advanced', requiredCertificates: [] },
              5: { level: 5, description: 'Expert', requiredCertificates: [] }
            },
            status: 'PENDING'
          };
          dataService.addSkill(newSkill);
          finalSkillId = newSkill.id;
        }
      }

      dataService.addEvidence({
        userId: currentUser.id,
        skillId: finalSkillId,
        fileUrl: base64String,
        fileName: file.name,
        notes: notes
      });

      setSuccessMessage('Evidence submitted successfully for review.');
      setSelectedSkillId('');
      setNewSkillName('');
      setNotes('');
      setFile(null);
      setIsSubmitting(false);

      setTimeout(() => setSuccessMessage(''), 3000);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="pb-6 border-b border-slate-200">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Evidence Upload Portal</h2>
        <p className="text-slate-700 text-sm mt-1">Submit technical evidence (PTW, Work Orders, Reports) for competency verification.</p>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center gap-3">
          <CheckCircle size={20} className="text-emerald-600" />
          <p className="font-medium">{successMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">My Role Profile</h3>
            {myJobProfile ? (
              <div>
                <p className="font-semibold text-slate-800">{myJobProfile.title}</p>
                <p className="text-sm text-slate-500 mt-1">{myJobProfile.description}</p>
                
                <div className="mt-6">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Required Competencies</h4>
                  <ul className="space-y-3">
                    {myRequiredSkills.map(req => {
                      const pending = myEvidences.find(e => e.skillId === req.skillId && e.status === 'PENDING');
                      const approved = myEvidences.find(e => e.skillId === req.skillId && e.status === 'APPROVED');
                      
                      return (
                        <li key={req.skillId} className="flex items-start justify-between text-sm">
                          <span className="text-slate-700 font-medium">{req.skill.name}</span>
                          {approved ? (
                            <span title="Verified"><CheckCircle size={16} className="text-emerald-500 shrink-0 mt-0.5" /></span>
                          ) : pending ? (
                            <span title="Pending Review"><Clock size={16} className="text-amber-500 shrink-0 mt-0.5" /></span>
                          ) : (
                            <span title="Evidence Required"><AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" /></span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No job profile assigned.</p>
            )}
          </div>
        </div>

        <div className="md:col-span-2">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <Upload size={20} className="text-blue-600" />
              Submit New Evidence
            </h3>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Select Competency</label>
                <select 
                  required
                  value={selectedSkillId}
                  onChange={(e) => setSelectedSkillId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                >
                  <option value="" disabled>Select a competency to verify...</option>
                  <optgroup label="Required Competencies">
                    {myRequiredSkills.map(req => (
                      <option key={req.skillId} value={req.skillId}>
                        {req.skill.name} (Level {req.requiredLevel} Required)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Other Competencies (New Skills/Certificates)">
                    {otherSkills.map(skill => (
                      <option key={skill.id} value={skill.id}>
                        {skill.name} {skill.status === 'PENDING' ? '(Pending Approval)' : ''}
                      </option>
                    ))}
                    <option value="NEW_SKILL">+ Type a new competency...</option>
                  </optgroup>
                </select>
              </div>

              {selectedSkillId === 'NEW_SKILL' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Competency Name</label>
                  <input
                    type="text"
                    required
                    value={newSkillName}
                    onChange={(e) => setNewSkillName(e.target.value)}
                    placeholder="e.g., Advanced Python Programming"
                    className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                  />
                  <p className="text-xs text-slate-500 mt-1">This new competency will be submitted to the admin for approval.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Upload File (Photo, PDF, etc.)</label>
                <div className="flex items-center justify-center w-full">
                  <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <FileText className="w-8 h-8 mb-3 text-slate-400" />
                      <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-slate-500">PNG, JPG, PDF (MAX. 5MB)</p>
                    </div>
                    <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept="image/*,.pdf" required />
                  </label>
                </div>
                {file && <p className="mt-2 text-sm text-blue-600 font-medium flex items-center gap-2"><CheckCircle size={16}/> Selected: {file.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Context / Notes</label>
                <textarea 
                  required
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the evidence (e.g., 'Attached is the PTW for the P-101 alignment job performed on Tuesday.')"
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                ></textarea>
              </div>

              <div className="pt-4 flex justify-end">
                <button 
                  type="submit" 
                  disabled={isSubmitting || !selectedSkillId || !file}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit for Review'}
                  {!isSubmitting && <Upload size={18} />}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
