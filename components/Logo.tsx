import React from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className = "w-16 h-16" }) => (
  <img 
    src="https://i.ibb.co/whFtBvfs/Gemini-Generated-Image-merljdmerljdmerl.png" 
    alt="Oriens Logo" 
    className={`object-contain ${className}`}
    referrerPolicy="no-referrer"
  />
);

