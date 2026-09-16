// src/private/trainers/poker/lib/tableView.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { legalActions } from '../engine/handState.js';
import { listPersonas } from '../bots/personas.js';
import { createSession, startHand, nextStep, applyAction, dealBoard, finishHand } from './tableCore.js';
import { slotOf, heroView, seatName, seatViews, tableCenter, heroTurn, streetKey, chipsToCollect } from './tableView.js';

const personas = listPersonas();
const lineup = [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: personas[seat - 1].id }));
const NOW = '2026-09-16T12:00:00.000Z';
const passive = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });

const fresh = () => createSession({ id: 's1', tableMode: 'random', lineup, startedAt: NOW });
const dealt = (seed = 1) => startHand(fresh(), { rng: mulberry32(seed), now: NOW, personas });

function advance(session, untilType) {
  let s = session;
  for (let guard = 0; guard < 200; guard += 1) {
    const step = nextStep(s);
    if (step.type === untilType) return s;
    if (step.type === 'board') s = dealBoard(s);
    else if (step.type === 'hero' || step.type === 'bot') s = applyAction(s, step.seat, passive(legalActions(s.hand.state)));
    else return s;
  }
  throw new Error('did not reach step');
}

/** Folds every seat but `keepSeat` until the hand ends without a showdown. */
function foldToOneWinner(session, keepSeat) {
  let s = session;
  for (let guard = 0; guard < 200; guard += 1) {
    const step = nextStep(s);
    if (step.type === 'complete') return s;
    if (step.type === 'board') {
      s = dealBoard(s);
      continue;
    }
    if (step.type === 'hero' || step.type === 'bot') {
      const choice = step.seat === keepSeat ? passive(legalActions(s.hand.state)) : { action: 'fold' };
      s = applyAction(s, step.seat, choice);
      continue;
    }
    return s;
  }
  throw new Error('did not reach complete');
}

describe('slots and names', () => {
  it('puts the hero at slot 0 and the rest clockwise', () => {
    expect([0, 1, 2, 3, 4, 5].map((seat) => slotOf(seat, 0))).toEqual([0, 1, 2, 3, 4, 5]);
    expect([0, 1, 2, 3, 4, 5].map((seat) => slotOf(seat, 2))).toEqual([4, 5, 0, 1, 2, 3]);
  });

  it('names the hero You and bots by persona', () => {
    expect(seatName(fresh(), 0)).toBe('You');
    expect(seatName(fresh(), 3)).toBe(personas[2].name);
  });
});

