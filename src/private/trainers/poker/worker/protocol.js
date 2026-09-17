// src/private/trainers/poker/worker/protocol.js
// Message protocol between the page and pokerWorker.js. The handler is a pure function of its injected
// dependencies so it can be tested in Node without a real Worker.
//   request:  { type:'decide', id:number, ctx:BotContext }
//   response: { type:'decision', id, choice:BotChoice } | { type:'error', id, error:{ message:string } }

export const REQUEST = Object.freeze({ DECIDE: 'decide' });
export const RESPONSE = Object.freeze({ DECISION: 'decision', ERROR: 'error' });

/**
 * @param {{ createBrain:(persona:object, options?:object) => import('../bots/contract.js').Brain, rng:() => number,
 *   brainOptions?:{ iterations?:number, budgetMs?:number, now?:() => number } }} deps
 *   brainOptions is passed through to createBrain for every persona.
 * @returns {(message:unknown) => object} maps one request to one response
 */
export function createMessageHandler({ createBrain, rng, brainOptions }) {
  // Structured clone gives a new persona object per message, so createBrain's by-object cache would miss
  // every time. Keep one brain per persona id, dial set and options key so range tracking stays incremental.
  const brains = new Map();
  const optionsKey = brainOptions ? JSON.stringify(brainOptions) : '';
  const brainFor = (persona) => {
    const key = `${persona.brain}|${persona.id}|${JSON.stringify(persona.dials ?? null)}|${optionsKey}`;
    if (!brains.has(key)) brains.set(key, createBrain(persona, brainOptions));
    return brains.get(key);
  };

  return (message) => {
    const id = message && typeof message === 'object' && Number.isInteger(message.id) ? message.id : null;
    const fail = (text) => ({ type: RESPONSE.ERROR, id, error: { message: text } });
    if (id === null) return fail('malformed message');
    if (message.type !== REQUEST.DECIDE) return fail(`unknown message type: ${message.type}`);
    if (!message.ctx || !message.ctx.persona) return fail('decide needs ctx.persona');
    try {
      return { type: RESPONSE.DECISION, id, choice: brainFor(message.ctx.persona).decide(message.ctx, rng) };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  };
}
