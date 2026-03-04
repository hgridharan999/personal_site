import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useClimateSearch } from '../hooks/useClimateSearch';
import SearchBar from '../components/climate/SearchBar';
import FilterPanel from '../components/climate/FilterPanel';
import ResultsList from '../components/climate/ResultsList';
import StatsPanel from '../components/climate/StatsPanel';
import LoadingSpinner from '../components/climate/LoadingSpinner';
import ErrorMessage from '../components/climate/ErrorMessage';
import PageShell from '../components/PageShell';

export default function ClimateSearchPage() {
  const {
    results,
    loading,
    error,
    searchInfo,
    debouncedSearch,
    logClick,
    clearResults,
  } = useClimateSearch();

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({
    vertical_filter: null,
    founded_year_min: undefined,
    founded_year_max: undefined,
  });

  const handleSearch = (searchQuery) => {
    setQuery(searchQuery);
    if (searchQuery.trim()) {
      debouncedSearch({ query: searchQuery, top_k: 20, ...filters });
    } else {
      clearResults();
    }
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    if (query.trim()) {
      debouncedSearch({ query, top_k: 20, ...newFilters });
    }
  };

  const handleQueryChange = (rawQuery) => {
    setQuery(rawQuery);
  };

  const handleViewStartup = (startupId, rank) => {
    if (query) logClick(query, startupId, rank, 'click');
  };

  const handleRetry = () => {
    if (query.trim()) handleSearch(query);
  };

  const exampleTerms = ['solar energy', 'carbon capture', 'EV charging', 'vertical farming', 'energy storage', 'green hydrogen'];

  return (
    <PageShell title="Climate Tech Discovery">
      {/* Subtitle + badge */}
      <div className="max-w-3xl mx-auto w-full mb-8 space-y-3">
        <p className="font-body text-base text-ink-accent leading-relaxed">
          Search 100+ climate startups using AI-powered semantic search. Find innovative companies tackling carbon removal, clean energy, sustainable agriculture, and more.
        </p>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink-accent/10 border border-ink-accent/20 font-notes text-xs text-ink-accent rounded-sm">
          <Sparkles className="w-3.5 h-3.5" />
          Powered by BERT + BM25 Hybrid Search
        </span>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 max-w-4xl mx-auto w-full">

        {/* Left sidebar — filters (desktop) */}
        <aside className="hidden lg:block lg:col-span-3">
          <FilterPanel filters={filters} onFiltersChange={handleFiltersChange} />
        </aside>

        {/* Center — search + results */}
        <main className="lg:col-span-6">
          <div className="mb-6">
            <SearchBar onSearch={handleSearch} onQueryChange={handleQueryChange} loading={loading} />
          </div>

          {/* Mobile filters */}
          <div className="lg:hidden mb-5">
            <details className="border border-line rounded-sm p-4">
              <summary className="font-handwritten text-lg font-bold text-ink cursor-pointer list-none">
                Filters & Options
              </summary>
              <div className="mt-4">
                <FilterPanel filters={filters} onFiltersChange={handleFiltersChange} />
              </div>
            </details>
          </div>

          {loading && !results.length && (
            <LoadingSpinner message="Searching climate tech startups..." />
          )}

          {error && (
            <ErrorMessage error={error} onRetry={handleRetry} />
          )}

          {!loading && !error && results.length > 0 && (
            <ResultsList results={results} searchInfo={searchInfo} onViewStartup={handleViewStartup} />
          )}

          {!loading && !error && query && results.length === 0 && (
            <div className="border border-line rounded-sm p-8 text-center">
              <h3 className="font-handwritten text-2xl font-bold text-ink mb-2">No results found</h3>
              <p className="font-body text-sm text-fade mb-5">Try a different search term or adjust your filters</p>
              <div className="flex flex-wrap justify-center gap-2">
                {exampleTerms.slice(0, 4).map((term) => (
                  <button
                    key={term}
                    onClick={() => handleSearch(term)}
                    className="px-3 py-1 border border-ink-accent font-notes text-xs text-ink-accent hover:bg-ink-accent hover:text-paper transition-colors rounded-sm"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!query && !loading && (
            <div className="border border-line rounded-sm p-8 text-center">
              <h3 className="font-handwritten text-2xl font-bold text-ink mb-2">Start exploring climate tech</h3>
              <p className="font-body text-sm text-ink mb-5">Enter a search term to discover innovative climate startups</p>
              <div className="flex flex-wrap justify-center gap-2">
                {exampleTerms.map((term) => (
                  <button
                    key={term}
                    onClick={() => handleSearch(term)}
                    className="px-3 py-1 border border-line font-notes text-xs text-fade hover:border-ink-accent hover:text-ink-accent transition-colors rounded-sm"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar — stats */}
        <aside className="lg:col-span-3">
          <StatsPanel />
        </aside>
      </div>

      {/* Footer */}
      <div className="mt-16 pt-6 border-t border-line text-center">
        <p className="font-body text-sm text-fade">
          Built with FastAPI, FAISS, BM25, and BERT embeddings · {new Date().getFullYear()}
        </p>
      </div>
    </PageShell>
  );
}
