/**
 * SearchBar Component
 * Hand-drawn journal style search input with debounced searching
 */

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';

export default function SearchBar({ onSearch, loading }) {
  const [query, setQuery] = useState('');

  const handleClear = () => {
    setQuery('');
    onSearch('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search climate tech startups..."
          className="
            w-full px-4 py-3 pl-12 pr-12
            bg-paper border-2 border-line
            rounded-sm
            font-body text-base md:text-lg text-ink
            placeholder:text-fade placeholder:font-body
            focus:outline-none focus:border-ink-accent
            transition-colors duration-200
            shadow-page
          "
          disabled={loading}
        />
        
        {/* Search Icon */}
        <Search 
          className="absolute left-4 top-1/2 -translate-y-1/2 text-fade w-5 h-5"
          aria-hidden="true"
        />

        {/* Clear Button */}
        {query && !loading && (
          <button
            type="button"
            onClick={handleClear}
            className="
              absolute right-4 top-1/2 -translate-y-1/2
              text-fade hover:text-ink
              transition-colors
              p-1
            "
            aria-label="Clear search"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Loading Indicator */}
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-ink-accent border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
      </div>

      {/* Search Tips */}
      <p className="mt-2 text-sm font-notes text-fade">
        Try: "solar panels", "carbon capture", "vertical farming", or "EV charging"
      </p>
    </form>
  );
}
