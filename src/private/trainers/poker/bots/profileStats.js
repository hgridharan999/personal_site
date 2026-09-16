// src/private/trainers/poker/bots/profileStats.js
// The one definition of every PROFILE_STATS stat. Phase 4's GET profile imports this module.
//
// accumulateProfile(profile, heroSeat, events) folds ONE completed hand into a profile. `events` must be
// the full log (every hole card) of a hand that reached street 'complete'; anything else, or a log in
// which heroSeat was not dealt in, returns the profile unchanged. Each stat is a running mean of 0/1
// observations; `n` counts opportunities. "Decision" means an `act` event by the hero, judged on the
// state just before it. Preflop raise counts exclude the blinds.
//
// Stat            | Opportunity (at most once per hand unless noted)                        | Hit
// vpip            | hero made at least one preflop decision                                  | hero called or raised preflop
// pfr             | same as vpip                                                             | hero raised preflop
// threeBet        | first hero preflop decision facing exactly one raise, made by someone else | hero raised
// foldTo3Bet      | first hero preflop decision facing exactly two raises where hero made the first | hero folded
// cbetFlop        | first hero flop decision with no flop bet yet, hero made the last preflop raise | hero bet
// cbetTurn        | first hero turn decision with no turn bet yet, hero's flop c-bet opportunity was a bet and hero made the last flop bet or raise | hero bet
// foldToCbetFlop  | first hero flop decision facing exactly one flop bet, made by the last preflop raiser (not hero) | hero folded
// foldToCbetTurn  | first hero turn decision facing exactly one turn bet, made by the player who made the last preflop raise and the first flop bet (not hero) | hero folded
// checkRaise      | per postflop street: first hero decision after hero checked on that street, facing a bet, with a raise allowed | hero raised
// wtsd            | hero had not folded when the flop was dealt                             | hand went to showdown with hero not folded
// wsd             | hand went to showdown with hero not folded                              | hero was awarded chips
// aggFreq         | every hero postflop decision (not once per hand)                         | hero bet or raised
// foldToRiverBet  | first hero river decision facing a bet (toCall > 0)                      | hero folded
// riverBetFreq    | first hero river decision with no river bet yet                          | hero bet
import { applyEvent, legalActions } from '../engine/handState.js';
import { PROFILE_STATS } from './contract.js';

const isAggressive = (action) => action === 'bet' || action === 'raise';

/** @returns {{ stat:string, hit:0|1 }[] | null} observations for one hand, or null if the hand does not count */
export function handObservations(events, heroSeat) {
  const start = events[0];
  if (!start || start.type !== 'start' || !start.seats.some((s) => s.seat === heroSeat)) return null;

  const obs = [];
  const seen = new Set();
  const observe = (stat, hit, once = true) => {
    if (once && seen.has(stat)) return;
    seen.add(stat);
    obs.push({ stat, hit: hit ? 1 : 0 });
  };

  let state = null;
  let preflopActed = false;
  let vpip = false;
  let pfr = false;
  const pfRaisers = [];
  const streetBets = { preflop: 0, flop: 0, turn: 0, river: 0 };
  const firstBettor = {};
  const lastAggressor = {};
  const heroChecked = {};
  let heroFoldedBeforeFlop = null;
  let flopCbetWasBet = false;

  for (const event of events) {
    if (event.type === 'board' && state.street === 'flop' && heroFoldedBeforeFlop === null) {
      heroFoldedBeforeFlop = state.players.find((p) => p.seat === heroSeat).folded;
    }
    if (event.type === 'act' && event.seat === heroSeat) {
      const legal = legalActions(state);
      const street = state.street;
      const { action } = event;
      const bets = streetBets[street];
      if (street === 'preflop') {
        preflopActed = true;
        if (action === 'call' || action === 'raise') vpip = true;
        if (action === 'raise') pfr = true;
        if (pfRaisers.length === 1 && pfRaisers[0] !== heroSeat) observe('threeBet', action === 'raise');
        if (pfRaisers.length === 2 && pfRaisers[0] === heroSeat && pfRaisers[1] !== heroSeat) {
          observe('foldTo3Bet', action === 'fold');
        }
      } else {
        observe('aggFreq', isAggressive(action), false);
        const pfAggressor = pfRaisers[pfRaisers.length - 1];
        if (street === 'flop') {
          if (bets === 0 && pfAggressor === heroSeat && !seen.has('cbetFlop')) {
            flopCbetWasBet = action === 'bet';
            observe('cbetFlop', action === 'bet');
          }
          if (bets === 1 && firstBettor.flop === pfAggressor && pfAggressor !== heroSeat) {
            observe('foldToCbetFlop', action === 'fold');
          }
        }
        if (street === 'turn') {
          if (bets === 0 && flopCbetWasBet && lastAggressor.flop === heroSeat) observe('cbetTurn', action === 'bet');
          if (bets === 1 && pfAggressor !== heroSeat && firstBettor.turn === pfAggressor && firstBettor.flop === pfAggressor) {
            observe('foldToCbetTurn', action === 'fold');
          }
        }
        if (street === 'river') {
          if (legal.toCall > 0) observe('foldToRiverBet', action === 'fold');
          if (bets === 0) observe('riverBetFreq', action === 'bet');
        }
        const crKey = `checkRaise.${street}`;
        if (heroChecked[street] && bets > 0 && legal.canRaise && !seen.has(crKey)) {
          seen.add(crKey);
          obs.push({ stat: 'checkRaise', hit: action === 'raise' ? 1 : 0 });
        }
        if (action === 'check') heroChecked[street] = true;
      }
    }
    if (event.type === 'act') {
      const street = state.street;
      if (isAggressive(event.action)) {
        streetBets[street] += 1;
        if (firstBettor[street] === undefined) firstBettor[street] = event.seat;
        lastAggressor[street] = event.seat;
        if (street === 'preflop') pfRaisers.push(event.seat);
      }
    }
    state = applyEvent(state, event);
  }

  if (!state || state.street !== 'complete') return null;
  if (preflopActed) {
    obs.push({ stat: 'vpip', hit: vpip ? 1 : 0 });
    obs.push({ stat: 'pfr', hit: pfr ? 1 : 0 });
  }
  const hero = state.players.find((p) => p.seat === heroSeat);
  const sawFlop = heroFoldedBeforeFlop === false;
  const wentToShowdown = state.result.showdown && !hero.folded;
  if (sawFlop) obs.push({ stat: 'wtsd', hit: wentToShowdown ? 1 : 0 });
  if (wentToShowdown) obs.push({ stat: 'wsd', hit: (state.result.awards[heroSeat] ?? 0) > 0 ? 1 : 0 });
  return obs;
}

/**
 * Folds one completed hand into `profile` without mutating it.
 * @param {import('./contract.js').PlayerProfile} profile
 * @param {number} heroSeat
 * @param {object[]} events full event log of one completed hand
 * @returns {import('./contract.js').PlayerProfile}
 */
export function accumulateProfile(profile, heroSeat, events) {
  const obs = handObservations(events, heroSeat);
  if (!obs) return profile;
  const stats = {};
  for (const key of PROFILE_STATS) stats[key] = { ...(profile.stats[key] ?? { value: null, n: 0 }) };
  for (const { stat, hit } of obs) {
    const s = stats[stat];
    s.value = s.n === 0 ? hit : (s.value * s.n + hit) / (s.n + 1);
    s.n += 1;
  }
  return { hands: profile.hands + 1, stats };
}
