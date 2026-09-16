// The pot: every chip put into the hand, including bets still in front of players on the current street.

/** @param {{ players: { total:number }[] }} hand an engine state or a seat view of one */
export const potTotal = (hand) => hand.players.reduce((sum, p) => sum + p.total, 0);
