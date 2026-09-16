// src/private/trainers/poker/bots/baselines.js
import { randomPolicy } from '../engine/simulate.js';

/** @type {import('./contract.js').Brain} */
export const randomLegal = { decide: (ctx, rng) => randomPolicy(ctx.view, ctx.legal, rng) };

/** @type {import('./contract.js').Brain} */
export const callingStation = { decide: (ctx) => (ctx.legal.canCheck ? { action: 'check' } : { action: 'call' }) };
