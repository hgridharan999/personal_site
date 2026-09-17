// src/private/trainers/poker/leaks/spotCopy.js
// Labels and plain-language coaching copy for decision spots (spec §7.4 focus card).
// `parseSpot` and `spotLabel` already live in ../analysis/spots.js (Phase 5): they read the same
// spot grammar (`pf.<situation>` or `<flop|turn|river>.<situation>[.<modifier>…]`, where a modifier
// `ip` or `oop` gives the hero's position) and produce the exact labels this module's tests expect,
// including the `.multiway.` modifier and unparseable/unknown inputs. Re-exported here rather than
// duplicated. Only `SPOT_SITUATIONS` and `focusCopy` are new in this module. Nothing here throws.
export { parseSpot, spotLabel } from '../analysis/spots.js';

import { parseSpot } from '../analysis/spots.js';

const STREET_LABEL = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

export const SPOT_SITUATIONS = {
  preflop: ['open', 'vs_limp', 'vs_open', 'squeeze', 'vs_3bet', 'vs_4bet'],
  postflop: ['cbet', 'no_bet', 'facing_bet', 'facing_raise'],
};

const COPY = {
  'preflop.open': {
    title: 'Opening the pot',
    body: 'You lose the most when the action folds to you preflop. The usual causes are opening weak hands from early seats, limping instead of raising, or folding hands that are profitable opens from the cutoff and button.',
  },
  'preflop.vs_limp': {
    title: 'Pots with limpers',
    body: 'You lose the most when someone has limped in front of you. Raising strong and playable hands to isolate usually beats limping behind, and weak offsuit hands are a fold.',
  },
  'preflop.vs_open': {
    title: 'Facing an open',
    body: 'You lose the most when someone has already raised. The usual causes are calling too wide out of position, not 3-betting your best hands, or defending the blinds with hands that rarely win after the flop.',
  },
  'preflop.squeeze': {
    title: 'A raise and callers',
    body: 'You lose the most when there is a raise and a call in front of you. These pots grow fast: re-raise your strong hands and fold marginal ones rather than calling into a multiway pot.',
  },
  'preflop.vs_3bet': {
    title: 'Facing a 3-bet',
    body: 'You lose the most after your open gets 3-bet. The usual causes are folding too often, which is easy to exploit, or calling out of position with hands that play badly in big pots.',
  },
  'preflop.vs_4bet': {
    title: 'Facing a 4-bet',
    body: 'You lose the most after a 4-bet. Ranges are narrow by now: continue with the top of your range and let the rest go.',
  },
  'postflop.cbet': {
    title: 'Continuation bets',
    body: 'You lose the most when you were the last to raise and it is your turn to bet or check. The usual causes are betting boards that favor the caller, or checking strong hands and draws that should build the pot.',
  },
  'postflop.no_bet': {
    title: 'No bet yet',
    body: 'You lose the most when nobody has bet yet on the street. The usual causes are betting hands that cannot make better hands fold, or checking back hands that should bet for value.',
  },
  'postflop.facing_bet': {
    title: 'Facing a bet',
    body: 'You lose the most when you face a bet. Compare the price to your chance of winning: calling without enough equity and folding too often to small bets both show up here.',
  },
  'postflop.facing_raise': {
    title: 'Facing a raise',
    body: 'You lose the most when your bet gets raised. Raises are usually strong: continue with hands that beat a value range or have a good draw, and fold the rest.',
  },
};

const POSITION_SENTENCE = {
  ip: ' You are in position here, so you act last and see what they do first.',
  oop: ' You are out of position here, which makes marginal calls harder to play well.',
};

const ACTION_WORD = { fold: 'folding', check: 'checking', call: 'calling', bet: 'betting', raise: 'raising' };

function baseCopy(parsed) {
  if (!parsed) {
    return { title: 'Your costliest spot', body: 'This spot costs you the most. Review the example hands to see what the decisions have in common.' };
  }
  const group = parsed.street === 'preflop' ? 'preflop' : 'postflop';
  const key = `${group}.${parsed.situation}`;
  if (Object.hasOwn(COPY, key)) return COPY[key];
  return {
    title: `${STREET_LABEL[parsed.street]} decisions`,
    body: `This ${parsed.street} spot costs you the most. Review the example hands to see what the decisions have in common.`,
  };
}

/** Focus card copy for a spot, naming its position and, when known, the action that lost the most. */
export function focusCopy(spot, { costliestAction = null } = {}) {
  const parsed = parseSpot(spot);
  const { title, body } = baseCopy(parsed);
  let text = body;
  if (parsed?.position) text += POSITION_SENTENCE[parsed.position];
  if (typeof costliestAction === 'string' && Object.hasOwn(ACTION_WORD, costliestAction)) {
    text += ` Most of the EV lost came from ${ACTION_WORD[costliestAction]}.`;
  }
  return { title, body: text };
}
