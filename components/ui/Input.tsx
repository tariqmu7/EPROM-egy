import React, { useId } from 'react';

// C.4 / AX.3 — Input + Select primitives with built-in label binding. The
// generated id ties <label htmlFor> to the control so clicking the label
// focuses it and screen readers announce the field name.
interface FieldBase {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export interface InputProps
  extends FieldBase,
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {}

export const Input: React.FC<InputProps> = ({ label, hint, error, required, className = '', ...rest }) => {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-slate-700 mb-2">
        {label}{required && <span className="text-rose-600 ml-0.5" aria-hidden="true">*</span>}
      </label>
      <input
        id={id}
        required={required}
        aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        className={`w-full bg-slate-50 border text-slate-900 text-sm rounded-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 block p-3 outline-none ${error ? 'border-rose-400' : 'border-slate-300'} ${className}`}
        {...rest}
      />
      {hint && !error && <p id={hintId} className="text-xs text-slate-600 mt-1">{hint}</p>}
      {error && <p id={errId} className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
};

export interface SelectProps
  extends FieldBase,
    Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  children: React.ReactNode;
}

export const Select: React.FC<SelectProps> = ({ label, hint, error, required, className = '', children, ...rest }) => {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-slate-700 mb-2">
        {label}{required && <span className="text-rose-600 ml-0.5" aria-hidden="true">*</span>}
      </label>
      <select
        id={id}
        required={required}
        aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? true : undefined}
        className={`w-full bg-slate-50 border text-slate-900 text-sm rounded-sm focus:ring-2 focus:ring-slate-900 focus:border-slate-900 block p-3 outline-none ${error ? 'border-rose-400' : 'border-slate-300'} ${className}`}
        {...rest}
      >
        {children}
      </select>
      {hint && !error && <p id={hintId} className="text-xs text-slate-600 mt-1">{hint}</p>}
      {error && <p id={errId} className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  );
};
