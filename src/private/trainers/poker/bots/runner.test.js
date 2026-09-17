// src/private/trainers/poker/bots/runner.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { getPersona } from './personas.js';
import { createLocalRunner } from './runner.js';
import { contextAfter } from './testHands.js';

const station = { id: 'station', name: 'Station', tag: 'STN', style: 'baseline', brain: 'callingStation' };

describe('createLocalRunner', () => {
  it('resolves decide to the brain choice for a callingStation persona', async () => {
    const runner = createLocalRunner({ rng: () => 0.5 });
    const ctx = { view: {}, seat: 0, legal: { canCheck: true }, events: [], persona: station, profile: null, bb: 2 };
    const choice = await runner.decide(ctx);
    expect(choice).toEqual({ action: 'check' });
  });

  it('runs a shipped heuristic persona to a legal choice', async () => {
    const cx = contextAfter(['r 2 5']);
    const runner = createLocalRunner({ rng: mulberry32(1) });
    const choice = await runner.decide({ view: cx.view, seat: cx.seat, legal: cx.legal, events: cx.seatEvents, persona: getPersona('duchess'), profile: null, bb: 2 });
    expect(['fold', 'call', 'raise']).toContain(choice.action);
  });

  it('rejects after dispose', async () => {
    const runner = createLocalRunner({ rng: () => 0.5 });
    runner.dispose();
    const ctx = { view: {}, seat: 0, legal: { canCheck: true }, events: [], persona: station, profile: null, bb: 2 };
    await expect(runner.decide(ctx)).rejects.toThrow('runner disposed');
  });
});
