// src/private/trainers/poker/bots/decisions.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { chartFreqs } from './charts.js';
import { ARCHETYPES, defaultDials } from './dials.js';
import { parseClass } from './handClass.js';
import { legalize } from './legalize.js';
import { preflopDecision, raiseSize, spotMultipliers } from './preflop.js';
import { postflopDecision, huEquity, bluffShare, balancedBluffChance, sizeIndex, SIZE_MENU } from './postflop.js';
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

  it('follows the chart facing an open: KQs in the HJ vs an UTG open', () => {
    const f = chartFreqs('vsOpen.HJ.UTG', parseClass('KQs'));
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
  });

  // Chart-agnostic: the charts get regenerated, so this checks properties rather than frequencies.
  it('never folds AA or KK and always produces legal choices', () => {
    const withHole = (seat, hole) => ['2c3d', '7h2s', '6c5d', '8h4s', 'JcTc', '9s9h'].map((h, i) => (i === seat ? hole : h));
    const spots = [
      { steps: [], seat: 2 }, // open
      { steps: ['r 2 5'], seat: 3 }, // vsOpen
      { steps: ['r 2 5', 'c 3'], seat: 4 }, // squeeze
      { steps: ['r 2 5', 'r 3 16', 'f 4', 'f 5', 'f 0', 'f 1'], seat: 2 }, // vs3bet
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
    expect(huEquity(0.25, 2)).toBeCloseTo(0.5, 10);
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

  it('judges multiway equity in heads-up terms', () => {
    expect(postflopDecision({ ...base, equity: 0.4, nOpp: 1 }).action).toBe('check');
    expect(postflopDecision({ ...base, equity: 0.45, nOpp: 3 }).action).toBe('bet'); // hu ~0.77
  });
});

describe('determinism', () => {
  it('same inputs and seed give the same preflop choice', () => {
    const cx = contextAfter(['r 2 5']);
    const run = () => preflopDecision({ view: cx.view, events: cx.seatEvents, seat: cx.seat, legal: cx.legal, dials: defaultDials(), rng: mulberry32(5), bb: 2 });
    expect(run()).toEqual(run());
  });
});
