import { describe, expect, it } from 'vitest';

import * as content from './content';
import { yearsOf } from './years';

const nb = (text) => text.replaceAll(' ', ' ');

describe('yearsOf', () => {
  it('shows a range inside one year as that year', () => {
    expect(yearsOf(nb('Jul 2026 – Sep 2026'))).toBe('2026');
  });

  it('keeps an open range open', () => {
    expect(yearsOf(nb('Feb 2026 – now'))).toBe(nb('2026 – now'));
  });

  it('shows a range across a new year as both years', () => {
    expect(yearsOf(nb('Dec 2025 – Jan 2026'))).toBe(nb('2025 – 2026'));
  });

  it('shows a single month as its year', () => {
    expect(yearsOf(nb('Sep 2026'))).toBe('2026');
  });

  it('reads a hyphen or an em dash as a range too, never dropping its end', () => {
    expect(yearsOf('Sep 2025 - now')).toBe(nb('2025 – now'));
    expect(yearsOf('Sep 2025 \u2014 now')).toBe(nb('2025 – now'));
  });

  it('shows a missing date as nothing, as it rendered before', () => {
    expect(yearsOf(undefined)).toBe('');
    expect(yearsOf('')).toBe('');
  });

  it('reads ordinary spaces as well as non-breaking ones', () => {
    expect(yearsOf('Sep 2025 – now')).toBe(nb('2025 – now'));
  });

  it('turns every date on the page into years that never break across lines', () => {
    const rows = [content.EXPERIENCE, content.ON_CAMPUS, content.PROJECTS, content.OFF_CLOCK].flatMap((section) => section.rows);
    const dates = [...rows.map((row) => row.when), ...content.WRITING.essays.map((essay) => essay.when)].filter(Boolean);
    expect(dates.length).toBeGreaterThan(10);
    for (const date of dates) expect(yearsOf(date), date).toMatch(/^\d{4}( – (\d{4}|now))?$/);
  });
});
