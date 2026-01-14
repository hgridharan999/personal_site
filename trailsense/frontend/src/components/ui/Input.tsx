import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({ label, error, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block font-handwritten text-lg text-ink mb-2">{label}</label>}
      <input
        className={`w-full px-4 py-2 bg-paper border-2 border-line rounded-sm font-body text-ink placeholder:text-fade focus:border-ink-accent focus:outline-none transition-colors ${className}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm font-body text-red-600">{error}</p>}
    </div>
  );
};
