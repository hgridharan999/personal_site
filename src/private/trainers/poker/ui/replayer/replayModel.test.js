import { describe, it, expect } from 'vitest';
import { parseCards } from '../../engine/cards.js';
import { buildLog, HOLES6 } from '../../bots/testHands.js';
import { listPersonas } from '../../bots/personas.js';
import {
  PLAY_INTERVAL_MS, REPLAY_START, buildSteps, nameOfSeat, frameAt, stepLines, stepDescription, decisionAt, decisionMarks,
  initialStepIndex, chartForDecision, replayReducer, replayKeyAction, shouldHandleReplayKey,
} from './replayModel.js';

const personas = listPersonas();
// Hero in seat 5 (the button) opens to 5, the big blind calls, then folds to a flop c-bet.
const LOG = ['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1', 'b 5 4', 'f 1'];
const hand = (o = {}) => ({
  id: 'h1', handNo: 3, heroSeat: 5, buttonSeat: 5,
  lineup: [0, 1, 2, 3, 4].map((seat) => ({ seat, personaId: personas[seat].id })),
  events: buildLog(LOG), ...o,
});
const DECISIONS = [
  { idx: 10, street: 'preflop', spot: 'pf.open', action: 'raise', size: 5, grade: 'good', confident: true, recommended: { action: 'raise', size: 5, evByOption: {} } },
  { idx: 15, street: 'flop', spot: 'flop.cbet.ip', action: 'bet', size: 4, grade: 'mistake', confident: false, recommended: { action: 'check', size: null, evByOption: { check: 3, 'bet:4': 1 } } },
];

describe('steps', () => {
  it('starts after the deal and adds a step per action or board card', () => {
    expect([PLAY_INTERVAL_MS, REPLAY_START]).toEqual([900, { index: 0, playing: false }]);
    const steps = buildSteps(hand().events);
    expect(steps).toHaveLength(11);
    expect(steps[0].eventIdx).toBe(6);
    expect(steps[0].state.toAct).toBe(2);
    expect(steps.at(-1).state.street).toBe('complete');
  });
});

describe('frameAt', () => {
  it('shows the hero cards, hides bot cards and marks whose turn it is', () => {
    const h = hand();
    const steps = buildSteps(h.events);
    const { seats, center } = frameAt(h, steps, 0);
    expect(seats).toHaveLength(6);
    const hero = seats.find((s) => s.isHero);
    expect(hero).toMatchObject({ seat: 5, slot: 0, name: 'You', cards: parseCards(HOLES6[5]) });
    expect(seats.find((s) => s.seat === 2)).toMatchObject({ name: personas[2].name, cards: [null, null], isActive: true });
    expect(center).toMatchObject({ board: [], pot: 0, handNo: 3, street: 'preflop' });
  });

  it('reveals every bot hand, folded or not, on request', () => {
    const h = hand();
    const steps = buildSteps(h.events);
    const { seats } = frameAt(h, steps, 4, { revealAll: true });
    expect(seats.find((s) => s.seat === 2).cards).toEqual(parseCards(HOLES6[2]));
    expect(seats.find((s) => s.seat === 1).cards).toEqual(parseCards(HOLES6[1]));
  });

  it('shows the winner and the whole pot at the end, after the uncalled bet is returned', () => {
    const h = hand();
    const steps = buildSteps(h.events);
    const { seats, center } = frameAt(h, steps, steps.length - 1);
    expect(seats.find((s) => s.isHero).won).toBe(11);
    expect(center.pot).toBe(11);
  });

  it('throws for a persona this build does not know', () => {
    const h = hand({ lineup: [{ seat: 0, personaId: 'ghost' }, ...hand().lineup.slice(1)] });
    expect(() => frameAt(h, buildSteps(h.events), 0)).toThrow('Unknown persona: ghost');
  });
});

