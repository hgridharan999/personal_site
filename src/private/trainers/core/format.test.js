import { describe, it, expect } from 'vitest';
import { formatSeconds, formatClock, formatPercent, formatDay } from './format.js';

describe('format', () => {
  it('formatSeconds', () => {
    expect(formatSeconds(2140)).toBe('2.14 s');
    expect(formatSeconds(2140, 1)).toBe('2.1 s');
    expect(formatSeconds(null)).toBe('—');
  });
  it('formatClock', () => {
    expect(formatClock(452000)).toBe('7:32');
    expect(formatClock(480000)).toBe('8:00');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
  it('formatPercent', () => {
    expect(formatPercent(0.876)).toBe('88%');
    expect(formatPercent(null)).toBe('—');
  });
  it('formatDay', () => {
    expect(formatDay('2026-09-14T12:00:00.000Z')).toMatch(/Sep/);
  });
});
