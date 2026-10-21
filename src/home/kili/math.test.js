import { describe, expect, it } from 'vitest';

import { bezier, clamp, easeInk, easeTide, mix3, rgb, smoothstep } from './math.js';

describe('clamp and smoothstep', () => {
  it('clamps to the range', () => {
    expect(clamp(-1, 0, 2)).toBe(0);
    expect(clamp(1, 0, 2)).toBe(1);
    expect(clamp(5, 0, 2)).toBe(2);
  });

  it('eases 0 to 1 between the edges, and works with the edges reversed', () => {
    expect(smoothstep(0, 10, -3)).toBe(0);
    expect(smoothstep(0, 10, 5)).toBe(0.5);
    expect(smoothstep(0, 10, 20)).toBe(1);
    expect(smoothstep(199, 188, 199)).toBe(0);
    expect(smoothstep(199, 188, 188)).toBe(1);
  });
});

describe('colour helpers', () => {
  it('mixes and prints colours', () => {
    expect(mix3([0, 0, 0], [100, 200, 50], 0.5)).toEqual([50, 100, 25]);
    expect(rgb([1.4, 2.6, 255])).toBe('rgb(1,3,255)');
  });
});

describe('easing', () => {
  it('the ink curve runs 0 to 1, is monotonic, and is symmetric about the middle', () => {
    expect(easeInk(0)).toBe(0);
    expect(easeInk(1)).toBe(1);
    expect(easeInk(0.5)).toBeCloseTo(0.5, 5);
    let prev = 0;
    for (let x = 0.02; x <= 1; x += 0.02) {
      const y = easeInk(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
    expect(easeInk(0.2) + easeInk(0.8)).toBeCloseTo(1, 4);
  });

  it('matches the CSS ease-in-out curve at a known point', () => {
    // cubic-bezier(0.42, 0, 0.58, 1) is "ease-in-out"; its value at x = 0.25 is about 0.129
    expect(bezier(0.42, 0, 0.58, 1)(0.25)).toBeCloseTo(0.129, 2);
  });

  it('the tide curve is a cosine ease that holds at both ends', () => {
    expect(easeTide(-1)).toBe(0);
    expect(easeTide(0)).toBe(0);
    expect(easeTide(0.5)).toBeCloseTo(0.5, 10);
    expect(easeTide(1)).toBeCloseTo(1, 10);
    expect(easeTide(3)).toBeCloseTo(1, 10);
  });
});
