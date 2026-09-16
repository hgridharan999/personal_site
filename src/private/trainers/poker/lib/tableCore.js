// The local cash-game session as a pure, synchronous state machine. No timers, no React.
// The async driver (tableDriver.js) decides *when* each step runs; this module decides *what* it does.
import { applyEvent, legalActions, reduceHand } from '../engine/handState.js';
import { dealHand } from '../engine/dealer.js';
import { nextButton, stacksAfter } from '../engine/table.js';
import { viewFor, eventsFor } from '../engine/view.js';
import { getPersona } from '../bots/personas.js';
import { buildHandRecord } from './handRecord.js';
import { refillPersonaId } from './lineup.js';
import { SEAT_COUNT, HERO_SEAT, SB, BB, BUY_IN, REBUY_BELOW } from './constants.js';

/**
 * @typedef {{ seat:number, kind:'hero'|'bot', personaId:string|null, stack:number }} SeatInfo
 *   stack is as of the last completed hand.
 * @typedef {{ no:number, playedAt:string, button:number, lineup:{seat:number, personaId:string}[],
 *   events:object[], state:object, boardEvent:(street:string) => object }} LiveHand
 * @typedef {{
 *   id:string, tableMode:'random'|'custom', startedAt:string, heroSeat:number,
 *   seats:SeatInfo[], button:number|null, hand:LiveHand|null, handsCompleted:number,
 *   phase:'idle'|'playing'|'between'|'needsRebuy'|'ended',
 *   buyIns:number, rebuys:number, rebuyPending:boolean, getUpPending:boolean, seenPersonaIds:string[],
 * }} TableSession
 *   seenPersonaIds: every persona that has sat at the table this session, in order of arrival, once each.
 * @typedef {{type:'idle'} | {type:'board'} | {type:'hero', seat:number} | {type:'bot', seat:number} | {type:'complete'}} Step
 */

const fail = (message) => {
  throw new Error(message);
};

const heroInfo = (session) => session.seats.find((s) => s.seat === session.heroSeat);

const botLineup = (seats) => seats.filter((s) => s.kind === 'bot').map(({ seat, personaId }) => ({ seat, personaId }));

/** A new session: hero in seat 0 and `lineup` in seats 1-5, everyone with 100 BB. */
export function createSession({ id, tableMode, lineup, startedAt }) {
  const seats = Array.from({ length: SEAT_COUNT }, (_, seat) => {
    if (seat === HERO_SEAT) return { seat, kind: 'hero', personaId: null, stack: BUY_IN };
    const entry = lineup.find((x) => x.seat === seat) ?? fail(`lineup has no bot for seat ${seat}`);
    return { seat, kind: 'bot', personaId: entry.personaId, stack: BUY_IN };
  });
  return {
    id, tableMode, startedAt, heroSeat: HERO_SEAT, seats, button: null, hand: null, handsCompleted: 0,
    phase: 'idle', buyIns: BUY_IN, rebuys: 0, rebuyPending: false, getUpPending: false,
    seenPersonaIds: [...new Set(lineup.map((x) => x.personaId))],
  };
}

/** The `onSessionStart` payload (contracts §4). */
export function sessionStartInfo(session, botVersion) {
  const { id, startedAt, tableMode, heroSeat } = session;
  return { id, startedAt, botVersion, tableMode, lineup: botLineup(session.seats), heroSeat };
}

/** Refills busted bots, moves the button and deals. `now` is the ISO hand start time. */
export function startHand(session, { rng, now, personas }) {
  if (session.phase !== 'idle' && session.phase !== 'between') fail(`cannot start a hand while ${session.phase}`);
  if (heroInfo(session).stack <= 0) fail('hero has no chips');
  const seats = session.seats.map((s) => ({ ...s }));
  const seen = new Set(session.seenPersonaIds);
  for (const s of seats) {
    if (s.kind !== 'bot' || s.stack > 0) continue;
    const seated = seats.filter((x) => x.kind === 'bot').map((x) => x.personaId);
    s.personaId = refillPersonaId(seated, personas, rng, s.personaId);
    s.stack = BUY_IN;
    seen.add(s.personaId);
  }
  const seatIds = seats.map((s) => s.seat);
  const button = session.button === null ? seatIds[Math.floor(rng() * seatIds.length)] : nextButton(seatIds, session.button);
  const deal = dealHand({ seats: seats.map(({ seat, stack }) => ({ seat, stack })), button, sb: SB, bb: BB, rng });
  const hand = {
    no: session.handsCompleted + 1,
    playedAt: now,
    button,
    lineup: botLineup(seats),
    events: deal.events,
    state: reduceHand(deal.events),
    boardEvent: deal.boardEvent,
  };
  return { ...session, seats, button, hand, phase: 'playing', seenPersonaIds: [...seen] };
}

