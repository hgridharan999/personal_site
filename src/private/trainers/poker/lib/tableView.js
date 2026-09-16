// src/private/trainers/poker/lib/tableView.js
// Display data for the table components, derived only from viewFor(state, heroSeat).
import { legalActions } from '../engine/handState.js';
import { viewFor } from '../engine/view.js';
import { getPersona } from '../bots/personas.js';
import { SEAT_COUNT } from './constants.js';

/**
 * @typedef {{ seat:number, slot:number, isHero:boolean, name:string, tag:string, stack:number, bet:number,
 *   inPot:number, isButton:boolean, isActive:boolean, folded:boolean, allIn:boolean,
 *   cards:(number|null)[]|null, won:number }} SeatView
 *   slot 0 is bottom center (hero); slots 1-5 run clockwise: left, top-left, top, top-right, right.
 *   `bet` is the seat's chips on the current street (0 once the hand is complete); `inPot` is everything
 *   the seat has put into this hand so far, including `bet` (the engine player's `total`, 0 with no hand).
 */

export const slotOf = (seat, heroSeat) => (seat - heroSeat + SEAT_COUNT) % SEAT_COUNT;

/** The hero's view of the current or just-finished hand, or null before the first deal. */
export const heroView = (session) => (session.hand ? viewFor(session.hand.state, session.heroSeat) : null);

/** "You" for the hero, otherwise the persona name. */
export function seatName(session, seat) {
  const info = session.seats.find((s) => s.seat === seat);
  return info.kind === 'hero' ? 'You' : getPersona(info.personaId).name;
}

/** @returns {SeatView[]} ordered by slot */
export function seatViews(session) {
  const view = heroView(session);
  const handComplete = view?.street === 'complete';
  // A hand stays live (and its engine stacks are the truth) from the deal through 'complete',
  // until finishHand settles it. tableCore.finishHand does not clear session.hand, but it does set
  // handsCompleted to the hand's number, so that is the signal. session.phase is not: abandonSession
  // ends the session mid-hand without settling, and the engine stacks (with bets out) stay the truth.
  const settled = !session.hand || session.handsCompleted >= session.hand.no;
  return session.seats
    .map((info) => {
      const persona = info.kind === 'bot' ? getPersona(info.personaId) : null;
      const p = view?.players.find((q) => q.seat === info.seat) ?? null;
      return {
        seat: info.seat,
        slot: slotOf(info.seat, session.heroSeat),
        isHero: info.kind === 'hero',
        name: persona ? persona.name : 'You',
        tag: persona ? persona.tag : 'YOU',
        // Once the session has settled the hand (finishHand ran), the seat's settled stack
        // (including a queued rebuy) is the truth; until then, the engine's live stack is.
        stack: p && !settled ? p.stack : info.stack,
        bet: p && !handComplete ? p.committed : 0,
        inPot: p ? p.total : 0,
        isButton: (view ? view.button : session.button) === info.seat,
        isActive: Boolean(view && view.toAct === info.seat),
        folded: Boolean(p?.folded),
        allIn: Boolean(p && !handComplete && p.stack === 0 && !p.folded),
        cards: p && !p.folded ? (p.hole ?? [null, null]) : null,
        won: handComplete ? (view.result.awards[info.seat] ?? 0) : 0,
      };
    })
    .sort((a, b) => a.slot - b.slot);
}

/** Board, pot (chips already collected from earlier streets; the whole pot once complete) and hand number. */
export function tableCenter(session) {
  const view = heroView(session);
  if (!view) return { board: [], pot: 0, handNo: 0, street: null };
  const total = view.players.reduce((sum, p) => sum + p.total, 0);
  const onStreet = view.street === 'complete' ? 0 : view.players.reduce((sum, p) => sum + p.committed, 0);
  return { board: view.board, pot: total - onStreet, handNo: session.hand.no, street: view.street };
}

/** `{ view, legal, stack }` when the hero must act now, else null. */
export function heroTurn(session) {
  const view = heroView(session);
  if (session.phase !== 'playing' || !view || view.needsBoard || view.toAct !== session.heroSeat) return null;
  const me = view.players.find((p) => p.seat === session.heroSeat);
  return { view, legal: legalActions(view), stack: me.stack };
}

/** Changes whenever bets are swept into the pot: a new street, the end of a hand or a new hand. */
export const streetKey = (session) => (session.hand ? `${session.hand.no}:${session.hand.state.street}` : 'none');

const handOfKey = (key) => key.split(':')[0];

/**
 * Chips to animate into the pot when the street key changes, per seat. Within one hand this is what
 * each seat actually added to the pot on the street that just closed: `next.inPot` minus the seat's
 * contribution before that street (`prev.inPot - prev.bet`). That counts the action that closed the
 * street (which `prev` never saw), leaves out an uncalled bet that engine/handState.js returnUncalled
 * refunded, and ignores pot winnings (which change stacks, not contributions). Across hands it falls
 * back to the bets shown in `prev`.
 * @param {{ key:string, seats:SeatView[] }} prev
 * @param {{ key:string, seats:SeatView[] }} next
 * @returns {{ slot:number, amount:number }[]}
 */
export function chipsToCollect(prev, next) {
  if (!prev || prev.key === next.key) return [];
  const sameHand = handOfKey(prev.key) === handOfKey(next.key);
  const nextBySeat = new Map(next.seats.map((s) => [s.seat, s]));
  return prev.seats
    .map(({ seat, slot, bet, inPot }) => {
      const after = nextBySeat.get(seat);
      const amount = sameHand && after ? after.inPot - (inPot - bet) : bet;
      return { slot, amount };
    })
    .filter((x) => x.amount > 0);
}
