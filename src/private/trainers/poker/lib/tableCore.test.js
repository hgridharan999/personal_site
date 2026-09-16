import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { parseCards } from '../engine/cards.js';
import { reduceHand, legalActions } from '../engine/handState.js';
import { listPersonas } from '../bots/personas.js';
import {
  createSession, sessionStartInfo, startHand, nextStep, dealBoard, applyAction, botContext, finishHand,
  canRebuy, requestRebuy, requestGetUp, abandonSession, sessionSummary,
} from './tableCore.js';

// Persona ids come from the live list so these tests survive Phase 3 replacing the personas.
const personas = listPersonas();
const lineup = [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: personas[seat - 1].id }));
const NOW = '2026-09-16T12:00:00.000Z';
const passive = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });

let ids = 0;
const createId = () => `id-${(ids += 1)}`;

const newSession = () => createSession({ id: 's1', tableMode: 'random', lineup, startedAt: NOW });
const setStack = (session, seat, stack) => ({
  ...session,
  seats: session.seats.map((s) => (s.seat === seat ? { ...s, stack } : s)),
});

/** Plays the current hand to completion with passive actions for every seat, then settles it. */
function playOut(session, policy = passive) {
  let s = session;
  for (let guard = 0; guard < 200; guard += 1) {
    const step = nextStep(s);
    if (step.type === 'board') s = dealBoard(s);
    else if (step.type === 'hero' || step.type === 'bot') s = applyAction(s, step.seat, policy(legalActions(s.hand.state), step));
    else if (step.type === 'complete') return finishHand(s, { botVersion: 'test', createId });
    else throw new Error(`unexpected step ${step.type}`);
  }
  throw new Error('hand did not finish');
}

describe('createSession', () => {
  it('seats the hero in seat 0 and bots in 1-5 with 100 BB each', () => {
    const s = newSession();
    expect(s.seats.map((x) => [x.seat, x.kind, x.stack])).toEqual([
      [0, 'hero', 200], [1, 'bot', 200], [2, 'bot', 200], [3, 'bot', 200], [4, 'bot', 200], [5, 'bot', 200],
    ]);
    expect(s).toMatchObject({ phase: 'idle', heroSeat: 0, buyIns: 200, rebuys: 0, handsCompleted: 0, button: null });
    expect(nextStep(s)).toEqual({ type: 'idle' });
  });

  it('builds the onSessionStart payload', () => {
    expect(sessionStartInfo(newSession(), 'bots-x')).toEqual({
      id: 's1', startedAt: NOW, botVersion: 'bots-x', tableMode: 'random', lineup, heroSeat: 0,
    });
  });

  it('requires a bot for every seat', () => {
    expect(() => createSession({ id: 's', tableMode: 'custom', lineup: lineup.slice(1), startedAt: NOW })).toThrow('seat 1');
  });
});