/** What has to happen next. Only a `playing` session has steps. */
export function nextStep(session) {
  if (session.phase !== 'playing' || !session.hand) return { type: 'idle' };
  const { state } = session.hand;
  if (state.street === 'complete') return { type: 'complete' };
  if (state.needsBoard) return { type: 'board' };
  if (state.toAct === session.heroSeat) return { type: 'hero', seat: state.toAct };
  return { type: 'bot', seat: state.toAct };
}

const withEvent = (session, event) => ({
  ...session,
  hand: { ...session.hand, events: [...session.hand.events, event], state: applyEvent(session.hand.state, event) },
});

/** Deals the flop, turn or river that the hand is waiting for. */
export function dealBoard(session) {
  if (nextStep(session).type !== 'board') fail('no board card is due');
  return withEvent(session, session.hand.boardEvent(session.hand.state.needsBoard));
}

/** Applies `choice` ({action, amount?}) for `seat`. Throws EngineError for illegal actions. */
export function applyAction(session, seat, choice) {
  const step = nextStep(session);
  if ((step.type !== 'hero' && step.type !== 'bot') || step.seat !== seat) fail(`seat ${seat} is not due to act`);
  const event = { type: 'act', seat, action: choice.action };
  if ((choice.action === 'bet' || choice.action === 'raise') && choice.amount !== undefined) event.amount = choice.amount;
  return withEvent(session, event);
}

/**
 * The BotContext (contracts §3.2) for a bot seat. Only seat-filtered views go to the bot.
 * `heroSeat` (contracts §4.1) is the seat `profile` belongs to; bots adapt only when it is set.
 */
export function botContext(session, seat, profile = null) {
  const { state, events } = session.hand;
  const info = session.seats.find((s) => s.seat === seat);
  return {
    view: viewFor(state, seat),
    seat,
    legal: legalActions(state),
    events: eventsFor(events, seat),
    persona: getPersona(info.personaId),
    profile,
    heroSeat: session.heroSeat,
    bb: BB,
  };
}

function applyRebuy(session) {
  const hero = heroInfo(session);
  if (hero.stack >= REBUY_BELOW) return { ...session, rebuyPending: false };
  const added = BUY_IN - hero.stack;
  return {
    ...session,
    seats: session.seats.map((s) => (s.seat === session.heroSeat ? { ...s, stack: BUY_IN } : s)),
    buyIns: session.buyIns + added,
    rebuys: session.rebuys + 1,
    rebuyPending: false,
  };
}

/** Settles a completed hand: stacks, pending rebuy or get-up, and the HandRecord. */
export function finishHand(session, { botVersion, createId }) {
  if (nextStep(session).type !== 'complete') fail('hand is not complete');
  const { hand } = session;
  const record = buildHandRecord({
    id: createId(), sessionId: session.id, handNo: hand.no, playedAt: hand.playedAt, botVersion,
    heroSeat: session.heroSeat, lineup: hand.lineup, events: hand.events, state: hand.state,
  });
  const stacks = new Map(stacksAfter(hand.state).map((x) => [x.seat, x.stack]));
  let next = {
    ...session,
    seats: session.seats.map((s) => ({ ...s, stack: stacks.get(s.seat) ?? s.stack })),
    handsCompleted: hand.no,
  };
  if (next.getUpPending) return { session: { ...next, phase: 'ended', rebuyPending: false }, record };
  if (next.rebuyPending) next = applyRebuy(next);
  const phase = heroInfo(next).stack <= 0 ? 'needsRebuy' : 'between';
  return { session: { ...next, phase }, record };
}

/**
 * True when the rebuy prompt should show: under 40 BB (as of the last completed hand), not already
 * queued, and not getting up after this hand (a queued rebuy would be dropped anyway).
 */
export function canRebuy(session) {
  return session.phase !== 'ended' && !session.rebuyPending && !session.getUpPending && heroInfo(session).stack < REBUY_BELOW;
}

/** Tops up to 100 BB now, or after the current hand if one is being played. */
export function requestRebuy(session) {
  if (!canRebuy(session)) return session;
  if (session.phase === 'playing') return { ...session, rebuyPending: true };
  return { ...applyRebuy(session), phase: 'between' };
}

/** Ends the session now between hands, or after the current hand. */
export function requestGetUp(session) {
  if (session.phase === 'ended') return session;
  if (session.phase === 'playing') return { ...session, getUpPending: true };
  return { ...session, phase: 'ended', rebuyPending: false };
}

/** Ends immediately, discarding a hand in progress (e.g. the page is closed). */
export const abandonSession = (session) => ({ ...session, phase: 'ended', rebuyPending: false });

/** The `onSessionEnd` payload (contracts §4). Counts completed hands only. */
export function sessionSummary(session, endedAt) {
  return {
    id: session.id,
    endedAt,
    hands: session.handsCompleted,
    net: heroInfo(session).stack - session.buyIns,
    rebuys: session.rebuys,
  };
}
