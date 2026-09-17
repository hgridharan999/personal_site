// src/private/trainers/poker/bots/arena.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { reduceHand } from '../engine/handState.js';
import { callingStation, randomLegal } from './baselines.js';
import { emptyProfile } from './contract.js';
import { ADAPT_MIN_OBS, adaptDials } from './adapt.js';
import { defaultDials } from './dials.js';
import { legalize } from './legalize.js';
import { preflopDecision } from './preflop.js';
import { always3Bet } from './probes.js';
import { playArenaHand, playDuplicateDeal } from './arena.js';

describe('playArenaHand', () => {
  it('gives each brain only its own view and hole cards', () => {
    const spy = {
      decide(ctx) {
        for (const p of ctx.view.players) if (p.seat !== ctx.seat) expect(p.hole).toBeNull();
        for (const e of ctx.events) if (e.type === 'hole' && e.seat !== ctx.seat) expect(e.cards).toBeNull();
        expect(ctx.bb).toBe(2);
        return callingStation.decide(ctx);
      },
    };
    const { events, state } = playArenaHand({
      seats: [0, 1, 2].map((seat) => ({ seat, stack: 200 })), button: 0, dealRng: mulberry32(1), decisionRng: mulberry32(2),
      playerAt: () => ({ brain: spy, persona: null }),
    });
    expect(state.street).toBe('complete');
    expect(reduceHand(events)).toEqual(state);
  });
});

describe('playDuplicateDeal', () => {
  it('rotates every player through every seat with identical cards, and nets sum to zero', () => {
    const holesSeen = [];
    const players = Array.from({ length: 6 }, () => ({ brain: callingStation, persona: null }));
    const { nets, hands } = playDuplicateDeal({
      players, dealSeed: 77, decisionRng: mulberry32(1), button: 2,
      onHand: (events) => holesSeen.push(events.filter((e) => e.type === 'hole').map((e) => `${e.seat}:${e.cards}`).sort().join('|')),
    });
    expect(hands).toBe(6);
    expect(new Set(holesSeen).size).toBe(1);
    expect(nets.reduce((a, b) => a + b, 0)).toBe(0);
    // identical players and identical cards in every seat: everyone breaks even over the rotations
    expect(nets).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('accumulates the subject profile with the subject seat for each rotation', () => {
    const players = [{ brain: randomLegal, persona: null }, ...Array.from({ length: 5 }, () => ({ brain: callingStation, persona: null }))];
    const seen = [];
    const spyStation = {
      decide(ctx) {
        seen.push([ctx.seat, ctx.heroSeat]);
        return callingStation.decide(ctx);
      },
    };
    players[1] = { brain: spyStation, persona: null };
    const { profile } = playDuplicateDeal({ players, dealSeed: 5, decisionRng: mulberry32(3), subject: 0, profile: emptyProfile() });
    expect(profile.hands).toBe(6);
    // player 1 sits one seat after player 0 in every rotation
    expect(seen.length).toBeGreaterThan(0);
    for (const [seat, heroSeat] of seen) expect(heroSeat).toBe((seat + 5) % 6);
  });

  it('passes no profile without adapt, and adapt requires a subject', () => {
    const seen = [];
    const spy = {
      decide(ctx) {
        seen.push([ctx.profile, ctx.heroSeat]);
        return callingStation.decide(ctx);
      },
    };
    const players = Array.from({ length: 3 }, () => ({ brain: spy, persona: null }));
    const { profile } = playDuplicateDeal({ players, dealSeed: 9, decisionRng: mulberry32(1), subject: 0 });
    expect(profile).toBeNull();
    for (const [p, heroSeat] of seen) {
      expect(p).toBeNull();
      expect(heroSeat).not.toBeNull(); // the subject's seat is still reported
    }
    expect(() => playDuplicateDeal({ players, dealSeed: 9, decisionRng: mulberry32(1), adapt: true })).toThrow('adapt requires a subject');
  });

  it('with adapt, bots profile an always-3-bet probe and fold less to its 3-bets', () => {
    // Chart play that adapts its dials to the profiled seat preflop; checks or calls postflop.
    const adapting = {
      decide(ctx, rng) {
        const { view, seat, legal, events, profile, heroSeat } = ctx;
        if (view.street !== 'preflop') return callingStation.decide(ctx);
        const dials = profile && heroSeat !== seat ? adaptDials(defaultDials(), profile) : defaultDials();
        return legalize(preflopDecision({ view, events, seat, legal, dials, rng, bb: ctx.bb }), legal);
      },
    };
    const players = [{ brain: always3Bet, persona: null }, ...Array.from({ length: 5 }, () => ({ brain: adapting, persona: null }))];
    const run = (adapt) => {
      const decisionRng = mulberry32(3);
      const tally = { spots: 0, folds: 0, profile: null };
      // An opener's response to the probe's 3-bet.
      const onHand = (events, seatOf) => {
        const pre = [];
        for (const e of events) {
          if (e.type === 'board') break;
          if (e.type === 'act') pre.push(e);
        }
        const raises = pre.filter((a) => a.action === 'raise');
        if (raises.length < 2 || raises[1].seat !== seatOf(0)) return;
        const response = pre.slice(pre.indexOf(raises[1]) + 1).find((a) => a.seat === raises[0].seat);
        if (!response) return;
        tally.spots += 1;
        if (response.action === 'fold') tally.folds += 1;
      };
      for (let d = 0; d < 100; d += 1) {
        const result = playDuplicateDeal({
          players, dealSeed: 3000 + d, decisionRng, button: d % 6, subject: 0, profile: tally.profile, adapt, onHand,
        });
        tally.profile = result.profile;
      }
      return tally;
    };
    const off = run(false);
    const on = run(true);
    expect(off.profile).toBeNull();
    expect(on.profile.hands).toBe(600);
    expect(on.profile.stats.threeBet.n).toBeGreaterThanOrEqual(ADAPT_MIN_OBS);
    expect(on.profile.stats.threeBet.value).toBeGreaterThan(0.9);
    expect(off.spots).toBeGreaterThan(200);
    expect(on.folds / on.spots).toBeLessThan(off.folds / off.spots - 0.05);
  });
});
