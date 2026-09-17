import { describe, it, expect } from 'vitest';
import { reduceHand } from '../engine/handState.js';
import { buildLog } from '../bots/testHands.js';
import { COMBO_COUNT } from '../bots/handClass.js';
import {
  VAGUE_LIVE_SHARE, VAGUE_EVENNESS, LIVE_WEIGHT_FLOOR, rangeSpread, isVagueRange, dominantOpponent, isConfident,
} from './confidence.js';

const noDead = new Uint8Array(52);

describe('range spread', () => {
  it('uses the documented thresholds', () => {
    expect([VAGUE_LIVE_SHARE, VAGUE_EVENNESS, LIVE_WEIGHT_FLOOR]).toEqual([0.6, 0.85, 0.05]);
  });

  it('calls a uniform range vague', () => {
    const uniform = new Float32Array(COMBO_COUNT).fill(1);
    expect(rangeSpread(uniform, noDead)).toEqual({ liveShare: 1, evenness: expect.closeTo(1, 6) });
    expect(isVagueRange(uniform, noDead)).toBe(true);
  });

  it('does not call a narrow or a skewed range vague', () => {
    const narrow = new Float32Array(COMBO_COUNT);
    narrow.fill(1, 0, 132);
    expect(rangeSpread(narrow, noDead).liveShare).toBeCloseTo(132 / COMBO_COUNT, 10);
    expect(isVagueRange(narrow, noDead)).toBe(false);
    const skewed = Float32Array.from({ length: COMBO_COUNT }, (_, i) => (i % 2 === 0 ? 1 : 0.06));
    expect(rangeSpread(skewed, noDead).liveShare).toBe(1);
    expect(rangeSpread(skewed, noDead).evenness).toBeLessThan(VAGUE_EVENNESS);
    expect(isVagueRange(skewed, noDead)).toBe(false);
    expect(rangeSpread(new Float32Array(COMBO_COUNT), noDead)).toEqual({ liveShare: 0, evenness: 0 });
  });
});

describe('dominantOpponent', () => {
  it('is the live opponent with the latest bet or raise', () => {
    const steps = ['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1'];
    const events = buildLog(steps);
    expect(dominantOpponent(reduceHand(events), events, 1)).toBe(5);
  });

  it('is the live opponent who put in the most chips when nobody raised, lowest seat on ties', () => {
    const events = buildLog(['c 2', 'f 3', 'f 4', 'f 5', 'c 0', 'k 1', 'B Kh8d4s']);
    expect(dominantOpponent(reduceHand(events), events, 1)).toBe(0);
  });
});

describe('isConfident', () => {
  const opt = (mean, samples) => ({ mean, samples: Float64Array.from(samples) });
  it('is false for a vague range or when the top two are within one standard error', () => {
    expect(isConfident([opt(5, [5, 5, 5]), opt(4, [4, 4, 4])], { vagueRange: true })).toBe(false);
    expect(isConfident([opt(1, [3, -1, 5, -3]), opt(0, [0, 0, 0, 0])])).toBe(false);
  });

  it('is true when the gap exceeds the standard error or there is one option', () => {
    expect(isConfident([opt(5, [4, 6, 5]), opt(4, [3, 5, 4])])).toBe(true);
    expect(isConfident([opt(2, [2, 2])])).toBe(true);
  });
});
