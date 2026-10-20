import { describe, it, expect } from 'vitest';

import { formatLongDate, formatMonthYear } from './format';

describe('formatLongDate', () => {
  it('spells out a date-only string', () => {
    expect(formatLongDate('2026-10-06')).toBe('October 6, 2026');
    expect(formatLongDate('2026-03-15')).toBe('March 15, 2026');
  });

  it('keeps the calendar day whatever the machine time zone is', () => {
    // UTC midnight would read as the 31st in any zone west of Greenwich.
    expect(formatLongDate('2026-01-01')).toBe('January 1, 2026');
    expect(formatLongDate('2026-01-01T00:00:00Z')).toBe('January 1, 2026');
    expect(formatLongDate('2026-12-31T23:59:59Z')).toBe('December 31, 2026');
  });

  it('accepts a Date, which is what front matter parsers produce', () => {
    expect(formatLongDate(new Date(Date.UTC(2026, 9, 6)))).toBe('October 6, 2026');
  });

  it('returns unreadable input as given, and nothing for nothing', () => {
    expect(formatLongDate('sometime soon')).toBe('sometime soon');
    expect(formatLongDate('Fall 2026')).toBe('Fall 2026'); // V8 would otherwise read this as January 1
    expect(formatLongDate('')).toBe('');
    expect(formatLongDate(null)).toBe('');
    expect(formatLongDate(undefined)).toBe('');
  });
});

describe('formatMonthYear', () => {
  it('shortens a date to month and year', () => {
    expect(formatMonthYear('2026-10-06')).toBe('Oct 2026');
    expect(formatMonthYear('2026-10')).toBe('Oct 2026');
    expect(formatMonthYear('2026-01-31T12:00:00Z')).toBe('Jan 2026');
  });

  it('falls back to the raw value when it cannot be read', () => {
    expect(formatMonthYear('Fall 2026')).toBe('Fall 2026');
    expect(formatMonthYear(null)).toBe('');
  });
});
