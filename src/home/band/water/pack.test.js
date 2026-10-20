import { describe, expect, it } from 'vitest';
import { ENC, decodeSigned, encodeSigned, restBytes } from './pack.js';

describe('signed byte encoding', () => {
  it('encodes 0 to exactly 128 and decodes 128 to exactly 0, so a flat sea is exact', () => {
    expect(ENC.zero).toBe(128);
    expect(encodeSigned(0)).toBe(128);
    expect(decodeSigned(128)).toBe(0);
  });

  it('round-trips across [-1, 1] to within half a byte step', () => {
    for (let x = -1; x <= 1; x += 0.0137) {
      expect(Math.abs(decodeSigned(encodeSigned(x)) - x)).toBeLessThanOrEqual(0.5 / ENC.scale + 1e-12);
    }
  });

  it('is symmetric and uses the full range', () => {
    expect(encodeSigned(1)).toBe(255);
    expect(encodeSigned(-1)).toBe(1);
    for (const x of [0.1, 0.37, 0.9]) expect(encodeSigned(-x) - 128).toBe(-(encodeSigned(x) - 128));
  });

  it('clamps out-of-range values and turns NaN into a flat sea instead of a black byte', () => {
    expect(encodeSigned(7)).toBe(255);
    expect(encodeSigned(-7)).toBe(1);
    expect(encodeSigned(NaN)).toBe(128);
    expect(encodeSigned(Infinity)).toBe(255);
  });
});

describe('restBytes', () => {
  it('is w x h texels of (128, 128, 128, 0): no ripple, no slope, no foam', () => {
    const bytes = restBytes(3, 2);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(3 * 2 * 4);
    for (let i = 0; i < bytes.length; i += 4) expect([...bytes.slice(i, i + 4)]).toEqual([128, 128, 128, 0]);
  });
});
