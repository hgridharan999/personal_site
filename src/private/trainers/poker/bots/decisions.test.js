// src/private/trainers/poker/bots/decisions.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { hasChart, scaledFreqs, topShareWeights } from './charts.js';
import { ARCHETYPES, defaultDials } from './dials.js';
import { parseClass } from './handClass.js';
import { legalize } from './legalize.js';
import { preflopDecision, raiseSize, spotMultipliers } from './preflop.js';
import { actsByStreet, chartKeyFor, preflopSpot } from './situation.js';
import {
  postflopDecision, huEquity, bluffShare, balancedBluffChance, sizeIndex, SIZE_MENU, rangePercentile, defendShare,
} from './postflop.js';
import { contextAfter } from './testHands.js';

const always = (x) => () => x;

describe('legalize', () => {
  const facing = { canCheck: false, canRaise: true, raiseKind: 'raise', minRaiseTo: 10, maxRaiseTo: 200, toCall: 5 };
  const unopened = { canCheck: true, canRaise: true, raiseKind: 'bet', minRaiseTo: 2, maxRaiseTo: 150, toCall: 0 };
  it('clamps and renames raises, and never folds when checking is free', () => {
    expect(legalize({ action: 'raise', amount: 3 }, facing)).toEqual({ action: 'raise', amount: 10 });
    expect(legalize({ action: 'raise', amount: 999 }, facing)).toEqual({ action: 'raise', amount: 200 });
    expect(legalize({ action: 'raise', amount: 7.6 }, unopened)).toEqual({ action: 'bet', amount: 8 });
    expect(legalize({ action: 'bet', amount: NaN }, unopened)).toEqual({ action: 'bet', amount: 2 });
    expect(legalize({ action: 'fold' }, unopened)).toEqual({ action: 'check' });
    expect(legalize({ action: 'call' }, unopened)).toEqual({ action: 'check' });
    expect(legalize({ action: 'check' }, facing)).toEqual({ action: 'fold' });
    expect(legalize({ action: 'raise', amount: 50 }, { ...facing, canRaise: false, minRaiseTo: null, maxRaiseTo: null })).toEqual({ action: 'call' });
  });

  it('treats an amount at or above the maximum, including Infinity, as all-in', () => {
    expect(legalize({ action: 'raise', amount: Infinity }, facing)).toEqual({ action: 'raise', amount: 200 });
    expect(legalize({ action: 'bet', amount: Infinity }, unopened)).toEqual({ action: 'bet', amount: 150 });
    expect(legalize({ action: 'raise', amount: 200 }, facing)).toEqual({ action: 'raise', amount: 200 });
  });
});

