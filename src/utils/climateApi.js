/**
 * Climate Search API Client
 * Handles all API communication with the backend search service
 */

// API base URL - adjust based on environment
const API_BASE_URL = import.meta.env.VITE_CLIMATE_API_URL || 'http://localhost:8000';

/**
 * Search for climate tech startups
 * @param {import('../types/climate').SearchParams} params - Search parameters
 * @returns {Promise<import('../types/climate').SearchResponse>} Search results
 */
export async function searchStartups(params) {
  const {
    query,
    top_k = 20,
    vertical_filter,
    founded_year_min,
    founded_year_max,
    min_funding_usd,
    enable_diversity = true,
    enable_query_expansion = true,
  } = params;

  const requestBody = {
    query,
    top_k,
    vertical_filter,
    founded_year_min,
    founded_year_max,
    min_funding_usd,
    enable_diversity,
    enable_query_expansion,
  };

  // Remove undefined values
  Object.keys(requestBody).forEach(
    (key) => requestBody[key] === undefined && delete requestBody[key]
  );

  try {
    const response = await fetch(`${API_BASE_URL}/api/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Search failed: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Search API error:', error);
    throw error;
  }
}

/**
 * Get a single startup by ID
 * @param {number} id - Startup ID
 * @returns {Promise<import('../types/climate').Startup>} Startup data
 */
export async function getStartup(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/startups/${id}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch startup: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Get startup error:', error);
    throw error;
  }
}

/**
 * Get available climate tech verticals
 * @returns {Promise<import('../types/climate').VerticalInfo[]>} List of verticals
 */
export async function getVerticals() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/verticals`);

    if (!response.ok) {
      throw new Error(`Failed to fetch verticals: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Get verticals error:', error);
    throw error;
  }
}

/**
 * Get search engine statistics
 * @returns {Promise<import('../types/climate').Stats>} Statistics
 */
export async function getStats() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/stats`);

    if (!response.ok) {
      throw new Error(`Failed to fetch stats: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Get stats error:', error);
    throw error;
  }
}

/**
 * Log a user interaction for analytics
 * @param {Object} interaction - Interaction data
 * @param {string} interaction.query - Search query
 * @param {number} interaction.startup_id - Startup ID clicked
 * @param {number} interaction.rank - Position in results
 * @param {string} interaction.action - Action type (click, view, etc.)
 * @param {string} [interaction.session_id] - Session identifier
 */
export async function logInteraction(interaction) {
  try {
    // Fire and forget - don't block UI on logging
    fetch(`${API_BASE_URL}/api/log-interaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(interaction),
    }).catch((error) => {
      console.warn('Failed to log interaction:', error);
    });
  } catch (error) {
    console.warn('Log interaction error:', error);
  }
}

/**
 * Check if API is healthy
 * @returns {Promise<boolean>} API health status
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      timeout: 5000,
    });
    return response.ok;
  } catch (error) {
    console.error('Health check error:', error);
    return false;
  }
}
