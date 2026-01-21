/**
 * ClimateSearch Page
 * Main page component for the climate tech startup search engine
 * Features AI-powered semantic search with hand-drawn journal aesthetic
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useClimateSearch } from '../hooks/useClimateSearch';
import SearchBar from '../components/climate/SearchBar';
import FilterPanel from '../components/climate/FilterPanel';
import ResultsList from '../components/climate/ResultsList';
import StatsPanel from '../components/climate/StatsPanel';
import LoadingSpinner from '../components/climate/LoadingSpinner';
import ErrorMessage from '../components/climate/ErrorMessage';

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
      debouncedSearch({
        query: searchQuery,
        top_k: 20,
        ...filters,
      });
    } else {
      clearResults();
    }
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    
    // Re-run search if there's an active query
    if (query.trim()) {
      debouncedSearch({
        query,
        top_k: 20,
        ...newFilters,
      });
    }
  };

  const handleViewStartup = (startupId, rank) => {
    if (query) {
      logClick(query, startupId, rank, 'click');
    }
  };

  const handleRetry = () => {
    if (query.trim()) {
      handleSearch(query);
    }
  };

  return (
    <div className="min-h-screen bg-paper p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Back Link */}
        <Link
          to="/"
          className="
            inline-flex items-center gap-2 mb-6
            font-handwritten text-lg text-highlight
            hover:text-ink
            transition-colors
          "
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Portfolio
        </Link>

        {/* Hero Section */}
        <header className="mb-8 md:mb-12 py-8 md:py-12">
          <div className="relative inline-block">
            <h1 className="
              text-5xl md:text-6xl lg:text-7xl
              font-handwritten font-bold text-ink
              mb-4
              relative
            ">
              Climate Tech Discovery
              
              {/* Hand-drawn underline */}
              <svg 
                className="absolute -bottom-2 left-0 w-full h-4" 
                viewBox="0 0 400 10"
                preserveAspectRatio="none"
              >
                <path
                  d="M2 5 Q 100 3, 200 6 T 398 5"
                  stroke="#C67B5C"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  className="animate-draw"
                />
              </svg>
            </h1>
          </div>

          <p className="text-lg md:text-xl lg:text-2xl font-body text-fade max-w-3xl">
            Search 100+ climate startups using AI-powered semantic search. 
            Find innovative companies tackling carbon removal, clean energy, 
            sustainable agriculture, and more.
          </p>

          {/* Feature Badge */}
          <div className="
            inline-flex items-center gap-2 mt-6
            px-4 py-2
            bg-ink-accent/10 border-2 border-ink-accent
            rounded-full
            font-notes text-sm text-ink-accent
          ">
            <Sparkles className="w-4 h-4" />
            <span>Powered by BERT + BM25 Hybrid Search</span>
          </div>
        </header>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Left Sidebar - Filters (Desktop) */}
          <aside className="hidden lg:block lg:col-span-3">
            <FilterPanel 
              filters={filters} 
              onFiltersChange={handleFiltersChange} 
            />
          </aside>

          {/* Center Column - Search & Results */}
          <main className="lg:col-span-6">
            {/* Search Bar */}
            <div className="mb-8">
              <SearchBar 
                onSearch={handleSearch} 
                loading={loading} 
              />
            </div>

            {/* Mobile Filters */}
            <div className="lg:hidden mb-6">
              <details className="
                bg-paper/50 p-4 rounded-sm border-2 border-line
                shadow-page
              ">
                <summary className="
                  font-handwritten text-xl font-bold text-ink
                  cursor-pointer
                  list-none
                ">
                  Filters & Options
                </summary>
                <div className="mt-4">
                  <FilterPanel 
                    filters={filters} 
                    onFiltersChange={handleFiltersChange} 
                  />
                </div>
              </details>
            </div>

            {/* Loading State */}
            {loading && !results.length && (
              <LoadingSpinner message="Searching climate tech startups..." />
            )}

            {/* Error State */}
            {error && (
              <ErrorMessage error={error} onRetry={handleRetry} />
            )}

            {/* Results */}
            {!loading && !error && results.length > 0 && (
              <ResultsList
                results={results}
                searchInfo={searchInfo}
                onViewStartup={handleViewStartup}
              />
            )}

            {/* Empty State */}
            {!loading && !error && query && results.length === 0 && (
              <div className="
                bg-paper/50 p-8 md:p-12 rounded-sm border-2 border-line
                shadow-page text-center transform -rotate-1
              ">
                <h3 className="text-2xl font-handwritten font-bold text-ink mb-3">
                  No results found
                </h3>
                <p className="font-body text-lg text-fade mb-6">
                  Try a different search term or adjust your filters
                </p>
                <div className="font-notes text-sm text-fade">
                  <p className="mb-2">Popular searches:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {['solar energy', 'carbon capture', 'EV charging', 'vertical farming'].map((term) => (
                      <button
                        key={term}
                        onClick={() => handleSearch(term)}
                        className="
                          px-3 py-1
                          bg-paper border-2 border-ink-accent
                          rounded-full
                          text-ink-accent
                          hover:bg-ink-accent hover:text-paper
                          transition-colors
                        "
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Initial State */}
            {!query && !loading && (
              <div className="
                bg-paper/50 p-8 md:p-12 rounded-sm border-2 border-line
                shadow-page text-center transform rotate-1
              ">
                <h3 className="text-2xl md:text-3xl font-handwritten font-bold text-ink mb-4">
                  Start exploring climate tech
                </h3>
                <p className="font-body text-lg text-ink mb-6 max-w-md mx-auto">
                  Enter a search term above to discover innovative climate startups 
                  using AI-powered semantic search
                </p>
                
                {/* Example Searches */}
                <div className="font-notes text-sm text-fade">
                  <p className="mb-3">Try searching for:</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      'solar panels',
                      'carbon removal',
                      'electric vehicles',
                      'sustainable food',
                      'energy storage',
                      'green hydrogen',
                    ].map((term) => (
                      <button
                        key={term}
                        onClick={() => handleSearch(term)}
                        className="
                          px-4 py-2
                          bg-paper border-2 border-ink
                          rounded-full
                          text-ink
                          hover:shadow-page-hover
                          hover:translate-x-1 hover:-translate-y-1
                          transition-all
                        "
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Decorative doodles */}
                <div className="mt-8 flex justify-center gap-4 opacity-20">
                  <div className="w-8 h-8 border-2 border-ink rounded-full"></div>
                  <div className="w-8 h-8 border-2 border-ink rotate-45"></div>
                  <div className="w-8 h-8 border-2 border-ink rounded-full"></div>
                </div>
              </div>
            )}
          </main>

          {/* Right Sidebar - Stats */}
          <aside className="lg:col-span-3">
            <StatsPanel />
          </aside>
        </div>

        {/* Footer Info */}
        <footer className="mt-16 pt-8 border-t-2 border-line">
          <div className="text-center">
            <p className="font-body text-base text-fade mb-2">
              Built with FastAPI, FAISS, BM25, and BERT embeddings
            </p>
            <p className="font-notes text-sm text-fade">
              Part of Hari's portfolio • {new Date().getFullYear()}
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
