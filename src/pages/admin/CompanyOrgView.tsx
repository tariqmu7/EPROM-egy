import React, { useState, useEffect, useMemo } from 'react';
import { Avatar } from '../../components/Avatar';
import { User, Role, JobProfile, Department, Project } from '../../types';
import { Plus, Users, Briefcase, ChevronRight, Shield, X, Trash2, ArrowLeft, Building2, Edit2, UserCheck, LayoutGrid, MapPin, TrendingUp } from 'lucide-react';
import { SearchableSelect, Option } from '../../components/SearchableSelect';
import { deptTypeIcon, UnitCard, OrgTreeRow } from './OrgTree';

// --- Whole-company org chart: EPROM → projects → departments → sections ---

const projectDeptsOf = (depts: Department[], projectId: string, isHq: boolean) =>
    depts.filter(d => d.projectId === projectId || (isHq && !d.projectId));

const DEPT_RANK: Record<string, number> = {
    COMPANY: 0, EXECUTIVE: 1, SECTOR: 2, GENERAL: 3, ASSISTANT_GENERAL: 4, DEPARTMENT: 5, SECTION: 6, POSITION: 7,
};

// Roots of a scoped set = nodes whose parent is outside the set (or absent).
// The tree's own parentId links drive nesting; we no longer treat GENERAL as a
// top-level type (it is the GM level, nested under SECTOR → Chairman → company).
const deptRootsOf = (scoped: Department[]) => {
    const ids = new Set(scoped.map(d => d.id));
    return scoped
        .filter(d => !d.parentId || !ids.has(d.parentId))
        .sort((a, b) =>
            ((DEPT_RANK[a.type ?? 'DEPARTMENT'] ?? 99) - (DEPT_RANK[b.type ?? 'DEPARTMENT'] ?? 99)) ||
            a.name.localeCompare(b.name)
        );
};

// A collapsible project group in the company tree: holds that project's
// top-level departments, rendered with the shared OrgTreeRow.
const OrgProjectGroup: React.FC<{
    project: Project;
    isHq: boolean;
    allDepts: Department[];
    users: User[];
    selectedDeptId: string | null;
    selectedProjectId: string | null;
    onSelectProject: (id: string) => void;
    onSelectDept: (id: string) => void;
}> = ({ project, isHq, allDepts, users, selectedDeptId, selectedProjectId, onSelectProject, onSelectDept }) => {
    const scoped = projectDeptsOf(allDepts, project.id, isHq);
    const roots = deptRootsOf(scoped);
    const [open, setOpen] = useState(isHq);
    const isSelected = selectedProjectId === project.id;
    const staff = users.filter(u => scoped.some(d => d.id === u.departmentId)).length;

    return (
        <div>
            <div
                onClick={() => onSelectProject(project.id)}
                style={{ paddingLeft: 26 }}
                className={`flex items-center gap-2 pr-3 py-2 cursor-pointer border-l-2 transition-colors ${
                    isSelected ? 'bg-emerald-50 border-emerald-600' : 'border-transparent hover:bg-slate-50'
                }`}
            >
                {roots.length > 0 ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                        className={`p-0.5 rounded-sm hover:bg-slate-200 transition-transform ${open ? 'rotate-90' : ''}`}
                    >
                        <ChevronRight size={14} className="text-slate-400" />
                    </button>
                ) : (
                    <span className="w-[22px] shrink-0" />
                )}
                <Briefcase size={15} className={isSelected ? 'text-emerald-700 shrink-0' : 'text-slate-400 shrink-0'} />
                <span className="flex flex-col min-w-0 flex-1">
                    <span className={`text-sm truncate ${isSelected ? 'font-bold text-emerald-900' : 'font-bold text-slate-700'}`}>
                        {isHq ? 'Head Office' : project.name}
                    </span>
                    {isHq && <span dir="rtl" className={`text-[11px] truncate ${isSelected ? 'text-emerald-700' : 'text-slate-400'}`}>المركز الرئيسي</span>}
                </span>
                {staff > 0 && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-none shrink-0">{staff}</span>
                )}
            </div>
            {open && roots.map(dept => (
                <OrgTreeRow
                    key={dept.id}
                    dept={dept}
                    depth={1}
                    allDepts={allDepts}
                    users={users}
                    selectedId={selectedDeptId}
                    onSelect={onSelectDept}
                />
            ))}
        </div>
    );
};

