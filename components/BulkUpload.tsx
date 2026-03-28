import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Upload, X, AlertCircle, CheckCircle, FileSpreadsheet, Loader2 } from 'lucide-react';
import { dataService } from '../services/store';
import { User, Role, JobProfile, Skill, Department, OrgLevel } from '../types';

interface BulkUploadProps {
  type: 'USER' | 'JOB' | 'SKILL' | 'DEPT';
  onComplete: () => void;
  onCancel: () => void;
}

export const BulkUpload: React.FC<BulkUploadProps> = ({ type, onComplete, onCancel }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getTemplateData = () => {
    switch (type) {
      case 'USER':
        return [
          ['Name', 'Email', 'Role (EMPLOYEE/ADMIN)', 'Status (ACTIVE/PENDING)', 'Department Name', 'Job Profile Title', 'Manager Email', 'Hierarchy Level (GM/AGM/DM/SH/SP/JP/FR)', 'Location'],
          ['John Doe', 'john@example.com', 'EMPLOYEE', 'ACTIVE', 'Engineering', 'Software Engineer', 'manager@example.com', 'JP', 'Cairo Office']
        ];
      case 'JOB':
        return [
          ['Title', 'Description', 'Department Name', 'Skill Name', 'Required Level (1-5)', 'Org Level (GM/AGM/DM/SH/SP/JP/FR)'],
          ['Software Engineer', 'Develops and maintains software applications.', 'Engineering', 'React.js', '3', 'JP'],
          ['Software Engineer', '', '', 'Node.js', '2', 'JP'],
          ['Software Engineer', '', '', 'React.js', '4', 'SH']
        ];
      case 'SKILL':
        return [
          ['Name', 'Category (Technical/Safety/Management/Soft Skills/Behavioral)', 'Assessment Question', 'Level 1 Desc', 'Level 2 Desc', 'Level 3 Desc', 'Level 4 Desc', 'Level 5 Desc', 'Level 1 Certs', 'Level 2 Certs', 'Level 3 Certs', 'Level 4 Certs', 'Level 5 Certs'],
          ['React.js', 'Technical', 'How proficient is the employee in React?', 'Basic knowledge', 'Can build simple components', 'Can build complex apps', 'Expert level', 'Master level', 'React Basic Cert', '', '', '', '']
        ];
      case 'DEPT':
        return [
          ['Name', 'Manager Email'],
          ['Engineering', 'manager@example.com']
        ];
      default:
        return [];
    }
  };

  const downloadTemplate = () => {
    const data = getTemplateData();
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, `${type.toLowerCase()}_template.xlsx`);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
    }
  };

  const processUpload = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (jsonData.length === 0) {
          setError('The file is empty.');
          setLoading(false);
          return;
        }

        let count = 0;
        const depts = dataService.getAllDepartments();
        const jobs = dataService.getAllJobs();
        const users = dataService.getAllUsers();
        const skills = dataService.getAllSkills();

        // For JOB type, we need to group rows by Title and Department
        const jobBatch = new Map<string, JobProfile>();
        let lastJobKey = '';

        for (const row of jsonData) {
          try {
            switch (type) {
              case 'USER': {
                const genDeptName = (row['General Department Name'] || '').toString().trim();
                const directDeptName = (row['Direct Department Name'] || row['Department Name'] || '').toString().trim();
                
                let genDept = depts.find(d => d.name.toLowerCase() === genDeptName.toLowerCase());
                let directDept = depts.find(d => d.name.toLowerCase() === directDeptName.toLowerCase());

                // If general dept is missing, try to infer it from direct dept
                if (!genDept && directDept) {
                    const inferredGenId = dataService.getGeneralDeptId(directDept.id);
                    genDept = depts.find(d => d.id === inferredGenId);
                }

                const job = jobs.find(j => j.title.toLowerCase() === (row['Job Profile Title'] || '').toString().toLowerCase());
                const manager = users.find(u => u.email.toLowerCase() === (row['Manager Email'] || '').toString().toLowerCase());

                const email = (row['Email']?.toString() || '').toLowerCase();
                const existingUser = users.find(u => u.email.toLowerCase() === email);

                const newUser: User = {
                  id: existingUser ? existingUser.id : Math.random().toString(36).substr(2, 9),
                  name: row['Name']?.toString() || '',
                  email: email,
                  phone: row['Phone']?.toString(),
                  whatsapp: row['WhatsApp']?.toString(),
                  projectName: row['Project Name']?.toString(),
                  location: row['Location']?.toString(),
                  role: (row['Role (EMPLOYEE/ADMIN)']?.toString().toUpperCase() as Role) || Role.EMPLOYEE,
                  status: (row['Status (ACTIVE/PENDING)']?.toString().toUpperCase() as any) || 'ACTIVE',
                  departmentId: directDept?.id || genDept?.id || '',
                  generalDepartmentId: genDept?.id,
                  jobProfileId: job?.id,
                  managerId: manager?.id,
                  orgLevel: (row['Hierarchy Level (GM/AGM/DM/SH/SP/JP/FR)']?.toString().toUpperCase() as OrgLevel)
                };
                if (newUser.name && newUser.email) {
                  if (existingUser) {
                    await dataService.updateUser(newUser);
                  } else {
                    await dataService.addUser(newUser);
                  }
                  count++;
                }
                break;
              }
              case 'JOB': {
                let title = row['Title']?.toString().trim() || '';
                let deptName = row['Department Name']?.toString().trim() || '';
                
                // If title/dept are missing, use the last one (handles sub-rows for skills)
                if (!title && lastJobKey) {
                  const parts = lastJobKey.split('|');
                  title = parts[0];
                  deptName = parts[1];
                }

                if (!title || !deptName) break;
                
                const key = `${title}|${deptName}`;
                lastJobKey = key;

                let dept = depts.find(d => d.name.toLowerCase() === deptName.toLowerCase());
                if (!dept) {
                  dept = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: deptName,
                    behavioralSkillIds: []
                  };
                  await dataService.addDepartment(dept);
                  depts.push(dept);
                }

                let job = jobBatch.get(key);
                if (!job) {
                  const existingJob = jobs.find(j => j.title.toLowerCase() === title.toLowerCase() && j.departmentId === dept.id);
                  job = existingJob ? { ...existingJob } : {
                    id: Math.random().toString(36).substr(2, 9),
                    title: title,
                    description: row['Description']?.toString() || '',
                    departmentId: dept.id,
                    requirements: {}
                  };
                  jobBatch.set(key, job);
                }

                // Handle skill requirement
                const skillName = row['Skill Name']?.toString().trim();
                const reqLevel = parseInt(row['Required Level (1-5)']?.toString());
                const orgLevelRaw = row['Org Level (GM/AGM/DM/SH/SP/JP/FR)']?.toString() || row['Org Level']?.toString() || row['Hierarchy Level (GM/AGM/DM/SH/SP/JP/FR)']?.toString();
                const orgLevel = orgLevelRaw?.toString().toUpperCase().trim() as OrgLevel;

                if (skillName && !isNaN(reqLevel) && orgLevel) {
                  let skill = skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
                  if (!skill) {
                    skill = {
                      id: Math.random().toString(36).substr(2, 9),
                      name: skillName,
                      category: 'Technical',
                      levels: {
                        1: { level: 1, description: '', requiredCertificates: [] },
                        2: { level: 2, description: '', requiredCertificates: [] },
                        3: { level: 3, description: '', requiredCertificates: [] },
                        4: { level: 4, description: '', requiredCertificates: [] },
                        5: { level: 5, description: '', requiredCertificates: [] },
                      },
                      status: 'APPROVED',
                      assessmentMethod: '360_EVALUATION'
                    };
                    await dataService.addSkill(skill);
                    skills.push(skill);
                  }
                  
                  if (!job.requirements[orgLevel]) {
                    job.requirements[orgLevel] = [];
                  }
                  // Avoid duplicate skills for the same level
                  if (!job.requirements[orgLevel].find((r: any) => r.skillId === skill!.id)) {
                    job.requirements[orgLevel].push({
                      skillId: skill.id,
                      requiredLevel: reqLevel
                    });
                  }
                }
                break;
              }
              case 'SKILL': {
                const levels: any = {};
                for (let i = 1; i <= 5; i++) {
                  levels[i] = {
                    level: i,
                    description: row[`Level ${i} Desc`]?.toString() || '',
                    requiredCertificates: row[`Level ${i} Certs`]?.toString() ? row[`Level ${i} Certs`].toString().split(',').map((s: string) => s.trim()) : []
                  };
                }
                const name = row['Name']?.toString() || '';
                if (!name) break;
                
                const existingSkill = skills.find(s => s.name.toLowerCase() === name.toLowerCase());
                
                const newSkill: Skill = {
                  id: existingSkill ? existingSkill.id : Math.random().toString(36).substr(2, 9),
                  name: name,
                  category: row['Category (Technical/Safety/Management/Soft Skills/Behavioral)']?.toString() || 'Technical',
                  assessmentQuestion: row['Assessment Question']?.toString() || '',
                  levels,
                  status: existingSkill ? existingSkill.status : 'APPROVED',
                  assessmentMethod: existingSkill ? existingSkill.assessmentMethod : '360_EVALUATION'
                };
                
                if (existingSkill) {
                  await dataService.updateSkill(newSkill);
                } else {
                  await dataService.addSkill(newSkill);
                }
                count++;
                break;
              }
              case 'DEPT': {
                const name = row['Name']?.toString() || '';
                if (!name) break;
                
                const manager = users.find(u => u.email.toLowerCase() === (row['Manager Email'] || '').toString().toLowerCase());
                const existingDept = depts.find(d => d.name.toLowerCase() === name.toLowerCase());
                
                const newDept: Department = {
                  id: existingDept ? existingDept.id : Math.random().toString(36).substr(2, 9),
                  name: name,
                  managerId: manager?.id || existingDept?.managerId,
                  behavioralSkillIds: existingDept ? existingDept.behavioralSkillIds : []
                };
                
                if (existingDept) {
                  await dataService.updateDepartment(newDept);
                } else {
                  await dataService.addDepartment(newDept);
                }
                count++;
                break;
              }
            }
          } catch (err) {
            console.error('Error processing row:', row, err);
          }
        }

        // Save all grouped job profiles
        if (type === 'JOB') {
          for (const job of jobBatch.values()) {
            const existingJob = jobs.find(j => j.id === job.id);
            if (existingJob) {
              await dataService.updateJobProfile(job);
            } else {
              await dataService.addJobProfile(job);
            }
            count++;
          }
        }

        setSuccess(`Successfully imported ${count} ${type.toLowerCase()}s.`);
        setLoading(false);
        setTimeout(() => onComplete(), 2000);
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError('Failed to process file. Please check the format.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-none w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 shadow-2xl border border-slate-300">
        <div className="p-6 border-b border-slate-300 flex justify-between items-center bg-slate-50">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-blue-700" />
            Bulk Upload: {type === 'USER' ? 'Workforce' : type === 'JOB' ? 'Job Profiles' : type === 'SKILL' ? 'Skill Standards' : 'Departments'}
          </h3>
          <button onClick={onCancel} className="p-2 hover:bg-slate-200 rounded-none text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="bg-blue-50 border border-blue-100 p-4 rounded-none">
            <h4 className="text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
              <Download size={16} /> Step 1: Download Template
            </h4>
            <p className="text-xs text-blue-700 mb-4">Download the pre-formatted Excel file to ensure your data is correctly structured.</p>
            <button 
              onClick={downloadTemplate}
              className="w-full py-2 bg-white border border-blue-300 text-blue-700 text-xs font-bold uppercase tracking-wider rounded-none hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
            >
              Download Excel Template
            </button>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Upload size={16} /> Step 2: Upload Filled File
            </h4>
            <div className="border-2 border-dashed border-slate-300 p-8 text-center rounded-none hover:border-blue-500 transition-colors relative group">
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="space-y-2">
                <div className="w-12 h-12 bg-slate-100 rounded-none flex items-center justify-center mx-auto group-hover:bg-blue-50 transition-colors">
                  <Upload size={24} className="text-slate-400 group-hover:text-blue-500" />
                </div>
                <p className="text-sm font-medium text-slate-700">{file ? file.name : 'Click or drag file to upload'}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Excel files only (.xlsx, .xls)</p>
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-100 p-3 rounded-none flex items-start gap-3 text-rose-700">
              <AlertCircle size={18} className="shrink-0" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-none flex items-start gap-3 text-emerald-700">
              <CheckCircle size={18} className="shrink-0" />
              <p className="text-xs font-medium">{success}</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-300 flex justify-end gap-3">
          <button 
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 font-bold text-xs uppercase tracking-wide hover:bg-slate-100 transition-colors rounded-none"
          >
            Cancel
          </button>
          <button 
            onClick={processUpload}
            disabled={!file || loading}
            className={`px-6 py-2 bg-blue-700 text-white font-bold text-xs uppercase tracking-wide rounded-none transition-all flex items-center gap-2 ${(!file || loading) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-800'}`}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {loading ? 'Processing...' : 'Start Import'}
          </button>
        </div>
      </div>
    </div>
  );
};
