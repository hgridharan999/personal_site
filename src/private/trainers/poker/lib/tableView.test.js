// src/private/trainers/poker/lib/tableView.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { legalActions } from '../engine/handState.js';
import { listPersonas } from '../bots/personas.js';
import { createSession, startHand, nextStep, applyAction, dealBoard, finishHand, abandonSession } from './tableCore.js';
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

  it('shows live engine stacks between "complete" and settlement, not the pre-hand stacks', () => {
    const playing = advance(dealt(6), 'complete');
    // The hand is over but finishHand has not run yet: session.phase is still 'playing'.
    expect(playing.phase).toBe('playing');
    const engineStacks = new Map(playing.hand.state.players.map((p) => [p.seat, p.stack]));
    const seats = seatViews(playing);
    for (const seat of seats) expect(seat.stack).toBe(engineStacks.get(seat.seat));
  });

  it('keeps live engine stacks after the session is abandoned mid-hand, so bets are not counted twice', () => {
    const s = dealt(1);
    const abandoned = abandonSession(applyAction(s, 0, { action: 'call' }));
    expect(abandoned.phase).toBe('ended');
    const seats = seatViews(abandoned);
    for (const seat of seats) {
      const p = abandoned.hand.state.players.find((q) => q.seat === seat.seat);
      expect(seat.stack).toBe(p.stack);
      expect(seat.stack + seat.bet).toBe(200);
    }
  });

  it('reports each seat’s contribution to the hand as inPot', () => {
    expect(seatViews(fresh()).every((x) => x.inPot === 0)).toBe(true);
    const s = advance(dealt(5), 'board');
    for (const seat of seatViews(s)) expect(seat.inPot).toBe(s.hand.state.players.find((p) => p.seat === seat.seat).total);
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
    // Only the blinds show in the preflop snapshot, but all six seats limp in before the street
    // closes, so each seat's 2 is swept.
    expect(chipsToCollect(snap(preflop), snap(flopDue)).map((x) => x.amount)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(chipsToCollect(snap(flopDue), snap(dealBoard(flopDue)))).toEqual([]);
    expect(chipsToCollect(snap(preflop), snap(preflop))).toEqual([]);
    expect(chipsToCollect(null, snap(preflop))).toEqual([]);
    expect(streetKey(fresh())).toBe('none');
  });

  /**
   * Hero (seat 0) raises to `raiseTo`, seat 2 calls (all-in if short), everyone else folds.
   * Returns the seatViews snapshot from just before the street-closing action (so any bets still
   * show their raw, pre-refund committed amount) and the snapshot from just after it.
   */
  function raiseAndShortCall(session, raiseTo) {
    let s = session;
    let prev = null;
    for (let guard = 0; guard < 200; guard += 1) {
      const step = nextStep(s);
      if (step.type !== 'hero' && step.type !== 'bot') return { prev, next: { key: streetKey(s), seats: seatViews(s) } };
      const legal = legalActions(s.hand.state);
      let choice;
      if (step.seat === 0 && s.hand.state.currentBet < raiseTo) choice = { action: legal.raiseKind, amount: raiseTo };
      else if (step.seat === 0 || step.seat === 2) choice = legal.canCheck ? { action: 'check' } : { action: 'call' };
      else choice = { action: 'fold' };
      prev = { key: streetKey(s), seats: seatViews(s) };
      s = applyAction(s, step.seat, choice);
    }
    throw new Error('did not reach board');
  }

  it('sweeps the refunded amount, not the raw bet, when a call is short and the excess is returned', () => {
    const seats = fresh().seats.map((x) => (x.seat === 2 ? { ...x, stack: 6 } : x));
    const session = { ...fresh(), seats };
    const preflop = startHand(session, { rng: mulberry32(9), now: NOW, personas });
    const { prev, next } = raiseAndShortCall(preflop, 50);
    // Just before the street closed, seat 0's raw commitment (50) still included the uncalled
    // 44 that's about to be refunded.
    expect(prev.seats.find((x) => x.seat === 0).bet).toBe(50);
    const swept = chipsToCollect(prev, next);
    // Seat 0 raised to 50 but seat 2 could only call 6 (their whole stack); the uncalled 44 is
    // refunded, so only 6 units from seat 0's raise actually went into the pot.
    const hero = swept.find((x) => x.slot === slotOf(0, 0));
    const caller = swept.find((x) => x.slot === slotOf(2, 0));
    expect(hero.amount).toBe(6);
    expect(caller.amount).toBe(6);
  });

  it('still sweeps the full bet on an ordinary street close with no refund', () => {
    const session = fresh();
    const preflop = startHand(session, { rng: mulberry32(9), now: NOW, personas });
    const { prev, next } = raiseAndShortCall(preflop, 20);
    const swept = chipsToCollect(prev, next);
    const hero = swept.find((x) => x.slot === slotOf(0, 0));
    const caller = swept.find((x) => x.slot === slotOf(2, 0));
    expect(hero.amount).toBe(20);
    expect(caller.amount).toBe(20);
  });

  const snap = (s) => ({ key: streetKey(s), seats: seatViews(s) });
  const call = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });
  const foldOrCheck = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'fold' });

  /**
   * Plays `session` to the end with `policy(state, seat, legal)`, snapshotting around every step. Returns each
   * street-key change as `{ from, to, swept, truth }`, both keyed by seat: `swept` from chipsToCollect and
   * `truth` from the engine's per-seat `total` growth over the street that closed.
   */
  function sweeps(session, policy) {
    let s = session;
    let start = new Map(s.hand.state.players.map((p) => [p.seat, 0]));
    const out = [];
    for (let guard = 0; guard < 300; guard += 1) {
      const step = nextStep(s);
      if (step.type === 'complete') return out;
      const prev = snap(s);
      if (step.type === 'board') s = dealBoard(s);
      else s = applyAction(s, step.seat, policy(s.hand.state, step.seat, legalActions(s.hand.state)));
      const next = snap(s);
      if (prev.key === next.key) continue;
      const swept = {};
      for (const x of chipsToCollect(prev, next)) swept[(x.slot + s.heroSeat) % 6] = x.amount;
      const truth = {};
      for (const p of s.hand.state.players) if (p.total > start.get(p.seat)) truth[p.seat] = p.total - start.get(p.seat);
      out.push({ from: prev.key, to: next.key, swept, truth });
      start = new Map(s.hand.state.players.map((p) => [p.seat, p.total]));
    }
    throw new Error('hand did not finish');
  }

  // Seed 1 deals button 3, small blind 4, big blind 5; the hero (seat 0) is first to act preflop.
  const seed1 = (stacks = {}) => {
    const base = fresh();
    const seats = base.seats.map((x) => (x.seat in stacks ? { ...x, stack: stacks[x.seat] } : x));
    return startHand({ ...base, seats }, { rng: mulberry32(1), now: NOW, personas });
  };

  it('sweeps the raise minus the refund when the hero raises and everyone folds', () => {
    const [close] = sweeps(seed1(), (st, seat, legal) => (seat === 0 ? { action: legal.raiseKind, amount: 6 } : foldOrCheck(legal)));
    expect(close).toMatchObject({ from: '1:preflop', to: '1:complete' });
    expect(close.swept).toEqual({ 0: 2, 4: 1, 5: 2 });
  });

  it('sweeps the matched blinds on a walk to the big blind', () => {
    const [close] = sweeps(seed1(), (st, seat, legal) => foldOrCheck(legal));
    expect(close).toMatchObject({ from: '1:preflop', to: '1:complete' });
    expect(close.swept).toEqual({ 4: 1, 5: 1 });
  });

  it('sweeps nothing when a flop bet makes everyone fold', () => {
    const result = sweeps(seed1(), (st, seat, legal) => {
      if (st.street === 'preflop') return call(legal);
      return st.currentBet === 0 && !st.players.some((p) => p.acted) ? { action: legal.raiseKind, amount: 10 } : foldOrCheck(legal);
    });
    expect(result.map((x) => x.to)).toEqual(['1:flop', '1:complete']);
    expect(result[0].swept).toEqual({ 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 });
    expect(result[1].swept).toEqual({});
  });

  it('sweeps both players’ 60 when a river bet is raised and called', () => {
    const result = sweeps(seed1(), (st, seat, legal) => {
      if (seat !== 0 && seat !== 2) return foldOrCheck(legal);
      if (st.street === 'river' && seat === 0 && st.currentBet === 0) return { action: legal.raiseKind, amount: 20 };
      if (st.street === 'river' && seat === 2 && st.currentBet === 20) return { action: legal.raiseKind, amount: 60 };
      return call(legal);
    });
    const river = result.find((x) => x.from === '1:river');
    expect(river.to).toBe('1:complete');
    expect(river.swept).toEqual({ 0: 60, 2: 60 });
  });

  it('sweeps the whole short all-in call that closes preflop', () => {
    const result = sweeps(seed1({ 5: 10 }), (st, seat, legal) => {
      if (seat === 0 && st.street === 'preflop') return st.currentBet < 20 ? { action: legal.raiseKind, amount: 20 } : call(legal);
      return seat === 5 ? call(legal) : foldOrCheck(legal);
    });
    expect(result[0]).toMatchObject({ from: '1:preflop', to: '1:flop' });
    // The big blind calls all-in for 10 in total; the hero's uncalled 10 comes back.
    expect(result[0].swept).toEqual({ 0: 10, 4: 1, 5: 10 });
  });

  it('falls back to the shown bets when the next snapshot is a different hand', () => {
    const prev = snap(dealt(1));
    const next = { key: '2:preflop', seats: seatViews(fresh()) };
    expect(chipsToCollect(prev, next).map((x) => x.amount).sort()).toEqual([1, 2]);
  });

  it('matches every seat’s pot contribution over 200 random hands', () => {
    const mismatches = [];
    let transitions = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = mulberry32(seed * 7 + 1);
      const base = fresh();
      const short = { 1: 20 + (seed % 50), 3: 5 + (seed % 30) };
      const seats = base.seats.map((x) => (x.seat in short ? { ...x, stack: short[x.seat] } : x));
      const session = startHand({ ...base, seats }, { rng: mulberry32(seed), now: NOW, personas });
      const result = sweeps(session, (st, seat, legal) => {
        const r = rng();
        if (r < 0.25 && legal.canRaise) return { action: legal.raiseKind, amount: r < 0.1 ? legal.maxRaiseTo : legal.minRaiseTo };
        return r < 0.45 ? foldOrCheck(legal) : call(legal);
      });
      for (const x of result) {
        transitions += 1;
        if (Object.values(x.swept).some((amount) => amount <= 0) || JSON.stringify(x.swept) !== JSON.stringify(x.truth)) {
          mismatches.push({ seed, ...x });
        }
      }
    }
    expect(transitions).toBeGreaterThan(200);
    expect(mismatches).toEqual([]);
  });
});