describe('preflopDecision', () => {
  const decide = (steps, rngValue, dials = defaultDials()) => {
    const cx = contextAfter(steps);
    return legalize(preflopDecision({ view: cx.view, events: cx.seatEvents, seat: cx.seat, legal: cx.legal, dials, rng: always(rngValue), bb: 2 }), cx.legal);
  };

  it('opens AA from UTG to 2.5 BB and folds 72o', () => {
    expect(decide([], 0.5)).toEqual({ action: 'raise', amount: 5 });
    const junk = contextAfter([], { holes: ['2c3d', '7h2s', '7c2d', 'KdQd', 'JcTc', '9s9h'] });
    const choice = preflopDecision({ view: junk.view, events: junk.seatEvents, seat: 2, legal: junk.legal, dials: defaultDials(), rng: always(0.5), bb: 2 });
    expect(legalize(choice, junk.legal)).toEqual({ action: 'fold' });
  });

  it('follows the scaled chart facing an open: KQs in the HJ vs an UTG open', () => {
    const cx = contextAfter(['r 2 5']);
    const spot = preflopSpot(cx.view, actsByStreet(cx.seatEvents).preflop, cx.seat);
    const f = scaledFreqs(chartKeyFor(spot, hasChart), parseClass('KQs'), ...spotMultipliers(spot, defaultDials()));
    const low = decide(['r 2 5'], 0);
    const high = decide(['r 2 5'], 0.999);
    if (f.raise > 0) expect(low).toEqual({ action: 'raise', amount: 15 });
    else expect(low).toEqual({ action: f.call > 0 ? 'call' : 'fold' });
    expect(high).toEqual({ action: f.raise + f.call > 0.999 ? 'call' : 'fold' });
  });

  it('sizes 3-bets by position and jams when the raise commits the stack', () => {
    const cx = contextAfter(['r 2 5', 'f 3', 'f 4']);
    const spot = { kind: 'vsOpen', ip: true, position: 'BTN', limpers: 0, callers: 0 };
    expect(raiseSize(spot, cx.view, defaultDials(), 2)).toBe(15);
    expect(raiseSize({ ...spot, ip: false }, cx.view, defaultDials(), 2)).toBe(19);
    expect(raiseSize({ kind: 'open', position: 'SB' }, cx.view, defaultDials(), 2)).toBe(7);
    expect(raiseSize({ kind: 'vsLimp', position: 'CO', limpers: 2 }, cx.view, defaultDials(), 2)).toBe(11);
    const short = contextAfter([], { stack: 10 });
    const jam = preflopDecision({ view: short.view, events: short.seatEvents, seat: 2, legal: short.legal, dials: defaultDials(), rng: always(0), bb: 2 });
    expect(jam).toEqual({ action: 'raise', amount: 10 });
  });

  it('sizes cold 4-bets at 2.3x the 3-bet and jams only when that commits the stack', () => {
    const cold = contextAfter(['r 2 5', 'r 3 15'], { holes: ['2c3d', '7h2s', '6c5d', '8h4s', 'AhAs', '9s9h'] });
    expect(cold.seat).toBe(4);
    const spot = preflopSpot(cold.view, actsByStreet(cold.seatEvents).preflop, 4);
    expect(spot.kind).toBe('coldVs3bet');
    expect(raiseSize(spot, cold.view, defaultDials(), 2)).toBe(35);
    expect(raiseSize({ ...spot, kind: 'vs4bet', raises: 3 }, cold.view, defaultDials(), 2)).toBe(Infinity); // 5-bet: all-in
    const aa = preflopDecision({ view: cold.view, events: cold.seatEvents, seat: 4, legal: cold.legal, dials: defaultDials(), rng: always(0), bb: 2 });
    expect(aa).toEqual({ action: 'raise', amount: 35 });
    const short = contextAfter(['r 2 5', 'r 3 15'], { holes: ['2c3d', '7h2s', '6c5d', '8h4s', 'AhAs', '9s9h'], stack: 80 });
    const jam = preflopDecision({ view: short.view, events: short.seatEvents, seat: 4, legal: short.legal, dials: defaultDials(), rng: always(0), bb: 2 });
    expect(jam).toEqual({ action: 'raise', amount: 80 });
    // Facing a 3-bet that is a big share of the stack, with no tracked range, AA still gets it in.
    const big = contextAfter(['r 2 5', 'r 3 15'], { holes: ['2c3d', '7h2s', '6c5d', '8h4s', 'AhAs', '9s9h'], stack: 40 });
    const bigCall = preflopDecision({ view: big.view, events: big.seatEvents, seat: 4, legal: big.legal, dials: defaultDials(), rng: always(0), bb: 2 });
    expect(bigCall).toEqual({ action: 'raise', amount: 40 });
  });

  it('defends an open against a single 3-bet when equity beats the pot odds after realization', () => {
    // CO (seat 4) opens A9s, the BTN 3-bets to 3x, the blinds fold: CO is out of position.
    const steps = ['f 2', 'f 3', 'r 4 5', 'r 5 15', 'f 0', 'f 1'];
    const cx = contextAfter(steps, { holes: ['2c3d', '7h2s', '6c5d', '8h4s', 'Ah9h', 'KdQd'] });
    expect(cx.seat).toBe(4);
    const spot = preflopSpot(cx.view, actsByStreet(cx.seatEvents).preflop, 4);
    expect(spot.kind).toBe('vs3bet');
    const f = scaledFreqs(chartKeyFor(spot, hasChart), parseClass('A9s'));
    expect(f.raise + f.call).toBeLessThan(0.999); // the chart folds A9s at a high rng
    const play = (u, raiserWeights) => preflopDecision({ view: cx.view, events: cx.seatEvents, seat: 4, legal: cx.legal, dials: defaultDials(), rng: always(u), bb: 2, raiserWeights });
    // Against a wide tracked 3-bet range, A9s has the equity to continue.
    expect(play(0.999, topShareWeights(0.3))).toEqual({ action: 'call' });
    // Hands the chart raises keep raising.
    if (f.raise > 0) expect(play(0, topShareWeights(0.3))).toEqual({ action: 'raise', amount: 35 });
    // Against a tight 3-bet range (no tracked range: the default share), the chart is preserved.
    expect(play(0.999, null)).toEqual({ action: 'fold' });
    expect(play(0.999, topShareWeights(0.07))).toEqual({ action: 'fold' });
  });

  it('makes big calls on equity: AA calls a shove, 83o folds', () => {
    const shove = contextAfter(['r 2 200', 'f 3', 'f 4'], { holes: ['2c3d', '7h2s', 'KsKc', 'KdQd', 'JcTc', 'AhAs'] });
    expect(shove.seat).toBe(5);
    const aa = preflopDecision({ view: shove.view, events: shove.seatEvents, seat: 5, legal: shove.legal, dials: defaultDials(), rng: always(0.99), bb: 2 });
    expect(aa.action === 'call' || aa.action === 'raise').toBe(true);
    const junk = contextAfter(['r 2 200', 'f 3', 'f 4'], { holes: ['2c3d', '7h2s', 'KsKc', 'KdQd', 'JcTc', '8d3h'] });
    const fold = preflopDecision({ view: junk.view, events: junk.seatEvents, seat: 5, legal: junk.legal, dials: defaultDials(), rng: always(0), bb: 2 });
    expect(fold).toEqual({ action: 'fold' });
  });

  it('maps spots to dial multipliers', () => {
    const d = { ...defaultDials(), openBTN: 1.4, bbDefend: 1.3, coldCall: 0.7, threeBet: 2 };
    expect(spotMultipliers({ kind: 'open', position: 'BTN' }, d)).toEqual([1.4, 1]);
    expect(spotMultipliers({ kind: 'vsOpen', position: 'BB' }, d)).toEqual([2, 1.3]);
    expect(spotMultipliers({ kind: 'squeeze', position: 'CO' }, d)).toEqual([2, 0.7]);
    expect(spotMultipliers({ kind: 'coldVs3bet', position: 'CO' }, d)).toEqual([d.fourBet, d.vs3betCall]);
  });

  // Chart-agnostic: the charts get regenerated, so this checks properties rather than frequencies.
  it('never folds AA or KK and always produces legal choices', () => {
    const withHole = (seat, hole) => ['2c3d', '7h2s', '6c5d', '8h4s', 'JcTc', '9s9h'].map((h, i) => (i === seat ? hole : h));
    const spots = [
      { steps: [], seat: 2 }, // open
      { steps: ['r 2 5'], seat: 3 }, // vsOpen
      { steps: ['r 2 5', 'c 3'], seat: 4 }, // squeeze
      { steps: ['r 2 5', 'r 3 16', 'f 4', 'f 5', 'f 0', 'f 1'], seat: 2 }, // vs3bet
      { steps: ['r 2 5', 'r 3 16'], seat: 4 }, // coldVs3bet
      { steps: ['r 2 5', 'r 3 16', 'f 4', 'f 5', 'f 0', 'f 1', 'r 2 40'], seat: 3 }, // vs4bet
    ];
    for (const dials of [defaultDials(), ARCHETYPES['tight-passive']]) {
      for (const { steps, seat } of spots) {
        for (const hole of ['AhAs', 'KhKs']) {
          const cx = contextAfter(steps, { holes: withHole(seat, hole) });
          expect(cx.seat).toBe(seat);
          for (const u of [0, 0.3, 0.6, 0.9, 0.999]) {
            const intended = preflopDecision({ view: cx.view, events: cx.seatEvents, seat, legal: cx.legal, dials, rng: always(u), bb: 2 });
            const choice = legalize(intended, cx.legal);
            const where = `${hole} after [${steps.join(', ')}] u=${u}`;
            expect(choice.action, where).not.toBe('fold');
            if (choice.action === 'bet' || choice.action === 'raise') {
              expect(choice.action, where).toBe(cx.legal.raiseKind);
              expect(choice.amount, where).toBeGreaterThanOrEqual(cx.legal.minRaiseTo);
              expect(choice.amount, where).toBeLessThanOrEqual(cx.legal.maxRaiseTo);
            } else {
              expect(cx.legal.canCheck, where).toBe(choice.action === 'check');
            }
          }
        }
      }
    }
  });
});