describe('playing hands', () => {
  it('deals hand 1 with blinds posted and a random button', () => {
    const s = startHand(newSession(), { rng: mulberry32(1), now: NOW, personas });
    expect(s.phase).toBe('playing');
    expect(s.hand.no).toBe(1);
    expect(s.hand.playedAt).toBe(NOW);
    expect(s.hand.lineup).toEqual(lineup);
    expect(s.hand.state.button).toBe(s.button);
    expect(s.hand.events.filter((e) => e.type === 'hole')).toHaveLength(6);
    expect(['hero', 'bot']).toContain(nextStep(s).type);
  });

  it('plays a hand to completion, conserves chips and numbers the record', () => {
    const { session, record } = playOut(startHand(newSession(), { rng: mulberry32(2), now: NOW, personas }));
    expect(session.phase).toBe('between');
    expect(session.handsCompleted).toBe(1);
    expect(session.seats.reduce((sum, x) => sum + x.stack, 0)).toBe(1200);
    expect(record).toMatchObject({ sessionId: 's1', handNo: 1, heroSeat: 0, botVersion: 'test', showdown: true, pot: 12 });
    expect(session.seats[0].stack - 200).toBe(record.heroNet);
  });

  it('rotates the button and numbers hands', () => {
    const rng = mulberry32(3);
    let s = startHand(newSession(), { rng, now: NOW, personas });
    const first = s.button;
    s = playOut(s).session;
    s = startHand(s, { rng, now: NOW, personas });
    expect(s.hand.no).toBe(2);
    expect(s.button).toBe((first + 1) % 6);
  });

  it('rejects actions out of turn and illegal actions', () => {
    const s = startHand(newSession(), { rng: mulberry32(4), now: NOW, personas });
    const { seat } = nextStep(s);
    expect(() => applyAction(s, (seat + 1) % 6, { action: 'fold' })).toThrow('not due to act');
    expect(() => applyAction(s, seat, { action: 'check' })).toThrow();
    expect(() => dealBoard(s)).toThrow('no board card is due');
    expect(() => finishHand(s, { botVersion: 'test', createId })).toThrow('not complete');
  });

  it('only starts hands from idle or between', () => {
    const s = startHand(newSession(), { rng: mulberry32(5), now: NOW, personas });
    expect(() => startHand(s, { rng: mulberry32(5), now: NOW, personas })).toThrow('while playing');
  });
});

describe('botContext', () => {
  it('gives a bot only its own view, legal actions and persona', () => {
    let s = startHand(newSession(), { rng: mulberry32(6), now: NOW, personas });
    // Call until a bot is due to act (the hero is never first to act as the big blind, so calling is legal).
    while (nextStep(s).type !== 'bot') s = applyAction(s, nextStep(s).seat, { action: 'call' });
    const { seat } = nextStep(s);
    const ctx = botContext(s, seat);
    expect(ctx.seat).toBe(seat);
    expect(ctx.bb).toBe(2);
    expect(ctx.profile).toBeNull();
    expect(ctx.heroSeat).toBe(0);
    expect(ctx.persona.id).toBe(lineup.find((x) => x.seat === seat).personaId);
    expect(ctx.legal).toEqual(legalActions(s.hand.state));
    expect(ctx.view.players.find((p) => p.seat === seat).hole).toHaveLength(2);
    for (const p of ctx.view.players.filter((q) => q.seat !== seat)) expect(p.hole).toBeNull();
    for (const e of ctx.events.filter((x) => x.type === 'hole' && x.seat !== seat)) expect(e.cards).toBeNull();
  });
});

// Hero in the SB with 4 units shoves into AA and loses. Seats 2-5 fold.
function heroBustsHand(session) {
  const c = (text) => parseCards(text);
  const events = [
    { type: 'start', seats: session.seats.map(({ seat, stack }) => ({ seat, stack })), button: 5, sb: 1, bb: 2 },
    { type: 'hole', seat: 0, cards: c('2c7d') },
    { type: 'hole', seat: 1, cards: c('AsAh') },
    { type: 'hole', seat: 2, cards: c('3c8d') },
    { type: 'hole', seat: 3, cards: c('4c9d') },
    { type: 'hole', seat: 4, cards: c('5cTd') },
    { type: 'hole', seat: 5, cards: c('6cJd') },
    { type: 'act', seat: 2, action: 'fold' },
    { type: 'act', seat: 3, action: 'fold' },
    { type: 'act', seat: 4, action: 'fold' },
    { type: 'act', seat: 5, action: 'fold' },
    { type: 'act', seat: 0, action: 'raise', amount: 4 },
    { type: 'act', seat: 1, action: 'call' },
    { type: 'board', cards: c('KdQs8c') },
    { type: 'board', cards: c('3h') },
    { type: 'board', cards: c('4s') },
  ];
  const hand = { no: session.handsCompleted + 1, playedAt: NOW, button: 5, lineup, events, state: reduceHand(events), boardEvent: null };
  return { ...session, button: 5, hand, phase: 'playing' };
}

