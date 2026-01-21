/**
 * LoadingSpinner Component
 * Hand-drawn style loading indicator
 */

export default function LoadingSpinner({ message = 'Searching...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Spinner */}
      <div className="relative w-16 h-16 mb-4">
        <div className="absolute inset-0 border-4 border-line rounded-full"></div>
        <div className="absolute inset-0 border-4 border-ink-accent border-t-transparent rounded-full animate-spin"></div>
      </div>

      {/* Message */}
      <p className="text-lg font-body text-fade">
        {message}
      </p>
    </div>
  );
}
