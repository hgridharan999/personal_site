import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { parseCard, parseCards } from '../engine/cards.js';
import { buildLog } from '../bots/testHands.js';
import { callingStation } from '../bots/baselines.js';
import { getPersona } from '../bots/personas.js';
import { COMBO_COUNT, comboOf } from '../bots/handClass.js';
import { decisionPoints } from './spots.js';
import { optionsFor } from './options.js';
import {
  ROLLOUT_BRAIN_OPTIONS, HERO_MODEL, personaFor, heroRanges, prepareRange, sampleHoles, createRolloutWorld, rolloutOnce,
} from './rollout.js';

// Heads-up, seat 1 is the button. SB raises to 6, BB (hero, AhKh) 3-bets to 18, SB 4-bets to 40, BB calls.
// The hero flops a royal flush and the hand checks to the river.
const PREFLOP = ['r 1 6', 'r 0 18', 'r 1 40', 'c 0'];
const TO_RIVER = [...PREFLOP, 'B QhJhTh', 'k 0', 'k 1', 'B 2c', 'k 0', 'k 1', 'B 3d'];
const HU = { holes: ['AhKh', '9c9d'] };
const HU_LINEUP = [{ seat: 1, personaId: 'moss' }];
const riverPoint = (events) => decisionPoints(events, 0).find((p) => p.street === 'river');
const stationWorld = (events, point) => createRolloutWorld({ events, point, heroSeat: 0, lineup: HU_LINEUP, createBrainImpl: () => callingStation });

describe('personaFor', () => {
  it('uses the persona list and falls back to a default heuristic persona', () => {
    expect(ROLLOUT_BRAIN_OPTIONS).toEqual({ iterations: 24, budgetMs: Infinity });
    expect(HERO_MODEL.brain).toBe('heuristic');
    expect(personaFor('moss')).toBe(getPersona('moss'));
    expect(personaFor('nobody')).toMatchObject({ id: 'nobody', brain: 'heuristic', dials: {} });
  });
});

describe('heroRanges', () => {
  it('covers live opponents only, with dead combos removed postflop', () => {
    const pre = decisionPoints(buildLog(['r 2 5', 'f 3', 'f 4', 'c 5']), 5).at(-1);
    const preRanges = heroRanges(pre, 5);
    expect([...preRanges.keys()].sort()).toEqual([0, 1, 2]);
    for (const range of preRanges.values()) expect(range).toHaveLength(COMBO_COUNT);

    const point = riverPoint(buildLog([...TO_RIVER, 'k 0', 'k 1'], HU));
    const ranges = heroRanges(point, 0);
    expect([...ranges.keys()]).toEqual([1]);
    expect(ranges.get(1)[comboOf(parseCard('Qh'), parseCard('9s'))]).toBe(0);
    expect(ranges.get(1)[comboOf(parseCard('9c'), parseCard('9d'))]).toBeGreaterThan(0);
  });
});

describe('prepareRange and sampleHoles', () => {
  const dead = new Uint8Array(52);
  for (const c of parseCards('AhKhQhJhTh')) dead[c] = 1;

  it('falls back to every live combo for an empty range', () => {
    expect(prepareRange(new Float32Array(COMBO_COUNT), dead).combos).toHaveLength(1081);
  });

  it('deals ranged seats from their ranges, folded seats random live cards, with no shared cards', () => {
    const only = new Float32Array(COMBO_COUNT);
    only[comboOf(parseCard('9c'), parseCard('9d'))] = 1;
    const prepared = new Map([[1, prepareRange(only, dead)], [2, prepareRange(new Float32Array(COMBO_COUNT).fill(1), dead)]]);
    const { holes, used } = sampleHoles(prepared, [3, 4], dead, mulberry32(5));
    expect(holes.get(1)).toEqual([parseCard('9c'), parseCard('9d')]);
    const cards = [...holes.values()].flat();
    expect(new Set(cards).size).toBe(8);
    for (const c of cards) expect(dead[c]).toBe(0);
    expect(used.reduce((a, b) => a + b, 0)).toBe(13);
    expect(sampleHoles(prepared, [3, 4], dead, mulberry32(5)).holes).toEqual(holes);
  });
});

describe('rolloutOnce', () => {
  it('scores check and all-in exactly against a calling station, and fold as 0', () => {
    const events = buildLog([...TO_RIVER, 'k 0', 'k 1'], HU);
    const point = riverPoint(events);
    const world = stationWorld(events, point);
    expect(world.heroStack).toBe(160);
    const options = optionsFor(point.before, { chosen: point.event });
    const ev = (key, seed) => rolloutOnce(world, options.find((o) => o.key === key), seed);
    for (const seed of [1, 2, 3]) {
      expect(ev('check', seed)).toBe(80);
      expect(ev('bet:40', seed)).toBe(120);
      expect(ev('bet:160', seed)).toBe(240);
    }
    expect(rolloutOnce(world, { action: 'fold', size: null }, 9)).toBe(0);
  });

  it('plays a preflop spot to the end with persona brains, deterministically, without touching the log', () => {
    const events = buildLog(['r 2 5', 'f 3', 'f 4', 'c 5', 'f 0', 'f 1', 'B Kh8d4s', 'k 2', 'k 5', 'B 2d', 'k 2', 'k 5', 'B 3s', 'k 2', 'k 5']);
    const lineup = [0, 1, 2, 3, 4].map((seat, i) => ({ seat, personaId: ['moss', 'viper', 'duchess', 'rook', 'ink'][i] }));
    const point = decisionPoints(events, 5)[0];
    const snapshot = JSON.stringify(events);
    const world = createRolloutWorld({ events, point, heroSeat: 5, lineup });
    for (const option of [{ action: 'call', size: null }, { action: 'raise', size: 15 }]) {
      const a = rolloutOnce(world, option, 42);
      expect(Number.isInteger(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(-200);
      expect(rolloutOnce(world, option, 42)).toBe(a);
    }
    expect(JSON.stringify(events)).toBe(snapshot);
  });
});
