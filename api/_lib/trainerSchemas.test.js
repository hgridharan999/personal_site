import { describe, it, expect } from 'vitest';
import { sessionPayload, statsQuery, idQuery, QTYPES } from './trainerSchemas.js';
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
  it('rejects more than 1000 attempts and bad ids', () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({
      idx: i, qtype: 'z.add', factKey: null, prompt: '1 + 1', answer: '2', response: null, isCorrect: false, timeMs: null, corrections: 0,
    }));
    expect(sessionPayload.safeParse(zetamacPayload({ attempts: many, session: { correct: 0, score: 0 } })).success).toBe(false);
    expect(sessionPayload.safeParse(zetamacPayload({ session: { id: 'nope' } })).success).toBe(false);
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
