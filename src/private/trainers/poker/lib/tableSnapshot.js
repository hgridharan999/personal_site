// src/private/trainers/poker/lib/tableSnapshot.js
// The hero-safe copy of a TableSession that React state and component props hold.
import { viewFor } from '../engine/view.js';
import { logLines } from './actionLog.js';
import { seatName } from './tableView.js';

/**
 * @typedef {{ no:number, playedAt:string, button:number, state:object, log:string[], eventCount:number }} SnapshotHand
 *   `state` is viewFor(state, heroSeat); `log` is the action log lines; `eventCount` changes with every event.
 */

/**
 * A TableSession with its live hand replaced by what the hero may see. The raw hand carries every
 * seat's hole cards in `state` and `events`, and the undealt board inside `boardEvent`; none of that
 * is kept. lib/tableView.js, canRebuy and sessionSummary read a snapshot exactly as they read a session.
 * @param {import('./tableCore.js').TableSession} session
 * @returns {Omit<import('./tableCore.js').TableSession, 'hand'> & { hand: SnapshotHand|null }}
 */
export function tableSnapshot(session) {
  const { hand } = session;
  if (!hand) return { ...session, hand: null };
  const nameOf = (seat) => seatName(session, seat);
  return {
    ...session,
    hand: {
      no: hand.no,
      playedAt: hand.playedAt,
      button: hand.button,
      state: viewFor(hand.state, session.heroSeat),
      log: logLines(hand.events, { nameOf, heroSeat: session.heroSeat }),
      eventCount: hand.events.length,
    },
  };
}
