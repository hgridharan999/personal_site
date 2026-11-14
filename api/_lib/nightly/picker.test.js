import { describe, expect, it } from 'vitest';
import { pickField, pickTypes } from './picker.js';
import { FIELDS, USUAL_GROUND } from './interests.js';
import { CASE_REP, TYPE_KEYS } from './types.js';

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('pickTypes', () => {
  it('returns 3 distinct valid keys for many seeds', () => {
    for (let i = 1; i <= 50; i++) {
      const r = pickTypes({ night: '2026-11-11', weekTypes: [], rand: seeded(i) });
      expect(new Set(r).size).toBe(3);
      r.forEach((k) => expect(TYPE_KEYS).toContain(k));
    }
  });

  it('forces a case rep on Saturday with none yet', () => {
    for (let i = 1; i <= 30; i++) {
      const r = pickTypes({ night: '2026-11-14', weekTypes: [['forecast', 'decide', 'estimate']], rand: seeded(i) });
      expect(r).toContain(CASE_REP);
      expect(new Set(r).size).toBe(3);
    }
  });

  it('forces a case rep on Sunday with one', () => {
    for (let i = 1; i <= 30; i++) {
      const r = pickTypes({ night: '2026-11-15', weekTypes: [[CASE_REP, 'decide', 'estimate']], rand: seeded(i) });
      expect(r).toContain(CASE_REP);
      expect(new Set(r).size).toBe(3);
    }
  });

  it('does not force on Sunday when two are done', () => {
    const weekTypes = [[CASE_REP, 'forecast', 'decide'], ['estimate', CASE_REP, 'compress']];
    const r = pickTypes({ night: '2026-11-15', weekTypes, rand: () => 0 });
    expect(r).not.toContain(CASE_REP);
  });

  it('does not force on Monday with none', () => {
    // rand=0 always takes the first remaining key; case_rep is last, so it never appears.
    const r = pickTypes({ night: '2026-11-09', weekTypes: [], rand: () => 0 });
    expect(r).not.toContain(CASE_REP);
  });
});

describe('pickField', () => {
  it('never returns a recent topic or usual ground', () => {
    const recentTopics = FIELDS.slice(0, 14);
    for (let i = 1; i <= 50; i++) {
      const f = pickField({ recentTopics, rand: seeded(i) });
      expect(recentTopics).not.toContain(f);
      expect(USUAL_GROUND).not.toContain(f);
    }
  });

  it('falls back to the full list when all are excluded', () => {
    expect(FIELDS).toContain(pickField({ recentTopics: FIELDS }));
  });

  it('has about 30 unique fields, none in the usual ground', () => {
    expect(FIELDS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(FIELDS).size).toBe(FIELDS.length);
    FIELDS.forEach((f) => expect(USUAL_GROUND).not.toContain(f));
  });
});
