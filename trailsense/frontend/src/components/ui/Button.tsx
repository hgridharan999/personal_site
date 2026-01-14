import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  isLoading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses =
    'font-handwritten text-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary:
      'px-6 py-2 bg-highlight text-paper border-2 border-ink hover:shadow-page-hover hover:translate-x-0.5 hover:-translate-y-0.5 irregular-border',
    secondary:
      'px-4 py-2 bg-paper border-2 border-line text-ink hover:border-ink-accent irregular-border',
    ghost: 'px-4 py-2 text-ink-accent hover:text-highlight',
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  );
};
