/**
 * Unified posts API client.
 * Fetches normalized external posts from the portfolio backend.
 */

const API_BASE_URL = import.meta.env.VITE_PORTFOLIO_API_URL || 'http://localhost:8000';

/**
 * @typedef {Object} UnifiedFeedItem
 * @property {string} id
 * @property {'blog'|'linkedin'} source
 * @property {string} sourceLabel
 * @property {string} title
 * @property {string} excerpt
 * @property {string} publishedAt
 * @property {string} displayDate
 * @property {string|null} internalSlug
 * @property {string|null} externalUrl
 */

/**
 * Fetch external feed items from backend.
 * @returns {Promise<UnifiedFeedItem[]>}
 */
export async function getRemoteFeedItems() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/feed?limit=50`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Feed request failed: ${response.statusText}`);
    }

    const data = await response.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    console.error('Remote feed error:', error);
    throw error;
  }
}
