// Pure helpers for the climate search page. Nothing here touches React or the network, so the
// rules (what counts as a year, how money reads, what the meta line says) are testable in node.

export const VERTICALS = [
  { id: 'carbon_management', name: 'Carbon Management' },
  { id: 'clean_energy', name: 'Clean Energy' },
  { id: 'energy_storage', name: 'Energy Storage' },
  { id: 'green_transportation', name: 'Green Transportation' },
  { id: 'sustainable_agriculture', name: 'Sustainable Agriculture' },
  { id: 'built_environment', name: 'Built Environment' },
  { id: 'circular_economy', name: 'Circular Economy' },
  { id: 'climate_fintech', name: 'Climate Fintech' },
  { id: 'water_ocean', name: 'Water & Ocean' },
  { id: 'industrial_decarbonization', name: 'Industrial Decarbonization' },
  { id: 'climate_adaptation', name: 'Climate Adaptation' },
  { id: 'grid_energy_management', name: 'Grid & Energy Management' },
];

export const EXAMPLES = [
  'solar energy', 'carbon capture', 'EV charging',
  'vertical farming', 'energy storage', 'green hydrogen',
];

export const EMPTY_FORM = Object.freeze({ vertical: null, yearMin: '', yearMax: '' });

/** Keeps only digits, at most four: the year inputs are text fields so the browser's number
 *  spinner and scroll-wheel stepping stay out of the way. */
export const cleanYear = (raw) => String(raw ?? '').replace(/\D/g, '').slice(0, 4);

// A half-typed "20" must not become a filter: as a maximum it would hide every startup for
// the moment it takes to type the rest. Only a full four-digit year counts.
const toYear = (text) => (/^\d{4}$/.test(text) ? Number.parseInt(text, 10) : undefined);

/** The filter form as the API's search parameters. Unset years are undefined so climateApi drops them. */
export function toParams(form) {
  return {
    vertical_filter: form.vertical ?? null,
    founded_year_min: toYear(form.yearMin),
    founded_year_max: toYear(form.yearMax),
  };
}

/** True when two forms send the same filters, so a half-typed year does not repeat a search. */
export function sameFilters(a, b) {
  const x = toParams(a);
  const y = toParams(b);
  return x.vertical_filter === y.vertical_filter
    && x.founded_year_min === y.founded_year_min
    && x.founded_year_max === y.founded_year_max;
}

/** How many filters are set; the phone disclosure shows it so hidden filters are never a surprise. */
export function activeCount(form) {
  return [form.vertical, toYear(form.yearMin), toYear(form.yearMax)].filter(Boolean).length;
}

/** "carbon_management" becomes "Carbon management". */
export function humanize(id) {
  const text = String(id ?? '').replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "$12.0M". Zero, missing and non-numeric amounts are undisclosed. */
export function formatFunding(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return 'Undisclosed';
  if (amount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (amount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (amount >= 1e3) return `$${(amount / 1e3).toFixed(1)}K`;
  return `$${amount}`;
}

/** 0.923 becomes "92%". Empty when the API sent no score. */
export function formatScore(score) {
  return Number.isFinite(score) ? `${Math.round(score * 100)}%` : '';
}

// The old card printed "Undisclosed raised" for a zero; this reads as a sentence.
function fundingPart(funding) {
  if (!Number.isFinite(funding)) return '';
  return funding > 0 ? `${formatFunding(funding)} raised` : 'Funding undisclosed';
}

/** The facts under a result's description, in reading order, with the missing ones left out. */
export function metaParts(startup) {
  return [
    humanize(startup.primary_vertical),
    startup.headquarters_location,
    startup.founded_year ? `Founded ${startup.founded_year}` : '',
    fundingPart(startup.total_funding_usd),
  ].filter(Boolean);
}

/** The biggest verticals with bars scaled to the largest, so the top row always fills its track. */
// Chrome, Firefox and Safari each word a dropped connection differently
const OFFLINE = /failed to fetch|networkerror|load failed|network request failed/i;

/** What a visitor reads when a search fails. The raw message is for the console, not the page. */
export function errorText(message) {
  return OFFLINE.test(message ?? '')
    ? 'Couldn’t reach the search server. Check your connection and try again.'
    : 'The search server ran into a problem. Try again in a moment.';
}

/** The one sentence the page's status region reads out for each state. */
export function announcement({ query, loading, error, count }) {
  if (!query) return '';
  if (loading) return 'Searching the index';
  if (error) return `Search failed. ${errorText(error)}`;
  if (count === 0) return `No startups matched "${query}".`;
  return `${count} ${count === 1 ? 'startup' : 'startups'} found`;
}

export function topVerticals(verticals, limit = 5) {
  const rows = Object.entries(verticals ?? {})
    .filter(([, count]) => Number.isFinite(count))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  const max = rows[0]?.[1] || 1;
  return rows.map(([id, count]) => ({
    id,
    name: humanize(id),
    count,
    share: Math.round((count / max) * 100),
  }));
}