describe('postflop helpers', () => {
  it('computes heads-up equivalent equity, bluff share and sizes', () => {
    expect(huEquity(0.25, 1)).toBe(0.25);
    // The average share of the pot (1 / (nOpp + 1)) maps to 0.5 heads-up.
    expect(huEquity(1 / 3, 2)).toBeCloseTo(0.5, 10);
    expect(huEquity(0.25, 3)).toBeCloseTo(0.5, 10);
    expect(huEquity(0.25, 2)).toBeCloseTo(0.25 ** (Math.log(0.5) / Math.log(1 / 3)), 10);
    expect(huEquity(1, 4)).toBe(1);
    expect(huEquity(0, 2)).toBe(0);
    expect(bluffShare(50, 100)).toBeCloseTo(0.25, 10);
    expect(bluffShare(100, 100)).toBeCloseTo(1 / 3, 10);
    expect(balancedBluffChance('flop', 0.5)).toBeCloseTo((0.35 / 0.45) * (1 / 3), 10);
    expect(SIZE_MENU[sizeIndex('flop', 0.2, 0)]).toBe(0.5);
    expect(SIZE_MENU[sizeIndex('turn', 0.8, 0)]).toBe(1);
    expect(SIZE_MENU[sizeIndex('flop', 0.2, -1)]).toBeCloseTo(1 / 3, 10);
  });
});