export type OrgSelection = { kind: 'root' } | { kind: 'project'; id: string } | { kind: 'dept'; id: string };

export const CompanyOrgView: React.FC<{
    depts: Department[];
    projects: Project[];
    users: User[];
    jobs: JobProfile[];
    hqProjectId?: string;
    currentUser: User | null;
    searchTerm?: string;
    onEdit: (d: Department) => void;
    onDelete: (id: string) => void;
    onAddChild: (parentId: string) => void;
    onAddDeptToProject: (projectId: string) => void;
    onEditUser: (u: User) => void;
    onPromoteUser: (u: User) => void;
    onAddProject: () => void;
    onEditProject: (p: Project) => void;
    onDeleteProject: (id: string) => void;
    onAddJobToUnit: (deptId: string) => void;
    onAssignPersonnel: (userId: string, deptId: string) => void;
    onEditJob: (job: JobProfile) => void;
    onDeleteJob: (id: string) => void;
    selected: OrgSelection;
    setSelected: React.Dispatch<React.SetStateAction<OrgSelection>>;
}> = ({ depts, projects, users, jobs, hqProjectId, currentUser, searchTerm = '', onEdit, onDelete, onAddChild, onAddDeptToProject, onEditUser, onPromoteUser, onAddProject, onEditProject, onDeleteProject, onAddJobToUnit, onAssignPersonnel, onEditJob, onDeleteJob, selected, setSelected }) => {
    const canSeeCeo = currentUser?.role === Role.CEO || currentUser?.role === Role.ADMIN;
    const isHqProject = (p?: Project | null) => !!p && (p.id === hqProjectId || p.name.toUpperCase() === 'HQ');

    // "Add Personnel" picker: assign an existing approved employee to a unit.
    const [assignPickerDeptId, setAssignPickerDeptId] = useState<string | null>(null);
    const [assignUserId, setAssignUserId] = useState('');

    // Projects ordered with the Head Office (HQ) first, then alphabetically.
    const orderedProjects = useMemo(() =>
        [...projects].sort((a, b) =>
            (isHqProject(b) ? 1 : 0) - (isHqProject(a) ? 1 : 0) || a.name.localeCompare(b.name)
        ), [projects, hqProjectId]);

    const selectDept = (id: string) => setSelected({ kind: 'dept', id });
    const selectProject = (id: string) => setSelected({ kind: 'project', id });

    // Recover selection if the underlying record disappears.
    useEffect(() => {
        if (selected.kind === 'dept' && !depts.some(d => d.id === selected.id)) setSelected({ kind: 'root' });
        if (selected.kind === 'project' && !projects.some(p => p.id === selected.id)) setSelected({ kind: 'root' });
    }, [depts, projects, selected]);

    const selectedDept = selected.kind === 'dept' ? depts.find(d => d.id === selected.id) || null : null;
    const selectedProject = selected.kind === 'project' ? projects.find(p => p.id === selected.id) || null : null;

    const descendantIds = (rootId: string): string[] => {
        const out: string[] = [];
        const stack = depts.filter(d => d.parentId === rootId).map(d => d.id);
        const seen = new Set<string>();
        while (stack.length) {
            const cur = stack.pop()!;
            if (seen.has(cur)) continue;
            seen.add(cur);
            out.push(cur);
            depts.filter(d => d.parentId === cur).forEach(c => stack.push(c.id));
        }
        return out;
    };

    const manager = selectedDept ? users.find(u => u.id === selectedDept.managerId) : undefined;
    const managerName = (manager && (canSeeCeo || (manager.role !== Role.CEO && manager.orgLevel !== 'CEO')))
        ? manager.name : 'Unassigned';
    const directPersonnel = selectedDept ? users.filter(u => u.departmentId === selectedDept.id) : [];
    const unitJobs = selectedDept ? jobs.filter(j => j.departmentId === selectedDept.id && !j.isArchived) : [];
    const subUnits = selectedDept ? depts.filter(d => d.parentId === selectedDept.id) : [];
    const totalWorkforce = selectedDept
        ? users.filter(u => u.departmentId === selectedDept.id || descendantIds(selectedDept.id).includes(u.departmentId)).length
        : 0;
    const SelectedIcon = deptTypeIcon(selectedDept?.type);

    const projectScoped = selectedProject ? projectDeptsOf(depts, selectedProject.id, isHqProject(selectedProject)) : [];
    const projectRoots = deptRootsOf(projectScoped);
    const projectStaff = users.filter(u => projectScoped.some(d => d.id === u.departmentId)).length;

    // When the toolbar search is active, the left panel shows a flat list of
    // matching units (by code, English/Arabic name) instead of the project tree.
    const search = searchTerm.trim().toLowerCase();
    const searchMatches = useMemo(() => {
        if (!search) return [];
        return depts
            .filter(d =>
                (d.code || '').toLowerCase().includes(search) ||
                d.name.toLowerCase().includes(search) ||
                (d.nameAr || '').includes(searchTerm.trim())
            )
            .sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name));
    }, [depts, search, searchTerm]);

    return (
        <div className="bg-slate-50 min-h-[600px]">
            {/* Header */}
            <div className="flex items-center justify-between gap-6 px-8 py-6 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-sm flex items-center justify-center border border-blue-100 shrink-0">
                        <Shield size={26} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Organization Chart</h2>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-widest border border-emerald-100">EPROM</span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1" dir="rtl">الهيكل التنظيمي — من رئيس مجلس الإدارة حتى أدنى مستوى</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr]">
                {/* LEFT: tree */}
                <div className="border-r border-slate-200 bg-white lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 sticky top-0 bg-white z-10">
                        <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Structure</span>
                        <button
                            onClick={onAddProject}
                            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-blue-700 hover:text-blue-900 transition-colors"
                            title="Add Project / Site"
                        >
                            <Plus size={14} /> Project
                        </button>
                    </div>
                    {search ? (
                        /* SEARCH RESULTS: flat list of units matching code / name */
                        <div className="py-2">
                            <div className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                {searchMatches.length} match{searchMatches.length === 1 ? '' : 'es'} for “{searchTerm.trim()}”
                            </div>
                            {searchMatches.map(d => {
                                const Icon = deptTypeIcon(d.type);
                                const isSel = selected.kind === 'dept' && selected.id === d.id;
                                return (
                                    <div
                                        key={d.id}
                                        onClick={() => selectDept(d.id)}
                                        style={{ paddingLeft: 8 }}
                                        className={`flex items-center gap-2 pr-3 py-2 cursor-pointer border-l-2 transition-colors ${
                                            isSel ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-slate-50'
                                        }`}
                                    >
                                        <Icon size={15} className={isSel ? 'text-blue-700 shrink-0' : 'text-slate-400 shrink-0'} />
                                        <span className="flex flex-col min-w-0 flex-1">
                                            <span dir="rtl" className={`text-sm truncate ${isSel ? 'font-bold text-blue-900' : 'font-medium text-slate-700'}`}>{d.nameAr || d.name}</span>
                                            <span className={`text-[11px] truncate flex items-center gap-1.5 ${isSel ? 'text-blue-700' : 'text-slate-400'}`}>
                                                {d.code && <span className="font-mono font-bold tracking-tight">{d.code}</span>}
                                                {d.nameAr && <span className="truncate">{d.name}</span>}
                                            </span>
                                        </span>
                                    </div>
                                );
                            })}
                            {searchMatches.length === 0 && (
                                <div className="p-8 text-center text-sm text-slate-500">No units match this search.</div>
                            )}
                        </div>
                    ) : (
                    <div className="py-2">
                        {/* ROOT: the company / Chairman */}
                        <div
                            onClick={() => setSelected({ kind: 'root' })}
                            style={{ paddingLeft: 8 }}
                            className={`flex items-center gap-2 pr-3 py-2 cursor-pointer border-l-2 transition-colors ${
                                selected.kind === 'root' ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-slate-50'
                            }`}
                        >
                            <Shield size={16} className={selected.kind === 'root' ? 'text-blue-700 shrink-0' : 'text-slate-400 shrink-0'} />
                            <span className="flex flex-col min-w-0 flex-1">
                                <span dir="rtl" className={`text-sm truncate ${selected.kind === 'root' ? 'font-black text-blue-900' : 'font-black text-slate-800'}`}>المصرية لتشغيل وصيانة المشروعات</span>
                                <span className="text-[11px] truncate text-slate-400">EPROM</span>
                            </span>
                        </div>
                        {orderedProjects.map(p => (
                            <OrgProjectGroup
                                key={p.id}
                                project={p}
                                isHq={isHqProject(p)}
                                allDepts={depts}
                                users={users}
                                selectedDeptId={selected.kind === 'dept' ? selected.id : null}
                                selectedProjectId={selected.kind === 'project' ? selected.id : null}
                                onSelectProject={selectProject}
                                onSelectDept={selectDept}
                            />
                        ))}
                        {orderedProjects.length === 0 && (
                            <div className="p-8 text-center">
                                <Briefcase size={36} className="mx-auto text-slate-200 mb-3" />
                                <p className="text-sm text-slate-500">No projects defined yet.</p>
                                <button onClick={onAddProject} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white font-bold uppercase text-[10px] tracking-widest rounded-sm hover:bg-blue-800 transition-all">
                                    <Plus size={14} /> Create First Project
                                </button>
                            </div>
                        )}
                    </div>
                    )}
                </div>

                {/* RIGHT: detail panel */}
                <div className="p-8">
                    {selected.kind === 'dept' && selectedDept ? (
                        <div className="space-y-8 animate-in fade-in duration-200">
                            {/* Back button */}
                            <button
                                onClick={() => selectedDept.parentId ? selectDept(selectedDept.parentId) : setSelected({ kind: 'root' })}
                                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-700 uppercase tracking-wider transition-colors group"
                            >
                                <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                                {selectedDept.parentId ? 'Parent Unit' : 'All Units'}
                            </button>

                            {/* Unit header */}
                            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-50 shadow-sm">
                                {/* accent bar */}
                                <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 to-indigo-500" />
                                <div className="p-6">
                                    {/* Top row: identity + actions */}
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex items-start gap-4 min-w-0">
                                            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-lg flex items-center justify-center shadow-sm shrink-0">
                                                <SelectedIcon size={26} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {selectedDept.code && (
                                                        <span className="px-2 py-0.5 bg-slate-900 text-white text-[11px] font-mono font-bold tracking-tight rounded shrink-0">
                                                            {selectedDept.code}
                                                        </span>
                                                    )}
                                                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-widest border border-blue-100 rounded shrink-0">
                                                        {selectedDept.type?.replace('_', ' ') || 'DEPARTMENT'}
                                                    </span>
                                                </div>
                                                <h3 dir="rtl" className="text-2xl font-bold text-slate-900 tracking-tight mt-1.5 leading-snug">{selectedDept.nameAr || selectedDept.name}</h3>
                                                {selectedDept.nameAr && (
                                                    <p className="text-sm font-semibold text-slate-500 mt-0.5">{selectedDept.name}</p>
                                                )}
                                            </div>
                                        </div>
                                        {/* Actions */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button onClick={() => onEdit(selectedDept)} className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-blue-700 hover:border-blue-200 rounded-md transition-all" title="Edit Unit"><Edit2 size={16} /></button>
                                            <button onClick={() => onDelete(selectedDept.id)} className="p-2 bg-white border border-slate-200 text-slate-500 hover:text-red-700 hover:border-red-200 rounded-md transition-all" title="Delete Unit"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                    {/* Bottom row: manager + primary CTA */}
                                    <div className="flex items-center justify-between gap-4 mt-5 pt-4 border-t border-slate-200/70">
                                        <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
                                            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-400 shrink-0">
                                                <UserCheck size={15} />
                                            </span>
                                            <span className="truncate">
                                                <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block leading-none mb-0.5">Unit Lead</span>
                                                <span className="font-semibold text-slate-800">{managerName}</span>
                                            </span>
                                        </div>
                                        <button onClick={() => onAddChild(selectedDept.id)} className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-bold uppercase tracking-widest rounded-md hover:bg-blue-800 transition-all shadow-sm shrink-0">
                                            <Plus size={16} /> Sub-Unit
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Direct Personnel', value: directPersonnel.length },
                                    { label: 'Sub-Units', value: subUnits.length },
                                    { label: 'Total Workforce', value: totalWorkforce },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-white p-4 rounded-none border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                                        <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Personnel roster (list) */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                        <Users size={14} /> Personnel ({directPersonnel.length})
                                    </div>
                                    <button
                                        onClick={() => { setAssignUserId(''); setAssignPickerDeptId(selectedDept.id); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 text-white text-[10px] font-bold uppercase tracking-widest rounded-md hover:bg-blue-800 transition-all shadow-sm"
                                    >
                                        <Plus size={14} /> Add Personnel
                                    </button>
                                </div>
                                {directPersonnel.length > 0 ? (
                                    <div className="bg-white border border-slate-200 rounded-none divide-y divide-slate-100">
                                        {directPersonnel.map(person => {
                                            const job = jobs.find(j => j.id === person.jobProfileId);
                                            return (
                                                <div key={person.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors group">
                                                    <div className="w-9 h-9 rounded-none bg-slate-100 flex items-center justify-center overflow-hidden text-slate-900 font-bold border border-slate-200 shrink-0">
                                                        <Avatar src={person.avatarUrl} name={person.name} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-slate-900 truncate">{person.name}</span>
                                                            <span className="text-indigo-700 font-bold uppercase text-[8px] bg-indigo-50 px-1.5 py-0.5 rounded-none border border-indigo-100 shrink-0">{person.orgLevel || 'N/A'}</span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 truncate">{job?.title || person.role}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                        <button onClick={() => onPromoteUser(person)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-sm transition-all" title="Promote / Transfer"><TrendingUp size={14} /></button>
                                                        <button onClick={() => onEditUser(person)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-sm transition-all" title="Edit Employee"><Edit2 size={14} /></button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="p-8 bg-white border border-dashed border-slate-300 text-center rounded-none">
                                        <Users size={28} className="mx-auto text-slate-200 mb-2" />
                                        <p className="text-sm text-slate-500 mb-4">No personnel assigned to this unit.</p>
                                        <button onClick={() => { setAssignUserId(''); setAssignPickerDeptId(selectedDept.id); }} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white font-bold uppercase text-[10px] tracking-widest rounded-sm hover:bg-blue-800 transition-all">
                                            <Plus size={14} /> Add Personnel
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Job Profiles (positions) attached to this unit */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                        <Briefcase size={14} /> Job Profiles ({unitJobs.length})
                                    </div>
                                    <button
                                        onClick={() => onAddJobToUnit(selectedDept.id)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded-md hover:bg-slate-800 transition-all shadow-sm"
                                    >
                                        <Plus size={14} /> Job Profile
                                    </button>
                                </div>
                                {unitJobs.length > 0 ? (
                                    <div className="bg-white border border-slate-200 rounded-none divide-y divide-slate-100">
                                        {unitJobs.map(job => (
                                            <div key={job.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors group">
                                                <div className="w-9 h-9 rounded-none bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100 shrink-0">
                                                    <Briefcase size={16} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-900 truncate">{job.title}</span>
                                                        <span className="text-blue-700 font-bold uppercase text-[8px] bg-blue-50 px-1.5 py-0.5 rounded-none border border-blue-100 shrink-0">{job.orgLevel || 'N/A'}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 truncate">
                                                        <span className="font-mono">{job.code || '—'}</span> · {(job.requiredSkills || []).length} skills
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                    <button onClick={() => onEditJob(job)} className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-sm transition-all" title="Edit Job Profile"><Edit2 size={14} /></button>
                                                    <button onClick={() => onDeleteJob(job.id)} className="p-1.5 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-sm transition-all" title="Delete Job Profile"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 bg-white border border-dashed border-slate-300 text-center rounded-none">
                                        <Briefcase size={28} className="mx-auto text-slate-200 mb-2" />
                                        <p className="text-sm text-slate-500 mb-4">No job profiles defined for this unit yet.</p>
                                        <button onClick={() => onAddJobToUnit(selectedDept.id)} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-bold uppercase text-[10px] tracking-widest rounded-sm hover:bg-slate-800 transition-all">
                                            <Plus size={14} /> Add Job Profile
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Sub-units (list, clickable to drill in the tree) */}
                            {subUnits.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-3 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                        <Building2 size={14} /> Sub-Units ({subUnits.length})
                                    </div>
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {subUnits.map(unit => (
                                            <UnitCard
                                                key={unit.id}
                                                unit={unit}
                                                staff={users.filter(u => u.departmentId === unit.id).length}
                                                childCount={depts.filter(d => d.parentId === unit.id).length}
                                                onSelect={selectDept}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : selected.kind === 'project' && selectedProject ? (
                        <div className="space-y-8 animate-in fade-in duration-200">
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b border-slate-200 pb-6">
                                <div className="flex items-start gap-4">
                                    <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-sm flex items-center justify-center border border-emerald-100 shrink-0">
                                        <Briefcase size={28} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{isHqProject(selectedProject) ? 'Head Office' : selectedProject.name}</h3>
                                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-widest border border-emerald-100">
                                                {isHqProject(selectedProject) ? 'المركز الرئيسي' : 'PROJECT'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-slate-600 flex items-center gap-1.5">
                                            <MapPin size={14} className="text-slate-400" /> {selectedProject.location || 'General Headquarters'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => onAddDeptToProject(selectedProject.id)} className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-bold uppercase tracking-widest rounded-sm hover:bg-blue-800 transition-all shadow-sm">
                                        <Plus size={16} /> Department
                                    </button>
                                    <button onClick={() => onEditProject(selectedProject)} className="p-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-sm transition-all" title="Edit Project"><Edit2 size={18} /></button>
                                    {!isHqProject(selectedProject) && (
                                        <button onClick={() => onDeleteProject(selectedProject.id)} className="p-2 bg-white border border-slate-300 text-slate-600 hover:text-red-700 hover:border-red-200 rounded-sm transition-all" title="Delete Project"><Trash2 size={18} /></button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Top-Level Units', value: projectRoots.length },
                                    { label: 'Total Units', value: projectScoped.length },
                                    { label: 'Workforce', value: projectStaff },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-white p-4 rounded-none border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                                        <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-3 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                    <Building2 size={14} /> Top-Level Units ({projectRoots.length})
                                </div>
                                {projectRoots.length > 0 ? (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                        {projectRoots.map(unit => (
                                            <UnitCard
                                                key={unit.id}
                                                unit={unit}
                                                staff={users.filter(u => u.departmentId === unit.id).length}
                                                childCount={depts.filter(d => d.parentId === unit.id).length}
                                                onSelect={selectDept}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-8 bg-white border border-dashed border-slate-300 text-center rounded-none">
                                        <Building2 size={28} className="mx-auto text-slate-200 mb-2" />
                                        <p className="text-sm text-slate-500 mb-4">No departments under this project yet.</p>
                                        <button onClick={() => onAddDeptToProject(selectedProject.id)} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white font-bold uppercase text-[10px] tracking-widest rounded-sm hover:bg-blue-800 transition-all">
                                            <Plus size={14} /> Add Department
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : selected.kind === 'root' ? (
                        <div className="space-y-8 animate-in fade-in duration-200">
                            <div className="flex items-start gap-4 border-b border-slate-200 pb-6">
                                <div className="w-14 h-14 bg-blue-50 text-blue-700 rounded-sm flex items-center justify-center border border-blue-100 shrink-0">
                                    <Shield size={28} />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-slate-900 tracking-tight">EPROM</h3>
                                    <p dir="rtl" className="text-base font-bold text-slate-700">المصرية لتشغيل وصيانة المشروعات</p>
                                    <p className="text-sm text-slate-500 mt-1">Egyptian Maintenance Company — Operation & Maintenance of Projects</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Projects / Sites', value: projects.length },
                                    { label: 'Total Units', value: depts.length },
                                    { label: 'Workforce', value: users.length },
                                ].map(stat => (
                                    <div key={stat.label} className="bg-white p-4 rounded-none border border-slate-200">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                                        <p className="text-2xl font-black text-slate-900">{stat.value}</p>
                                    </div>
                                ))}
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-3 text-[11px] uppercase font-black tracking-widest text-slate-500">
                                    <Briefcase size={14} /> Projects & Sites ({orderedProjects.length})
                                </div>
                                <div className="bg-white border border-slate-200 rounded-none divide-y divide-slate-100">
                                    {orderedProjects.map(p => {
                                        const scoped = projectDeptsOf(depts, p.id, isHqProject(p));
                                        const staff = users.filter(u => scoped.some(d => d.id === u.departmentId)).length;
                                        return (
                                            <div key={p.id} onClick={() => selectProject(p.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors group">
                                                <Briefcase size={16} className="text-slate-400 shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <span className="font-bold text-slate-800 truncate block group-hover:text-emerald-700 transition-colors">{isHqProject(p) ? 'Head Office' : p.name}</span>
                                                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{deptRootsOf(scoped).length} units</span>
                                                </div>
                                                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-none shrink-0">{staff}</span>
                                                <ChevronRight size={16} className="text-slate-300 group-hover:text-emerald-700 group-hover:translate-x-1 transition-all shrink-0" />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center py-20">
                            <LayoutGrid size={48} className="text-slate-200 mb-4" />
                            <p className="text-slate-500">Select a unit from the structure to view its details.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Personnel: pick an existing approved employee and re-home them
                to this unit, searchable by name or company ID. */}
            {assignPickerDeptId && (() => {
                const targetDept = depts.find(d => d.id === assignPickerDeptId);
                const candidates = users
                    .filter(u => u.status === 'ACTIVE' && u.departmentId !== assignPickerDeptId)
                    .sort((a, b) => a.name.localeCompare(b.name));
                const options: Option[] = candidates.map(u => {
                    const homeDept = depts.find(d => d.id === u.departmentId);
                    return {
                        value: u.id,
                        label: u.name,
                        subLabel: [u.employeeId != null ? `ID ${u.employeeId}` : null, homeDept?.name || 'Unassigned']
                            .filter(Boolean).join(' · '),
                    };
                });
                const close = () => { setAssignPickerDeptId(null); setAssignUserId(''); };
                return (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 animate-in fade-in duration-150" onClick={close}>
                        <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                            <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-200">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Add Personnel</h3>
                                    <p className="text-sm text-slate-500 mt-0.5">
                                        Assign an existing employee to <span dir="rtl" className="font-semibold text-slate-700">{targetDept?.nameAr || targetDept?.name}</span>.
                                    </p>
                                </div>
                                <button onClick={close} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-all"><X size={18} /></button>
                            </div>
                            <div className="p-6 space-y-2">
                                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">Employee</label>
                                <SearchableSelect
                                    options={options}
                                    value={assignUserId}
                                    onChange={setAssignUserId}
                                    placeholder="Search by name or ID…"
                                />
                                <p className="text-xs text-slate-400">{candidates.length} approved employee{candidates.length === 1 ? '' : 's'} available.</p>
                            </div>
                            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-lg">
                                <button onClick={close} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-600 hover:text-slate-900 transition-colors">Cancel</button>
                                <button
                                    disabled={!assignUserId}
                                    onClick={() => { onAssignPersonnel(assignUserId, assignPickerDeptId); close(); }}
                                    className="flex items-center gap-2 px-5 py-2 bg-blue-700 text-white text-xs font-bold uppercase tracking-widest rounded-md hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm"
                                >
                                    <Plus size={14} /> Assign to Unit
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
