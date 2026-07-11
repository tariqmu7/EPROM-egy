import React from 'react';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

// AX.8 / AX.2 — status banner with the right ARIA live semantics and an icon
// paired with colour (never colour alone). `status` → polite/role=status,
// `error` → assertive/role=alert.
type Kind = 'success' | 'error' | 'info' | 'warning';

const STYLES: Record<Kind, { wrap: string; icon: React.ReactNode; live: 'polite' | 'assertive'; role: 'status' | 'alert' }> = {
  success: { wrap: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: <CheckCircle size={20} className="text-emerald-500" aria-hidden="true" />, live: 'polite', role: 'status' },
  info: { wrap: 'bg-blue-50 border-blue-200 text-blue-800', icon: <Info size={20} className="text-blue-500" aria-hidden="true" />, live: 'polite', role: 'status' },
  warning: { wrap: 'bg-amber-50 border-amber-200 text-amber-800', icon: <AlertTriangle size={20} className="text-amber-500" aria-hidden="true" />, live: 'polite', role: 'status' },
  error: { wrap: 'bg-rose-50 border-rose-200 text-rose-800', icon: <AlertTriangle size={20} className="text-rose-500" aria-hidden="true" />, live: 'assertive', role: 'alert' },
};

export const Banner: React.FC<{ kind: Kind; children: React.ReactNode; onDismiss?: () => void }> = ({ kind, children, onDismiss }) => {
  const s = STYLES[kind];
  return (
    <div role={s.role} aria-live={s.live} className={`border px-4 py-3 rounded-sm flex items-start gap-3 ${s.wrap}`}>
      {s.icon}
      <div className="flex-1 font-medium text-sm">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current rounded-sm">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
