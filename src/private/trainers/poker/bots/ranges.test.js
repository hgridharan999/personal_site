import { describe, it, expect } from 'vitest';
import { parseCards } from '../engine/cards.js';
import { COMBO_COUNT, CLASS_COMBOS, parseClass, comboOf } from './handClass.js';
import { emptyProfile } from './contract.js';
import { preflopSpot } from './situation.js';
import {
  DEFAULT_TYPE, typeFromProfile, preflopLikelihoods, actionLikelihood, reweightPostflop, createRangeTracker,
} from './ranges.js';
import { contextAfter } from './testHands.js';

const c = parseClass;
const classMass = (range, name) => CLASS_COMBOS[c(name)].reduce((sum, i) => sum + range[i], 0);

describe('player types', () => {
  it('uses defaults until 30 observations, then vpip and aggression', () => {
    expect(typeFromProfile(null)).toEqual(DEFAULT_TYPE);
    const p = emptyProfile();
    p.stats.vpip = { value: 0.5, n: 29 };
    expect(typeFromProfile(p).looseness).toBe(1);
    p.stats.vpip = { value: 0.5, n: 30 };
    p.stats.aggFreq = { value: 0.7, n: 40 };
    expect(typeFromProfile(p)).toEqual({ looseness: 2, aggression: 0.7 });
  });
});

describe('preflopLikelihoods', () => {
  it('an UTG open makes AA likely and 72o nearly impossible; a looser type widens', () => {
    const c0 = contextAfter([]);
    const spot = preflopSpot(c0.view, [], 2);
    const like = preflopLikelihoods(spot, 'raise', DEFAULT_TYPE);
    expect(like[c('AA')]).toBe(1);
    expect(like[c('72o')]).toBeCloseTo(0.03, 5);
    const loose = preflopLikelihoods(spot, 'raise', { looseness: 2, aggression: 0.35 });
    expect(loose[c('K9s')]).toBeGreaterThan(like[c('K9s')]);
  });
});

describe('actionLikelihood', () => {
  it('bets favour strong hands and draws; checks favour weaker hands; calls favour the middle', () => {
    expect(actionLikelihood('bet', 0.95, false, false, 0.35, false)).toBeGreaterThan(0.9);
    expect(actionLikelihood('bet', 0.5, false, false, 0.35, false)).toBeLessThan(0.3);
    expect(actionLikelihood('bet', 0.5, true, false, 0.35, false)).toBeGreaterThan(0.3);
    expect(actionLikelihood('check', 0.95, false, false, 0.35, false)).toBeLessThan(actionLikelihood('check', 0.2, false, false, 0.35, false));
    expect(actionLikelihood('call', 0.6, false, true, 0.35, false)).toBeGreaterThan(actionLikelihood('call', 0.1, false, true, 0.35, false));
    expect(actionLikelihood('call', 0.1, false, false, 0.35, false)).toBe(1);
  });
});

describe('reweightPostflop', () => {
  it('a bet on Ah Kd 7c shifts weight toward AK and sets, away from 65o', () => {
    const board = parseCards('AhKd7c');
    const range = new Float32Array(COMBO_COUNT).fill(1);
    const before = { ak: classMass(range, 'AKo'), low: classMass(range, '65o') };
    reweightPostflop(range, board, 'bet', false, DEFAULT_TYPE);
    expect(classMass(range, 'AKo') / before.ak).toBeGreaterThan(0.9);
    expect(classMass(range, '65o') / before.low).toBeLessThan(0.4);
    expect(range[comboOf(...parseCards('7d7s'))]).toBeGreaterThan(0.9);
  });
});

describe('createRangeTracker', () => {
  const typeOf = () => DEFAULT_TYPE;

  it('builds preflop ranges for players who acted and any-hand ranges for the rest', () => {
    const cx = contextAfter(['r 2 5', 'f 3']);
    const tracker = createRangeTracker();
    const { classWeights, comboRanges } = tracker.track(cx.view, cx.seatEvents, cx.seat, typeOf);
    expect(comboRanges.size).toBe(0);
    expect([...classWeights.keys()].sort()).toEqual([0, 1, 2, 5]);
    expect(classWeights.get(2)[c('AA')]).toBe(1);
    expect(classWeights.get(2)[c('72o')]).toBeLessThan(0.05);
    expect(classWeights.get(5)[c('72o')]).toBe(1);
  });

  it('builds combo ranges on the flop with card removal and follows postflop actions incrementally', () => {
    const steps = ['r 2 5', 'f 3', 'c 4', 'f 5', 'f 0', 'f 1', 'B Kh8d4s', 'b 2 8'];
    const cx = contextAfter(steps);
    expect(cx.seat).toBe(4);
    const tracker = createRangeTracker();
    const first = tracker.track(cx.view, cx.seatEvents, cx.seat, typeOf);
    const utg = first.comboRanges.get(2);
    expect([...first.comboRanges.keys()]).toEqual([2]);
    expect(utg[comboOf(...parseCards('JcTd'))]).toBe(0); // hero holds Jc
    expect(utg[comboOf(...parseCards('KsKh'))]).toBe(0); // Kh is on the board
    const kk = utg[comboOf(...parseCards('KsKc'))];
    const weak = utg[comboOf(...parseCards('QsJs'))];
    expect(kk).toBeGreaterThan(weak);

    // incremental: track the log without the last bet, then the full log, on one tracker
    const incremental = createRangeTracker();
    const before = incremental.track(cx.view, cx.seatEvents.slice(0, -1), cx.seat, typeOf).comboRanges.get(2).slice();
    const after = incremental.track(cx.view, cx.seatEvents, cx.seat, typeOf).comboRanges.get(2);
    expect(after).toEqual(utg);
    expect(after).not.toEqual(before);
  });
});
