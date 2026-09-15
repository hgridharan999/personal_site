import { describe, it, expect } from 'vitest';
import { buildOptiverPayload } from './payload.js';
import { OPTIVER_RULES } from './grade.js';
import { configKey } from '../core/configKey.js';
import { OPTIVER_PASS_LINE, ZETAMAC_BENCHMARKS } from '../core/benchmarks.js';

const attempt = (idx, response, isCorrect) => ({
  idx, qtype: 'o.int.add', factKey: null, prompt: `${idx} + 1`, answer: String(idx + 1),
  response, isCorrect, timeMs: response === null ? null : 5000, corrections: 0,
});

describe('buildOptiverPayload', () => {
  it('scores +1/−1/0 and stamps rules + profile version', async () => {
    const attempts = [attempt(0, '1', true), attempt(1, '9', false), ...Array.from({ length: 78 }, (_, i) => attempt(i + 2, null, false))];
    const payload = await buildOptiverPayload({
      id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c', startedAt: '2026-09-14T18:00:00.000Z', durationMs: 480000, attempts,
    });
    expect(payload.session).toEqual({
      id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c',
      trainer: 'optiver',
      mode: 'standard',
      config: { ...OPTIVER_RULES },
      configKey: await configKey({ trainer: 'optiver', config: { ...OPTIVER_RULES }, profileVersion: 1 }),
      profileVersion: 1,
      startedAt: '2026-09-14T18:00:00.000Z',
      durationMs: 480000,
      correct: 1, wrong: 1, unanswered: 78, score: 0,
    });
    expect(payload.attempts).toBe(attempts);
  });
  it('benchmarks', () => {
    expect(OPTIVER_PASS_LINE).toBe(55);
    expect(ZETAMAC_BENCHMARKS).toEqual([30, 40, 50, 70]);
  });
});
