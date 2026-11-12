import { describe, expect, it } from 'vitest';
import { addDays, nightDate, weekStart } from './dates.js';

describe('nightDate', () => {
  it.each([
    ['2026-11-12T23:00:00Z', '2026-11-12'],
    ['2026-11-13T07:30:00Z', '2026-11-12'],
    ['2026-11-13T08:30:00Z', '2026-11-13'],
    ['2026-11-01T07:30:00Z', '2026-10-31'],
    ['2026-03-08T07:30:00Z', '2026-03-08'],
    ['2026-11-13T01:20:00Z', '2026-11-12'],
  ])('%s -> %s', (iso, expected) => {
    expect(nightDate(new Date(iso))).toBe(expected);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-11-12', 0)).toBe('2026-11-12');
  });
});

describe('weekStart', () => {
  it('returns the Monday', () => {
    expect(weekStart('2026-11-12')).toBe('2026-11-09');
    expect(weekStart('2026-11-15')).toBe('2026-11-09');
    expect(weekStart('2026-11-09')).toBe('2026-11-09');
  });
});
