/**
 * ResultsList Component
 * Displays grid of startup result cards
 */

import ResultCard from './ResultCard';

export default function ResultsList({ results, searchInfo, onViewStartup }) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-2xl md:text-3xl font-handwritten font-bold text-ink">
          Results
        </h2>
        
        {searchInfo && (
          <div className="flex items-center gap-4 text-sm font-body text-fade">
            <span>{searchInfo.totalResults} startups found</span>
            <span className="opacity-50">•</span>
            <span>{searchInfo.processingTime}ms</span>
          </div>
        )}
      </div>

      {/* Results Grid */}
      <div className="space-y-6">
        {results.map((result, index) => (
          <ResultCard
            key={result.startup.id ?? `${result.startup.name}-${index}`}
            result={result}
            rank={index}
            onView={onViewStartup}
          />
        ))}
      </div>
    </div>
  );
}

