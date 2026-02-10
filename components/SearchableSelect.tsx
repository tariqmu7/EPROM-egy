import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export interface Option {
  value: string;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  disabled?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({ options, value, onChange, placeholder, label, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset search when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
    if(!isOpen) setSearch('');
  }, [isOpen]);

  const selectedOption = options.find(o => o.value === value);

  const filteredOptions = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.subLabel && o.subLabel.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <div
        className={`w-full px-3 py-2 border rounded-lg bg-white flex items-center justify-between transition-all ${
            disabled ? 'bg-slate-100 cursor-not-allowed border-slate-200' : 'cursor-pointer border-slate-300 hover:border-teal-500'
        } ${isOpen ? 'ring-2 ring-teal-500 border-transparent' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <div className="truncate flex-1">
          {selectedOption ? (
             <div className="flex items-center gap-2">
                <span className="text-slate-900 font-medium truncate">{selectedOption.label}</span>
                {selectedOption.subLabel && <span className="text-slate-400 text-xs truncate">({selectedOption.subLabel})</span>}
             </div>
          ) : (
            <span className="text-slate-400">{placeholder || 'Select...'}</span>
          )}
        </div>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-100">
          <div className="p-2 border-b border-slate-100 bg-slate-50 sticky top-0">
             <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400"/>
                <input
                    ref={inputRef}
                    type="text"
                    className="w-full pl-8 pr-3 py-1.5 text-sm bg-white text-slate-900 border border-slate-200 rounded-md focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                    placeholder="Type to search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                />
             </div>
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar bg-white">
            {filteredOptions.length > 0 ? (
                filteredOptions.map(option => (
                    <div
                        key={option.value}
                        className={`px-4 py-2 text-sm cursor-pointer border-l-2 ${
                            option.value === value 
                            ? 'bg-teal-50 text-teal-900 border-teal-600 font-medium' 
                            : 'text-slate-700 border-transparent hover:bg-slate-50 hover:border-slate-200'
                        }`}
                        onClick={() => {
                            onChange(option.value);
                            setIsOpen(false);
                        }}
                    >
                        <div className="font-medium">{option.label}</div>
                        {option.subLabel && <div className="text-xs text-slate-500">{option.subLabel}</div>}
                    </div>
                ))
            ) : (
                <div className="p-8 text-center text-sm text-slate-400 flex flex-col items-center">
                    <Search size={24} className="mb-2 opacity-20"/>
                    No results found
                </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};