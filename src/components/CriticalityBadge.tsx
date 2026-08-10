import React from 'react';
import { AlertOctagon } from 'lucide-react';
import {
  SkillCriticality,
  SKILL_CRITICALITY_LABELS,
  SKILL_CRITICALITY_DESCRIPTIONS,
  SKILL_CRITICALITY_WEIGHTS,
  skillCriticalityOf,
} from '../types';

/**
 * One look for "how much does a gap on this skill matter", wherever it appears
 * (the skill library, the training-needs table, an individual plan).
 *
 * It is a RANKING signal, never a score: a safety-critical skill is not scored
 * differently, its gap is simply trained first. The weight shown in the tooltip
 * is the multiplier the TNA applies — see SKILL_CRITICALITY_WEIGHTS.
 */
export const CRITICALITY_BADGE: Record<SkillCriticality, string> = {
  SAFETY_CRITICAL: 'bg-rose-50 text-rose-700 border-rose-200',
  HIGH: 'bg-amber-50 text-amber-700 border-amber-200',
  STANDARD: 'bg-slate-50 text-slate-600 border-slate-200',
  LOW: 'bg-slate-50 text-slate-400 border-slate-200',
};

export const CriticalityBadge: React.FC<{
  criticality?: string | null;
  className?: string;
  /** Show the ×weight beside the label (used where ranking is being explained). */
  showWeight?: boolean;
}> = ({ criticality, className = '', showWeight = false }) => {
  const level = skillCriticalityOf(criticality);
  return (
    <span
      title={`${SKILL_CRITICALITY_DESCRIPTIONS[level]} (gap weight ×${SKILL_CRITICALITY_WEIGHTS[level]})`}
      className={`inline-flex items-center gap-1 px-2 py-1 border text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${CRITICALITY_BADGE[level]} ${className}`}
    >
      {level === 'SAFETY_CRITICAL' && <AlertOctagon size={10} className="shrink-0" />}
      {SKILL_CRITICALITY_LABELS[level]}
      {showWeight && <span className="opacity-60">×{SKILL_CRITICALITY_WEIGHTS[level]}</span>}
    </span>
  );
};
