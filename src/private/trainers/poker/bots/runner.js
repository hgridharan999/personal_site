// src/private/trainers/poker/bots/runner.js
import { createBrain } from './index.js';

/** @returns {{ decide:(ctx:import('./contract.js').BotContext) => Promise<import('./contract.js').BotChoice>, dispose:() => void }} */
export function createLocalRunner({ rng }) {
  let disposed = false;
  return {
    async decide(ctx) {
      if (disposed) throw new Error('runner disposed');
      return createBrain(ctx.persona).decide(ctx, rng);
    },
    dispose() { disposed = true; },
  };
}
