import { describe, it, expect } from 'vitest';
import { buildZetamacPayload } from './payload.js';
import { ZETAMAC_DEFAULTS } from './generator.js';
import { configKey } from '../core/configKey.js';

const attempts = [
  { idx: 0, qtype: 'z.add', factKey: 'add:2+3', prompt: '2 + 3', answer: '5', response: '5', isCorrect: true, timeMs: 900, corrections: 0 },
  { idx: 1, qtype: 'z.mul', factKey: 'mul:7x8', prompt: '7 × 8', answer: '56', response: '5', isCorrect: false, timeMs: null, corrections: 0 },
];

describe('buildZetamacPayload', () => {
  it('builds a valid session payload', async () => {
    const options = { ...ZETAMAC_DEFAULTS };
    const payload = await buildZetamacPayload({
      id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c', options, mode: 'standard', startedAt: '2026-09-14T18:00:00.000Z', attempts,
    });
    expect(payload.session).toEqual({
      id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c',
      trainer: 'zetamac',
      mode: 'standard',
      config: options,
      configKey: await configKey({ trainer: 'zetamac', config: options }),
      profileVersion: null,
      startedAt: '2026-09-14T18:00:00.000Z',
      durationMs: 120000,
      correct: 1, wrong: 0, unanswered: 0, score: 1,
    });
    expect(payload.attempts).toBe(attempts);
  });

  it('drill and standard games with the same options share a config key', async () => {
    const base = { id: 'x', options: { ...ZETAMAC_DEFAULTS }, startedAt: 'now', attempts: [] };
    const standard = await buildZetamacPayload({ ...base, mode: 'standard' });
    const drill = await buildZetamacPayload({ ...base, mode: 'drill' });
    expect(drill.session.configKey).toBe(standard.session.configKey);
  });
});
