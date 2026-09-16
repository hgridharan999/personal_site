// src/private/trainers/poker/lib/tableView.js
// Display data for the table components, derived only from viewFor(state, heroSeat).
import { legalActions } from '../engine/handState.js';
import { viewFor } from '../engine/view.js';
import { getPersona } from '../bots/personas.js';
import { SEAT_COUNT } from './constants.js';

/**
 * @typedef {{ seat:number, slot:number, isHero:boolean, name:string, tag:string, stack:number, bet:number,
 *   isButton:boolean, isActive:boolean, folded:boolean, allIn:boolean, cards:(number|null)[]|null, won:number }} SeatView
 *   slot 0 is bottom center (hero); slots 1-5 run clockwise: left, top-left, top, top-right, right.
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
  // until finishHand settles it and moves the session out of 'playing'. tableCore.finishHand
  // does not clear session.hand, so `handComplete` alone can't tell "just finished" apart from
  // "settled" — session.phase is the signal for that.
  const settled = session.phase !== 'playing';
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

/**
 * Bets to animate into the pot when the street key changes. When the street's closing action
 * triggers an uncalled-bet refund (engine/handState.js returnUncalled), the excess goes straight
 * back to the raiser's stack before `next` is captured, so the swept amount is the seat's `prev`
 * bet minus whatever came back to their stack, not the raw bet.
 * @param {{ key:string, seats:SeatView[] }} prev
 * @param {{ key:string, seats:SeatView[] }} next
 * @returns {{ slot:number, amount:number }[]}
 */
export function chipsToCollect(prev, next) {
  if (!prev || prev.key === next.key) return [];
  const nextBySeat = new Map(next.seats.map((s) => [s.seat, s]));
  return prev.seats
    .filter((s) => s.bet > 0)
    .map(({ seat, slot, bet, stack }) => {
      const after = nextBySeat.get(seat);
      const refunded = after ? Math.max(0, after.stack - stack) : 0;
      return { slot, amount: bet - refunded };
    });
}
