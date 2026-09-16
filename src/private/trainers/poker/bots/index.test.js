// src/private/trainers/poker/bots/index.test.js
import { describe, it, expect } from 'vitest';
import { listPersonas } from './personas.js';
import { createBrain } from './index.js';

describe('createBrain', () => {
  it('returns a brain with a decide function for every persona', () => {
    for (const persona of listPersonas()) {
      const brain = createBrain(persona);
      expect(typeof brain.decide).toBe('function');
    }
  });

  it('throws on an unknown brain key', () => {
    expect(() => createBrain({ brain: 'nope' })).toThrow('Unknown brain: nope');
  });
});
