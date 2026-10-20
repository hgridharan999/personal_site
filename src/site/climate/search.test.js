import { describe, expect, it } from 'vitest';
import {
  EMPTY_FORM, EXAMPLES, VERTICALS, activeCount, announcement, cleanYear, errorText, formatFunding,
  formatScore, humanize, metaParts, sameFilters, toParams, topVerticals,
} from './search';

describe('toParams', () => {
  it('maps an empty form to no filters, sending null for the vertical like the old page', () => {
    expect(toParams(EMPTY_FORM)).toEqual({
      vertical_filter: null, founded_year_min: undefined, founded_year_max: undefined,
    });
  });

  it('turns four-digit years into numbers', () => {
    const params = toParams({ vertical: 'clean_energy', yearMin: '2015', yearMax: '2024' });
    expect(params).toEqual({
      vertical_filter: 'clean_energy', founded_year_min: 2015, founded_year_max: 2024,
    });
  });

  it('ignores a half-typed year', () => {
    const params = toParams({ vertical: null, yearMin: '20', yearMax: '1' });
    expect(params.founded_year_min).toBeUndefined();
    expect(params.founded_year_max).toBeUndefined();
  });
});

describe('cleanYear', () => {
  it('keeps at most four digits', () => {
    expect(cleanYear('20a19x5')).toBe('2019');
    expect(cleanYear(null)).toBe('');
  });
});

describe('sameFilters', () => {
  it('treats a half-typed year as no change', () => {
    expect(sameFilters(EMPTY_FORM, { ...EMPTY_FORM, yearMin: '20' })).toBe(true);
  });

  it('notices a new vertical or a completed year', () => {
    expect(sameFilters(EMPTY_FORM, { ...EMPTY_FORM, vertical: 'clean_energy' })).toBe(false);
    expect(sameFilters({ ...EMPTY_FORM, yearMin: '201' }, { ...EMPTY_FORM, yearMin: '2015' })).toBe(false);
  });
});

describe('activeCount', () => {
  it('counts the vertical and each complete year', () => {
    expect(activeCount(EMPTY_FORM)).toBe(0);
    expect(activeCount({ vertical: 'x', yearMin: '2010', yearMax: '20' })).toBe(2);
  });
});

describe('humanize', () => {
  it('sentence-cases a snake_case id', () => {
    expect(humanize('carbon_management')).toBe('Carbon management');
    expect(humanize('')).toBe('');
    expect(humanize(undefined)).toBe('');
  });
});

describe('formatFunding', () => {
  it('scales to B, M and K with one decimal', () => {
    expect(formatFunding(2_500_000_000)).toBe('$2.5B');
    expect(formatFunding(12_000_000)).toBe('$12.0M');
    expect(formatFunding(450_000)).toBe('$450.0K');
    expect(formatFunding(900)).toBe('$900');
  });

  it('calls zero, missing and bad amounts undisclosed', () => {
    for (const bad of [0, undefined, null, NaN, -5]) expect(formatFunding(bad)).toBe('Undisclosed');
  });
});

describe('formatScore', () => {
  it('rounds to a percent and tolerates a missing score', () => {
    expect(formatScore(0.923)).toBe('92%');
    expect(formatScore(1)).toBe('100%');
    expect(formatScore(undefined)).toBe('');
  });
});

describe('metaParts', () => {
  it('lists vertical, headquarters, founding year and funding in order', () => {
    expect(metaParts({
      primary_vertical: 'clean_energy', headquarters_location: 'Austin, TX',
      founded_year: 2019, total_funding_usd: 12_000_000,
    })).toEqual(['Clean energy', 'Austin, TX', 'Founded 2019', '$12.0M raised']);
  });

  it('drops what is missing and never says "Undisclosed raised"', () => {
    expect(metaParts({ primary_vertical: 'clean_energy', total_funding_usd: 0 }))
      .toEqual(['Clean energy', 'Funding undisclosed']);
    expect(metaParts({})).toEqual([]);
  });
});

describe('topVerticals', () => {
  it('sorts, limits to five and scales bars to the largest count', () => {
    const rows = topVerticals({ a: 10, b: 40, c: 20, d: 5, e: 1, f: 30 });
    expect(rows.map((r) => r.id)).toEqual(['b', 'f', 'c', 'a', 'd']);
    expect(rows[0].share).toBe(100);
    expect(rows[1].share).toBe(75);
    expect(rows[0].name).toBe('B');
  });

  it('copes with a missing or empty map', () => {
    expect(topVerticals(undefined)).toEqual([]);
    expect(topVerticals({})).toEqual([]);
  });
});

describe('constants', () => {
  it('has twelve verticals with unique ids and six example searches', () => {
    expect(VERTICALS).toHaveLength(12);
    expect(new Set(VERTICALS.map((v) => v.id)).size).toBe(12);
    expect(EXAMPLES).toHaveLength(6);
  });
});

describe('errorText', () => {
  it('turns each browser dropped-connection message into one plain sentence', () => {
    for (const raw of ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed']) {
      expect(errorText(raw)).toMatch(/^Couldn.t reach the search server/);
    }
  });

  it('never shows a server message, even a malformed one', () => {
    for (const raw of ['Search failed: Internal Server Error', '[object Object]', '', undefined]) {
      expect(errorText(raw)).toBe('The search server ran into a problem. Try again in a moment.');
    }
  });
});

describe('announcement', () => {
  const base = { query: 'solar', loading: false, error: null, count: 3 };

  it('reads one sentence per state, in the same priority as the page', () => {
    expect(announcement({ ...base, query: '' })).toBe('');
    expect(announcement({ ...base, loading: true, error: 'x' })).toBe('Searching the index');
    expect(announcement({ ...base, error: 'Failed to fetch' })).toMatch(/^Search failed\. Couldn.t reach/);
    expect(announcement({ ...base, count: 0 })).toBe('No startups matched "solar".');
    expect(announcement({ ...base, count: 1 })).toBe('1 startup found');
    expect(announcement(base)).toBe('3 startups found');
  });
});
