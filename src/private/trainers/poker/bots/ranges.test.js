import { describe, it, expect } from 'vitest';
import { parseCards } from '../engine/cards.js';
import { reduceHand } from '../engine/handState.js';
import { viewFor, eventsFor } from '../engine/view.js';
import { COMBO_COUNT, CLASS_COMBOS, parseClass, comboOf } from './handClass.js';
import { emptyProfile } from './contract.js';
import { preflopSpot } from './situation.js';
import {
  DEFAULT_TYPE, typeFromProfile, preflopLikelihoods, actionLikelihood, reweightPostflop, createRangeTracker,
} from './ranges.js';
import { contextAfter, buildLog } from './testHands.js';

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

  it('gives premiums a lower open-limp likelihood than middling suited hands', () => {
    const c0 = contextAfter([]);
    const spot = preflopSpot(c0.view, [], 2);
    const like = preflopLikelihoods(spot, 'call', DEFAULT_TYPE);
    expect(like[c('AA')]).toBeLessThan(like[c('JTs')]);
    expect(like[c('KK')]).toBeLessThan(like[c('JTs')]);
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

  it('gives every combo the same weight on a river where all hands play the board', () => {
    const board = parseCards('AsKdQhJcTs'); // A-K-Q-J-T straight is already on the board
    const range = new Float32Array(COMBO_COUNT).fill(1);
    reweightPostflop(range, board, 'bet', false, DEFAULT_TYPE);
    const weights = ['2c3d', '4h5h', '7d8c', '9c9d', '2h2d'].map((s) => range[comboOf(...parseCards(s))]);
    for (const w of weights) expect(w).toBeCloseTo(weights[0], 5);
  });

  it('gives suit variants of one class that make the same hand equal weight after a bet', () => {
    const board = parseCards('Kh7d2c'); // rainbow flop: no flush is live, so suit alone breaks no tie
    const range = new Float32Array(COMBO_COUNT).fill(1);
    reweightPostflop(range, board, 'bet', false, DEFAULT_TYPE);
    const qj = CLASS_COMBOS[c('QJo')].map((i) => range[i]);
    expect(Math.max(...qj) - Math.min(...qj)).toBeLessThan(1e-6);
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

  it('reuses the incremental path for fresh eventsFor copies of a growing log with the same start', () => {
    const heroSeat = 4;
    const prefixSteps = ['r 2 5', 'f 3', 'c 4', 'f 5', 'f 0', 'f 1', 'B Kh8d4s'];
    const fullSteps = [...prefixSteps, 'b 2 8'];
    const tracker = createRangeTracker();

    const eventsA = buildLog(prefixSteps);
    const viewA = viewFor(reduceHand(eventsA), heroSeat);
    const first = tracker.track(viewA, eventsFor(eventsA, heroSeat), heroSeat, typeOf);
    expect(first.rebuilt).toBe(true);

    // A second, independently-built copy of the same-length log (a fresh array of fresh event
    // objects, as every call to eventsFor produces) must still hit the incremental path.
    const second = tracker.track(viewA, eventsFor(eventsA, heroSeat), heroSeat, typeOf);
    expect(second.rebuilt).toBe(false);

    // A longer log sharing the same start, again handed in as an entirely separate eventsFor copy.
    const eventsB = buildLog(fullSteps);
    const viewB = viewFor(reduceHand(eventsB), heroSeat);
    const third = tracker.track(viewB, eventsFor(eventsB, heroSeat), heroSeat, typeOf);
    expect(third.rebuilt).toBe(false);
  });

  it('rebuilds instead of reusing a stale hand that shares button, stacks and seat but not hole cards', () => {
    // Hand A and hand B both use the default 6-handed, all-200-stack table (so button and starting
    // seats/stacks repeat, as they constantly do in the duplicate-deal arena and for a long-lived
    // brain cached per persona), and it happens that the same seat is next to act in both. Only the
    // dealt hole cards differ. Reusing hand A's cached ranges for hand B would leak a stale board
    // and dead cards; the tracker must instead notice the identity doesn't match and rebuild.
    const A = contextAfter(['r 2 5', 'c 3', 'c 4', 'c 5', 'c 0', 'c 1', 'B Kh8d4s', 'k 0']);
    const holesB = ['QsJs', '3h3c', '5c6d', 'TdTs', '8c7c', 'AdKc'];
    const B = contextAfter(
      ['c 2', 'c 3', 'c 4', 'c 5', 'c 0', 'k 1', 'B 2d9dJh', 'k 0', 'k 1', 'k 2', 'k 3', 'k 4', 'k 5', 'B 4h', 'k 0'],
      { holes: holesB },
    );
    expect(A.seat).toBe(B.seat);

    const tracker = createRangeTracker();
    tracker.track(A.view, A.seatEvents, A.seat, typeOf);
    const reused = tracker.track(B.view, B.seatEvents, B.seat, typeOf);
    expect(reused.rebuilt).toBe(true);

    const fresh = createRangeTracker().track(B.view, B.seatEvents, B.seat, typeOf);
    expect([...fresh.comboRanges.keys()].sort()).toEqual([...reused.comboRanges.keys()].sort());
    for (const [seat, range] of fresh.comboRanges) expect(reused.comboRanges.get(seat)).toEqual(range);
  });

  it('returns copies: mutating a returned array does not corrupt tracked state', () => {
    const steps = ['r 2 5', 'f 3', 'c 4', 'f 5', 'f 0', 'f 1', 'B Kh8d4s', 'b 2 8'];
    const cx = contextAfter(steps);
    const tracker = createRangeTracker();
    const first = tracker.track(cx.view, cx.seatEvents, cx.seat, typeOf);
    const untouched = first.comboRanges.get(2).slice();
    first.comboRanges.get(2).fill(0);
    const second = tracker.track(cx.view, cx.seatEvents, cx.seat, typeOf);
    expect(second.comboRanges.get(2)).toEqual(untouched);
  });
});
