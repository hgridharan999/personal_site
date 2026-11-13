import { describe, expect, it } from 'vitest';
import { FLAWS, OVERLAPS, SETTINGS, flawByKey, flawChoices, overlaps, pickFlaw, pickOne } from './flaws.js';

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
  it('groups the nested flaws, using only real keys', () => {
    const keys = new Set(FLAWS.map((f) => f.key));
    OVERLAPS.flat().forEach((k) => expect(keys.has(k)).toBe(true));
    expect(overlaps('survivorship', 'selection_bias')).toBe(true);
    expect(overlaps('selection_bias', 'cherry_picked_window')).toBe(true);
    expect(overlaps('small_sample', 'regression_to_mean')).toBe(true);
    expect(overlaps('sunk_cost', 'goodhart')).toBe(false);
  });
  it('flawChoices never puts two overlapping flaws among the four, and the answer appears once', () => {
    const keyOf = new Map(FLAWS.map((f) => [f.name, f.key]));
    for (const { key, name } of FLAWS) {
      for (let seed = 0; seed < 300; seed++) {
        const { choices, answerIndex, distractors } = flawChoices(key, seeded(seed));
        expect(choices.filter((c) => c === name)).toHaveLength(1);
        expect(choices[answerIndex]).toBe(name);
        const keys = choices.map((c) => keyOf.get(c));
        for (let i = 0; i < 4; i++) {
          for (let j = i + 1; j < 4; j++) expect(overlaps(keys[i], keys[j])).toBe(false);
        }
        expect(distractors).toHaveLength(3);
        expect(distractors.map((d) => d.name).sort()).toEqual(choices.filter((c) => c !== name).sort());
      }
    }
  });
  it('flawChoices still uses every non-overlapping flaw as a distractor', () => {
    const seen = new Set();
    for (let seed = 0; seed < 300; seed++) flawChoices('survivorship', seeded(seed)).distractors.forEach((d) => seen.add(d.key));
    expect(seen.has('selection_bias')).toBe(false);
    expect(seen.has('cherry_picked_window')).toBe(false);
    expect(seen.size).toBe(7);
  });
  it('pickOne returns a member', () => {
    expect(['a', 'b']).toContain(pickOne(['a', 'b'], Math.random));
  });
});
