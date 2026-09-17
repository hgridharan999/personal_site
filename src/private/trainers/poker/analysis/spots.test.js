// src/private/trainers/poker/analysis/spots.test.js
import { describe, it, expect } from 'vitest';
import { buildLog } from '../bots/testHands.js';
import { PREFLOP_SPOTS, postflopSituation, decisionPoints, parseSpot, spotLabel } from './spots.js';

// Six seats, button 5: SB 0, BB 1, UTG 2, HJ 3, CO 4, BTN 5.
const LOG_A = ['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1', 'b 5 4', 'c 1', 'B 2d', 'k 1', 'k 5', 'B 3s', 'b 1 10', 'c 5'];
const summary = (points) => points.map((p) => [p.idx, p.street, p.position, p.spot, p.pot, p.toCall]);

describe('postflopSituation', () => {
  it('classifies by price, bets on the street and the last aggressor', () => {
    expect(postflopSituation({ toCall: 0, betsThisStreet: 0, aggressor: true })).toBe('cbet');
    expect(postflopSituation({ toCall: 0, betsThisStreet: 0, aggressor: false })).toBe('no_bet');
    expect(postflopSituation({ toCall: 4, betsThisStreet: 1, aggressor: true })).toBe('facing_bet');
    expect(postflopSituation({ toCall: 8, betsThisStreet: 2, aggressor: false })).toBe('facing_raise');
  });
});

describe('decisionPoints', () => {
  it('finds every hero decision with its street, position, spot, pot and price', () => {
    const events = buildLog(LOG_A);
    expect(summary(decisionPoints(events, 5))).toEqual([
      [10, 'preflop', 'BTN', 'pf.open', 3, 2],
      [15, 'flop', 'BTN', 'flop.cbet.ip', 11, 0],
      [19, 'turn', 'BTN', 'turn.cbet.ip', 19, 0],
      [22, 'river', 'BTN', 'river.facing_bet.ip', 29, 10],
    ]);
    expect(summary(decisionPoints(events, 1))).toEqual([
      [12, 'preflop', 'BB', 'pf.vs_open', 8, 3],
      [14, 'flop', 'BB', 'flop.no_bet.oop', 11, 0],
      [16, 'flop', 'BB', 'flop.facing_bet.oop', 15, 4],
      [18, 'turn', 'BB', 'turn.no_bet.oop', 19, 0],
      [21, 'river', 'BB', 'river.no_bet.oop', 19, 0],
    ]);
  });

  it('keeps the state before the act, the price and only the hero-visible cards', () => {
    const events = buildLog(LOG_A);
    const [pre, flop] = decisionPoints(events, 1);
    expect(pre.event).toEqual({ type: 'act', seat: 1, action: 'call' });
    expect(pre.neededEquity).toBeCloseTo(3 / 11, 10);
    expect(flop.neededEquity).toBeNull();
    expect(pre.legal.toCall).toBe(3);
    expect(pre.before.toAct).toBe(1);
    expect(pre.view.players.find((p) => p.seat === 5).hole).toBeNull();
    expect(pre.view.players.find((p) => p.seat === 1).hole).not.toBeNull();
    expect(pre.seatEvents).toHaveLength(12);
    expect(pre.seatEvents.filter((e) => e.type === 'hole' && e.cards !== null).map((e) => e.seat)).toEqual([1]);
    expect(pre.preflop.kind).toBe('vsOpen');
    expect(flop.context.ip).toBe(false);
  });

  it('labels facing a raise and a donk bet', () => {
    const events = buildLog(['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'b 1 4', 'r 5 12', 'c 1']);
    expect(decisionPoints(events, 1).map((p) => p.spot)).toEqual(['pf.vs_open', 'flop.no_bet.oop', 'flop.facing_raise.oop']);
    expect(decisionPoints(events, 5).map((p) => p.spot)).toEqual(['pf.open', 'flop.facing_bet.ip']);
  });

  it.each([
    [['f 2', 'f 3', 'r 4 5'], 4, 'pf.open', 'CO'],
    [['c 2', 'f 3', 'r 4 8'], 4, 'pf.vs_limp', 'CO'],
    [['r 2 5', 'f 3', 'f 4', 'c 5'], 5, 'pf.vs_open', 'BTN'],
    [['r 2 5', 'c 3', 'r 4 20'], 4, 'pf.squeeze', 'CO'],
    [['r 2 5', 'f 3', 'f 4', 'r 5 16', 'f 0', 'f 1', 'c 2'], 2, 'pf.vs_3bet', 'UTG'],
    [['r 2 5', 'f 3', 'f 4', 'r 5 16', 'f 0', 'f 1', 'r 2 40', 'c 5'], 5, 'pf.vs_4bet', 'BTN'],
    // UTG opens, HJ 3-bets: CO is cold facing two raises (coldVs3bet), maps to the same pf.vs_3bet spot.
    [['r 2 5', 'r 3 16', 'c 4'], 4, 'pf.vs_3bet', 'CO'],
  ])('preflop %j for seat %i is %s', (steps, hero, spot, position) => {
    const last = decisionPoints(buildLog(steps), hero).at(-1);
    expect(last.spot).toBe(spot);
    expect(last.position).toBe(position);
    expect(Object.values(PREFLOP_SPOTS)).toContain(spot);
  });

  it('maps a cold player facing a 3-bet to pf.vs_3bet', () => {
    const events = buildLog(['r 2 5', 'r 3 16', 'c 4']);
    const last = decisionPoints(events, 4).at(-1);
    expect(last.preflop.kind).toBe('coldVs3bet');
    expect(last.spot).toBe('pf.vs_3bet');
  });

  it('returns nothing when the hero never acts', () => {
    expect(decisionPoints(buildLog(['f 2', 'f 3', 'f 4', 'f 5', 'f 0']), 1)).toEqual([]);
  });
});

describe('parseSpot and spotLabel (Phase 6 outputs)', () => {
  it('reads street, situation and position', () => {
    expect(parseSpot('pf.vs_3bet')).toEqual({ street: 'preflop', situation: 'vs_3bet', position: null });
    expect(parseSpot('river.facing_bet.oop')).toEqual({ street: 'river', situation: 'facing_bet', position: 'oop' });
    expect(parseSpot('turn.no_bet.multiway.oop')).toEqual({ street: 'turn', situation: 'no_bet', position: 'oop' });
    for (const bad of ['', 'pf', 'preflop.open', 'river.', null, undefined, 42]) expect(parseSpot(bad), String(bad)).toBeNull();
  });

  it('labels known, unknown and unparseable spots', () => {
    expect(spotLabel('pf.open')).toBe('Preflop · first in');
    expect(spotLabel('river.facing_bet.oop')).toBe('River · facing a bet · out of position');
    expect(spotLabel('flop.cbet.ip')).toBe('Flop · c-bet chance · in position');
    expect(spotLabel('turn.overbet_probe')).toBe('Turn · overbet probe');
    expect(spotLabel('weird')).toBe('weird');
  });
});
