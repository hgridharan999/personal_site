// scripts/poker/lib/evolve.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../../src/private/trainers/core/rng.js';
import { DIALS, ARCHETYPES, resolveDials } from '../../../src/private/trainers/poker/bots/dials.js';
import { emptyProfile } from '../../../src/private/trainers/poker/bots/contract.js';
import {
  NICHES, nicheOf, fitnessOf, mutate, crossover, initialPopulation, scheduleTables, updateArchive, nextGeneration,
  hasStalled, mergeProfiles, newIndividual,
} from './evolve.js';

const styled = (vpip, aggFreq) => {
  const p = emptyProfile();
  p.stats.vpip = { value: vpip, n: 100 };
  p.stats.aggFreq = { value: aggFreq, n: 100 };
  return p;
};
const withResult = (id, bbWon, profile) => ({ ...newIndividual(id, ARCHETYPES['tight-aggressive']), bbWon, hands: 1000, profile });

describe('niches and fitness', () => {
  it('classifies by VPIP 0.23 and aggression 0.35', () => {
    expect(nicheOf(styled(0.2, 0.5))).toBe('tight-aggressive');
    expect(nicheOf(styled(0.3, 0.5))).toBe('loose-aggressive');
    expect(nicheOf(styled(0.2, 0.2))).toBe('tight-passive');
    expect(nicheOf(styled(0.23, 0.35))).toBe('loose-aggressive');
    expect(nicheOf(emptyProfile())).toBe('tight-passive');
    expect(fitnessOf(withResult(1, 25, emptyProfile()))).toBe(2.5);
    expect(fitnessOf(newIndividual(2, {}))).toBe(0);
  });
});

describe('variation operators', () => {
  it('mutate keeps dials in bounds and is deterministic for a seed', () => {
    const base = resolveDials({});
    const a = mutate(base, mulberry32(1), { rate: 1, sigma: 5 });
    expect(mutate(base, mulberry32(1), { rate: 1, sigma: 5 })).toEqual(a);
    for (const d of DIALS) {
      expect(a[d.key]).toBeGreaterThanOrEqual(d.min);
      expect(a[d.key]).toBeLessThanOrEqual(d.max);
    }
    expect(mutate(base, mulberry32(1), { rate: 0 })).toEqual(base);
  });

  it('crossover takes every dial from one parent', () => {
    const a = ARCHETYPES['tight-passive'];
    const b = ARCHETYPES['loose-aggressive'];
    const child = crossover(a, b, mulberry32(2));
    for (const d of DIALS) expect([a[d.key], b[d.key]]).toContain(child[d.key]);
  });

  it('initialPopulation starts with the four archetypes', () => {
    const pop = initialPopulation(50, mulberry32(3));
    expect(pop.length).toBe(50);
    expect(pop.slice(0, 4).map((p) => p.dials)).toEqual(Object.values(ARCHETYPES));
    expect(new Set(pop.map((p) => p.id)).size).toBe(50);
  });
});

describe('scheduleTables', () => {
  it('seats every individual once per round at tables of five plus an anchor', () => {
    const tables = scheduleTables(50, mulberry32(4));
    expect(tables.length).toBe(10);
    expect(tables.flatMap((t) => t.members).sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    for (const t of tables) expect(typeof t.anchor).toBe('string');
    const uneven = scheduleTables(12, mulberry32(4));
    expect(uneven.length).toBe(3);
    for (const t of uneven) expect(t.members.length).toBe(5);
  });
});

describe('archive and generations', () => {
  it('keeps the best per niche, one niche per individual', () => {
    let archive = updateArchive({}, [withResult(1, 10, styled(0.2, 0.5)), withResult(2, 30, styled(0.2, 0.5)), withResult(3, 5, styled(0.3, 0.2))], { perNiche: 1 });
    expect(archive['tight-aggressive'].map((e) => e.id)).toEqual([2]);
    expect(archive['loose-passive'].map((e) => e.id)).toEqual([3]);
    archive = updateArchive(archive, [withResult(3, 50, styled(0.2, 0.5))], { perNiche: 1 });
    expect(archive['tight-aggressive'].map((e) => e.id)).toEqual([3]);
    expect(archive['loose-passive']).toEqual([]);
    expect(Object.keys(archive).sort()).toEqual([...NICHES].sort());
  });

  it('nextGeneration keeps niche champions and top performers and fills with new children', () => {
    const pop = Array.from({ length: 20 }, (_, i) => withResult(i, i, i === 0 ? styled(0.3, 0.1) : styled(0.2, 0.5)));
    const { population, nextId } = nextGeneration(pop, { rng: mulberry32(5), eliteCount: 4, nextId: 20 });
    expect(population.length).toBe(20);
    expect(population.slice(0, 4).map((p) => p.id)).toEqual([19, 0, 18, 17]);
    expect(population.slice(4).every((p) => p.hands === 0)).toBe(true);
    expect(nextId).toBe(36);
  });

  it('detects stalls', () => {
    expect(hasStalled([1, 2, 3], { patience: 3, minDelta: 1 })).toBe(false);
    expect(hasStalled([10, 10.5, 10.2, 9], { patience: 3, minDelta: 1 })).toBe(true);
    expect(hasStalled([10, 10.5, 12, 9], { patience: 3, minDelta: 1 })).toBe(false);
  });

  it('merges profiles as weighted means', () => {
    const a = styled(0.2, 0.4);
    const b = emptyProfile();
    b.stats.vpip = { value: 0.5, n: 300 };
    const m = mergeProfiles(a, b);
    expect(m.stats.vpip.n).toBe(400);
    expect(m.stats.vpip.value).toBeCloseTo(0.425, 10);
    expect(m.stats.aggFreq).toEqual({ value: 0.4, n: 100 });
    expect(m.stats.wsd).toEqual({ value: null, n: 0 });
  });
});
