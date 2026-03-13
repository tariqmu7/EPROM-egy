import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-16 h-16" }) => (
  <img 
    src="https://eprom.com.eg/wp-content/uploads/2024/07/epromlogo-scaled.gif" 
    alt="EPROM Logo" 
    className={`object-contain ${className}`}
    referrerPolicy="no-referrer"
  />
);

