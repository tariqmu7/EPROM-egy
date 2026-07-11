import React from 'react';
import logoUrl from '../assets/eprom-logo.gif';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-16 h-16" }) => (
  <img
    src={logoUrl}
    alt="EPROM Logo"
    className={`object-contain ${className}`}
    referrerPolicy="no-referrer"
  />
);

