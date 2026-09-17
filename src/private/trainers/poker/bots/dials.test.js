// src/private/trainers/poker/bots/dials.test.js
import { describe, it, expect } from 'vitest';
import { emptyProfile } from './contract.js';
import { DIALS, defaultDials, resolveDials, clampDial, ARCHETYPES } from './dials.js';
import { adaptDials, EXPLOIT_RULES, ADAPT_MIN_OBS } from './adapt.js';

const profileWith = (stats) => {
  const p = emptyProfile();
  for (const [k, [value, n]] of Object.entries(stats)) p.stats[k] = { value, n };
  return p;
};

describe('dials', () => {
  it('defines 20-40 unique dials with defaults inside their bounds', () => {
    expect(DIALS.length).toBeGreaterThanOrEqual(20);
    expect(DIALS.length).toBeLessThanOrEqual(40);
    expect(new Set(DIALS.map((d) => d.key)).size).toBe(DIALS.length);
    for (const d of DIALS) {
      expect(d.min).toBeLessThan(d.max);
      expect(d.def).toBeGreaterThanOrEqual(d.min);
      expect(d.def).toBeLessThanOrEqual(d.max);
      expect(d.meaning.length).toBeGreaterThan(5);
    }
  });

  it('resolves partial dials: defaults, clamping, unknown keys dropped', () => {
    const r = resolveDials({ bluffMul: 99, openUTG: 'x', nope: 1 });
    expect(r.bluffMul).toBe(2.5);
    expect(r.openUTG).toBe(1);
    expect(r).not.toHaveProperty('nope');
    expect(Object.keys(r).length).toBe(DIALS.length);
    expect(resolveDials()).toEqual(defaultDials());
    expect(clampDial('cbetFlop', -1)).toBe(0);
  });

  it('ships four resolved archetypes', () => {
    expect(Object.keys(ARCHETYPES).sort()).toEqual(['loose-aggressive', 'loose-passive', 'tight-aggressive', 'tight-passive']);
    for (const dials of Object.values(ARCHETYPES)) expect(resolveDials(dials)).toEqual(dials);
    expect(ARCHETYPES['loose-aggressive'].bluffMul).toBeGreaterThan(ARCHETYPES['tight-passive'].bluffMul);
  });
});

describe('adaptDials', () => {
  it('does nothing without a profile or below 30 observations', () => {
    const d = defaultDials();
    expect(adaptDials(d, null)).toEqual(d);
    expect(ADAPT_MIN_OBS).toBe(30);
    expect(adaptDials(d, profileWith({ foldToCbetFlop: [0.9, 29] }))).toEqual(d);
  });

  it('c-bets more against a player who over-folds to c-bets, capped and scaled by adaptStrength', () => {
    const d = { ...defaultDials(), adaptStrength: 1 };
    const small = adaptDials(d, profileWith({ foldToCbetFlop: [0.6, 30] }));
    expect(small.cbetFlop).toBeCloseTo(d.cbetFlop + 1.5 * 0.05, 10);
    const huge = adaptDials(d, profileWith({ foldToCbetFlop: [1, 500] }));
    expect(huge.cbetFlop).toBeCloseTo(d.cbetFlop + 0.35, 10);
    const half = adaptDials({ ...d, adaptStrength: 0.5 }, profileWith({ foldToCbetFlop: [1, 500] }));
    expect(half.cbetFlop).toBeCloseTo(d.cbetFlop + 0.175, 10);
    const none = adaptDials({ ...d, adaptStrength: 0 }, profileWith({ foldToCbetFlop: [1, 500] }));
    expect(none).toEqual({ ...d, adaptStrength: 0 });
  });

  it('bluffs less and value bets thinner against a player who calls rivers', () => {
    const d = { ...defaultDials(), adaptStrength: 1 };
    const a = adaptDials(d, profileWith({ foldToRiverBet: [0.1, 100] }));
    expect(a.bluffMul).toBeCloseTo(d.bluffMul - 0.75, 10);
    expect(a.valueThresh).toBeCloseTo(d.valueThresh - 0.05, 10);
  });

  it('defends wider against a frequent 3-bettor and clamps to dial bounds', () => {
    const d = { ...defaultDials(), adaptStrength: 1, vs3betCall: 1.7 };
    const a = adaptDials(d, profileWith({ threeBet: [0.6, 200] }));
    expect(a.vs3betCall).toBe(1.8);
    expect(a.fourBet).toBeCloseTo(1.6, 10);
    expect(d.vs3betCall).toBe(1.7);
  });

  it('every rule names a real stat and dial', () => {
    const stats = Object.keys(emptyProfile().stats);
    const dials = DIALS.map((x) => x.key);
    for (const rule of EXPLOIT_RULES) {
      expect(stats).toContain(rule.stat);
      expect(dials).toContain(rule.dial);
      expect(rule.cap).toBeGreaterThan(0);
    }
  });
});
