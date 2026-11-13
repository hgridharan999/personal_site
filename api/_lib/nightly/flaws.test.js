import { describe, expect, it } from 'vitest';
import { FLAWS, SETTINGS, flawByKey, flawChoices, pickFlaw, pickOne } from './flaws.js';

const seeded = (seed) => {
  let s = seed + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

describe('flaws', () => {
  it('has 10 unique keys and throws on an unknown one', () => {
    expect(FLAWS).toHaveLength(10);
    expect(new Set(FLAWS.map((f) => f.key)).size).toBe(10);
    expect(() => flawByKey('nope')).toThrow();
    expect(flawByKey('goodhart').name).toBeTruthy();
  });
  it('has at least 10 settings', () => {
    expect(SETTINGS.length).toBeGreaterThanOrEqual(10);
  });
  it('pickFlaw excludes recent keys', () => {
    const recent = FLAWS.slice(1).map((f) => f.key);
    expect(pickFlaw({ recentFlawKeys: recent, rand: Math.random })).toBe(FLAWS[0].key);
  });
  it('pickFlaw falls back when every key is recent', () => {
    const all = FLAWS.map((f) => f.key);
    expect(all).toContain(pickFlaw({ recentFlawKeys: all, rand: Math.random }));
  });
  it('flawChoices gives 4 distinct real names with the answer at answerIndex', () => {
    const names = new Set(FLAWS.map((f) => f.name));
    for (let seed = 0; seed < 100; seed++) {
      const key = FLAWS[seed % 10].key;
      const { choices, answerIndex } = flawChoices(key, seeded(seed));
      expect(choices).toHaveLength(4);
      expect(new Set(choices).size).toBe(4);
      expect(choices[answerIndex]).toBe(flawByKey(key).name);
      choices.forEach((c) => expect(names.has(c)).toBe(true));
    }
  });
  it('pickOne returns a member', () => {
    expect(['a', 'b']).toContain(pickOne(['a', 'b'], Math.random));
  });
});
