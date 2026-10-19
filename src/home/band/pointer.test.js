import { describe, expect, it } from 'vitest';
import { createTap } from './pointer.js';

describe('createTap', () => {
  it('starts out showing nothing (age <= 0)', () => {
    expect(createTap().data[2]).toBeLessThanOrEqual(0);
  });

  it('press() starts a ring at the point, with age just above 0 so the shader draws it', () => {
    const tap = createTap();
    tap.press(0.25, 0.5);
    expect([...tap.data].map((v) => +v.toFixed(3))).toEqual([0.25, 0.5, 0.001, 1]);
  });

  it('ages with the frame time and ends after 5 seconds, matching the shader window', () => {
    const tap = createTap();
    tap.press(0, 0);
    tap.advance(2);
    expect(tap.data[2]).toBeCloseTo(2.001, 6);
    tap.advance(2.9);
    expect(tap.data[2]).toBeGreaterThan(0);
    tap.advance(0.2);
    expect(tap.data[2]).toBeLessThanOrEqual(0);
  });

  it('does not advance a ring that is not running, and clear() ends one', () => {
    const tap = createTap();
    tap.advance(1);
    expect(tap.data[2]).toBe(-1);
    tap.press(0, 0);
    tap.clear();
    tap.advance(1);
    expect(tap.data[2]).toBe(-1);
  });
});
