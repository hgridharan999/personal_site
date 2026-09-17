// src/private/trainers/poker/bots/personas.test.js
import { describe, it, expect } from 'vitest';
import data from '../data/bots-v1.json' with { type: 'json' };
import { DIALS, resolveDials } from './dials.js';
import { BOT_VERSION, createBrain } from './index.js';
import { listPersonas, getPersona } from './personas.js';

const CONTRACT = { moss: ['Moss', 'MOS'], viper: ['Viper', 'VIP'], duchess: ['Duchess', 'DCH'], rook: ['Rook', 'ROK'], ink: ['Ink', 'INK'], brick: ['Brick', 'BRK'], lark: ['Lark', 'LRK'], sable: ['Sable', 'SBL'] };
const STYLES = ['tight-aggressive', 'loose-aggressive', 'tight-passive', 'loose-passive'];

describe('personas', () => {
  it('ships the 8 contract personas with their names and tags', () => {
    const personas = listPersonas();
    expect(personas.length).toBe(8);
    expect(Object.fromEntries(personas.map((p) => [p.id, [p.name, p.tag]]))).toEqual(CONTRACT);
  });

  it('every persona is a trained heuristic persona with a real style and complete in-bounds dials', () => {
    for (const p of listPersonas()) {
      expect(p.brain).toBe('heuristic');
      expect(STYLES).toContain(p.style);
      expect(Object.keys(p.dials).sort()).toEqual(DIALS.map((d) => d.key).sort());
      expect(resolveDials(p.dials)).toEqual({ ...p.dials });
      expect(typeof createBrain(p).decide).toBe('function');
    }
  });

  it('matches the data file version and BOT_VERSION', () => {
    expect(data.version).toBe('bots-v1');
    expect(BOT_VERSION).toBe('bots-v1');
    expect(data.training.population).toBe(50);
  });

  it('getPersona returns the matching persona', () => {
    expect(getPersona('duchess').tag).toBe('DCH');
  });

  it('getPersona throws on an unknown id', () => {
    expect(() => getPersona('nope')).toThrow('Unknown persona: nope');
  });
});
