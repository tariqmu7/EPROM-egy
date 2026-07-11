import React from 'react';

// C.4 — Card + Badge primitives. Centralise the card chrome and the
// colour-plus-text badge pattern (AX.2: colour is never the only signal).
export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className = '', children, ...rest }) => (
  <div className={`bg-white border border-slate-300 rounded-sm ${className}`} {...rest}>
    {children}
  </div>
);

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
};

export const Badge: React.FC<{ tone?: Tone; className?: string; children: React.ReactNode }> = ({
  tone = 'neutral',
  className = '',
  children,
}) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold border rounded-sm ${TONES[tone]} ${className}`}>
    {children}
  </span>
);
