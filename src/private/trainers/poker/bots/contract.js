// src/private/trainers/poker/bots/contract.js
/**
 * @typedef {{ id:string, name:string, tag:string, style:string, brain:string, dials?:Record<string,number> }} Persona
 *   tag: 3 uppercase letters shown on the seat tile. style: hidden label revealed after a session.
 *   brain: key into the brain registry (bots/index.js).
 * @typedef {{ view:object, seat:number, legal:object, events:object[], persona:Persona, profile:PlayerProfile|null, heroSeat?:number|null, bb:number }} BotContext
 *   view = viewFor(state, seat); events = eventsFor(handEvents, seat); legal = legalActions(state); bb in units (2).
 *   heroSeat: the seat whose tendencies the profile describes (the human). Brains adapt only when it is set.
 * @typedef {{ action:'fold'|'check'|'call'|'bet'|'raise', amount?:number }} BotChoice   amount only for bet/raise (units, raise-to)
 * @typedef {{ decide:(ctx:BotContext, rng:() => number) => BotChoice }} Brain            synchronous, pure given rng
 * @typedef {{ value:number|null, n:number }} ProfileStat                                  value in [0,1] or null when n = 0
 * @typedef {{ hands:number, stats:Record<string, ProfileStat> }} PlayerProfile
 */

export const PROFILE_STATS = Object.freeze([
  'vpip', 'pfr', 'threeBet', 'foldTo3Bet', 'cbetFlop', 'cbetTurn', 'foldToCbetFlop', 'foldToCbetTurn',
  'checkRaise', 'wtsd', 'wsd', 'aggFreq', 'foldToRiverBet', 'riverBetFreq',
]);

export function emptyProfile() {
  return { hands: 0, stats: Object.fromEntries(PROFILE_STATS.map((k) => [k, { value: null, n: 0 }])) };
}
