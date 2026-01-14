import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', className = '' }) => {
  const variantClasses = {
    default: 'bg-ink-accent/10 border-ink-accent/30 text-ink-accent',
    success: 'bg-green-100 border-green-300 text-green-700',
    warning: 'bg-yellow-100 border-yellow-300 text-yellow-700',
    error: 'bg-red-100 border-red-300 text-red-700',
  };

  return (
    <span
      className={`px-3 py-1.5 border font-notes text-sm inline-block irregular-border-alt ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
