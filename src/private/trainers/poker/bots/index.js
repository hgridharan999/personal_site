// src/private/trainers/poker/bots/index.js
import { randomLegal, callingStation, rawEquity, tightPassive } from './baselines.js';
import { always3Bet, alwaysCbet, alwaysOverbetRiver } from './probes.js';
import { createHeuristicBrain } from './brain.js';

export { BOT_VERSION } from './version.js';

const FIXED = { randomLegal, callingStation, rawEquity, tightPassive, always3Bet, alwaysCbet, alwaysOverbetRiver };
export const BRAIN_KEYS = Object.freeze([...Object.keys(FIXED), 'heuristic']);

// Heuristic brains keep a per-hand range cache, so callers that hang onto the same persona object
// and options across decisions get the incremental benefit of reusing one brain instead of rebuilding
// its tracker every time. Cache per persona (a WeakMap so a discarded persona's brains can be
// collected) and then per options value, bounded to a handful of entries so a caller that varies
// options doesn't grow the cache without bound.
const heuristicCache = new WeakMap(); // persona -> Map<optionsKey, Brain>
const MAX_OPTIONS_PER_PERSONA = 4;

/**
 * @param {import('./contract.js').Persona} persona
 * @param {{ iterations?:number, budgetMs?:number, now?:() => number }} [options] heuristic brain equity budget
 *   Cached below via `JSON.stringify(options)`, which drops function-valued entries (e.g. `now`)
 *   from the key: two calls that differ only in which `now` function they pass share a cached
 *   brain. Only vary `iterations`/`budgetMs` if callers need distinct cache entries.
 * @returns {import('./contract.js').Brain}
 */
export function createBrain(persona, options) {
  if (persona.brain === 'heuristic') {
    const key = options ? JSON.stringify(options) : '';
    let byOptions = heuristicCache.get(persona);
    if (!byOptions) {
      byOptions = new Map();
      heuristicCache.set(persona, byOptions);
    }
    if (!byOptions.has(key)) {
      if (byOptions.size >= MAX_OPTIONS_PER_PERSONA) byOptions.delete(byOptions.keys().next().value);
      byOptions.set(key, createHeuristicBrain(options));
    }
    return byOptions.get(key);
  }
  const brain = FIXED[persona.brain];
  if (!brain) throw new Error(`Unknown brain: ${persona.brain}`);
  return brain;
}
