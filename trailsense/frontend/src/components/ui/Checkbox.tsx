import React from 'react';
import { Check } from 'lucide-react';

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, checked, onChange }) => {
  return (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div
        className={`w-6 h-6 border-2 rounded-sm flex items-center justify-center transition-colors ${
          checked ? 'bg-highlight border-ink' : 'bg-paper border-line group-hover:border-ink-accent'
        }`}
      >
        {checked && <Check className="w-4 h-4 text-paper" />}
      </div>
      <span className="font-body text-base text-ink">{label}</span>
    </label>
  );
};
