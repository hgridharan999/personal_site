/**
 * Climate Tech Search Type Definitions
 * TypeScript-style JSDoc annotations for better IDE support
 */

/**
 * @typedef {Object} Startup
 * @property {number} id - Unique startup identifier
 * @property {string} name - Company name
 * @property {string} short_description - Brief description
 * @property {number} founded_year - Year company was founded
 * @property {number} total_funding_usd - Total funding in USD
 * @property {string} website_url - Company website
 * @property {string} primary_vertical - Climate tech vertical
 * @property {string} headquarters_location - HQ location
 */

/**
 * @typedef {Object} SearchParams
 * @property {string} query - Search query string
 * @property {number} [top_k=20] - Number of results to return
 * @property {string} [vertical_filter] - Filter by vertical
 * @property {number} [founded_year_min] - Minimum founded year
 * @property {number} [founded_year_max] - Maximum founded year
 * @property {number} [min_funding_usd] - Minimum funding amount
 * @property {boolean} [enable_diversity=true] - Enable result diversification
 * @property {boolean} [enable_query_expansion=true] - Enable query expansion
 */

/**
 * @typedef {Object} SearchResult
 * @property {Startup} startup - Startup data
 * @property {number} score - Relevance score
 */

/**
 * @typedef {Object} SearchResponse
 * @property {string} query - Original search query
 * @property {number} total_results - Total number of results
 * @property {SearchResult[]} results - Array of search results
 * @property {number} processing_time_ms - Processing time in milliseconds
 */

/**
 * @typedef {Object} VerticalInfo
 * @property {string} id - Vertical identifier
 * @property {string} name - Display name
 * @property {string[]} keywords - Related keywords
 * @property {string} description - Vertical description
 */

/**
 * @typedef {Object} Stats
 * @property {number} total_startups - Total number of startups
 * @property {Object.<string, number>} verticals - Vertical distribution
 * @property {string} last_updated - Last index update timestamp
 */

export {};
