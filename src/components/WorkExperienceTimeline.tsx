import React, { useMemo } from 'react';
import { Building2, Pencil, Trash2, Clock, CheckCircle2, XCircle, ArrowRightLeft, Layers } from 'lucide-react';
import { dataService } from '../services/store';
import { useStoreData } from '../hooks/useStoreData';
import {
  User,
  WorkExperience,
  CareerHistoryEntry,
  WORK_EXPERIENCE_STATUS_LABELS,
  EMPLOYMENT_TYPE_LABELS,
} from '../types';

/**
 * One continuous career story from two different record shapes:
 *   • EXTERNAL — `workExperiences` docs (prior employers, employee-submitted,
 *     manager-verified, may carry tagged skills).
 *   • INTERNAL — `User.careerHistory` entries (promotions/transfers inside the
 *     company, written by the admin Promotion flow). Always read-only here.
 *
 * Entries are sorted explicitly rather than trusting `careerHistory[0]` to be the
 * current role — that assumption lives in the legacy Professional Journey view
 * and does not hold once external roles are interleaved.
 */

type TimelineItem = {
  key: string;
  kind: 'INTERNAL' | 'EXTERNAL';
  title: string;
  org: string;
  startDate: string;
  endDate?: string;
  subLabel?: string;
  status?: WorkExperience['status'];
  skillCount?: number;
  source: CareerHistoryEntry | WorkExperience;
};

