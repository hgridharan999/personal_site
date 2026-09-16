// src/private/trainers/poker/engine/view.js
// What one seat is allowed to see. Other players' hole cards are hidden unless shown at showdown.

/** A copy of `state` in which other players' hole cards are null unless shown at showdown. */
export function viewFor(state, seat) {
  const shown = state.street === 'complete' && state.result ? state.result.shown : [];
  return {
    ...state,
    board: state.board.slice(),
    players: state.players.map((p) => ({
      ...p,
      hole: p.seat === seat || shown.includes(p.seat) ? p.hole : null,
    })),
  };
}

/** A copy of `events` in which other seats' `hole` events have `cards: null`. */
export const eventsFor = (events, seat) =>
  events.map((e) => (e.type === 'hole' && e.seat !== seat ? { ...e, cards: null } : e));
