import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  hover = false,
  onClick,
}) => {
  const hoverClasses = hover
    ? 'hover:shadow-page-hover hover:translate-x-1 hover:-translate-y-1 cursor-pointer'
    : '';

  return (
    <div
      className={`bg-paper/50 p-6 border-2 border-line transition-all duration-300 irregular-border ${hoverClasses} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};
