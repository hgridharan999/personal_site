import { describe, it, expect } from 'vitest';
import { sessionPayload, statsQuery, idQuery, QTYPES, MAX_ATTEMPTS, MAX_CONFIG_CHARS } from './trainerSchemas.js';
import { zetamacPayload } from './testing.js';

describe('sessionPayload', () => {
  it('accepts a valid zetamac game', () => {
    expect(sessionPayload.safeParse(zetamacPayload()).success).toBe(true);
  });
  it('rejects a qtype from the other trainer', () => {
    const p = zetamacPayload();
    p.attempts[0].qtype = 'o.int.add';
    expect(sessionPayload.safeParse(p).success).toBe(false);
  });
  it('rejects idx not matching position', () => {
    const p = zetamacPayload();
    p.attempts[1].idx = 5;
    expect(sessionPayload.safeParse(p).success).toBe(false);
  });
  it('rejects totals that disagree with attempts', () => {
    expect(sessionPayload.safeParse(zetamacPayload({ session: { correct: 2, score: 2 } })).success).toBe(false);
  });
  it('requires profileVersion for optiver only, and optiver is standard mode', () => {
    const optiver = zetamacPayload({ session: { trainer: 'optiver', profileVersion: null }, attempts: [] });
    optiver.session.correct = 0;
    optiver.session.score = 0;
    expect(sessionPayload.safeParse(optiver).success).toBe(false);
    optiver.session.profileVersion = 1;
    expect(sessionPayload.safeParse(optiver).success).toBe(true);
    optiver.session.mode = 'drill';
    expect(sessionPayload.safeParse(optiver).success).toBe(false);
    expect(sessionPayload.safeParse(zetamacPayload({ session: { profileVersion: 1 } })).success).toBe(false);
  });
  it('rejects more than MAX_ATTEMPTS (3000) attempts and bad ids', () => {
    expect(MAX_ATTEMPTS).toBe(3000);
    const many = Array.from({ length: 3001 }, (_, i) => ({
      idx: i, qtype: 'z.add', factKey: null, prompt: '1 + 1', answer: '2', response: null, isCorrect: false, timeMs: null, corrections: 0,
    }));
    expect(sessionPayload.safeParse(zetamacPayload({ attempts: many, session: { correct: 0, score: 0 } })).success).toBe(false);
    expect(sessionPayload.safeParse(zetamacPayload({ session: { id: 'nope' } })).success).toBe(false);
  });
  it('accepts a long custom game with 1500 attempts', () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({
      idx: i, qtype: 'z.add', factKey: 'add:0+1', prompt: '0 + 1', answer: '1', response: '1', isCorrect: true, timeMs: 300, corrections: 0,
    }));
    const p = zetamacPayload({ attempts: many, session: { mode: 'custom', durationMs: 600000, correct: 1500, score: 1500 } });
    expect(sessionPayload.safeParse(p).success).toBe(true);
  });
  it('rejects an oversized config and accepts a normal one', () => {
    expect(MAX_CONFIG_CHARS).toBe(2000);
    const big = zetamacPayload({ session: { config: { note: 'x'.repeat(MAX_CONFIG_CHARS) } } });
    expect(sessionPayload.safeParse(big).success).toBe(false);
    const normal = zetamacPayload({
      session: {
        config: {
          add: true, sub: true, mul: true, div: true, add_left_min: 2, add_left_max: 100, add_right_min: 2, add_right_max: 100,
          mul_left_min: 2, mul_left_max: 12, mul_right_min: 2, mul_right_max: 100, duration: 120,
        },
      },
    });
    expect(sessionPayload.safeParse(normal).success).toBe(true);
  });
  it('lists all qtypes', () => {
    expect(QTYPES).toContain('z.div');
    expect(QTYPES).toContain('o.frac.muldiv');
    expect(QTYPES).toHaveLength(14);
  });
});

describe('queries', () => {
  it('statsQuery defaults mode to standard', () => {
    expect(statsQuery.parse({ trainer: 'optiver' })).toEqual({ trainer: 'optiver', mode: 'standard' });
    expect(statsQuery.safeParse({ trainer: 'x' }).success).toBe(false);
  });
  it('idQuery requires a uuid', () => {
    expect(idQuery.safeParse({ id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c' }).success).toBe(true);
    expect(idQuery.safeParse({ id: '1' }).success).toBe(false);
  });
});
