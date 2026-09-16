// src/private/trainers/poker/bots/index.js
import { randomLegal, callingStation } from './baselines.js';

export const BOT_VERSION = 'placeholder';
const BRAINS = { randomLegal, callingStation };

/** @returns {import('./contract.js').Brain} */
export function createBrain(persona) {
  const brain = BRAINS[persona.brain];
  if (!brain) throw new Error(`Unknown brain: ${persona.brain}`);
  return brain;
}
