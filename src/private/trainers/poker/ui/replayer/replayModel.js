// src/private/trainers/poker/ui/replayer/replayModel.js
// Pure replay of a stored hand (spec §7.3): steps through the event log, builds Phase 2 seat views for the
// pixel table (hero cards only unless reveal-all), log lines, and the hero decisions to show at each step.
import { applyEvent } from '../../engine/handState.js';
import { seatViews, tableCenter } from '../../lib/tableView.js';
import { logLines } from '../../lib/actionLog.js';
import { getPersona } from '../../bots/personas.js';
import { decisionPoints } from '../../analysis/spots.js';
import { chartCheck } from '../../analysis/preflopCheck.js';

export const PLAY_INTERVAL_MS = 900;
export const REPLAY_START = Object.freeze({ index: 0, playing: false });

export function buildSteps(events) {
  const firstPlay = events.findIndex((e) => e.type === 'act' || e.type === 'board');
  const dealtIdx = firstPlay === -1 ? events.length - 1 : firstPlay - 1;
  const steps = [];
  let state = null;
  events.forEach((event, i) => {
    state = applyEvent(state, event);
    if (i >= dealtIdx) steps.push({ eventIdx: i, state });
  });
  return steps;
}

const lineupOf = (hand) => new Map(hand.lineup.map((entry) => [entry.seat, entry.personaId]));

export function nameOfSeat(hand) {
  const lineup = lineupOf(hand);
  return (seat) => (seat === hand.heroSeat ? 'You' : getPersona(lineup.get(seat)).name);
}

// A TableSession-shaped object for Phase 2's seatViews/tableCenter at one step.
function replaySession(hand, step) {
  const lineup = lineupOf(hand);
  for (const personaId of lineup.values()) getPersona(personaId); // fail fast with "Unknown persona: <id>"
  return {
    heroSeat: hand.heroSeat,
    seats: hand.events[0].seats.map(({ seat, stack }) => ({
      seat, kind: seat === hand.heroSeat ? 'hero' : 'bot', personaId: lineup.get(seat) ?? null, stack,
    })),
    hand: { no: hand.handNo, state: step.state },
    phase: 'playing',
    button: hand.buttonSeat,
  };
}

export function frameAt(hand, steps, index, { revealAll = false } = {}) {
  const step = steps[index];
  const session = replaySession(hand, step);
  let seats = seatViews(session);
  if (revealAll) {
    const holes = new Map(step.state.players.map((p) => [p.seat, p.hole]));
    seats = seats.map((s) => (s.isHero ? s : { ...s, cards: holes.get(s.seat) ?? s.cards }));
  }
  return { seats, center: tableCenter(session) };
}

export const stepLines = (hand, steps, index) =>
  logLines(hand.events.slice(0, steps[index].eventIdx + 1), { nameOf: nameOfSeat(hand), heroSeat: hand.heroSeat });

export function stepDescription(hand, steps, index) {
  const lines = stepLines(hand, steps, index);
  return lines.length > 0 ? lines[lines.length - 1] : 'Cards dealt';
}

export function decisionAt(decisions, steps, index) {
  const idx = steps[index]?.eventIdx;
  return decisions.find((d) => d.idx === idx) ?? null;
}

export function decisionMarks(steps, decisions) {
  return decisions
    .map((d) => ({ idx: d.idx, step: steps.findIndex((s) => s.eventIdx === d.idx), street: d.street, grade: d.grade, confident: d.confident }))
    .filter((mark) => mark.step >= 0);
}

/** The step of the decision named by ?d=<idx>, else the first step. */
export function initialStepIndex(steps, decisions, dParam) {
  if (dParam === null || dParam === undefined || dParam === '') return 0;
  const idx = Number(dParam);
  if (!Number.isInteger(idx) || !decisions.some((d) => d.idx === idx)) return 0;
  return Math.max(0, steps.findIndex((s) => s.eventIdx === idx));
}

/** Chart frequencies for a preflop decision graded by the chart (no evByOption), for its explanation. */
export function chartForDecision(hand, decision) {
  if (decision.street !== 'preflop' || Object.keys(decision.recommended.evByOption).length > 0) return null;
  const point = decisionPoints(hand.events, hand.heroSeat).find((p) => p.idx === decision.idx);
  return point ? chartCheck(point) : null;
}

export function replayReducer(state, action) {
  const last = Math.max(0, action.count - 1);
  switch (action.type) {
    case 'next':
      return { index: Math.min(last, state.index + 1), playing: false };
    case 'prev':
      return { index: Math.max(0, state.index - 1), playing: false };
    case 'first':
      return { index: 0, playing: false };
    case 'last':
      return { index: last, playing: false };
    case 'goto':
      return { index: Math.max(0, Math.min(last, action.index)), playing: false };
    case 'toggle':
      if (state.playing) return { ...state, playing: false };
      return { index: state.index >= last ? 0 : state.index, playing: true };
    case 'tick': {
      if (!state.playing) return state;
      const index = Math.min(last, state.index + 1);
      return { index, playing: index < last };
    }
    default:
      return state;
  }
}

const KEY_ACTIONS = { ArrowRight: 'next', ArrowLeft: 'prev', ' ': 'toggle', Spacebar: 'toggle', Home: 'first', End: 'last' };

export const replayKeyAction = (key) => KEY_ACTIONS[key] ?? null;
