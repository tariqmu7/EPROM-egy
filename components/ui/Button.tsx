import React from 'react';
import { LucideIcon } from 'lucide-react';

// C.4 — shared Button primitive. Bakes in consistent focus-visible rings (AX.7)
// and sizing so per-page Tailwind strings stop drifting.
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-700 hover:bg-blue-800 text-white border border-blue-700 focus-visible:ring-blue-700',
  secondary: 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 focus-visible:ring-slate-900',
  danger: 'bg-rose-600 hover:bg-rose-700 text-white border border-rose-600 focus-visible:ring-rose-600',
  ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 border border-transparent focus-visible:ring-slate-900',
};

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2.5 gap-2',
  lg: 'text-base px-6 py-3 gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  className = '',
  children,
  ...rest
}) => {
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
  return (
    <button
      className={`inline-flex items-center justify-center font-bold rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {Icon && iconPosition === 'left' && <Icon size={iconSize} aria-hidden="true" />}
      {children}
      {Icon && iconPosition === 'right' && <Icon size={iconSize} aria-hidden="true" />}
    </button>
  );
};
