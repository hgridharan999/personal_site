// src/private/trainers/poker/bots/runner.test.js
import { describe, it, expect } from 'vitest';
import { getPersona } from './personas.js';
import { createLocalRunner } from './runner.js';

describe('createLocalRunner', () => {
  it('resolves decide to the brain choice for a callingStation persona', async () => {
    const runner = createLocalRunner({ rng: () => 0.5 });
    const persona = getPersona('moss'); // callingStation
    const ctx = { view: {}, seat: 0, legal: { canCheck: true }, events: [], persona, profile: null, bb: 2 };
    const choice = await runner.decide(ctx);
    expect(choice).toEqual({ action: 'check' });
  });

  it('rejects after dispose', async () => {
    const runner = createLocalRunner({ rng: () => 0.5 });
    runner.dispose();
    const persona = getPersona('moss');
    const ctx = { view: {}, seat: 0, legal: { canCheck: true }, events: [], persona, profile: null, bb: 2 };
    await expect(runner.decide(ctx)).rejects.toThrow('runner disposed');
  });
});
