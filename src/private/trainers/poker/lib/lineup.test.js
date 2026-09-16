import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { randomLineup, defaultLineup, validateLineup, refillPersonaId, parseTableConfig } from './lineup.js';

// Local fixtures keep these tests independent of the shipped persona list.
const personas = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, name: id.toUpperCase(), tag: 'TAG' }));
const lineupOf = (ids) => ids.map((personaId, i) => ({ seat: i + 1, personaId }));

describe('randomLineup', () => {
  it('seats five distinct known personas in seats 1-5', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const lineup = randomLineup(personas, mulberry32(seed));
      expect(lineup.map((x) => x.seat)).toEqual([1, 2, 3, 4, 5]);
      expect(validateLineup(lineup, personas)).toBeNull();
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(randomLineup(personas, mulberry32(3))).toEqual(randomLineup(personas, mulberry32(3)));
    const seen = new Set();
    for (let seed = 1; seed <= 20; seed += 1) seen.add(JSON.stringify(randomLineup(personas, mulberry32(seed))));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('needs at least five personas', () => {
    expect(() => randomLineup(personas.slice(0, 4), mulberry32(1))).toThrow();
  });
});

describe('defaultLineup and validateLineup', () => {
  it('defaults to the first five personas', () => {
    expect(defaultLineup(personas)).toEqual(lineupOf(['a', 'b', 'c', 'd', 'e']));
  });

  it('rejects missing seats, unknown ids and duplicates', () => {
    expect(validateLineup(lineupOf(['a', 'b', 'c', 'd']), personas)).toBe('Choose a bot for every seat.');
    expect(validateLineup(lineupOf(['a', 'b', 'c', 'd', 'zz']), personas)).toBe('Choose a bot for every seat.');
    expect(validateLineup(lineupOf(['a', 'b', 'c', 'd', null]), personas)).toBe('Choose a bot for every seat.');
    expect(validateLineup(lineupOf(['a', 'b', 'c', 'd', 'a']), personas)).toBe('Each bot can sit in only one seat.');
    expect(validateLineup(lineupOf(['g', 'f', 'e', 'd', 'c']), personas)).toBeNull();
    expect(validateLineup(null, personas)).toBe('Choose a bot for every seat.');
    expect(validateLineup([null, 1, 2, 3, 4], personas)).toBe('Choose a bot for every seat.');
  });
});

describe('refillPersonaId', () => {
  it('picks a persona that is not seated', () => {
    const seated = ['a', 'b', 'c', 'd', 'e'];
    for (let seed = 1; seed <= 30; seed += 1) {
      expect(['f', 'g']).toContain(refillPersonaId(seated, personas, mulberry32(seed), 'a'));
    }
  });

  it('falls back to the given persona when everyone is seated', () => {
    expect(refillPersonaId(personas.map((p) => p.id), personas, mulberry32(1), 'c')).toBe('c');
  });
});

describe('parseTableConfig', () => {
  const lineup = lineupOf(['a', 'b', 'c', 'd', 'e']);

  it('accepts a valid lobby state and copies the lineup', () => {
    const state = { tableMode: 'custom', speed: 'fast', lineup, extra: true };
    const config = parseTableConfig(state, personas);
    expect(config).toEqual({ tableMode: 'custom', speed: 'fast', lineup });
    expect(config.lineup).not.toBe(lineup);
  });

  it('rejects missing or malformed state', () => {
    expect(parseTableConfig(null, personas)).toBeNull();
    expect(parseTableConfig('x', personas)).toBeNull();
    expect(parseTableConfig({ tableMode: 'ranked', speed: 'fast', lineup }, personas)).toBeNull();
    expect(parseTableConfig({ tableMode: 'random', speed: 'slow', lineup }, personas)).toBeNull();
    expect(parseTableConfig({ tableMode: 'random', speed: 'normal', lineup: lineup.slice(1) }, personas)).toBeNull();
    expect(parseTableConfig({ tableMode: 'random', speed: 'normal' }, personas)).toBeNull();
  });
});
