import { reduceHand, EngineError } from '../../src/private/trainers/poker/engine/handState.js';
import { cardsToString } from '../../src/private/trainers/poker/engine/cards.js';

// The stored hand is only trusted after the engine replays it: the log must be a legal,
// complete hand, and the record's summary fields must agree with the replay. The columns
// derived here (board, hole cards, hero stack and action count) are never taken from the client.

const bySeat = (a, b) => a.seat - b.seat;
const seatStacks = (list) => JSON.stringify(list.map(({ seat, stack }) => ({ seat, stack })).sort(bySeat));

/** @returns {{ error: string } | { facts: { heroStartStack:number, heroActions:number, holeCards:{seat:number, cards:string}[], board:string } }} */
export function replayHandRecord(record) {
  let state;
  try {
    state = reduceHand(record.events);
  } catch (err) {
    if (err instanceof EngineError) return { error: `events are not a legal hand (${err.code}: ${err.message})` };
    return { error: 'events could not be replayed' };
  }
  if (!state || state.street !== 'complete') return { error: 'events do not describe a complete hand' };

  const start = record.events[0];
  if (start.button !== record.buttonSeat) return { error: 'buttonSeat does not match the start event' };
  if (seatStacks(start.seats) !== seatStacks(record.startStacks)) return { error: 'startStacks do not match the start event' };
  const hero = state.players.find((p) => p.seat === record.heroSeat);
  if (!hero) return { error: 'heroSeat is not seated in this hand' };
  const seatedBots = new Set(start.seats.map((s) => s.seat).filter((seat) => seat !== record.heroSeat));
  const lineupSeats = record.lineup.map((entry) => entry.seat);
  const lineupSet = new Set(lineupSeats);
  const lineupMatches = lineupSet.size === lineupSeats.length
    && lineupSet.size === seatedBots.size
    && [...lineupSet].every((seat) => seatedBots.has(seat));
  if (!lineupMatches) return { error: 'lineup does not match the seated bots' };
  if (record.heroNet !== state.result.net[record.heroSeat]) return { error: 'heroNet does not match the replayed result' };
  const pot = state.players.reduce((sum, p) => sum + p.total, 0);
  if (record.pot !== pot) return { error: 'pot does not match the replayed contributions' };
  if (record.showdown !== state.result.showdown) return { error: 'showdown does not match the replayed result' };

  return {
    facts: {
      heroStartStack: start.seats.find((s) => s.seat === record.heroSeat).stack,
      heroActions: record.events.filter((e) => e.type === 'act' && e.seat === record.heroSeat).length,
      holeCards: state.players.map((p) => ({ seat: p.seat, cards: cardsToString(p.hole) })),
      board: cardsToString(state.board),
    },
  };
}