const STATUS_STYLES: Record<WorkExperience['status'], { cls: string; Icon: typeof Clock }> = {
  PENDING: { cls: 'bg-amber-100 text-amber-700 border-amber-200', Icon: Clock },
  VERIFIED: { cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  REJECTED: { cls: 'bg-rose-100 text-rose-700 border-rose-200', Icon: XCircle },
};

function formatRange(start: string, end?: string): string {
  const fmt = (d: string) => {
    const parsed = new Date(d);
    return isNaN(parsed.getTime())
      ? d
      : parsed.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  };
  return `${start ? fmt(start) : '—'} → ${end ? fmt(end) : 'Present'}`;
}

/** Whole years between two dates, for the "N yrs" chip. */
function durationYears(start: string, end?: string): number | null {
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  if (isNaN(s) || isNaN(e) || e < s) return null;
  return Math.round(((e - s) / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10;
}

interface Props {
  user: User;
  /** Hides every mutating affordance. Set when viewing someone else's profile. */
  readOnly?: boolean;
  scope?: 'ALL' | 'INTERNAL' | 'EXTERNAL';
  /** Bump to force a re-read after a write. */
  refreshKey?: number;
  onEdit?: (entry: WorkExperience) => void;
  onDelete?: (entry: WorkExperience) => void;
}

export const WorkExperienceTimeline: React.FC<Props> = ({
  user, readOnly = false, scope = 'ALL', refreshKey = 0, onEdit, onDelete,
}) => {
  // Re-read when a polling snapshot lands, not just on local writes.
  const storeVersion = useStoreData();

  const items = useMemo<TimelineItem[]>(() => {
    const out: TimelineItem[] = [];

    const departments = dataService.getAllDepartments();

    if (scope !== 'EXTERNAL') {
      for (const entry of user.careerHistory || []) {
        const dept = departments.find(d => d.id === entry.departmentId);
        out.push({
          key: `int-${entry.id}`,
          kind: 'INTERNAL',
          title: entry.jobTitle,
          org: dept?.name || entry.projectName || 'Internal',
          startDate: entry.startDate,
          endDate: entry.endDate,
          subLabel: entry.reason,
          source: entry,
        });
      }
    }

    if (scope !== 'INTERNAL') {
      for (const we of dataService.getWorkExperiences(user.id)) {
        out.push({
          key: `ext-${we.id}`,
          kind: 'EXTERNAL',
          title: we.jobTitle,
          org: we.employer,
          startDate: we.startDate,
          endDate: we.endDate,
          subLabel: we.employmentType ? EMPLOYMENT_TYPE_LABELS[we.employmentType] : undefined,
          status: we.status,
          skillCount: (we.skills || []).length,
          source: we,
        });
      }
    }

    // Current roles (no end date) float to the top, then most recent first.
    return out.sort((a, b) => {
      const aEnd = a.endDate || '9999-12-31';
      const bEnd = b.endDate || '9999-12-31';
      if (aEnd !== bEnd) return bEnd.localeCompare(aEnd);
      return (b.startDate || '').localeCompare(a.startDate || '');
    });
    // refreshKey intentionally participates so a local write re-reads immediately.
  }, [user, scope, refreshKey, storeVersion]);

  if (items.length === 0) {
    return (
      <div className="text-center py-16 px-6 bg-slate-50 border-2 border-dashed border-slate-200">
        <Building2 className="w-12 h-12 mx-auto text-slate-300 mb-4" />
        <p className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">No Work History Recorded</p>
        <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
          {readOnly
            ? 'This employee has not added any previous employment.'
            : 'Add roles you held before joining, then tag the skills you used. Once your manager verifies them they can count towards your competency profile.'}
        </p>
      </div>
    );
  }

  return (
    <ol className="relative border-s-2 border-slate-200 ms-3 space-y-6">
      {items.map(item => {
        const years = durationYears(item.startDate, item.endDate);
        const badge = item.status ? STATUS_STYLES[item.status] : null;
        const we = item.kind === 'EXTERNAL' ? (item.source as WorkExperience) : null;
        // A verified record is part of the competency audit trail: re-opening it
        // must go through re-submission, so editing is offered only before a
        // verdict exists.
        const canMutate = !readOnly && we && we.status !== 'VERIFIED';

        return (
          <li key={item.key} className="ms-6">
            <span
              className={`absolute flex items-center justify-center w-6 h-6 rounded-full -start-3 ring-4 ring-white ${
                item.kind === 'INTERNAL' ? 'bg-indigo-100' : 'bg-slate-100'
              }`}
            >
              {item.kind === 'INTERNAL'
                ? <ArrowRightLeft className="w-3 h-3 text-indigo-600" />
                : <Building2 className="w-3 h-3 text-slate-600" />}
            </span>

            <div className="p-4 bg-white border border-slate-200">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-black uppercase tracking-wide text-slate-800 break-words">{item.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5 break-words">{item.org}</p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                  {item.kind === 'INTERNAL' && (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-indigo-50 text-indigo-600 border border-indigo-100">
                      Internal
                    </span>
                  )}
                  {badge && (
                    <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border inline-flex items-center gap-1 ${badge.cls}`}>
                      <badge.Icon className="w-3 h-3" />
                      {WORK_EXPERIENCE_STATUS_LABELS[item.status!]}
                    </span>
                  )}
                  {canMutate && onEdit && (
                    <button
                      onClick={() => onEdit(we!)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      aria-label={`Edit ${item.title} at ${item.org}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canMutate && onDelete && (
                    <button
                      onClick={() => onDelete(we!)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      aria-label={`Delete ${item.title} at ${item.org}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-400">
                <span>{formatRange(item.startDate, item.endDate)}</span>
                {years !== null && <span>· {years} yrs</span>}
                {item.subLabel && <span>· {item.subLabel}</span>}
                {!!item.skillCount && (
                  <span className="inline-flex items-center gap-1">
                    · <Layers className="w-3 h-3" /> {item.skillCount} skill{item.skillCount === 1 ? '' : 's'} tagged
                  </span>
                )}
              </div>

              {we?.responsibilities && (
                <p className="mt-2 text-xs text-slate-600 whitespace-pre-line line-clamp-4">{we.responsibilities}</p>
              )}

              {we?.status === 'REJECTED' && we.reviewerComment && (
                <p className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 px-2 py-1.5">
                  Reviewer: {we.reviewerComment}
                </p>
              )}

              {we?.status === 'VERIFIED' && (we.skills || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-1.5">
                  {we.skills.map(s => {
                    const skill = dataService.getSkill(s.skillId);
                    if (!skill) return null;
                    return (
                      <span key={s.skillId} className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {skill.name} · L{s.verifiedLevel ?? '—'}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default WorkExperienceTimeline;
