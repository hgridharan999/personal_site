// src/private/trainers/poker/bots/runner.js
import { createBrain } from './index.js';

/**
 * @param {{ rng:() => number, brainOptions?:{ iterations?:number, budgetMs?:number, now?:() => number } }} options
 *   brainOptions is passed to createBrain for every decision (tests pass `budgetMs: Infinity` for determinism).
 * @returns {{ decide:(ctx:import('./contract.js').BotContext) => Promise<import('./contract.js').BotChoice>, dispose:() => void }}
 */
export function createLocalRunner({ rng, brainOptions }) {
  let disposed = false;
  return {
    async decide(ctx) {
      if (disposed) throw new Error('runner disposed');
      return createBrain(ctx.persona, brainOptions).decide(ctx, rng);
    },
    dispose() { disposed = true; },
  };
}
