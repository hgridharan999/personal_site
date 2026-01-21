/**
 * ErrorMessage Component
 * Friendly error display with journal styling
 */

import { AlertCircle } from 'lucide-react';

export default function ErrorMessage({ error, onRetry }) {
  return (
    <div className="
      bg-paper/50 p-6 md:p-8 rounded-sm border-2 border-highlight
      shadow-page transform rotate-1
    ">
      <div className="flex items-start gap-4">
        <AlertCircle className="w-6 h-6 text-highlight flex-shrink-0 mt-1" />
        
        <div className="flex-1">
          <h3 className="text-xl font-handwritten font-bold text-ink mb-2">
            Oops! Something went wrong
          </h3>
          
          <p className="font-body text-base text-ink mb-4">
            {error || 'An unexpected error occurred. Please try again.'}
          </p>

          {onRetry && (
            <button
              onClick={onRetry}
              className="
                px-6 py-2
                bg-paper border-2 border-ink
                rounded-sm
                font-handwritten text-lg text-ink
                hover:shadow-page-hover
                hover:translate-x-1 hover:-translate-y-1
                transition-all duration-300
              "
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
