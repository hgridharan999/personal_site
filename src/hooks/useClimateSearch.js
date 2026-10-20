/**
 * Climate Search Hook
 * Custom React hook for managing climate startup search state and API calls
 */

import { useState, useCallback, useRef } from 'react';
import { searchStartups, logInteraction } from '../utils/climateApi';

/**
 * Custom hook for climate tech startup search
 * @returns {Object} Search state and methods
 */
export function useClimateSearch() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchInfo, setSearchInfo] = useState(null);
  const searchTimeoutRef = useRef(null);
  // Every search (and every clear) takes a new id. A response whose id is no longer the latest
  // is dropped, so a slow earlier search can never land on top of a newer one or a cleared box.
  const latestRef = useRef(0);

  /**
   * Perform a search
   * @param {import('../types/climate').SearchParams} params - Search parameters
   */
  const search = useCallback(async (params) => {
    // Clear any pending searches
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const id = ++latestRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await searchStartups(params);
      if (id !== latestRef.current) return;

      setResults(response.results || []);
      setSearchInfo({
        query: response.query,
        totalResults: response.total_results,
        processingTime: response.processing_time_ms,
      });
    } catch (err) {
      if (id !== latestRef.current) return;
      console.error('Search error:', err);
      setError(err.message || 'Search failed. Please try again.');
      setResults([]);
      setSearchInfo(null);
    } finally {
      if (id === latestRef.current) setLoading(false);
    }
  }, []);

  /**
   * Perform a debounced search
   * @param {import('../types/climate').SearchParams} params - Search parameters
   * @param {number} delay - Debounce delay in milliseconds
   */
  const debouncedSearch = useCallback(
    (params, delay = 300) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      setLoading(true);

      searchTimeoutRef.current = setTimeout(() => {
        search(params);
      }, delay);
    },
    [search]
  );

  /**
   * Log a user interaction with a search result
   * @param {string} query - Search query
   * @param {number} startupId - Startup ID
   * @param {number} rank - Position in results
   * @param {string} action - Action type (e.g., 'click')
   */
  const logClick = useCallback((query, startupId, rank, action = 'click') => {
    // Generate a simple session ID (could be more sophisticated)
    const sessionId = sessionStorage.getItem('climate_search_session') || 
      `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    if (!sessionStorage.getItem('climate_search_session')) {
      sessionStorage.setItem('climate_search_session', sessionId);
    }

    logInteraction({
      query,
      startup_id: startupId,
      rank,
      action,
      session_id: sessionId,
    });
  }, []);

  /**
   * Clear search results
   */
  const clearResults = useCallback(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    latestRef.current += 1; // anything still in flight is now stale
    setResults([]);
    setSearchInfo(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    results,
    loading,
    error,
    searchInfo,
    search,
    debouncedSearch,
    logClick,
    clearResults,
  };
}
