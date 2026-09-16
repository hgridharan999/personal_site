// Builds the HandRecord for a completed hand (contracts §4). Pure apart from the default id.
import { reduceHand } from '../engine/handState.js';
import { potTotal } from './pot.js';

/**
 * @typedef {{
 *   v: 1, id: string, sessionId: string, handNo: number, playedAt: string, botVersion: string,
 *   heroSeat: number, buttonSeat: number,
 *   lineup: { seat:number, personaId:string }[],
 *   startStacks: { seat:number, stack:number }[],
 *   events: object[], heroNet: number, pot: number, showdown: boolean,
 * }} HandRecord
 */

/**
 * Signature per contracts §4.1. `state` is the final state for `events`; it is recomputed when omitted.
 * @param {{ id?:string, sessionId:string, handNo:number, playedAt:string, botVersion:string, heroSeat:number,
 *   lineup:{seat:number, personaId:string}[], events:object[], state?:object }} input
 * @returns {HandRecord}
 */
export function buildHandRecord({
  id = crypto.randomUUID(), sessionId, handNo, playedAt, botVersion, heroSeat, lineup, events, state = null,
}) {
  const start = events[0];
  if (!start || start.type !== 'start') throw new Error('events must begin with a start event');
  const final = state ?? reduceHand(events);
  if (final.street !== 'complete') throw new Error('hand is not complete');
  return {
    v: 1,
    id,
    sessionId,
    handNo,
    playedAt,
    botVersion,
    heroSeat,
    buttonSeat: start.button,
    lineup: lineup.map(({ seat, personaId }) => ({ seat, personaId })),
    startStacks: start.seats.map(({ seat, stack }) => ({ seat, stack })),
    events: structuredClone(events),
    heroNet: final.result.net[heroSeat],
    pot: potTotal(final),
    showdown: final.result.showdown,
  };
}
