import React, { useState } from 'react';
import { User, Department, DepartmentType } from '../../types';
import { Users, ChevronRight, Building2, Layers, LayoutGrid } from 'lucide-react';

// --- Org Hierarchy: tree-list + detail panel ---

export const deptTypeIcon = (type?: DepartmentType) =>
    type === 'GENERAL' || type === 'ASSISTANT_GENERAL' ? Layers : type === 'SECTION' ? LayoutGrid : Building2;

// Per-type accent palette for unit cards (tile / left bar / type chip).
export const deptTypeStyle = (type?: DepartmentType) => {
    switch (type) {
        case 'COMPANY':
        case 'EXECUTIVE':
        case 'SECTOR':     return { tile: 'bg-purple-50 text-purple-700 group-hover:bg-purple-700 group-hover:text-white', bar: 'bg-purple-400', chip: 'bg-purple-50 text-purple-600' };
        case 'GENERAL':    return { tile: 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-700 group-hover:text-white', bar: 'bg-indigo-400', chip: 'bg-indigo-50 text-indigo-600' };
        case 'ASSISTANT_GENERAL': return { tile: 'bg-sky-50 text-sky-700 group-hover:bg-sky-700 group-hover:text-white', bar: 'bg-sky-400', chip: 'bg-sky-50 text-sky-600' };
        case 'DEPARTMENT': return { tile: 'bg-blue-50 text-blue-700 group-hover:bg-blue-700 group-hover:text-white',   bar: 'bg-blue-400',   chip: 'bg-blue-50 text-blue-600' };
        case 'SECTION':    return { tile: 'bg-teal-50 text-teal-700 group-hover:bg-teal-700 group-hover:text-white',   bar: 'bg-teal-400',   chip: 'bg-teal-50 text-teal-600' };
        default:           return { tile: 'bg-slate-100 text-slate-600 group-hover:bg-slate-700 group-hover:text-white', bar: 'bg-slate-300', chip: 'bg-slate-100 text-slate-600' };
    }
};

// Shared card for a child organizational unit (used in the detail panel's
// Sub-Units and project Top-Level Units lists). Bilingual, drill-in on click.
export const UnitCard: React.FC<{
    unit: Department;
    staff: number;
    childCount: number;
    onSelect: (id: string) => void;
}> = ({ unit, staff, childCount, onSelect }) => {
    const UnitIcon = deptTypeIcon(unit.type);
    const c = deptTypeStyle(unit.type);
    return (
        <div
            onClick={() => onSelect(unit.id)}
            className="group flex items-stretch bg-white border border-slate-200 rounded-none cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all overflow-hidden"
        >
            <div className={`w-1 shrink-0 ${c.bar}`} />
            <div className="flex items-start gap-3 px-4 py-3 flex-1 min-w-0">
                <div className={`w-10 h-10 rounded-sm flex items-center justify-center shrink-0 transition-colors ${c.tile}`}>
                    <UnitIcon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                    <span dir="rtl" title={unit.nameAr || unit.name} className="font-bold text-slate-800 block leading-snug break-words group-hover:text-blue-700 transition-colors">{unit.nameAr || unit.name}</span>
                    {unit.nameAr && <span title={unit.name} className="text-[11px] text-slate-500 block leading-snug break-words">{unit.name}</span>}
                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-none ${c.chip}`}>{unit.type?.replace('_', ' ') || 'DEPARTMENT'}</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500" title="Direct personnel"><Users size={11} className="text-slate-400" /> {staff}</span>
                        {childCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500" title="Sub-units"><Building2 size={11} className="text-slate-400" /> {childCount}</span>
                        )}
                    </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-700 group-hover:translate-x-1 transition-all shrink-0 self-center" />
            </div>
        </div>
    );
};

// A single expandable row in the org tree. Defined at module scope (not nested
// inside OrgTreeView) so its identity is stable and per-row expand state
// survives parent re-renders.
export const OrgTreeRow: React.FC<{
    dept: Department;
    depth: number;
    allDepts: Department[];
    users: User[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}> = ({ dept, depth, allDepts, users, selectedId, onSelect }) => {
    const children = allDepts
        .filter(d => d.parentId === dept.id)
        .sort((a, b) => a.name.localeCompare(b.name));
    const [open, setOpen] = useState(dept.type === 'GENERAL' || depth === 0);
    const directCount = users.filter(u => u.departmentId === dept.id).length;
    const isSelected = dept.id === selectedId;
    const Icon = deptTypeIcon(dept.type);

    return (
        <div>
            <div
                onClick={() => onSelect(dept.id)}
                style={{ paddingLeft: depth * 18 + 8 }}
                className={`flex items-center gap-2 pr-3 py-2 cursor-pointer border-l-2 transition-colors ${
                    isSelected ? 'bg-blue-50 border-blue-600' : 'border-transparent hover:bg-slate-50'
                }`}
            >
                {children.length > 0 ? (
                    <button
                        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                        className={`p-0.5 rounded-sm hover:bg-slate-200 transition-transform ${open ? 'rotate-90' : ''}`}
                    >
                        <ChevronRight size={14} className="text-slate-400" />
                    </button>
                ) : (
                    <span className="w-[22px] shrink-0" />
                )}
                <Icon size={15} className={isSelected ? 'text-blue-700 shrink-0' : 'text-slate-400 shrink-0'} />
                <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-mono font-bold tracking-tight truncate ${isSelected ? 'text-blue-900' : 'text-slate-700'}`}>
                        {dept.code || dept.name}
                    </span>
                </span>
                {directCount > 0 && (
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-none shrink-0">
                        {directCount}
                    </span>
                )}
            </div>
            {open && children.map(child => (
                <OrgTreeRow
                    key={child.id}
                    dept={child}
                    depth={depth + 1}
                    allDepts={allDepts}
                    users={users}
                    selectedId={selectedId}
                    onSelect={onSelect}
                />
            ))}
        </div>
    );
};