describe('log and decisions', () => {
  it('describes each step in the hero voice', () => {
    const h = hand();
    const steps = buildSteps(h.events);
    expect(nameOfSeat(h)(5)).toBe('You');
    expect(stepDescription(h, steps, 0)).toBe('You are dealt 9♠ 9♥');
    expect(stepDescription(h, steps, 4)).toBe('You raise to 2.5 BB');
    expect(stepLines(h, steps, 4).length).toBeGreaterThan(stepLines(h, steps, 3).length);
  });

  it('finds hero decisions by step and opens at ?d=', () => {
    const steps = buildSteps(hand().events);
    expect(decisionAt(DECISIONS, steps, 4)).toBe(DECISIONS[0]);
    expect(decisionAt(DECISIONS, steps, 5)).toBeNull();
    expect(decisionMarks(steps, DECISIONS)).toEqual([
      { idx: 10, step: 4, street: 'preflop', grade: 'good', confident: true },
      { idx: 15, step: 9, street: 'flop', grade: 'mistake', confident: false },
    ]);
    expect(initialStepIndex(steps, DECISIONS, '15')).toBe(9);
    expect(initialStepIndex(steps, DECISIONS, '11')).toBe(0);
    expect(initialStepIndex(steps, DECISIONS, null)).toBe(0);
    expect(initialStepIndex(steps, DECISIONS, '')).toBe(0);
  });

  it('recomputes chart frequencies for a chart-graded preflop decision', () => {
    const h = hand();
    expect(chartForDecision(h, DECISIONS[0])).toMatchObject({ key: 'open.BTN', ok: expect.any(Boolean) });
    expect(chartForDecision(h, DECISIONS[1])).toBeNull();
  });
});

describe('replayReducer and keys', () => {
  const run = (state, type, extra = {}) => replayReducer(state, { type, count: 5, ...extra });
  it('steps, jumps and clamps', () => {
    expect(run(REPLAY_START, 'next')).toEqual({ index: 1, playing: false });
    expect(run(REPLAY_START, 'prev')).toEqual({ index: 0, playing: false });
    expect(run(REPLAY_START, 'last')).toEqual({ index: 4, playing: false });
    expect(run({ index: 3, playing: true }, 'first')).toEqual({ index: 0, playing: false });
    expect(run(REPLAY_START, 'goto', { index: 9 })).toEqual({ index: 4, playing: false });
  });

  it('plays to the end and restarts from the start when finished', () => {
    let state = run(REPLAY_START, 'toggle');
    expect(state).toEqual({ index: 0, playing: true });
    for (let i = 0; i < 4; i += 1) state = run(state, 'tick');
    expect(state).toEqual({ index: 4, playing: false });
    expect(run(state, 'tick')).toBe(state);
    expect(run(state, 'toggle')).toEqual({ index: 0, playing: true });
    expect(run({ index: 2, playing: true }, 'toggle')).toEqual({ index: 2, playing: false });
  });

  it('maps keys', () => {
    expect(['ArrowRight', 'ArrowLeft', ' ', 'Home', 'End', 'x'].map(replayKeyAction)).toEqual(['next', 'prev', 'toggle', 'first', 'last', null]);
  });

  it('leaves Space to a focused button, link or summary, but keeps stepping keys handled there', () => {
    expect(shouldHandleReplayKey({ key: ' ', insideInteractive: true })).toBe(false);
    expect(shouldHandleReplayKey({ key: 'Spacebar', insideInteractive: true })).toBe(false);
    expect(shouldHandleReplayKey({ key: ' ', insideInteractive: false })).toBe(true);
    expect(shouldHandleReplayKey({ key: 'ArrowRight', insideInteractive: true })).toBe(true);
    expect(shouldHandleReplayKey({ key: 'ArrowLeft', insideInteractive: true })).toBe(true);
    expect(shouldHandleReplayKey({ key: 'Home', insideInteractive: true })).toBe(true);
    expect(shouldHandleReplayKey({ key: 'End', insideInteractive: true })).toBe(true);
    expect(shouldHandleReplayKey({ key: 'x', insideInteractive: false })).toBe(false);
  });
});