describe('rebuy, bust and get up', () => {
  it('prompts a rebuy under 40 BB and tops up to 100 BB between hands', () => {
    let s = { ...setStack(newSession(), 0, 79), phase: 'between' };
    expect(canRebuy(s)).toBe(true);
    s = requestRebuy(s);
    expect(s.seats[0].stack).toBe(200);
    expect(s).toMatchObject({ buyIns: 321, rebuys: 1, phase: 'between' });
    expect(canRebuy(s)).toBe(false);
    expect(sessionSummary(s, NOW)).toEqual({ id: 's1', endedAt: NOW, hands: 0, net: -121, rebuys: 1 });
  });

  it('does not offer a rebuy at 40 BB or more', () => {
    const s = { ...setStack(newSession(), 0, 80), phase: 'between' };
    expect(canRebuy(s)).toBe(false);
    expect(requestRebuy(s)).toBe(s);
  });

  it('forces a rebuy or get up when the hero busts', () => {
    const busted = finishHand(heroBustsHand(setStack(newSession(), 0, 4)), { botVersion: 'test', createId }).session;
    expect(busted.seats[0].stack).toBe(0);
    expect(busted.phase).toBe('needsRebuy');
    expect(nextStep(busted)).toEqual({ type: 'idle' });
    expect(() => startHand(busted, { rng: mulberry32(1), now: NOW, personas })).toThrow();
    const rebought = requestRebuy(busted);
    expect(rebought).toMatchObject({ phase: 'between', rebuys: 1, buyIns: 400 });
    expect(sessionSummary(rebought, NOW).net).toBe(-200);
  });

  it('queues a rebuy requested mid-hand until the hand ends', () => {
    const playing = heroBustsHand(setStack(newSession(), 0, 4));
    const queued = requestRebuy(playing);
    expect(queued.rebuyPending).toBe(true);
    expect(canRebuy(queued)).toBe(false);
    const { session } = finishHand(queued, { botVersion: 'test', createId });
    expect(session).toMatchObject({ phase: 'between', rebuys: 1, rebuyPending: false, buyIns: 400 });
    expect(session.seats[0].stack).toBe(200);
  });

  it.skipIf(personas.length < 6)('refills a busted bot with a persona that is not seated', () => {
    const s = { ...setStack(newSession(), 3, 0), phase: 'between', button: 0 };
    for (let seed = 1; seed <= 10; seed += 1) {
      const next = startHand(s, { rng: mulberry32(seed), now: NOW, personas });
      const seat3 = next.seats[3];
      expect(seat3.stack).toBe(200);
      expect(lineup.map((x) => x.personaId)).not.toContain(seat3.personaId);
      expect(next.hand.lineup.find((x) => x.seat === 3).personaId).toBe(seat3.personaId);
      expect(new Set(next.seats.filter((x) => x.kind === 'bot').map((x) => x.personaId)).size).toBe(5);
    }
  });

  it('gets up immediately between hands', () => {
    const s = requestGetUp({ ...newSession(), phase: 'between' });
    expect(s.phase).toBe('ended');
    expect(requestRebuy(setStack(s, 0, 10))).toEqual(setStack(s, 0, 10));
  });

  it('gets up after the current hand when pressed mid-hand, even if a rebuy was queued', () => {
    const playing = requestRebuy(heroBustsHand(setStack(newSession(), 0, 4)));
    const leaving = requestGetUp(playing);
    expect(leaving).toMatchObject({ phase: 'playing', getUpPending: true });
    const { session } = finishHand(leaving, { botVersion: 'test', createId });
    expect(session).toMatchObject({ phase: 'ended', rebuys: 0, handsCompleted: 1 });
    expect(sessionSummary(session, NOW)).toEqual({ id: 's1', endedAt: NOW, hands: 1, net: -200, rebuys: 0 });
  });

  it('abandons a hand in progress without counting it', () => {
    const s = abandonSession(startHand(newSession(), { rng: mulberry32(9), now: NOW, personas }));
    expect(s.phase).toBe('ended');
    expect(sessionSummary(s, NOW)).toEqual({ id: 's1', endedAt: NOW, hands: 0, net: 0, rebuys: 0 });
  });
});
