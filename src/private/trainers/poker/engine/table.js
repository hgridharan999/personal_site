// src/private/trainers/poker/engine/table.js
// Between-hand helpers.

export function nextButton(seatIds, previous) {
  const sorted = [...seatIds].sort((a, b) => a - b);
  return sorted.find((seat) => seat > previous) ?? sorted[0];
}

export const stacksAfter = (state) => state.players.map(({ seat, stack }) => ({ seat, stack }));
