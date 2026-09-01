import React, { useState } from 'react';
import { dataService } from '../../services/store';
import { User, OrgLevel, ORG_LEVEL_LABELS, ORG_HIERARCHY_ORDER } from '../../types';
import { X } from 'lucide-react';
import { SearchableSelect } from '../../components/SearchableSelect';

export const PromotionModal: React.FC<{ 
    user: User; 
    onClose: () => void;
    onSave: (updatedUser: User) => void;
}> = ({ user, onClose, onSave }) => {
    const departments = dataService.getAllDepartments();
    const jobProfiles = dataService.getAllJobs();
    const [formData, setFormData] = useState({
        jobProfileId: user.jobProfileId || '',
        departmentId: user.departmentId || '',
        orgLevel: user.orgLevel || 'FR',
        reason: 'PROMOTION',
        startDate: new Date().toISOString().split('T')[0]
    });

    const handleSave = () => {
        const job = jobProfiles.find(j => j.id === formData.jobProfileId);
        if (!job) return;

        const updatedUser: User = {
            ...user,
            jobProfileId: formData.jobProfileId,
            departmentId: job.departmentId, 
            orgLevel: formData.orgLevel as OrgLevel,
            careerHistory: [
                {
                    id: Math.random().toString(36).substr(2, 9),
                    jobProfileId: formData.jobProfileId,
                    jobTitle: job.title,
                    orgLevel: formData.orgLevel as OrgLevel,
                    departmentId: job.departmentId,
                    startDate: formData.startDate,
                    reason: formData.reason
                },
                ...(user.careerHistory || [])
            ]
        };

        onSave(updatedUser);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-none w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                    <h3 className="text-lg font-black uppercase text-slate-900 tracking-tight">Promote / Transfer Employee</h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-none transition-colors"><X size={20} /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-blue-50 border border-blue-100 mb-4">
                        <div className="w-12 h-12 bg-blue-600 text-white flex items-center justify-center font-black text-xl">
                            {user.name[0]}
                        </div>
                        <div>
                            <p className="text-xs font-black text-blue-900 uppercase">{user.name}</p>
                            <p className="text-[10px] text-blue-700 font-bold uppercase">{jobProfiles.find(j => j.id === user.jobProfileId)?.title || 'Current Position'}</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Target Position Profile</label>
                        <SearchableSelect 
                            options={jobProfiles.map(j => ({ value: j.id, label: j.title, subLabel: departments.find(d => d.id === j.departmentId)?.name }))}
                            value={formData.jobProfileId}
                            onChange={(val) => setFormData({...formData, jobProfileId: val})}
                            placeholder="Select new role..."
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Hierarchy Level</label>
                        <select 
                            value={formData.orgLevel} 
                            onChange={e => setFormData({...formData, orgLevel: e.target.value as OrgLevel})} 
                            className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500 font-bold"
                        >
                            {ORG_HIERARCHY_ORDER.map(level => (
                                <option key={level} value={level}>{level} - {ORG_LEVEL_LABELS[level]}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Effective Date</label>
                        <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500" />
                    </div>

                    <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Transition Reason</label>
                        <select value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} className="w-full border border-slate-300 p-2 text-sm bg-slate-50 focus:ring-0 focus:border-blue-500">
                            <option value="PROMOTION">PROMOTION</option>
                            <option value="TRANSFER">TRANSFER / ROTATION</option>
                            <option value="RE-DESIGNATION">RE-DESIGNATION</option>
                        </select>
                    </div>
                </div>
                <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-xs font-black uppercase text-slate-600 hover:bg-slate-100 rounded-none transition-colors">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 text-xs font-black uppercase bg-blue-600 text-white hover:bg-blue-700 rounded-none transition-colors">Apply Changes</button>
                </div>
            </div>
        </div>
    );
};
