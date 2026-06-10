// C.4 — shared UI primitive layer. Import from here so per-page Tailwind
// string drift, focus-ring inconsistency (AX.7), label binding (AX.3) and
// dialog accessibility (AX.5) are solved once and reused.
export { Button } from './Button';
export type { ButtonProps } from './Button';
export { Input, Select } from './Input';
export type { InputProps, SelectProps } from './Input';
export { Card, Badge } from './Card';
export { Dialog } from './Dialog';
export type { DialogProps } from './Dialog';
export { Banner } from './Banner';