describe('seatViews', () => {
  it('shows stacks and the button before the first hand', () => {
    const seats = seatViews(fresh());
    expect(seats.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(seats[0]).toMatchObject({ isHero: true, name: 'You', tag: 'YOU', stack: 200, bet: 0, cards: null, isButton: false });
    expect(seats[1]).toMatchObject({ isHero: false, name: personas[0].name, tag: personas[0].tag, stack: 200 });
    expect(heroView(fresh())).toBeNull();
  });

  it('shows blinds as bets, the hero’s cards and hidden bot cards during a hand', () => {
    const s = dealt(1);
    const seats = seatViews(s);
    const { sbSeat, bbSeat, button, toAct } = s.hand.state;
    expect(seats.find((x) => x.seat === sbSeat).bet).toBe(1);
    expect(seats.find((x) => x.seat === bbSeat).bet).toBe(2);
    expect(seats.find((x) => x.seat === sbSeat).stack).toBe(199);
    expect(seats.filter((x) => x.isButton).map((x) => x.seat)).toEqual([button]);
    expect(seats.filter((x) => x.isActive).map((x) => x.seat)).toEqual([toAct]);
    expect(seats[0].cards).toEqual(s.hand.state.players[0].hole);
    for (const bot of seats.slice(1)) expect(bot.cards).toEqual([null, null]);
  });

  it('hides folded players’ cards and reveals shown cards and winners at the end', () => {
    let s = dealt(2);
    const first = nextStep(s);
    s = applyAction(s, first.seat, { action: 'fold' });
    expect(seatViews(s).find((x) => x.seat === first.seat)).toMatchObject({ folded: true, cards: null });
    s = advance(s, 'complete');
    const seats = seatViews(s);
    expect(seats.every((x) => x.bet === 0)).toBe(true);
    const { shown, awards } = s.hand.state.result;
    for (const seat of shown) expect(seats.find((x) => x.seat === seat).cards.every(Number.isInteger)).toBe(true);
    expect(seats.reduce((sum, x) => sum + x.won, 0)).toBe(Object.values(awards).reduce((a, b) => a + b, 0));
  });

  it('shows the settled seat stacks once the hand is complete (a queued rebuy lands there)', () => {
    const playing = advance(dealt(6), 'complete');
    const settled = finishHand({ ...playing, rebuyPending: true, seats: playing.seats.map((x) => (x.seat === 0 ? { ...x, stack: 50 } : x)) }, { botVersion: 't', createId: () => 'h' }).session;
    expect(seatViews(settled).find((x) => x.isHero).stack).toBe(settled.seats[0].stack);
    expect(seatViews(settled).map((x) => x.stack)).toEqual(settled.seats.map((x) => x.stack));
  });

  it('never reveals a bot’s hole cards mid-hand or after a no-showdown finish', () => {
    const mid = dealt(7);
    for (const bot of seatViews(mid).filter((x) => !x.isHero)) expect(bot.cards).toEqual([null, null]);

    // Every other seat folds to a single bot winner: the hand ends without a showdown, so
    // viewFor(state, HERO_SEAT) never reveals the winner's hole cards even though they're the
    // one who took the pot.
    const winnerSeat = 1;
    const finished = foldToOneWinner(dealt(8), winnerSeat);
    const { result } = finished.hand.state;
    expect(result.showdown).toBe(false);
    expect(result.shown).toEqual([]);
    const winnerView = seatViews(finished).find((x) => x.seat === winnerSeat);
    expect(winnerView.folded).toBe(false);
    expect(winnerView.won).toBeGreaterThan(0);
    expect(winnerView.cards).toEqual([null, null]);
    for (const seat of seatViews(finished).filter((x) => x.seat !== winnerSeat)) expect(seat.cards).toBeNull();
  });
});

describe('tableCenter and heroTurn', () => {
  it('separates the collected pot from bets on the street', () => {
    expect(tableCenter(fresh())).toEqual({ board: [], pot: 0, handNo: 0, street: null });
    const s = dealt(3);
    expect(tableCenter(s)).toEqual({ board: [], pot: 0, handNo: 1, street: 'preflop' });
    const flop = advance(s, 'board');
    const onFlop = dealBoard(flop);
    expect(tableCenter(onFlop)).toMatchObject({ pot: 12, street: 'flop' });
    expect(tableCenter(onFlop).board).toHaveLength(3);
    const done = finishHand(advance(onFlop, 'complete'), { botVersion: 't', createId: () => 'h' }).session;
    expect(tableCenter(done)).toMatchObject({ pot: 12, street: 'complete', handNo: 1 });
  });

  it('returns the hero’s legal actions only on the hero’s turn', () => {
    const s = advance(dealt(4), 'hero');
    const turn = heroTurn(s);
    expect(turn.legal).toEqual(legalActions(s.hand.state));
    expect(turn.stack).toBe(s.hand.state.players[0].stack);
    expect(turn.view.players[1].hole).toBeNull();
    const after = applyAction(s, 0, passive(turn.legal));
    expect(heroTurn(after)).toBeNull();
    expect(heroTurn(fresh())).toBeNull();
  });
});

describe('chipsToCollect', () => {
  it('sweeps bets into the pot when the street closes, not when the board is dealt', () => {
    const preflop = dealt(5);
    const flopDue = advance(preflop, 'board');
    expect(streetKey(preflop)).toBe('1:preflop');
    expect(streetKey(flopDue)).toBe('1:flop');
    const snap = (s) => ({ key: streetKey(s), seats: seatViews(s) });
    // Blinds (1 and 2) are the bets on the table in the preflop snapshot.
    expect(chipsToCollect(snap(preflop), snap(flopDue)).map((x) => x.amount).sort()).toEqual([1, 2]);
    expect(chipsToCollect(snap(flopDue), snap(dealBoard(flopDue)))).toEqual([]);
    expect(chipsToCollect(snap(preflop), snap(preflop))).toEqual([]);
    expect(chipsToCollect(null, snap(preflop))).toEqual([]);
    expect(streetKey(fresh())).toBe('none');
  });
});
