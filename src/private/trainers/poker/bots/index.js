// src/private/trainers/poker/bots/index.js
import { randomLegal, callingStation, rawEquity, tightPassive } from './baselines.js';
import { always3Bet, alwaysCbet, alwaysOverbetRiver } from './probes.js';
import { createHeuristicBrain } from './brain.js';

export const BOT_VERSION = 'placeholder';

const FIXED = { randomLegal, callingStation, rawEquity, tightPassive, always3Bet, alwaysCbet, alwaysOverbetRiver };
export const BRAIN_KEYS = Object.freeze([...Object.keys(FIXED), 'heuristic']);

// Heuristic brains keep a per-hand range cache, so reuse one per persona object and options.
const heuristicCache = new WeakMap();

/**
 * @param {import('./contract.js').Persona} persona
 * @param {{ iterations?:number, budgetMs?:number, now?:() => number }} [options] heuristic brain equity budget
 * @returns {import('./contract.js').Brain}
 */
export function createBrain(persona, options) {
  if (persona.brain === 'heuristic') {
    if (options) return createHeuristicBrain(options);
    if (!heuristicCache.has(persona)) heuristicCache.set(persona, createHeuristicBrain());
    return heuristicCache.get(persona);
  }
  const brain = FIXED[persona.brain];
  if (!brain) throw new Error(`Unknown brain: ${persona.brain}`);
  return brain;
}