describe('postflopDecision', () => {
  const base = {
    street: 'flop', equity: 0.5, nOpp: 1, pot: 20, toCall: 0, currentBet: 0, maxRaiseTo: 190, canRaise: true, ip: true,
    aggressor: false, betsThisStreet: 0, spr: 9.5, wetness: 0.2, draw: false, dials: defaultDials(), rng: always(0.99),
  };

  it('bets strong hands for value at the menu size', () => {
    expect(postflopDecision({ ...base, equity: 0.8 })).toEqual({ action: 'bet', amount: 10 });
  });

  it('traps monsters only when the rng says so', () => {
    expect(postflopDecision({ ...base, equity: 0.95, rng: always(0.01) })).toEqual({ action: 'check' });
    expect(postflopDecision({ ...base, equity: 0.95, rng: always(0.99) }).action).toBe('bet');
  });

  it('c-bets air as the aggressor with a low rng and checks it back otherwise', () => {
    expect(postflopDecision({ ...base, equity: 0.2, aggressor: true, rng: always(0.1) }).action).toBe('bet');
    expect(postflopDecision({ ...base, equity: 0.2, aggressor: true, rng: always(0.99) }).action).toBe('check');
  });

  it('calls with pot odds, folds without them, raises the nuts', () => {
    const facing = { ...base, toCall: 10, currentBet: 10, pot: 30, betsThisStreet: 1 };
    expect(postflopDecision({ ...facing, equity: 0.3 }).action).toBe('call'); // needs 25%
    expect(postflopDecision({ ...facing, equity: 0.1 }).action).toBe('fold');
    expect(postflopDecision({ ...facing, equity: 0.95 })).toEqual({ action: 'raise', amount: 40 });
  });

  it('goes all-in when the size commits most of the stack', () => {
    expect(postflopDecision({ ...base, equity: 0.9, pot: 150, maxRaiseTo: 100 })).toEqual({ action: 'bet', amount: 100 });
  });

  it('defends at least mdfDefend of the minimum defence frequency by range percentile', () => {
    expect(rangePercentile(0)).toBe(0);
    expect(rangePercentile(1)).toBe(1);
    expect(rangePercentile(0.25)).toBeCloseTo(1 - 0.75 ** 2.3, 10);
    expect(rangePercentile(0.25, 'river')).toBeCloseTo(1 - 0.75 ** 4, 10); // river equities skew lower
    expect(defendShare(1, 40, 20, 1)).toBeCloseTo(0.5, 10); // pot-size bet: MDF 1/2
    expect(defendShare(0.5, 40, 20, 2)).toBeCloseTo(0.125, 10);
    // A pot-size bet (20 into 20) needs 1/3 equity on pot odds. With a full floor the top half of the range calls.
    const facing = { ...base, toCall: 20, currentBet: 20, pot: 40, betsThisStreet: 1, ip: false };
    const full = { ...defaultDials(), mdfDefend: 1 };
    expect(postflopDecision({ ...facing, equity: 0.3, dials: full }).action).toBe('call'); // percentile ~0.56
    expect(postflopDecision({ ...facing, equity: 0.3, dials: { ...full, mdfDefend: 0 } }).action).toBe('fold');
    expect(postflopDecision({ ...facing, equity: 0.2, dials: full }).action).toBe('fold'); // percentile ~0.40
  });

  it('jams instead of a bet or raise that leaves less than half the resulting pot behind', () => {
    // 1/2 pot = 50 into 100 would leave 70 behind a 200 pot: jam.
    expect(postflopDecision({ ...base, equity: 0.8, pot: 100, maxRaiseTo: 120, spr: 1.2 })).toEqual({ action: 'bet', amount: 120 });
    // With 300 behind, the same bet stays a bet.
    expect(postflopDecision({ ...base, equity: 0.8, pot: 100, maxRaiseTo: 350, spr: 3.5 })).toEqual({ action: 'bet', amount: 50 });
    // Raising to 40 over a 10 bet into 30 would leave 45 behind a 100 pot: jam.
    const facing = { ...base, toCall: 10, currentBet: 10, pot: 30, betsThisStreet: 1, maxRaiseTo: 85, spr: 2.5 };
    expect(postflopDecision({ ...facing, equity: 0.95 })).toEqual({ action: 'raise', amount: 85 });
  });

  it('lowers value thresholds at SPR below 1', () => {
    expect(postflopDecision({ ...base, equity: 0.58 }).action).toBe('check'); // deep: needs 0.60 in position
    expect(postflopDecision({ ...base, equity: 0.58, spr: 0.5 }).action).toBe('bet');
    const facing = { ...base, toCall: 10, currentBet: 10, pot: 30, betsThisStreet: 1 };
    expect(postflopDecision({ ...facing, equity: 0.72 }).action).toBe('call'); // deep: raising needs 0.78
    expect(postflopDecision({ ...facing, equity: 0.72, spr: 0.5, maxRaiseTo: 40 }).action).toBe('raise');
  });

  it('applies the draw bonus to a turn barrel once', () => {
    // cbetTurn 0.35 * 1.3 = 0.455 for a draw; the general 1.5x draw multiplier must not stack on top of it.
    const turn = { ...base, street: 'turn', aggressor: true, draw: true, equity: 0.2, dials: { ...defaultDials(), bluffMul: 0 } };
    expect(postflopDecision({ ...turn, rng: always(0.44) }).action).toBe('bet');
    expect(postflopDecision({ ...turn, rng: always(0.5) }).action).toBe('check');
  });

  it('judges multiway equity in heads-up terms', () => {
    expect(postflopDecision({ ...base, equity: 0.4, nOpp: 1 }).action).toBe('check');
    expect(postflopDecision({ ...base, equity: 0.55, nOpp: 3 }).action).toBe('bet'); // hu ~0.74 vs a 0.70 threshold
    expect(postflopDecision({ ...base, equity: 0.45, nOpp: 3 }).action).toBe('check'); // hu ~0.67
  });
});

describe('determinism', () => {
  it('same inputs and seed give the same preflop choice', () => {
    const cx = contextAfter(['r 2 5']);
    const run = () => preflopDecision({ view: cx.view, events: cx.seatEvents, seat: cx.seat, legal: cx.legal, dials: defaultDials(), rng: mulberry32(5), bb: 2 });
    expect(run()).toEqual(run());
  });
});
