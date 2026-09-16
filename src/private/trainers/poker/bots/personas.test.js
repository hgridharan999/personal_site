// src/private/trainers/poker/bots/personas.test.js
import { describe, it, expect } from 'vitest';
import { listPersonas, getPersona } from './personas.js';

describe('personas', () => {
  it('ships 8 personas with unique ids and unique 3-uppercase-letter tags', () => {
    const personas = listPersonas();
    expect(personas.length).toBe(8);
    const ids = personas.map((p) => p.id);
    const tags = personas.map((p) => p.tag);
    expect(new Set(ids).size).toBe(8);
    expect(new Set(tags).size).toBe(8);
    for (const tag of tags) expect(tag).toMatch(/^[A-Z]{3}$/);
    for (const p of personas) expect(p.style).toBe('placeholder');
  });

  it('getPersona returns the matching persona', () => {
    expect(getPersona('duchess').tag).toBe('DCH');
  });

  it('getPersona throws on an unknown id', () => {
    expect(() => getPersona('nope')).toThrow('Unknown persona: nope');
  });
});
